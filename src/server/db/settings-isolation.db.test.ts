import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertMatchedDatabaseTargets } from "../../../scripts/database-target.mjs";
import type { BusinessSettingsInput } from "@/lib/validation/business-settings";
import {
  cleanupTenantFixture,
  createTenantFixture,
  type TenantFixture,
} from "@/test/fixtures/tenant-fixture";

/**
 * Milestone 1D — isolation of the workspace settings surface.
 *
 * What is NOT here, because it is already proved elsewhere and duplicating it
 * would only add a second place to keep correct:
 *
 *   * raw SQL with no tenant settings, with empty settings, and with a
 *     non-UUID setting — `rls.test.ts` items 1, 2 and 3;
 *   * a wrong workspace setting returning nothing, and an inactive membership
 *     behaving as no membership — `rls.test.ts` items 9 and 10;
 *   * transaction-locality and pooled-connection leakage — `tenant.test.ts`.
 *
 * What is here is the part none of those cover: the settings columns added in
 * Milestone 1D, and a user who is an active member of two workspaces switching
 * between them. A user present in one workspace cannot show that switching
 * changes what they see.
 */

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

const probe = async (url: string) => {
  if (!url) return undefined;
  const sql = postgres(url, { max: 2, connect_timeout: 5, onnotice: () => {} });
  try {
    await sql`select 1`;
    return sql;
  } catch {
    await sql.end({ timeout: 1 }).catch(() => {});
    return undefined;
  }
};

const tooling = await probe(TOOLING);
const runtimeProbe = await probe(RUNTIME);
await runtimeProbe?.end({ timeout: 1 }).catch(() => {});
const reachable = tooling !== undefined && runtimeProbe !== undefined;

/**
 * Mixed targets are a hard stop, not a skip: fixtures would land in one
 * database while the assertions read another, and the writes would still
 * happen — possibly in a hosted project.
 */
if (reachable) assertMatchedDatabaseTargets(RUNTIME, TOOLING);

if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] settings isolation needs both connections. Run "npm run db:start", ' +
      '"npm run db:reset" and "npm run db:role:local".',
  );
}

const admin = () => {
  if (!tooling) throw new Error("no tooling connection");
  return tooling;
};

const RUN = crypto.randomUUID().slice(0, 8);
let fixture: TenantFixture;
let recorded: Awaited<ReturnType<typeof createTenantFixture>>["recorded"];
let cleanupProblems: string[] = [];

type Gateways = {
  withTenant: typeof import("./tenant").withTenant;
  createTenantContext: typeof import("./tenant-context").createTenantContext;
  enabledModulesFor: typeof import("@/server/auth/workspace-modules").enabledModulesFor;
  setModuleEnabled: typeof import("@/server/auth/workspace-modules").setModuleEnabled;
  businessSettingsFor: typeof import("@/server/auth/workspace-business-settings").businessSettingsFor;
  updateBusinessSettings: typeof import("@/server/auth/workspace-business-settings").updateBusinessSettings;
  workspacePermissionSettings: typeof import("@/server/auth/workspace-permissions").workspacePermissionSettings;
  setPermissionGranted: typeof import("@/server/auth/workspace-permissions").setPermissionGranted;
  setManagerRecordScope: typeof import("@/server/auth/workspace-permissions").setManagerRecordScope;
  runtimeSql: typeof import("./client").runtimeSql;
};
let g: Gateways;

beforeAll(async () => {
  if (!reachable) return;
  ({ fixture, recorded } = await createTenantFixture(admin(), RUN));
  const [tenant, context, modules, permissions, business, client] =
    await Promise.all([
      import("./tenant"),
      import("./tenant-context"),
      import("@/server/auth/workspace-modules"),
      import("@/server/auth/workspace-permissions"),
      import("@/server/auth/workspace-business-settings"),
      import("./client"),
    ]);
  g = {
    withTenant: tenant.withTenant,
    createTenantContext: context.createTenantContext,
    enabledModulesFor: modules.enabledModulesFor,
    setModuleEnabled: modules.setModuleEnabled,
    businessSettingsFor: business.businessSettingsFor,
    updateBusinessSettings: business.updateBusinessSettings,
    workspacePermissionSettings: permissions.workspacePermissionSettings,
    setPermissionGranted: permissions.setPermissionGranted,
    setManagerRecordScope: permissions.setManagerRecordScope,
    runtimeSql: client.runtimeSql,
  };
}, 30_000);

