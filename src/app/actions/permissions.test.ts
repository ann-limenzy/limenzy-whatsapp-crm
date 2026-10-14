import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Authorization for the permission settings mutations — spec §162, §162.1.
 *
 * A Server Action is reachable by anyone who can POST to it, so these tests
 * ask what happens when someone calls it who should not be able to — and
 * whether a rule the specification has not approved can be granted.
 */

const requireWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-workspace", () => ({ requireWorkspaceContext }));

const setPermissionGranted = vi.hoisted(() => vi.fn());
const setManagerRecordScope = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-permissions", () => ({
  setPermissionGranted,
  setManagerRecordScope,
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const { setPermissionGrantedAction, setManagerRecordScopeAction } =
  await import("./permissions");

const CONTEXT = { workspaceId: "w" };

const permissionForm = (permission: string, grant: string) => {
  const data = new FormData();
  data.set("permission", permission);
  data.set("grant", grant);
  return data;
};
const scopeForm = (scope: string) => {
  const data = new FormData();
  data.set("scope", scope);
  return data;
};

const as = (role: string) =>
  requireWorkspaceContext.mockResolvedValue({
    context: CONTEXT,
    role,
    workspaceId: "w",
  });

beforeEach(() => {
  vi.clearAllMocks();
  setPermissionGranted.mockResolvedValue({
    ok: true,
    granted: ["import_export"],
  });
  setManagerRecordScope.mockResolvedValue({ ok: true, scope: "all_records" });
});

describe("only an Owner/Admin may configure permissions (§162)", () => {
  it("allows an owner_admin to grant a configurable cell", async () => {
    as("owner_admin");
    expect(
      await setPermissionGrantedAction(
        { status: "idle" },
        permissionForm("import_export", "true"),
      ),
    ).toEqual({ status: "ok" });
    expect(setPermissionGranted).toHaveBeenCalledWith(
      CONTEXT,
      "import_export",
      true,
    );
  });

  it.each(["manager", "staff_sales"])("refuses a %s", async (role) => {
    as(role);
    expect(
      await setPermissionGrantedAction(
        { status: "idle" },
        permissionForm("import_export", "true"),
      ),
    ).toEqual({ status: "forbidden" });
    // The decisive assertion: nothing reached the database.
    expect(setPermissionGranted).not.toHaveBeenCalled();
  });

  it.each(["manager", "staff_sales"])(
    "refuses a %s changing the scope",
    async (role) => {
      as(role);
      expect(
        await setManagerRecordScopeAction(
          { status: "idle" },
          scopeForm("all_records"),
        ),
      ).toEqual({ status: "forbidden" });
      expect(setManagerRecordScope).not.toHaveBeenCalled();
    },
  );

  it("takes the role from the membership, never from the form", async () => {
    as("manager");
    const data = permissionForm("import_export", "true");
    data.set("role", "owner_admin");

    expect(await setPermissionGrantedAction({ status: "idle" }, data)).toEqual({
      status: "forbidden",
    });
  });

  it("acts only in the workspace the request resolved", async () => {
    as("owner_admin");
    const data = permissionForm("import_export", "true");
    data.set("workspaceId", "another-workspace");

    await setPermissionGrantedAction({ status: "idle" }, data);
    expect(setPermissionGranted).toHaveBeenCalledWith(
      CONTEXT,
      "import_export",
      true,
    );
  });

  it("resolves the workspace before doing anything else", async () => {
    requireWorkspaceContext.mockRejectedValue(new Error("not signed in"));
    await expect(
      setPermissionGrantedAction(
        { status: "idle" },
        permissionForm("import_export", "true"),
      ),
    ).rejects.toThrow();
    expect(setPermissionGranted).not.toHaveBeenCalled();
  });
});

describe("a rule the specification has not approved cannot be granted", () => {
  it.each([
    ["a Decision-required cell", "manage_sales_teams"],
    ["another Decision-required cell", "configure_lead_assignment_rules"],
    ["a fixed No", "manage_users"],
    ["a fixed Yes", "edit_permitted_records"],
    ["an unknown action", "delete_everything"],
    ["a prototype name", "toString"],
  ])("refuses %s before reaching the database", async (_why, permission) => {
    as("owner_admin");
    expect(
      await setPermissionGrantedAction(
        { status: "idle" },
        permissionForm(permission, "true"),
      ),
    ).toEqual({ status: "invalid" });
    expect(setPermissionGranted).not.toHaveBeenCalled();
  });
});

describe("input validation", () => {
  it.each([
    ["a non-boolean grant", "import_export", "yes"],
    ["an empty grant", "import_export", ""],
    ["an empty permission", "", "true"],
  ])("rejects %s", async (_why, permission, grant) => {
    as("owner_admin");
    expect(
      await setPermissionGrantedAction(
        { status: "idle" },
        permissionForm(permission, grant),
      ),
    ).toEqual({ status: "invalid" });
  });

  it("rejects a missing field rather than defaulting it", async () => {
    as("owner_admin");
    expect(
      await setPermissionGrantedAction({ status: "idle" }, new FormData()),
    ).toEqual({ status: "invalid" });
  });

  it("rejects a scope outside the two §162.1 values", async () => {
    as("owner_admin");
    setManagerRecordScope.mockResolvedValue({
      ok: false,
      reason: "unknown_scope",
    });
    expect(
      await setManagerRecordScopeAction(
        { status: "idle" },
        scopeForm("everything"),
      ),
    ).toEqual({ status: "invalid" });
  });
});

describe("refusals and revalidation", () => {
  it("reports an unwritable configuration without saying why", async () => {
    as("owner_admin");
    setPermissionGranted.mockResolvedValue({
      ok: false,
      reason: "not_configurable",
    });
    expect(
      await setPermissionGrantedAction(
        { status: "idle" },
        permissionForm("import_export", "true"),
      ),
    ).toEqual({ status: "unavailable" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates the settings page after a permission change", async () => {
    as("owner_admin");
    await setPermissionGrantedAction(
      { status: "idle" },
      permissionForm("import_export", "true"),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("revalidates the whole tree after a visibility change", async () => {
    // Record visibility changes what Managers can reach, not just this page.
    as("owner_admin");
    await setManagerRecordScopeAction(
      { status: "idle" },
      scopeForm("all_records"),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
