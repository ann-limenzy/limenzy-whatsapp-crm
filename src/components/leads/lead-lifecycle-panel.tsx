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
  reassignLeadAction,
  reopenLeadAction,
  type LifecycleState,
} from "@/app/actions/lead-lifecycle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/** §163.10's recipients: active members, for a caller who may reassign. */
export type MemberOption = {
  readonly userProfileId: string;
  readonly fullName: string;
};

/**
 * Every submit in this file, with one comfortable phone target.
 *
 * `min-h-11` below `sm` and the control's own height above it: measured on
 * the real screen, these were 32–36px tall on a 390px viewport, where the
 * approved design asks for about 44.
 */
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
      className="min-h-11 sm:min-h-0"
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
  recipient_required: "Choose who should own this lead.",
  explanation_required: "Say briefly what happened.",
  explanation_too_long: "That explanation is too long.",
};

/** Everything that is not a field-level problem. */
/** Everything that is not a field-level problem, keyed by what came back. */
const REFUSAL: Partial<Record<LifecycleState["status"], string>> = {
  stale:
    "Somebody else changed this lead while you had it open. Reload to see " +
    "their changes, then try again.",
  unchanged: "That is already the record owner.",
  recipient_unavailable:
    "That person is no longer an active member of this workspace. Choose " +
    "somebody else.",
  stage_unavailable: "That stage has been switched off. Choose another one.",
  outcome_missing:
    "This workspace has no Won or Lost stage, so that cannot be recorded.",
  forbidden: "You do not have permission to change this lead.",
  module_disabled: "Leads are switched off for this workspace.",
  workspace_stale: "This page is out of date. Reload it and try again.",
  refused: "That change could not be saved as entered.",
  unavailable: "That did not work. Nothing was changed — please try again.",
};