afterAll(async () => {
  if (reachable && recorded) {
    cleanupProblems = await cleanupTenantFixture(admin(), recorded);
    if (cleanupProblems.length > 0) {
      console.error("[settings isolation] cleanup problems:", cleanupProblems);
    }
  }
  try {
    if (g?.runtimeSql) await g.runtimeSql().end({ timeout: 5 });
  } catch {
    /* already closed */
  }
  await tooling?.end({ timeout: 5 }).catch(() => {});
}, 30_000);

/** A context for one of the fixture's people, in one of its workspaces. */
const ctx = (
  user: { authUserId: string; userProfileId: string },
  workspace: string,
) =>
  g.createTenantContext({
    authUserId: user.authUserId,
    userProfileId: user.userProfileId,
    workspaceId: workspace,
  });

describe.skipIf(!reachable)("a user who belongs to two workspaces", () => {
  it("sees only workspace A while its context names A", async () => {
    const rows = await g.withTenant(
      ctx(fixture.shared, fixture.workspaceA),
      async (tx) => tx<{ id: string }[]>`select id from public.workspaces`,
    );
    expect(rows.map((r) => r.id)).toEqual([fixture.workspaceA]);
  });

  it("sees only workspace B while its context names B", async () => {
    const rows = await g.withTenant(
      ctx(fixture.shared, fixture.workspaceB),
      async (tx) => tx<{ id: string }[]>`select id from public.workspaces`,
    );
    expect(rows.map((r) => r.id)).toEqual([fixture.workspaceB]);
  });

  it("switching back and forth never shows both at once", async () => {
    const seen: string[][] = [];
    for (const workspace of [
      fixture.workspaceA,
      fixture.workspaceB,
      fixture.workspaceA,
    ]) {
      const rows = await g.withTenant(
        ctx(fixture.shared, workspace),
        async (tx) => tx<{ id: string }[]>`select id from public.workspaces`,
      );
      seen.push(rows.map((r) => r.id));
    }
    expect(seen).toEqual([
      [fixture.workspaceA],
      [fixture.workspaceB],
      [fixture.workspaceA],
    ]);
  });

  it("sees both of its OWN memberships whichever workspace is selected", async () => {
    // `workspace_memberships_self_select` is keyed on the profile, with no
    // workspace predicate — deliberately. The workspace chooser has to list
    // every workspace you belong to, and it reads this table under whichever
    // context happens to be current. So seeing both rows here is the design,
    // not a leak; what must stay scoped is the `workspaces` row, which the
    // tests above cover.
    for (const workspace of [fixture.workspaceA, fixture.workspaceB]) {
      const rows = await g.withTenant(
        ctx(fixture.shared, workspace),
        async (tx) =>
          tx<{ role: string; workspace_id: string }[]>`
          select role, workspace_id from public.workspace_memberships
           order by role`,
      );
      expect(rows.map((r) => r.role)).toEqual(["owner_admin", "staff_sales"]);
      expect(rows.map((r) => r.workspace_id).sort()).toEqual(
        [fixture.workspaceA, fixture.workspaceB].sort(),
      );
    }
  });

  it("never sees another person's membership, in either workspace", async () => {
    // The person scope is the one that matters here: the owner and the manager
    // of workspace A must not appear to the shared user at all.
    for (const workspace of [fixture.workspaceA, fixture.workspaceB]) {
      const rows = await g.withTenant(
        ctx(fixture.shared, workspace),
        async (tx) =>
          tx<{ user_profile_id: string }[]>`
          select user_profile_id from public.workspace_memberships`,
      );
      expect(
        rows.every((r) => r.user_profile_id === fixture.shared.userProfileId),
      ).toBe(true);
    }
  });

  it("cannot name a workspace it does not belong to", async () => {
    // A third workspace id that is syntactically valid and not theirs.
    const stranger = crypto.randomUUID();
    const rows = await g.withTenant(
      ctx(fixture.shared, stranger),
      async (tx) => tx<{ id: string }[]>`select id from public.workspaces`,
    );
    expect(rows).toHaveLength(0);
  });
});

