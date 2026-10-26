"use client";

import {
  ArrowLeft,
  ArrowRightLeft,
  CalendarDays,
  ChevronDown,
  CircleCheck,
  CircleSlash,
  Mail,
  MessageSquarePlus,
  Pencil,
  Phone,
  RotateCcw,
  Signpost,
  SquarePen,
  Tag,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useId, useRef, useState } from "react";

import { StatusBadge, type StatusTone } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LEAD_LOST_REASON_LABELS } from "@/lib/validation/leads";
import type { LeadLostReason } from "@/lib/validation/leads";
import type { LeadActivityEntry } from "@/server/auth/workspace-leads";

import type { SampleLead } from "./sample-leads";
import { SAMPLE_PEOPLE } from "./sample-leads";
import {
  Initials,
  ZONE,
  dayLabel,
  longDayLabel,
  stageTone,
  timeLabel,
} from "./shared";

/**
 * Lead detail — VISUAL PREVIEW of a proposed layout. Development only.
 *
 * Synthetic data, local state, no Server Action. The shipping screen is
 * `components/leads/lead-detail-view.tsx` and is untouched.
 *
 * ── Desktop: a record workspace ───────────────────────────────────────────
 *
 *   identity / contact  │  activity workspace  │  supporting details
 *
 * Three columns where there is room, two where there is not, driven by
 * CONTAINER queries so the count follows the width this screen actually has
 * — which the sidebar changes by 188px without touching the viewport.
 *
 * ── Phone: designed, not stacked ──────────────────────────────────────────
 *
 * Stacking the desktop panels puts the record's own details below a timeline
 * that is the longest thing on the screen, so "what is this lead's email" is
 * a scroll past everything that has happened to them. Instead: a compact
 * identity summary that is always there, then ACTIVITY / DETAILS tabs — the
 * structure both HubSpot's record page and Zoho's mobile record view use,
 * for the same reason.
 *
 * ── Action placement, one rule, both breakpoints ──────────────────────────
 *
 *   * RECORD-LEVEL actions live in the header: one primary (the outcome),
 *     with everything else behind a labelled **Actions** menu. Three
 *     similar-weight buttons competing on one line was the previous
 *     arrangement, and on a phone they wrapped.
 *   * PLACEMENT actions live beside the fact they change: the stage control
 *     under the stage, Reassign beside the Record Owner. Those are never in
 *     the menu, because a menu is the wrong place for a control that belongs
 *     next to the thing it edits.
 *
 * ── What is deliberately absent ───────────────────────────────────────────
 *
 * No Convert, Add Follow-up, WhatsApp or Email send, engagement score, deal
 * value, lead score or pipeline board. Nothing stands behind any of them.
 */

/* ------------------------------------------------------------------ */
/* Timeline vocabulary                                                 */
/* ------------------------------------------------------------------ */

type Described = {
  readonly headline: string;
  readonly detail?: string;
  readonly icon: LucideIcon;
  readonly tone: StatusTone;
  readonly quoted?: boolean;
};

