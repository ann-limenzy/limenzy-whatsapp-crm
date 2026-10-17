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
 * Milestone 3A — Lead pipeline and Lead sources (§34, §164, §165).
 *
 * What a real database is needed for, and a unit test could not say:
 *
 *   * the two tables are invisible across workspaces, and writing is refused
 *     for anyone who is not an active Owner/Admin;
 *   * Won stays the final pipeline column and Lost stays outside it, through
 *     adds and reorders, because that rule lives in a DEFERRED constraint
 *     trigger and only shows itself at COMMIT;
 *   * the outcomes cannot be deactivated and a workspace cannot be left with
 *     no active stage;
 *   * seeding is idempotent, and re-running it never overwrites configuration
 *     a workspace has since changed.
 *
 * WHERE THE OCCUPANCY RULE LIVES NOW. §34 and §165 also require that a stage
 * holding active Leads cannot be deactivated. This suite could not exercise
 * that when it was written, because there was no `leads` table; Milestone 3B
 * added both the table and the rule, and the behaviour is exercised in
 * `src/server/db/leads-isolation.db.test.ts`, which has Leads to occupy a
 * stage with. The last test below asserts only that the mechanism exists, so
 * that removing it would fail here as well as there.
 */

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

const probe = async (url: string): Promise<postgres.Sql | undefined> => {
  if (!url) return undefined;
  const candidate = postgres(url, {
    max: 2,
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
await runtimeProbe?.end({ timeout: 1 }).catch(() => {});
const reachable = tooling !== undefined && runtimeProbe !== undefined;

if (reachable) assertMatchedDatabaseTargets(RUNTIME, TOOLING);
if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] the lead pipeline suite needs both connections. Run "npm run test:db:local".',
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
  leadStages: typeof import("@/server/auth/workspace-lead-pipeline").leadStages;
  leadSources: typeof import("@/server/auth/workspace-lead-pipeline").leadSources;
  addLeadStage: typeof import("@/server/auth/workspace-lead-pipeline").addLeadStage;
  renameLeadStage: typeof import("@/server/auth/workspace-lead-pipeline").renameLeadStage;
  moveLeadStage: typeof import("@/server/auth/workspace-lead-pipeline").moveLeadStage;
  setLeadStageActive: typeof import("@/server/auth/workspace-lead-pipeline").setLeadStageActive;
  addLeadSource: typeof import("@/server/auth/workspace-lead-pipeline").addLeadSource;
  renameLeadSource: typeof import("@/server/auth/workspace-lead-pipeline").renameLeadSource;
  setLeadSourceActive: typeof import("@/server/auth/workspace-lead-pipeline").setLeadSourceActive;
  runtimeSql: typeof import("./client").runtimeSql;
};
let g: Gateways;

beforeAll(async () => {
  if (!reachable) return;
  ({ fixture, recorded } = await createTenantFixture(admin(), RUN));
  const [context, pipeline, client] = await Promise.all([
    import("./tenant-context"),
    import("@/server/auth/workspace-lead-pipeline"),
    import("./client"),
  ]);
  g = {
    createTenantContext: context.createTenantContext,
    runtimeSql: client.runtimeSql,
    ...pipeline,
  };
}, 30_000);

afterAll(async () => {
  if (reachable && recorded) {
    /* Configuration rows reference the workspace, so they go first. */
    await admin()`
      delete from public.workspace_lead_stages
       where workspace_id = any(${recorded.workspaces})`.catch(() => {});
    await admin()`
      delete from public.workspace_lead_sources
       where workspace_id = any(${recorded.workspaces})`.catch(() => {});
    const problems = await cleanupTenantFixture(admin(), recorded);
    if (problems.length > 0) {
      console.error("[lead pipeline isolation] cleanup problems:", problems);
    }
  }
  try {
    if (g?.runtimeSql) await g.runtimeSql().end({ timeout: 5 });
  } catch {
    /* already closed */
  }
  await tooling?.end({ timeout: 5 }).catch(() => {});
}, 30_000);

const ctx = (
  user: { authUserId: string; userProfileId: string },
  workspace: string,
) =>
  g.createTenantContext({
    authUserId: user.authUserId,
    userProfileId: user.userProfileId,
    workspaceId: workspace,
  });

const ownerA = () => ctx(fixture.owner, fixture.workspaceA);

/** Seed the fixture's workspaces, which were created by the fixture directly. */
const seed = async (workspaceId: string) => {
  await admin()`
    insert into public.workspace_lead_stages (id, workspace_id, name, sort_order, kind)
    select gen_random_uuid(), ${workspaceId}, d.name, d.sort_order, d.kind
      from app.lead_stage_defaults() d
     where not exists (
       select 1 from public.workspace_lead_stages s
        where s.workspace_id = ${workspaceId}
     )`;
  await admin()`
    insert into public.workspace_lead_sources (id, workspace_id, name)
    select gen_random_uuid(), ${workspaceId}, d.name
      from app.lead_source_defaults() d
     where not exists (
       select 1 from public.workspace_lead_sources s
        where s.workspace_id = ${workspaceId}
     )`;
};

beforeAll(async () => {
  if (!reachable) return;
  await seed(fixture.workspaceA);
  await seed(fixture.workspaceB);
}, 30_000);

describe.skipIf(!reachable)("the defaults a workspace starts with", () => {
  it("is the §34 pipeline, with Won last and Lost outside it", async () => {
    const stages = await g.leadStages(ownerA());
    expect(stages.map((s) => s.name)).toEqual([
      "New",
      "Contacted",
      "Interested",
      "Won",
      "Lost",
    ]);
    expect(stages.map((s) => s.kind)).toEqual([
      "active",
      "active",
      "active",
      "won",
      "lost",
    ]);
    expect(stages.every((s) => s.isActive)).toBe(true);
  });

  it("and the §164 sources", async () => {
    const sources = await g.leadSources(ownerA());
    expect(sources.map((s) => s.name).sort()).toEqual([
      "Campaign",
      "Other",
      "Referral",
      "Walk-in",
      "Website",
    ]);
  });

  it("never overwrites configuration when seeding runs again", async () => {
    // The guarantee that matters for a re-run against a live database: the
    // backfill keys on "this workspace has no rows at all".
    const before = await g.leadStages(ownerA());
    const renamed = before.find((s) => s.name === "Contacted")!;
    await g.renameLeadStage(ownerA(), renamed.id, `Reached ${RUN}`);

    await seed(fixture.workspaceA);

    const after = await g.leadStages(ownerA());
    expect(after).toHaveLength(before.length);
    expect(after.map((s) => s.name)).toContain(`Reached ${RUN}`);
    expect(after.map((s) => s.name)).not.toContain("Contacted");

    await g.renameLeadStage(ownerA(), renamed.id, "Contacted");
  });
});

describe.skipIf(!reachable)("who may read and write it", () => {
  it("shows a workspace only its own stages and sources", async () => {
    const a = await g.leadStages(ownerA());
    const b = await g.leadStages(ctx(fixture.shared, fixture.workspaceB));
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a.map((s) => s.id).some((id) => b.some((s) => s.id === id))).toBe(
      false,
    );
  });

  it("lets an ordinary member READ the vocabulary", async () => {
    // A Lead form has to render the stage a Lead is in; §162.1 governs which
    // LEADS a user sees, not which stages exist.
    const asStaff = await g.leadStages(ctx(fixture.shared, fixture.workspaceA));
    expect(asStaff.length).toBeGreaterThan(0);
  });

  it("refuses every write from a Manager and from Staff/Sales", async () => {
    const stages = await g.leadStages(ownerA());
    const ordinary = stages.find((s) => s.kind === "active")!;

    for (const who of [fixture.manager, fixture.shared]) {
      const context = ctx(who, fixture.workspaceA);
      expect(await g.addLeadStage(context, `Nope ${RUN}`)).toEqual({
        ok: false,
        reason: "not_permitted",
      });
      expect(
        await g.renameLeadStage(context, ordinary.id, `Nope ${RUN}`),
      ).toEqual({ ok: false, reason: "not_permitted" });
      expect(await g.setLeadStageActive(context, ordinary.id, false)).toEqual({
        ok: false,
        reason: "not_permitted",
      });
      expect(await g.addLeadSource(context, `Nope ${RUN}`)).toEqual({
        ok: false,
        reason: "not_permitted",
      });
    }
  });

  it("refuses an Owner/Admin of another workspace", async () => {
    // `shared` is owner_admin of B. Pointed at A's stage with A's workspace in
    // the context, every policy predicate fails.
    const stages = await g.leadStages(ownerA());
    const ordinary = stages.find((s) => s.kind === "active")!;
    expect(
      await g.renameLeadStage(
        ctx(fixture.shared, fixture.workspaceB),
        ordinary.id,
        `Hijack ${RUN}`,
      ),
    ).toEqual({ ok: false, reason: "not_permitted" });
  });

  it("gives the runtime role no DELETE on either table", async () => {
    const rows = (await admin()`
      select table_name, privilege_type
        from information_schema.table_privileges
       where grantee = 'limenzy_app'
         and table_schema = 'public'
         and table_name in ('workspace_lead_stages', 'workspace_lead_sources')
         and privilege_type = 'DELETE'`) as unknown as unknown[];
    expect(rows).toHaveLength(0);
  });
});

