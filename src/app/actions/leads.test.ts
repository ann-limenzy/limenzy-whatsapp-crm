import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adding a Lead: the gates, and the override — spec §32, §130.1, §162, §172.
 *
 * A Server Action is reachable by anyone who can POST to it, so these ask
 * what happens when someone calls one who should not: with Leads switched
 * off, without the §162 permission, with a stale workspace, and — the part
 * unique to this slice — asking for Create Anyway without holding it.
 *
 * The database answers the same questions from the other side in
 * `src/server/db/leads-isolation.db.test.ts`.
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

const gateway = vi.hoisted(() => ({ createLead: vi.fn() }));
/*
 * `createLead` is doubled; `describeForActor` is NOT. It is the pure function
 * that decides what may leave the server, so a test that substituted its own
 * copy would be asserting against the wrong thing entirely.
 */
vi.mock("@/server/auth/workspace-leads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/workspace-leads")>()),
  ...gateway,
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

/*
 * §32 opens the Lead Detail screen on success, and the action does it with a
 * server redirect rather than a client push — the two raced otherwise. The
 * real `redirect()` throws to unwind, so the double does too; that is what
 * callers must cope with.
 */
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

const actions = await import("./leads");

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const STAGE = "22222222-2222-4222-8222-222222222222";
const CONTEXT = { workspaceId: WORKSPACE, userProfileId: "p" };
const IDLE = { status: "idle" as const, attempt: 0 };

const form = (fields: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    renderedWorkspaceId: WORKSPACE,
    name: "Rajesh Menon",
    phone: "+919876543210",
    email: "",
    notes: "",
    stageId: STAGE,
    sourceId: "",
    ...fields,
  })) {
    data.set(key, value);
  }
  return data;
};

/** Everything allowed, nothing yet decided about the override. */
const allow = (overrides: { mayOverride?: boolean } = {}) => {
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
          : true,
    }),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  gateway.createLead.mockResolvedValue({ ok: true, leadId: "lead-1" });
});

describe("the module gate", () => {
  it("refuses when Leads is switched off, before reading the form", async () => {
    requireWorkspaceContext.mockResolvedValue({
      context: CONTEXT,
      role: "owner_admin",
      workspaceId: WORKSPACE,
    });
    enabledModulesFor.mockResolvedValue({ enabled: new Set(["whatsapp"]) });

    const state = await actions.addLeadAction(IDLE, form());
    expect(state.status).toBe("module_disabled");
    expect(gateway.createLead).not.toHaveBeenCalled();
    // The permission was never consulted: the module decides first.
    expect(permissions.permissionFor).not.toHaveBeenCalled();
  });
});

describe("§162 add_leads_customers", () => {
  it("refuses an actor the workspace has not granted it", async () => {
    requireWorkspaceContext.mockResolvedValue({
      context: CONTEXT,
      role: "staff_sales",
      workspaceId: WORKSPACE,
    });
    enabledModulesFor.mockResolvedValue({ enabled: new Set(["leads"]) });
    permissions.workspacePermissionSettings.mockResolvedValue({});
    permissions.permissionFor.mockReturnValue({ allowed: false });

    const state = await actions.addLeadAction(IDLE, form());
    expect(state.status).toBe("forbidden");
    expect(gateway.createLead).not.toHaveBeenCalled();
  });
});

describe("the workspace the form was rendered for", () => {
  it("refuses a submission from a different workspace", async () => {
    allow();
    const state = await actions.addLeadAction(
      IDLE,
      form({ renderedWorkspaceId: "33333333-3333-4333-8333-333333333333" }),
    );
    expect(state.status).toBe("stale");
    expect(gateway.createLead).not.toHaveBeenCalled();
  });

  it("refuses a submission that names no workspace at all", async () => {
    allow();
    const state = await actions.addLeadAction(
      IDLE,
      form({ renderedWorkspaceId: "" }),
    );
    expect(state.status).toBe("stale");
  });
});

