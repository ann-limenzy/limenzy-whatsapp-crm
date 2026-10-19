import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Editing a Lead, moving it, and its history — the gates — spec §28, §37,
 * §39, §45, §48, §130.1, §162, §172.
 *
 * A Server Action is reachable by anyone who can POST to it, so these ask
 * what happens when someone calls one who should not: with Leads switched
 * off, without §162's `edit_permitted_records`, with a stale workspace, with
 * a lead id that is not one, with no revision — and, the part unique to
 * this slice, claiming a duplicate warning was answered when it was not.
 *
 * The database answers the same questions from the other side in
 * `src/server/db/lead-lifecycle.db.test.ts`.
 */

const requireWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-workspace", () => ({ requireWorkspaceContext }));

const enabledModulesFor = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-modules", () => ({ enabledModulesFor }));

const permissions = vi.hoisted(() => ({
  workspacePermissionSettings: vi.fn(),
  permissionFor: vi.fn(),
}));
vi.mock("@/server/auth/workspace-permissions", () => permissions);

/*
 * The mutations are doubled. `describeForActor` is NOT: it is the pure
 * function that decides what may leave the server about somebody else's
 * Lead, so a test substituting its own copy would assert nothing.
 */
const gateway = vi.hoisted(() => ({
  editLead: vi.fn(),
  changeLeadStage: vi.fn(),
  markLeadWon: vi.fn(),
  markLeadLost: vi.fn(),
  reopenLead: vi.fn(),
  addLeadNote: vi.fn(),
  reassignLead: vi.fn(),
}));
vi.mock("@/server/auth/workspace-leads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/workspace-leads")>()),
  ...gateway,
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

/*
 * A transfer that costs the actor their own access redirects from the
 * SERVER. The real `redirect()` throws to unwind, so the double does too —
 * that is what callers have to cope with.
 */
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

process.env.DATABASE_URL ||=
  "postgresql://limenzy_app:test@127.0.0.1:54322/postgres";

const actions = await import("./lead-lifecycle");
const { issueDuplicateAcknowledgement } =
  await import("@/server/auth/lead-duplicate-acknowledgement");
const { parseLead } = await import("@/lib/validation/leads");

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const OTHER_LEAD = "33333333-3333-4333-8333-333333333333";
const STAGE = "44444444-4444-4444-8444-444444444444";
const CONTEXT = { workspaceId: WORKSPACE, userProfileId: "p" };
const IDLE = { status: "idle" as const, attempt: 0 };

const FIELDS = {
  renderedWorkspaceId: WORKSPACE,
  leadId: LEAD,
  revision: "3",
  name: "Rajesh Menon",
  phone: "+919876543210",
  email: "",
  notes: "",
  stageId: STAGE,
  sourceId: "",
};

const form = (fields: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...FIELDS, ...fields })) {
    data.set(key, value);
  }
  return data;
};

/** The same submission the action will parse, for signing a warning. */
const parsedFrom = (fields: Record<string, string> = {}) => {
  const merged = { ...FIELDS, ...fields };
  const result = parseLead({
    name: merged.name,
    phone: merged.phone,
    email: merged.email,
    notes: merged.notes,
    stageId: merged.stageId,
    sourceId: merged.sourceId,
  });
  if (!result.ok) throw new Error("fixture did not parse");
  return result.value;
};

const allow = (
  overrides: {
    mayOverride?: boolean;
    edit?: boolean;
    changeOwner?: boolean;
  } = {},
) => {
  requireWorkspaceContext.mockResolvedValue({
    context: CONTEXT,
    role: "owner_admin",
    workspaceId: WORKSPACE,
  });
  enabledModulesFor.mockResolvedValue({ enabled: new Set(["leads"]) });
  permissions.workspacePermissionSettings.mockResolvedValue({});
  permissions.permissionFor.mockImplementation(
    (_settings: unknown, _role: unknown, action: string) => ({
      allowed:
        action === "create_anyway_after_duplicate_warning"
          ? (overrides.mayOverride ?? true)
          : action === "edit_permitted_records"
            ? (overrides.edit ?? true)
            : action === "change_record_owner"
              ? (overrides.changeOwner ?? true)
              : true,
    }),
  );
};

