import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Workspace permission configuration, offline.
 *
 * The tenant gateway is replaced, so no database is contacted. What is under
 * test is the decision-making: which statements run, how stored configuration
 * reaches the evaluator, and what cannot be stored or granted at all.
 *
 * Isolation is not re-proved here — every statement goes through
 * `withTenant()`, which `tenant.test.ts` and the hosted §6.1 harness cover.
 */

const rows: unknown[][] = [];
const statements: string[] = [];

const tx = async (strings: TemplateStringsArray, ...values: unknown[]) => {
  statements.push(strings.join("?").replace(/\s+/g, " ").trim());
  void values;
  const next = rows.shift();
  if (next instanceof Error) throw next;
  return next ?? [];
};

const withTenant = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/tenant", () => ({ withTenant }));

const {
  workspacePermissionSettings,
  permissionFor,
  recordAccess,
  setPermissionGranted,
  setManagerRecordScope,
} = await import("./workspace-permissions");
const { CONFIGURABLE_PERMISSIONS } = await import("@/lib/permissions");

const CONTEXT = { workspaceId: "w" } as never;

class PgError extends Error {
  constructor(readonly code: string) {
    super("database said no");
  }
}

/** Both columns present, as the migration leaves them. */
const columnsPresent = (present = true) => rows.push([{ n: present ? 2 : 0 }]);

beforeEach(() => {
  rows.length = 0;
  statements.length = 0;
  withTenant.mockReset();
  withTenant.mockImplementation(
    async (_context: unknown, fn: (t: unknown) => unknown) => fn(tx),
  );
});

describe("reading the configuration", () => {
  it("asks whether the columns exist before naming them", async () => {
    columnsPresent();
    rows.push([{ permissions_granted: null, manager_record_scope: null }]);
    await workspacePermissionSettings(CONTEXT);

    expect(statements[0]).toContain("information_schema.columns");
    expect(statements[1]).toContain("permissions_granted");
  });

  it("reports an unconfigured workspace as needing a decision", async () => {
    columnsPresent();
    rows.push([{ permissions_granted: null, manager_record_scope: null }]);
    const settings = await workspacePermissionSettings(CONTEXT);

    expect(settings.isConfigured).toBe(false);
    expect(settings.managerScopeNeedsChoice).toBe(true);
    expect(settings.granted.size).toBe(0);
  });

  it("distinguishes 'configured with nothing granted' from 'never configured'", async () => {
    columnsPresent();
    rows.push([
      { permissions_granted: [], manager_record_scope: "all_records" },
    ]);
    const settings = await workspacePermissionSettings(CONTEXT);

    expect(settings.isConfigured).toBe(true);
    expect(settings.granted.size).toBe(0);
    expect(settings.managerScopeNeedsChoice).toBe(false);
  });

  it("falls back when the columns are not there yet", async () => {
    columnsPresent(false);
    const settings = await workspacePermissionSettings(CONTEXT);

    expect(settings.isConfigured).toBe(false);
    expect(statements).toHaveLength(1);
  });

  it("propagates a database failure rather than reading it as unconfigured", async () => {
    rows.push(new PgError("42501") as never);
    await expect(workspacePermissionSettings(CONTEXT)).rejects.toBeInstanceOf(
      PgError,
    );
  });

  it("drops a stored value that is not a configurable cell", async () => {
    columnsPresent();
    rows.push([
      {
        // A fixed cell and a "Decision required" cell, both stored somehow.
        permissions_granted: [
          "import_export",
          "manage_users",
          "manage_sales_teams",
        ],
        manager_record_scope: null,
      },
    ]);
    const settings = await workspacePermissionSettings(CONTEXT);

    expect([...settings.granted]).toEqual(["import_export"]);
  });

  it("ignores an unrecognised Manager scope rather than guessing", async () => {
    columnsPresent();
    rows.push([
      { permissions_granted: [], manager_record_scope: "everything" },
    ]);
    const settings = await workspacePermissionSettings(CONTEXT);

    expect(settings.managerRecordScope).toBeUndefined();
    expect(settings.managerScopeNeedsChoice).toBe(true);
  });
});