describe("validation", () => {
  it("returns field problems without touching the gateway", async () => {
    allow();
    const state = await actions.addLeadAction(
      IDLE,
      form({ name: "", phone: "", email: "" }),
    );
    expect(state.status).toBe("invalid");
    expect(state.problems?.map((p) => p.issue).sort()).toEqual([
      "contact_required",
      "name_required",
    ]);
    expect(gateway.createLead).not.toHaveBeenCalled();
  });

  it("passes the normalised values through, not the typed ones", async () => {
    allow();
    await actions
      .addLeadAction(
        IDLE,
        form({ phone: "+91 98765 43210", email: " Raj@Example.COM " }),
      )
      .catch(() => {});
    expect(gateway.createLead).toHaveBeenCalledWith(
      CONTEXT,
      expect.objectContaining({
        phone: "+91 98765 43210",
        phoneNormalised: "+919876543210",
        email: "Raj@Example.COM",
        emailNormalised: "raj@example.com",
      }),
      expect.anything(),
    );
  });
});

describe("§130.1 Create Anyway", () => {
  it("ignores an override with no acknowledgement from this server", async () => {
    /*
     * The defect this closes: posting the flag used to be approval enough,
     * so a client that always sent it never showed anyone the warning. The
     * permission was checked; that a warning HAPPENED was not.
     */
    allow({ mayOverride: true });
    await actions
      .addLeadAction(IDLE, form({ override: "true" }))
      .catch(() => {});
    expect(gateway.createLead).toHaveBeenCalledWith(
      CONTEXT,
      expect.anything(),
      expect.objectContaining({ override: false }),
    );
  });

  it("passes the override through once the warning has been acknowledged", async () => {
    allow({ mayOverride: true });
    gateway.createLead.mockResolvedValue({
      ok: false,
      reason: "duplicate",
      candidates: [{ id: "c1", matchedFields: ["phone"], visible: false }],
    });
    const warned = await actions.addLeadAction(IDLE, form());
    expect(warned.acknowledgement).toBeTruthy();

    gateway.createLead.mockResolvedValue({ ok: true, leadId: "lead-1" });
    await actions
      .addLeadAction(
        warned,
        form({
          override: "true",
          acknowledgement: warned.acknowledgement ?? "",
        }),
      )
      .catch(() => {});
    expect(gateway.createLead).toHaveBeenLastCalledWith(
      CONTEXT,
      expect.anything(),
      expect.objectContaining({ override: true }),
    );
  });

  it("requires a new warning once the submission changes", async () => {
    // "Changed data requires another warning": the acknowledgement is bound
    // to a fingerprint of exactly what would be written.
    allow({ mayOverride: true });
    gateway.createLead.mockResolvedValue({
      ok: false,
      reason: "duplicate",
      candidates: [{ id: "c1", matchedFields: ["phone"], visible: false }],
    });
    const warned = await actions.addLeadAction(IDLE, form());

    gateway.createLead.mockResolvedValue({ ok: true, leadId: "lead-1" });
    await actions
      .addLeadAction(
        warned,
        form({
          name: "Somebody Else",
          override: "true",
          acknowledgement: warned.acknowledgement ?? "",
        }),
      )
      .catch(() => {});
    expect(gateway.createLead).toHaveBeenLastCalledWith(
      CONTEXT,
      expect.anything(),
      expect.objectContaining({ override: false }),
    );
  });

  it("refuses an acknowledgement issued to another actor", async () => {
    allow({ mayOverride: true });
    gateway.createLead.mockResolvedValue({
      ok: false,
      reason: "duplicate",
      candidates: [{ id: "c1", matchedFields: ["phone"], visible: false }],
    });
    const warned = await actions.addLeadAction(IDLE, form());

    // The same submission, acknowledged for somebody else.
    requireWorkspaceContext.mockResolvedValue({
      context: { ...CONTEXT, userProfileId: "someone-else" },
      role: "owner_admin",
      workspaceId: WORKSPACE,
    });
    gateway.createLead.mockResolvedValue({ ok: true, leadId: "lead-2" });
    await actions
      .addLeadAction(
        warned,
        form({
          override: "true",
          acknowledgement: warned.acknowledgement ?? "",
        }),
      )
      .catch(() => {});
    expect(gateway.createLead).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ override: false }),
    );
  });

  it("ignores an override from an actor who may not", async () => {
    // §130.1 restricts Create Anyway to Manager and Owner/Admin. A posted
    // flag is a request, never an authority — the request is simply not
    // honoured, and the person gets the warning they would have seen anyway.
    allow({ mayOverride: false });
    await actions
      .addLeadAction(IDLE, form({ override: "true" }))
      .catch(() => {});
    expect(gateway.createLead).toHaveBeenCalledWith(
      CONTEXT,
      expect.anything(),
      expect.objectContaining({ override: false }),
    );
  });

  it("describes the candidates this actor may see, and counts the rest", async () => {
    allow({ mayOverride: false });
    gateway.createLead.mockResolvedValue({
      ok: false,
      reason: "duplicate",
      candidates: [
        {
          id: "visible-1",
          matchedFields: ["phone"],
          visible: true,
          name: "Rajesh Menon",
          phone: "+919876543210",
          email: null,
          stageName: "New",
        },
        { id: "hidden-1", matchedFields: ["email"], visible: false },
        { id: "hidden-2", matchedFields: ["phone"], visible: false },
      ],
    });

    const state = await actions.addLeadAction(IDLE, form());
    expect(state.status).toBe("duplicate");
    expect(state.mayOverride).toBe(false);
    expect(state.duplicates?.visible).toHaveLength(1);
    expect(state.duplicates?.hiddenMatches).toBe(2);
  });

  it("sends nothing about a candidate this actor may not access", async () => {
    /*
     * This state object is SERIALISED TO THE BROWSER, so what it carries is
     * what the person can read out of the response — not merely what the
     * component draws. §162.1 says a record they may not access must not be
     * revealed, and an id or a matched field would reveal one.
     */
    allow();
    gateway.createLead.mockResolvedValue({
      ok: false,
      reason: "duplicate",
      candidates: [
        { id: "hidden-1", matchedFields: ["email"], visible: false },
        { id: "hidden-2", matchedFields: ["phone"], visible: false },
      ],
    });

    const state = await actions.addLeadAction(IDLE, form());
    const wire = JSON.stringify(state);
    expect(wire).not.toContain("hidden-1");
    expect(wire).not.toContain("hidden-2");
    // Not even which field matched, which would say what is known about them.
    expect(state.duplicates?.visible).toEqual([]);
    expect(state.duplicates?.hiddenMatches).toBe(2);
  });

  it("records an explanation, capped", async () => {
    allow();
    gateway.createLead.mockResolvedValue({
      ok: false,
      reason: "duplicate",
      candidates: [{ id: "c1", matchedFields: ["phone"], visible: false }],
    });
    const warned = await actions.addLeadAction(IDLE, form());
    gateway.createLead.mockResolvedValue({ ok: true, leadId: "lead-1" });
    await actions
      .addLeadAction(
        warned,
        form({
          override: "true",
          acknowledgement: warned.acknowledgement ?? "",
          overrideExplanation: "x".repeat(2000),
        }),
      )
      .catch(() => {});
    const options = gateway.createLead.mock.calls.at(-1)?.[2] as {
      overrideExplanation: string;
    };
    expect(options.overrideExplanation).toHaveLength(1000);
  });

  it("stores no explanation when none was given", async () => {
    allow();
    await actions
      .addLeadAction(IDLE, form({ override: "true" }))
      .catch(() => {});
    const options = gateway.createLead.mock.calls[0]?.[2] as {
      overrideExplanation: string | null;
    };
    expect(options.overrideExplanation).toBeNull();
  });
});

describe("outcomes", () => {
  it("refreshes the list and opens the new lead", async () => {
    allow();
    await expect(actions.addLeadAction(IDLE, form())).rejects.toThrow(
      "NEXT_REDIRECT:/leads/lead-1",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/leads");
    expect(redirect).toHaveBeenCalledWith("/leads/lead-1");
  });

  it("translates a closed stage into its own message", async () => {
    allow();
    gateway.createLead.mockResolvedValue({
      ok: false,
      reason: "stage_unavailable",
    });
    expect((await actions.addLeadAction(IDLE, form())).status).toBe(
      "stage_unavailable",
    );
  });

  it("translates a refusal from the policy into 'forbidden'", async () => {
    allow();
    gateway.createLead.mockResolvedValue({
      ok: false,
      reason: "not_permitted",
    });
    expect((await actions.addLeadAction(IDLE, form())).status).toBe(
      "forbidden",
    );
  });

  it("counts attempts, so a repeated outcome still re-renders", async () => {
    allow();
    gateway.createLead.mockResolvedValue({ ok: false, reason: "refused" });
    const first = await actions.addLeadAction(IDLE, form());
    const second = await actions.addLeadAction(first, form());
    expect(second.attempt).toBe(first.attempt + 1);
  });
});
