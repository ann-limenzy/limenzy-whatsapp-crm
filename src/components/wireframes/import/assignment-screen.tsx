"use client";

import { Info, TriangleAlert, Users } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ImportShell } from "@/components/wireframes/import/import-shell";
import { Note, Panel } from "@/components/wireframes/wf-ui";
import {
  MAPPED_ASSIGNMENT_COLUMN,
  MAPPED_ASSIGNMENT_FIELD,
  PERSON_OPTIONS,
  TEAM_OPTIONS,
  choiceSummary,
  formatNames,
  getAssignmentChoice,
  getAssignmentServerChoice,
  isChoiceComplete,
  setAssignmentChoice,
  subscribeToAssignmentChoice,
  teamOption,
  type AssignmentChoice,
  type AssignmentMethod,
} from "@/lib/wireframes/import-assignment";
import { cn } from "@/lib/utils";

/**
 * A3 — Choose lead assignment.
 *
 * Sits between Map columns and Validate, because assignment is decided from
 * the mapped columns and then CHECKED with everything else before a single
 * Lead is written. Nothing here assigns anybody: the screen records one
 * choice and says what that choice will cause.
 *
 * The one idea the client needs to take away: a Sales Team is never the
 * Record Owner. A team is how the CRM finds a person — round robin selects an
 * eligible member, and if it cannot, the Lead waits in Assignment Required.
 *
 * Nothing is preselected. The automatic-routing option is withheld until the
 * rule is confirmed with A&S Fincare, and none of the four that remain is a
 * safe default — so the admin chooses before Continue becomes available.
 */

type Method = {
  readonly id: AssignmentMethod;
  readonly title: string;
  readonly description: string;
};

const METHODS: readonly Method[] = [
  {
    id: "team",
    title: "Distribute to a Sales Team",
    description:
      "Select one team. Imported Leads will be distributed among its eligible members using that team's round-robin rule.",
  },
  {
    id: "person",
    title: "Assign all to one salesperson",
    description:
      "Every imported Lead receives the selected salesperson as Record Owner. This manual assignment does not change the round-robin rotation.",
  },
  {
    id: "spreadsheet",
    title: "Use assignments from the spreadsheet",
    description:
      "Use the mapped Team or Record Owner value on each row. Invalid, inactive or unknown values will appear during validation.",
  },
  {
    id: "review",
    title: "Leave assignment for review",
    description:
      "Import the Leads into Assignment Required so an authorized user can assign them later.",
  },
];

/**
 * The choice lives in a module store rather than `useState`, so moving to
 * Validation and pressing Back brings it back. The server snapshot is the
 * default, so nothing reads sessionStorage while rendering on the server.
 */
function useAssignmentChoice(): [
  AssignmentChoice,
  (next: Partial<AssignmentChoice>) => void,
] {
  const choice = useSyncExternalStore(
    subscribeToAssignmentChoice,
    getAssignmentChoice,
    getAssignmentServerChoice,
  );
  return [choice, (next) => setAssignmentChoice({ ...choice, ...next })];
}

