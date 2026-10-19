"use client";

import { TriangleAlert } from "lucide-react";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  addLeadNoteAction,
  changeLeadStageAction,
  editLeadAction,
  markLeadLostAction,
  markLeadWonAction,
  reopenLeadAction,
  type LifecycleState,
} from "@/app/actions/lead-lifecycle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  LEAD_LOST_REASONS,
  LEAD_LOST_REASON_LABELS,
  MAX_ACTIVITY_NOTE,
  MAX_LEAD_EMAIL,
  MAX_LEAD_NAME,
  MAX_LEAD_NOTES,
  MAX_LEAD_PHONE,
  MAX_LOST_REASON_NOTE,
  type LeadField,
} from "@/lib/validation/leads";
import type { LeadForEdit } from "@/server/auth/workspace-leads";

/**
 * What can be done to a Lead from its own screen — §37, §39, §45, §48.
 *
 * **No confirmation dialogs.** §28 names "save standard field edits" and
 * "add note" among the actions that must not ask. Marking Won or Lost does
 * ask for something, but only because §45 and §48 need a reason or a next
 * step — not as a "are you sure".
 *
 * **Won offers no conversion.** §45 asks "Convert this Lead into a
 * Customer?" and there are no Customers. The control is simply absent: a
 * disabled button, or a sentence explaining which milestone will bring it,
 * would both put this project's build order in front of the person using
 * the product. The dependency is recorded in
 * `src/server/auth/lead-lifecycle-dependencies.ts` and in
 * `docs/dependencies.md`, which is where it belongs.
 *
 * Every control carries the Lead's `revision`, which is how a save that
 * would overwrite somebody else's is caught. The server refuses; nothing is
 * merged.
 */

const INITIAL: LifecycleState = { status: "idle", attempt: 0 };

export type StageOption = { readonly id: string; readonly name: string };

function SubmitButton({
  children,
  busy,
  variant = "outline",
  size = "sm",
  name,
  value,
  disabled,
}: {
  children: React.ReactNode;
  busy: string;
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "sm" | "default";
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size={size}
      variant={variant}
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? busy : children}
    </Button>
  );
}

const MESSAGE: Record<string, string> = {
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
  note_required: "Write something first.",
  note_too_long: `Keep a note under ${MAX_ACTIVITY_NOTE} characters.`,
  reason_required: "Choose why this lead was lost.",
  explanation_required: "Say briefly what happened.",
  explanation_too_long: "That explanation is too long.",
};