describe("configuration reaches the evaluator", () => {
  const configured = (granted: string[], scope?: string) => ({
    granted: new Set(granted),
    managerRecordScope: scope,
    isConfigured: true,
    managerScopeNeedsChoice: scope === undefined,
  });

  it("grants a configurable cell the workspace turned on", async () => {
    const decision = permissionFor(
      configured(["import_export"]) as never,
      "manager",
      "import_export",
    );
    expect(decision.allowed).toBe(true);
  });

  it("denies a configurable cell the workspace left off", async () => {
    const decision = permissionFor(
      configured([]) as never,
      "manager",
      "import_export",
    );
    expect(decision).toMatchObject({
      allowed: false,
      reason: "toggle_disabled",
    });
  });

  it("denies with 'not configured' when the workspace never decided", async () => {
    const unconfigured = {
      granted: new Set(),
      managerRecordScope: undefined,
      isConfigured: false,
      managerScopeNeedsChoice: true,
    };
    // Different from 'disabled': the operator has not chosen, and the settings
    // screen says so rather than showing a deliberate off.
    expect(
      permissionFor(unconfigured as never, "manager", "import_export"),
    ).toMatchObject({ allowed: false, reason: "toggle_not_configured" });
  });

  it("does not let a toggle widen a FIXED cell", async () => {
    // manage_users is "No" for a Manager in §162, whatever is stored.
    const decision = permissionFor(
      configured(["manage_users"]) as never,
      "manager",
      "manage_users",
    );
    expect(decision).toMatchObject({ allowed: false, reason: "role_denied" });
  });

  it("does not apply a toggle meant for the other role", async () => {
    // add_leads_customers is Configurable for Staff/Sales, and plain Yes for a
    // Manager. Granting it must not change the Manager's fixed answer, and a
    // Staff/Sales user must not inherit it from the Manager column.
    expect(
      permissionFor(
        configured(["add_leads_customers"]) as never,
        "manager",
        "add_leads_customers",
      ).allowed,
    ).toBe(true);
    expect(
      permissionFor(
        configured([]) as never,
        "staff_sales",
        "add_leads_customers",
      ),
    ).toMatchObject({ allowed: false, reason: "toggle_disabled" });
  });

  it("still requires the cell's own conditions once granted", async () => {
    // §162: "Configurable, within record scope".
    const settings = configured(["grant_or_revoke_explicit_record_share"]);
    expect(
      permissionFor(
        settings as never,
        "manager",
        "grant_or_revoke_explicit_record_share",
      ),
    ).toMatchObject({ allowed: false, reason: "condition_unverified" });
    expect(
      permissionFor(
        settings as never,
        "manager",
        "grant_or_revoke_explicit_record_share",
        { record_in_actor_scope: true },
      ).allowed,
    ).toBe(true);
  });

  it("leaves Owner/Admin unaffected by configuration", async () => {
    const unconfigured = {
      granted: new Set(),
      managerRecordScope: undefined,
      isConfigured: false,
      managerScopeNeedsChoice: true,
    };
    expect(
      permissionFor(unconfigured as never, "owner_admin", "import_export")
        .allowed,
    ).toBe(true);
  });
});

describe("unresolved §163.18 decisions stay denied", () => {
  it.each([
    "manage_sales_teams",
    "view_other_sales_teams",
    "configure_lead_assignment_rules",
    "view_assignment_audit_history",
  ])("%s cannot be granted by configuration", async (action) => {
    const settings = {
      granted: new Set([action]),
      managerRecordScope: "all_records",
      isConfigured: true,
      managerScopeNeedsChoice: false,
    };
    expect(
      permissionFor(settings as never, "manager", action as never),
    ).toMatchObject({ allowed: false, reason: "decision_required" });
  });

  it("is not offered as a toggle in the first place", () => {
    const offered = CONFIGURABLE_PERMISSIONS.map((entry) => entry.action);
    for (const action of [
      "manage_sales_teams",
      "view_other_sales_teams",
      "configure_lead_assignment_rules",
      "manage_users",
      "configure_crm_settings",
    ]) {
      expect(offered).not.toContain(action);
    }
  });
});

describe("record access uses the configured Manager scope", () => {
  const withScope = (scope?: string) => ({
    granted: new Set(),
    managerRecordScope: scope,
    isConfigured: true,
    managerScopeNeedsChoice: scope === undefined,
  });

  it("denies a Manager until the scope is chosen", () => {
    expect(
      recordAccess(withScope() as never, "manager", { isOwner: true }),
    ).toMatchObject({ allowed: false, reason: "manager_scope_not_configured" });
  });

  it("gives All Records every record in this workspace", () => {
    expect(
      recordAccess(withScope("all_records") as never, "manager", {}),
    ).toMatchObject({ allowed: true, basis: "manager_all_records" });
  });

  it("limits Own/Assigned/Shared to those three", () => {
    const settings = withScope("own_assigned_shared");
    expect(recordAccess(settings as never, "manager", {})).toMatchObject({
      allowed: false,
      reason: "no_qualifying_relationship",
    });
    expect(
      recordAccess(settings as never, "manager", { isOwner: true }),
    ).toMatchObject({ allowed: true, basis: "owner" });
  });

  it("is unaffected by a granted permission", () => {
    // A permission says what a role may do; it is never access to a record.
    const settings = {
      granted: new Set(["view_all_leads_customers"]),
      managerRecordScope: "own_assigned_shared",
      isConfigured: true,
      managerScopeNeedsChoice: false,
    };
    expect(recordAccess(settings as never, "manager", {})).toMatchObject({
      allowed: false,
      reason: "no_qualifying_relationship",
    });
  });
});

