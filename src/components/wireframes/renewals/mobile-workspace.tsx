"use client";

import {
  AlarmClock,
  BellRing,
  CalendarClock,
  CalendarPlus,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Lock,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { CallHandoffSheet } from "@/components/wireframes/mobile-sheet-parts";
import {
  PhoneFrame,
  PhoneScreen,
  PhoneSheet,
} from "@/components/wireframes/phone-frame";
import { WireframeBrand } from "@/components/wireframes/wireframe-brand";
import { Avatar } from "@/components/wireframes/wf-ui";
import {
  customerPhoneByReference,
  MOBILE_RENEWALS,
  PRESENTATION_TODAY,
  RENEWAL_DUE_SOON_DAYS,
  SALES_PERSONA,
  type MobileRenewal,
  type ReminderStage,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * R1 — Renewals & Reminders on a phone.
 *
 * §79 asks for "a vertical work list rather than a desktop table" here, and
 * §64 supplies the fields. The screen answers one question first — which
 * renewals are late or close — and keeps the reminder schedule one tap away
 * rather than on every card.
 *
 * FOUR DIFFERENT STATES, deliberately never merged into one badge:
 *
 *   Renewal status    where the DUE DATE stands (§66)
 *   Reminder status   whether the scheduled message went (§68)
 *   Last contact      when a human last spoke to them
 *   Outcome           whether the renewal was actually completed (§71)
 *
 * A card that showed only "overdue" would hide the fact that the final
 * reminder failed, which is usually the reason it is overdue.
 *
 * VISIBILITY combines two separate rules. The customer must be one Sneha may
 * access — owned by her or explicitly shared, the same rule the directory
 * applies — and §65's Assigned To on the renewal action must be hers. A
 * WhatsApp conversation assignment grants neither.
 *
 * Everything is component state. No reminder is scheduled, sent or cancelled.
 */

type FilterId = "overdue" | "due-soon" | "upcoming" | "renewed";

const FILTERS: readonly { id: FilterId; label: string; hint: string }[] = [
  {
    id: "overdue",
    label: "Overdue",
    hint: "The due date passed without the renewal being completed. The original due date is kept.",
  },
  {
    id: "due-soon",
    label: "Due soon",
    hint: `Due within the next ${RENEWAL_DUE_SOON_DAYS} days, today included.`,
  },
  {
    id: "upcoming",
    label: "Upcoming",
    hint: `Due later than ${RENEWAL_DUE_SOON_DAYS} days from now.`,
  },
  {
    id: "renewed",
    label: "Renewed",
    hint: "Completed for this cycle. The previous period stays in the history.",
  },
];

function bucketOf(r: MobileRenewal): FilterId {
  if (r.status === "Renewed / Completed") return "renewed";
  if (r.status === "Overdue") return "overdue";
  return r.dueInDays <= RENEWAL_DUE_SOON_DAYS ? "due-soon" : "upcoming";
}

/** Plain words for the due date, never a bare number. */
function duePhrase(r: MobileRenewal): string {
  if (r.status === "Renewed / Completed") return `Renewed ${r.renewedOn}`;
  if (r.dueInDays < 0) {
    const d = Math.abs(r.dueInDays);
    return d === 1 ? "1 day overdue" : `${d} days overdue`;
  }
  if (r.dueInDays === 0) return "Due today";
  return r.dueInDays === 1 ? "Due tomorrow" : `Due in ${r.dueInDays} days`;
}

/**
 * The reminder stage that matters right now: a failure first, then the next
 * one still to go, then the last one that went.
 */
function currentStage(r: MobileRenewal): ReminderStage | undefined {
  return (
    r.reminders.find((s) => s.status === "Failed") ??
    r.reminders.find((s) => s.status === "Scheduled") ??
    [...r.reminders].reverse().find((s) => s.status === "Sent") ??
    r.reminders[0]
  );
}

function stageWords(s: ReminderStage): string {
  const when = `${s.offsetDays} day${s.offsetDays === 1 ? "" : "s"} before`;
  return `${when} · ${s.channel} · ${s.status} ${s.date}`;
}

function matches(r: MobileRenewal, term: string): boolean {
  if (!term) return true;
  const hay = [r.customer, r.reference, r.product, r.provider, r.policyRef]
    .join(" ")
    .toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

type SheetKind = "call" | "reminders" | "outcome";
type OpenSheet = { kind: SheetKind; id: string };

export function MobileRenewalsScreen() {
  const [filter, setFilter] = useState<FilterId>("due-soon");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<OpenSheet | null>(null);

  const counts = useMemo(() => {
    const by = (id: FilterId) =>
      MOBILE_RENEWALS.filter((r) => bucketOf(r) === id).length;
    return {
      overdue: by("overdue"),
      "due-soon": by("due-soon"),
      upcoming: by("upcoming"),
      renewed: by("renewed"),
    };
  }, []);

  const searching = query.trim().length > 0;

  const visible = useMemo(() => {
    const term = query.trim();
    return MOBILE_RENEWALS.filter((r) =>
      term ? matches(r, term) : bucketOf(r) === filter,
    ).sort((a, b) => a.dueInDays - b.dueInDays);
  }, [filter, query]);

  const active = sheet
    ? MOBILE_RENEWALS.find((r) => r.id === sheet.id)
    : undefined;
  const activeFilter = FILTERS.find((f) => f.id === filter)!;

  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-0 py-0 md:px-6 md:py-8">
        <PhoneFrame caption="390 × 844 · what is falling due, and what was sent">
          <PhoneScreen
            activeNav="more"
            sheet={
              sheet && active ? (
                <PhoneSheet
                  label={
                    sheet.kind === "call"
                      ? "Call hand-off"
                      : sheet.kind === "reminders"
                        ? "Reminder schedule"
                        : "Renewal outcome"
                  }
                  onClose={() => setSheet(null)}
                >
                  {sheet.kind === "call" ? (
                    <CallHandoffSheet
                      person={active.customer}
                      // Non-null because Call is only offered when the
                      // directory holds a number for this customer.
                      phone={customerPhoneByReference(active.reference)!}
                      returnsTo="your renewals"
                      onClose={() => setSheet(null)}
                    />
                  ) : null}
                  {sheet.kind === "reminders" ? (
                    <ReminderSheet
                      renewal={active}
                      onClose={() => setSheet(null)}
                    />
                  ) : null}
                  {sheet.kind === "outcome" ? (
                    <OutcomeSheet
                      renewal={active}
                      onClose={() => setSheet(null)}
                    />
                  ) : null}
                </PhoneSheet>
              ) : null
            }
            header={
              <header className="surface-glass rounded-none border-x-0 border-t-0 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
                <div className="flex items-center justify-between gap-2">
                  <WireframeBrand variant="compact" />
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-[11px] text-muted-foreground xs:inline">
                      {SALES_PERSONA.role}
                    </span>
                    <Avatar initials={SALES_PERSONA.initials} size="sm" />
                  </span>
                </div>

                <h1 className="mt-2.5 text-lg font-semibold tracking-tight text-foreground">
                  Renewals
                </h1>

                <label className="surface-solid mt-2 flex min-h-11 items-center gap-2.5 rounded-lg px-3">
                  <Search
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Search renewals</span>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Customer, product, provider or policy"
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      aria-label="Clear search"
                      className="-me-1 grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground"
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </label>
              </header>
            }
          >
            <div className="flex flex-col gap-3 px-3 py-3">
              {/* Operational only. No premium totals, revenue, commission or
                  forecasts — none of which V1 defines for this role. */}
              <dl className="grid grid-cols-3 gap-2">
                <Summary
                  label="Overdue"
                  value={counts.overdue}
                  tone="danger"
                  icon={AlarmClock}
                />
                <Summary
                  label="Due soon"
                  value={counts["due-soon"]}
                  tone="warning"
                  icon={CalendarClock}
                />
                <Summary
                  label="Upcoming"
                  value={counts.upcoming}
                  tone="muted"
                  icon={RefreshCw}
                />
              </dl>

              <div
                role="group"
                aria-label="Filter renewals"
                className="flex flex-wrap gap-1.5"
              >
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
                      filter === f.id
                        ? "border-primary/40 bg-primary/12 text-primary"
                        : "border-border bg-surface text-muted-foreground",
                    )}
                  >
                    {f.label}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[10px] font-semibold",
                        filter === f.id
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {counts[f.id]}
                    </span>
                  </button>
                ))}
              </div>

              <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
                {searching
                  ? `Searching every renewal assigned to you, not just ${activeFilter.label}.`
                  : activeFilter.hint}
              </p>

              <p role="status" aria-live="polite" className="sr-only">
                {visible.length === 0
                  ? searching
                    ? "No renewals match your search"
                    : `No renewals in ${activeFilter.label}`
                  : searching
                    ? `Showing ${visible.length} matching renewals`
                    : `Showing ${visible.length} ${activeFilter.label.toLowerCase()} renewals`}
              </p>

              {visible.length === 0 ? (
                <EmptyState
                  filter={filter}
                  query={query}
                  counts={counts}
                  onClearSearch={() => setQuery("")}
                  onGoTo={setFilter}
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {visible.map((r) => (
                    <li key={r.id}>
                      <RenewalCard
                        renewal={r}
                        onAction={(kind) => setSheet({ kind, id: r.id })}
                      />
                    </li>
                  ))}
                </ul>
              )}

              <p className="px-1 pb-1 text-[11px] leading-relaxed text-muted-foreground">
                You see renewals assigned to you on customers you own or that
                are shared with you. Reminder schedules are configured by an
                administrator.
              </p>
            </div>
          </PhoneScreen>
        </PhoneFrame>
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "danger" | "warning" | "muted";
  icon: LucideIcon;
}) {
  const toneClass = {
    danger: "text-danger-on-subtle",
    warning: "text-warning-on-subtle",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="surface-glass rounded-lg px-2.5 py-2">
      <dt className="flex items-center gap-1 text-[10px] leading-tight font-medium text-muted-foreground">
        <Icon className="size-3 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd
        className={cn("mt-0.5 text-lg leading-none font-semibold", toneClass)}
      >
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ card */

function RenewalCard({
  renewal: r,
  onAction,
}: {
  renewal: MobileRenewal;
  onAction: (kind: SheetKind) => void;
}) {
  const bucket = bucketOf(r);
  // Looked up, never invented. A customer the directory does not hold has no
  // number, and the card says that instead of showing something dialable.
  const phone = customerPhoneByReference(r.reference);
  const stage = currentStage(r);
  const failed = r.reminders.some((s) => s.status === "Failed");
  const renewed = bucket === "renewed";

  const identity = (
    <>
      <Avatar
        initials={initialsOf(r.customer)}
        tone={renewed ? "muted" : bucket === "overdue" ? "primary" : "muted"}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-foreground">
          {r.customer}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {r.reference} · {r.product}
        </span>
      </span>
    </>
  );

  return (
    <div className="surface-solid rounded-xl p-3">
      {r.hasRecord ? (
        <Link
          href={"/wireframes/customers/mobile?from=renewals" as Route}
          aria-label={`Open ${r.customer}'s customer record`}
          className="-m-1 flex min-h-11 items-center gap-3 rounded-lg p-1 transition-colors hover:bg-accent/60"
        >
          {identity}
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </Link>
      ) : (
        <div className="flex items-center gap-3">{identity}</div>
      )}

      <dl className="mt-2.5 flex flex-col gap-1 text-[11px]">
        <Row label="Provider" value={r.provider} />
        <Row label="Policy" value={r.policyRef} />
        <Row
          label={renewed ? "Next due" : "Due"}
          value={`${r.due} · ${duePhrase(r)}`}
        />
        {renewed && r.previousDue ? (
          // §71: the closed cycle stays visible. Renewing does not erase it.
          <Row
            label="Previous cycle"
            value={`Due ${r.previousDue} · renewed`}
          />
        ) : null}
        {stage ? <Row label="Reminder" value={stageWords(stage)} /> : null}
        {r.lastContact ? (
          <Row label="Last contact" value={r.lastContact} />
        ) : null}
        {r.recordOwner !== r.assignedTo ? (
          // §65: the two are different things, so they are two rows.
          <>
            <Row label="Record owner" value={r.recordOwner} />
            <Row label="Renewal assigned to" value="You" />
          </>
        ) : null}
      </dl>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {/* Status in words, never colour alone. */}
        <Tag
          tone={
            bucket === "overdue"
              ? "danger"
              : bucket === "renewed"
                ? "success"
                : bucket === "due-soon"
                  ? "warning"
                  : "muted"
          }
        >
          {r.status}
        </Tag>
        {failed && !renewed ? <Tag tone="danger">Reminder failed</Tag> : null}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <CardAction
          icon={BellRing}
          label="Reminders"
          onClick={() => onAction("reminders")}
        />
        {!renewed && phone ? (
          <CardAction
            icon={Phone}
            label="Call"
            onClick={() => onAction("call")}
          />
        ) : null}
        {!renewed ? (
          <Link
            href={
              `/wireframes/follow-ups/mobile?createFor=${r.recordKey}&from=renewals` as Route
            }
            aria-label={`Create a follow-up for ${r.customer}`}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            <CalendarPlus className="size-3.5 shrink-0" aria-hidden="true" />
            Follow-up
          </Link>
        ) : null}
        {r.hasConversation ? (
          <Link
            href={"/wireframes/whatsapp/mobile" as Route}
            aria-label={`Open ${r.customer}'s WhatsApp conversation`}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            <MessageCircle className="size-3.5 shrink-0" aria-hidden="true" />
            WhatsApp
          </Link>
        ) : null}
      </div>

      {!r.hasConversation ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          WhatsApp: screen not included in this walkthrough.
        </p>
      ) : null}
      {!renewed && !phone ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Call: no phone number on this customer record.
        </p>
      ) : null}

      {!renewed ? (
        <button
          type="button"
          onClick={() => onAction("outcome")}
          aria-haspopup="dialog"
          className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-2 text-[12px] font-medium text-muted-foreground"
        >
          <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
          Record renewal outcome
        </button>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CheckCheck className="size-3.5 shrink-0" aria-hidden="true" />
          Renewed {r.renewedOn} · {r.assignedTo}
        </p>
      )}
    </div>
  );
}

function CardAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 text-right break-words text-foreground">
        {value}
      </dd>
    </div>
  );
}

function Tag({
  tone,
  children,
}: {
  tone: "danger" | "warning" | "success" | "muted";
  children: React.ReactNode;
}) {
  const toneClass = {
    danger: "border-danger/30 bg-danger-subtle text-danger-on-subtle",
    warning: "border-warning/30 bg-warning-subtle text-warning-on-subtle",
    success: "border-success/30 bg-success-subtle text-success-on-subtle",
    muted: "border-border bg-muted text-muted-foreground",
  }[tone];
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium",
        toneClass,
      )}
    >
      {children}
    </span>
  );
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/* -------------------------------------------------------- reminder sheet */

/**
 * The reminder schedule (spec §67 stages, §68 statuses).
 *
 * Read-only: §67 says authorised users may adjust a schedule, and a Sales
 * Executive is not one of them, so this shows what is configured rather than
 * offering to change it. Nothing here schedules or sends anything — the
 * statuses are the ones the mock data carries, and a stage is only ever called
 * "Sent" when the data says so.
 */
function ReminderSheet({
  renewal: r,
  onClose,
}: {
  renewal: MobileRenewal;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-start gap-3 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            Reminder schedule
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {r.customer} · {r.product} · due {r.due}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reminder schedule"
          className="-mt-1 grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <ol className="flex flex-col border-t border-border pt-3">
        {r.reminders.map((s, i) => {
          const last = i === r.reminders.length - 1;
          return (
            <li key={s.offsetDays} className="flex min-w-0 gap-2.5">
              <span className="flex shrink-0 flex-col items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full",
                    s.status === "Failed"
                      ? "bg-danger-subtle text-danger-on-subtle"
                      : s.status === "Sent"
                        ? "bg-success-subtle text-success-on-subtle"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  <BellRing className="size-3.5" />
                </span>
                {!last ? (
                  <span aria-hidden="true" className="w-px flex-1 bg-border" />
                ) : null}
              </span>

              <span className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-3.5")}>
                <span className="block text-[13px] font-medium text-foreground">
                  {s.offsetDays} day{s.offsetDays === 1 ? "" : "s"} before
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  {s.channel} · {s.status} · {s.date}
                </span>
                {s.failureReason ? (
                  <span className="mt-1 block rounded-lg border border-danger/30 bg-danger-subtle px-2 py-1.5 text-[11px] leading-snug text-danger-on-subtle">
                    {s.failureReason}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 rounded-lg border border-border bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        Reminder stages and channels are part of the workspace configuration and
        are changed by an administrator. The app does not send these itself —
        the server does, at the scheduled time.
      </p>

      <p className="mt-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-[11px] leading-relaxed text-warning-on-subtle">
        Concept wireframe — nothing is scheduled, sent or cancelled here.
      </p>

      <button
        type="button"
        onClick={onClose}
        className="mt-3.5 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground"
      >
        Close
      </button>
    </>
  );
}

/* --------------------------------------------------------- outcome sheet */

/**
 * Recording a renewal outcome (spec §71–§73).
 *
 * DELIBERATELY NOT COMPLETABLE. §71, §72 and §73 describe the form and its
 * effects but say nothing about which roles may use it, and §162 — the
 * authority on roles — has no row for it. It does have a row for reassigning
 * renewals, which tells us renewals were considered when that matrix was
 * written; completion being absent from it is a gap, not a permission.
 *
 * So the capability is shown, with its real fields, and left closed. Guessing
 * "Staff may complete renewals" would be inventing the one thing this
 * walkthrough must not invent.
 */
function OutcomeSheet({
  renewal: r,
  onClose,
}: {
  renewal: MobileRenewal;
  onClose: () => void;
}) {
  const noteId = useId();
  return (
    <>
      <div className="flex items-start gap-3 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            Renewal outcome
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {r.customer} · {r.product}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close renewal outcome"
          className="-mt-1 grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <Capability
          label="Mark Renewed / Completed"
          detail="Records the completion date and, where the service continues, a new due date. The closed cycle stays in the history."
        />
        <Capability
          label="Mark as Not Renewing"
          detail="Records a reason, cancels the remaining reminders for this cycle, and keeps the full history."
        />
      </div>

      <p
        id={noteId}
        className="mt-3 rounded-lg border border-border bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground"
      >
        Available based on role permission. The specification defines these
        forms but does not say which roles may complete a renewal, so this
        walkthrough shows the capability without performing it.
      </p>

      <p className="mt-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-[11px] leading-relaxed text-warning-on-subtle">
        Concept wireframe — no renewal is completed and nothing is saved.
      </p>

      <button
        type="button"
        onClick={onClose}
        aria-describedby={noteId}
        className="mt-3.5 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground"
      >
        Close
      </button>
    </>
  );
}

/** A capability shown but not offered: a plain element, never focusable. */
function Capability({ label, detail }: { label: string; detail: string }) {
  return (
    <span className="flex min-h-11 w-full items-start gap-3 rounded-lg border border-border px-2.5 py-2 opacity-80">
      <CircleCheck
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-muted-foreground">
          {label}
        </span>
        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
          {detail}
        </span>
      </span>
      <Lock
        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </span>
  );
}

/* ----------------------------------------------------------- empty state */

function EmptyState({
  filter,
  query,
  counts,
  onClearSearch,
  onGoTo,
}: {
  filter: FilterId;
  query: string;
  counts: Record<FilterId, number>;
  onClearSearch: () => void;
  onGoTo: (id: FilterId) => void;
}) {
  const searching = query.trim().length > 0;
  const copy = searching
    ? {
        title: `No renewals match “${query.trim()}”`,
        detail:
          "Search looks at the customer, reference, product, provider and policy reference.",
      }
    : filter === "overdue"
      ? {
          title: "Nothing overdue",
          detail: `Every renewal assigned to you is still within its due date, as at ${PRESENTATION_TODAY}.`,
        }
      : filter === "due-soon"
        ? {
            title: "Nothing due soon",
            detail: `No renewal assigned to you falls within the next ${RENEWAL_DUE_SOON_DAYS} days.`,
          }
        : filter === "upcoming"
          ? {
              title: "Nothing further ahead",
              detail: `Every renewal assigned to you is already within ${RENEWAL_DUE_SOON_DAYS} days.`,
            }
          : {
              title: "Nothing renewed yet",
              detail:
                "Renewals appear here once the cycle is completed and the outcome recorded.",
            };

  return (
    <div className="surface-solid rounded-xl px-4 py-10 text-center">
      <RefreshCw
        className="mx-auto size-7 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="mt-3 text-[13px] font-medium break-words text-foreground">
        {copy.title}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        {copy.detail}
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {searching ? (
          <button
            type="button"
            onClick={onClearSearch}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
          >
            Clear search
          </button>
        ) : null}
        {!searching && filter !== "due-soon" && counts["due-soon"] > 0 ? (
          <button
            type="button"
            onClick={() => onGoTo("due-soon")}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-[13px] font-medium text-foreground"
          >
            View due soon ({counts["due-soon"]})
          </button>
        ) : null}
        {!searching && filter !== "upcoming" && counts.upcoming > 0 ? (
          <button
            type="button"
            onClick={() => onGoTo("upcoming")}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-[13px] font-medium text-foreground"
          >
            View upcoming ({counts.upcoming})
          </button>
        ) : null}
      </div>
    </div>
  );
}
