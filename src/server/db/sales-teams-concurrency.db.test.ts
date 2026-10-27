import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertMatchedDatabaseTargets } from "../../../scripts/database-target.mjs";
import {
  cleanupTenantFixture,
  createTenantFixture,
  type TenantFixture,
} from "@/test/fixtures/tenant-fixture";

/**
 * Milestone 4 — the Sales Team invariants under contention (§163.2, §163.3,
 * §163.17).
 *
 * §163.17 asks for two things by name that only a race can show: "a
 * salesperson cannot hold two active Sales Team memberships, **including
 * under concurrent requests**", and "an active team cannot be left without an
 * active Team Lead who is a member of that team".
 *
 * It also asks, implicitly, for something no single-threaded test can check:
 * that the new routines share ONE lock order with the ones that existed
 * before them. The order is not asserted by reading the code — helper calls
 * take rows too, and `app.lock_actor_membership()` is exactly the kind that
 * is easy to forget to count. It is asserted by running the pairs that would
 * deadlock if the order were wrong, in both directions, and requiring that
 * none of them does.
 *
 * WHAT IS NOT TESTED HERE, DELIBERATELY. The single-threaded behaviour —
 * authority, isolation, history, §160 — lives in `sales-teams.db.test.ts` and
 * is not restated.
 */

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

const probe = async (url: string): Promise<postgres.Sql | undefined> => {
  if (!url) return undefined;
  const candidate = postgres(url, {
    max: 6,
    idle_timeout: 2,
    connect_timeout: 3,
    onnotice: () => {},
  });
  try {
    await candidate`select 1`;
    return candidate;
  } catch {
    await candidate.end({ timeout: 1 }).catch(() => {});
    return undefined;
  }
};

const tooling = await probe(TOOLING);
const runtimeProbe = await probe(RUNTIME);
const reachable = tooling !== undefined && runtimeProbe !== undefined;

if (reachable) assertMatchedDatabaseTargets(RUNTIME, TOOLING);
if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] the Sales Team concurrency suite needs both connections. Run "npm run test:db:local".',
  );
}

const admin = () => {
  if (!tooling) throw new Error("no tooling connection");
  return tooling;
};

const RUN = randomUUID().slice(0, 8);
let fixture: TenantFixture;
let recorded: Awaited<ReturnType<typeof createTenantFixture>>["recorded"];

type Gateways = {
  createTenantContext: typeof import("./tenant-context").createTenantContext;
  teams: typeof import("@/server/auth/workspace-sales-teams");
  members: typeof import("@/server/auth/workspace-members");
  runtimeSql: typeof import("./client").runtimeSql;
};
let g: Gateways;

beforeAll(async () => {
  if (!reachable) return;
  ({ fixture, recorded } = await createTenantFixture(admin(), RUN));
  const [context, teams, members, client] = await Promise.all([
    import("./tenant-context"),
    import("@/server/auth/workspace-sales-teams"),
    import("@/server/auth/workspace-members"),
    import("./client"),
  ]);
  g = {
    createTenantContext: context.createTenantContext,
    teams,
    members,
    runtimeSql: client.runtimeSql,
  };
}, 60_000);

/** One transaction, for the reason the sibling suite records. */
async function clearTeams() {
  for (const workspace of recorded?.workspaces ?? []) {
    await admin().begin(async (tx) => {
      await tx`delete from public.sales_team_activities where workspace_id = ${workspace}`;
      await tx`delete from public.sales_team_lead_periods where workspace_id = ${workspace}`;
      await tx`delete from public.sales_team_memberships where workspace_id = ${workspace}`;
      await tx`delete from public.sales_teams where workspace_id = ${workspace}`;
    });
  }
}

afterAll(async () => {
  if (reachable && recorded) {
    await clearTeams().catch(() => {});
    const problems = await cleanupTenantFixture(admin(), recorded);
    if (problems.length > 0) {
      console.error("[sales teams concurrency] cleanup problems:", problems);
    }
  }
  try {
    if (g?.runtimeSql) await g.runtimeSql().end({ timeout: 5 });
  } catch {
    /* already closed */
  }
  await tooling?.end({ timeout: 5 }).catch(() => {});
  await runtimeProbe?.end({ timeout: 5 }).catch(() => {});
}, 30_000);

const ctx = (
  user: { authUserId: string; userProfileId: string },
  workspaceId: string,
) =>
  g.createTenantContext({
    authUserId: user.authUserId,
    userProfileId: user.userProfileId,
    workspaceId,
  });

const ownerA = () => ctx(fixture.owner, fixture.workspaceA);

