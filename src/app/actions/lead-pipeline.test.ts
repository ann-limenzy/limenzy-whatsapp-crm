import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Authorization and the module gate — spec §34, §162, §171, §172.
 *
 * A Server Action is reachable by anyone who can POST to it, so these ask what
 * happens when someone calls one who should not, and — the part unique to this
 * slice — when Leads are switched off for the workspace entirely. §172 makes
 * Pipeline configuration available "only when Leads is enabled", and §30 hides
 * the whole module, so a disabled workspace must refuse the write rather than
 * merely hide the section.
 *
 * The database answers the same questions from the other side in
 * `src/server/db/lead-pipeline-isolation.db.test.ts`.
 */

const requireWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-workspace", () => ({ requireWorkspaceContext }));

const enabledModulesFor = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-modules", () => ({ enabledModulesFor }));

const gateway = vi.hoisted(() => ({
  addLeadStage: vi.fn(),
  renameLeadStage: vi.fn(),
  moveLeadStage: vi.fn(),
  setLeadStageActive: vi.fn(),
  addLeadSource: vi.fn(),
  renameLeadSource: vi.fn(),
  setLeadSourceActive: vi.fn(),
}));
vi.mock("@/server/auth/workspace-lead-pipeline", () => gateway);

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const actions = await import("./lead-pipeline");

const STAGE = "33333333-3333-4333-8333-333333333333";
const CONTEXT = { workspaceId: "w", userProfileId: "p" };
const IDLE = { status: "idle" as const, attempt: 0 };

const form = (fields: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    renderedWorkspaceId: "w",
    ...fields,
  })) {
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

const modules = (...keys: string[]) =>
  enabledModulesFor.mockResolvedValue({ enabled: new Set(keys) });

/** Every write, so no action can quietly miss a gate. */
const WRITES = [
  ["addLeadStageAction", () => form({ name: "Quoted" }), "addLeadStage"],
  ["addLeadSourceAction", () => form({ name: "Expo" }), "addLeadSource"],
  [
    "renameLeadStageAction",
    () => form({ stageId: STAGE, name: "Reached" }),
    "renameLeadStage",
  ],
  [
    "renameLeadSourceAction",
    () => form({ sourceId: STAGE, name: "Expo" }),
    "renameLeadSource",
  ],
  [
    "moveLeadStageAction",
    () => form({ stageId: STAGE, direction: "up" }),
    "moveLeadStage",
  ],
  [
    "setLeadStageActiveAction",
    () => form({ stageId: STAGE, isActive: "false" }),
    "setLeadStageActive",
  ],
  [
    "setLeadSourceActiveAction",
    () => form({ sourceId: STAGE, isActive: "false" }),
    "setLeadSourceActive",
  ],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  as("owner_admin");
  modules("leads");
  for (const fn of Object.values(gateway)) fn.mockResolvedValue({ ok: true });
});

describe("only an Owner/Admin may configure this (§162, §171)", () => {
  it("lets an owner_admin through", async () => {
    for (const [name, build] of WRITES) {
      const state = await actions[name](IDLE, build());
      expect(state.status, name).toBe("ok");
    }
  });

  for (const role of ["manager", "staff_sales"]) {
    it(`refuses a ${role}, and reaches no gateway`, async () => {
      as(role);
      for (const [name, build] of WRITES) {
        const state = await actions[name](IDLE, build());
        expect(state.status, name).toBe("forbidden");
      }
      for (const fn of Object.values(gateway)) {
        expect(fn).not.toHaveBeenCalled();
      }
    });
  }
});

