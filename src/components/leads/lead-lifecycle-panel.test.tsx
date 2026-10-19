import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * The Lead screen's controls, and the §39 timeline — §28, §37, §39, §45, §48.
 *
 * The Server Actions are doubled: they are the server boundary, and each one
 * re-checks the module, §162 and the workspace for itself
 * (`src/app/actions/lead-lifecycle.test.ts`). What is asserted here is what
 * the screen OFFERS, which is presentation:
 *
 *   · every control carries the Lead's revision, because a control that did
 *     not would make a stale save look like a successful one;
 *   · an open Lead offers Move, Mark as won and Mark as lost; a finished one
 *     offers Reopen and none of those;
 *   · a won Lead draws NO Convert button — §45 asks for one and there are no
 *     Customers, so the screen says when it will arrive instead;
 *   · §28's "no confirmation" for an edit or a note is visible as the
 *     absence of any such step.
 */

const actions = vi.hoisted(() => {
  const idle = { status: "idle", attempt: 0 };
  // Typed by what a Server Action receives, so a test that drives one has to
  // read the FormData the browser would actually have posted.
  type Action = (
    previous: { status: string; attempt: number },
    data: FormData,
  ) => Promise<Record<string, unknown>>;
  const noop = vi.fn<Action>(async () => idle);
  return {
    editLeadAction: noop,
    changeLeadStageAction: noop,
    markLeadWonAction: noop,
    markLeadLostAction: noop,
    reopenLeadAction: noop,
    addLeadNoteAction: noop,
  };
});
vi.mock("@/app/actions/lead-lifecycle", () => actions);

const { LeadLifecyclePanel } =
  await import("@/components/leads/lead-lifecycle-panel");
const { LeadDetailView } = await import("@/components/leads/lead-detail-view");

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const NEW_STAGE = "33333333-3333-4333-8333-333333333333";
const CONTACTED = "44444444-4444-4444-8444-444444444444";

const STAGES = [
  { id: NEW_STAGE, name: "New" },
  { id: CONTACTED, name: "Contacted" },
];
const SOURCES = [
  { id: "55555555-5555-4555-8555-555555555555", name: "Referral" },
];

const lead = (overrides: Record<string, unknown> = {}) =>
  ({
    id: LEAD,
    revision: 7,
    name: "Rajesh Menon",
    phone: "+919876543210",
    email: null,
    notes: null,
    stageId: NEW_STAGE,
    stageKind: "active",
    sourceId: null,
    lostReason: null,
    lostReasonNote: null,
    ...overrides,
  }) as Parameters<typeof LeadLifecyclePanel>[0]["lead"];

const panel = (overrides: Record<string, unknown> = {}) =>
  render(
    <LeadLifecyclePanel
      lead={lead(overrides)}
      stages={STAGES}
      sources={SOURCES}
      workspaceId={WORKSPACE}
    />,
  );

/** Every hidden identity field on every form, as the browser would post it. */
const identities = (container: HTMLElement) =>
  [...container.querySelectorAll("form")].map((form) => ({
    revision: form.querySelector<HTMLInputElement>('[name="revision"]')?.value,
    leadId: form.querySelector<HTMLInputElement>('[name="leadId"]')?.value,
    workspace: form.querySelector<HTMLInputElement>(
      '[name="renderedWorkspaceId"]',
    )?.value,
  }));

describe("what an open Lead offers", () => {
  it("offers the stage move, both outcomes, an edit and a note", () => {
    panel();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark as won" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark as lost" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add note" }),
    ).toBeInTheDocument();
    // Not an outcome, so there is nothing to reopen.
    expect(screen.queryByRole("button", { name: "Reopen" })).toBeNull();
  });

  it("offers only the stages a Lead may be moved to by hand", () => {
    panel();
    const picker = screen.getByLabelText("Stage");
    expect(
      [...picker.querySelectorAll("option")].map((o) => o.textContent),
    ).toEqual(["New", "Contacted"]);
  });

  it("carries the Lead, the workspace and the revision on every form", () => {
    const { container } = panel();
    const forms = identities(container);
    expect(forms.length).toBeGreaterThanOrEqual(3);
    for (const form of forms) {
      expect(form).toEqual({
        revision: "7",
        leadId: LEAD,
        workspace: WORKSPACE,
      });
    }
  });

  it("asks nothing before an edit or a note — §28", () => {
    panel();
    // No dialog, no "are you sure": the controls submit directly.
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByText(/are you sure/i)).toBeNull();
  });
});