describe.skipIf(!reachable)("Won stays last and Lost stays outside", () => {
  it("adds a new stage before Won, pushing both outcomes down", async () => {
    const name = `Quoted ${RUN}`;
    expect(await g.addLeadStage(ownerA(), name)).toEqual({ ok: true });

    const stages = await g.leadStages(ownerA());
    const names = stages.map((s) => s.name);
    expect(names.indexOf(name)).toBeLessThan(names.indexOf("Won"));
    expect(names.indexOf("Won")).toBeLessThan(names.indexOf("Lost"));
    // Contiguous from 1, so the ordering never drifts.
    expect(stages.map((s) => s.sortOrder)).toEqual(
      stages.map((_, index) => index + 1),
    );
  });

  it("will not let an ordinary stage move past Won", async () => {
    const stages = await g.leadStages(ownerA());
    const ordinary = stages.filter((s) => s.kind === "active");
    const last = ordinary[ordinary.length - 1]!;
    expect(await g.moveLeadStage(ownerA(), last.id, "down")).toEqual({
      ok: false,
      reason: "cannot_move",
    });
  });

  it("will not move an outcome at all", async () => {
    const won = (await g.leadStages(ownerA())).find((s) => s.kind === "won")!;
    expect(await g.moveLeadStage(ownerA(), won.id, "up")).toEqual({
      ok: false,
      reason: "cannot_move",
    });
  });

  it("swaps two ordinary stages and keeps the numbering contiguous", async () => {
    const before = (await g.leadStages(ownerA())).filter(
      (s) => s.kind === "active",
    );
    const second = before[1]!;
    expect(await g.moveLeadStage(ownerA(), second.id, "up")).toEqual({
      ok: true,
    });

    const after = (await g.leadStages(ownerA())).filter(
      (s) => s.kind === "active",
    );
    expect(after[0]!.id).toBe(second.id);
    expect(after.map((s) => s.sortOrder)).toEqual(
      after.map((_, index) => index + 1),
    );

    await g.moveLeadStage(ownerA(), second.id, "down");
  });

  it("renames an outcome without changing what it is", async () => {
    // §34 requires a workspace to RETAIN a Won outcome and a Lost outcome and
    // fixes Won as the final column. Neither is a rule about the label, and
    // an outcome is identified by its kind everywhere — the partial unique
    // indexes key on `kind`, never on the name — so a workspace may call them
    // whatever suits it.
    const before = await g.leadStages(ownerA());
    const won = before.find((s) => s.kind === "won")!;
    const lost = before.find((s) => s.kind === "lost")!;

    expect(await g.renameLeadStage(ownerA(), won.id, "Closed — sold")).toEqual({
      ok: true,
    });
    expect(await g.renameLeadStage(ownerA(), lost.id, "Closed — no")).toEqual({
      ok: true,
    });

    const after = await g.leadStages(ownerA());
    const renamedWon = after.find((s) => s.id === won.id)!;
    const renamedLost = after.find((s) => s.id === lost.id)!;
    expect(renamedWon.name).toBe("Closed — sold");
    expect(renamedLost.name).toBe("Closed — no");
    // Kind, position and active flag are untouched by a rename.
    expect(renamedWon.kind).toBe("won");
    expect(renamedLost.kind).toBe("lost");
    expect(renamedWon.sortOrder).toBe(won.sortOrder);
    expect(renamedLost.sortOrder).toBe(lost.sortOrder);
    expect(renamedWon.isActive && renamedLost.isActive).toBe(true);
    // Won is still last among the stages that form the pipeline.
    const ordinary = after.filter((s) => s.kind === "active");
    expect(ordinary.every((s) => s.sortOrder < renamedWon.sortOrder)).toBe(
      true,
    );
    // And the renamed outcomes are still refused a move and a switch-off.
    expect(await g.moveLeadStage(ownerA(), renamedWon.id, "up")).toEqual({
      ok: false,
      reason: "cannot_move",
    });
    expect(await g.setLeadStageActive(ownerA(), renamedLost.id, false)).toEqual(
      { ok: false, reason: "refused" },
    );

    // An outcome's name competes for the same active-name uniqueness as any
    // other stage, so put the defaults back for the tests that follow.
    expect(await g.renameLeadStage(ownerA(), won.id, won.name)).toEqual({
      ok: true,
    });
    expect(await g.renameLeadStage(ownerA(), lost.id, lost.name)).toEqual({
      ok: true,
    });
  });

  it("refuses to deactivate Won or Lost", async () => {
    for (const kind of ["won", "lost"] as const) {
      const outcome = (await g.leadStages(ownerA())).find(
        (s) => s.kind === kind,
      )!;
      expect(await g.setLeadStageActive(ownerA(), outcome.id, false)).toEqual({
        ok: false,
        reason: "refused",
      });
    }
  });
});

