"use client";

import { Info, TriangleAlert } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { addLeadAction, type LeadActionState } from "@/app/actions/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_LEAD_EMAIL,
  MAX_LEAD_NAME,
  MAX_LEAD_NOTES,
  MAX_LEAD_PHONE,
  type LeadField,
  type LeadProblem,
} from "@/lib/validation/leads";

/**
 * Add Lead — §32.
 *
 * Lead Name is required and at least one of Phone or Email must be given;
 * everything else is optional. Stage defaults to the first active pipeline
 * stage, which in the default configuration is New.
 *
 * **Record Owner is the person creating the Lead, and is not a field.** §32
 * defers the default to §163's assignment rules, which depend on an
 * unresolved client decision — so rather than offer a picker whose rules are
 * not settled, the form says plainly who will own it. The database agrees:
 * the runtime role holds no UPDATE grant on that column.
 *
 * **Product / Service Interested In is absent**, not hidden. It references
 * Products & Services, which does not exist yet; a free-text box here would
 * be a different field wearing its name.
 */

const INITIAL: LeadActionState = { status: "idle", attempt: 0 };

export type StageOption = { readonly id: string; readonly name: string };
export type SourceOption = { readonly id: string; readonly name: string };

const MESSAGE: Record<LeadProblem["issue"], string> = {
  name_required: "Enter the lead's name.",
  name_too_long: "That name is too long.",
  name_has_control_characters: "Remove the special characters from that name.",
  contact_required: "Enter a phone number or an email address.",
  phone_too_long: "That phone number is too long.",
  phone_not_a_number: "That does not look like a phone number.",
  email_too_long: "That email address is too long.",
  email_malformed: "Enter a complete email address.",
  notes_too_long: "Those notes are too long.",
  stage_required: "Choose a stage.",
};

function problemFor(
  state: LeadActionState,
  field: LeadField,
): string | undefined {
  const problem = state.problems?.find((p) => p.field === field);
  return problem ? MESSAGE[problem.issue] : undefined;
}

function SubmitButton({
  children,
  busy,
  name,
  value,
  variant = "default",
}: {
  children: React.ReactNode;
  busy: string;
  name?: string;
  value?: string;
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      name={name}
      value={value}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? busy : children}
    </Button>
  );
}

