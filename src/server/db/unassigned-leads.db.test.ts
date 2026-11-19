import { randomUUID } from "node:crypto";

import postgres from "postgres";

import { testTls } from "@/test/db-tls";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertMatchedDatabaseTargets } from "../../../scripts/database-target.mjs";
import {
  cleanupTenantFixture,
  createTenantFixture,
  type TenantFixture,
} from "@/test/fixtures/tenant-fixture";

/**
 * Milestone 5A — Unassigned Leads become representable (§26, §32, §160, §162,
 * §162.1, §163, §163.9, §163.13).
 *
 * The whole slice is about one value the schema could not previously hold, so
 * almost nothing here can be asserted without a database:
 *
 *   * **Three-valued logic in RLS.** `all_records OR owner = me` evaluates to
 *     NULL for a Staff/Sales caller looking at an Unassigned Lead, and only
 *     PostgreSQL decides what a policy does with NULL. The claim that it
 *     fails closed is a claim about the engine, not about this code.
 *   * **The same predicate inside PL/pgSQL fails OPEN**, because `if not
 *     (null)` does not fire. That was a real defect in the 3D routine the
 *     moment the column became nullable, and this suite is where it is held
 *     down.
 *   * **The relaxed §163.13 constraint** still has to refuse the two things
 *     it always refused, which is a constraint's behaviour and not a type.
 *   * **§160's count** must keep ignoring a Lead nobody owns, and must keep
 *     refusing to answer for a caller who may not ask.
 *
 * What this suite deliberately does NOT assert: that anything creates an
 * Unassigned Lead. Nothing does. Every fixture below writes NULL past the
 * gateway, as the tooling role, precisely because no application path can.
 */

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