const noGatewayCalls = () => {
  for (const double of Object.values(gateway)) {
    expect(double).not.toHaveBeenCalled();
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const double of Object.values(gateway)) {
    double.mockResolvedValue({ ok: true });
  }
});

describe("the gates, on every action", () => {
  const everyAction = [
    ["editLeadAction", () => actions.editLeadAction(IDLE, form())],
    [
      "changeLeadStageAction",
      () => actions.changeLeadStageAction(IDLE, form()),
    ],
    ["markLeadWonAction", () => actions.markLeadWonAction(IDLE, form())],
    [
      "markLeadLostAction",
      () => actions.markLeadLostAction(IDLE, form({ lostReason: "price" })),
    ],
    ["reopenLeadAction", () => actions.reopenLeadAction(IDLE, form())],
    [
      "addLeadNoteAction",
      () => actions.addLeadNoteAction(IDLE, form({ note: "Called" })),
    ],
  ] as const;

  it("refuses every one when Leads is switched off", async () => {
    for (const [name, run] of everyAction) {
      vi.clearAllMocks();
      allow();
      enabledModulesFor.mockResolvedValue({ enabled: new Set(["whatsapp"]) });
      expect(`${name}:${(await run()).status}`).toBe(`${name}:module_disabled`);
      noGatewayCalls();
    }
  });

  it("refuses every one without §162's edit permission", async () => {
    for (const [name, run] of everyAction) {
      vi.clearAllMocks();
      allow({ edit: false });
      expect(`${name}:${(await run()).status}`).toBe(`${name}:forbidden`);
      noGatewayCalls();
    }
  });

  it("refuses every one when the form was rendered for another workspace", async () => {
    for (const [name, run] of everyAction) {
      vi.clearAllMocks();
      allow();
      requireWorkspaceContext.mockResolvedValue({
        context: CONTEXT,
        role: "owner_admin",
        workspaceId: "99999999-9999-4999-8999-999999999999",
      });
      expect(`${name}:${(await run()).status}`).toBe(`${name}:workspace_stale`);
      noGatewayCalls();
    }
  });

  it("refuses a lead id that is not one, before reaching the database", async () => {
    allow();
    expect(
      (await actions.editLeadAction(IDLE, form({ leadId: "not-a-uuid" })))
        .status,
    ).toBe("forbidden");
    expect(
      (await actions.editLeadAction(IDLE, form({ leadId: "" }))).status,
    ).toBe("forbidden");
    noGatewayCalls();
  });

  it("counts the attempt, so a repeated answer is still a new one", async () => {
    allow();
    const state = await actions.editLeadAction(
      { status: "ok", attempt: 4 },
      form(),
    );
    expect(state.attempt).toBe(5);
  });
});

describe("the stale-edit token", () => {
  const needRevision = [
    ["editLeadAction", (data: FormData) => actions.editLeadAction(IDLE, data)],
    [
      "changeLeadStageAction",
      (data: FormData) => actions.changeLeadStageAction(IDLE, data),
    ],
    [
      "markLeadWonAction",
      (data: FormData) => actions.markLeadWonAction(IDLE, data),
    ],
    [
      "markLeadLostAction",
      (data: FormData) => actions.markLeadLostAction(IDLE, data),
    ],
    [
      "reopenLeadAction",
      (data: FormData) => actions.reopenLeadAction(IDLE, data),
    ],
  ] as const;

  it("treats a missing or malformed revision as stale", async () => {
    for (const bad of ["", "0", "-1", "1.5", "abc", "99999999999999"]) {
      for (const [name, run] of needRevision) {
        vi.clearAllMocks();
        allow();
        const state = await run(
          form({ revision: bad, lostReason: "price", stageId: STAGE }),
        );
        expect(`${name}/${bad}:${state.status}`).toBe(`${name}/${bad}:stale`);
        noGatewayCalls();
      }
    }
  });

  it("passes the revision the form carried through to the gateway", async () => {
    allow();
    await actions.markLeadWonAction(IDLE, form({ revision: "7" }));
    expect(gateway.markLeadWon).toHaveBeenCalledWith(CONTEXT, LEAD, 7);
  });

  it("asks for no revision to add a note, because a note changes no field", async () => {
    allow();
    const state = await actions.addLeadNoteAction(
      IDLE,
      form({ revision: "", note: "Spoke to them" }),
    );
    expect(state.status).toBe("ok");
    expect(gateway.addLeadNote).toHaveBeenCalledWith(
      CONTEXT,
      LEAD,
      "Spoke to them",
    );
  });
});

