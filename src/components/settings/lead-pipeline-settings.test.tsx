import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Settings → Lead Pipeline: what the Owner/Admin can operate on each row.
 *
 * The Server Actions are doubled — they are the server boundary, and every one
 * of them re-checks authority, module gating and workspace for itself. This
 * file is about the controls the page offers, which is presentation.
 *
 * The case worth pinning down is the OUTCOME rows. §34 requires a workspace to
 * retain a Won outcome and a Lost outcome and fixes Won as the final column;
 * neither is a rule about the label. So Won and Lost carry the ordinary rename
 * control, and do NOT carry move or switch-off, which the database would
 * refuse. The live-database proof that a rename leaves kind, position and
 * active flag untouched is in lead-pipeline-isolation.db.test.ts.
 */

const actions = vi.hoisted(() => {
  const idle = { status: "idle", attempt: 0 };
  const noop = vi.fn(async () => idle);
  return {
    addLeadStageAction: noop,
    renameLeadStageAction: noop,
    moveLeadStageAction: noop,
    setLeadStageActiveAction: noop,
    addLeadSourceAction: noop,
    renameLeadSourceAction: noop,
    setLeadSourceActiveAction: noop,
  };
});

vi.mock("@/app/actions/lead-pipeline", () => actions);

const { LeadPipelineSettings } =
  await import("@/components/settings/lead-pipeline-settings");

const STAGES = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "New",
    kind: "active" as const,
    isActive: true,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Contacted",
    kind: "active" as const,
    isActive: true,
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Won",
    kind: "won" as const,
    isActive: true,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Lost",
    kind: "lost" as const,
    isActive: true,
  },
];

const SOURCES = [
  {
    id: "55555555-5555-4555-8555-555555555555",
    name: "Website",
    isActive: true,
  },
];

const WORKSPACE = "66666666-6666-4666-8666-666666666666";

const renderSettings = () =>
  render(
    <LeadPipelineSettings
      stages={STAGES}
      sources={SOURCES}
      workspaceId={WORKSPACE}
    />,
  );

/** The <li> that holds a given stage, found by its rename field. */
const rowFor = (name: string) => {
  const field = screen.getByLabelText(`Name of the ${name} stage`);
  const row = field.closest("li");
  if (!row) throw new Error(`no row for ${name}`);
  return within(row);
};

describe("lead pipeline settings", () => {
  it("offers a rename control on every stage, outcomes included", () => {
    renderSettings();
    for (const stage of STAGES) {
      const row = rowFor(stage.name);
      expect(row.getByLabelText(`Name of the ${stage.name} stage`)).toHaveValue(
        stage.name,
      );
      expect(row.getByRole("button", { name: "Rename" })).toBeEnabled();
    }
  });

  it("withholds move and switch-off from Won and Lost", () => {
    renderSettings();
    for (const outcome of ["Won", "Lost"]) {
      const row = rowFor(outcome);
      expect(row.queryByRole("button", { name: /^Move/ })).toBeNull();
      expect(row.queryByRole("button", { name: "Switch off" })).toBeNull();
      expect(row.queryByRole("button", { name: "Switch on" })).toBeNull();
      // One control, and it is the rename.
      expect(row.getAllByRole("button")).toHaveLength(1);
    }
  });

  it("keeps move and switch-off on the ordinary stages", () => {
    renderSettings();
    const row = rowFor("Contacted");
    expect(
      row.getByRole("button", { name: "Move Contacted earlier" }),
    ).toBeEnabled();
    expect(row.getByRole("button", { name: "Switch off" })).toBeEnabled();
  });

  it("still marks what each outcome is", () => {
    renderSettings();
    expect(
      rowFor("Won").getByText("Always the last stage"),
    ).toBeInTheDocument();
    expect(
      rowFor("Lost").getByText("An outcome, not a pipeline stage"),
    ).toBeInTheDocument();
  });

  it("says plainly that renaming an outcome changes the label only", () => {
    renderSettings();
    expect(
      screen
        .getByText(/changes the label only/i)
        .textContent?.replace(/\s+/g, " "),
    ).toContain(
      "Won stays the final stage, Lost stays outside the pipeline, and neither can be switched off.",
    );
  });
});
