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
 * The stage lock order, against pipeline configuration (§34, §165).
 *
 * A Lead stage move writes a §39 entry naming the stage it left and the one
 * it arrived at. Each of those references takes its own `FOR KEY SHARE` on
 * the stage row, and `FOR KEY SHARE` conflicts with the `FOR UPDATE` the
 * pipeline takes when a stage is added or reordered.
 *
 * With only the DESTINATION locked, the move acquired the two stages in an
 * order decided by which happened to be the target — descending whenever the
 * old stage sorted lower — while the pipeline acquires every stage ascending
 * by id. Opposite orders, so `40P01 deadlock detected`. The first test here
 * reproduces that shape directly; the second drives the real gateway through
 * the same collision and requires it not to deadlock.
 */

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

const probe = async (url: string): Promise<postgres.Sql | undefined> => {
  if (!url) return undefined;
  const candidate = postgres(url, {
    max: 5,
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
    '[test:db] the stage locking suite needs both connections. Run "npm run test:db:local".',
  );
}

const admin = () => {
  if (!tooling) throw new Error("no tooling connection");
  return tooling;
};

const RUN = randomUUID().slice(0, 8);
let fixture: TenantFixture;
let recorded: Awaited<ReturnType<typeof createTenantFixture>>["recorded"];
let stages: { id: string; name: string; kind: string }[] = [];

type Gateways = {
  createTenantContext: typeof import("./tenant-context").createTenantContext;
  changeLeadStage: typeof import("@/server/auth/workspace-leads").changeLeadStage;
  leadActivity: typeof import("@/server/auth/workspace-leads").leadActivity;
  addLeadStage: typeof import("@/server/auth/workspace-lead-pipeline").addLeadStage;
  runtimeSql: typeof import("./client").runtimeSql;
};
let g: Gateways;

beforeAll(async () => {
  if (!reachable) return;
  ({ fixture, recorded } = await createTenantFixture(admin(), RUN));
  stages = (await admin()`
    insert into public.workspace_lead_stages
      (workspace_id, name, sort_order, kind)
    values
      (${fixture.workspaceA}, ${`New ${RUN}`}, 1, 'active'),
      (${fixture.workspaceA}, ${`Contacted ${RUN}`}, 2, 'active'),
      (${fixture.workspaceA}, ${`Won ${RUN}`}, 90, 'won'),
      (${fixture.workspaceA}, ${`Lost ${RUN}`}, 91, 'lost')
    returning id, name, kind::text as kind
  `) as unknown as { id: string; name: string; kind: string }[];

  const [context, leads, pipeline, client] = await Promise.all([
    import("./tenant-context"),
    import("@/server/auth/workspace-leads"),
    import("@/server/auth/workspace-lead-pipeline"),
    import("./client"),
  ]);
  g = {
    createTenantContext: context.createTenantContext,
    changeLeadStage: leads.changeLeadStage,
    leadActivity: leads.leadActivity,
    addLeadStage: pipeline.addLeadStage,
    runtimeSql: client.runtimeSql,
  };
}, 30_000);

afterAll(async () => {
  if (reachable && recorded) {
    for (const workspace of recorded.workspaces) {
      for (const statement of [
        admin()`delete from public.lead_activities where workspace_id = ${workspace}`,
        admin()`delete from public.leads where workspace_id = ${workspace}`,
        admin()`delete from public.workspace_lead_stages where workspace_id = ${workspace}`,
        admin()`delete from public.workspace_lead_sources where workspace_id = ${workspace}`,
      ]) {
        await statement.catch((error: unknown) =>
          console.error("[stage locking] cleanup:", error),
        );
      }
    }
    const problems = await cleanupTenantFixture(admin(), recorded);
    if (problems.length > 0) {
      console.error("[stage locking] cleanup problems:", problems);
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

const ownerA = () =>
  g.createTenantContext({
    authUserId: fixture.owner.authUserId,
    userProfileId: fixture.owner.userProfileId,
    workspaceId: fixture.workspaceA,
  });

/** The two ordinary stages, named by where their ids sort. */
const ordinary = () => {
  const open = stages.filter((s) => s.kind === "active");
  const sorted = [...open].sort((a, b) => (a.id < b.id ? -1 : 1));
  return { low: sorted[0]!, high: sorted[sorted.length - 1]! };
};

const seedLead = async (stageId: string) => {
  const phone = `+9184${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const [row] = (await admin()`
    insert into public.leads
      (workspace_id, name, phone, phone_normalised, stage_id,
       record_owner_user_profile_id, created_by_user_profile_id)
    values (${fixture.workspaceA}, ${`Lead ${randomUUID().slice(0, 6)}`},
            ${phone}, ${phone}, ${stageId},
            ${fixture.owner.userProfileId}, ${fixture.owner.userProfileId})
    returning id, revision`) as unknown as {
    id: string;
    revision: number;
  }[];
  return row!;
};

describe.skipIf(!reachable)("the shape of the old defect", () => {
  it("deadlocks when the two stages are taken in opposite orders", async () => {
    /*
     * Not the gateway — the raw shape, so the regression below is anchored
     * to something known to fail. One transaction takes the HIGH id then
     * the LOW; the other takes every stage ascending, as the pipeline does.
     */
    const { low, high } = ordinary();
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const descending = admin()
      .begin(async (tx) => {
        await tx`select id from public.workspace_lead_stages
                  where id = ${high.id} for update`;
        await held;
        await tx`select id from public.workspace_lead_stages
                  where id = ${low.id} for key share`;
        return "committed";
      })
      .then(
        (v) => v,
        (e: { code?: string }) => `aborted:${e.code}`,
      );

    await new Promise((resolve) => setTimeout(resolve, 250));
    const ascending = admin()
      .begin(async (tx) => {
        await tx`select id from public.workspace_lead_stages
                  where workspace_id = ${fixture.workspaceA}
                  order by id for update`;
        return "committed";
      })
      .then(
        (v) => v,
        (e: { code?: string }) => `aborted:${e.code}`,
      );

    await new Promise((resolve) => setTimeout(resolve, 400));
    release?.();

    const outcomes = [await descending, await ascending];
    // One of the two is chosen by PostgreSQL as the deadlock victim.
    expect(outcomes.filter((o) => o === "aborted:40P01")).toHaveLength(1);
  }, 25_000);
});

describe.skipIf(!reachable)(
  "a Lead stage move against pipeline configuration",
  () => {
    it("does not deadlock, whichever way the stage ids sort", async () => {
      /*
       * The regression. The Lead moves from the HIGH-id stage to the LOW-id
       * one, which is exactly the direction that used to acquire the pair
       * descending, while a pipeline insert locks every stage ascending.
       * Both must finish.
       */
      const { low, high } = ordinary();
      const lead = await seedLead(high.id);

      const moving = g
        .changeLeadStage(ownerA(), lead.id, lead.revision, low.id)
        .then(
          (r) => (r.ok ? "moved" : `refused:${r.reason}`),
          (e: { message?: string }) => `threw:${e.message}`,
        );
      const configuring = g.addLeadStage(ownerA(), `Qualified ${RUN}`).then(
        (r) => (r.ok ? "added" : `refused:${r.reason}`),
        (e: { message?: string }) => `threw:${e.message}`,
      );

      const [moveOutcome, configureOutcome] = await Promise.all([
        moving,
        configuring,
      ]);

      // Neither may abort, and neither may be reported as unavailable —
      // that is the word a deadlock would have produced.
      expect(moveOutcome).toBe("moved");
      expect(configureOutcome).toBe("added");

      const [row] = (await admin()`
        select stage_id from public.leads where id = ${lead.id}`) as unknown as {
        stage_id: string;
      }[];
      expect(row!.stage_id).toBe(low.id);

      const entry = (await g.leadActivity(ownerA(), lead.id))[0];
      expect(entry!.kind).toBe("stage_changed");
      expect(entry!.fromStageName).toBe(high.name);
      expect(entry!.toStageName).toBe(low.name);

      await admin()`
        delete from public.workspace_lead_stages
         where workspace_id = ${fixture.workspaceA}
           and name = ${`Qualified ${RUN}`}`;
    }, 25_000);

    it("locks both stages, in ascending id order", async () => {
      /*
       * The rule itself, read out of the gateway rather than inferred. A
       * move that locked only its destination would pass the test above by
       * luck of timing on a quiet machine.
       */
      const { readFile } = await import("node:fs/promises");
      const source = await readFile(
        "src/server/auth/workspace-leads.ts",
        "utf8",
      );
      expect(source).toMatch(/lockStagesInOrder\(tx, \[\s*seen\.stage_id,/);
      expect(source).toMatch(/\[\.\.\.new Set\(stageIds\)\]\.sort\(\)/);
    });
  },
);