describe("§130.1 on an edit: the warning cannot be skipped", () => {
  it("ignores a bare override=true and asks the gateway not to override", async () => {
    allow();
    gateway.editLead.mockResolvedValue({
      ok: false,
      reason: "duplicate",
      candidates: [],
    });

    const state = await actions.editLeadAction(
      IDLE,
      form({ override: "true" }),
    );
    expect(gateway.editLead).toHaveBeenCalledWith(
      CONTEXT,
      LEAD,
      3,
      expect.anything(),
      expect.objectContaining({ override: false }),
    );
    expect(state.status).toBe("duplicate");
  });

  it("honours an acknowledgement this server issued for this submission", async () => {
    allow();
    const acknowledgement = issueDuplicateAcknowledgement(
      WORKSPACE,
      CONTEXT.userProfileId,
      LEAD,
      parsedFrom(),
    );
    await actions.editLeadAction(
      IDLE,
      form({ override: "true", acknowledgement }),
    );
    expect(gateway.editLead).toHaveBeenCalledWith(
      CONTEXT,
      LEAD,
      3,
      expect.anything(),
      expect.objectContaining({ override: true }),
    );
  });

  it("refuses an acknowledgement issued for a different Lead", async () => {
    allow();
    // The binding this slice added: a warning answered on one Lead cannot be
    // replayed against another, nor one issued while creating a new Lead.
    for (const issuedFor of [OTHER_LEAD, null]) {
      vi.clearAllMocks();
      allow();
      const acknowledgement = issueDuplicateAcknowledgement(
        WORKSPACE,
        CONTEXT.userProfileId,
        issuedFor,
        parsedFrom(),
      );
      await actions.editLeadAction(
        IDLE,
        form({ override: "true", acknowledgement }),
      );
      expect(gateway.editLead).toHaveBeenCalledWith(
        CONTEXT,
        LEAD,
        3,
        expect.anything(),
        expect.objectContaining({ override: false }),
      );
    }
  });

  it("refuses an acknowledgement whose submission has since changed", async () => {
    allow();
    const acknowledgement = issueDuplicateAcknowledgement(
      WORKSPACE,
      CONTEXT.userProfileId,
      LEAD,
      parsedFrom(),
    );
    await actions.editLeadAction(
      IDLE,
      form({
        override: "true",
        acknowledgement,
        phone: "+919000000009",
      }),
    );
    expect(gateway.editLead).toHaveBeenCalledWith(
      CONTEXT,
      LEAD,
      3,
      expect.anything(),
      expect.objectContaining({ override: false }),
    );
  });

  it("refuses a valid acknowledgement from someone without the permission", async () => {
    allow({ mayOverride: false });
    const acknowledgement = issueDuplicateAcknowledgement(
      WORKSPACE,
      CONTEXT.userProfileId,
      LEAD,
      parsedFrom(),
    );
    await actions.editLeadAction(
      IDLE,
      form({ override: "true", acknowledgement }),
    );
    expect(gateway.editLead).toHaveBeenCalledWith(
      CONTEXT,
      LEAD,
      3,
      expect.anything(),
      expect.objectContaining({ override: false }),
    );
  });

  it("returns only the permitted summary of what it found", async () => {
    allow();
    gateway.editLead.mockResolvedValue({
      ok: false,
      reason: "duplicate",
      candidates: [
        {
          id: OTHER_LEAD,
          name: "Someone Else",
          accessible: false,
          matchedFields: ["phone"],
          recordOwnerUserProfileId: "other",
        },
      ],
    });

    const state = await actions.editLeadAction(IDLE, form());
    expect(state.status).toBe("duplicate");
    // §162.1: the id and the matched field of an inaccessible Lead stay on
    // the server. Serialised and searched, because that is what reaches the
    // browser.
    const wire = JSON.stringify(state);
    expect(wire).not.toContain(OTHER_LEAD);
    expect(wire).not.toContain("Someone Else");
    expect(state.acknowledgement).toBeTruthy();
    expect(state.mayOverride).toBe(true);
  });
});