const probe = async (url: string): Promise<postgres.Sql | undefined> => {
  if (!url) return undefined;
  const candidate = postgres(url, {
    ...testTls(),
    max: 4,
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
    '[test:db] the unassigned-leads suite needs both connections. Run "npm run test:db:local".',
  );
}

const admin = () => {
  if (!tooling) throw new Error("no tooling connection");
  return tooling;
};

const RUN = randomUUID().slice(0, 8);
let fixture: TenantFixture;
let recorded: Awaited<ReturnType<typeof createTenantFixture>>["recorded"];
let firstStage = "";

type Gateways = {
  createTenantContext: typeof import("./tenant-context").createTenantContext;
  reassignLead: typeof import("@/server/auth/workspace-leads").reassignLead;
  listLeads: typeof import("@/server/auth/workspace-leads").listLeads;
  leadDetail: typeof import("@/server/auth/workspace-leads").leadDetail;
  leadActivity: typeof import("@/server/auth/workspace-leads").leadActivity;
  countLeadsOwnedBy: typeof import("@/server/auth/workspace-leads").countLeadsOwnedBy;
  deactivateMember: typeof import("@/server/auth/workspace-members").deactivateMember;
  runtimeSql: typeof import("./client").runtimeSql;
};
let g: Gateways;

let phoneCounter = 0;
const freshPhone = () => `+9183${String(++phoneCounter).padStart(8, "0")}`;

beforeAll(async () => {
  if (!reachable) return;
  ({ fixture, recorded } = await createTenantFixture(admin(), RUN));
  /*
   * All three kinds, not just the one this suite uses. §34 holds a workspace
   * to exactly one Won and one Lost stage through a deferred constraint, so
   * a pipeline with only an active stage is refused at COMMIT — the fixture
   * has to be a legal pipeline before it can be a convenient one.
   */
  const rows = (await admin()`
    insert into public.workspace_lead_stages
      (workspace_id, name, sort_order, kind)
    values
      (${fixture.workspaceA}, ${`New ${RUN}`}, 1, 'active'),
      (${fixture.workspaceA}, ${`Won ${RUN}`}, 90, 'won'),
      (${fixture.workspaceA}, ${`Lost ${RUN}`}, 91, 'lost')
    returning id, kind::text as kind
  `) as unknown as { id: string; kind: string }[];
  firstStage = rows.find((row) => row.kind === "active")!.id;

  const [context, leads, client, members] = await Promise.all([
    import("./tenant-context"),
    import("@/server/auth/workspace-leads"),
    import("./client"),
    import("@/server/auth/workspace-members"),
  ]);
  g = {
    createTenantContext: context.createTenantContext,
    runtimeSql: client.runtimeSql,
    reassignLead: leads.reassignLead,
    listLeads: leads.listLeads,
    leadDetail: leads.leadDetail,
    leadActivity: leads.leadActivity,
    countLeadsOwnedBy: leads.countLeadsOwnedBy,
    deactivateMember: members.deactivateMember,
  };
  await admin()`
    update public.workspaces
       set manager_record_scope = null, permissions_granted = '{}'
     where id = ${fixture.workspaceA}`;
}, 30_000);

afterAll(async () => {
  if (reachable && recorded) {
    for (const workspace of recorded.workspaces) {
      for (const statement of [
        admin()`delete from public.lead_activities where workspace_id = ${workspace}`,
        admin()`delete from public.leads where workspace_id = ${workspace}`,
        admin()`delete from public.workspace_lead_stages where workspace_id = ${workspace}`,
      ]) {
        await statement.catch((error: unknown) =>
          console.error("[unassigned] cleanup:", error),
        );
      }
    }
    const problems = await cleanupTenantFixture(admin(), recorded);
    if (problems.length > 0) {
      console.error("[unassigned] cleanup problems:", problems);
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

const setScope = (scope: string | null) =>
  admin()`
    update public.workspaces set manager_record_scope = ${scope}
     where id = ${fixture.workspaceA}`;

/**
 * A Lead with the owner given, or Unassigned when it is null.
 *
 * Written as the tooling role on purpose. No application path produces NULL
 * in this slice, and a fixture that pretended otherwise would be testing a
 * workflow that does not exist.
 */
async function seedLead(ownerProfileId: string | null) {
  const phone = freshPhone();
  const [row] = (await admin()`
    insert into public.leads
      (workspace_id, name, phone, phone_normalised, stage_id,
       record_owner_user_profile_id, created_by_user_profile_id)
    values (${fixture.workspaceA}, ${`Lead ${randomUUID().slice(0, 6)}`},
            ${phone}, ${phone}, ${firstStage},
            ${ownerProfileId}, ${fixture.owner.userProfileId})
    returning id, revision`) as unknown as {
    id: string;
    revision: number;
  }[];
  return row!;
}

const ownerOf = async (leadId: string): Promise<string | null> => {
  const [row] = (await admin()`
    select record_owner_user_profile_id as owner from public.leads
     where id = ${leadId}`) as unknown as { owner: string | null }[];
  return row!.owner;
};

describe.skipIf(!reachable)("the column admits an Unassigned Lead", () => {
  it("stores a Lead with no Record Owner and leaves existing owners alone", async () => {
    const assigned = await seedLead(fixture.shared.userProfileId);
    const unassigned = await seedLead(null);

    expect(await ownerOf(unassigned.id)).toBeNull();
    expect(await ownerOf(assigned.id)).toBe(fixture.shared.userProfileId);
  });

  it("still refuses a Lead created through the runtime role with no owner", async () => {
    /*
     * §32 and the 5A boundary: a nullable column is not a creation path. The
     * insert policy pins the Record Owner to the creator, so the runtime role
     * cannot file an Unassigned Lead even though the column would hold one.
     */
    const phone = freshPhone();
    await expect(
      g.runtimeSql()`
        insert into public.leads
          (workspace_id, name, phone, phone_normalised, stage_id,
           record_owner_user_profile_id, created_by_user_profile_id)
        values (${fixture.workspaceA}, ${`Nope ${RUN}`}, ${phone}, ${phone},
                ${firstStage}, null, ${fixture.owner.userProfileId})`,
    ).rejects.toThrow();
  });
});

describe.skipIf(!reachable)("§162.1 access to an Unassigned Lead", () => {
  it("shows it to an Owner/Admin", async () => {
    const lead = await seedLead(null);
    const detail = await g.leadDetail(ownerA(), lead.id);
    expect(detail?.id).toBe(lead.id);
    expect(detail?.recordOwnerUserProfileId).toBeNull();
    expect(detail?.isOwnedByActor).toBe(false);
  });

  it("hides it from a Staff/Sales user, who owns nothing of it", async () => {
    /*
     * The three-valued-logic case. `false OR (null = me)` is NULL, and RLS
     * admits a row only on TRUE. If this ever returns the row, every
     * Unassigned Lead in the workspace became readable by everyone.
     */
    const lead = await seedLead(null);
    expect(await g.leadDetail(staffA(), lead.id)).toBeNull();

    const page = await g.listLeads(staffA(), { scope: "all" });
    expect(page.items.some((item) => item.id === lead.id)).toBe(false);
  });

  it("hides it from a Manager scoped to their own records, and shows it to an All-Records Manager", async () => {
    const lead = await seedLead(null);

    await setScope("own_assigned_shared");
    expect(await g.leadDetail(managerA(), lead.id)).toBeNull();

    await setScope("all_records");
    expect((await g.leadDetail(managerA(), lead.id))?.id).toBe(lead.id);

    await setScope(null);
  });

  it("keeps an owned Lead visible to its owner", async () => {
    /* The other half: 5A must not have narrowed anything. */
    const lead = await seedLead(fixture.shared.userProfileId);
    expect((await g.leadDetail(staffA(), lead.id))?.id).toBe(lead.id);
    expect((await g.leadDetail(staffA(), lead.id))?.isOwnedByActor).toBe(true);
  });

  it('leaves an Unassigned Lead out of the "mine" scope for everyone', async () => {
    const lead = await seedLead(null);
    const mine = await g.listLeads(ownerA(), { scope: "mine" });
    expect(mine.items.some((item) => item.id === lead.id)).toBe(false);
  });
});

describe.skipIf(!reachable)("initial assignment from Unassigned", () => {
  it("lets an Owner/Admin assign it, and records history with no previous owner", async () => {
    const lead = await seedLead(null);

    const result = await g.reassignLead(
      ownerA(),
      lead.id,
      lead.revision,
      fixture.shared.userProfileId,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.previousOwnerUserProfileId).toBeNull();
    expect(await ownerOf(lead.id)).toBe(fixture.shared.userProfileId);

    const activity = await g.leadActivity(ownerA(), lead.id);
    const entry = activity.find((item) => item.kind === "owner_changed");
    expect(entry).toBeDefined();
    expect(entry?.fromOwnerUserProfileId).toBeNull();
    expect(entry?.toOwnerUserProfileId).toBe(fixture.shared.userProfileId);
  });

  it("refuses a Staff/Sales user, rather than falling through a NULL check", async () => {
    /*
     * The defect this slice had to fix. Written as `if not (all_records or
     * owner = me)`, an Unassigned Lead gave `not (false or null)` = NULL, the
     * guard did not fire and the routine continued to the write — a
     * Staff/Sales user assigning a Lead they cannot even see.
     */
    const lead = await seedLead(null);
    const result = await g.reassignLead(
      staffA(),
      lead.id,
      lead.revision,
      fixture.shared.userProfileId,
    );
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
    expect(await ownerOf(lead.id)).toBeNull();
  });

  it("refuses a Manager who may change owners but is scoped to their own records", async () => {
    /*
     * Both halves are needed, and they are different questions: §162 says
     * this Manager MAY change a Record Owner, §162.1 says they may not reach
     * this record. The second one is what must refuse.
     */
    await admin()`
      update public.workspaces
         set permissions_granted = '{change_record_owner}',
             manager_record_scope = 'own_assigned_shared'
       where id = ${fixture.workspaceA}`;

    const lead = await seedLead(null);
    const result = await g.reassignLead(
      managerA(),
      lead.id,
      lead.revision,
      fixture.shared.userProfileId,
    );
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
    expect(await ownerOf(lead.id)).toBeNull();

    await admin()`
      update public.workspaces
         set permissions_granted = '{}', manager_record_scope = null
       where id = ${fixture.workspaceA}`;
  });

  it("refuses an inactive recipient, as it does for a transfer", async () => {
    const lead = await seedLead(null);
    await admin()`
      update public.workspace_memberships set status = 'inactive'
       where workspace_id = ${fixture.workspaceA}
         and user_profile_id = ${fixture.shared.userProfileId}`;

    const result = await g.reassignLead(
      ownerA(),
      lead.id,
      lead.revision,
      fixture.shared.userProfileId,
    );
    expect(result).toEqual({ ok: false, reason: "recipient_inactive" });
    expect(await ownerOf(lead.id)).toBeNull();

    await admin()`
      update public.workspace_memberships set status = 'active'
       where workspace_id = ${fixture.workspaceA}
         and user_profile_id = ${fixture.shared.userProfileId}`;
  });

  it("refuses a stale revision", async () => {
    const lead = await seedLead(null);
    const result = await g.reassignLead(
      ownerA(),
      lead.id,
      lead.revision + 1,
      fixture.shared.userProfileId,
    );
    expect(result).toEqual({ ok: false, reason: "stale" });
    expect(await ownerOf(lead.id)).toBeNull();
  });
});

describe.skipIf(!reachable)("the existing transfer is unchanged", () => {
  it("still moves a Lead between two owners and names both ends", async () => {
    const lead = await seedLead(fixture.shared.userProfileId);
    const result = await g.reassignLead(
      ownerA(),
      lead.id,
      lead.revision,
      fixture.manager.userProfileId,
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.previousOwnerUserProfileId).toBe(
      fixture.shared.userProfileId,
    );

    const activity = await g.leadActivity(ownerA(), lead.id);
    const entry = activity.find((item) => item.kind === "owner_changed");
    expect(entry?.fromOwnerUserProfileId).toBe(fixture.shared.userProfileId);
    expect(entry?.toOwnerUserProfileId).toBe(fixture.manager.userProfileId);
  });

  it('still answers "unchanged" when the chosen owner already holds it', async () => {
    const lead = await seedLead(fixture.shared.userProfileId);
    const result = await g.reassignLead(
      ownerA(),
      lead.id,
      lead.revision,
      fixture.shared.userProfileId,
    );
    expect(result).toEqual({ ok: false, reason: "unchanged" });
  });
});

describe.skipIf(!reachable)("§163.13 still refuses a meaningless entry", () => {
  const insertEntry = (
    from: string | null,
    to: string | null,
    leadId: string,
  ) =>
    admin()`
      insert into public.lead_activities
        (workspace_id, lead_id, kind, actor_user_profile_id,
         from_owner_user_profile_id, to_owner_user_profile_id)
      values (${fixture.workspaceA}, ${leadId}, 'owner_changed',
              ${fixture.owner.userProfileId}, ${from}, ${to})`;

  it("accepts a first assignment, with no previous owner", async () => {
    const lead = await seedLead(null);
    await expect(
      insertEntry(null, fixture.shared.userProfileId, lead.id),
    ).resolves.toBeDefined();
  });

  it("refuses an entry that assigns nobody", async () => {
    const lead = await seedLead(null);
    await expect(insertEntry(null, null, lead.id)).rejects.toThrow();
  });

  it("refuses a transfer whose two ends are the same person", async () => {
    const lead = await seedLead(fixture.shared.userProfileId);
    await expect(
      insertEntry(
        fixture.shared.userProfileId,
        fixture.shared.userProfileId,
        lead.id,
      ),
    ).rejects.toThrow();
  });
});

describe.skipIf(!reachable)("§160 deactivation", () => {
  it("does not count an Unassigned Lead against anybody", async () => {
    const before = await g.countLeadsOwnedBy(
      ownerA(),
      fixture.shared.userProfileId,
    );
    await seedLead(null);
    const after = await g.countLeadsOwnedBy(
      ownerA(),
      fixture.shared.userProfileId,
    );
    expect(after).toBe(before);
  });

  it("still refuses to answer for a caller who is not an active Owner/Admin", async () => {
    /*
     * The fail-closed half, unchanged by 5A and asserted here because a
     * nullable owner is exactly the sort of change that tempts a `?? 0`.
     * Null is not zero, and a caller that read it as zero would deactivate
     * someone who still owns work.
     */
    expect(
      await g.countLeadsOwnedBy(staffA(), fixture.shared.userProfileId),
    ).toBeNull();
  });

  it("still blocks deactivating someone who owns a Lead", async () => {
    await seedLead(fixture.shared.userProfileId);
    const result = await g.deactivateMember(
      ownerA(),
      fixture.shared.userProfileId,
    );
    expect(result).toEqual({ ok: false, reason: "blocked" });
  });
});