describe.skipIf(!reachable)("switching stages and sources off", () => {
  it("keeps at least one active pipeline stage", async () => {
    const ordinary = (await g.leadStages(ownerA())).filter(
      (s) => s.kind === "active" && s.isActive,
    );
    // Switch all but the last one off, which must succeed.
    for (const stage of ordinary.slice(0, -1)) {
      expect(await g.setLeadStageActive(ownerA(), stage.id, false)).toEqual({
        ok: true,
      });
    }
    // The last one may not go: a new Lead would have nowhere to start (§32).
    const final = ordinary[ordinary.length - 1]!;
    expect(await g.setLeadStageActive(ownerA(), final.id, false)).toEqual({
      ok: false,
      reason: "refused",
    });

    for (const stage of ordinary.slice(0, -1)) {
      await g.setLeadStageActive(ownerA(), stage.id, true);
    }
  });

  it("frees a name for reuse once a source is switched off", async () => {
    const name = `Expo ${RUN}`;
    expect(await g.addLeadSource(ownerA(), name)).toEqual({ ok: true });
    expect(await g.addLeadSource(ownerA(), name)).toEqual({
      ok: false,
      reason: "name_taken",
    });

    const source = (await g.leadSources(ownerA())).find(
      (s) => s.name === name,
    )!;
    expect(await g.setLeadSourceActive(ownerA(), source.id, false)).toEqual({
      ok: true,
    });

    // §164 keeps the old row for history, and the name is free again.
    expect(await g.addLeadSource(ownerA(), name)).toEqual({ ok: true });
    const both = (await g.leadSources(ownerA())).filter((s) => s.name === name);
    expect(both).toHaveLength(2);
    expect(both.filter((s) => s.isActive)).toHaveLength(1);
  });

  it("refuses to reactivate a source whose name is taken again", async () => {
    const name = `Fair ${RUN}`;
    await g.addLeadSource(ownerA(), name);
    const first = (await g.leadSources(ownerA())).find((s) => s.name === name)!;
    await g.setLeadSourceActive(ownerA(), first.id, false);
    await g.addLeadSource(ownerA(), name);

    expect(await g.setLeadSourceActive(ownerA(), first.id, true)).toEqual({
      ok: false,
      reason: "name_taken",
    });
  });

  it("refuses a duplicate active stage name, case-insensitively", async () => {
    const stages = await g.leadStages(ownerA());
    const first = stages.find((s) => s.kind === "active")!;
    expect(await g.renameLeadStage(ownerA(), first.id, "WON")).toEqual({
      ok: false,
      reason: "name_taken",
    });
  });
});