describe.skipIf(!reachable)("module settings are per workspace", () => {
  it("lets the shared user configure B, where they are owner_admin", async () => {
    const result = await g.setModuleEnabled(
      ctx(fixture.shared, fixture.workspaceB),
      "whatsapp",
      false,
    );
    expect(result.ok).toBe(true);
  });

  it("refuses the same user in A, where they are staff_sales", async () => {
    const result = await g.setModuleEnabled(
      ctx(fixture.shared, fixture.workspaceA),
      "whatsapp",
      false,
    );
    // Row-level security returned no row: the role is per workspace, and the
    // owner_admin membership in B confers nothing here.
    expect(result).toEqual({ ok: false, reason: "not_configurable" });
  });

  it("refuses a manager of A", async () => {
    const result = await g.setModuleEnabled(
      ctx(fixture.manager, fixture.workspaceA),
      "leads",
      false,
    );
    expect(result).toEqual({ ok: false, reason: "not_configurable" });
  });

  it("leaves workspace A unconfigured after B was configured", async () => {
    const a = await g.enabledModulesFor(ctx(fixture.owner, fixture.workspaceA));
    const b = await g.enabledModulesFor(
      ctx(fixture.shared, fixture.workspaceB),
    );

    expect(a.usingDefaults).toBe(true);
    expect(b.usingDefaults).toBe(false);
    expect(b.enabled.has("whatsapp")).toBe(false);
    expect(a.enabled.has("whatsapp")).toBe(true);
  });
});