async function makeTeam(name: string, lead: string): Promise<string> {
  const result = await g.teams.createSalesTeam(ownerA(), {
    name,
    teamLeadUserProfileId: lead,
  });
  if (!result.ok || !result.teamId) {
    throw new Error(`could not create ${name}: ${JSON.stringify(result)}`);
  }
  return result.teamId;
}

/**
 * Put someone in a team, and FAIL HERE if that did not work.
 *
 * Setup that quietly does nothing turns a later assertion into a puzzle: a
 * designation refused with `not_a_member` reads as a leadership bug when the
 * real fault was two tests earlier. Every arrangement step below says so at
 * the moment it happens.
 */
async function place(teamId: string, userProfileId: string) {
  const result = await g.teams.addOrTransferTeamMember(ownerA(), {
    salesTeamId: teamId,
    userProfileId,
  });
  if (!result.ok) {
    throw new Error(
      `setup: could not place ${userProfileId} in ${teamId}: ${JSON.stringify(result)}`,
    );
  }
}

async function activeMemberships(userProfileId: string) {
  return (await admin()`
    select id, sales_team_id
      from public.sales_team_memberships
     where workspace_id = ${fixture.workspaceA}
       and user_profile_id = ${userProfileId}
       and status = 'active'
  `) as unknown as { id: string; sales_team_id: string }[];
}

async function openLeadPeriods(teamId: string) {
  return (await admin()`
    select id, membership_id from public.sales_team_lead_periods
     where sales_team_id = ${teamId} and ended_at is null
  `) as unknown as { id: string; membership_id: string }[];
}

/** How many sessions are waiting on a lock inside one of these routines. */
async function waitingOnLock(pattern: string): Promise<number> {
  const [row] = (await admin()`
    select count(*)::int as n from pg_stat_activity
     where wait_event_type = 'Lock' and state = 'active'
       and query ilike ${`%${pattern}%`}`) as unknown as { n: number }[];
  return row?.n ?? 0;
}

describe.skipIf(!reachable)("§163.2 cardinality under concurrency", () => {
  it("cannot place one person in two teams at once", async () => {
    await clearTeams();
    const left = await makeTeam(`Left ${RUN}`, fixture.owner.userProfileId);
    const right = await makeTeam(`Right ${RUN}`, fixture.manager.userProfileId);

    /*
     * Both requests start with no active membership for this person, so both
     * pass their read. Only one can commit: the partial unique index is the
     * backstop, and the routine reports a lost race as `conflict` rather than
     * letting it surface as an unexpected error.
     */
    const [a, b] = await Promise.all([
      g.teams.addOrTransferTeamMember(ownerA(), {
        salesTeamId: left,
        userProfileId: fixture.shared.userProfileId,
      }),
      g.teams.addOrTransferTeamMember(ownerA(), {
        salesTeamId: right,
        userProfileId: fixture.shared.userProfileId,
      }),
    ]);

    const succeeded = [a, b].filter((result) => result.ok);
    expect(succeeded).toHaveLength(1);

    const active = await activeMemberships(fixture.shared.userProfileId);
    expect(active).toHaveLength(1);
    expect([left, right]).toContain(active[0]!.sales_team_id);
  });

  it("holds when both requests are confirmed transfers of the same person", async () => {
    await clearTeams();
    const home = await makeTeam(`Home ${RUN}`, fixture.owner.userProfileId);
    const first = await makeTeam(`First ${RUN}`, fixture.manager.userProfileId);
    const second = await makeTeam(
      `Second ${RUN}`,
      fixture.former.userProfileId,
    ).catch(() => null);

    await place(home, fixture.shared.userProfileId);
    const [source] = await activeMemberships(fixture.shared.userProfileId);

    /*
     * BOTH confirmations name the SAME source membership, because both were
     * rendered from the same screen state. Exactly one may act on it; the
     * other must find the fact it confirmed no longer true and refuse, rather
     * than ending a membership that a different transaction already ended.
     */
    const [a, b] = await Promise.all([
      g.teams.addOrTransferTeamMember(ownerA(), {
        salesTeamId: first,
        userProfileId: fixture.shared.userProfileId,
        confirmTransfer: true,
        expectedSourceMembershipId: source!.id,
      }),
      g.teams.addOrTransferTeamMember(ownerA(), {
        salesTeamId: second ?? first,
        userProfileId: fixture.shared.userProfileId,
        confirmTransfer: true,
        expectedSourceMembershipId: source!.id,
      }),
    ]);

    const active = await activeMemberships(fixture.shared.userProfileId);
    expect(active).toHaveLength(1);

    const outcomes = [a, b];
    expect(
      outcomes.filter((result) => result.ok).length,
    ).toBeGreaterThanOrEqual(1);
    for (const result of outcomes) {
      if (!result.ok) {
        /* The honest refusals for this race. Never a silent success. */
        expect([
          "source_changed",
          "conflict",
          "already_in_this_team",
          "unavailable",
        ]).toContain(result.reason);
      }
    }
  });

  it("cannot create two teams with the same name at once", async () => {
    await clearTeams();
    const name = `Twin ${RUN}`;
    const [a, b] = await Promise.all([
      g.teams.createSalesTeam(ownerA(), {
        name,
        teamLeadUserProfileId: fixture.owner.userProfileId,
      }),
      g.teams.createSalesTeam(ownerA(), {
        name,
        teamLeadUserProfileId: fixture.manager.userProfileId,
      }),
    ]);

    expect([a, b].filter((result) => result.ok)).toHaveLength(1);
    const teams = await g.teams.salesTeams(ownerA());
    expect(teams.filter((team) => team.name === name)).toHaveLength(1);
  });
});