describe.skipIf(!reachable)("what a Lead will later rely on", () => {
  it("offers a workspace-scoped composite key on both tables", async () => {
    /*
     * Not a uniqueness requirement — `id` is already the primary key. It is
     * the foreign-key TARGET that lets `leads` declare
     *   (workspace_id, stage_id) references (workspace_id, id)
     * so a Lead cannot reference another workspace's stage.
     */
    const rows = (await admin()`
      select conname from pg_constraint
       where conname in ('workspace_lead_stages_workspace_id_key',
                         'workspace_lead_sources_workspace_id_key')
         and contype = 'u'
       order by conname`) as unknown as { conname: string }[];
    expect(rows.map((r) => r.conname)).toEqual([
      "workspace_lead_sources_workspace_id_key",
      "workspace_lead_stages_workspace_id_key",
    ]);
  });

  it("now enforces stage occupancy, which this milestone could not", async () => {
    /*
     * §34 and §165 require that a stage holding active Leads cannot be
     * deactivated. Milestone 3A could not enforce that — there was no `leads`
     * table — and this test asserted the absence so the gap could not be
     * mistaken for coverage. Milestone 3B brought the table and the rule, so
     * the assertion is inverted rather than deleted: the guard trigger must
     * actually consult `public.leads`.
     *
     * The rule's behaviour is exercised in
     * `src/server/db/leads-isolation.db.test.ts`, which has Leads to occupy a
     * stage with. Here it is enough that the mechanism exists.
     */
    const exists = (await admin()`
      select to_regclass('public.leads')::text as t`) as unknown as {
      t: string | null;
    }[];
    expect(exists[0]?.t).toBe("leads");

    const guard = (await admin()`
      select p.prosrc like '%public.leads%' as checks_occupancy
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'workspace_lead_stages_guard_row'`) as unknown as {
      checks_occupancy: boolean;
    }[];
    expect(guard[0]?.checks_occupancy).toBe(true);
  });
});
