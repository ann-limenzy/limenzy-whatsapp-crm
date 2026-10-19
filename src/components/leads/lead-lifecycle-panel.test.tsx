import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  /*
   * One double PER ACTION. They shared a single `vi.fn` to begin with, so a
   * call count or an implementation set in one test was visible to every
   * other — a test could pass, or fail, because of the test before it.
   */
  const make = () => vi.fn<Action>(async () => idle);
  return {
    editLeadAction: make(),
    changeLeadStageAction: make(),
    markLeadWonAction: make(),
    markLeadLostAction: make(),
    reopenLeadAction: make(),
    addLeadNoteAction: make(),
    reassignLeadAction: make(),
  };
});
vi.mock("@/app/actions/lead-lifecycle", () => actions);

/** Every test starts from "nothing called, nothing stubbed". */
beforeEach(() => {
  for (const double of Object.values(actions)) {
    double.mockReset();
    double.mockImplementation(async () => ({ status: "idle", attempt: 0 }));
  }
});

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
const OWNER = "77777777-7777-4777-8777-777777777777";
const COLLEAGUE = "88888888-8888-4888-8888-888888888888";
const MEMBERS = [
  { userProfileId: OWNER, fullName: "Ann Sebastian" },
  { userProfileId: COLLEAGUE, fullName: "Priya Nair" },
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
      assignableMembers={MEMBERS}
      currentOwnerUserProfileId={OWNER}
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

  it("shows the stage the Lead is in, through the shared Select", () => {
    panel();
    // The trigger displays the chosen item's text, which is what a reader
    // sees — the old native <option> list is gone.
    expect(screen.getByLabelText("Stage")).toHaveTextContent("New");
    expect(screen.getByLabelText("Stage")).toHaveAttribute("role", "combobox");
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

  it("reopens into the first open, ordinary stage by default", () => {
    panel({ stageKind: "won" });
    expect(screen.getByLabelText("Reopen into")).toHaveTextContent("New");
  });

  it("cannot reopen a Lead when the pipeline has no open stage left", () => {
    render(
      <LeadLifecyclePanel
        lead={lead({ stageKind: "won" })}
        stages={[]}
        sources={SOURCES}
        workspaceId={WORKSPACE}
        assignableMembers={MEMBERS}
        currentOwnerUserProfileId={OWNER}
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
        assignableMembers={MEMBERS}
        ownerName="You"
        createdOn="19 Oct 2026"
        formatWhen={() => "19 Oct 2026, 10:04"}
        timeZoneLabel="Asia/Kolkata (GMT+5:30)"
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

  it("says which clock the times are on, once rather than per entry", () => {
    // Reported from the hosted walkthrough: an entry written at 10:04 in
    // Kolkata read "04:34 UTC". The hour is now the workspace's, and the
    // screen says whose clock it is instead of leaving the reader to guess.
    view([entry({ kind: "record_created" })]);
    expect(
      screen.getByText("Times shown in Asia/Kolkata (GMT+5:30)."),
    ).toBeInTheDocument();
    expect(screen.getByText("19 Oct 2026, 10:04")).toBeInTheDocument();
    expect(screen.queryByText(/04:34/)).toBeNull();
    expect(screen.queryByText(/UTC/)).toBeNull();
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

describe("the stage picker follows the server, not the last thing clicked", () => {
  /**
   * The defect this pins down, reported from the hosted walkthrough: after a
   * successful stage change the information panel showed the new stage and
   * the picker showed the previous one until the page was reloaded.
   *
   * The cause is not the server. React resets a form once its action has
   * run, which puts the control back to the option the server rendered as
   * selected — the OLD stage. React then re-renders, finds the same `value`
   * it rendered last time, writes nothing to the DOM, and the browser's
   * reset stands. A value held in component state can never recover from
   * that, because it never changes.
   *
   * So the picker now holds a CHOICE that is cleared when its submission
   * settles, and shows the server's stage the rest of the time. These assert
   * the three things that has to get right.
   */
  const settling = (status: string) =>
    vi.fn(async (previous: { status: string; attempt: number }) => ({
      status,
      attempt: previous.attempt + 1,
    }));

  const open = async (label: string) => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    await user.click(screen.getByLabelText(label));
    return user;
  };

  it("shows the stage the server confirmed, once it confirms it", async () => {
    actions.changeLeadStageAction.mockImplementation(settling("ok"));
    const { rerender } = render(
      <LeadLifecyclePanel
        lead={lead()}
        stages={STAGES}
        sources={SOURCES}
        workspaceId={WORKSPACE}
        assignableMembers={MEMBERS}
        currentOwnerUserProfileId={OWNER}
      />,
    );
    expect(screen.getByLabelText("Stage")).toHaveTextContent("New");

    const user = await open("Stage");
    await user.click(await screen.findByRole("option", { name: "Contacted" }));
    expect(screen.getByLabelText("Stage")).toHaveTextContent("Contacted");

    await user.click(screen.getByRole("button", { name: "Move" }));
    await waitFor(() =>
      expect(actions.changeLeadStageAction).toHaveBeenCalledTimes(1),
    );

    // The server revalidates and the Lead comes back on its new stage.
    rerender(
      <LeadLifecyclePanel
        lead={lead({ stageId: CONTACTED, revision: 8 })}
        stages={STAGES}
        sources={SOURCES}
        workspaceId={WORKSPACE}
        assignableMembers={MEMBERS}
        currentOwnerUserProfileId={OWNER}
      />,
    );
    expect(screen.getByLabelText("Stage")).toHaveTextContent("Contacted");
  });

  it("snaps back to the real stage when the save is refused", async () => {
    // A stale or refused submission must not leave the attempt on screen
    // looking like it took. The Lead is still on "New", so the picker says
    // "New" — and the refusal message says why.
    actions.changeLeadStageAction.mockImplementation(settling("stale"));
    render(
      <LeadLifecyclePanel
        lead={lead()}
        stages={STAGES}
        sources={SOURCES}
        workspaceId={WORKSPACE}
        assignableMembers={MEMBERS}
        currentOwnerUserProfileId={OWNER}
      />,
    );

    const user = await open("Stage");
    await user.click(await screen.findByRole("option", { name: "Contacted" }));
    expect(screen.getByLabelText("Stage")).toHaveTextContent("Contacted");

    await user.click(screen.getByRole("button", { name: "Move" }));

    expect(
      await screen.findByText(/Somebody else changed this lead/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Stage")).toHaveTextContent("New"),
    );
  });

  it("leaves a choice in progress alone when an unrelated action settles", async () => {
    actions.addLeadNoteAction.mockImplementation(settling("ok"));
    render(
      <LeadLifecyclePanel
        lead={lead()}
        stages={STAGES}
        sources={SOURCES}
        workspaceId={WORKSPACE}
        assignableMembers={MEMBERS}
        currentOwnerUserProfileId={OWNER}
      />,
    );

    const user = await open("Stage");
    await user.click(await screen.findByRole("option", { name: "Contacted" }));

    // Somebody adds a note before pressing Move. That must not discard the
    // stage they had already picked.
    await user.type(screen.getByLabelText("Add a note"), "Rang them");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() =>
      expect(actions.addLeadNoteAction).toHaveBeenCalledTimes(1),
    );

    expect(screen.getByLabelText("Stage")).toHaveTextContent("Contacted");
  });

  it("posts the chosen stage with the form", async () => {
    const submissions: FormData[] = [];
    actions.changeLeadStageAction.mockImplementation(
      async (previous: { status: string; attempt: number }, data: FormData) => {
        submissions.push(data);
        return { status: "ok", attempt: previous.attempt + 1 };
      },
    );
    render(
      <LeadLifecyclePanel
        lead={lead()}
        stages={STAGES}
        sources={SOURCES}
        workspaceId={WORKSPACE}
        assignableMembers={MEMBERS}
        currentOwnerUserProfileId={OWNER}
      />,
    );

    const user = await open("Stage");
    await user.click(await screen.findByRole("option", { name: "Contacted" }));
    await user.click(screen.getByRole("button", { name: "Move" }));
    await waitFor(() => expect(submissions).toHaveLength(1));

    // The Select is not a native <select>, so this also proves the value
    // still reaches the server — now through a hidden field, because the
    // control itself sits outside the form.
    expect(submissions[0]!.get("stageId")).toBe(CONTACTED);
    expect(submissions[0]!.get("revision")).toBe("7");
  });

  it("does the same for Reopen", async () => {
    actions.reopenLeadAction.mockImplementation(settling("stale"));
    render(
      <LeadLifecyclePanel
        lead={lead({ stageKind: "won" })}
        stages={STAGES}
        sources={SOURCES}
        workspaceId={WORKSPACE}
        assignableMembers={MEMBERS}
        currentOwnerUserProfileId={OWNER}
      />,
    );

    const user = await open("Reopen into");
    await user.click(await screen.findByRole("option", { name: "Contacted" }));
    expect(screen.getByLabelText("Reopen into")).toHaveTextContent("Contacted");

    await user.click(screen.getByRole("button", { name: "Reopen" }));
    // Refused, so it goes back to the default rather than keeping the
    // attempt. Awaited rather than asserted outright: the action settles on
    // its own schedule, and a bare expect here races it.
    expect(
      await screen.findByText(/Somebody else changed this lead/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText("Reopen into")).toHaveTextContent("New"),
    );
  });
});

describe("a form reset cannot strand the picker", () => {
  /**
   * The mechanism behind the report, pinned down directly.
   *
   * React resets a form after its action runs. With a native `<select>` that
   * put the control back to the option the server rendered as selected, and
   * React — seeing the same `value` it rendered last time — wrote nothing
   * back, so the browser's reset stood. The displayed stage is now React
   * state rendered as text rather than a DOM value a reset can reach, so the
   * failure mode is gone by construction as well as by the clearing above.
   */
  it("keeps showing the chosen stage after the form is reset", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    const { container } = render(
      <LeadLifecyclePanel
        lead={lead()}
        stages={STAGES}
        sources={SOURCES}
        workspaceId={WORKSPACE}
        assignableMembers={MEMBERS}
        currentOwnerUserProfileId={OWNER}
      />,
    );

    await user.click(screen.getByLabelText("Stage"));
    await user.click(await screen.findByRole("option", { name: "Contacted" }));
    expect(screen.getByLabelText("Stage")).toHaveTextContent("Contacted");

    // Exactly what React does to the form once the action settles.
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    form!.reset();

    expect(screen.getByLabelText("Stage")).toHaveTextContent("Contacted");
  });
});