function describe(
  entry: LeadActivityEntry,
  actor: string,
  nameOf: (id: string | null) => string,
): Described {
  switch (entry.kind) {
    case "record_created":
      return {
        headline: `${actor} created this lead`,
        icon: SquarePen,
        tone: "neutral",
      };
    case "details_edited":
      return {
        headline: `${actor} edited the details`,
        detail: (entry.changedFields ?? []).join(", "),
        icon: Pencil,
        tone: "neutral",
      };
    case "stage_changed":
      return {
        headline: `${actor} moved the stage`,
        detail: `${entry.fromStageName} → ${entry.toStageName}`,
        icon: Signpost,
        tone: "info",
      };
    case "marked_won":
      return {
        headline: `${actor} marked it won`,
        icon: CircleCheck,
        tone: "success",
      };
    case "marked_lost":
      return {
        headline: `${actor} marked it lost`,
        detail: [
          entry.lostReason ? LEAD_LOST_REASON_LABELS[entry.lostReason] : null,
          entry.note,
        ]
          .filter(Boolean)
          .join(" — "),
        icon: CircleSlash,
        tone: "danger",
      };
    case "reopened":
      return {
        headline: `${actor} reopened it`,
        detail: `moved to ${entry.toStageName}`,
        icon: RotateCcw,
        tone: "warning",
      };
    case "note_added":
      return {
        headline: `${actor} logged a note`,
        detail: entry.note ?? "",
        icon: MessageSquarePlus,
        tone: "neutral",
        quoted: true,
      };
    case "owner_changed":
      return {
        headline: `${actor} changed the record owner`,
        detail: `${nameOf(entry.fromOwnerUserProfileId)} → ${nameOf(
          entry.toOwnerUserProfileId,
        )}`,
        icon: ArrowRightLeft,
        tone: "info",
      };
  }
}

const TONE_RING: Record<StatusTone, string> = {
  success: "border-success/30 bg-success-subtle text-success-on-subtle",
  warning: "border-warning/30 bg-warning-subtle text-warning-on-subtle",
  danger: "border-danger/30 bg-danger-subtle text-danger-on-subtle",
  info: "border-info/30 bg-info-subtle text-info-on-subtle",
  neutral: "border-border bg-muted text-muted-foreground",
};

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon?: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-0.5 py-2 @min-[20rem]/panel:grid-cols-[7rem_minmax(0,1fr)] @min-[20rem]/panel:items-baseline @min-[20rem]/panel:gap-3">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {Icon ? (
          <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        ) : null}
        {label}
      </dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={`surface-elevated @container/panel rounded-xl ${className ?? ""}`}
    >
      <div className="px-4 pt-4 pb-2">
        <h2
          id={id}
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {title}
        </h2>
        {hint ? (
          <p className="mt-0.5 text-xs text-muted-foreground/80">{hint}</p>
        ) : null}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The screen                                                          */
/* ------------------------------------------------------------------ */

