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
 * Milestone 3D — manual Record Owner reassignment (§26, §49, §160, §162,
 * §162.1, §163.10, §163.13).
 *
 * What a real database is needed for, and a unit test could not say:
 *
 *   * §162's Change Record Owner enforced INDEPENDENTLY of edit permission —
 *     a Staff/Sales user holds `edit_permitted_records` and must still be
 *     refused, including through a direct runtime call that never passes
 *     through the action layer;
 *   * a Manager scoped to their own records keeping the permission the
 *     workspace configured, which `leads_edit_update`'s WITH CHECK would
 *     otherwise have taken away;
 *   * the runtime role still holding no grant to write the owner column, so
 *     the routine is the only path;
 *   * the §163.13 entry naming owners the transfer actually moved;
 *   * the §160 invariant in BOTH orders, which only shows itself when two
 *     transactions really race.
 */

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

const probe = async (url: string): Promise<postgres.Sql | undefined> => {
  if (!url) return undefined;
  const candidate = postgres(url, {
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
    '[test:db] the reassignment suite needs both connections. Run "npm run test:db:local".',
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
let firstStage = "";

type Gateways = {
  createTenantContext: typeof import("./tenant-context").createTenantContext;
  reassignLead: typeof import("@/server/auth/workspace-leads").reassignLead;
  setPermissionGranted: typeof import("@/server/auth/workspace-permissions").setPermissionGranted;
  assignableMembers: typeof import("@/server/auth/workspace-leads").assignableMembers;
  leadActivity: typeof import("@/server/auth/workspace-leads").leadActivity;
  leadDetail: typeof import("@/server/auth/workspace-leads").leadDetail;
  leadForEdit: typeof import("@/server/auth/workspace-leads").leadForEdit;
  deactivateMember: typeof import("@/server/auth/workspace-members").deactivateMember;
  runtimeSql: typeof import("./client").runtimeSql;
};
let g: Gateways;

let phoneCounter = 0;
const freshPhone = () => `+9182${String(++phoneCounter).padStart(8, "0")}`;

beforeAll(async () => {
  if (!reachable) return;
  ({ fixture, recorded } = await createTenantFixture(admin(), RUN));
  const rows = (await admin()`
    insert into public.workspace_lead_stages
      (workspace_id, name, sort_order, kind)
    values
      (${fixture.workspaceA}, ${`New ${RUN}`}, 1, 'active'),
      (${fixture.workspaceA}, ${`Won ${RUN}`}, 90, 'won'),
      (${fixture.workspaceA}, ${`Lost ${RUN}`}, 91, 'lost')
    returning id, kind::text as kind
  `) as unknown as { id: string; kind: string }[];
  firstStage = rows.find((r) => r.kind === "active")!.id;

  const [context, leads, client, members, permissions] = await Promise.all([
    import("./tenant-context"),
    import("@/server/auth/workspace-leads"),
    import("./client"),
    import("@/server/auth/workspace-members"),
    import("@/server/auth/workspace-permissions"),
  ]);
  g = {
    createTenantContext: context.createTenantContext,
    runtimeSql: client.runtimeSql,
    deactivateMember: members.deactivateMember,
    reassignLead: leads.reassignLead,
    setPermissionGranted: permissions.setPermissionGranted,
    assignableMembers: leads.assignableMembers,
    leadActivity: leads.leadActivity,
    leadDetail: leads.leadDetail,
    leadForEdit: leads.leadForEdit,
  };
}, 30_000);

afterAll(async () => {
  if (reachable && recorded) {
    for (const workspace of recorded.workspaces) {
      for (const statement of [
        admin()`delete from public.lead_activities where workspace_id = ${workspace}`,
        admin()`delete from public.lead_duplicate_overrides where workspace_id = ${workspace}`,
        admin()`delete from public.leads where workspace_id = ${workspace}`,
        admin()`delete from public.workspace_lead_stages where workspace_id = ${workspace}`,
        admin()`delete from public.workspace_lead_sources where workspace_id = ${workspace}`,
      ]) {
        await statement.catch((error: unknown) =>
          console.error("[reassignment] cleanup:", error),
        );
      }
    }
    const problems = await cleanupTenantFixture(admin(), recorded);
    if (problems.length > 0) {
      console.error("[reassignment] cleanup problems:", problems);
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

/** Set the workspace's §162/§162.1 configuration, as Settings would. */
async function configure(options: {
  scope?: string | null;
  granted?: string[];
}) {
  if (options.scope !== undefined) {
    await admin()`
      update public.workspaces set manager_record_scope = ${options.scope}
       where id = ${fixture.workspaceA}`;
  }
  if (options.granted !== undefined) {
    await admin()`
      update public.workspaces set permissions_granted = ${options.granted}
       where id = ${fixture.workspaceA}`;
  }
}

/** A Lead owned by whoever is named, seeded past the gateway. */
async function seedLead(ownerProfileId: string, stageId = firstStage) {
  const phone = freshPhone();
  const [row] = (await admin()`
    insert into public.leads
      (workspace_id, name, phone, phone_normalised, stage_id,
       record_owner_user_profile_id, created_by_user_profile_id)
    values (${fixture.workspaceA}, ${`Lead ${randomUUID().slice(0, 6)}`},
            ${phone}, ${phone}, ${stageId},
            ${ownerProfileId}, ${ownerProfileId})
    returning id, revision`) as unknown as {
    id: string;
    revision: number;
  }[];
  return row!;
}

const ownerOf = async (leadId: string): Promise<string> => {
  const [row] = (await admin()`
    select record_owner_user_profile_id as owner from public.leads
     where id = ${leadId}`) as unknown as { owner: string }[];
  return row!.owner;
};

const setStatus = (userProfileId: string, status: "active" | "inactive") =>
  admin()`
    update public.workspace_memberships set status = ${status}
     where workspace_id = ${fixture.workspaceA}
       and user_profile_id = ${userProfileId}`;

beforeAll(async () => {
  if (!reachable) return;
  await configure({ scope: null, granted: [] });
}, 30_000);

describe.skipIf(!reachable)("§162: who may reassign", () => {
  it("lets an Owner/Admin hand a Lead to any active member", async () => {
    const lead = await seedLead(fixture.owner.userProfileId);
    const result = await g.reassignLead(
      ownerA(),
      lead.id,
      lead.revision,
      fixture.shared.userProfileId,
    );
    expect(result.ok).toBe(true);
    expect(result.ok && result.previousOwnerUserProfileId).toBe(
      fixture.owner.userProfileId,
    );
    expect(await ownerOf(lead.id)).toBe(fixture.shared.userProfileId);
  });

  it("refuses a Staff/Sales user, who holds edit permission but not this", async () => {
    /*
     * The distinction §162 draws and this slice has to keep:
     * `edit_permitted_records` is ALLOW for all three roles, Change Record
     * Owner is DENY for Staff/Sales. Reaching the gateway directly skips the
     * action layer entirely, which is the point — the refusal has to come
     * from the database.
     */
    const lead = await seedLead(fixture.shared.userProfileId);
    const result = await g.reassignLead(
      staffA(),
      lead.id,
      lead.revision,
      fixture.owner.userProfileId,
    );
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
    expect(await ownerOf(lead.id)).toBe(fixture.shared.userProfileId);
  });

  it("refuses a Manager until the workspace grants it, then allows them", async () => {
    await configure({ granted: [] });
    const lead = await seedLead(fixture.manager.userProfileId);
    expect(
      await g.reassignLead(
        managerA(),
        lead.id,
        lead.revision,
        fixture.owner.userProfileId,
      ),
    ).toEqual({ ok: false, reason: "not_permitted" });

    await configure({ granted: ["change_record_owner"] });
    const after = await g.reassignLead(
      managerA(),
      lead.id,
      lead.revision,
      fixture.owner.userProfileId,
    );
    expect(after).toEqual({
      ok: true,
      retainsAccess: expect.any(Boolean),
      previousOwnerUserProfileId: fixture.manager.userProfileId,
    });
    expect(await ownerOf(lead.id)).toBe(fixture.owner.userProfileId);
    await configure({ granted: [] });
  });

  it("gives the runtime role no grant to write the owner column", async () => {
    // The 3B refusal still stands. The routine is the only path, which is
    // what makes "enforced independently of edit permission" true.
    const [row] = (await admin()`
      select has_column_privilege('limenzy_app', 'public.leads',
        'record_owner_user_profile_id', 'UPDATE') as may`) as unknown as {
      may: boolean;
    }[];
    expect(row!.may).toBe(false);
  });

  it("refuses a direct UPDATE of the owner through the runtime connection", async () => {
    const lead = await seedLead(fixture.owner.userProfileId);
    await expect(
      runtime().begin(async (tx) => {
        await tx`select set_config('app.auth_user_id', ${fixture.owner.authUserId}, true)`;
        await tx`select set_config('app.user_profile_id', ${fixture.owner.userProfileId}, true)`;
        await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
        await tx`
          update public.leads
             set record_owner_user_profile_id = ${fixture.shared.userProfileId}
           where id = ${lead.id}::uuid`;
      }),
    ).rejects.toThrow(/permission denied/i);
    expect(await ownerOf(lead.id)).toBe(fixture.owner.userProfileId);
  });
});

describe.skipIf(!reachable)(
  "§162.1: access is checked before the transfer",
  () => {
    it("lets a narrow-scope Manager hand on a Lead and lose sight of it", async () => {
      /*
       * The decision this slice was asked to preserve. `leads_edit_update`'s
       * WITH CHECK would refuse to move a Lead out of such a Manager's scope;
       * the routine checks §162.1 BEFORE the transfer instead, so losing
       * access afterwards is the result rather than a failure.
       */
      await configure({
        scope: "own_assigned_shared",
        granted: ["change_record_owner"],
      });
      const lead = await seedLead(fixture.manager.userProfileId);

      const before = await g.leadDetail(managerA(), lead.id);
      expect(before).not.toBeNull();

      const result = await g.reassignLead(
        managerA(),
        lead.id,
        lead.revision,
        fixture.owner.userProfileId,
      );
      expect(result.ok).toBe(true);
      expect(result.ok && result.retainsAccess).toBe(false);
      expect(await ownerOf(lead.id)).toBe(fixture.owner.userProfileId);
      expect(await g.leadDetail(managerA(), lead.id)).toBeNull();

      await configure({ scope: null, granted: [] });
    });

    it("refuses a Lead the actor cannot see in the first place", async () => {
      await configure({
        scope: "own_assigned_shared",
        granted: ["change_record_owner"],
      });
      const lead = await seedLead(fixture.owner.userProfileId);
      expect(
        await g.reassignLead(
          managerA(),
          lead.id,
          lead.revision,
          fixture.manager.userProfileId,
        ),
      ).toEqual({ ok: false, reason: "not_permitted" });
      expect(await ownerOf(lead.id)).toBe(fixture.owner.userProfileId);
      await configure({ scope: null, granted: [] });
    });

    it("answers a Lead in another workspace exactly as it answers one that is not there", async () => {
      const [row] = (await admin()`
      insert into public.leads
        (workspace_id, name, phone, phone_normalised, stage_id,
         record_owner_user_profile_id, created_by_user_profile_id)
      select ${fixture.workspaceB}, ${`In B ${RUN}`}, ${freshPhone()},
             ${freshPhone()}, s.id, ${fixture.shared.userProfileId},
             ${fixture.shared.userProfileId}
        from public.workspace_lead_stages s
       where s.workspace_id = ${fixture.workspaceB} and s.kind = 'active'
       limit 1
      returning id, revision`) as unknown as {
        id: string;
        revision: number;
      }[];
      if (!row) return; // workspace B has no pipeline in this fixture

      expect(
        await g.reassignLead(
          ownerA(),
          row.id,
          row.revision,
          fixture.owner.userProfileId,
        ),
      ).toEqual({ ok: false, reason: "not_permitted" });
    });
  },
);

describe.skipIf(!reachable)("§163.10: who may be handed a Lead", () => {
  it("offers every active member to a caller who may reassign", async () => {
    const members = await g.assignableMembers(ownerA());
    const ids = members.map((m) => m.userProfileId);
    expect(ids).toContain(fixture.owner.userProfileId);
    expect(ids).toContain(fixture.shared.userProfileId);
    expect(ids).toContain(fixture.manager.userProfileId);
    // The fixture's inactive member is not on offer.
    expect(ids).not.toContain(fixture.former.userProfileId);
    expect(members.every((m) => m.fullName.length > 0)).toBe(true);
  });

  it("offers nobody to a caller who may not reassign", async () => {
    // A picker, not a directory: Staff/Sales get an empty list rather than
    // the workspace roster.
    expect(await g.assignableMembers(staffA())).toEqual([]);
    await configure({ granted: [] });
    expect(await g.assignableMembers(managerA())).toEqual([]);
  });

  it("refuses an inactive recipient", async () => {
    await setStatus(fixture.manager.userProfileId, "inactive");
    const lead = await seedLead(fixture.owner.userProfileId);
    expect(
      await g.reassignLead(
        ownerA(),
        lead.id,
        lead.revision,
        fixture.manager.userProfileId,
      ),
    ).toEqual({ ok: false, reason: "recipient_inactive" });
    expect(await ownerOf(lead.id)).toBe(fixture.owner.userProfileId);
    await setStatus(fixture.manager.userProfileId, "active");
  });

  it("refuses somebody who is not a member of this workspace at all", async () => {
    const lead = await seedLead(fixture.owner.userProfileId);
    expect(
      await g.reassignLead(
        ownerA(),
        lead.id,
        lead.revision,
        "00000000-0000-4000-8000-000000000000",
      ),
    ).toEqual({ ok: false, reason: "unknown_recipient" });
  });
});

describe.skipIf(!reachable)("§163.13: what the transfer records", () => {
  it("writes one entry naming the owners the transfer actually moved", async () => {
    const lead = await seedLead(fixture.owner.userProfileId);
    expect(
      (
        await g.reassignLead(
          ownerA(),
          lead.id,
          lead.revision,
          fixture.shared.userProfileId,
        )
      ).ok,
    ).toBe(true);

    const [entry] = await g.leadActivity(ownerA(), lead.id);
    expect(entry!.kind).toBe("owner_changed");
    // Newest first, with 3C's creation entry still beneath it.
    expect(
      (await g.leadActivity(ownerA(), lead.id)).map((e) => e.kind),
    ).toEqual(["owner_changed", "record_created"]);
    expect(entry!.fromOwnerUserProfileId).toBe(fixture.owner.userProfileId);
    expect(entry!.toOwnerUserProfileId).toBe(fixture.shared.userProfileId);
    expect(entry!.actorUserProfileId).toBe(fixture.owner.userProfileId);
  });

  it("stamps it with the revision the transfer produced", async () => {
    const lead = await seedLead(fixture.owner.userProfileId);
    await g.reassignLead(
      ownerA(),
      lead.id,
      lead.revision,
      fixture.shared.userProfileId,
    );
    const [row] = (await admin()`
      select a.lead_revision, l.revision from public.lead_activities a
        join public.leads l on l.id = a.lead_id
       where a.lead_id = ${lead.id} and a.kind = 'owner_changed'`) as unknown as {
      lead_revision: number;
      revision: number;
    }[];
    expect(row!.lead_revision).toBe(row!.revision);
    expect(row!.revision).toBe(lead.revision + 1);
  });

  it("records nothing when the chosen owner is the current one", async () => {
    const lead = await seedLead(fixture.owner.userProfileId);
    expect(
      await g.reassignLead(
        ownerA(),
        lead.id,
        lead.revision,
        fixture.owner.userProfileId,
      ),
    ).toEqual({ ok: false, reason: "unchanged" });
    // 3C writes a creation entry for every Lead, so the claim is that no
    // TRANSFER was recorded — not that the timeline is empty.
    expect(
      (await g.leadActivity(ownerA(), lead.id)).map((e) => e.kind),
    ).toEqual(["record_created"]);
    const [row] = (await admin()`
      select revision from public.leads where id = ${lead.id}`) as unknown as {
      revision: number;
    }[];
    expect(row!.revision).toBe(lead.revision);
  });

  it("refuses a stale revision and moves nothing", async () => {
    const lead = await seedLead(fixture.owner.userProfileId);
    expect(
      await g.reassignLead(
        ownerA(),
        lead.id,
        lead.revision + 7,
        fixture.shared.userProfileId,
      ),
    ).toEqual({ ok: false, reason: "stale" });
    expect(await ownerOf(lead.id)).toBe(fixture.owner.userProfileId);
    expect(
      (await g.leadActivity(ownerA(), lead.id)).map((e) => e.kind),
    ).toEqual(["record_created"]);
  });

  it("allows a Won or Lost Lead to be handed on", async () => {
    /*
     * §50 makes an ARCHIVED Lead unavailable for assignment; §45 and §48
     * say no such thing, and §160 would be unsatisfiable if they did —
     * somebody owning only closed Leads could never be deactivated.
     */
    const [won] = (await admin()`
      select id from public.workspace_lead_stages
       where workspace_id = ${fixture.workspaceA} and kind = 'won'`) as unknown as {
      id: string;
    }[];
    const lead = await seedLead(fixture.owner.userProfileId, won!.id);
    const result = await g.reassignLead(
      ownerA(),
      lead.id,
      lead.revision,
      fixture.shared.userProfileId,
    );
    expect(result.ok).toBe(true);
    expect(await ownerOf(lead.id)).toBe(fixture.shared.userProfileId);
  });

  it("keeps the history append-only for the support role as well", async () => {
    const [row] = (await admin()`
      select has_table_privilege('limenzy_lead_support',
               'public.lead_activities', 'UPDATE') as upd,
             has_table_privilege('limenzy_lead_support',
               'public.lead_activities', 'DELETE') as del`) as unknown as {
      upd: boolean;
      del: boolean;
    }[];
    expect(row).toEqual({ upd: false, del: false });
  });
});

describe.skipIf(!reachable)(
  "§160: a transfer and a deactivation cannot pass each other",
  () => {
    /**
     * The invariant, in BOTH orders.
     *
     * §160 says a person's responsibilities must be reassigned before they
     * are deactivated. A transfer hands a Lead TO somebody; a deactivation
     * takes that same person's membership row. Whichever commits first, the
     * other must see it — so no interleaving can leave an inactive person
     * newly owning a Lead.
     *
     * Driven with real transactions rather than mocks, because the
     * interleaving is the whole claim. The lock order under test is the one
     * `app.set_member_status` already uses — active Owner/Admin rows
     * ascending, then the rest — which is why the transfer takes that set
     * first even when it needs none of those rows.
     */
    const settings = async (
      tx: postgres.TransactionSql,
      user: { authUserId: string; userProfileId: string },
    ) => {
      await tx`select set_config('app.auth_user_id', ${user.authUserId}, true)`;
      await tx`select set_config('app.user_profile_id', ${user.userProfileId}, true)`;
      await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
    };

    /** The recipient starts active and owning nothing, every time. */
    const resetRecipient = async () => {
      await setStatus(fixture.manager.userProfileId, "active");
      await admin()`
        delete from public.lead_activities a
         using public.leads l
         where a.workspace_id = l.workspace_id and a.lead_id = l.id
           and l.workspace_id = ${fixture.workspaceA}
           and l.record_owner_user_profile_id = ${fixture.manager.userProfileId}`;
      await admin()`
        delete from public.leads
         where workspace_id = ${fixture.workspaceA}
           and record_owner_user_profile_id = ${fixture.manager.userProfileId}`;
      await configure({ scope: null, granted: [] });
    };

    it("order A: the transfer commits first, so the deactivation is blocked", async () => {
      await resetRecipient();
      const lead = await seedLead(fixture.owner.userProfileId);

      let release: (() => void) | undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });

      // The transfer, holding its locks open after the write.
      const transferring = runtime()
        .begin(async (tx) => {
          await settings(tx, fixture.owner);
          const [row] = await tx<{ outcome: string }[]>`
            select outcome from app.reassign_lead_owner(
              ${lead.id}::uuid, ${fixture.manager.userProfileId}::uuid,
              ${lead.revision}::integer)`;
          if (row?.outcome !== "ok")
            throw new Error(`transfer: ${row?.outcome}`);
          await held;
        })
        .then(
          () => "transferred" as const,
          (error: { message?: string }) => `refused:${error.message ?? "?"}`,
        );

      await new Promise((resolve) => setTimeout(resolve, 250));
      const deactivating = (async () => {
        const result = await g.deactivateMember(
          ownerA(),
          fixture.manager.userProfileId,
        );
        return result.ok ? "deactivated" : `refused:${result.reason}`;
      })();

      await new Promise((resolve) => setTimeout(resolve, 250));
      release?.();

      expect(await transferring).toBe("transferred");
      // It waited, counted the Lead it had just been handed, and rolled back.
      expect(await deactivating).toBe("refused:blocked");

      const [member] = (await admin()`
        select status::text as status from public.workspace_memberships
         where workspace_id = ${fixture.workspaceA}
           and user_profile_id = ${fixture.manager.userProfileId}`) as unknown as {
        status: string;
      }[];
      // The invariant, stated directly.
      expect(`${member!.status}/${await ownerOf(lead.id)}`).toBe(
        `active/${fixture.manager.userProfileId}`,
      );
      await resetRecipient();
    }, 25_000);

    it("order B: the deactivation commits first, so the transfer is refused", async () => {
      await resetRecipient();
      const lead = await seedLead(fixture.owner.userProfileId);

      let release: (() => void) | undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });

      // The deactivation, holding the recipient's row open.
      const deactivating = runtime()
        .begin(async (tx) => {
          await settings(tx, fixture.owner);
          const [row] = await tx<{ outcome: string }[]>`
            select app.set_member_status(
              ${fixture.manager.userProfileId}::uuid, 'inactive') as outcome`;
          if (row?.outcome !== "ok") throw new Error(`status: ${row?.outcome}`);
          await held;
        })
        .then(
          () => "deactivated" as const,
          (error: { message?: string }) => `refused:${error.message ?? "?"}`,
        );

      await new Promise((resolve) => setTimeout(resolve, 250));
      const transferring = g.reassignLead(
        ownerA(),
        lead.id,
        lead.revision,
        fixture.manager.userProfileId,
      );

      await new Promise((resolve) => setTimeout(resolve, 250));
      release?.();

      expect(await deactivating).toBe("deactivated");
      // It queued on the recipient's row, then read the committed status.
      expect(await transferring).toEqual({
        ok: false,
        reason: "recipient_inactive",
      });
      expect(await ownerOf(lead.id)).toBe(fixture.owner.userProfileId);
      await resetRecipient();
    }, 25_000);

    it("takes the Owner/Admin set before any other membership row", async () => {
      /*
       * The ordering rule itself, read out of the routine rather than
       * inferred from its behaviour. Sorting the three rows it touches would
       * NOT be enough on its own: `app.set_member_status` locks every active
       * Owner/Admin row first, so a transfer that reached a non-owner row
       * before them could hold one while waiting for another — a cycle.
       */
      const [row] = (await admin()`
        select p.prosrc from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'app' and p.proname = 'reassign_lead_owner'`) as unknown as {
        prosrc: string;
      }[];
      const ownerLock = row!.prosrc.indexOf("role   = 'owner_admin'");
      const otherLock = row!.prosrc.indexOf("user_profile_id in (");
      expect(ownerLock).toBeGreaterThan(-1);
      expect(otherLock).toBeGreaterThan(-1);
      expect(ownerLock).toBeLessThan(otherLock);
      // Both ordered, so two transfers cannot take the same rows in
      // opposite orders either.
      expect(row!.prosrc.match(/order by user_profile_id/g)).toHaveLength(2);
    });
  },
);

describe.skipIf(!reachable)("3D's security surface, audited", () => {
  /**
   * What the widened policies do and do not reach.
   *
   * 3D gave `limenzy_lead_support` workspace-scoped reads and a
   * workspace-scoped LOCK on memberships, member names, two workspace
   * columns, one Lead column and a history read. PostgreSQL ORs permissive
   * policies, so each of those widenings applies to EVERY routine the role
   * owns — including the four 3B wrote. These check that none of them
   * started answering a wider question.
   */

  it("leaves the pre-existing routines answering exactly what they did", async () => {
    await configure({ scope: null, granted: [] });
    const seat = ctx(fixture.shared, fixture.workspaceA); // staff_sales

    // §160's count still refuses anyone who is not an active Owner/Admin,
    // rather than quietly answering now that the role can read more.
    const { countLeadsOwnedBy, recordOwnerNames } =
      await import("@/server/auth/workspace-leads");
    expect(
      await countLeadsOwnedBy(seat, fixture.owner.userProfileId),
    ).toBeNull();

    // The co-member name routine is owned by a DIFFERENT role and is scoped
    // by record access, so a Staff/Sales user still gets their own name only.
    const names = await recordOwnerNames(seat);
    expect([...names.keys()]).toEqual([fixture.shared.userProfileId]);

    // And the picker, which is the one new disclosure, is shut for them.
    expect(await g.assignableMembers(seat)).toEqual([]);
  });

  it("keeps the membership lock lock-only however the policies combine", async () => {
    /*
     * Two permissive UPDATE policies now apply to this role on
     * `workspace_memberships`. USING is OR'd — which is the point, the lock
     * has to reach the recipient — but WITH CHECK is OR'd too, and both are
     * `false`, so no combination of them can let a write land.
     */
    const rows = (await admin()`
      select pol.polname,
             pg_get_expr(pol.polwithcheck, pol.polrelid) as check_expr
        from pg_policy pol join pg_class c on c.oid = pol.polrelid
       where c.relname = 'workspace_memberships' and pol.polcmd = 'w'
         and exists (select 1 from pg_roles r where r.oid = any (pol.polroles)
                       and r.rolname = 'limenzy_lead_support')
       order by pol.polname`) as unknown as {
      polname: string;
      check_expr: string;
    }[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.check_expr === "false")).toBe(true);

    // The column grant is the other half: `status` and nothing else.
    const grants = (await admin()`
      select column_name from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'workspace_memberships'
         and grantee = 'limenzy_lead_support' and privilege_type = 'UPDATE'
       order by column_name`) as unknown as { column_name: string }[];
    expect(grants.map((r) => r.column_name)).toEqual(["status"]);
  });

  it("gives the runtime role no way to forge a transfer entry", async () => {
    /*
     * The completeness check accepts any entry stamped with the revision a
     * change produced, so the question is whether `limenzy_app` could write
     * one that claims a transfer. It cannot: the owner columns are not in
     * its INSERT grant, and a check constraint refuses an `owner_changed`
     * row without both of them.
     */
    const [grant] = (await admin()`
      select has_column_privilege('limenzy_app', 'public.lead_activities',
               'from_owner_user_profile_id', 'INSERT') as from_owner,
             has_column_privilege('limenzy_app', 'public.lead_activities',
               'to_owner_user_profile_id', 'INSERT') as to_owner`) as unknown as {
      from_owner: boolean;
      to_owner: boolean;
    }[];
    expect(grant).toEqual({ from_owner: false, to_owner: false });

    const lead = await seedLead(fixture.owner.userProfileId);
    await expect(
      runtime().begin(async (tx) => {
        await tx`select set_config('app.auth_user_id', ${fixture.owner.authUserId}, true)`;
        await tx`select set_config('app.user_profile_id', ${fixture.owner.userProfileId}, true)`;
        await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
        await tx`
          insert into public.lead_activities
            (workspace_id, lead_id, kind, actor_user_profile_id)
          values (${fixture.workspaceA}, ${lead.id}::uuid, 'owner_changed',
                  ${fixture.owner.userProfileId})`;
      }),
    ).rejects.toThrow(/lead_activities_transfer_names_both_owners/);
  });

  it("does not let a note satisfy a transfer's history requirement", async () => {
    // `note_added` is excluded from the check by kind, so the one entry a
    // caller CAN write freely cannot stand in for the entry a change owes.
    const [row] = (await admin()`
      select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.proname = 'leads_require_history'`) as unknown as {
      prosrc: string;
    }[];
    expect(row!.prosrc).toMatch(/kind <> 'note_added'/);
    expect(row!.prosrc).toMatch(/a\.lead_revision = new\.revision/);
  });

  it("keeps every routine the support role owns off PUBLIC", async () => {
    const rows = (await admin()`
      select p.proname, coalesce(array_to_string(p.proacl, ' '), '(default)') as acl
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app'
         and pg_get_userbyid(p.proowner) = 'limenzy_lead_support'
       order by p.proname`) as unknown as { proname: string; acl: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) {
      // A default ACL means PUBLIC may execute. A definer routine must never
      // rely on being unreachable for some other reason.
      expect(`${row.proname}:${row.acl}`).not.toMatch(/\(default\)/);
      expect(`${row.proname}:${row.acl}`).not.toMatch(/(^|\s)=X\//);
    }
  });
});

describe.skipIf(!reachable)(
  "§162: authority held before a wait is not authority after it",
  () => {
    it("refuses an actor demoted while the transfer waited for a lock", async () => {
      /*
       * 2B's lesson, applied to a transfer. The routine checks §162 once
       * before it takes the membership locks and again after, because those
       * locks may have queued behind the very transaction that demoted the
       * caller — and the first check read an earlier snapshot.
       *
       * Here the demotion holds the Manager's row open; the transfer blocks
       * on it; the demotion commits; the transfer must then refuse rather
       * than act on the authority it verified a moment earlier.
       */
      await setStatus(fixture.manager.userProfileId, "active");
      await admin()`
        update public.workspace_memberships set role = 'manager'
         where workspace_id = ${fixture.workspaceA}
           and user_profile_id = ${fixture.manager.userProfileId}`;
      await configure({ granted: ["change_record_owner"] });
      const lead = await seedLead(fixture.manager.userProfileId);

      let release: (() => void) | undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });

      const demoting = runtime()
        .begin(async (tx) => {
          await tx`select set_config('app.auth_user_id', ${fixture.owner.authUserId}, true)`;
          await tx`select set_config('app.user_profile_id', ${fixture.owner.userProfileId}, true)`;
          await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
          const [row] = await tx<{ outcome: string }[]>`
            select app.set_member_role(
              ${fixture.manager.userProfileId}::uuid, 'staff_sales') as outcome`;
          if (row?.outcome !== "ok") throw new Error(`demote: ${row?.outcome}`);
          await held;
        })
        .then(
          () => "demoted" as const,
          (error: { message?: string }) => `refused:${error.message ?? "?"}`,
        );

      await new Promise((resolve) => setTimeout(resolve, 250));
      const transferring = g.reassignLead(
        managerA(),
        lead.id,
        lead.revision,
        fixture.owner.userProfileId,
      );

      await new Promise((resolve) => setTimeout(resolve, 250));
      release?.();

      expect(await demoting).toBe("demoted");
      // Staff/Sales is DENY for Change Record Owner, so the re-check refuses.
      expect(await transferring).toEqual({
        ok: false,
        reason: "not_permitted",
      });
      expect(await ownerOf(lead.id)).toBe(fixture.manager.userProfileId);

      await admin()`
        update public.workspace_memberships set role = 'manager'
         where workspace_id = ${fixture.workspaceA}
           and user_profile_id = ${fixture.manager.userProfileId}`;
      await configure({ granted: [] });
    }, 25_000);
  },
);

describe.skipIf(!reachable)(
  "§162: a committed revocation is not outrun by an earlier check",
  () => {
    /**
     * A Manager's Change Record Owner lives on the WORKSPACE row, so a
     * transfer has to be SERIALISED against a change to that row, not merely
     * checked close to it.
     *
     * The routine therefore takes `FOR SHARE` on its workspace row as its
     * first statement and holds it to commit, and re-reads the permission
     * after taking it. `setPermissionGranted` writes that row with a plain
     * UPDATE, which takes FOR NO KEY UPDATE and conflicts with FOR SHARE —
     * so the two genuinely queue behind each other, in whichever order they
     * arrive. The lock is bought with a privilege that cannot write: an
     * UPDATE grant on `time_zone` alone, under a policy whose WITH CHECK is
     * `false`. The last test here pins that.
     *
     * The two contended tests below are the evidence for the lock: each one
     * asserts the loser is still PENDING while the winner holds the row,
     * which is the part a post-hoc re-check alone cannot produce. The
     * in-UPDATE predicate is kept as defence in depth and is pinned
     * structurally, labelled as such.
     */
    /** Let pending work actually queue before asserting on it. */
    const settle = (ms = 300) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const asManager = async () => {
      await setStatus(fixture.manager.userProfileId, "active");
      await admin()`
        update public.workspace_memberships set role = 'manager'
         where workspace_id = ${fixture.workspaceA}
           and user_profile_id = ${fixture.manager.userProfileId}`;
      await configure({ scope: null, granted: ["change_record_owner"] });
    };

    /** Owner, revision and history, as one string — nothing may move. */
    const stateOf = async (leadId: string) => {
      const [row] = (await admin()`
        select l.record_owner_user_profile_id as owner, l.revision,
               (select count(*)::int from public.lead_activities a
                 where a.lead_id = l.id and a.kind = 'owner_changed') as transfers
          from public.leads l where l.id = ${leadId}`) as unknown as {
        owner: string;
        revision: number;
        transfers: number;
      }[];
      return `${row!.owner}/${row!.revision}/${row!.transfers}`;
    };

    it("order A: the revocation commits first, so the transfer is refused", async () => {
      await asManager();
      const lead = await seedLead(fixture.manager.userProfileId);
      const before = await stateOf(lead.id);

      /*
       * The revocation commits outright, BEFORE the transfer begins. Nothing
       * here is concurrent: this is the case where an earlier check must not
       * still be usable.
       */
      await configure({ granted: [] });

      expect(
        await g.reassignLead(
          managerA(),
          lead.id,
          lead.revision,
          fixture.owner.userProfileId,
        ),
      ).toEqual({ ok: false, reason: "not_permitted" });
      expect(await stateOf(lead.id)).toBe(before);
    });

    it("revocation first: the transfer waits for it, then refuses", async () => {
      /*
       * THE REVOCATION WINS THE ROW. It writes `permissions_granted` and
       * holds the row uncommitted; the transfer then cannot even read its
       * own authority until that transaction ends.
       *
       * The assertion that matters is the PENDING one in the middle: the
       * transfer has not returned while the revocation holds the row. That
       * is the serialisation. What it returns afterwards — not_permitted,
       * with owner, revision and history unmoved — is the consequence.
       */
      await asManager();
      const lead = await seedLead(fixture.manager.userProfileId);
      const before = await stateOf(lead.id);

      let commit: (() => void) | undefined;
      const ready = new Promise<void>((resolve) => {
        commit = resolve;
      });
      const revoking = admin().begin(async (tx) => {
        await tx`
          update public.workspaces set permissions_granted = ${[] as string[]}
           where id = ${fixture.workspaceA}`;
        await ready;
      });

      await settle();
      let settled = false;
      const transferring = g
        .reassignLead(
          managerA(),
          lead.id,
          lead.revision,
          fixture.owner.userProfileId,
        )
        .finally(() => {
          settled = true;
        });

      /*
       * Committed in `finally` for the same reason as the test below: a
       * failing assertion must not leave the revocation holding the
       * workspace row, or every later test in this file queues behind it
       * and the run reports timeouts instead of the real failure. Measured:
       * without it, the next test times out at 30s rather than failing in
       * one second on its own assertion.
       */
      try {
        await settle(600);
        expect(settled).toBe(false); // queued on the workspace row
        expect(await stateOf(lead.id)).toBe(before);
      } finally {
        commit?.();
        await revoking.catch(() => undefined);
      }

      expect(await transferring).toEqual({
        ok: false,
        reason: "not_permitted",
      });
      // Owner, revision and history are exactly as they were.
      expect(await stateOf(lead.id)).toBe(before);
    }, 25_000);

    it("transfer first: the revocation waits until the transfer completes", async () => {
      /*
       * THE TRANSFER WINS THE ROW, and is then pinned mid-body by holding a
       * membership row it needs — so it is demonstrably still in flight,
       * holding the workspace lock, while the revocation is attempted.
       *
       * The revocation goes through the REAL write path, `setPermissionGranted`,
       * so this is evidence about the code that actually revokes permission
       * in Settings and not about a statement written for the test.
       */
      await asManager();
      const lead = await seedLead(fixture.manager.userProfileId);

      let release: (() => void) | undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const blocking = admin().begin(async (tx) => {
        await tx`
          select user_profile_id from public.workspace_memberships
           where workspace_id = ${fixture.workspaceA}
             and user_profile_id = ${fixture.owner.userProfileId}
           for update`;
        await held;
      });

      await settle();
      let transferDone = false;
      const transferring = g
        .reassignLead(
          managerA(),
          lead.id,
          lead.revision,
          fixture.owner.userProfileId,
        )
        .finally(() => {
          transferDone = true;
        });

      // The transfer now holds the workspace row and waits on membership.
      await settle();
      expect(transferDone).toBe(false);

      let revokeDone = false;
      const revoking = g
        .setPermissionGranted(ownerA(), "change_record_owner", false)
        .finally(() => {
          revokeDone = true;
        });

      /*
       * Released in `finally` so a FAILING assertion still unwinds the two
       * held transactions. Without it this test reports a timeout instead of
       * the assertion that actually failed, which is a worse answer: it was
       * measured both ways.
       */
      try {
        await settle(600);
        // THE POINT: the revocation cannot slip past a transfer in flight.
        expect(revokeDone).toBe(false);
        expect(transferDone).toBe(false);
      } finally {
        release?.();
        await blocking.catch(() => undefined);
        await Promise.allSettled([transferring, revoking]);
      }

      expect(await transferring).toMatchObject({ ok: true });
      expect(await revoking).toMatchObject({ ok: true });

      // The transfer that held the row completed in full, and intact.
      const [row] = (await admin()`
        select l.record_owner_user_profile_id as owner, l.revision,
               a.from_owner_user_profile_id as from_owner,
               a.to_owner_user_profile_id as to_owner
          from public.leads l
          join public.lead_activities a
            on a.lead_id = l.id and a.kind = 'owner_changed'
         where l.id = ${lead.id}`) as unknown as {
        owner: string;
        revision: number;
        from_owner: string;
        to_owner: string;
      }[];
      expect(row).toMatchObject({
        owner: fixture.owner.userProfileId,
        revision: lead.revision + 1,
        from_owner: fixture.manager.userProfileId,
        to_owner: fixture.owner.userProfileId,
      });

      // And the revocation that waited is now in force.
      const next = await seedLead(fixture.manager.userProfileId);
      expect(
        await g.reassignLead(
          managerA(),
          next.id,
          next.revision,
          fixture.owner.userProfileId,
        ),
      ).toEqual({ ok: false, reason: "not_permitted" });
    }, 30_000);

    it("order B: the transfer commits first, and the revocation follows it", async () => {
      await asManager();
      const lead = await seedLead(fixture.manager.userProfileId);

      const result = await g.reassignLead(
        managerA(),
        lead.id,
        lead.revision,
        fixture.owner.userProfileId,
      );
      expect(result.ok).toBe(true);

      // The revocation lands afterwards and does not undo what was done.
      await configure({ granted: [] });
      const [row] = (await admin()`
        select l.record_owner_user_profile_id as owner, l.revision,
               a.from_owner_user_profile_id as from_owner,
               a.to_owner_user_profile_id as to_owner
          from public.leads l
          join public.lead_activities a
            on a.lead_id = l.id and a.kind = 'owner_changed'
         where l.id = ${lead.id}`) as unknown as {
        owner: string;
        revision: number;
        from_owner: string;
        to_owner: string;
      }[];
      expect(row).toMatchObject({
        owner: fixture.owner.userProfileId,
        revision: lead.revision + 1,
        from_owner: fixture.manager.userProfileId,
        to_owner: fixture.owner.userProfileId,
      });

      // And a second attempt now refuses, because the permission is gone.
      const again = await seedLead(fixture.manager.userProfileId);
      expect(
        await g.reassignLead(
          managerA(),
          again.id,
          again.revision,
          fixture.owner.userProfileId,
        ),
      ).toEqual({ ok: false, reason: "not_permitted" });
      await configure({ granted: [] });
    }, 25_000);

    it("carries the permission into the write itself (structural)", async () => {
      /*
       * Structural, and labelled as such. The window this closes is between
       * two adjacent statements inside the routine, which no test can open
       * from outside; what can be checked is that the UPDATE is not allowed
       * to rely on a conclusion reached earlier in the transaction.
       */
      const [row] = (await admin()`
        select p.prosrc from pg_proc p
          join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'app' and p.proname = 'reassign_lead_owner'`) as unknown as {
        prosrc: string;
      }[];
      const update = row!.prosrc.slice(
        row!.prosrc.indexOf("update public.leads"),
      );
      const statement = update.slice(0, update.indexOf(";"));
      expect(statement).toMatch(
        /app\.current_user_may_change_record_owner\(\)/,
      );
      // And a zero-row result is told apart rather than reported as stale.
      expect(row!.prosrc).toMatch(
        /if not app\.current_user_may_change_record_owner\(\) then\s*\n\s*return query select 'not_permitted'/,
      );
    });

    it("buys the lock with a privilege that cannot write anything", async () => {
      /*
       * THE AUDIT OF THE NEW PRIVILEGE. PostgreSQL refuses a row lock to a
       * role without UPDATE — even FOR SHARE, even with table-wide SELECT —
       * so the lock above had to be paid for. It is paid for with one
       * column, `time_zone`, under a policy that refuses every write.
       *
       * PERMISSIVE POLICIES ARE OR'd, so `with check (false)` restricts only
       * if nothing else applies. The first assertion is that audit: exactly
       * one update policy on `workspaces` reaches this role. The rest is the
       * measurement — as the role itself, the lock is takeable and all four
       * write shapes are refused.
       */
      const [policies] = (await admin()`
        select count(*)::int as applying,
               count(*) filter (
                 where pg_get_expr(polwithcheck, polrelid) = 'false'
               )::int as refusing
          from pg_policy
         where polrelid = 'public.workspaces'::regclass
           and polcmd in ('w', '*')
           and (0 = any(polroles)
                or 'limenzy_lead_support'::regrole::oid = any(polroles))
      `) as unknown as { applying: number; refusing: number }[];
      expect(policies).toEqual({ applying: 1, refusing: 1 });

      // One write grant, and on the harmless column.
      const grants = (await admin()`
        select column_name from information_schema.column_privileges
         where table_schema = 'public' and table_name = 'workspaces'
           and grantee = 'limenzy_lead_support'
           and privilege_type <> 'SELECT'`) as unknown as {
        column_name: string;
      }[];
      expect(grants.map((row) => row.column_name)).toEqual(["time_zone"]);

      /*
       * Measured as the role, not inferred from the catalogue. Each attempt
       * runs in its own savepoint so one refusal does not abort the next.
       */
      const attempt = async (statement: string) =>
        admin()
          .begin(async (tx) => {
            await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
            await tx`select set_config('app.user_profile_id', ${fixture.owner.userProfileId}, true)`;
            await tx`set local role limenzy_lead_support`;
            await tx.unsafe(statement);
            throw new Error("ROLLBACK_MARKER");
          })
          .then(
            () => "allowed",
            (error: { message?: string; code?: string }) =>
              error.message === "ROLLBACK_MARKER"
                ? "allowed"
                : `refused:${error.code ?? "?"}`,
          );

      const ws = `'${fixture.workspaceA}'`;
      expect(
        await attempt(
          `select 1 from public.workspaces where id = ${ws} for share`,
        ),
      ).toBe("allowed");
      expect(
        await attempt(
          `update public.workspaces set time_zone = 'Asia/Kolkata' where id = ${ws}`,
        ),
      ).toBe("refused:42501");
      expect(
        await attempt(
          `update public.workspaces set permissions_granted = array['x'] where id = ${ws}`,
        ),
      ).toBe("refused:42501");
      expect(
        await attempt(`delete from public.workspaces where id = ${ws}`),
      ).toBe("refused:42501");
      expect(
        await attempt(
          `insert into public.workspaces (name, country, currency, time_zone)
             values ('x', 'IN', 'INR', 'UTC')`,
        ),
      ).toBe("refused:42501");
    });

    it("an Owner/Admin is unaffected: their row is not configurable", async () => {
      // §162 gives Owner/Admin Change Record Owner outright, so no workspace
      // setting can revoke it and this coordination does not apply to them.
      await configure({ granted: [] });
      const lead = await seedLead(fixture.owner.userProfileId);
      const result = await g.reassignLead(
        ownerA(),
        lead.id,
        lead.revision,
        fixture.shared.userProfileId,
      );
      expect(result.ok).toBe(true);
    });
  },
);