/** Everything that is not a field-level problem. */
function Problem({ state }: { state: LifecycleState }) {
  const message =
    state.status === "stale"
      ? "Somebody else changed this lead while you had it open. Reload to see their changes, then try again."
      : state.status === "stage_unavailable"
        ? "That stage has been switched off. Choose another one."
        : state.status === "outcome_missing"
          ? "This workspace has no Won or Lost stage, so that cannot be recorded."
          : state.status === "forbidden"
            ? "You do not have permission to change this lead."
            : state.status === "module_disabled"
              ? "Leads are switched off for this workspace."
              : state.status === "workspace_stale"
                ? "This page is out of date. Reload it and try again."
                : state.status === "refused"
                  ? "That change could not be saved as entered."
                  : state.status === "unavailable"
                    ? "That did not work. Nothing was changed — please try again."
                    : state.status === "invalid" && state.issue
                      ? (MESSAGE[state.issue] ?? "Check what you entered.")
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

/** Fields shared by every form here: which Lead, which workspace, which revision. */
function Identity({
  lead,
  workspaceId,
}: {
  lead: LeadForEdit;
  workspaceId: string;
}) {
  return (
    <>
      <input type="hidden" name="renderedWorkspaceId" value={workspaceId} />
      <input type="hidden" name="leadId" value={lead.id} />
      <input type="hidden" name="revision" value={lead.revision} />
    </>
  );
}

function EditLeadSheet({
  lead,
  sources,
  workspaceId,
}: {
  lead: LeadForEdit;
  sources: readonly StageOption[];
  workspaceId: string;
}) {
  const [state, formAction] = useActionState(editLeadAction, INITIAL);
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(0);
  const [fields, setFields] = useState({
    name: lead.name,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    notes: lead.notes ?? "",
    sourceId: lead.sourceId ?? "",
  });
  const set = (key: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  const problemFor = (field: LeadField) =>
    state.problems?.find((p) => p.field === field)?.issue;
  const duplicateShowing =
    state.status === "duplicate" && state.attempt !== acknowledged;

  if (state.status === "ok" && open) setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          Edit
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit this lead</SheetTitle>
          <SheetDescription>
            Saving records that you changed it, and what you changed.
          </SheetDescription>
        </SheetHeader>
        <form action={formAction} className="grid gap-5 px-4 pb-6">
          <Identity lead={lead} workspaceId={workspaceId} />
          {/* The stage is moved from the lead's own screen, not from here. */}
          <input type="hidden" name="stageId" value={lead.stageId} />
          {state.acknowledgement ? (
            <input
              type="hidden"
              name="acknowledgement"
              value={state.acknowledgement}
            />
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="edit-name">Lead name</Label>
            <Input
              id="edit-name"
              name="name"
              required
              maxLength={MAX_LEAD_NAME}
              value={fields.name}
              onChange={(event) => set("name")(event.target.value)}
            />
            {problemFor("name") ? (
              <p role="alert" className="text-xs text-danger">
                {MESSAGE[problemFor("name")!]}
              </p>
            ) : null}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-phone">Phone number</Label>
              <Input
                id="edit-phone"
                name="phone"
                type="tel"
                maxLength={MAX_LEAD_PHONE}
                value={fields.phone}
                onChange={(event) => set("phone")(event.target.value)}
              />
              {problemFor("phone") ? (
                <p role="alert" className="text-xs text-danger">
                  {MESSAGE[problemFor("phone")!]}
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                name="email"
                type="email"
                maxLength={MAX_LEAD_EMAIL}
                value={fields.email}
                onChange={(event) => set("email")(event.target.value)}
              />
              {problemFor("email") ? (
                <p role="alert" className="text-xs text-danger">
                  {MESSAGE[problemFor("email")!]}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="edit-source">Lead source</Label>
            <select
              id="edit-source"
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
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="edit-notes">Notes</Label>
            <textarea
              id="edit-notes"
              name="notes"
              rows={3}
              maxLength={MAX_LEAD_NOTES}
              value={fields.notes}
              onChange={(event) => set("notes")(event.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>

          {duplicateShowing ? (
            <DuplicateWarning state={state} />
          ) : (
            <Problem state={state} />
          )}

          <div className="flex flex-wrap gap-2">
            {duplicateShowing && state.mayOverride ? (
              <>
                <SubmitButton
                  busy="Saving…"
                  variant="default"
                  name="override"
                  value="true"
                >
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
              <SubmitButton busy="Saving…" variant="default">
                Save changes
              </SubmitButton>
            )}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** §32's warning again, for an edit. The same words, the same limits. */
function DuplicateWarning({ state }: { state: LifecycleState }) {
  const warning = state.duplicates;
  if (!warning) return null;
  const hidden = warning.hiddenMatches;
  return (
    <div
      role="alert"
      className="grid gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-3 text-sm text-warning-on-subtle"
    >
      <p className="flex items-start gap-2.5 font-medium">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>Another lead already has this contact information.</span>
      </p>
      {warning.visible.map((candidate) => (
        <p key={candidate.id} className="text-xs">
          {candidate.name} — {candidate.stageName}.{" "}
          <a
            href={`/leads/${candidate.id}`}
            className="font-medium underline underline-offset-2"
          >
            View it
          </a>
        </p>
      ))}
      {hidden > 0 ? (
        <p className="text-xs">
          {hidden === 1
            ? "One match belongs to someone whose records you cannot see."
            : `${hidden} matches belong to people whose records you cannot see.`}
        </p>
      ) : null}
      {state.mayOverride ? (
        <div className="grid gap-1.5">
          <Label htmlFor="edit-override-note" className="text-xs">
            Why are these separate leads? (optional)
          </Label>
          <Input
            id="edit-override-note"
            name="overrideExplanation"
            maxLength={1000}
            className="h-9 bg-surface"
          />
        </div>
      ) : (
        <p className="text-xs">
          Only a manager or an owner can save a lead that matches another one.
        </p>
      )}
    </div>
  );
}

function MarkLostSheet({
  lead,
  workspaceId,
}: {
  lead: LeadForEdit;
  workspaceId: string;
}) {
  const [state, formAction] = useActionState(markLeadLostAction, INITIAL);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  if (state.status === "ok" && open) setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          Mark as lost
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Mark this lead as lost</SheetTitle>
          <SheetDescription>
            It leaves the pipeline. Everything about it is kept, and it can be
            reopened later.
          </SheetDescription>
        </SheetHeader>
        <form action={formAction} className="grid gap-5 px-4 pb-6">
          <Identity lead={lead} workspaceId={workspaceId} />
          <div className="grid gap-1.5">
            <Label htmlFor="lost-reason">Why was it lost?</Label>
            <select
              id="lost-reason"
              name="lostReason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
            >
              <option value="">Choose a reason</option>
              {LEAD_LOST_REASONS.map((value) => (
                <option key={value} value={value}>
                  {LEAD_LOST_REASON_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          {reason === "other" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="lost-note">What happened?</Label>
              <Input
                id="lost-note"
                name="lostReasonNote"
                maxLength={MAX_LOST_REASON_NOTE}
              />
            </div>
          ) : null}
          <Problem state={state} />
          <div>
            <SubmitButton busy="Saving…" variant="destructive">
              Mark as lost
            </SubmitButton>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function LeadLifecyclePanel({
  lead,
  stages,
  sources,
  workspaceId,
}: {
  lead: LeadForEdit;
  /** Open, ordinary stages — the only ones a Lead can be moved to by hand. */
  stages: readonly StageOption[];
  sources: readonly StageOption[];
  workspaceId: string;
}) {
  const [stageState, stageAction] = useActionState(
    changeLeadStageAction,
    INITIAL,
  );
  const [wonState, wonAction] = useActionState(markLeadWonAction, INITIAL);
  const [reopenState, reopenAction] = useActionState(reopenLeadAction, INITIAL);
  const [noteState, noteAction] = useActionState(addLeadNoteAction, INITIAL);
  const [note, setNote] = useState("");
  const [stageId, setStageId] = useState(lead.stageId);
  const [reopenStageId, setReopenStageId] = useState(stages[0]?.id ?? "");

  const isOutcome = lead.stageKind !== "active";
  if (noteState.status === "ok" && note.length > 0) setNote("");

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <EditLeadSheet
          lead={lead}
          sources={sources}
          workspaceId={workspaceId}
        />

        {isOutcome ? (
          <form
            action={reopenAction}
            className="flex flex-wrap items-end gap-2"
          >
            <Identity lead={lead} workspaceId={workspaceId} />
            <div className="grid gap-1.5">
              <Label htmlFor="reopen-stage" className="text-xs">
                Reopen into
              </Label>
              <select
                id="reopen-stage"
                name="stageId"
                value={reopenStageId}
                onChange={(event) => setReopenStageId(event.target.value)}
                className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
              >
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton busy="Reopening…" disabled={stages.length === 0}>
              Reopen
            </SubmitButton>
          </form>
        ) : (
          <>
            <form action={stageAction} className="flex items-end gap-2">
              <Identity lead={lead} workspaceId={workspaceId} />
              <div className="grid gap-1.5">
                <Label htmlFor="move-stage" className="text-xs">
                  Stage
                </Label>
                <select
                  id="move-stage"
                  name="stageId"
                  value={stageId}
                  onChange={(event) => setStageId(event.target.value)}
                  className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
                >
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton busy="Moving…">Move</SubmitButton>
            </form>

            <form action={wonAction}>
              <Identity lead={lead} workspaceId={workspaceId} />
              <SubmitButton busy="Saving…">Mark as won</SubmitButton>
            </form>

            <MarkLostSheet lead={lead} workspaceId={workspaceId} />
          </>
        )}
      </div>

      <Problem state={stageState} />
      <Problem state={wonState} />
      <Problem state={reopenState} />

      <form action={noteAction} className="grid gap-2">
        <Identity lead={lead} workspaceId={workspaceId} />
        <Label htmlFor="lead-note">Add a note</Label>
        <textarea
          id="lead-note"
          name="note"
          rows={2}
          maxLength={MAX_ACTIVITY_NOTE}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What happened?"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <Problem state={noteState} />
        <div>
          <SubmitButton busy="Adding…">Add note</SubmitButton>
        </div>
      </form>
    </div>
  );
}