describe("§48's reason is required and fixed", () => {
  it("refuses a reason that is not one of §33's", async () => {
    allow();
    const state = await actions.markLeadLostAction(
      IDLE,
      form({ lostReason: "ran_out_of_budget" }),
    );
    expect(state).toMatchObject({
      status: "invalid",
      issue: "reason_required",
    });
    noGatewayCalls();
  });

  it("requires an explanation for Something else", async () => {
    allow();
    const state = await actions.markLeadLostAction(
      IDLE,
      form({ lostReason: "other", lostReasonNote: "  " }),
    );
    expect(state).toMatchObject({
      status: "invalid",
      issue: "explanation_required",
    });
    noGatewayCalls();
  });

  it("passes the reason and its note through", async () => {
    allow();
    await actions.markLeadLostAction(
      IDLE,
      form({ lostReason: "price", lostReasonNote: " Too expensive " }),
    );
    expect(gateway.markLeadLost).toHaveBeenCalledWith(CONTEXT, LEAD, 3, {
      reason: "price",
      note: "Too expensive",
    });
  });
});

describe("notes", () => {
  it("refuses an empty note and one past the limit", async () => {
    allow();
    expect(
      await actions.addLeadNoteAction(IDLE, form({ note: "   " })),
    ).toMatchObject({ status: "invalid", issue: "note_required" });
    expect(
      await actions.addLeadNoteAction(IDLE, form({ note: "x".repeat(2001) })),
    ).toMatchObject({ status: "invalid", issue: "note_too_long" });
    noGatewayCalls();
  });
});

describe("a stage that is not a stage", () => {
  it("refuses a malformed stage id without asking the database", async () => {
    allow();
    for (const run of [
      actions.changeLeadStageAction,
      actions.reopenLeadAction,
    ]) {
      vi.clearAllMocks();
      allow();
      const state = await run(IDLE, form({ stageId: "nope" }));
      expect(state.status).toBe("stage_unavailable");
      noGatewayCalls();
    }
  });
});

describe("what the gateway says, said plainly", () => {
  const cases = [
    ["not_permitted", "forbidden"],
    ["stale", "stale"],
    ["stage_unavailable", "stage_unavailable"],
    ["outcome_missing", "outcome_missing"],
    ["refused", "refused"],
    ["unavailable", "unavailable"],
  ] as const;

  it("maps each refusal to one status, and revalidates none of them", async () => {
    for (const [reason, status] of cases) {
      vi.clearAllMocks();
      allow();
      gateway.editLead.mockResolvedValue({ ok: false, reason });
      expect(
        `${reason}:${(await actions.editLeadAction(IDLE, form())).status}`,
      ).toBe(`${reason}:${status}`);
      // Nothing changed, so nothing is re-rendered — and nothing is retried.
      expect(revalidatePath).not.toHaveBeenCalled();
    }
  });

  it("revalidates the list once a change goes through", async () => {
    allow();
    expect((await actions.editLeadAction(IDLE, form())).status).toBe("ok");
    expect(revalidatePath).toHaveBeenCalledWith("/leads");
  });

  it("never retries a concurrency abort by itself", async () => {
    allow();
    gateway.changeLeadStage.mockResolvedValue({
      ok: false,
      reason: "unavailable",
    });
    const state = await actions.changeLeadStageAction(IDLE, form());
    expect(state.status).toBe("unavailable");
    // One attempt. A mutation that aborted is the person's to repeat.
    expect(gateway.changeLeadStage).toHaveBeenCalledTimes(1);
  });
});

