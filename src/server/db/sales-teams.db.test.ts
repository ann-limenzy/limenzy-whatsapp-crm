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
 * Milestone 4 — Sales Teams and membership (§159, §160, §162, §163.1–§163.4,
 * §163.12, §163.15).
 *
 * What needs a real database, and a unit test could not say:
 *
 *   * teams, memberships and leadership are invisible across workspaces, and
 *     a routine called with another workspace's team id changes nothing;
 *   * authority is re-derived from stored rows, so a Manager and a
 *     Staff/Sales user are refused by the DATABASE and not only by a screen
 *     — §162's Sales Team rows are Owner/Admin-fixed and a Manager's are
 *     Decision required (§163.18 #5);
 *   * the §163.2 cardinality rule and the §163.3 leadership rule are
 *     constraints, not conventions;
 *   * leadership history survives a change of Team Lead inside one unbroken
 *     membership — the case a mutable flag cannot record;
 *   * §163.2's "team membership does not grant access to records owned by
 *     other team members", read from the other side: a teammate's Lead stays
 *     invisible after they join the same team.
 *
 * WHAT IS NOT TESTED HERE, DELIBERATELY. Nothing about eligibility, rotation,
 * assignment rules or Assignment Required — none of it exists (§163.5–§163.9
 * are Milestone 5). The races live in `sales-teams-concurrency.db.test.ts`.
 */

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

const probe = async (url: string): Promise<postgres.Sql | undefined> => {
  if (!url) return undefined;
  const candidate = postgres(url, {
    max: 3,
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
    '[test:db] the Sales Teams suite needs both connections. Run "npm run test:db:local".',
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
  leads: typeof import("@/server/auth/workspace-leads");
  members: typeof import("@/server/auth/workspace-members");
  runtimeSql: typeof import("./client").runtimeSql;
};
let g: Gateways;

const stageOf = new Map<string, string>();

async function seedPipeline(workspaceId: string) {
  const rows = (await admin()`
    insert into public.workspace_lead_stages
      (workspace_id, name, sort_order, kind)
    values
      (${workspaceId}, ${`New ${RUN}`}, 1, 'active'),
      (${workspaceId}, ${`Won ${RUN}`}, 90, 'won'),
      (${workspaceId}, ${`Lost ${RUN}`}, 91, 'lost')
    returning id, kind::text as kind
  `) as unknown as { id: string; kind: string }[];
  stageOf.set(workspaceId, rows.find((r) => r.kind === "active")!.id);
}

beforeAll(async () => {
  if (!reachable) return;
  ({ fixture, recorded } = await createTenantFixture(admin(), RUN));
  await seedPipeline(fixture.workspaceA);
  await seedPipeline(fixture.workspaceB);
  const [context, teams, leads, members, client] = await Promise.all([
    import("./tenant-context"),
    import("@/server/auth/workspace-sales-teams"),
    import("@/server/auth/workspace-leads"),
    import("@/server/auth/workspace-members"),
    import("./client"),
  ]);
  g = {
    createTenantContext: context.createTenantContext,
    teams,
    leads,
    members,
    runtimeSql: client.runtimeSql,
  };
}, 60_000);

/**
 * Remove only what this run made, in ONE transaction.
 *
 * The order matters and so does the single transaction. The shape invariant
 * is a DEFERRED constraint: emptying the memberships in a statement of their
 * own would leave an active team with no Team Lead at that statement's
 * commit, and the invariant would — correctly — refuse it. Inside one
 * transaction the teams go too, and the check's "the team is gone, there is
 * no shape left to keep" branch applies.
 */
async function clearTeams() {
  for (const workspace of recorded?.workspaces ?? []) {
    await admin()
      .begin(async (tx) => {
        await tx`delete from public.sales_team_activities where workspace_id = ${workspace}`;
        await tx`delete from public.sales_team_lead_periods where workspace_id = ${workspace}`;
        await tx`delete from public.sales_team_memberships where workspace_id = ${workspace}`;
        await tx`delete from public.sales_teams where workspace_id = ${workspace}`;
      })
      .catch((error) => {
        console.error("[sales teams] could not clear fixtures:", error);
        throw error;
      });
  }
}

afterAll(async () => {
  if (reachable && recorded) {
    await clearTeams();
    for (const workspace of recorded.workspaces) {
      await admin()`
        delete from public.lead_activities where workspace_id = ${workspace}`.catch(
        () => {},
      );
      await admin()`
        delete from public.leads where workspace_id = ${workspace}`.catch(
        () => {},
      );
      await admin()`
        delete from public.workspace_lead_stages where workspace_id = ${workspace}`.catch(
        () => {},
      );
    }
    const problems = await cleanupTenantFixture(admin(), recorded);
    if (problems.length > 0) {
      console.error("[sales teams] cleanup problems:", problems);
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
const managerA = () => ctx(fixture.manager, fixture.workspaceA);
const staffA = () => ctx(fixture.shared, fixture.workspaceA);
const formerA = () => ctx(fixture.former, fixture.workspaceA);
const ownerB = () => ctx(fixture.shared, fixture.workspaceB);

/** Create a team led by `lead`, failing loudly rather than returning a shape. */
async function makeTeam(
  name: string,
  lead = fixture.manager.userProfileId,
): Promise<string> {
  const result = await g.teams.createSalesTeam(ownerA(), {
    name,
    teamLeadUserProfileId: lead,
  });
  if (!result.ok || !result.teamId) {
    throw new Error(`could not create ${name}: ${JSON.stringify(result)}`);
  }
  return result.teamId;
}

async function membershipRows(workspaceId: string, userProfileId: string) {
  return (await admin()`
    select id, sales_team_id, status::text as status, joined_at, ended_at
      from public.sales_team_memberships
     where workspace_id = ${workspaceId} and user_profile_id = ${userProfileId}
     order by joined_at, id
  `) as unknown as {
    id: string;
    sales_team_id: string;
    status: string;
    joined_at: Date;
    ended_at: Date | null;
  }[];
}

async function leadPeriods(teamId: string) {
  return (await admin()`
    select p.id, p.membership_id, p.ended_at, m.user_profile_id
      from public.sales_team_lead_periods p
      join public.sales_team_memberships m on m.id = p.membership_id
     where p.sales_team_id = ${teamId}
     order by p.started_at, p.id
  `) as unknown as {
    id: string;
    membership_id: string;
    ended_at: Date | null;
    user_profile_id: string;
  }[];
}

describe.skipIf(!reachable)("creating a team", () => {
  it("writes the team, the membership and the leadership together", async () => {
    await clearTeams();
    const id = await makeTeam(`Create ${RUN}`);

    const [team] = await g.teams.salesTeams(ownerA());
    expect(team).toMatchObject({
      id,
      name: `Create ${RUN}`,
      status: "active",
      teamLeadUserProfileId: fixture.manager.userProfileId,
      activeMemberCount: 1,
    });

    /*
     * §163.3: the lead must be an ACTIVE MEMBER of that team. One membership
     * and one open period, pointing at each other — not a team with a lead
     * who was never added.
     */
    const periods = await leadPeriods(id);
    expect(periods).toHaveLength(1);
    expect(periods[0]!.ended_at).toBeNull();
    expect(periods[0]!.user_profile_id).toBe(fixture.manager.userProfileId);

    const history = await g.teams.salesTeamActivity(ownerA(), id);
    expect(history.map((entry) => entry.kind).sort()).toEqual([
      "member_added",
      "team_created",
      "team_lead_designated",
    ]);
  });

  it("offers every active workspace member as a candidate", async () => {
    await clearTeams();

    /*
     * The regression this exists for. `limenzy_app`'s only policy on
     * `workspace_memberships` lets a member read their OWN row — a co-member
     * policy would have to read the table it guards, which PostgreSQL refuses
     * with 42P17. A candidate query written against that table therefore
     * returns one row, the actor's, and the Team Lead picker silently offers
     * the signed-in person alone. Caught in a browser, not by a test; this is
     * the test.
     */
    const candidates = await g.teams.assignableTeamMembers(ownerA());
    const ids = candidates.map((person) => person.userProfileId).sort();
    expect(ids).toEqual(
      [
        fixture.owner.userProfileId,
        fixture.manager.userProfileId,
        fixture.shared.userProfileId,
      ].sort(),
    );
    // The inactive membership is not a candidate — §163.2 requires an active
    // workspace member.
    expect(ids).not.toContain(fixture.former.userProfileId);
    for (const person of candidates) {
      expect(person.currentTeamId).toBeNull();
      expect(person.leadsActiveTeam).toBe(false);
    }

    // Once someone is in a team, the picker says so rather than hiding them.
    const team = await makeTeam(
      `Candidates ${RUN}`,
      fixture.manager.userProfileId,
    );
    const after = await g.teams.assignableTeamMembers(ownerA());
    const inTeam = after.find(
      (person) => person.userProfileId === fixture.manager.userProfileId,
    );
    expect(inTeam).toMatchObject({
      currentTeamId: team,
      currentTeamName: `Candidates ${RUN}`,
      leadsActiveTeam: true,
    });
    expect(inTeam!.currentMembershipId).not.toBeNull();
  });

  it("returns no candidates to someone who may not manage users", async () => {
    /*
     * The routine behind the list answers nothing unless the caller is an
     * active Owner/Admin, so the picker cannot become a way for a Manager or
     * a Staff/Sales user to enumerate the workspace.
     */
    expect(await g.teams.assignableTeamMembers(managerA())).toHaveLength(0);
    expect(await g.teams.assignableTeamMembers(staffA())).toHaveLength(0);
  });

  it("refuses a duplicate name, whatever its case", async () => {
    await clearTeams();
    await makeTeam(`Unique ${RUN}`);
    const again = await g.teams.createSalesTeam(ownerA(), {
      name: `unique ${RUN}`.toUpperCase(),
      teamLeadUserProfileId: fixture.owner.userProfileId,
    });
    expect(again).toEqual({ ok: false, reason: "name_taken" });
  });

  it("requires a Team Lead who is an active workspace member", async () => {
    await clearTeams();
    const result = await g.teams.createSalesTeam(ownerA(), {
      name: `Inactive lead ${RUN}`,
      teamLeadUserProfileId: fixture.former.userProfileId,
    });
    expect(result).toEqual({ ok: false, reason: "member_not_active" });

    // Nothing was left behind: the team insert rolled back with the refusal.
    expect(await g.teams.salesTeams(ownerA())).toHaveLength(0);
  });

  it("refuses a blank or over-long name, before any write", async () => {
    await clearTeams();
    expect(
      await g.teams.createSalesTeam(ownerA(), {
        name: "   ",
        teamLeadUserProfileId: fixture.manager.userProfileId,
      }),
    ).toEqual({ ok: false, reason: "invalid_name" });
    expect(
      await g.teams.createSalesTeam(ownerA(), {
        name: "x".repeat(61),
        teamLeadUserProfileId: fixture.manager.userProfileId,
      }),
    ).toEqual({ ok: false, reason: "name_too_long" });
    expect(await g.teams.salesTeams(ownerA())).toHaveLength(0);
  });
});

describe.skipIf(!reachable)(
  "§162 authority, re-derived by the database",
  () => {
    it("refuses every administrative routine to a Manager", async () => {
      await clearTeams();
      const team = await makeTeam(`Authority ${RUN}`);

      /*
       * §162's Sales Team rows are a fixed Owner/Admin "Yes"; a Manager's are
       * Decision required (§163.18 #5) and are denied until approved. The
       * database does not know about §163.18 — it knows the actor is not an
       * Owner/Admin, which is the same answer from the other side.
       */
      expect(
        await g.teams.createSalesTeam(managerA(), {
          name: `Manager ${RUN}`,
          teamLeadUserProfileId: fixture.manager.userProfileId,
        }),
      ).toEqual({ ok: false, reason: "not_permitted" });
      expect(
        await g.teams.renameSalesTeam(managerA(), team, {
          name: `Nope ${RUN}`,
        }),
      ).toEqual({ ok: false, reason: "not_permitted" });
      expect(
        await g.teams.addOrTransferTeamMember(managerA(), {
          salesTeamId: team,
          userProfileId: fixture.shared.userProfileId,
        }),
      ).toEqual({ ok: false, reason: "not_permitted" });
      expect(
        await g.teams.designateTeamLead(
          managerA(),
          team,
          fixture.manager.userProfileId,
        ),
      ).toEqual({ ok: false, reason: "not_permitted" });
      expect(await g.teams.deactivateSalesTeam(managerA(), team)).toEqual({
        ok: false,
        reason: "not_permitted",
      });

      // And nothing moved.
      const [after] = await g.teams.salesTeams(ownerA());
      expect(after!.name).toBe(`Authority ${RUN}`);
      expect(after!.status).toBe("active");
    });

    it("refuses a Staff/Sales user and an inactive membership alike", async () => {
      await clearTeams();
      const team = await makeTeam(`Staff ${RUN}`);

      for (const actor of [staffA, formerA]) {
        expect(
          await g.teams.addOrTransferTeamMember(actor(), {
            salesTeamId: team,
            userProfileId: fixture.shared.userProfileId,
          }),
        ).toEqual({ ok: false, reason: "not_permitted" });
      }
    });
  },
);

describe.skipIf(!reachable)("workspace isolation", () => {
  it("never shows another workspace's teams, even by id", async () => {
    await clearTeams();
    const inA = await makeTeam(`Tenant ${RUN}`);

    expect(await g.teams.salesTeams(ownerB())).toHaveLength(0);
    expect(await g.teams.salesTeamMembers(ownerB())).toHaveLength(0);
    expect(await g.teams.salesTeamActivity(ownerB(), inA)).toHaveLength(0);

    /*
     * The same person is an Owner/Admin in B, so this is authority without
     * reach rather than no authority: the routine resolves the team inside
     * its own workspace and finds nothing.
     */
    expect(await g.teams.deactivateSalesTeam(ownerB(), inA)).toEqual({
      ok: false,
      reason: "unknown_team",
    });
    expect(
      await g.teams.renameSalesTeam(ownerB(), inA, { name: `Hijack ${RUN}` }),
    ).toEqual({ ok: false, reason: "unknown_team" });

    const [untouched] = await g.teams.salesTeams(ownerA());
    expect(untouched!.name).toBe(`Tenant ${RUN}`);
    expect(untouched!.status).toBe("active");
  });

  it("cannot add a member who belongs to another workspace", async () => {
    await clearTeams();
    const team = await makeTeam(`Foreign ${RUN}`);
    // `owner` is a member of A only; from B's team there is no such person.
    const result = await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: team,
      userProfileId: randomUUID(),
    });
    expect(result).toEqual({ ok: false, reason: "unknown_member" });
  });
});

describe.skipIf(!reachable)("§163.2 one active membership", () => {
  it("refuses an unconfirmed move, and names nothing until it is confirmed", async () => {
    await clearTeams();
    const first = await makeTeam(`Home ${RUN}`, fixture.manager.userProfileId);
    const second = await makeTeam(`Away ${RUN}`, fixture.owner.userProfileId);

    const unconfirmed = await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: second,
      userProfileId: fixture.manager.userProfileId,
    });
    expect(unconfirmed).toEqual({
      ok: false,
      reason: "transfer_not_confirmed",
    });

    // Still exactly where they were.
    const rows = await membershipRows(
      fixture.workspaceA,
      fixture.manager.userProfileId,
    );
    expect(rows.filter((row) => row.status === "active")).toHaveLength(1);
    expect(rows[0]!.sales_team_id).toBe(first);
  });

  it("refuses a confirmation that names the wrong membership", async () => {
    await clearTeams();
    await makeTeam(`Source ${RUN}`, fixture.manager.userProfileId);
    const target = await makeTeam(`Target ${RUN}`, fixture.owner.userProfileId);

    /*
     * The revalidation. A confirmation is about ONE membership period the
     * administrator was shown; if it is not the one they hold now, the fact
     * they agreed to no longer exists and the move must not proceed.
     */
    const stale = await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: target,
      userProfileId: fixture.manager.userProfileId,
      confirmTransfer: true,
      expectedSourceMembershipId: randomUUID(),
    });
    expect(stale).toEqual({ ok: false, reason: "source_changed" });

    const missing = await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: target,
      userProfileId: fixture.shared.userProfileId,
      confirmTransfer: true,
      expectedSourceMembershipId: randomUUID(),
    });
    // They are in no team at all, so there was no source to confirm.
    expect(missing).toEqual({ ok: false, reason: "source_changed" });
  });

  it("transfers on an exact confirmation, into a NEW period", async () => {
    await clearTeams();
    const from = await makeTeam(`From ${RUN}`, fixture.manager.userProfileId);
    const to = await makeTeam(`To ${RUN}`, fixture.owner.userProfileId);

    // The lead of `from` cannot leave it while it is active (§163.4).
    await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: from,
      userProfileId: fixture.shared.userProfileId,
    });

    const before = await membershipRows(
      fixture.workspaceA,
      fixture.shared.userProfileId,
    );
    expect(before).toHaveLength(1);

    const moved = await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: to,
      userProfileId: fixture.shared.userProfileId,
      confirmTransfer: true,
      expectedSourceMembershipId: before[0]!.id,
    });
    expect(moved).toEqual({ ok: true });

    const after = await membershipRows(
      fixture.workspaceA,
      fixture.shared.userProfileId,
    );
    expect(after).toHaveLength(2);
    // The old period is ENDED, keeps its id, and was not reopened.
    const old = after.find((row) => row.id === before[0]!.id)!;
    expect(old.status).toBe("ended");
    expect(old.ended_at).not.toBeNull();
    expect(old.sales_team_id).toBe(from);
    // The new one is a different row entirely.
    const fresh = after.find((row) => row.id !== before[0]!.id)!;
    expect(fresh.status).toBe("active");
    expect(fresh.sales_team_id).toBe(to);

    const history = await g.teams.salesTeamActivity(ownerA(), to);
    const transfer = history.find((e) => e.kind === "member_transferred");
    expect(transfer).toBeDefined();
    expect(transfer!.fromSalesTeamId).toBe(from);
    expect(transfer!.toSalesTeamId).toBe(to);
    expect(transfer!.subjectUserProfileId).toBe(fixture.shared.userProfileId);
  });

  it("refuses to move someone who leads another active team", async () => {
    await clearTeams();
    const led = await makeTeam(`Led ${RUN}`, fixture.manager.userProfileId);
    const other = await makeTeam(`Other ${RUN}`, fixture.owner.userProfileId);

    const rows = await membershipRows(
      fixture.workspaceA,
      fixture.manager.userProfileId,
    );
    const result = await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: other,
      userProfileId: fixture.manager.userProfileId,
      confirmTransfer: true,
      expectedSourceMembershipId: rows[0]!.id,
    });
    expect(result).toEqual({ ok: false, reason: "leads_source_team" });

    // §163.4: refused, and the source team is untouched — this screen offers
    // no controls over it, so nothing there may change as a side effect.
    const periods = await leadPeriods(led);
    expect(periods).toHaveLength(1);
    expect(periods[0]!.ended_at).toBeNull();
  });

  it("rejoining a team gives a new period, never a reopened one", async () => {
    await clearTeams();
    const team = await makeTeam(`Rejoin ${RUN}`, fixture.owner.userProfileId);
    await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: team,
      userProfileId: fixture.shared.userProfileId,
    });
    await g.teams.removeTeamMember(
      ownerA(),
      team,
      fixture.shared.userProfileId,
    );
    await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: team,
      userProfileId: fixture.shared.userProfileId,
    });

    const rows = await membershipRows(
      fixture.workspaceA,
      fixture.shared.userProfileId,
    );
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.status === "active")).toHaveLength(1);
    expect(rows.filter((row) => row.status === "ended")).toHaveLength(1);
    // Distinct ids: the ended period is still its own citable row.
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
    expect(rows[0]!.ended_at).not.toBeNull();
  });
});

