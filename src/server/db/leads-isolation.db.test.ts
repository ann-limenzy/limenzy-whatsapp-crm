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
 * Milestone 3B — Leads (§26, §30–§32, §35–§37, §130.1, §162.1).
 *
 * What a real database is needed for, and a unit test could not say:
 *
 *   * §162.1 decided by row-level security rather than by the gateway — an
 *     Owner/Admin sees the workspace, a Manager sees what the workspace's
 *     scope says, a Staff/Sales user sees what they own, and an unconfigured
 *     Manager scope DENIES rather than guessing;
 *   * a Lead in another workspace is invisible even when its id is known;
 *   * the composite foreign keys make a cross-workspace stage, source or
 *     owner unrepresentable rather than merely refused;
 *   * §130.1 duplicate detection finds a colleague's Lead the actor may not
 *     access, and reports it without describing it;
 *   * the §34 occupancy rule and the locking contract, which only show
 *     themselves when two transactions actually race.
 *
 * WHAT IS NOT TESTED HERE, DELIBERATELY. There is no archive (§50), so
 * "active Leads" and "all Leads" are the same set and the occupancy rule is
 * exercised on every Lead. Nothing below should be read as evidence that an
 * archived Lead releases its stage — that behaviour does not exist yet.
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
    '[test:db] the leads suite needs both connections. Run "npm run test:db:local".',
  );
}

const admin = () => {
  if (!tooling) throw new Error("no tooling connection");
  return tooling;
};
const runtime = () => {
  if (!runtimeProbe) throw new Error("no runtime connection");
  return runtimeProbe;
};

const RUN = randomUUID().slice(0, 8);
let fixture: TenantFixture;
let recorded: Awaited<ReturnType<typeof createTenantFixture>>["recorded"];

type Gateways = {
  createTenantContext: typeof import("./tenant-context").createTenantContext;
  listLeads: typeof import("@/server/auth/workspace-leads").listLeads;
  leadDetail: typeof import("@/server/auth/workspace-leads").leadDetail;
  createLead: typeof import("@/server/auth/workspace-leads").createLead;
  findDuplicateCandidates: typeof import("@/server/auth/workspace-leads").findDuplicateCandidates;
  recordOwnerNames: typeof import("@/server/auth/workspace-leads").recordOwnerNames;
  countLeadsOwnedBy: typeof import("@/server/auth/workspace-leads").countLeadsOwnedBy;
  deactivateMember: typeof import("@/server/auth/workspace-members").deactivateMember;
  setLeadStageActive: typeof import("@/server/auth/workspace-lead-pipeline").setLeadStageActive;
  runtimeSql: typeof import("./client").runtimeSql;
};
let g: Gateways;

/** The seeded pipeline for each fixture workspace, keyed by workspace id. */
const stages = new Map<
  string,
  { first: string; second: string; won: string }
>();
const sources = new Map<string, string>();

/** Seed a pipeline directly, because the fixture inserts workspaces by hand. */
async function seedPipeline(workspaceId: string) {
  const rows = (await admin()`
    insert into public.workspace_lead_stages
      (workspace_id, name, sort_order, kind)
    values
      (${workspaceId}, ${`New ${RUN}`}, 1, 'active'),
      (${workspaceId}, ${`Contacted ${RUN}`}, 2, 'active'),
      (${workspaceId}, ${`Won ${RUN}`}, 90, 'won'),
      (${workspaceId}, ${`Lost ${RUN}`}, 91, 'lost')
    returning id, kind::text as kind, sort_order
  `) as unknown as { id: string; kind: string; sort_order: number }[];
  stages.set(workspaceId, {
    first: rows.find((r) => r.sort_order === 1)!.id,
    second: rows.find((r) => r.sort_order === 2)!.id,
    won: rows.find((r) => r.kind === "won")!.id,
  });
  const [source] = (await admin()`
    insert into public.workspace_lead_sources (workspace_id, name)
    values (${workspaceId}, ${`Referral ${RUN}`}) returning id
  `) as unknown as { id: string }[];
  sources.set(workspaceId, source!.id);
}

