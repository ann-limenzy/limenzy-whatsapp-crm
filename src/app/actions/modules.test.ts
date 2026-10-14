import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Authorization for the module settings mutation — spec §171, §162, §172.
 *
 * A Server Action is reachable by anyone who can POST to it, so the question
 * these tests ask is not "does the button work" but "what happens when someone
 * calls it who should not be able to".
 */

const requireWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-workspace", () => ({ requireWorkspaceContext }));

const setModuleEnabled = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-modules", () => ({ setModuleEnabled }));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const { setModuleEnabledAction } = await import("./modules");

const CONTEXT = { workspaceId: "w" };

const form = (module: string, enable: string) => {
  const data = new FormData();
  data.set("module", module);
  data.set("enable", enable);
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
  setModuleEnabled.mockResolvedValue({ ok: true, enabled: ["leads"] });
});

describe("only an Owner/Admin may change modules (§171)", () => {
  it("allows an owner_admin", async () => {
    as("owner_admin");
    const result = await setModuleEnabledAction(
      { status: "idle" },
      form("leads", "true"),
    );

    expect(result).toEqual({ status: "ok", enabled: ["leads"] });
    expect(setModuleEnabled).toHaveBeenCalledWith(CONTEXT, "leads", true);
  });

  it.each(["manager", "staff_sales"])("refuses a %s", async (role) => {
    as(role);
    const result = await setModuleEnabledAction(
      { status: "idle" },
      form("leads", "false"),
    );

    expect(result).toEqual({ status: "forbidden" });
    // The decisive assertion: nothing reached the database.
    expect(setModuleEnabled).not.toHaveBeenCalled();
  });

  it("refuses a role that is not one of the three", async () => {
    as("superuser");
    expect(
      await setModuleEnabledAction({ status: "idle" }, form("leads", "true")),
    ).toEqual({ status: "forbidden" });
    expect(setModuleEnabled).not.toHaveBeenCalled();
  });

  it("takes the role from the resolved membership, never from the form", async () => {
    as("staff_sales");
    const data = form("leads", "true");
    data.set("role", "owner_admin");

    expect(await setModuleEnabledAction({ status: "idle" }, data)).toEqual({
      status: "forbidden",
    });
  });

  it("resolves the workspace before doing anything else", async () => {
    requireWorkspaceContext.mockRejectedValue(new Error("not signed in"));

    await expect(
      setModuleEnabledAction({ status: "idle" }, form("leads", "true")),
    ).rejects.toThrow();
    expect(setModuleEnabled).not.toHaveBeenCalled();
  });

  it("acts only in the workspace the request resolved", async () => {
    as("owner_admin");
    const data = form("leads", "true");
    data.set("workspaceId", "some-other-workspace");

    await setModuleEnabledAction({ status: "idle" }, data);

    // The context is the resolved one; the form value is not read at all.
    expect(setModuleEnabled).toHaveBeenCalledWith(CONTEXT, "leads", true);
  });
});

describe("input is validated before the workspace is even resolved", () => {
  it.each([
    ["an unknown module", "sales_teams", "true"],
    ["a non-module string", "../../etc/passwd", "true"],
    ["an empty module", "", "true"],
    ["a non-boolean enable", "leads", "yes"],
    ["an empty enable", "leads", ""],
  ])("rejects %s", async (_why, module, enable) => {
    as("owner_admin");
    expect(
      await setModuleEnabledAction({ status: "idle" }, form(module, enable)),
    ).toEqual({ status: "invalid" });
    expect(setModuleEnabled).not.toHaveBeenCalled();
  });

  it("rejects a missing field rather than defaulting it", async () => {
    as("owner_admin");
    expect(
      await setModuleEnabledAction({ status: "idle" }, new FormData()),
    ).toEqual({ status: "invalid" });
  });
});

describe("the §172 dependency block reaches the user", () => {
  it("reports the explanation rather than a generic failure", async () => {
    as("owner_admin");
    setModuleEnabled.mockResolvedValue({
      ok: false,
      reason: "refused",
      refusal: {
        module: "products_services",
        enable: false,
        conflictsWith: "renewals_reminders",
        message:
          "Products & Services cannot be disabled while Renewals & Reminders is enabled. Disable Renewals & Reminders first.",
      },
    });

    const result = await setModuleEnabledAction(
      { status: "idle" },
      form("products_services", "false"),
    );

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") return;
    expect(result.message).toMatch(/Disable Renewals & Reminders first/);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports an unwritable configuration without saying why", async () => {
    as("owner_admin");
    setModuleEnabled.mockResolvedValue({
      ok: false,
      reason: "not_configurable",
    });

    expect(
      await setModuleEnabledAction({ status: "idle" }, form("leads", "true")),
    ).toEqual({ status: "unavailable" });
  });
});

describe("a successful change re-renders the navigation", () => {
  it("revalidates the layout, because the shell is built from this", async () => {
    as("owner_admin");
    await setModuleEnabledAction({ status: "idle" }, form("leads", "false"));

    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("does not revalidate when nothing changed", async () => {
    as("manager");
    await setModuleEnabledAction({ status: "idle" }, form("leads", "false"));

    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