export function LeadDetailRefresh({ sample }: { sample: SampleLead }) {
  const { lead, stages } = sample;
  const isOutcome = !lead.stageIsActive;

  /* PREVIEW STATE ONLY — a disabled mock says nothing about placement. */
  const [stageId, setStageId] = useState(sample.currentStageId);
  const [owner, setOwner] = useState(lead.recordOwnerUserProfileId);
  const [reassigning, setReassigning] = useState(false);
  const [note, setNote] = useState("");
  const [extra, setExtra] = useState<readonly LeadActivityEntry[]>([]);
  const [tab, setTab] = useState<"activity" | "details">("activity");
  const [saving, setSaving] = useState(false);
  const reassignTrigger = useRef<HTMLButtonElement>(null);

  const nameOf = (id: string | null) =>
    id === null ? "the system" : (SAMPLE_PEOPLE[id] ?? "a team member");

  const ownerName = SAMPLE_PEOPLE[owner] ?? sample.ownerName;
  const entries = [...extra, ...sample.activity];
  const stageName =
    stages.find((s) => s.id === stageId)?.name ?? lead.stageName;

  const addNote = () => {
    const text = note.trim();
    if (text.length === 0) return;
    setSaving(true);
    /* A beat of pending state, so that treatment can be reviewed too. */
    window.setTimeout(() => {
      setExtra((previous) => [
        {
          id: `preview-${previous.length}`,
          kind: "note_added",
          actorUserProfileId: "p-asha",
          fromStageName: null,
          toStageName: null,
          changedFields: null,
          fromOwnerUserProfileId: null,
          toOwnerUserProfileId: null,
          note: text,
          lostReason: null,
          occurredAt: new Date(),
        },
        ...previous,
      ]);
      setNote("");
      setSaving(false);
    }, 320);
  };

  const startReassign = () => {
    setTab("details");
    setReassigning(true);
    requestAnimationFrame(() => reassignTrigger.current?.focus());
  };

  const identity = (
    <IdentityPanel
      sample={sample}
      ownerName={ownerName}
      owner={owner}
      setOwner={setOwner}
      stageId={stageId}
      setStageId={setStageId}
      stageName={stageName}
      isOutcome={isOutcome}
      reassigning={reassigning}
      setReassigning={setReassigning}
      reassignTrigger={reassignTrigger}
    />
  );

  const activity = (
    <ActivityWorkspace
      entries={entries}
      nameOf={nameOf}
      note={note}
      setNote={setNote}
      addNote={addNote}
      saving={saving}
    />
  );

  const details = <SupportingPanels sample={sample} />;

  return (
    <TooltipProvider delayDuration={200}>
      {/* See the note in lead-list-refresh.tsx: a bare `grid` track sizes
          to min-content, which a long email makes wider than the phone. */}
      <div className="@container/lead grid w-full grid-cols-[minmax(0,1fr)] gap-4">
        {/* ─────────────── Header: record-level actions ─────────────── */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 min-h-11 shrink-0 text-muted-foreground @min-[34rem]/lead:min-h-8"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Leads
          </Button>
          <span
            className="hidden text-muted-foreground/60 @min-[30rem]/lead:inline"
            aria-hidden="true"
          >
            /
          </span>
          {/*
            A BREADCRUMB, not the page heading — and gone where it would only
            repeat itself. On a phone it truncated to "Priy…" directly above
            an identity card showing the whole name, which is the same
            information twice, one copy of it unreadable. The heading itself
            is the <h1> in that card, so there is exactly one on every width.
          */}
          <span
            className="hidden min-w-0 flex-1 truncate text-base font-medium @min-[30rem]/lead:block"
            aria-hidden="true"
          >
            {lead.name}
          </span>
          <span className="flex-1 @min-[30rem]/lead:hidden" />

          <div className="flex shrink-0 items-center gap-2">
            {/*
              Edit is only a button where there is room for one. Below that it
              is the first item in the menu — the same action, reached the way
              the width allows, rather than three controls wrapping onto two
              lines at 390px.
            */}
            <Button
              variant="outline"
              size="sm"
              className="hidden min-h-8 @min-[34rem]/lead:inline-flex"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-11 @min-[34rem]/lead:min-h-8"
                >
                  Actions
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>This lead</DropdownMenuLabel>
                <DropdownMenuItem>
                  <Pencil className="size-4" aria-hidden="true" />
                  Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => startReassign()}>
                  <ArrowRightLeft className="size-4" aria-hidden="true" />
                  Reassign record owner
                </DropdownMenuItem>
                {isOutcome ? null : (
                  <DropdownMenuItem>
                    <CircleSlash className="size-4" aria-hidden="true" />
                    Mark as lost
                  </DropdownMenuItem>
                )}
                {lead.phone || lead.email ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Get in touch</DropdownMenuLabel>
                    {lead.phone ? (
                      <DropdownMenuItem asChild>
                        <a href={`tel:${lead.phoneNormalised ?? lead.phone}`}>
                          <Phone className="size-4" aria-hidden="true" />
                          Call {lead.name.split(" ")[0]}
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                    {lead.email ? (
                      <DropdownMenuItem asChild>
                        <a href={`mailto:${lead.email}`}>
                          <Mail className="size-4" aria-hidden="true" />
                          Email {lead.name.split(" ")[0]}
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* The one primary, decided by the state the record is in. */}
            {isOutcome ? (
              <Button size="sm" className="min-h-11 @min-[34rem]/lead:min-h-8">
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Reopen
              </Button>
            ) : (
              <Button size="sm" className="min-h-11 @min-[34rem]/lead:min-h-8">
                <CircleCheck className="size-3.5" aria-hidden="true" />
                Mark as won
              </Button>
            )}
          </div>
        </div>

        {/* ─────────────── Phone: summary, then tabs ─────────────── */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 @min-[46rem]/lead:hidden">
          {identity}
          <TabbedSections
            tab={tab}
            setTab={setTab}
            activity={activity}
            details={details}
          />
        </div>

        {/* ─────────────── Wider: columns ─────────────── */}
        <div className="hidden items-start gap-4 @min-[46rem]/lead:grid @min-[46rem]/lead:grid-cols-[19rem_minmax(0,1fr)] @min-[68rem]/lead:grid-cols-[18rem_minmax(0,1fr)_20rem]">
          <div className="grid gap-4 @min-[46rem]/lead:sticky @min-[46rem]/lead:top-20">
            {identity}
          </div>

          {activity}

          <div className="hidden gap-4 @min-[68rem]/lead:sticky @min-[68rem]/lead:top-20 @min-[68rem]/lead:grid">
            {details}
          </div>

          <div className="grid items-start gap-4 @min-[36rem]/lead:grid-cols-2 @min-[46rem]/lead:col-span-2 @min-[68rem]/lead:hidden">
            {details}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/* Phone tabs                                                          */
/* ------------------------------------------------------------------ */

/**
 * ACTIVITY / DETAILS, hand-built because the project has no tabs primitive
 * and one tablist does not justify adding a dependency.
 *
 * Full keyboard semantics: roving tabindex, arrow keys, Home and End — the
 * pattern a screen-reader user is entitled to expect from `role="tablist"`.
 * Claiming the role without the behaviour is worse than using buttons.
 */
function TabbedSections({
  tab,
  setTab,
  activity,
  details,
}: {
  tab: "activity" | "details";
  setTab: (next: "activity" | "details") => void;
  activity: React.ReactNode;
  details: React.ReactNode;
}) {
  const order = ["activity", "details"] as const;
  const move = (delta: number) => {
    const next =
      order[(order.indexOf(tab) + delta + order.length) % order.length]!;
    setTab(next);
    requestAnimationFrame(() =>
      document.getElementById(`tab-${next}`)?.focus(),
    );
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div
        role="tablist"
        aria-label="Lead sections"
        className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          }
          if (event.key === "Home") {
            event.preventDefault();
            setTab("activity");
          }
          if (event.key === "End") {
            event.preventDefault();
            setTab("details");
          }
        }}
      >
        {order.map((key) => (
          <button
            key={key}
            id={`tab-${key}`}
            role="tab"
            type="button"
            aria-selected={tab === key}
            aria-controls={`panel-${key}`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            className={`h-11 rounded-md text-sm font-medium transition-colors motion-reduce:transition-none ${
              tab === key
                ? "bg-surface text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {key === "activity" ? "Activity" : "Details"}
          </button>
        ))}
      </div>

      <div
        id="panel-activity"
        role="tabpanel"
        aria-labelledby="tab-activity"
        hidden={tab !== "activity"}
      >
        {tab === "activity" ? activity : null}
      </div>
      <div
        id="panel-details"
        role="tabpanel"
        aria-labelledby="tab-details"
        hidden={tab !== "details"}
        className="grid gap-3"
      >
        {tab === "details" ? details : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Identity and contact                                                */
/* ------------------------------------------------------------------ */

function IdentityPanel({
  sample,
  ownerName,
  owner,
  setOwner,
  stageId,
  setStageId,
  stageName,
  isOutcome,
  reassigning,
  setReassigning,
  reassignTrigger,
}: {
  sample: SampleLead;
  ownerName: string;
  owner: string;
  setOwner: (next: string) => void;
  stageId: string;
  setStageId: (next: string) => void;
  stageName: string;
  isOutcome: boolean;
  reassigning: boolean;
  setReassigning: (next: boolean) => void;
  reassignTrigger: React.RefObject<HTMLButtonElement | null>;
}) {
  const { lead, stages } = sample;

  return (
    <section
      aria-label="Lead identity and contact"
      className="surface-glass grid gap-3 rounded-xl p-4"
    >
      <div className="flex items-start gap-3">
        <Initials name={lead.name} className="size-11 text-sm" />
        <div className="min-w-0 flex-1">
          {/*
            `break-words` and not `truncate`: a long name on a 18rem rail is
            a real name, and hiding half of it to protect the layout is the
            layout being protected from the data.
          */}
          <h1 className="text-base leading-tight font-semibold break-words">
            {lead.name}
          </h1>
          <div className="mt-1.5">
            <StatusBadge
              tone={stageTone(
                !isOutcome ? "active" : sample.lostReason ? "lost" : "won",
              )}
              label={isOutcome ? lead.stageName : stageName}
            />
          </div>
        </div>
      </div>

      {/* Contact rows are links — the row is the target, not a separate button. */}
      <div className="grid gap-0.5">
        {lead.phone ? (
          <a
            href={`tel:${lead.phoneNormalised ?? lead.phone}`}
            className="group -mx-2 flex min-h-11 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            <Phone
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 break-words">{lead.phone}</span>
            <span className="shrink-0 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
              Call
            </span>
          </a>
        ) : null}
        {lead.email ? (
          <a
            href={`mailto:${lead.email}`}
            className="group -mx-2 flex min-h-11 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
          >
            <Mail
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 break-words">{lead.email}</span>
          </a>
        ) : (
          <p className="-mx-2 flex items-center gap-2.5 px-2 py-1.5 text-sm text-muted-foreground">
            <Mail className="size-4 shrink-0" aria-hidden="true" />
            No email recorded
          </p>
        )}
      </div>

      {lead.phoneNeedsReview ? (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-2.5 py-2 text-xs text-warning-on-subtle">
          <TriangleAlert
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>
            No country code, so this number is not compared against other leads.
            Adding +91 turns duplicate checking back on.
          </span>
        </p>
      ) : null}

      <Separator />

      {/* ── Placement action: where the lead sits ── */}
      <div className="grid gap-2">
        <Label
          htmlFor="preview-stage"
          className="text-xs text-muted-foreground"
        >
          {isOutcome ? "Reopen into" : "Stage"}
        </Label>
        <div className="flex items-end gap-2">
          <Select value={stageId} onValueChange={setStageId}>
            <SelectTrigger
              id="preview-stage"
              className="min-h-11 min-w-0 flex-1 @min-[46rem]/lead:min-h-9"
              aria-label={isOutcome ? "Reopen into stage" : "Stage"}
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
          <Button
            variant="secondary"
            className="min-h-11 shrink-0 @min-[46rem]/lead:min-h-9"
          >
            {isOutcome ? "Reopen" : "Move"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* ── Placement action: who owns it ── */}
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Record owner
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                ref={reassignTrigger}
                variant="ghost"
                size="xs"
                className="min-h-11 @min-[46rem]/lead:min-h-8"
                onClick={() => setReassigning(!reassigning)}
                aria-expanded={reassigning}
                aria-controls="preview-reassign"
              >
                <ArrowRightLeft className="size-3" aria-hidden="true" />
                {reassigning ? "Cancel" : "Reassign"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Hand this lead to another member</TooltipContent>
          </Tooltip>
        </div>
        <p className="flex items-center gap-2 text-sm">
          <Initials
            name={ownerName}
            muted
            className="size-6 text-[0.5625rem]"
          />
          <span className="min-w-0 break-words">{ownerName}</span>
        </p>
        {reassigning ? (
          <div id="preview-reassign" className="flex items-end gap-2">
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger
                className="min-w-0 flex-1"
                aria-label="New record owner"
              >
                <SelectValue placeholder="Choose a person" />
              </SelectTrigger>
              <SelectContent>
                {sample.assignableMembers.map((member) => (
                  <SelectItem
                    key={member.userProfileId}
                    value={member.userProfileId}
                  >
                    {member.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="min-h-11 shrink-0 @min-[46rem]/lead:min-h-9"
              onClick={() => setReassigning(false)}
            >
              Hand over
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Activity workspace                                                  */
/* ------------------------------------------------------------------ */

function ActivityWorkspace({
  entries,
  nameOf,
  note,
  setNote,
  addNote,
  saving,
}: {
  entries: readonly LeadActivityEntry[];
  nameOf: (id: string | null) => string;
  note: string;
  setNote: (next: string) => void;
  addNote: () => void;
  saving: boolean;
}) {
  const days: { key: string; entries: LeadActivityEntry[] }[] = [];
  for (const entry of entries) {
    const key = longDayLabel(entry.occurredAt);
    const last = days.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else days.push({ key, entries: [entry] });
  }

  return (
    <section
      aria-label="Activity"
      className="surface-solid @container/activity grid min-w-0 gap-0 rounded-xl"
    >
      <div className="border-b border-border p-3 @min-[30rem]/activity:p-4">
        <Label htmlFor="preview-note" className="text-xs text-muted-foreground">
          Log a note
        </Label>
        {/*
          THE DISTINCTION THE BRIEF ASKS FOR, said out loud.
          A logged note is an event on the timeline, attributed and
          permanent. "About this lead" in Details is a standing description
          that is edited with the record. Two different things that both
          used to be called "notes".
        */}
        {/*
          The distinction, in one line on a phone and in full where there is
          room. Measured: label + two-line hint + textarea + button came to
          189px, a quarter of a 360px screen, before the timeline started.
        */}
        <p className="mt-0.5 mb-1.5 text-xs text-muted-foreground/80">
          Added to the timeline
          <span className="@min-[30rem]/activity:hidden">
            {" "}
            &mdash; not the lead&rsquo;s description
          </span>
          <span className="hidden @min-[30rem]/activity:inline">
            . To change the lead&rsquo;s own description, edit{" "}
            <span className="font-medium">About this lead</span>.
          </span>
        </p>
        <div className="flex flex-col gap-2 @min-[30rem]/activity:flex-row @min-[30rem]/activity:items-end">
          <textarea
            id="preview-note"
            rows={note.length > 0 ? 3 : 1}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What happened?"
            className="min-h-11 w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none @min-[30rem]/activity:min-h-9"
          />
          <Button
            className="min-h-11 w-full shrink-0 @min-[30rem]/activity:min-h-9 @min-[30rem]/activity:w-auto"
            disabled={note.trim().length === 0 || saving}
            onClick={addNote}
          >
            <MessageSquarePlus className="size-3.5" aria-hidden="true" />
            {saving ? "Adding…" : "Add note"}
          </Button>
        </div>
      </div>

      <div className="p-3 @min-[30rem]/activity:p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Activity
          </h2>
          <p className="text-xs text-muted-foreground">
            Times in {ZONE.replace("_", " ")}
          </p>
        </div>

        {days.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing has been recorded for this lead yet.
          </p>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
            {days.map((day) => (
              <div
                key={day.key}
                className="grid grid-cols-[minmax(0,1fr)] gap-1"
              >
                {/*
                  STICKY, AND BELOW THE SHELL'S TOP BAR.
                  The app shell's header is `sticky top-0 z-20` and 4rem
                  tall, so a heading stuck at `top-0` slides underneath it
                  and disappears. `top-20` clears it; `z-[3]` puts the
                  heading above the rail and the dots (`z-[1]`) so entries
                  scroll UNDER it rather than through it, and the opaque
                  background is what makes that readable.
                */}
                <h3 className="sticky top-20 z-[3] -mx-1 rounded bg-surface/95 px-1 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                  {day.key}
                </h3>
                <ol className="grid grid-cols-[minmax(0,1fr)]">
                  {day.entries.map((entry) => {
                    const d = describe(
                      entry,
                      nameOf(entry.actorUserProfileId),
                      nameOf,
                    );
                    const Icon = d.icon;
                    const last = isLast(day, entry, days);
                    return (
                      <li
                        key={entry.id}
                        className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 pb-3 last:pb-0"
                      >
                        {last ? null : (
                          <span
                            aria-hidden="true"
                            className="absolute top-7 -bottom-1 left-[0.84rem] w-px bg-border"
                          />
                        )}
                        <span
                          aria-hidden="true"
                          className={`z-[1] mt-0.5 grid size-7 place-items-center rounded-full border ${TONE_RING[d.tone]}`}
                        >
                          <Icon className="size-3.5" />
                        </span>
                        <div className="min-w-0 pt-1">
                          <div className="flex flex-col gap-x-3 gap-y-0.5 @min-[26rem]/activity:flex-row @min-[26rem]/activity:items-baseline @min-[26rem]/activity:justify-between">
                            <p className="text-sm font-medium">{d.headline}</p>
                            <time className="order-first text-xs whitespace-nowrap text-muted-foreground @min-[26rem]/activity:order-none">
                              {timeLabel(entry.occurredAt)}
                            </time>
                          </div>
                          {d.detail ? (
                            d.quoted ? (
                              <p className="mt-1 rounded-md border-l-2 border-border bg-muted/40 px-2.5 py-1.5 text-sm whitespace-pre-wrap">
                                {d.detail}
                              </p>
                            ) : (
                              <p className="mt-0.5 text-sm whitespace-pre-wrap text-muted-foreground">
                                {d.detail}
                              </p>
                            )
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function isLast(
  day: { key: string; entries: LeadActivityEntry[] },
  entry: LeadActivityEntry,
  days: readonly { key: string; entries: LeadActivityEntry[] }[],
): boolean {
  return days.at(-1)?.key === day.key && day.entries.at(-1)?.id === entry.id;
}

/* ------------------------------------------------------------------ */
/* Supporting details                                                  */
/* ------------------------------------------------------------------ */

/**
 * NOTHING HERE REPEATS THE IDENTITY PANEL.
 *
 * The owner used to appear in both, and the source appeared under the name
 * and again as a row. Each fact now has exactly one home: identity carries
 * who and how to reach them, this carries where it came from and when.
 *
 * Each panel renders only when it has something to say. A panel headed
 * "Notes" above the word "None" takes the same space as a real one and
 * carries no information — Zoho calls the same idea a smart view.
 */
function SupportingPanels({ sample }: { sample: SampleLead }) {
  const { lead } = sample;

  return (
    <>
      {sample.lostReason ? (
        <Panel title="Outcome">
          <dl className="divide-y divide-border">
            <Fact icon={CircleSlash} label="Result">
              <StatusBadge tone="danger" label="Lost" />
            </Fact>
            <Fact label="Reason">
              {LEAD_LOST_REASON_LABELS[sample.lostReason as LeadLostReason]}
            </Fact>
            {sample.lostReasonNote ? (
              <Fact label="Detail">
                <span className="whitespace-pre-wrap">
                  {sample.lostReasonNote}
                </span>
              </Fact>
            ) : null}
          </dl>
        </Panel>
      ) : null}

      {lead.notes ? (
        <Panel
          title="About this lead"
          hint="A standing description, edited with the lead — not a timeline note."
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {lead.notes}
          </p>
        </Panel>
      ) : null}

      <Panel title="Lead details">
        <dl className="divide-y divide-border">
          <Fact icon={Tag} label="Source">
            {lead.sourceName ?? "Not recorded"}
          </Fact>
          <Fact icon={CalendarDays} label="Created">
            {dayLabel(lead.createdAt)}
          </Fact>
          <Fact icon={CalendarDays} label="Last activity">
            {`${dayLabel(lead.updatedAt)} · ${timeLabel(lead.updatedAt)}`}
          </Fact>
        </dl>
      </Panel>
    </>
  );
}