beforeAll(async () => {
  if (!reachable) return;
  ({ fixture, recorded } = await createTenantFixture(admin(), RUN));
  await seedPipeline(fixture.workspaceA);
  await seedPipeline(fixture.workspaceB);
  const [context, leads, pipeline, client, members] = await Promise.all([
    import("./tenant-context"),
    import("@/server/auth/workspace-leads"),
    import("@/server/auth/workspace-lead-pipeline"),
    import("./client"),
    import("@/server/auth/workspace-members"),
  ]);
  g = {
    createTenantContext: context.createTenantContext,
    runtimeSql: client.runtimeSql,
    setLeadStageActive: pipeline.setLeadStageActive,
    deactivateMember: members.deactivateMember,
    ...leads,
  };
}, 30_000);

afterAll(async () => {
  if (reachable && recorded) {
    for (const workspace of recorded.workspaces) {
      await admin()`
        delete from public.lead_activities where workspace_id = ${workspace}`.catch(
        () => {},
      );
      await admin()`
        delete from public.lead_duplicate_overrides where workspace_id = ${workspace}`.catch(
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
      await admin()`
        delete from public.workspace_lead_sources where workspace_id = ${workspace}`.catch(
        () => {},
      );
    }
    const problems = await cleanupTenantFixture(admin(), recorded);
    if (problems.length > 0) {
      console.error("[leads isolation] cleanup problems:", problems);
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
const ownerB = () => ctx(fixture.shared, fixture.workspaceB);

/** Set the workspace's §162 configuration directly, as Settings would. */
async function configure(
  workspaceId: string,
  options: { scope?: string | null; granted?: string[] },
) {
  if (options.scope !== undefined) {
    await admin()`
      update public.workspaces set manager_record_scope = ${options.scope}
       where id = ${workspaceId}`;
  }
  if (options.granted !== undefined) {
    await admin()`
      update public.workspaces set permissions_granted = ${options.granted}
       where id = ${workspaceId}`;
  }
}

/** Insert a Lead straight through the admin connection, bypassing policies. */
async function seedLead(
  workspaceId: string,
  ownerProfileId: string,
  overrides: {
    name?: string;
    phone?: string | null;
    phoneNormalised?: string | null;
    email?: string | null;
    emailNormalised?: string | null;
    stageId?: string;
  } = {},
): Promise<string> {
  const stage = overrides.stageId ?? stages.get(workspaceId)!.first;
  const [row] = (await admin()`
    insert into public.leads
      (workspace_id, name, phone, phone_normalised, email, email_normalised,
       stage_id, record_owner_user_profile_id, created_by_user_profile_id)
    values
      (${workspaceId}, ${overrides.name ?? `Lead ${randomUUID().slice(0, 8)}`},
       ${overrides.phone ?? "+919000000000"},
       ${overrides.phoneNormalised ?? overrides.phone ?? "+919000000000"},
       ${overrides.email ?? null}, ${overrides.emailNormalised ?? null},
       ${stage}, ${ownerProfileId}, ${ownerProfileId})
    returning id
  `) as unknown as { id: string }[];
  return row!.id;
}

describe.skipIf(!reachable)("§162.1 record access", () => {
  it("shows an Owner/Admin every lead in the workspace", async () => {
    const mine = await seedLead(
      fixture.workspaceA,
      fixture.owner.userProfileId,
    );
    const theirs = await seedLead(
      fixture.workspaceA,
      fixture.shared.userProfileId,
    );

    const visible = await g.listLeads(ownerA(), { scope: "all" });
    const ids = visible.items.map((lead) => lead.id);
    expect(ids).toContain(mine);
    expect(ids).toContain(theirs);
  });

  it("shows a Staff/Sales user only the leads they own", async () => {
    const theirs = await seedLead(
      fixture.workspaceA,
      fixture.shared.userProfileId,
    );
    const someoneElses = await seedLead(
      fixture.workspaceA,
      fixture.owner.userProfileId,
    );

    const visible = await g.listLeads(staffA(), { scope: "all" });
    const ids = visible.items.map((lead) => lead.id);
    expect(ids).toContain(theirs);
    expect(ids).not.toContain(someoneElses);

    // Even by id: the policy returns no row, and the screen says not found.
    expect(await g.leadDetail(staffA(), someoneElses)).toBeNull();
  });

  it("denies a Manager while the workspace has not chosen a scope", async () => {
    // §162.1 names two settings and no default. An unmade choice is not a
    // grant, so an unconfigured workspace shows a Manager nothing.
    await configure(fixture.workspaceA, { scope: null });
    const someoneElses = await seedLead(
      fixture.workspaceA,
      fixture.owner.userProfileId,
    );
    const visible = await g.listLeads(managerA(), { scope: "all" });
    expect(visible.items.map((lead) => lead.id)).not.toContain(someoneElses);
  });

  it("follows the Manager scope the workspace did choose", async () => {
    const someoneElses = await seedLead(
      fixture.workspaceA,
      fixture.owner.userProfileId,
    );

    await configure(fixture.workspaceA, { scope: "own_assigned_shared" });
    expect(
      (await g.listLeads(managerA(), { scope: "all" })).items.map((l) => l.id),
    ).not.toContain(someoneElses);

    await configure(fixture.workspaceA, { scope: "all_records" });
    expect(
      (await g.listLeads(managerA(), { scope: "all" })).items.map((l) => l.id),
    ).toContain(someoneElses);

    await configure(fixture.workspaceA, { scope: null });
  });

  it("narrows, never widens, with the My Leads filter", async () => {
    const mine = await seedLead(
      fixture.workspaceA,
      fixture.owner.userProfileId,
    );
    const theirs = await seedLead(
      fixture.workspaceA,
      fixture.shared.userProfileId,
    );

    const mineOnly = await g.listLeads(ownerA(), { scope: "mine" });
    expect(mineOnly.items.map((l) => l.id)).toContain(mine);
    expect(mineOnly.items.map((l) => l.id)).not.toContain(theirs);
  });
});

describe.skipIf(!reachable)("cross-workspace isolation", () => {
  it("never shows a lead from another workspace, even by id", async () => {
    const inB = await seedLead(
      fixture.workspaceB,
      fixture.shared.userProfileId,
    );

    expect(
      (await g.listLeads(ownerA(), { scope: "all" })).items.map((l) => l.id),
    ).not.toContain(inB);
    expect(await g.leadDetail(ownerA(), inB)).toBeNull();

    // The same person, in the workspace that does own it, sees it.
    expect(await g.leadDetail(ownerB(), inB)).not.toBeNull();
  });

  it("cannot file a lead against another workspace's stage", async () => {
    const foreignStage = stages.get(fixture.workspaceB)!.first;
    const result = await g.createLead(ownerA(), {
      name: `Cross ${RUN}`,
      phone: "+919111111111",
      phoneNormalised: "+919111111111",
      phoneNeedsReview: false,
      email: null,
      emailNormalised: null,
      notes: null,
      stageId: foreignStage,
      sourceId: null,
    });
    // The stage row is invisible to this workspace, so the lock finds nothing.
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
  });

  it("cannot file a lead against another workspace's source", async () => {
    const result = await g.createLead(ownerA(), {
      name: `Cross source ${RUN}`,
      phone: "+919222222222",
      phoneNormalised: "+919222222222",
      phoneNeedsReview: false,
      email: null,
      emailNormalised: null,
      notes: null,
      stageId: stages.get(fixture.workspaceA)!.first,
      sourceId: sources.get(fixture.workspaceB)!,
    });
    // The composite foreign key makes this unrepresentable, not merely denied.
    expect(result.ok).toBe(false);
    expect(result.ok === false ? result.reason : null).toBe("not_permitted");
  });

  it("refuses a hand-written insert that names another workspace", async () => {
    // Straight at the table as the runtime role, with the tenant settings of
    // workspace A, trying to write a row for workspace B.
    await expect(
      runtime().begin(async (tx) => {
        await tx`select set_config('app.auth_user_id', ${fixture.owner.authUserId}, true)`;
        await tx`select set_config('app.user_profile_id', ${fixture.owner.userProfileId}, true)`;
        await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
        await tx`
          insert into public.leads
            (workspace_id, name, phone, stage_id,
             record_owner_user_profile_id, created_by_user_profile_id)
          values (${fixture.workspaceB}, ${`Smuggled ${RUN}`}, '+919333333333',
                  ${stages.get(fixture.workspaceB)!.first},
                  ${fixture.shared.userProfileId},
                  ${fixture.owner.userProfileId})`;
      }),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe.skipIf(!reachable)("§162 add permission", () => {
  it("lets an Owner/Admin add a lead, owned by them", async () => {
    const result = await g.createLead(ownerA(), {
      name: `Added ${RUN}`,
      phone: "+919444444444",
      phoneNormalised: "+919444444444",
      phoneNeedsReview: false,
      email: null,
      emailNormalised: null,
      notes: "First contact",
      stageId: stages.get(fixture.workspaceA)!.first,
      sourceId: sources.get(fixture.workspaceA)!,
    });
    expect(result.ok).toBe(true);
    const id = result.ok ? result.leadId : "";
    const lead = await g.leadDetail(ownerA(), id);
    expect(lead?.recordOwnerUserProfileId).toBe(fixture.owner.userProfileId);
    expect(lead?.isOwnedByActor).toBe(true);
  });

  it("refuses a Staff/Sales user the workspace has not granted it", async () => {
    await configure(fixture.workspaceA, { granted: [] });
    const result = await g.createLead(staffA(), {
      name: `Ungranted ${RUN}`,
      phone: "+919555555555",
      phoneNormalised: "+919555555555",
      phoneNeedsReview: false,
      email: null,
      emailNormalised: null,
      notes: null,
      stageId: stages.get(fixture.workspaceA)!.first,
      sourceId: null,
    });
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
  });

  it("allows that same user once the workspace grants it", async () => {
    await configure(fixture.workspaceA, { granted: ["add_leads_customers"] });
    const result = await g.createLead(staffA(), {
      name: `Granted ${RUN}`,
      phone: "+919666666666",
      phoneNormalised: "+919666666666",
      phoneNeedsReview: false,
      email: null,
      emailNormalised: null,
      notes: null,
      stageId: stages.get(fixture.workspaceA)!.first,
      sourceId: null,
    });
    expect(result.ok).toBe(true);
    await configure(fixture.workspaceA, { granted: [] });
  });

  it("refuses an outcome stage at creation", async () => {
    const result = await g.createLead(ownerA(), {
      name: `Straight to won ${RUN}`,
      phone: "+919777777777",
      phoneNormalised: "+919777777777",
      phoneNeedsReview: false,
      email: null,
      emailNormalised: null,
      notes: null,
      stageId: stages.get(fixture.workspaceA)!.won,
      sourceId: null,
    });
    expect(result).toEqual({ ok: false, reason: "stage_unavailable" });
  });

  it("holds no grant to rewrite a Record Owner", async () => {
    const [row] = (await admin()`
      select has_column_privilege('limenzy_app', 'public.leads',
        'record_owner_user_profile_id', 'UPDATE') as may`) as unknown as {
      may: boolean;
    }[];
    expect(row!.may).toBe(false);
  });
});

describe.skipIf(!reachable)("§130.1 duplicate detection", () => {
  const PHONE = "+919888888888";

  it("finds a colleague's lead the actor may not access, without describing it", async () => {
    await seedLead(fixture.workspaceA, fixture.owner.userProfileId, {
      name: `Someone else's ${RUN}`,
      phone: PHONE,
      phoneNormalised: PHONE,
    });

    const candidates = await g.findDuplicateCandidates(staffA(), {
      phoneNormalised: PHONE,
      emailNormalised: null,
    });
    expect(candidates.length).toBeGreaterThan(0);
    const hidden = candidates.find((c) => !c.visible);
    expect(hidden).toBeDefined();
    expect(hidden?.matchedFields).toEqual(["phone"]);
    // Nothing about the record itself crossed the boundary.
    expect(hidden?.name).toBeUndefined();
    expect(hidden?.phone).toBeUndefined();
  });

  it("describes a candidate the actor may access", async () => {
    const candidates = await g.findDuplicateCandidates(ownerA(), {
      phoneNormalised: PHONE,
      emailNormalised: null,
    });
    const shown = candidates.find((c) => c.visible);
    expect(shown?.name).toContain("Someone else's");
    expect(shown?.matchedFields).toEqual(["phone"]);
  });

  it("never reaches another workspace", async () => {
    await seedLead(fixture.workspaceB, fixture.shared.userProfileId, {
      phone: "+919999999999",
      phoneNormalised: "+919999999999",
    });
    const candidates = await g.findDuplicateCandidates(ownerA(), {
      phoneNormalised: "+919999999999",
      emailNormalised: null,
    });
    expect(candidates).toEqual([]);
  });

  it("refuses to create over a duplicate, and records an override that does", async () => {
    const lead = {
      name: `Duplicate ${RUN}`,
      phone: PHONE,
      phoneNormalised: PHONE,
      phoneNeedsReview: false,
      email: null,
      emailNormalised: null,
      notes: null,
      stageId: stages.get(fixture.workspaceA)!.first,
      sourceId: null,
    };

    const refused = await g.createLead(ownerA(), lead);
    expect(refused.ok).toBe(false);
    expect(refused.ok === false ? refused.reason : null).toBe("duplicate");

    const forced = await g.createLead(ownerA(), lead, {
      override: true,
      overrideExplanation: "Different person, shared office line",
    });
    expect(forced.ok).toBe(true);

    const [record] = (await admin()`
      select overridden_by_user_profile_id, matched_fields, explanation,
             array_length(candidate_lead_ids, 1) as candidates
        from public.lead_duplicate_overrides
       where lead_id = ${forced.ok ? forced.leadId : ""}`) as unknown as {
      overridden_by_user_profile_id: string;
      matched_fields: string[];
      explanation: string;
      candidates: number;
    }[];
    expect(record!.overridden_by_user_profile_id).toBe(
      fixture.owner.userProfileId,
    );
    expect(record!.matched_fields).toEqual(["phone"]);
    expect(record!.explanation).toContain("shared office line");
    expect(record!.candidates).toBeGreaterThanOrEqual(1);
  });
});

describe.skipIf(!reachable)("§130.1 override records cannot be forged", () => {
  const forge = (workspaceId: string, leadId: string, actorProfileId: string) =>
    runtime().begin(async (tx) => {
      await tx`select set_config('app.auth_user_id', ${fixture.owner.authUserId}, true)`;
      await tx`select set_config('app.user_profile_id', ${fixture.owner.userProfileId}, true)`;
      await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
      await tx`
        insert into public.lead_duplicate_overrides
          (workspace_id, lead_id, overridden_by_user_profile_id,
           candidate_lead_ids, matched_fields)
        values (${workspaceId}, ${leadId}::uuid, ${actorProfileId},
                array[${leadId}::uuid]::uuid[], array['phone'])`;
    });

  it("refuses an override attributed to somebody else", async () => {
    const lead = await seedLead(
      fixture.workspaceA,
      fixture.owner.userProfileId,
    );
    await expect(
      forge(fixture.workspaceA, lead, fixture.shared.userProfileId),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("refuses an override written into another workspace", async () => {
    const leadInB = await seedLead(
      fixture.workspaceB,
      fixture.shared.userProfileId,
    );
    await expect(
      forge(fixture.workspaceB, leadInB, fixture.owner.userProfileId),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("holds no grant to revise or remove an override once written", async () => {
    const rows = (await admin()`
      select privilege_type from information_schema.role_table_grants
       where table_schema = 'public'
         and table_name = 'lead_duplicate_overrides'
         and grantee = 'limenzy_app'
       order by privilege_type`) as unknown as { privilege_type: string }[];
    // SELECT, plus a column-scoped INSERT that does not appear here: an audit
    // row is written once and never revised.
    expect(rows.map((r) => r.privilege_type)).toEqual(["SELECT"]);
    const [may] = (await admin()`
      select has_table_privilege('limenzy_app', 'public.lead_duplicate_overrides',
                                 'UPDATE') as upd,
             has_table_privilege('limenzy_app', 'public.lead_duplicate_overrides',
                                 'DELETE') as del`) as unknown as {
      upd: boolean;
      del: boolean;
    }[];
    expect(may).toEqual({ upd: false, del: false });
  });
});

describe.skipIf(!reachable)(
  "the §34 occupancy rule and the locking contract",
  () => {
    it("refuses to deactivate a stage that a lead occupies", async () => {
      const stage = stages.get(fixture.workspaceA)!.second;
      await seedLead(fixture.workspaceA, fixture.owner.userProfileId, {
        stageId: stage,
      });

      // Its OWN refusal, distinct from "that would leave no active stage":
      // the trigger names the constraint so the screen can say which it was.
      expect(await g.setLeadStageActive(ownerA(), stage, false)).toEqual({
        ok: false,
        reason: "stage_occupied",
      });

      const [row] = (await admin()`
      select is_active from public.workspace_lead_stages
       where id = ${stage}`) as unknown as { is_active: boolean }[];
      expect(row!.is_active).toBe(true);
    });

    it("allows it again once the stage is empty", async () => {
      const [created] = (await admin()`
      insert into public.workspace_lead_stages
        (workspace_id, name, sort_order, kind)
      values (${fixture.workspaceA}, ${`Spare ${RUN}`}, 10, 'active')
      returning id`) as unknown as { id: string }[];

      expect(await g.setLeadStageActive(ownerA(), created!.id, false)).toEqual({
        ok: true,
      });
      await admin()`
      update public.workspace_lead_stages set is_active = true
       where id = ${created!.id}`;
    });

    /**
     * The race the locking contract exists for.
     *
     * One transaction creates a Lead in a stage; another deactivates that same
     * stage. Both start before either commits. The Lead write takes
     * `select … for update` on the stage row FIRST, and the deactivating UPDATE
     * needs that same lock, so they serialise. Whichever commits second sees
     * the other's work — and the pair can never both succeed.
     */
    it("cannot both file a lead into a stage and close that stage", async () => {
      const [stage] = (await admin()`
      insert into public.workspace_lead_stages
        (workspace_id, name, sort_order, kind)
      values (${fixture.workspaceA}, ${`Racing ${RUN}`}, 11, 'active')
      returning id`) as unknown as { id: string }[];

      const settings = async (tx: postgres.TransactionSql) => {
        await tx`select set_config('app.auth_user_id', ${fixture.owner.authUserId}, true)`;
        await tx`select set_config('app.user_profile_id', ${fixture.owner.userProfileId}, true)`;
        await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
      };

      let releaseInsert: (() => void) | undefined;
      const insertHeld = new Promise<void>((resolve) => {
        releaseInsert = resolve;
      });

      const inserting = runtime().begin(async (tx) => {
        await settings(tx);
        // The contract: lock the stage row before referencing it.
        await tx`select id from public.workspace_lead_stages
                where id = ${stage!.id} for update`;
        await tx`
        insert into public.leads
          (workspace_id, name, phone, phone_normalised, stage_id,
           record_owner_user_profile_id, created_by_user_profile_id)
        values (${fixture.workspaceA}, ${`Racer ${RUN}`}, '+919012345678',
                '+919012345678', ${stage!.id},
                ${fixture.owner.userProfileId}, ${fixture.owner.userProfileId})`;
        // Hold the lock until the other transaction is definitely waiting.
        await insertHeld;
      });

      // Give the insert time to take the lock, then start the deactivation.
      await new Promise((resolve) => setTimeout(resolve, 200));
      const deactivating = runtime()
        .begin(async (tx) => {
          await settings(tx);
          await tx`update public.workspace_lead_stages set is_active = false
                  where id = ${stage!.id}`;
        })
        .then(
          () => "committed" as const,
          (error: { code?: string; constraint_name?: string }) =>
            `${error.code ?? "error"}/${error.constraint_name ?? "-"}`,
        );

      await new Promise((resolve) => setTimeout(resolve, 200));
      releaseInsert?.();
      await inserting;
      const outcome = await deactivating;

      // The deactivation waited for the lock, then found the lead and refused.
      expect(outcome).toBe("23514/stage_has_leads");
      const [row] = (await admin()`
      select is_active from public.workspace_lead_stages
       where id = ${stage!.id}`) as unknown as { is_active: boolean }[];
      expect(row!.is_active).toBe(true);
    }, 20_000);

    /**
     * §130.1's fourth checkpoint: "mandatory even when an earlier check passed,
     * because records can be created concurrently."
     */
    it("catches a duplicate that appeared after the form was filled in", async () => {
      const phone = "+919123450000";
      // The person checks, and there is nothing.
      expect(
        await g.findDuplicateCandidates(ownerA(), {
          phoneNormalised: phone,
          emailNormalised: null,
        }),
      ).toEqual([]);

      // Someone else creates one in the meantime.
      await seedLead(fixture.workspaceA, fixture.shared.userProfileId, {
        phone,
        phoneNormalised: phone,
      });

      // The create re-checks inside its own transaction and refuses.
      const result = await g.createLead(ownerA(), {
        name: `Late duplicate ${RUN}`,
        phone,
        phoneNormalised: phone,
        phoneNeedsReview: false,
        email: null,
        emailNormalised: null,
        notes: null,
        stageId: stages.get(fixture.workspaceA)!.first,
        sourceId: null,
      });
      expect(result.ok).toBe(false);
      expect(result.ok === false ? result.reason : null).toBe("duplicate");
    });
  },
);

describe.skipIf(!reachable)(
  "§160: deactivation and Lead creation cannot pass each other",
  () => {
    /**
     * The race the membership lock exists for.
     *
     * A Lead is being created for a member while that member is being
     * deactivated. Both transactions start before either commits. The Lead
     * write locks the stage, then the member's own row; the deactivation
     * changes the status, which takes the same row. One waits for the other,
     * and the one that waits sees the other's committed state — so the pair
     * can never leave a deactivated member owning a Lead.
     *
     * Driven here with real transactions rather than mocks, because the
     * interleaving is the whole claim.
     */
    it("leaves no deactivated member owning a lead", async () => {
      // A member of A whose deactivation will not trip the last-Owner rule.
      const target = fixture.manager;
      await admin()`
        update public.workspace_memberships set status = 'active'
         where workspace_id = ${fixture.workspaceA}
           and user_profile_id = ${target.userProfileId}`;
      await admin()`
        delete from public.lead_activities a
         using public.leads l
         where a.workspace_id = l.workspace_id and a.lead_id = l.id
           and l.workspace_id = ${fixture.workspaceA}
           and l.record_owner_user_profile_id = ${target.userProfileId}`;
      await admin()`
        delete from public.leads
         where workspace_id = ${fixture.workspaceA}
           and record_owner_user_profile_id = ${target.userProfileId}`;

      const stage = stages.get(fixture.workspaceA)!.first;
      const settings = async (
        tx: postgres.TransactionSql,
        user: { authUserId: string; userProfileId: string },
      ) => {
        await tx`select set_config('app.auth_user_id', ${user.authUserId}, true)`;
        await tx`select set_config('app.user_profile_id', ${user.userProfileId}, true)`;
        await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
      };

      let releaseCreate: (() => void) | undefined;
      const createHeld = new Promise<void>((resolve) => {
        releaseCreate = resolve;
      });

      // The Lead write: stage lock, then the member's own row, then insert.
      const creating = runtime()
        .begin(async (tx) => {
          await settings(tx, target);
          await tx`select stage_id from app.lock_lead_stage(${stage}::uuid)`;
          const [row] = await tx<{ status: string | null }[]>`
            select app.lock_actor_membership() as status`;
          if (row?.status !== "active") throw new Error("not active");
          await tx`
            insert into public.leads
              (workspace_id, name, phone, phone_normalised, stage_id,
               record_owner_user_profile_id, created_by_user_profile_id)
            values (${fixture.workspaceA}, ${`Race ${RUN}`}, '+919700000001',
                    '+919700000001', ${stage}::uuid,
                    ${target.userProfileId}, ${target.userProfileId})`;
          await createHeld;
        })
        .then(
          () => "created" as const,
          (error: { message?: string }) => `refused:${error.message ?? "?"}`,
        );

      // Let the create take both locks, then start the deactivation.
      await new Promise((resolve) => setTimeout(resolve, 250));
      const deactivating = (async () => {
        const result = await g.deactivateMember(ownerA(), target.userProfileId);
        return result.ok ? "deactivated" : `refused:${result.reason}`;
      })();

      await new Promise((resolve) => setTimeout(resolve, 250));
      releaseCreate?.();
      const createOutcome = await creating;
      const deactivateOutcome = await deactivating;

      // The create committed first; the deactivation waited, counted the new
      // Lead, and rolled back.
      expect(createOutcome).toBe("created");
      expect(deactivateOutcome).toBe("refused:blocked");

      const [member] = (await admin()`
        select status::text as status from public.workspace_memberships
         where workspace_id = ${fixture.workspaceA}
           and user_profile_id = ${target.userProfileId}`) as unknown as {
        status: string;
      }[];
      const [owned] = (await admin()`
        select count(*)::int as n from public.leads
         where workspace_id = ${fixture.workspaceA}
           and record_owner_user_profile_id = ${target.userProfileId}`) as unknown as {
        n: number;
      }[];
      // The invariant, stated directly: nobody is inactive and owning work.
      expect(`${member!.status}/${owned!.n > 0}`).toBe("active/true");
    }, 20_000);

    it("refuses a lead for a member deactivated a moment earlier", async () => {
      // The other order: the deactivation commits first, and the Lead write
      // reads the committed status rather than its own stale snapshot.
      const target = fixture.manager;
      await admin()`
        delete from public.lead_activities a
         using public.leads l
         where a.workspace_id = l.workspace_id and a.lead_id = l.id
           and l.workspace_id = ${fixture.workspaceA}
           and l.record_owner_user_profile_id = ${target.userProfileId}`;
      await admin()`
        delete from public.leads
         where workspace_id = ${fixture.workspaceA}
           and record_owner_user_profile_id = ${target.userProfileId}`;
      expect(
        (await g.deactivateMember(ownerA(), target.userProfileId)).ok,
      ).toBe(true);

      const result = await g.createLead(ctx(target, fixture.workspaceA), {
        name: `After deactivation ${RUN}`,
        phone: "+919700000002",
        phoneNormalised: "+919700000002",
        phoneNeedsReview: false,
        email: null,
        emailNormalised: null,
        notes: null,
        stageId: stages.get(fixture.workspaceA)!.first,
        sourceId: null,
      });
      expect(result).toEqual({ ok: false, reason: "not_permitted" });

      await admin()`
        update public.workspace_memberships set status = 'active'
         where workspace_id = ${fixture.workspaceA}
           and user_profile_id = ${target.userProfileId}`;
    });
  },
);

describe.skipIf(!reachable)("§160 responsibility counting", () => {
  it("counts the leads a person is the Record Owner of", async () => {
    const before = await g.countLeadsOwnedBy(
      ownerA(),
      fixture.manager.userProfileId,
    );
    await seedLead(fixture.workspaceA, fixture.manager.userProfileId);
    const after = await g.countLeadsOwnedBy(
      ownerA(),
      fixture.manager.userProfileId,
    );
    expect(after).toBe((before ?? 0) + 1);
  });

  it("counts every lead in the workspace, not the asker's own view", async () => {
    /*
     * The count must not depend on what the asker can SEE. Compared against
     * the tooling connection, which has no policy filtering at all: if the
     * routine were a policy-filtered query it would agree only by accident.
     */
    await seedLead(fixture.workspaceA, fixture.manager.userProfileId);
    const counted = await g.countLeadsOwnedBy(
      ownerA(),
      fixture.manager.userProfileId,
    );
    const [truth] = (await admin()`
      select count(*)::int as n from public.leads
       where workspace_id = ${fixture.workspaceA}
         and record_owner_user_profile_id = ${fixture.manager.userProfileId}`) as unknown as {
      n: number;
    }[];
    expect(counted).toBe(truth!.n);
    expect(counted).toBeGreaterThan(0);
  });

  it("refuses anyone who is not an active Owner/Admin, rather than narrowing", async () => {
    /*
     * A Manager scoped to All Records can SEE every Lead, so a policy-filtered
     * count would have answered them a plausible number. The routine refuses
     * instead: if user management is ever widened beyond Owner/Admin, the
     * answer becomes null and the caller must refuse, rather than quietly
     * under-counting on the day someone's scope is narrower.
     */
    await configure(fixture.workspaceA, { scope: "all_records" });
    expect(
      await g.countLeadsOwnedBy(managerA(), fixture.manager.userProfileId),
    ).toBeNull();
    expect(
      await g.countLeadsOwnedBy(staffA(), fixture.manager.userProfileId),
    ).toBeNull();
    await configure(fixture.workspaceA, { scope: null });
  });

  it("counts nothing for a person in another workspace", async () => {
    await seedLead(fixture.workspaceB, fixture.shared.userProfileId);
    // Asked from workspace A, a Lead owned in B is not this person's work here.
    const inA = await g.countLeadsOwnedBy(
      ownerA(),
      fixture.shared.userProfileId,
    );
    const everywhere = (await admin()`
      select count(*)::int as n from public.leads
       where record_owner_user_profile_id = ${fixture.shared.userProfileId}`) as unknown as {
      n: number;
    }[];
    expect(inA).toBeLessThan(everywhere[0]!.n);
  });
});

describe.skipIf(!reachable)("Record Owner names", () => {
  it("gives an Owner/Admin the names of the workspace's members", async () => {
    const names = await g.recordOwnerNames(ownerA());
    expect(names.get(fixture.owner.userProfileId)).toBeDefined();
    expect(names.get(fixture.shared.userProfileId)).toBeDefined();
  });

  it("gives a Staff/Sales user their own name and nobody else's", async () => {
    const names = await g.recordOwnerNames(staffA());
    expect(names.get(fixture.shared.userProfileId)).toBeDefined();
    expect(names.get(fixture.owner.userProfileId)).toBeUndefined();
  });
});
