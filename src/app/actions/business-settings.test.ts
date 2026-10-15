import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Authorization for the Business Settings mutation — spec §158, §162.
 *
 * A Server Action is reachable by anyone who can POST to it, so these tests
 * ask what happens when someone calls it who should not be able to, and
 * whether anything in the submitted payload can change who the server thinks
 * is calling or which workspace is written.
 *
 * The database checks the same thing again, from the other side, in
 * `src/server/db/settings-isolation.db.test.ts`. Neither suite is a substitute
 * for the other: this one proves nothing reaches the database, that one proves
 * the database refuses it if something ever does.
 */

const requireWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-workspace", () => ({ requireWorkspaceContext }));

const updateBusinessSettings = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-business-settings", () => ({
  updateBusinessSettings,
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const { saveBusinessSettingsAction } = await import("./business-settings");

const CONTEXT = { workspaceId: "w" };
const IDLE = { status: "idle" as const, attempt: 0 };
/** The workspace the form claims it was rendered for. */
const RENDERED = "renderedWorkspaceId";

const VALID = {
  name: "Limenzy Fincare",
  businessType: "Financial / Insurance",
  businessPhone: "+91 80 4000 1234",
  businessEmail: "hello@example.com",
  address: "12 Example Road\nBengaluru 560001",
  country: "IN",
  currency: "INR",
  timeZone: "Asia/Kolkata",
};

const form = (overrides: Record<string, string> = {}) => {
  const data = new FormData();
  const fields = { ...VALID, [RENDERED]: "w", ...overrides };
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
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
  updateBusinessSettings.mockResolvedValue({
    ok: true,
    settings: { ...VALID },
  });
});

describe("only an Owner/Admin may save business settings (§158)", () => {
  it("allows an owner_admin", async () => {
    as("owner_admin");
    const state = await saveBusinessSettingsAction(IDLE, form());
    expect(state.status).toBe("saved");
    expect(updateBusinessSettings).toHaveBeenCalledWith(CONTEXT, VALID);
  });

  it.each(["manager", "staff_sales"])("refuses a %s", async (role) => {
    as(role);
    const state = await saveBusinessSettingsAction(IDLE, form());
    expect(state.status).toBe("forbidden");
    // The decisive assertion: nothing reached the database.
    expect(updateBusinessSettings).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses an unrecognised role rather than falling through", async () => {
    as("some_future_role");
    const state = await saveBusinessSettingsAction(IDLE, form());
    expect(state.status).toBe("forbidden");
    expect(updateBusinessSettings).not.toHaveBeenCalled();
  });

  it("takes the role from the membership, never from the form", async () => {
    as("manager");
    const state = await saveBusinessSettingsAction(
      IDLE,
      form({ role: "owner_admin" }),
    );
    expect(state.status).toBe("forbidden");
    expect(updateBusinessSettings).not.toHaveBeenCalled();
  });

  it("checks the role before parsing, so a refusal reveals nothing about the fields", async () => {
    as("manager");
    const data = new FormData();
    data.set("name", "");
    const state = await saveBusinessSettingsAction(IDLE, data);
    // Not "invalid": a Manager learns that they may not do this, and nothing
    // about which fields exist or what they require.
    expect(state.status).toBe("forbidden");
    expect(state.fieldErrors).toBeUndefined();
  });

  it("resolves the workspace before doing anything else", async () => {
    requireWorkspaceContext.mockRejectedValue(new Error("not signed in"));
    await expect(saveBusinessSettingsAction(IDLE, form())).rejects.toThrow();
    expect(updateBusinessSettings).not.toHaveBeenCalled();
  });
});

describe("a form rendered for another workspace cannot write this one", () => {
  it("refuses when the rendered workspace is not the resolved one", async () => {
    // The scenario: Business Settings opened for workspace A, the workspace
    // switched in another tab, then Save. Without this, all eight of B's
    // fields would be overwritten with A's details, and reported as saved.
    as("owner_admin");
    const state = await saveBusinessSettingsAction(
      IDLE,
      form({ [RENDERED]: "a-different-workspace" }),
    );
    expect(state.status).toBe("stale");
    expect(updateBusinessSettings).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a submission that names no workspace at all", async () => {
    as("owner_admin");
    const data = form();
    data.delete(RENDERED);
    const state = await saveBusinessSettingsAction(IDLE, data);
    // Fails closed: a payload that cannot say what it was rendered for is
    // exactly the one that must not overwrite eight fields.
    expect(state.status).toBe("stale");
    expect(updateBusinessSettings).not.toHaveBeenCalled();
  });

  it("checks authorization before staleness", async () => {
    // Role first keeps the authorization boundary outermost: whether this
    // person may configure the workspace they are IN is settled before
    // anything the browser sent is consulted.
    as("manager");
    const state = await saveBusinessSettingsAction(
      IDLE,
      form({ [RENDERED]: "a-different-workspace" }),
    );
    expect(state.status).toBe("forbidden");
  });

  it("still writes to the resolved context, never to the named workspace", async () => {
    // The id is a detection, not a selection. Matching it changes nothing
    // about where the write goes.
    as("owner_admin");
    await saveBusinessSettingsAction(IDLE, form());
    expect(updateBusinessSettings).toHaveBeenCalledWith(CONTEXT, VALID);
  });

  it("does not parse the rendered workspace as a settings field", async () => {
    as("owner_admin");
    await saveBusinessSettingsAction(IDLE, form());
    const [, written] = updateBusinessSettings.mock.calls[0] ?? [];
    expect(Object.keys(written ?? {}).sort()).toEqual(
      Object.keys(VALID).sort(),
    );
  });

  it("keeps the field name the form sends in step with the one it reads", async () => {
    const { readFile } = await import("node:fs/promises");
    const component = await readFile(
      "src/components/settings/business-settings-form.tsx",
      "utf8",
    );
    // The name cannot be shared through the `"use server"` module, so this is
    // what holds the two spellings together.
    expect(component).toContain(`name="${RENDERED}"`);
  });
});