function Problem({ state }: { state: LifecycleState }) {
  const message =
    state.status === "invalid"
      ? (MESSAGE[state.issue ?? ""] ?? "Check what you entered.")
      : (REFUSAL[state.status] ?? null);
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
        <Button size="sm" variant="outline" className="min-h-11 sm:min-h-0">
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
        <Button size="sm" variant="outline" className="min-h-11 sm:min-h-0">
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

/**
 * One labelled stage picker, shared by the move and reopen forms.
 *
 * Declared here rather than inside the panel: a component created during
 * render is a NEW component type on every render, so React unmounts the old
 * one and mounts a fresh one — which would throw away the open popup, the
 * focus and the Radix state every time anything on this screen changed.
 *
 * **It lives OUTSIDE its form, and posts through a hidden field.** React
 * resets a form once its action has run; while the picker was inside one,
 * that reset reached the control, was reported back as though a person had
 * changed it, and left the picker on the stage the Lead had just moved off.
 * Measured in a browser, not reasoned about — it is the one failure mode
 * that survived two earlier attempts at this. A control the reset cannot
 * reach cannot be told a stale value by it.
 */
function StagePicker({
  id,
  label,
  value,
  stages,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  stages: readonly StageOption[];
  onChange: (next: string) => void;
}) {
  return (
    <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-56">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          id={id}
          aria-label={label}
          className="min-h-11 sm:min-h-0"
        >
          <SelectValue placeholder="Choose a stage" />
        </SelectTrigger>
        <SelectContent>
          {stages.map((stage) => (
            <SelectItem key={stage.id} value={stage.id}>
              {stage.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Which stage the picker should be showing.
 *
 * The picker holds a CHOICE, not a value: `null` means "nothing in
 * progress", and the control then shows whatever the server last confirmed.
 * The choice is dropped the moment EITHER of two things happens — the
 * submission settles, or the server comes back with a different stage.
 *
 * ## Why both, and not just the first
 *
 * Traced rather than guessed. React resets a form once its action has run.
 * The reset puts the hidden control Radix posts with back to the stage the
 * server rendered, Radix reads that as a change and reports it, and the
 * picker is handed the OLD stage as though a person had picked it. Clearing
 * on the settle alone does not survive that: the reset's report lands after
 * the clear, so the stale choice is written back and the picker stays on the
 * previous stage while the rest of the screen shows the new one — which is
 * precisely the defect reported from the walkthrough.
 *
 * Dropping the choice when the CONFIRMED stage changes is what makes the
 * ordering stop mattering. Whatever the reset did, the moment the server
 * says "this Lead is on Contacted now", that is what the picker shows.
 *
 * A refused save leaves the confirmed stage alone, so the settle clears the
 * choice and the picker snaps back to the stage the Lead really has — an
 * attempt that failed never sits on screen looking like it took. And an
 * action that is not this one, such as adding a note, settles without
 * touching either input, so a selection in progress survives it.
 */
function useStagePicker(confirmedStageId: string, attempt: number) {
  const [choice, setChoice] = useState<string | null>(null);
  const [seen, setSeen] = useState({ attempt, confirmedStageId });

  if (seen.attempt !== attempt || seen.confirmedStageId !== confirmedStageId) {
    setSeen({ attempt, confirmedStageId });
    setChoice(null);
  }

  return [choice ?? confirmedStageId, setChoice] as const;
}

/**
 * The controls, as separately placeable pieces.
 *
 * The approved Lead Detail layout puts the stage control beside the stage,
 * reassignment beside the Record Owner, the outcome actions in the header
 * and the composer above the timeline — four different places. They cannot
 * all live in one card any more, but they must still share one set of
 * action states, because two components each holding their own
 * `useActionState` for the same mutation is two implementations of it.
 *
 * So the panel still owns every hook and every form; it just hands the
 * rendered pieces out. Called without `children` it draws the card it always
 * drew, which is what the existing tests exercise.
 */
export type LifecycleSlots = {
  /** Stage picker plus Move — or Reopen into plus Reopen, once finished. */
  readonly stageControl: React.ReactNode;
  /** §163.10's transfer. `null` when this actor may not reassign. */
  readonly ownerControl: React.ReactNode;
  /** Mark as won / Mark as lost. `null` on a Lead that is already finished. */
  readonly outcomeActions: React.ReactNode;
  /** Edit, as a sheet with its own trigger. */
  readonly editControl: React.ReactNode;
  /** The §39 note composer. */
  readonly noteComposer: React.ReactNode;
  /** Whether this Lead is in a Won or Lost stage. */
  readonly isOutcome: boolean;
  /** Whether §162 gives this actor Change Record Owner. */
  readonly mayReassign: boolean;
};

export function LeadLifecyclePanel({
  lead,
  stages,
  sources,
  workspaceId,
  assignableMembers,
  currentOwnerUserProfileId,
  children,
}: {
  lead: LeadForEdit;
  /** Open, ordinary stages — the only ones a Lead can be moved to by hand. */
  stages: readonly StageOption[];
  sources: readonly StageOption[];
  workspaceId: string;
  /**
   * §163.10's eligible recipients. Empty when this actor does not hold
   * Change Record Owner, and the control is then not drawn at all — §162's
   * rows are different rows, and holding one is not holding the other.
   */
  assignableMembers: readonly MemberOption[];
  currentOwnerUserProfileId: string;
  /** Place the controls yourself. Omitted, the original card is drawn. */
  children?: (slots: LifecycleSlots) => React.ReactNode;
}) {
  const [stageState, stageAction] = useActionState(
    changeLeadStageAction,
    INITIAL,
  );
  const [wonState, wonAction] = useActionState(markLeadWonAction, INITIAL);
  const [reopenState, reopenAction] = useActionState(reopenLeadAction, INITIAL);
  const [noteState, noteAction] = useActionState(addLeadNoteAction, INITIAL);
  const [ownerState, ownerAction] = useActionState(reassignLeadAction, INITIAL);
  const [note, setNote] = useState("");
  const [stageId, setStageId] = useStagePicker(
    lead.stageId,
    stageState.attempt,
  );
  const [reopenStageId, setReopenStageId] = useStagePicker(
    stages[0]?.id ?? "",
    reopenState.attempt,
  );

  const isOutcome = lead.stageKind !== "active";
  /*
   * The picker holds a choice the same way the stage one does, and for the
   * same reason: React resets a form once its action has run.
   */
  const [newOwner, setNewOwner] = useStagePicker(
    currentOwnerUserProfileId,
    ownerState.attempt,
  );
  const mayReassign = assignableMembers.length > 0;
  if (noteState.status === "ok" && note.length > 0) setNote("");

  /*
   * Each control, built once. Where they are PLACED is the caller's
   * business; what they do, and the single action state behind each one,
   * stays here.
   */
  const stageControl = isOutcome ? (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <StagePicker
          id="reopen-stage"
          label="Reopen into"
          value={reopenStageId}
          stages={stages}
          onChange={setReopenStageId}
        />
        <form action={reopenAction}>
          <Identity lead={lead} workspaceId={workspaceId} />
          <input type="hidden" name="stageId" value={reopenStageId} />
          <SubmitButton
            busy="Reopening…"
            variant="default"
            size="default"
            disabled={stages.length === 0}
          >
            Reopen
          </SubmitButton>
        </form>
      </div>
      <Problem state={reopenState} />
    </div>
  ) : (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <StagePicker
          id="move-stage"
          label="Stage"
          value={stageId}
          stages={stages}
          onChange={setStageId}
        />
        <form action={stageAction}>
          <Identity lead={lead} workspaceId={workspaceId} />
          <input type="hidden" name="stageId" value={stageId} />
          <SubmitButton busy="Moving…" variant="default" size="default">
            Move
          </SubmitButton>
        </form>
      </div>
      <Problem state={stageState} />
    </div>
  );

  /*
   * §163.10's transfer. Drawn only for an actor who holds Change Record
   * Owner — §162 lists it as its own row, so an actor with edit permission
   * and not this one gets nothing here rather than a control that would be
   * refused on submission.
   */
  const ownerControl = mayReassign ? (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-end gap-2 sm:gap-3">
        <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-56">
          <Label htmlFor="lead-owner" className="text-xs text-muted-foreground">
            Record owner
          </Label>
          <Select value={newOwner} onValueChange={setNewOwner}>
            <SelectTrigger
              id="lead-owner"
              aria-label="Record owner"
              className="min-h-11 sm:min-h-0"
            >
              <SelectValue placeholder="Choose a person" />
            </SelectTrigger>
            <SelectContent>
              {assignableMembers.map((member) => (
                <SelectItem
                  key={member.userProfileId}
                  value={member.userProfileId}
                >
                  {member.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <form action={ownerAction}>
          <Identity lead={lead} workspaceId={workspaceId} />
          <input type="hidden" name="newOwnerUserProfileId" value={newOwner} />
          <SubmitButton
            busy="Handing over…"
            size="default"
            disabled={newOwner === currentOwnerUserProfileId}
          >
            Hand over
          </SubmitButton>
        </form>
      </div>
      <Problem state={ownerState} />
    </div>
  ) : null;

  const editControl = (
    <EditLeadSheet lead={lead} sources={sources} workspaceId={workspaceId} />
  );

  const outcomeActions = isOutcome ? null : (
    <>
      <form action={wonAction}>
        <Identity lead={lead} workspaceId={workspaceId} />
        <SubmitButton busy="Saving…" variant="default">
          Mark as won
        </SubmitButton>
      </form>
      <MarkLostSheet lead={lead} workspaceId={workspaceId} />
    </>
  );

  /*
   * A note is one or two lines in practice, so the box is two lines and the
   * button sits beside it on anything wider than a phone. Three rows with
   * the control stranded underneath made the commonest action on this
   * screen look like the largest.
   */
  const noteComposer = (
    <form action={noteAction} className="grid gap-2">
      <Identity lead={lead} workspaceId={workspaceId} />
      <Label htmlFor="lead-note" className="text-xs text-muted-foreground">
        Log a note
      </Label>
      <p className="-mt-1 text-xs text-muted-foreground/80">
        Added to the timeline. To change the lead&rsquo;s own description,
        edit it from <span className="font-medium">Edit</span>.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea
          id="lead-note"
          name="note"
          rows={2}
          maxLength={MAX_ACTIVITY_NOTE}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What happened?"
          className="min-h-16 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-11"
        />
        <SubmitButton
          busy="Adding…"
          size="default"
          disabled={note.length === 0}
        >
          Add note
        </SubmitButton>
      </div>
      <Problem state={noteState} />
    </form>
  );

  if (children) {
    return (
      <>
        {children({
          stageControl,
          ownerControl,
          outcomeActions,
          editControl,
          noteComposer,
          isOutcome,
          mayReassign,
        })}
      </>
    );
  }

  /*
   * The original card, for callers that do not place the controls
   * themselves: one card, two rows, in order of how often each is used.
   */
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
        {stageControl}
        {ownerControl ? (
          <>
            <Separator className="bg-border/70" />
            {ownerControl}
          </>
        ) : null}
        <Separator className="bg-border/70" />
        <div className="flex flex-wrap items-center gap-2">
          {editControl}
          {outcomeActions}
        </div>
        <Problem state={wonState} />
      </div>
      {noteComposer}
    </div>
  );
}