describe.skipIf(!reachable)("§163.3 Team Lead", () => {
  it("keeps both spells when leadership changes inside one membership", async () => {
    await clearTeams();
    const team = await makeTeam(`Lead ${RUN}`, fixture.manager.userProfileId);
    await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: team,
      userProfileId: fixture.shared.userProfileId,
    });

    const membershipsBefore = await membershipRows(
      fixture.workspaceA,
      fixture.manager.userProfileId,
    );

    // Hand it over, then hand it back — the manager's MEMBERSHIP never breaks.
    expect(
      await g.teams.designateTeamLead(
        ownerA(),
        team,
        fixture.shared.userProfileId,
      ),
    ).toEqual({ ok: true });
    expect(
      await g.teams.designateTeamLead(
        ownerA(),
        team,
        fixture.manager.userProfileId,
      ),
    ).toEqual({ ok: true });

    const membershipsAfter = await membershipRows(
      fixture.workspaceA,
      fixture.manager.userProfileId,
    );
    expect(membershipsAfter.map((row) => row.id)).toEqual(
      membershipsBefore.map((row) => row.id),
    );
    expect(membershipsAfter[0]!.status).toBe("active");

    /*
     * THE POINT OF THE PERIODS TABLE. Three spells, two of them closed, one
     * open — and the first and third belong to the SAME membership row. A
     * mutable `is_team_lead` flag would now read exactly as if the handover
     * had never happened.
     */
    const periods = await leadPeriods(team);
    expect(periods).toHaveLength(3);
    expect(periods.filter((p) => p.ended_at === null)).toHaveLength(1);
    expect(periods[0]!.user_profile_id).toBe(fixture.manager.userProfileId);
    expect(periods[1]!.user_profile_id).toBe(fixture.shared.userProfileId);
    expect(periods[2]!.user_profile_id).toBe(fixture.manager.userProfileId);
    expect(periods[0]!.membership_id).toBe(periods[2]!.membership_id);
  });

  it("judges the FINAL state, so a replacement inside one transaction passes", async () => {
    await clearTeams();
    const team = await makeTeam(`Handover ${RUN}`, fixture.owner.userProfileId);
    await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: team,
      userProfileId: fixture.manager.userProfileId,
    });
    const [replacement] = (await admin()`
      select id from public.sales_team_memberships
       where sales_team_id = ${team}
         and user_profile_id = ${fixture.manager.userProfileId}
         and status = 'active'`) as unknown as { id: string }[];

    /*
     * THE POINT OF DEFERRING THE CHECK. Between these two statements the team
     * has no open Team Lead period at all — an IMMEDIATE constraint would
     * refuse the transaction there, and leadership could then only ever be
     * replaced by breaking the invariant first. Deferred, the check runs once
     * at COMMIT and sees the state that was actually committed.
     *
     * Done through the tooling connection, which bypasses row-level security,
     * so what accepts this is the invariant itself rather than a policy.
     */
    await admin().begin(async (tx) => {
      await tx`
        update public.sales_team_lead_periods
           set ended_at = clock_timestamp()
         where sales_team_id = ${team} and ended_at is null`;
      await tx`
        insert into public.sales_team_lead_periods
          (workspace_id, sales_team_id, membership_id)
        values (${fixture.workspaceA}, ${team}, ${replacement!.id})`;
    });

    const periods = await leadPeriods(team);
    expect(periods).toHaveLength(2);
    expect(periods.filter((p) => p.ended_at === null)).toHaveLength(1);
    expect(periods.at(-1)!.user_profile_id).toBe(fixture.manager.userProfileId);
  });

  it("refuses a replacement who is not a member, at COMMIT", async () => {
    await clearTeams();
    const team = await makeTeam(`Stranger ${RUN}`, fixture.owner.userProfileId);
    await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: team,
      userProfileId: fixture.manager.userProfileId,
    });
    const other = await makeTeam(
      `Elsewhere ${RUN}`,
      fixture.shared.userProfileId,
    );
    const [foreign] = (await admin()`
      select id from public.sales_team_memberships
       where sales_team_id = ${other} and status = 'active'`) as unknown as {
      id: string;
    }[];

    /* A membership of ANOTHER team cannot carry this team's leadership — the
       same transaction shape as above, with the one fact changed. */
    await expect(
      admin().begin(async (tx) => {
        await tx`
          update public.sales_team_lead_periods
             set ended_at = clock_timestamp()
           where sales_team_id = ${team} and ended_at is null`;
        await tx`
          insert into public.sales_team_lead_periods
            (workspace_id, sales_team_id, membership_id)
          values (${fixture.workspaceA}, ${team}, ${foreign!.id})`;
      }),
    ).rejects.toThrow(
      /active membership of that team|exactly one active Team Lead/i,
    );

    // Rolled back whole: the original lead still holds it.
    const periods = await leadPeriods(team);
    expect(periods.filter((p) => p.ended_at === null)).toHaveLength(1);
    expect(periods[0]!.user_profile_id).toBe(fixture.owner.userProfileId);
  });

  it("accepts a DELETE of the open period when the team closes with it", async () => {
    await clearTeams();
    const team = await makeTeam(`Closing ${RUN}`, fixture.owner.userProfileId);

    /*
     * The DELETE path. Removing the open period alone would strand an active
     * team; removing it in the transaction that deactivates the team is a
     * valid end state. Only the table owner can delete here — no application
     * role holds DELETE — so this is the one caller that can reach it.
     */
    await admin().begin(async (tx) => {
      await tx`
        delete from public.sales_team_lead_periods where sales_team_id = ${team}`;
      await tx`
        update public.sales_team_memberships
           set status = 'ended', ended_at = clock_timestamp()
         where sales_team_id = ${team} and status = 'active'`;
      await tx`
        update public.sales_teams set status = 'inactive' where id = ${team}`;
    });

    const [row] = (await admin()`
      select status::text as status from public.sales_teams where id = ${team}
    `) as unknown as { status: string }[];
    expect(row!.status).toBe("inactive");
    expect(await leadPeriods(team)).toHaveLength(0);
  });

  it("refuses a DELETE of the open period while the team stays active", async () => {
    await clearTeams();
    const team = await makeTeam(`Stranded ${RUN}`, fixture.owner.userProfileId);
    await expect(
      admin()`
        delete from public.sales_team_lead_periods where sales_team_id = ${team}`,
    ).rejects.toThrow(/exactly one active Team Lead/i);
  });

  it("refuses a lead who is not an active member of that team", async () => {
    await clearTeams();
    const team = await makeTeam(`Outsider ${RUN}`, fixture.owner.userProfileId);
    expect(
      await g.teams.designateTeamLead(
        ownerA(),
        team,
        fixture.shared.userProfileId,
      ),
    ).toEqual({ ok: false, reason: "not_a_member" });
  });

  it("refuses to remove the lead of an active team", async () => {
    await clearTeams();
    const team = await makeTeam(`Keep ${RUN}`, fixture.manager.userProfileId);
    expect(
      await g.teams.removeTeamMember(
        ownerA(),
        team,
        fixture.manager.userProfileId,
      ),
    ).toEqual({ ok: false, reason: "is_team_lead" });

    const periods = await leadPeriods(team);
    expect(periods.filter((p) => p.ended_at === null)).toHaveLength(1);
  });

  it("cannot leave an active team without a lead, even by hand", async () => {
    await clearTeams();
    const team = await makeTeam(`Shape ${RUN}`, fixture.manager.userProfileId);

    /*
     * The deferred constraint, approached from outside every routine. This is
     * the tooling connection, which bypasses row-level security — so what
     * refuses here is the invariant itself, not a policy.
     */
    await expect(
      admin()`
        update public.sales_team_lead_periods
           set ended_at = now()
         where sales_team_id = ${team} and ended_at is null`,
    ).rejects.toThrow(/exactly one active Team Lead/i);
  });
});