describe("the write lands in the workspace the request resolved", () => {
  it.each(["workspaceId", "id", "role", "enabledModules"])(
    "ignores %s in the payload entirely",
    async (key) => {
      as("owner_admin");
      await saveBusinessSettingsAction(IDLE, form({ [key]: "injected" }));
      // The action reads eight named fields and nothing else, so an extra key
      // is never read rather than being read and then rejected. The gateway
      // still receives the resolved context and only the §158 values.
      expect(updateBusinessSettings).toHaveBeenCalledWith(CONTEXT, VALID);
    },
  );

  it("passes the resolved context, and nothing else, to the gateway", async () => {
    as("owner_admin");
    await saveBusinessSettingsAction(IDLE, form());
    expect(updateBusinessSettings).toHaveBeenCalledTimes(1);
    // Identity, not equality: the context object the gate returned is the one
    // handed on, so nothing reconstructed a lookalike from the payload.
    expect(updateBusinessSettings.mock.calls[0]?.[0]).toBe(CONTEXT);
  });
});

describe("validation", () => {
  it("returns field errors without touching the database", async () => {
    as("owner_admin");
    const state = await saveBusinessSettingsAction(
      IDLE,
      form({ name: "", businessEmail: "not-an-address", country: "ZZ" }),
    );
    expect(state.status).toBe("invalid");
    expect(state.fieldErrors?.name).toBeDefined();
    expect(state.fieldErrors?.businessEmail).toBeDefined();
    expect(state.fieldErrors?.country).toBeDefined();
    expect(updateBusinessSettings).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports one message per field", async () => {
    as("owner_admin");
    const state = await saveBusinessSettingsAction(
      IDLE,
      form({ businessEmail: "x".repeat(300) }),
    );
    expect(state.status).toBe("invalid");
    expect(typeof state.fieldErrors?.businessEmail).toBe("string");
  });

  it("normalises before writing, so the database sees trimmed values", async () => {
    as("owner_admin");
    await saveBusinessSettingsAction(
      IDLE,
      form({ name: "  Limenzy Fincare  ", country: "in", businessType: "  " }),
    );
    expect(updateBusinessSettings).toHaveBeenCalledWith(CONTEXT, {
      ...VALID,
      name: "Limenzy Fincare",
      country: "IN",
      businessType: null,
    });
  });

  it("treats a missing optional field as cleared, not as absent", async () => {
    as("owner_admin");
    const data = form();
    data.delete("businessPhone");
    await saveBusinessSettingsAction(IDLE, data);
    expect(updateBusinessSettings).toHaveBeenCalledWith(CONTEXT, {
      ...VALID,
      businessPhone: null,
    });
  });

  it("treats a non-string form value as empty rather than crashing", async () => {
    as("owner_admin");
    const data = form();
    data.set("businessPhone", new File([], "payload.txt"));
    await saveBusinessSettingsAction(IDLE, data);
    expect(updateBusinessSettings).toHaveBeenCalledWith(CONTEXT, {
      ...VALID,
      businessPhone: null,
    });
  });
});

describe("what the form is told afterwards", () => {
  it("returns the stored values, not what was submitted", async () => {
    as("owner_admin");
    updateBusinessSettings.mockResolvedValue({
      ok: true,
      settings: { ...VALID, name: "Stored Name" },
    });
    const state = await saveBusinessSettingsAction(IDLE, form());
    expect(state.settings?.name).toBe("Stored Name");
  });

  it("revalidates the whole tree, because the shell shows the name", async () => {
    as("owner_admin");
    await saveBusinessSettingsAction(IDLE, form());
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("reports a refused write without claiming it saved", async () => {
    as("owner_admin");
    updateBusinessSettings.mockResolvedValue({
      ok: false,
      reason: "not_permitted",
    });
    const state = await saveBusinessSettingsAction(IDLE, form());
    expect(state.status).toBe("unavailable");
    expect(state.settings).toBeUndefined();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["saved", { ok: true, settings: { ...VALID } }],
    ["a refusal", { ok: false, reason: "not_permitted" }],
  ])("advances the attempt counter on %s", async (_why, result) => {
    as("owner_admin");
    updateBusinessSettings.mockResolvedValue(result);
    const first = await saveBusinessSettingsAction(IDLE, form());
    const second = await saveBusinessSettingsAction(first, form());
    expect(first.attempt).toBe(1);
    expect(second.attempt).toBe(2);
  });

  it("advances the attempt counter on two identical failures", async () => {
    // Two failures that are otherwise indistinguishable still have to read as
    // two answers, or the form announces the second one to nobody.
    as("manager");
    const first = await saveBusinessSettingsAction(IDLE, form());
    const second = await saveBusinessSettingsAction(first, form());
    expect(second.attempt).toBe(first.attempt + 1);
  });
});