describe("Leads must be switched on (§172, §30)", () => {
  it("refuses every write when the module is off", async () => {
    modules("whatsapp", "email");
    for (const [name, build] of WRITES) {
      const state = await actions[name](IDLE, build());
      expect(state.status, name).toBe("module_disabled");
    }
    for (const fn of Object.values(gateway)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("checks the role before the module, so a Manager is never told which modules exist", async () => {
    as("manager");
    modules();
    const state = await actions.addLeadStageAction(IDLE, form({ name: "X" }));
    expect(state.status).toBe("forbidden");
    expect(enabledModulesFor).not.toHaveBeenCalled();
  });
});

describe("the workspace the form was rendered for", () => {
  it("refuses a submission for a different workspace", async () => {
    const data = form({ name: "Quoted", renderedWorkspaceId: "other" });
    expect((await actions.addLeadStageAction(IDLE, data)).status).toBe("stale");
    expect(gateway.addLeadStage).not.toHaveBeenCalled();
  });

  it("fails closed when the field is absent", async () => {
    const data = form({ name: "Quoted" });
    data.delete("renderedWorkspaceId");
    expect((await actions.addLeadStageAction(IDLE, data)).status).toBe("stale");
  });

  it("writes to the resolved workspace, never a submitted one", async () => {
    await actions.addLeadStageAction(
      IDLE,
      form({ name: "Quoted", workspaceId: "elsewhere" }),
    );
    expect(gateway.addLeadStage).toHaveBeenCalledWith(CONTEXT, "Quoted");
  });
});

describe("what reaches the gateway", () => {
  it("normalises the name first", async () => {
    await actions.addLeadStageAction(IDLE, form({ name: "  New   Lead  " }));
    expect(gateway.addLeadStage).toHaveBeenCalledWith(CONTEXT, "New Lead");
  });

  it("refuses an id that is not one", async () => {
    for (const stageId of ["", "nope", "' or 1=1 --", "../etc"]) {
      const state = await actions.renameLeadStageAction(
        IDLE,
        form({ stageId, name: "Reached" }),
      );
      expect(state.status, stageId).toBe("invalid");
    }
    expect(gateway.renameLeadStage).not.toHaveBeenCalled();
  });

  it("refuses a direction that is not up or down", async () => {
    for (const direction of ["", "sideways", "UP"]) {
      const state = await actions.moveLeadStageAction(
        IDLE,
        form({ stageId: STAGE, direction }),
      );
      expect(state.status, direction).toBe("invalid");
    }
    expect(gateway.moveLeadStage).not.toHaveBeenCalled();
  });

  it("reads the switch as a boolean, defaulting to off", async () => {
    await actions.setLeadStageActiveAction(
      IDLE,
      form({ stageId: STAGE, isActive: "true" }),
    );
    expect(gateway.setLeadStageActive).toHaveBeenCalledWith(
      CONTEXT,
      STAGE,
      true,
    );

    await actions.setLeadStageActiveAction(
      IDLE,
      form({ stageId: STAGE, isActive: "anything else" }),
    );
    expect(gateway.setLeadStageActive).toHaveBeenLastCalledWith(
      CONTEXT,
      STAGE,
      false,
    );
  });
});

describe("how a refusal is reported", () => {
  it("distinguishes a taken name from a rule and from a bad caller", async () => {
    for (const [reason, status] of [
      ["name_taken", "name_taken"],
      ["cannot_move", "cannot_move"],
      ["refused", "refused"],
      ["not_permitted", "forbidden"],
      ["unavailable", "unavailable"],
    ] as const) {
      gateway.addLeadStage.mockResolvedValue({ ok: false, reason });
      const state = await actions.addLeadStageAction(IDLE, form({ name: "X" }));
      expect(state.status, reason).toBe(status);
      expect(revalidatePath, reason).not.toHaveBeenCalled();
    }
  });

  it("names the row an outcome concerns, so a screen can place it", async () => {
    const state = await actions.renameLeadStageAction(
      IDLE,
      form({ stageId: STAGE, name: "Reached" }),
    );
    expect(state.targetId).toBe(STAGE);
  });

  it("advances the attempt counter whatever happens", async () => {
    as("manager");
    const first = await actions.addLeadStageAction(IDLE, form({ name: "X" }));
    const second = await actions.addLeadStageAction(first, form({ name: "X" }));
    expect([first.attempt, second.attempt]).toEqual([1, 2]);
  });
});