describe.skipIf(!reachable)("permission settings are per workspace", () => {
  it("lets an owner_admin grant a configurable cell in their own workspace", async () => {
    const result = await g.setPermissionGranted(
      ctx(fixture.owner, fixture.workspaceA),
      "import_export",
      true,
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a manager of the same workspace", async () => {
    const result = await g.setPermissionGranted(
      ctx(fixture.manager, fixture.workspaceA),
      "change_record_owner",
      true,
    );
    expect(result).toEqual({ ok: false, reason: "not_configurable" });
  });

  it("refuses the shared user in A, where they are staff_sales", async () => {
    const result = await g.setPermissionGranted(
      ctx(fixture.shared, fixture.workspaceA),
      "change_record_owner",
      true,
    );
    expect(result).toEqual({ ok: false, reason: "not_configurable" });
  });

  it("keeps each workspace's configuration to itself", async () => {
    await g.setManagerRecordScope(
      ctx(fixture.shared, fixture.workspaceB),
      "own_assigned_shared",
    );

    const a = await g.workspacePermissionSettings(
      ctx(fixture.owner, fixture.workspaceA),
    );
    const b = await g.workspacePermissionSettings(
      ctx(fixture.shared, fixture.workspaceB),
    );

    expect(a.granted.has("import_export")).toBe(true);
    expect(b.granted.has("import_export")).toBe(false);
    expect(a.managerRecordScope).toBeUndefined();
    expect(b.managerRecordScope).toBe("own_assigned_shared");
  });

  it("refuses to store a Decision-required cell even with a valid context", async () => {
    const result = await g.setPermissionGranted(
      ctx(fixture.owner, fixture.workspaceA),
      "manage_sales_teams",
      true,
    );
    expect(result).toEqual({ ok: false, reason: "not_configurable_cell" });
  });

  it("an inactive membership configures nothing", async () => {
    const result = await g.setPermissionGranted(
      ctx(fixture.former, fixture.workspaceA),
      "import_export",
      false,
    );
    expect(result).toEqual({ ok: false, reason: "not_configurable" });

    // …and the value the owner set is untouched.
    const settings = await g.workspacePermissionSettings(
      ctx(fixture.owner, fixture.workspaceA),
    );
    expect(settings.granted.has("import_export")).toBe(true);
  });
});

describe.skipIf(!reachable)(
  "the settings columns under the RLS backstop",
  () => {
    it("reads nothing from the settings columns with no tenant settings", async () => {
      // rls.test.ts proves this for the foundation columns; the Milestone 1D
      // columns are new surface on the same table and are checked here.
      const rows = await g.runtimeSql()<
        { permissions_granted: string[] | null }[]
      >`select permissions_granted from public.workspaces`;
      expect(rows).toHaveLength(0);
    });

    it("writes nothing to the settings columns with no tenant settings", async () => {
      const written = await g.runtimeSql()<{ id: string }[]>`
      update public.workspaces set manager_record_scope = 'all_records'
      returning id`;
      expect(written).toHaveLength(0);

      // Confirmed from the tooling side, which bypasses RLS and so would see it.
      const [row] = (await admin()`
      select manager_record_scope from public.workspaces
       where id = ${fixture.workspaceA}`) as unknown as {
        manager_record_scope: string | null;
      }[];
      expect(row?.manager_record_scope).toBeNull();
    });

    it("reads nothing with a mismatched workspace setting", async () => {
      const stranger = crypto.randomUUID();
      const rows = await g.withTenant(
        ctx(fixture.owner, stranger),
        async (tx) =>
          tx<{ permissions_granted: string[] | null }[]>`
        select permissions_granted from public.workspaces`,
      );
      expect(rows).toHaveLength(0);
    });

    it("reads nothing when the profile setting names another person", async () => {
      const mismatched = g.createTenantContext({
        authUserId: fixture.owner.authUserId,
        userProfileId: fixture.manager.userProfileId,
        workspaceId: fixture.workspaceA,
      });
      const rows = await g.withTenant(
        mismatched,
        async (tx) => tx<{ id: string }[]>`select id from public.workspaces`,
      );
      expect(rows).toHaveLength(0);
    });
  },
);

describe.skipIf(!reachable)("business settings are Owner/Admin only", () => {
  /** A full §158 submission, as `parseBusinessSettings` would have produced. */
  const settings = (overrides: Partial<BusinessSettingsInput> = {}) => ({
    name: `Renamed ${RUN}`,
    businessType: "Financial / Insurance",
    businessPhone: "+91 80 4000 1234",
    businessEmail: "hello@example.com",
    address: "12 Example Road\nBengaluru",
    country: "IN",
    currency: "INR",
    timeZone: "Asia/Kolkata",
    ...overrides,
  });

  /** Read the stored row from the tooling side, which bypasses RLS entirely. */
  const stored = async (workspaceId: string) => {
    const [row] = (await admin()`
      select name, business_type, business_phone, business_email, address
        from public.workspaces where id = ${workspaceId}`) as unknown as {
      name: string;
      business_type: string | null;
      business_phone: string | null;
      business_email: string | null;
      address: string | null;
    }[];
    return row;
  };

  it("lets an owner_admin save their own workspace", async () => {
    const result = await g.updateBusinessSettings(
      ctx(fixture.owner, fixture.workspaceA),
      settings({ name: `A Renamed ${RUN}` }),
    );
    expect(result.ok).toBe(true);

    // Confirmed from the tooling side: the UPDATE really reached the row, and
    // is not merely what the function claimed to have written.
    const row = await stored(fixture.workspaceA);
    expect(row?.name).toBe(`A Renamed ${RUN}`);
    expect(row?.business_phone).toBe("+91 80 4000 1234");
    expect(row?.business_email).toBe("hello@example.com");
    expect(row?.address).toBe("12 Example Road\nBengaluru");
  });

  it("reads back exactly what it stored, under the same context", async () => {
    const read = await g.businessSettingsFor(
      ctx(fixture.owner, fixture.workspaceA),
    );
    expect(read).toEqual(settings({ name: `A Renamed ${RUN}` }));
  });

  it("refuses a manager of the same workspace", async () => {
    const result = await g.updateBusinessSettings(
      ctx(fixture.manager, fixture.workspaceA),
      settings({ name: `Manager wrote this ${RUN}` }),
    );
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
    expect((await stored(fixture.workspaceA))?.name).toBe(`A Renamed ${RUN}`);
  });

  it("refuses a staff_sales member of the same workspace", async () => {
    // The shared user is owner_admin in B. That confers nothing in A, which is
    // the distinction a single-workspace fixture could not show.
    const result = await g.updateBusinessSettings(
      ctx(fixture.shared, fixture.workspaceA),
      settings({ name: `Staff wrote this ${RUN}` }),
    );
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
    expect((await stored(fixture.workspaceA))?.name).toBe(`A Renamed ${RUN}`);
  });

  it("refuses an inactive owner-level membership", async () => {
    const result = await g.updateBusinessSettings(
      ctx(fixture.former, fixture.workspaceA),
      settings({ name: `Former wrote this ${RUN}` }),
    );
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
    expect((await stored(fixture.workspaceA))?.name).toBe(`A Renamed ${RUN}`);
  });

  it("refuses an owner_admin naming a workspace they do not belong to", async () => {
    const stranger = crypto.randomUUID();
    const result = await g.updateBusinessSettings(
      ctx(fixture.owner, stranger),
      settings({ name: `Cross-workspace ${RUN}` }),
    );
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
  });

  it("cannot reach workspace A from a context naming workspace B", async () => {
    // The shared user IS an owner_admin — of B. The write must land in B and
    // nowhere else, even though the same person has a membership in A.
    const result = await g.updateBusinessSettings(
      ctx(fixture.shared, fixture.workspaceB),
      settings({ name: `B Renamed ${RUN}`, businessPhone: null }),
    );
    expect(result.ok).toBe(true);

    expect((await stored(fixture.workspaceB))?.name).toBe(`B Renamed ${RUN}`);
    expect((await stored(fixture.workspaceA))?.name).toBe(`A Renamed ${RUN}`);
    expect((await stored(fixture.workspaceA))?.business_phone).toBe(
      "+91 80 4000 1234",
    );
  });

  it("stores NULL, not an empty string, for a cleared optional field", async () => {
    const result = await g.updateBusinessSettings(
      ctx(fixture.owner, fixture.workspaceA),
      settings({
        name: `A Renamed ${RUN}`,
        businessType: null,
        businessPhone: null,
        businessEmail: null,
        address: null,
      }),
    );
    expect(result.ok).toBe(true);

    const row = await stored(fixture.workspaceA);
    expect(row?.business_type).toBeNull();
    expect(row?.business_phone).toBeNull();
    expect(row?.business_email).toBeNull();
    expect(row?.address).toBeNull();
  });

  it("reads nothing from the new columns with no tenant settings", async () => {
    const rows = await g.runtimeSql()<{ business_phone: string | null }[]>`
      select business_phone from public.workspaces`;
    expect(rows).toHaveLength(0);
  });

  it("writes nothing to the new columns with no tenant settings", async () => {
    const written = await g.runtimeSql()<{ id: string }[]>`
      update public.workspaces set business_phone = '+1 555 0100' returning id`;
    expect(written).toHaveLength(0);
    expect((await stored(fixture.workspaceA))?.business_phone).toBeNull();
  });
});

describe.skipIf(!reachable)(
  "the database refuses malformed contact detail",
  () => {
    /**
     * Checked from the TOOLING side on purpose. The application already rejects
     * these, so going through it would only re-test the parser; the point here
     * is that the constraint holds even for a writer that bypasses row-level
     * security entirely, which is what makes it a backstop rather than a second
     * copy of the same rule.
     */
    const reject = async (column: string, value: string) => {
      let code: string | undefined;
      try {
        await admin().unsafe(
          `update public.workspaces set ${column} = $1 where id = $2`,
          [value, fixture.workspaceA],
        );
      } catch (error) {
        code = (error as { code?: string }).code;
      }
      return code;
    };

    it("refuses an empty string in each optional text column", async () => {
      // 23514 check_violation — the not-blank constraints.
      expect(await reject("business_phone", "")).toBe("23514");
      expect(await reject("business_email", "")).toBe("23514");
      expect(await reject("address", "")).toBe("23514");
      expect(await reject("business_phone", "   ")).toBe("23514");
    });

    it("refuses something that is not shaped like an email address", async () => {
      expect(await reject("business_email", "not-an-address")).toBe("23514");
      expect(await reject("business_email", "has space@example.com")).toBe(
        "23514",
      );
    });

    it("accepts an ordinary address, so the constraint is not simply refusing everything", async () => {
      expect(
        await reject("business_email", "owner@example.co.in"),
      ).toBeUndefined();
      // Left as the fixture found it, so later assertions are not surprised.
      await admin()`
      update public.workspaces set business_email = null
       where id = ${fixture.workspaceA}`;
    });
  },
);

describe.skipIf(!reachable)("the fixture cleans up after itself", () => {
  it("records every identifier it created", () => {
    expect(recorded.workspaces).toHaveLength(2);
    expect(recorded.profiles).toHaveLength(4);
    expect(recorded.authUsers).toHaveLength(4);
    expect(recorded.memberships).toHaveLength(5);
  });

  it("includes a user who is an active member of both workspaces", async () => {
    const rows = (await admin()`
      select workspace_id, role, status from public.workspace_memberships
       where user_profile_id = ${fixture.shared.userProfileId}
       order by role`) as unknown as {
      workspace_id: string;
      role: string;
      status: string;
    }[];
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === "active")).toBe(true);
    expect(rows.map((r) => r.workspace_id).sort()).toEqual(
      [fixture.workspaceA, fixture.workspaceB].sort(),
    );
    expect(rows.map((r) => r.role)).toEqual(["owner_admin", "staff_sales"]);
  });
});