describe.skipIf(!reachable)(
  "§163.1 deactivation and §163.12 reactivation",
  () => {
    it("ends memberships and leadership, and keeps every history row", async () => {
      await clearTeams();
      const team = await makeTeam(
        `Close ${RUN}`,
        fixture.manager.userProfileId,
      );
      await g.teams.addOrTransferTeamMember(ownerA(), {
        salesTeamId: team,
        userProfileId: fixture.shared.userProfileId,
      });

      const beforeHistory = await g.teams.salesTeamActivity(ownerA(), team);
      expect(await g.teams.deactivateSalesTeam(ownerA(), team)).toEqual({
        ok: true,
      });

      const [after] = await g.teams.salesTeams(ownerA());
      expect(after!.status).toBe("inactive");
      expect(after!.activeMemberCount).toBe(0);
      expect(after!.teamLeadUserProfileId).toBeNull();

      const periods = await leadPeriods(team);
      expect(periods.every((p) => p.ended_at !== null)).toBe(true);

      // §163.15: nothing is rewritten. Every earlier entry is still there.
      const afterHistory = await g.teams.salesTeamActivity(ownerA(), team);
      for (const entry of beforeHistory) {
        expect(afterHistory.map((e) => e.id)).toContain(entry.id);
      }
      expect(afterHistory.map((e) => e.kind)).toContain("team_deactivated");
    });

    it("changes no Lead and no Record Owner", async () => {
      await clearTeams();
      const team = await makeTeam(
        `Owners ${RUN}`,
        fixture.manager.userProfileId,
      );
      const [row] = (await admin()`
      insert into public.leads
        (workspace_id, name, phone, phone_normalised, stage_id,
         record_owner_user_profile_id, created_by_user_profile_id)
      values (${fixture.workspaceA}, ${`Team lead owner ${RUN}`},
              '+919222222222', '+919222222222',
              ${stageOf.get(fixture.workspaceA)!},
              ${fixture.manager.userProfileId}, ${fixture.manager.userProfileId})
      returning id
    `) as unknown as { id: string }[];

      await g.teams.deactivateSalesTeam(ownerA(), team);

      const [lead] = (await admin()`
      select record_owner_user_profile_id as owner, updated_at
        from public.leads where id = ${row!.id}`) as unknown as {
        owner: string;
      }[];
      expect(lead!.owner).toBe(fixture.manager.userProfileId);
    });

    it("refuses to reactivate without a Team Lead, and restores nothing", async () => {
      await clearTeams();
      const team = await makeTeam(
        `Revive ${RUN}`,
        fixture.manager.userProfileId,
      );
      await g.teams.deactivateSalesTeam(ownerA(), team);

      /*
       * §163.12: reactivation "is a guarded configuration workflow, not a
       * single toggle". The previous members and the previous Team Lead are
       * NOT restored, so this refuses until they are put back deliberately.
       */
      expect(await g.teams.reactivateSalesTeam(ownerA(), team)).toEqual({
        ok: false,
        reason: "team_lead_required",
      });
      const [still] = await g.teams.salesTeams(ownerA());
      expect(still!.status).toBe("inactive");
      expect(still!.activeMemberCount).toBe(0);

      // Put one back — as a NEW period — and designate, then it activates.
      await g.teams.addOrTransferTeamMember(ownerA(), {
        salesTeamId: team,
        userProfileId: fixture.manager.userProfileId,
      });
      await g.teams.designateTeamLead(
        ownerA(),
        team,
        fixture.manager.userProfileId,
      );
      expect(await g.teams.reactivateSalesTeam(ownerA(), team)).toEqual({
        ok: true,
      });

      const [live] = await g.teams.salesTeams(ownerA());
      expect(live!.status).toBe("active");
      expect(live!.teamLeadUserProfileId).toBe(fixture.manager.userProfileId);

      const rows = await membershipRows(
        fixture.workspaceA,
        fixture.manager.userProfileId,
      );
      expect(rows).toHaveLength(2);
      expect(rows.filter((row) => row.status === "ended")).toHaveLength(1);
    });
  },
);