describe("writing a permission", () => {
  it("refuses a non-configurable cell without touching the database", async () => {
    expect(
      await setPermissionGranted(CONTEXT, "manage_sales_teams", true),
    ).toEqual({
      ok: false,
      reason: "not_configurable_cell",
    });
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("refuses an unknown action without touching the database", async () => {
    expect(await setPermissionGranted(CONTEXT, "nonsense", true)).toEqual({
      ok: false,
      reason: "not_configurable_cell",
    });
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("reads and writes in one transaction", async () => {
    columnsPresent();
    rows.push([{ permissions_granted: [] }]);
    rows.push([{ permissions_granted: ["import_export"] }]);
    const result = await setPermissionGranted(CONTEXT, "import_export", true);

    expect(result).toEqual({ ok: true, granted: ["import_export"] });
    expect(withTenant).toHaveBeenCalledTimes(1);
    expect(statements[2]).toMatch(/^update public\.workspaces/);
  });

  it("reports a row-level-security refusal rather than claiming success", async () => {
    columnsPresent();
    rows.push([{ permissions_granted: [] }]);
    rows.push([]); // UPDATE matched nothing: not an owner_admin here
    expect(await setPermissionGranted(CONTEXT, "import_export", true)).toEqual({
      ok: false,
      reason: "not_configurable",
    });
  });

  it("stores the matrix's order, not the click order", async () => {
    columnsPresent();
    rows.push([{ permissions_granted: ["import_export"] }]);
    rows.push([{ permissions_granted: [] }]);
    const result = await setPermissionGranted(
      CONTEXT,
      "change_record_owner",
      true,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // change_record_owner precedes import_export in §162.
    expect(result.granted).toEqual(["change_record_owner", "import_export"]);
  });
});

describe("writing the Manager scope", () => {
  it("accepts only the two §162.1 values", async () => {
    expect(await setManagerRecordScope(CONTEXT, "everything")).toEqual({
      ok: false,
      reason: "unknown_scope",
    });
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("writes a valid scope", async () => {
    columnsPresent();
    rows.push([{ manager_record_scope: "all_records" }]);
    expect(await setManagerRecordScope(CONTEXT, "all_records")).toEqual({
      ok: true,
      scope: "all_records",
    });
  });

  it("reports a refused write rather than claiming success", async () => {
    columnsPresent();
    rows.push([]);
    expect(await setManagerRecordScope(CONTEXT, "all_records")).toEqual({
      ok: false,
      reason: "not_configurable",
    });
  });
});

describe("the migration's closed set matches the matrix", () => {
  it("lists exactly the §162 Configurable cells, and no others", async () => {
    // The column's check constraint is a second, independent copy of the same
    // fact. If they drift, either the database refuses something the product
    // offers, or it accepts something the policy ignores.
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(
      "supabase/migrations/20261014140000_workspace_permissions.sql",
      "utf8",
    );
    const block = sql.slice(
      sql.indexOf("workspaces_permissions_granted_known"),
      sql.indexOf("manager_record_scope"),
    );
    const inSql = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const inMatrix = CONFIGURABLE_PERMISSIONS.map(
      (entry) => entry.action,
    ).sort();

    expect(inSql).toEqual(inMatrix);
  });

  it("constrains the Manager scope to the two §162.1 values", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(
      "supabase/migrations/20261014140000_workspace_permissions.sql",
      "utf8",
    );
    expect(sql).toContain("in ('all_records', 'own_assigned_shared')");
  });

  it("grants the runtime role UPDATE on both new columns", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile(
      "supabase/migrations/20261014140000_workspace_permissions.sql",
      "utf8",
    );
    const grant = sql.slice(sql.indexOf("grant update ("));
    expect(grant).toContain("permissions_granted");
    expect(grant).toContain("manager_record_scope");
    // The column-scoped grant must keep the earlier columns, or they become
    // unwritable.
    expect(grant).toContain("enabled_modules");
    expect(grant).toContain("time_zone");
  });
});
