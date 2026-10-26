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
import Link from "next/link";

import {
  formatWorkspaceDate,
  formatWorkspaceMoment,
} from "@/lib/workspace-time";

import { StatusBadge, type StatusTone } from "@/components/data/status-badge";
import {
  LeadLifecyclePanel,
  type LifecycleSlots,
  type MemberOption,
  type StageOption,
} from "@/components/leads/lead-lifecycle-panel";
import { Initials, stageTone } from "@/components/leads/presentation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { LEAD_LOST_REASON_LABELS } from "@/lib/validation/leads";
import type { LeadLostReason } from "@/lib/validation/leads";
import type {
  LeadActivityEntry,
  LeadDetail,
  LeadForEdit,
} from "@/server/auth/workspace-leads";

import { LeadDetailSections } from "./lead-detail-tabs";

/**
 * Lead Detail — §35, §36, §37, §39.
 *
 * **A Lead this person may not access is `notFound()`, not "forbidden".**
 * That decision belongs to the route; this renders what it was given.
 *
 * ── The shape of the screen ───────────────────────────────────────────────
 *
 *   identity / contact  │  activity workspace  │  supporting details
 *
 * Three columns where there is room, two where there is not, one on a phone
 * — driven by CONTAINER queries, because the space this screen gets is not
 * the viewport: the shell's sidebar takes 264px, or 76px collapsed, and
 * collapsing it must be able to buy a column without the window changing.
 *
 * ── Where the controls are ────────────────────────────────────────────────
 *
 * Record-level actions sit in the header; placement actions sit beside the
 * fact they change — the stage control under the stage, Reassign beside the
 * Record Owner. **None of them is reimplemented here.** They are rendered by
 * `LeadLifecyclePanel`, which still owns every form, every action state and
 * every refusal message; this file only decides where its pieces go.
 *
 * ── §39's timeline ────────────────────────────────────────────────────────
 *
 * The real `lead_activities` history, showing the kinds this application can
 * emit. A screen that lists what the product cannot do yet is a build plan,
 * not a record; the gaps are tracked in `docs/dependencies.md`.
 */

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
      /* §163.13 asks for both ends, so both are shown. */
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
        {Icon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
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
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="@container/panel surface-elevated rounded-xl">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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

export function LeadDetailView({
  lead,
  editable,
  activity,
  actorNames,
  stages,
  sources,
  workspaceId,
  assignableMembers,
  ownerName,
  timeZone,
  timeZoneLabel,
}: {
  lead: LeadDetail;
  /**
   * The same Lead, with the revision every control has to carry — `null`
   * when §162 withholds `edit_permitted_records`, in which case no control
   * is drawn at all rather than one that would be refused on submission.
   */
  editable: LeadForEdit | null;
  activity: readonly LeadActivityEntry[];
  /** Profile id to display name, for §39's authorship. */
  actorNames: Readonly<Record<string, string>>;
  /** Open, ordinary stages — the only ones a Lead can be moved to by hand. */
  stages: readonly StageOption[];
  sources: readonly StageOption[];
  workspaceId: string;
  /** §163.10's recipients; empty for an actor who may not reassign. */
  assignableMembers: readonly MemberOption[];
  ownerName: string;
  /**
   * The WORKSPACE's §158 zone, as a string.
   *
   * Not a formatter function: this is a Client Component, and a function
   * cannot be passed across the server boundary. The zone and a pinned
   * locale are enough to produce the same text on both passes, which is what
   * keeps the server render and the client render in agreement.
   */
  timeZone: string;
  timeZoneLabel: string;
}) {
  const formatWhen = (when: Date) => formatWorkspaceMoment(when, timeZone);
  const formatDayOf = (when: Date) => formatWorkspaceDate(when, timeZone);
  const createdOn = formatWorkspaceDate(lead.createdAt, timeZone);

  const nameOf = (userProfileId: string | null): string =>
    userProfileId === null
      ? "the system"
      : (actorNames[userProfileId] ?? "a team member");

  /*
   * The Lost reason, for the Outcome panel.
   *
   * `editable` carries it, but only for an actor who may edit. A reader who
   * may not still deserves to know WHY a Lead is lost, and §39 already told
   * them in the timeline — so the newest `marked_lost` entry is the fallback
   * rather than a second query.
   */
  /*
   * Open or finished, from the stage's KIND. `stageIsActive` answers a
   * different question — whether §34 has that stage switched on — and a Won
   * or Lost stage is switched on like any other.
   */
  const isOutcome = lead.stageKind !== "active";
  const lastLost = activity.find((entry) => entry.kind === "marked_lost");
  /*
   * The RECORD is authoritative when it is readable. §48's reopen clears
   * `lost_reason` from the Lead but leaves the `marked_lost` entry in the
   * history for ever — so falling back to history unconditionally would show
   * an Outcome panel on a Lead that had been reopened. The fallback is
   * therefore only for a reader who has no `editable`, and only while the
   * Lead is actually sitting in an outcome stage.
   */
  const lostReason = editable
    ? editable.lostReason
    : isOutcome
      ? (lastLost?.lostReason ?? null)
      : null;
  const lostReasonNote = editable
    ? editable.lostReasonNote
    : isOutcome
      ? (lastLost?.note ?? null)
      : null;

  const identity = (slots: LifecycleSlots | null) => (
    <section
      aria-label="Lead identity and contact"
      className="surface-glass grid gap-3 rounded-xl p-4"
    >
      <div className="flex items-start gap-3">
        <Initials name={lead.name} className="size-11 text-sm" />
        <div className="min-w-0 flex-1">
          <h1 className="text-base leading-tight font-semibold break-words">
            {lead.name}
          </h1>
          <div className="mt-1.5">
            <StatusBadge
              tone={stageTone(lead.stageKind)}
              label={lead.stageName}
            />
          </div>
        </div>
      </div>

      {/* §27.1: the row is the dial target, not a button repeating the number. */}
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
            This number has no country code, so it is stored exactly as it was
            typed and is not compared against other leads. Adding the country
            code — for example +91 — makes duplicate checking work.
          </span>
        </p>
      ) : null}

      {/* ── Placement actions, beside the facts they change ── */}
      {slots ? (
        <>
          <Separator />
          {slots.stageControl}
          {slots.ownerControl ? (
            <>
              <Separator />
              {slots.ownerControl}
            </>
          ) : (
            <>
              <Separator />
              <div className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Record owner
                </span>
                <p className="flex items-center gap-2 text-sm">
                  <Initials
                    name={ownerName}
                    muted
                    className="size-6 text-[0.5625rem]"
                  />
                  <span className="min-w-0 break-words">{ownerName}</span>
                </p>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <Separator />
          <div className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Record owner
            </span>
            <p className="flex items-center gap-2 text-sm">
              <Initials
                name={ownerName}
                muted
                className="size-6 text-[0.5625rem]"
              />
              <span className="min-w-0 break-words">{ownerName}</span>
            </p>
          </div>
        </>
      )}
    </section>
  );

  const activityWorkspace = (slots: LifecycleSlots | null) => (
    <section
      aria-label="Activity"
      className="@container/activity surface-solid grid min-w-0 gap-0 rounded-xl"
    >
      {slots ? (
        <div className="border-b border-border p-3 @min-[30rem]/activity:p-4">
          {slots.noteComposer}
        </div>
      ) : null}

      <div className="p-3 @min-[30rem]/activity:p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Activity
          </h2>
          <p className="text-xs text-muted-foreground">
            Times in {timeZoneLabel}
          </p>
        </div>
        <Timeline
          activity={activity}
          nameOf={nameOf}
          formatWhen={formatWhen}
          formatDayOf={formatDayOf}
        />
      </div>
    </section>
  );

  const details = (
    <>
      {lostReason ? (
        <Panel title="Outcome">
          <dl className="divide-y divide-border">
            <Fact icon={CircleSlash} label="Result">
              <StatusBadge
                tone="danger"
                label={isOutcome ? lead.stageName : "Lost"}
              />
            </Fact>
            <Fact label="Reason">
              {LEAD_LOST_REASON_LABELS[lostReason as LeadLostReason]}
            </Fact>
            {lostReasonNote ? (
              <Fact label="Detail">
                <span className="whitespace-pre-wrap">{lostReasonNote}</span>
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
            {createdOn}
          </Fact>
          <Fact icon={CalendarDays} label="Last activity">
            {formatWhen(lead.updatedAt)}
          </Fact>
        </dl>
      </Panel>
    </>
  );

  const header = (slots: LifecycleSlots | null) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="-ml-2 min-h-11 shrink-0 text-muted-foreground @min-[34rem]/lead:min-h-8"
      >
        <Link href="/leads">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Leads
        </Link>
      </Button>
      <span
        className="hidden text-muted-foreground/60 @min-[30rem]/lead:inline"
        aria-hidden="true"
      >
        /
      </span>
      {/*
        A breadcrumb, not the page heading — and hidden where it would only
        repeat the identity card below it. The <h1> is in that card, so there
        is exactly one on every width.
      */}
      <span
        className="hidden min-w-0 flex-1 truncate text-base font-medium @min-[30rem]/lead:block"
        aria-hidden="true"
      >
        {lead.name}
      </span>
      <span className="flex-1 @min-[30rem]/lead:hidden" />

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/*
          Get in touch, behind one labelled menu. Only `tel:` and `mailto:`
          go in here — they are plain links and survive the menu closing.
          Edit and Mark as lost stay as buttons because each is a sheet whose
          trigger must still exist when the sheet opens.
        */}
        {lead.phone || lead.email ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="min-h-11 @min-[34rem]/lead:min-h-8"
              >
                Contact
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
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
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {slots ? (
          <>
            {slots.editControl}
            {slots.outcomeActions}
          </>
        ) : null}
      </div>
    </div>
  );

  const layout = (slots: LifecycleSlots | null) => (
    <div className="@container/lead grid w-full grid-cols-[minmax(0,1fr)] gap-4">
      {header(slots)}

      {/*
        ONE set of content, placed by the grid.
        Rendering a phone layout and a wider one and hiding whichever did not
        apply duplicated every `id` inside them, and the visible labels then
        pointed at hidden controls — measured on the real screen. The sections
        below are rendered once; the grid decides where they sit and
        `LeadDetailSections` decides which is shown while there is only one
        column.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 @min-[46rem]/lead:grid-cols-[19rem_minmax(0,1fr)] @min-[68rem]/lead:grid-cols-[18rem_minmax(0,1fr)_20rem]">
        <div className="min-w-0 @min-[46rem]/lead:sticky @min-[46rem]/lead:top-20">
          {identity(slots)}
        </div>

        <LeadDetailSections
          activity={activityWorkspace(slots)}
          details={details}
        />
      </div>
    </div>
  );

  /*
   * With edit permission the lifecycle panel renders the controls and this
   * file places them. Without it there are no controls at all — not disabled
   * ones, which would promise something the server would refuse.
   */
  return editable ? (
    <LeadLifecyclePanel
      lead={editable}
      stages={stages}
      sources={sources}
      workspaceId={workspaceId}
      assignableMembers={assignableMembers}
      currentOwnerUserProfileId={lead.recordOwnerUserProfileId}
    >
      {(slots) => layout(slots)}
    </LeadLifecyclePanel>
  ) : (
    layout(null)
  );
}

/* ------------------------------------------------------------------ */

function Timeline({
  activity,
  nameOf,
  formatWhen,
  formatDayOf,
}: {
  activity: readonly LeadActivityEntry[];
  nameOf: (id: string | null) => string;
  formatWhen: (when: Date) => string;
  formatDayOf: (when: Date) => string;
}) {
  if (activity.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nothing has been recorded for this lead yet.
      </p>
    );
  }

  /* Grouped by day, so a busy week does not read as one undifferentiated run. */
  const days: { key: string; entries: LeadActivityEntry[] }[] = [];
  for (const entry of activity) {
    const key = formatDayOf(entry.occurredAt);
    const last = days.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else days.push({ key, entries: [entry] });
  }

  const isLast = (
    day: (typeof days)[number],
    entry: LeadActivityEntry,
  ): boolean =>
    days.at(-1)?.key === day.key && day.entries.at(-1)?.id === entry.id;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {days.map((day) => (
        <div key={day.key} className="grid grid-cols-[minmax(0,1fr)] gap-1">
          {/*
            Sticky BELOW the shell's top bar, which is `sticky top-0 z-20`
            and 4rem tall: a heading stuck at `top-0` slides underneath it
            and disappears. `z-[3]` puts it above the rail and the dots so
            entries scroll under it rather than through it.
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
              return (
                <li
                  key={entry.id}
                  className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 pb-3 last:pb-0"
                >
                  {isLast(day, entry) ? null : (
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
                        {formatWhen(entry.occurredAt)}
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
  );
}