describe("what a finished Lead offers", () => {
  it("offers Reopen instead of the outcome actions", () => {
    panel({ stageKind: "lost", lostReason: "price" });
    expect(screen.getByRole("button", { name: "Reopen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark as won" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Mark as lost" })).toBeNull();
  });

  it("reopens only into an open, ordinary stage", () => {
    panel({ stageKind: "won" });
    const picker = screen.getByLabelText("Reopen into");
    expect(
      [...picker.querySelectorAll("option")].map((o) => o.textContent),
    ).toEqual(["New", "Contacted"]);
  });

  it("cannot reopen a Lead when the pipeline has no open stage left", () => {
    render(
      <LeadLifecyclePanel
        lead={lead({ stageKind: "won" })}
        stages={[]}
        sources={SOURCES}
        workspaceId={WORKSPACE}
      />,
    );
    expect(screen.getByRole("button", { name: "Reopen" })).toBeDisabled();
  });

  it("draws no Convert control and explains no build order", () => {
    const { container } = panel({ stageKind: "won" });
    // §45 asks for conversion and there are no Customers, so the control is
    // simply absent — and so is any sentence about when it might arrive.
    // The product does not tell its users what has not been built; the
    // dependency is recorded in lead-lifecycle-dependencies.ts and docs.
    expect(screen.queryByRole("button", { name: /convert/i })).toBeNull();
    expect(container.textContent).not.toMatch(
      /customer|milestone|coming soon|not yet|will be possible|once .* exist/i,
    );
  });
});

describe("the §39 timeline", () => {
  const ACTOR = "66666666-6666-4666-8666-666666666666";
  const detail = {
    id: LEAD,
    name: "Rajesh Menon",
    phone: "+919876543210",
    phoneNormalised: "+919876543210",
    phoneNeedsReview: false,
    email: null,
    stageName: "New",
    stageIsActive: true,
    sourceName: null,
    notes: null,
    recordOwnerUserProfileId: ACTOR,
    createdByUserProfileId: ACTOR,
    isOwnedByActor: true,
    createdAt: new Date("2026-10-17T09:00:00Z"),
  } as Parameters<typeof LeadDetailView>[0]["lead"];

  const entry = (overrides: Record<string, unknown>) =>
    ({
      id: `e-${Math.random()}`,
      kind: "note_added",
      actorUserProfileId: ACTOR,
      fromStageName: null,
      toStageName: null,
      changedFields: null,
      note: null,
      lostReason: null,
      occurredAt: new Date("2026-10-17T10:00:00Z"),
      ...overrides,
    }) as Parameters<typeof LeadDetailView>[0]["activity"][number];

  const view = (
    activity: Parameters<typeof LeadDetailView>[0]["activity"],
    editable: Parameters<typeof LeadDetailView>[0]["editable"] = lead(),
  ) =>
    render(
      <LeadDetailView
        lead={detail}
        editable={editable}
        activity={activity}
        actorNames={{ [ACTOR]: "Ann Sebastian" }}
        stages={STAGES}
        sources={SOURCES}
        workspaceId={WORKSPACE}
        ownerName="You"
        createdOn="17 Oct 2026"
        formatWhen={() => "17 Oct 2026, 10:00 UTC"}
      />,
    );

  it("says who did what, in plain words", () => {
    view([
      entry({ kind: "note_added", note: "Rang, no answer" }),
      entry({
        kind: "stage_changed",
        fromStageName: "New",
        toStageName: "Contacted",
      }),
      entry({ kind: "details_edited", changedFields: ["name", "phone"] }),
      entry({ kind: "record_created" }),
    ]);

    const timeline = screen.getByRole("list");
    expect(within(timeline).getByText(/added a note/)).toBeInTheDocument();
    expect(within(timeline).getByText("Rang, no answer")).toBeInTheDocument();
    expect(within(timeline).getByText("New → Contacted")).toBeInTheDocument();
    expect(within(timeline).getByText("name, phone")).toBeInTheDocument();
    expect(
      within(timeline).getByText("Lead created by Ann Sebastian"),
    ).toBeInTheDocument();
  });

  it("names a lost outcome by its label, with the explanation", () => {
    view([
      entry({
        kind: "marked_lost",
        lostReason: "chose_competitor",
        note: "Went with the incumbent",
      }),
    ]);
    expect(
      screen.getByText("Chose someone else — Went with the incumbent"),
    ).toBeInTheDocument();
  });

  it("falls back to a neutral name for an actor it cannot name", () => {
    // §162.1: a Staff/Sales user is given their own name and nobody else's,
    // so a colleague's entry must still read as a sentence.
    view([entry({ kind: "record_created", actorUserProfileId: "someone" })]);
    expect(
      screen.getByText("Lead created by a team member"),
    ).toBeInTheDocument();
  });

  it("keeps the build order out of the timeline", () => {
    const { container } = view([entry({ kind: "record_created" })]);
    // 3B's version ended with a line about calls, WhatsApp and follow-ups
    // "as those features arrive". That is a roadmap, and a record that
    // carries one stops reading as a record.
    expect(container.textContent).not.toMatch(
      /features arrive|milestone|coming soon|will appear here/i,
    );
  });

  it("says plainly when there is nothing to show", () => {
    view([]);
    expect(
      screen.getByText("Nothing has been recorded for this lead yet."),
    ).toBeInTheDocument();
  });

  it("shows the history but no controls to a reader who may not edit", () => {
    view([entry({ kind: "record_created" })], null);
    expect(screen.getByText(/Lead created by/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add note" })).toBeNull();
    expect(screen.queryByText("Update this lead")).toBeNull();
  });

  it("shows the lost reason on the record itself while it is lost", () => {
    view(
      [entry({ kind: "marked_lost", lostReason: "price" })],
      lead({
        stageKind: "lost",
        lostReason: "price",
        lostReasonNote: "Budget",
      }),
    );
    expect(screen.getByText("Lost reason")).toBeInTheDocument();
    expect(screen.getByText(/Price or cost — Budget/)).toBeInTheDocument();
  });
});

describe("§130.1: the duplicate warning, across a round trip", () => {
  /**
   * The failure this pins down is Milestone 3B's: React resets a form after
   * an action runs, so an uncontrolled field loses what was typed and the
   * warning comes back about data the person can no longer see. Every field
   * here is controlled; this proves it, and proves that answering the
   * warning sends the acknowledgement the server issued rather than a bare
   * flag.
   */
  const warned = {
    status: "duplicate" as const,
    attempt: 1,
    mayOverride: true,
    acknowledgement: "1792230000000.deadbeef",
    duplicates: {
      visible: [
        {
          id: "99999999-9999-4999-8999-999999999999",
          name: "Rajesh M",
          stageName: "Contacted",
        },
      ],
      hiddenMatches: 1,
    },
  };

  it("keeps what was typed, and answers with the server's acknowledgement", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    const submissions: FormData[] = [];
    actions.editLeadAction.mockImplementation(
      async (_previous: unknown, data: FormData) => {
        submissions.push(data);
        return submissions.length === 1
          ? warned
          : { status: "ok" as const, attempt: 2 };
      },
    );

    panel();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const phone = screen.getByLabelText("Phone number");
    await user.clear(phone);
    await user.type(phone, "+919000000001");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    // The warning, and the part §162.1 withholds said as a count.
    expect(
      await screen.findByText(/Another lead already has this contact/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Rajesh M — Contacted/)).toBeInTheDocument();
    expect(
      screen.getByText(/One match belongs to someone whose records/),
    ).toBeInTheDocument();

    // THE 3B BUG: the number typed before the action ran is still there.
    expect(screen.getByLabelText("Phone number")).toHaveValue("+919000000001");

    await user.type(
      screen.getByLabelText(/Why are these separate leads/),
      "Her brother",
    );
    await user.click(screen.getByRole("button", { name: "Save anyway" }));

    expect(submissions).toHaveLength(2);
    const second = submissions[1]!;
    expect(second.get("override")).toBe("true");
    // Not a bare flag: the code the server issued for THIS submission.
    expect(second.get("acknowledgement")).toBe("1792230000000.deadbeef");
    expect(second.get("phone")).toBe("+919000000001");
    expect(second.get("overrideExplanation")).toBe("Her brother");
    expect(second.get("leadId")).toBe(LEAD);
    expect(second.get("revision")).toBe("7");
  });

  it("offers no Save anyway to someone who may not override", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    actions.editLeadAction.mockImplementation(async () => ({
      ...warned,
      mayOverride: false,
    }));

    panel();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText(/Another lead already has this contact/),
    ).toBeInTheDocument();
    // §130.1 keeps Create Anyway with Manager and Owner/Admin. Nobody else is
    // offered a way through, and no explanation box is drawn to suggest one.
    expect(screen.queryByRole("button", { name: "Save anyway" })).toBeNull();
    expect(screen.queryByLabelText(/Why are these separate leads/)).toBeNull();
  });
});