describe.skipIf(!reachable)("§160 user deactivation", () => {
  it("refuses while the person leads an active team, and changes nothing", async () => {
    await clearTeams();
    const team = await makeTeam(`Boss ${RUN}`, fixture.manager.userProfileId);

    const result = await g.members.deactivateMember(
      ownerA(),
      fixture.manager.userProfileId,
    );
    expect(result).toEqual({ ok: false, reason: "leads_sales_team" });

    const [membership] = (await admin()`
      select status::text as status from public.workspace_memberships
       where workspace_id = ${fixture.workspaceA}
         and user_profile_id = ${fixture.manager.userProfileId}`) as unknown as {
      status: string;
    }[];
    expect(membership!.status).toBe("active");
    expect((await leadPeriods(team)).filter((p) => !p.ended_at)).toHaveLength(
      1,
    );
  });

  it("ends an ordinary member's team membership as history", async () => {
    await clearTeams();
    const team = await makeTeam(`Ordinary ${RUN}`, fixture.owner.userProfileId);
    await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: team,
      userProfileId: fixture.shared.userProfileId,
    });

    expect(
      await g.members.deactivateMember(ownerA(), fixture.shared.userProfileId),
    ).toEqual({ ok: true });

    const rows = await membershipRows(
      fixture.workspaceA,
      fixture.shared.userProfileId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("ended");
    expect(rows[0]!.ended_at).not.toBeNull();
    // Retained, not deleted — §160's "which is retained as history".
    expect(rows[0]!.sales_team_id).toBe(team);

    // Put them back for the suites that follow.
    await admin()`
      update public.workspace_memberships set status = 'active'
       where workspace_id = ${fixture.workspaceA}
         and user_profile_id = ${fixture.shared.userProfileId}`;
  });

  it("still refuses to deactivate someone who owns a Lead", async () => {
    await clearTeams();
    /*
     * The §160 precondition that already existed, re-checked because this
     * slice changed the routine underneath it. The Lead count is enforced in
     * the GATEWAY, in the same transaction, and rolls the deactivation back.
     */
    await admin()`
      insert into public.leads
        (workspace_id, name, phone, phone_normalised, stage_id,
         record_owner_user_profile_id, created_by_user_profile_id)
      values (${fixture.workspaceA}, ${`Owned ${RUN}`}, '+919333333333',
              '+919333333333', ${stageOf.get(fixture.workspaceA)!},
              ${fixture.shared.userProfileId}, ${fixture.shared.userProfileId})
    `;

    expect(
      await g.members.deactivateMember(ownerA(), fixture.shared.userProfileId),
    ).toEqual({ ok: false, reason: "blocked" });

    const [membership] = (await admin()`
      select status::text as status from public.workspace_memberships
       where workspace_id = ${fixture.workspaceA}
         and user_profile_id = ${fixture.shared.userProfileId}`) as unknown as {
      status: string;
    }[];
    expect(membership!.status).toBe("active");

    /* Creating a Lead writes its own §39 entry, and history holds a
       foreign key to it — so the history goes first. */
    await admin()`
      delete from public.lead_activities
       where lead_id in (select id from public.leads
                          where workspace_id = ${fixture.workspaceA}
                            and name = ${`Owned ${RUN}`})`;
    await admin()`
      delete from public.leads
       where workspace_id = ${fixture.workspaceA} and name = ${`Owned ${RUN}`}`;
  });

  it("refuses when the Lead count cannot be evaluated", async () => {
    /*
     * The fail-closed half. `app.count_leads_owned_by` returns NULL to anyone
     * who is not an active Owner/Admin, and the gateway treats NULL as a
     * refusal rather than as zero. Asked here as a Manager: the routine
     * refuses first, so the member is not deactivated by either path.
     */
    const result = await g.members.deactivateMember(
      managerA(),
      fixture.shared.userProfileId,
    );
    expect(result.ok).toBe(false);
    const [membership] = (await admin()`
      select status::text as status from public.workspace_memberships
       where workspace_id = ${fixture.workspaceA}
         and user_profile_id = ${fixture.shared.userProfileId}`) as unknown as {
      status: string;
    }[];
    expect(membership!.status).toBe("active");
  });

  it("cannot leave a deactivated user holding an active team membership", async () => {
    await clearTeams();
    const team = await makeTeam(`Backstop ${RUN}`, fixture.owner.userProfileId);
    await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: team,
      userProfileId: fixture.shared.userProfileId,
    });

    /*
     * The database backstop, bypassing every routine and every policy. This is
     * what makes the rule hold for a caller that does not come through the
     * gateway — the difference between gateway enforcement and the real kind.
     */
    await expect(
      admin()`
        update public.workspace_memberships set status = 'inactive'
         where workspace_id = ${fixture.workspaceA}
           and user_profile_id = ${fixture.shared.userProfileId}`,
    ).rejects.toThrow(/active Sales Team membership/i);
  });
});