/** A field with its label, hint and error wired together for screen readers. */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (describedBy: string | undefined) => React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children(describedBy)}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** §32's duplicate warning, and §162.1's limit on how much of it can be shown. */
function DuplicateWarning({ state }: { state: LeadActionState }) {
  const warning = state.duplicates;
  if (state.status !== "duplicate" || !warning) return null;
  const visible = warning.visible;
  const hidden = warning.hiddenMatches;
  if (visible.length === 0 && hidden === 0) return null;

  return (
    <div
      role="alert"
      className="grid gap-3 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-3 text-sm text-warning-on-subtle"
    >
      <p className="flex items-start gap-2.5 font-medium">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>A lead with this contact information already exists.</span>
      </p>

      {visible.length > 0 ? (
        <ul className="grid gap-2">
          {visible.map((candidate) => (
            <li
              key={candidate.id}
              className="rounded-md border border-warning/20 bg-surface px-3 py-2 text-foreground"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="font-medium">{candidate.name}</span>
                <span className="text-xs text-muted-foreground">
                  {candidate.stageName}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {[candidate.phone, candidate.email].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Matched on{" "}
                {candidate.matchedFields
                  .map((f) => (f === "phone" ? "phone number" : "email"))
                  .join(" and ")}
                .
              </p>
              <a
                href={`/leads/${candidate.id}`}
                className="mt-1 inline-block text-xs font-medium underline underline-offset-2"
              >
                View existing lead
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {hidden > 0 ? (
        <p className="text-xs">
          {hidden === 1
            ? "One matching lead belongs to someone whose records you cannot see, so it is not shown here."
            : `${hidden} matching leads belong to people whose records you cannot see, so they are not shown here.`}
        </p>
      ) : null}

      {state.mayOverride ? (
        <div className="grid gap-2">
          <Label htmlFor="overrideExplanation" className="text-xs">
            Why is this a separate lead? (optional)
          </Label>
          <Input
            id="overrideExplanation"
            name="overrideExplanation"
            maxLength={1000}
            className="h-9 bg-surface"
          />
          <p className="text-xs">
            Saving anyway keeps both records. It is recorded that you did.
          </p>
        </div>
      ) : (
        <p className="text-xs">
          Only a manager or an owner can save a lead that matches an existing
          one. Open the existing lead, or ask one of them.
        </p>
      )}
    </div>
  );
}

export function AddLeadForm({
  stages,
  sources,
  workspaceId,
  ownerName,
}: {
  stages: readonly StageOption[];
  sources: readonly SourceOption[];
  workspaceId: string;
  ownerName: string;
}) {
  const [state, formAction] = useActionState(addLeadAction, INITIAL);
  const [acknowledged, setAcknowledged] = useState(0);

  /*
   * CONTROLLED, and that is not a style choice.
   *
   * React resets a form after an action runs. With uncontrolled inputs, the
   * §32 duplicate warning therefore appeared over an EMPTY form: everything
   * the person had typed was gone, and Save Anyway submitted nothing. Holding
   * the values here keeps them across the warning, and across "Go back and
   * change it".
   */
  const [fields, setFields] = useState({
    name: "",
    phone: "",
    email: "",
    notes: "",
    stageId: stages[0]?.id ?? "",
    sourceId: "",
  });
  const set = (key: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  const duplicateShowing =
    state.status === "duplicate" && state.attempt !== acknowledged;

  return (
    <form action={formAction} className="grid gap-5">
      <input type="hidden" name="renderedWorkspaceId" value={workspaceId} />
      {/*
        The server's proof that it showed this warning, for this submission.
        Posted back with Save Anyway; the server re-derives it and ignores an
        override without it — so a client that simply always sends the
        override flag no longer skips the warning, and changed data gets a
        new warning because the old proof no longer matches.
      */}
      {state.acknowledgement ? (
        <input
          type="hidden"
          name="acknowledgement"
          value={state.acknowledgement}
        />
      ) : null}

      <Field id="lead-name" label="Lead name" error={problemFor(state, "name")}>
        {(describedBy) => (
          <Input
            id="lead-name"
            name="name"
            required
            value={fields.name}
            onChange={(event) => set("name")(event.target.value)}
            maxLength={MAX_LEAD_NAME}
            autoComplete="name"
            aria-describedby={describedBy}
          />
        )}
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="lead-phone"
          label="Phone number"
          hint="Include the country code — for example +91 98765 43210."
          error={problemFor(state, "phone")}
        >
          {(describedBy) => (
            <Input
              id="lead-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              value={fields.phone}
              onChange={(event) => set("phone")(event.target.value)}
              maxLength={MAX_LEAD_PHONE}
              autoComplete="tel"
              aria-describedby={describedBy}
            />
          )}
        </Field>

        <Field id="lead-email" label="Email" error={problemFor(state, "email")}>
          {(describedBy) => (
            <Input
              id="lead-email"
              name="email"
              type="email"
              value={fields.email}
              onChange={(event) => set("email")(event.target.value)}
              maxLength={MAX_LEAD_EMAIL}
              autoComplete="email"
              aria-describedby={describedBy}
            />
          )}
        </Field>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>Give at least a phone number or an email address.</span>
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="lead-stage"
          label="Stage"
          error={problemFor(state, "stageId")}
        >
          {(describedBy) => (
            <select
              id="lead-stage"
              name="stageId"
              value={fields.stageId}
              onChange={(event) => set("stageId")(event.target.value)}
              aria-describedby={describedBy}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
            >
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field id="lead-source" label="Lead source (optional)">
          {() => (
            <select
              id="lead-source"
              name="sourceId"
              value={fields.sourceId}
              onChange={(event) => set("sourceId")(event.target.value)}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
            >
              <option value="">Not recorded</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Field
        id="lead-notes"
        label="Notes (optional)"
        error={problemFor(state, "notes")}
      >
        {(describedBy) => (
          <textarea
            id="lead-notes"
            name="notes"
            rows={3}
            value={fields.notes}
            onChange={(event) => set("notes")(event.target.value)}
            maxLength={MAX_LEAD_NOTES}
            aria-describedby={describedBy}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
        )}
      </Field>

      <p className="text-xs text-muted-foreground">
        You will be the record owner of this lead.{" "}
        <span className="text-muted-foreground">({ownerName})</span>
      </p>

      {duplicateShowing ? <DuplicateWarning state={state} /> : null}

      <Problem state={state} />

      <div className="flex flex-wrap gap-2">
        {duplicateShowing && state.mayOverride ? (
          <>
            {/*
              The override travels as this BUTTON's value, so it is sent only
              by the click that means it. A hidden field would keep saying
              "override" on every later submission from the same form.
            */}
            <SubmitButton busy="Saving…" name="override" value="true">
              Save anyway
            </SubmitButton>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAcknowledged(state.attempt)}
            >
              Go back and change it
            </Button>
          </>
        ) : (
          <SubmitButton busy="Saving…">Save lead</SubmitButton>
        )}
      </div>
    </form>
  );
}

/** Everything that is not a field-level problem. */
function Problem({ state }: { state: LeadActionState }) {
  const message =
    state.status === "stage_unavailable"
      ? "That stage has been switched off. Choose another one."
      : state.status === "forbidden"
        ? "You do not have permission to add leads."
        : state.status === "module_disabled"
          ? "Leads are switched off for this workspace."
          : state.status === "stale"
            ? "This page is out of date. Reload it and try again."
            : state.status === "refused"
              ? "That lead could not be saved as entered."
              : state.status === "unavailable"
                ? "That did not work. Nothing was saved — please try again."
                : null;
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-on-subtle"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{message}</span>
    </div>
  );
}