export function AssignmentScreen() {
  const [choice, update] = useAssignmentChoice();
  const canContinue = isChoiceComplete(choice);
  const selectedTeam = teamOption(choice.teamId);

  return (
    <ImportShell
      current={2}
      title="Choose how imported Leads are assigned"
      description="Select one assignment method for this import. The choice will be checked before any Lead is created."
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Assignment method" bodyClassName="p-4 sm:p-5">
            {/*
              Native radios in a real fieldset: arrow keys move between them,
              Space selects, and the group carries one accessible name — none
              of which a div with role="radio" gives for free.
            */}
            <fieldset className="min-w-0">
              <legend className="mb-3 text-xs text-muted-foreground">
                One method applies to every row in this file.
              </legend>
              <div className="flex flex-col gap-2.5">
                {METHODS.map((method) => (
                  <MethodCard
                    key={method.id}
                    method={method}
                    checked={choice.method === method.id}
                    onSelect={() => update({ method: method.id })}
                  >
                    {method.id === "team" ? (
                      <TeamPicker
                        value={choice.teamId}
                        onChange={(teamId) => update({ teamId })}
                      />
                    ) : null}

                    {method.id === "person" ? (
                      <PersonPicker
                        value={choice.userId}
                        onChange={(userId) => update({ userId })}
                      />
                    ) : null}

                    {method.id === "spreadsheet" ? <SpreadsheetNote /> : null}

                    {method.id === "review" ? (
                      <Note icon={TriangleAlert} tone="warning">
                        These Leads will not appear in an individual
                        salesperson&rsquo;s work queue until somebody assigns
                        them.
                      </Note>
                    ) : null}
                  </MethodCard>
                ))}
              </div>
            </fieldset>
          </Panel>

          <Note icon={Info}>
            A Sales Team is never the Record Owner. A team decides which people
            are in the rotation; round robin selects one of them for each Lead.
          </Note>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="What will happen" bodyClassName="p-4 sm:p-5">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {choiceSummary(choice)}
            </p>

            {choice.method === "team" &&
            selectedTeam &&
            selectedTeam.eligible.length === 0 ? (
              <Note icon={TriangleAlert} tone="warning" className="mt-3">
                This team currently has no eligible members. These Leads will
                enter Assignment Required.
              </Note>
            ) : null}

            {/* Before a method is chosen the summary above already says so;
                a second warning would only repeat it. */}
            {choice.method !== null && !canContinue ? (
              <p className="mt-3 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2.5 text-xs leading-relaxed text-warning-on-subtle">
                {choice.method === "team"
                  ? "Select a Sales Team to continue."
                  : choice.method === "person"
                    ? "Select a salesperson to continue."
                    : "No Team or Record Owner column is mapped, so this method cannot be used."}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="ghost" asChild>
                <Link href={"/wireframes/import/map" as Route}>Back</Link>
              </Button>
              {canContinue ? (
                <Button asChild className="ms-auto">
                  <Link href={"/wireframes/import/validate" as Route}>
                    Continue to validation
                  </Link>
                </Button>
              ) : (
                <Button className="ms-auto" disabled>
                  Continue to validation
                </Button>
              )}
            </div>
          </Panel>

          <Note icon={Info}>
            Nothing is assigned yet. The choice is applied while the rows are
            validated, and only the rows you confirm are ever created.
          </Note>
        </div>
      </div>
    </ImportShell>
  );
}

/* ------------------------------------------------------------------ parts */

/**
 * One selectable method.
 *
 * The label wraps ONLY the radio and its text. Anything interactive the
 * choice reveals — a select — sits outside the label, because a label may
 * contain one labelable control and clicking a nested select would otherwise
 * be swallowed by the radio.
 */
function MethodCard({
  method,
  checked,
  onSelect,
  children,
}: {
  method: Method;
  checked: boolean;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border p-3.5 transition-colors sm:p-4",
        // The focus ring belongs to the card, because the input itself is
        // visually hidden. `has-[:focus-visible]` keeps it a real focus
        // style rather than something React has to track.
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        checked
          ? "surface-glass-strong border-primary/45"
          : "border-border bg-surface/50 hover:border-border-strong/60 hover:bg-accent/40",
      )}
    >
      <label className="flex min-w-0 cursor-pointer gap-3">
        <input
          type="radio"
          name="import-assignment-method"
          value={method.id}
          checked={checked}
          onChange={onSelect}
          className="sr-only"
        />

        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
            checked ? "border-primary bg-primary" : "border-border-strong",
          )}
        >
          {checked ? (
            <span className="size-1.5 rounded-full bg-primary-foreground" />
          ) : null}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">
            {method.title}
          </span>

          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {method.description}
          </span>
        </span>
      </label>

      {checked && children ? (
        <div className="mt-3 min-w-0 ps-7">{children}</div>
      ) : null}
    </div>
  );
}

const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-input bg-surface px-2.5 text-sm text-foreground";

function TeamPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const team = teamOption(value);

  return (
    <div className="min-w-0">
      <label
        htmlFor="import-assignment-team"
        className="mb-1.5 block text-xs font-medium text-foreground"
      >
        Sales Team
      </label>
      <select
        id="import-assignment-team"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">Choose a team…</option>
        {TEAM_OPTIONS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} — {t.eligible.length} eligible member
            {t.eligible.length === 1 ? "" : "s"}
          </option>
        ))}
      </select>

      {team && team.eligible.length > 0 ? (
        <Note icon={Users} className="mt-2.5">
          Imported Leads will rotate between {formatNames(team.eligible)}.
        </Note>
      ) : null}

      {team && team.eligible.length === 0 ? (
        <Note icon={TriangleAlert} tone="warning" className="mt-2.5">
          This team currently has no eligible members. These Leads will enter
          Assignment Required.
        </Note>
      ) : null}
    </div>
  );
}

function PersonPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="min-w-0">
      <label
        htmlFor="import-assignment-person"
        className="mb-1.5 block text-xs font-medium text-foreground"
      >
        Record Owner
      </label>
      <select
        id="import-assignment-person"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">Choose a salesperson…</option>
        {PERSON_OPTIONS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.teamName ? ` — ${p.teamName}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Option 4 reports the mapping as it actually stands rather than asserting
 * one, so it cannot contradict the Map columns screen beside it.
 */
function SpreadsheetNote() {
  if (!MAPPED_ASSIGNMENT_COLUMN) {
    return (
      <Note tone="neutral">
        No Team or Record Owner column is currently mapped. You can return to
        column mapping to add one.
      </Note>
    );
  }

  return (
    <Note icon={Info}>
      &ldquo;{MAPPED_ASSIGNMENT_COLUMN}&rdquo; is mapped to{" "}
      {MAPPED_ASSIGNMENT_FIELD}. Values that do not match an active user are
      reported during validation — import never creates a user.
    </Note>
  );
}