describe.skipIf(!reachable)("§163.2 membership grants no record access", () => {
  it("still hides a teammate's Lead after they join the same team", async () => {
    await clearTeams();
    const team = await makeTeam(`Access ${RUN}`, fixture.owner.userProfileId);
    await g.teams.addOrTransferTeamMember(ownerA(), {
      salesTeamId: team,
      userProfileId: fixture.shared.userProfileId,
    });

    const [theirs] = (await admin()`
      insert into public.leads
        (workspace_id, name, phone, phone_normalised, stage_id,
         record_owner_user_profile_id, created_by_user_profile_id)
      values (${fixture.workspaceA}, ${`Owner only ${RUN}`}, '+919444444444',
              '+919444444444', ${stageOf.get(fixture.workspaceA)!},
              ${fixture.owner.userProfileId}, ${fixture.owner.userProfileId})
      returning id
    `) as unknown as { id: string }[];

    /*
     * §163.17: "Sales Team membership, Team Lead responsibility and WhatsApp
     * conversation assignment grant no record access." The Staff/Sales user
     * is now in the same team as the Lead's owner. It changes nothing.
     */
    const visible = await g.leads.listLeads(staffA(), { scope: "all" });
    expect(visible.items.map((lead) => lead.id)).not.toContain(theirs!.id);
    expect(await g.leads.leadDetail(staffA(), theirs!.id)).toBeNull();

    // And the same again once they LEAD the team.
    await g.teams.designateTeamLead(
      ownerA(),
      team,
      fixture.shared.userProfileId,
    );
    expect(await g.leads.leadDetail(staffA(), theirs!.id)).toBeNull();

    await admin()`
      delete from public.lead_activities where lead_id = ${theirs!.id}`;
    await admin()`delete from public.leads where id = ${theirs!.id}`;
  });

  it("keeps the administrative history to Owner/Admin", async () => {
    await clearTeams();
    const team = await makeTeam(`Audit ${RUN}`, fixture.owner.userProfileId);
    expect(
      (await g.teams.salesTeamActivity(ownerA(), team)).length,
    ).toBeGreaterThan(0);
    // §162 gives Staff/Sales no row for administrative audit information.
    expect(await g.teams.salesTeamActivity(staffA(), team)).toHaveLength(0);
  });

  it("keeps the internal helpers internal, and PUBLIC out entirely", async () => {
    /*
     * `lock_sales_team_prelude` and `sales_team_place_member` assume locks
     * their callers already hold and authority their callers already
     * established. Called directly, `sales_team_place_member` would place a
     * member with no Owner/Admin check at all — so the runtime role must not
     * be able to call it, and nothing may be reachable through PUBLIC.
     */
    const [grants] = (await admin()`
      select
        has_function_privilege('limenzy_app',
          'app.lock_sales_team_prelude()', 'EXECUTE') as app_prelude,
        has_function_privilege('limenzy_app',
          'app.sales_team_place_member(uuid, uuid, uuid, boolean)', 'EXECUTE') as app_place,
        has_function_privilege('public',
          'app.create_sales_team(text, text, uuid, uuid, boolean)', 'EXECUTE') as public_create,
        has_function_privilege('public',
          'app.deactivate_sales_team(uuid)', 'EXECUTE') as public_deactivate,
        has_function_privilege('limenzy_app',
          'app.create_sales_team(text, text, uuid, uuid, boolean)', 'EXECUTE') as app_create
    `) as unknown as Record<string, boolean>[];
    expect(grants).toEqual({
      app_prelude: false,
      app_place: false,
      public_create: false,
      public_deactivate: false,
      // The one that IS granted, so the assertion above is not vacuous.
      app_create: true,
    });
  });

  it("runs every routine as limenzy_teams with an empty search_path", async () => {
    const rows = (await admin()`
      select p.proname,
             p.prosecdef as secdef,
             pg_catalog.pg_get_userbyid(p.proowner) as owner,
             exists (
               /* An empty search_path is recorded as search_path= for SQL
                  bodies and as search_path="" for plpgsql ones. */
               select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) as c
                where c in ('search_path=', 'search_path=""')
             ) as pinned
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app'
         and (p.proname like '%sales_team%' or p.proname in
              ('rename_sales_team', 'designate_team_lead', 'remove_team_member',
               'add_or_transfer_team_member'))
       order by p.proname
    `) as unknown as {
      proname: string;
      secdef: boolean;
      owner: string;
      pinned: boolean;
    }[];

    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const row of rows) {
      expect(`${row.proname}:${row.owner}`).toBe(
        `${row.proname}:limenzy_teams`,
      );
      /*
       * Every routine is a definer EXCEPT the two internal helpers: they
       * carry no privilege of their own and are only ever evaluated inside
       * one, which is also why neither is granted to the runtime role.
       */
      const internal =
        row.proname === "lock_sales_team_prelude" ||
        row.proname === "sales_team_place_member";
      expect(`${row.proname} definer:${row.secdef}`).toBe(
        `${row.proname} definer:${!internal}`,
      );
      expect(`${row.proname} search_path pinned:${row.pinned}`).toBe(
        `${row.proname} search_path pinned:true`,
      );
    }
  });

  it("is append-only: no application role may rewrite it", async () => {
    const [grants] = (await admin()`
      select
        has_table_privilege('limenzy_app', 'public.sales_team_activities', 'UPDATE') as app_update,
        has_table_privilege('limenzy_app', 'public.sales_team_activities', 'DELETE') as app_delete,
        has_table_privilege('limenzy_teams', 'public.sales_team_activities', 'UPDATE') as teams_update,
        has_table_privilege('limenzy_app', 'public.sales_teams', 'INSERT') as app_insert_team,
        has_table_privilege('limenzy_app', 'public.sales_team_memberships', 'UPDATE') as app_update_member
    `) as unknown as Record<string, boolean>[];
    expect(grants).toEqual({
      app_update: false,
      app_delete: false,
      teams_update: false,
      app_insert_team: false,
      app_update_member: false,
    });
  });
});