describe.skipIf(!reachable)("§163.3 leadership under concurrency", () => {
  it("leaves exactly one open Team Lead period when two designate at once", async () => {
    await clearTeams();
    const team = await makeTeam(
      `Lead race ${RUN}`,
      fixture.owner.userProfileId,
    );
    await place(team, fixture.manager.userProfileId);

    const [a, b] = await Promise.all([
      g.teams.designateTeamLead(ownerA(), team, fixture.manager.userProfileId),
      g.teams.designateTeamLead(ownerA(), team, fixture.owner.userProfileId),
    ]);

    // One of them is a no-op ("already_team_lead") or a lost race; either way
    // the invariant is the assertion, not the pair of outcomes.
    expect([a, b].some((result) => result.ok)).toBe(true);
    expect(await openLeadPeriods(team)).toHaveLength(1);
  });

  it("never strands an active team when deactivation and designation race", async () => {
    await clearTeams();
    const team = await makeTeam(`Strand ${RUN}`, fixture.manager.userProfileId);
    await place(team, fixture.shared.userProfileId);

    /*
     * §160 refuses to deactivate the lead of an active team, and §163.3
     * refuses to leave one leaderless. Run both at once, in both directions,
     * and the only acceptable end states are: the team is inactive, or it is
     * active with exactly one open period held by an active member.
     */
    await Promise.all([
      g.members.deactivateMember(ownerA(), fixture.manager.userProfileId),
      g.teams.designateTeamLead(ownerA(), team, fixture.shared.userProfileId),
    ]);

    const [row] = (await admin()`
      select status::text as status from public.sales_teams where id = ${team}
    `) as unknown as { status: string }[];

    if (row!.status === "active") {
      const open = await openLeadPeriods(team);
      expect(open).toHaveLength(1);
      const [holder] = (await admin()`
        select m.user_profile_id, m.status::text as member_status,
               w.status::text as workspace_status
          from public.sales_team_memberships m
          join public.workspace_memberships w
            on w.workspace_id = m.workspace_id
           and w.user_profile_id = m.user_profile_id
         where m.id = ${open[0]!.membership_id}
      `) as unknown as {
        member_status: string;
        workspace_status: string;
      }[];
      expect(holder!.member_status).toBe("active");
      expect(holder!.workspace_status).toBe("active");
    }

    // Put the fixture back for whatever runs next.
    await admin()`
      update public.workspace_memberships set status = 'active'
       where workspace_id = ${fixture.workspaceA}
         and user_profile_id = ${fixture.manager.userProfileId}`.catch(
      () => {},
    );
  });
});