describe("§162: reassignment is gated on its own permission", () => {
  const form = (fields: Record<string, string> = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({
      renderedWorkspaceId: WORKSPACE,
      leadId: LEAD,
      revision: "3",
      newOwnerUserProfileId: "55555555-5555-4555-8555-555555555555",
      ...fields,
    })) {
      data.set(key, value);
    }
    return data;
  };

  beforeEach(() => {
    gateway.reassignLead.mockResolvedValue({
      ok: true,
      retainsAccess: true,
      previousOwnerUserProfileId: "p",
    });
  });

  it("refuses an actor who may edit but may not change the owner", async () => {
    /*
     * The distinction §162 draws: `edit_permitted_records` is ALLOW for all
     * three roles, Change Record Owner is DENY for Staff/Sales. Holding one
     * is not holding the other, and the action must not treat it as such.
     */
    allow({ edit: true, changeOwner: false });
    const state = await actions.reassignLeadAction(IDLE, form());
    expect(state.status).toBe("forbidden");
    expect(gateway.reassignLead).not.toHaveBeenCalled();
  });

  it("allows an actor who may change the owner but may not edit", async () => {
    // The gate is the right one, not merely a gate.
    allow({ edit: false, changeOwner: true });
    const state = await actions.reassignLeadAction(IDLE, form());
    expect(state.status).toBe("ok");
    expect(gateway.reassignLead).toHaveBeenCalledWith(
      CONTEXT,
      LEAD,
      3,
      "55555555-5555-4555-8555-555555555555",
    );
  });

  it("still refuses when Leads is switched off or the workspace is stale", async () => {
    allow();
    enabledModulesFor.mockResolvedValue({ enabled: new Set(["whatsapp"]) });
    expect((await actions.reassignLeadAction(IDLE, form())).status).toBe(
      "module_disabled",
    );

    allow();
    requireWorkspaceContext.mockResolvedValue({
      context: CONTEXT,
      role: "owner_admin",
      workspaceId: "99999999-9999-4999-8999-999999999999",
    });
    expect((await actions.reassignLeadAction(IDLE, form())).status).toBe(
      "workspace_stale",
    );
    expect(gateway.reassignLead).not.toHaveBeenCalled();
  });

  it("refuses a recipient that is not an id, before asking the database", async () => {
    allow();
    expect(
      (
        await actions.reassignLeadAction(
          IDLE,
          form({ newOwnerUserProfileId: "somebody" }),
        )
      ).status,
    ).toBe("recipient_unavailable");
    expect(gateway.reassignLead).not.toHaveBeenCalled();
  });

  it("treats a missing revision as stale", async () => {
    allow();
    expect(
      (await actions.reassignLeadAction(IDLE, form({ revision: "" }))).status,
    ).toBe("stale");
    expect(gateway.reassignLead).not.toHaveBeenCalled();
  });

  it("says each refusal in its own words", async () => {
    const cases = [
      ["unchanged", "unchanged"],
      ["stale", "stale"],
      ["recipient_inactive", "recipient_unavailable"],
      ["unknown_recipient", "recipient_unavailable"],
      ["not_permitted", "forbidden"],
      ["unavailable", "unavailable"],
    ] as const;
    for (const [reason, status] of cases) {
      vi.clearAllMocks();
      allow();
      gateway.reassignLead.mockResolvedValue({ ok: false, reason });
      const state = await actions.reassignLeadAction(IDLE, form());
      expect(`${reason}:${state.status}`).toBe(`${reason}:${status}`);
      // Nothing changed, so nothing is re-rendered and nothing is retried.
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(gateway.reassignLead).toHaveBeenCalledTimes(1);
    }
  });

  it("sends the actor back to the list when the Lead leaves their scope", async () => {
    allow();
    gateway.reassignLead.mockResolvedValue({
      ok: true,
      retainsAccess: false,
      previousOwnerUserProfileId: "p",
    });
    // A server redirect, which throws to unwind — a success, not an error.
    await expect(actions.reassignLeadAction(IDLE, form())).rejects.toThrow(
      "NEXT_REDIRECT:/leads?handed-over=1",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/leads");
  });

  it("stays on the Lead when the actor can still see it", async () => {
    allow();
    const state = await actions.reassignLeadAction(IDLE, form());
    expect(state).toMatchObject({ status: "ok", retainsAccess: true });
    expect(redirect).not.toHaveBeenCalled();
  });
});