describe.skipIf(!reachable)("atomic rollback", () => {
  it("leaves no team behind when the Team Lead cannot be placed", async () => {
    await clearTeams();
    const led = await makeTeam(
      `Owner led ${RUN}`,
      fixture.manager.userProfileId,
    );

    /*
     * The lead of an ACTIVE team cannot be moved (§163.4), so this creation
     * fails AFTER the team row has been inserted. Either everything commits
     * or nothing does; a team with no members and no lead would be exactly
     * the leaderless active team §163.1 forbids.
     */
    const [source] = await activeMemberships(fixture.manager.userProfileId);
    const result = await g.teams.createSalesTeam(ownerA(), {
      name: `Rolled back ${RUN}`,
      teamLeadUserProfileId: fixture.manager.userProfileId,
      confirmTransfer: true,
      expectedSourceMembershipId: source!.id,
    });
    expect(result).toEqual({ ok: false, reason: "leads_source_team" });

    const teams = await g.teams.salesTeams(ownerA());
    expect(teams.map((team) => team.name)).toEqual([`Owner led ${RUN}`]);
    expect(teams[0]!.id).toBe(led);

    // The source membership is untouched, and so is its leadership.
    const after = await activeMemberships(fixture.manager.userProfileId);
    expect(after.map((row) => row.id)).toEqual([source!.id]);
    expect(await openLeadPeriods(led)).toHaveLength(1);
  });

  it("writes no history for a creation that did not happen", async () => {
    await clearTeams();
    await makeTeam(`Kept ${RUN}`, fixture.manager.userProfileId);

    const before = (await admin()`
      select count(*)::int as n from public.sales_team_activities
       where workspace_id = ${fixture.workspaceA}`) as unknown as {
      n: number;
    }[];

    const result = await g.teams.createSalesTeam(ownerA(), {
      name: `Never ${RUN}`,
      teamLeadUserProfileId: fixture.former.userProfileId,
    });
    expect(result.ok).toBe(false);

    const after = (await admin()`
      select count(*)::int as n from public.sales_team_activities
       where workspace_id = ${fixture.workspaceA}`) as unknown as {
      n: number;
    }[];
    expect(after[0]!.n).toBe(before[0]!.n);
  });
});

describe.skipIf(!reachable)("the lock order, measured", () => {
  /**
   * The pairs that would deadlock if the new routines did not take the active
   * owner_admin set before any other membership row.
   *
   * The failing shape, from 3D's audit: a routine holding a non-owner
   * membership row and waiting for an owner_admin row, against
   * `app.set_member_status`, which holds that owner_admin row from its set
   * and waits for the non-owner row as its target. Counting rows by reading
   * the routine body is not enough — `app.lock_actor_membership()` and the
   * prelude both take rows — so the pairs are run instead.
   *
   * A deadlock surfaces as 40P01, which the gateways translate to
   * `unavailable`. That outcome is therefore the failure being watched for,
   * and it is asserted against directly rather than inferred.
   */
  it("never deadlocks against user deactivation, in either order", async () => {
    for (let round = 0; round < 8; round += 1) {
      await clearTeams();
      const team = await makeTeam(
        `Order ${RUN} ${round}`,
        fixture.owner.userProfileId,
      );
      await place(team, fixture.shared.userProfileId);

      const forwards = round % 2 === 0;
      const teamSide = () =>
        g.teams.addOrTransferTeamMember(ownerA(), {
          salesTeamId: team,
          userProfileId: fixture.manager.userProfileId,
        });
      const memberSide = () =>
        g.members.deactivateMember(ownerA(), fixture.shared.userProfileId);

      const [first, second] = await Promise.all(
        forwards ? [teamSide(), memberSide()] : [memberSide(), teamSide()],
      );

      for (const result of [first, second]) {
        if (!result.ok) {
          expect(
            result.reason,
            `round ${round} (${forwards ? "team first" : "member first"}) aborted`,
          ).not.toBe("unavailable");
        }
      }

      await admin()`
        update public.workspace_memberships set status = 'active'
         where workspace_id = ${fixture.workspaceA}
           and user_profile_id = ${fixture.shared.userProfileId}`;
    }
  }, 60_000);

  it("queues behind a held owner_admin set rather than passing it", async () => {
    await clearTeams();
    const team = await makeTeam(`Queue ${RUN}`, fixture.owner.userProfileId);

    /*
     * Deterministic, rather than hoped for. A third transaction holds exactly
     * the set the prelude takes first. A routine that took its target row
     * before that set would sail past this and the wait count would stay at
     * zero — which is what makes the assertion meaningful rather than
     * decorative.
     */
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });

    const holder = admin()
      .begin(async (tx) => {
        await tx`
          select 1 from public.workspace_memberships
           where workspace_id = ${fixture.workspaceA}
             and role = 'owner_admin'::public.workspace_role
             and status = 'active'::public.workspace_membership_status
           order by user_profile_id
             for update`;
        await released;
      })
      .catch(() => {});

    const pending = g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: team,
      userProfileId: fixture.manager.userProfileId,
    });

    let waited = false;
    for (let i = 0; i < 60; i += 1) {
      /* `pg_stat_activity.query` reports the TOP-LEVEL statement, not the
         one inside the routine that is actually blocked — so the routine's
         own name is what identifies the waiter. */
      if ((await waitingOnLock("add_or_transfer_team_member")) > 0) {
        waited = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    release();
    await holder;
    const result = await pending;

    expect(waited).toBe(true);
    expect(result).toEqual({ ok: true });
  }, 30_000);
});
