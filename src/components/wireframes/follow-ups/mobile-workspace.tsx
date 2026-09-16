"use client";

import {
  AlarmClock,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronLeft,
  Plus,
  CheckCheck,
  ChevronRight,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useId, useMemo, useState } from "react";

import {
  CallHandoffSheet,
  Confirmed,
  FIELD_CLASS,
  SheetField,
  SheetHeader,
} from "@/components/wireframes/mobile-sheet-parts";
import {
  PhoneFrame,
  PhoneScreen,
  PhoneSheet,
} from "@/components/wireframes/phone-frame";
import { WireframeBrand } from "@/components/wireframes/wireframe-brand";
import { Avatar } from "@/components/wireframes/wf-ui";
import {
  CALL_OUTCOMES,
  callOutcomeLabel,
  type CallOutcomeValue,
  FOLLOW_UP_TYPES,
  MOBILE_FOLLOW_UPS,
  permittedRecordsFor,
  type PermittedRecord,
  PRESENTATION_TODAY,
  PRESENTATION_TODAY_ISO,
  SALES_PERSONA,
  type MobileFollowUp,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * F1 — Follow-ups workspace on a phone.
 *
 * The salesperson's whole task list in one place: what is late, what is due
 * today, what is coming, and what has already been dealt with. Spec §43 names
 * the tabs (Today | Upcoming | Overdue | Completed) and the actions (Call,
 * Mark Complete, Reschedule, Open Record); this is that screen with a thumb
 * in mind rather than a table.
 *
 * VISIBILITY. §43: "Staff users should primarily see follow-ups assigned to
 * them unless broader permissions are granted", and §162 gives Staff no right
 * to view all Leads/Customers. Every item here is assigned to Sneha, and the
 * screen offers no route to anyone else's workload.
 *
 * COMPLETION. §41 is explicit that completion is an explicit user action, that
 * a call does not complete a follow-up, and that "a second completion process
 * must not be introduced" — so Complete and Complete & Schedule Next are the
 * only two ways out, and the Call sheet returns here rather than completing
 * anything itself.
 *
 * Everything is component state. Nothing is saved, sent or dialled.
 */

/** Spec §43's own tab names. */
type FilterId = "overdue" | "today" | "upcoming" | "completed";

const FILTERS: readonly { id: FilterId; label: string; hint: string }[] = [
  {
    id: "overdue",
    label: "Overdue",
    hint: "The due date and time passed without the follow-up being completed.",
  },
  {
    id: "today",
    label: "Today",
    hint: `Due today, ${PRESENTATION_TODAY}.`,
  },
  {
    id: "upcoming",
    label: "Upcoming",
    hint: "Scheduled for a later date.",
  },
  {
    id: "completed",
    label: "Completed",
    hint: "Already marked complete, with the outcome that was recorded.",
  },
];

const TYPE_ICON: Record<MobileFollowUp["type"], LucideIcon> = {
  Call: Phone,
  WhatsApp: MessageCircle,
  Email: Mail,
  Visit: MapPin,
  Other: CalendarClock,
};

/** Spec §44: overdue is "date/time passed without being completed". */
function bucketOf(f: MobileFollowUp): FilterId {
  if (f.outcome) return "completed";
  if (f.dueInDays < 0) return "overdue";
  if (f.dueInDays === 0) return "today";
  return "upcoming";
}

function statusWords(f: MobileFollowUp): string {
  const b = bucketOf(f);
  if (b === "completed") return `Completed · ${callOutcomeLabel(f.outcome!)}`;
  if (b === "overdue") {
    const d = Math.abs(f.dueInDays);
    return d === 1 ? "Overdue by 1 day" : `Overdue by ${d} days`;
  }
  if (b === "today") return "Due today";
  return f.dueInDays === 1 ? "Due tomorrow" : `Due in ${f.dueInDays} days`;
}

function matches(f: MobileFollowUp, term: string): boolean {
  if (!term) return true;
  const hay = [f.person, f.reference, f.product, f.type, f.note]
    .join(" ")
    .toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** Days between the presentation date and an ISO date the user picked. */
function daysFromToday(iso: string): number {
  const a = Date.parse(`${PRESENTATION_TODAY_ISO}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** "2026-09-14" -> "14 Sep 2026", so cards read the same however they arrived. */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/** "14:30" -> "2:30 PM". */
function prettyTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h)) return value;
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

type SheetKind = "complete" | "reschedule" | "call";
type OpenSheet = { kind: SheetKind; id: string };
type Done = "completed" | "rescheduled" | "created";

export function MobileFollowUpsScreen() {
  // A local working copy: completing and rescheduling change this and nothing
  // else, which is what makes the counts move without any storage behind them.
  const [items, setItems] = useState<MobileFollowUp[]>(() => [
    ...MOBILE_FOLLOW_UPS,
  ]);
  const [filter, setFilter] = useState<FilterId>("today");
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<OpenSheet | null>(null);
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  const close = () => {
    setSheet(null);
    setCreating(false);
    setDone(null);
  };

  const counts = useMemo(() => {
    const by = (id: FilterId) => items.filter((f) => bucketOf(f) === id).length;
    return {
      overdue: by("overdue"),
      today: by("today"),
      upcoming: by("upcoming"),
      completed: by("completed"),
    };
  }, [items]);

  const searching = query.trim().length > 0;

  // Searching looks across every bucket, not just the open tab. Someone typing
  // a name wants that person, and hiding them because they happen to be due
  // next week rather than today is the kind of "correct" behaviour that makes
  // people stop trusting the search box. Each card states its own status, so
  // nothing is ambiguous about what comes back.
  const visible = useMemo(() => {
    const term = query.trim();
    return items
      .filter((f) => (term ? matches(f, term) : bucketOf(f) === filter))
      .sort((a, b) => a.dueInDays - b.dueInDays);
  }, [items, filter, query]);

  const active = sheet ? items.find((f) => f.id === sheet.id) : undefined;
  const activeFilter = FILTERS.find((f) => f.id === filter)!;

  const completeItem = (
    id: string,
    outcome: CallOutcomeValue,
    next?: boolean,
  ) => {
    setItems((list) =>
      list.map((f) =>
        f.id === id
          ? {
              ...f,
              outcome,
              completedOn: `${PRESENTATION_TODAY}, ${next ? "now" : "now"}`,
            }
          : f,
      ),
    );
    setDone("completed");
  };

  /**
   * Creating a follow-up (spec §40/§43).
   *
   * It joins the same local list every count and filter reads, so the summary
   * and the tabs move the moment it exists. It is a FOLLOW-UP only: no Lead or
   * Customer is created, and the record it points at is one that already
   * existed in the picker.
   */
  const createItem = (
    record: PermittedRecord,
    type: MobileFollowUp["type"],
    iso: string,
    time: string,
    note: string,
  ) => {
    const offset = daysFromToday(iso);
    setItems((list) => [
      ...list,
      {
        id: `new-${list.length + 1}`,
        person: record.name,
        recordType: record.recordType,
        reference: record.reference,
        product: record.product,
        type,
        date: prettyDate(iso),
        time: prettyTime(time),
        dueInDays: offset,
        // §162 denies Staff reassignment, so a follow-up they create is
        // theirs. That is a restriction on handing work away, not on making
        // work for yourself.
        assignedTo: SALES_PERSONA.name,
        note: note.trim() || "No note added.",
        phone: "",
      },
    ]);
    setDone("created");
  };

  const rescheduleItem = (id: string, iso: string, time: string) => {
    const offset = daysFromToday(iso);
    setItems((list) =>
      list.map((f) =>
        f.id === id
          ? {
              ...f,
              date: prettyDate(iso),
              time: prettyTime(time),
              dueInDays: offset,
            }
          : f,
      ),
    );
    setDone("rescheduled");
  };

  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-0 py-0 md:px-6 md:py-8">
        <PhoneFrame caption="390 × 844 · the salesperson's task list">
          <PhoneScreen
            // Follow-ups is not one of the five bottom-nav destinations
            // (Home | Leads | Customers | WhatsApp | More), and it belongs
            // under More once More exists. Marking Home current would be
            // false — tapping Home leaves this screen — so no item is
            // highlighted rather than the wrong one.
            activeNav="follow-ups"
            sheet={
              creating ? (
                <PhoneSheet label="New follow-up" onClose={close}>
                  <CreateSheet
                    done={done === "created"}
                    onCreate={createItem}
                    onClose={close}
                  />
                </PhoneSheet>
              ) : sheet && active ? (
                <PhoneSheet
                  label={
                    sheet.kind === "complete"
                      ? "Complete follow-up"
                      : sheet.kind === "reschedule"
                        ? "Reschedule follow-up"
                        : "Call hand-off"
                  }
                  onClose={close}
                >
                  {sheet.kind === "call" ? (
                    <CallHandoffSheet
                      person={active.person}
                      phone={active.phone}
                      returnsTo="your follow-ups"
                      onClose={close}
                    />
                  ) : null}
                  {sheet.kind === "complete" ? (
                    <CompleteSheet
                      followUp={active}
                      done={done === "completed"}
                      onComplete={(outcome, next) =>
                        completeItem(active.id, outcome, next)
                      }
                      onClose={close}
                    />
                  ) : null}
                  {sheet.kind === "reschedule" ? (
                    <RescheduleSheet
                      followUp={active}
                      done={done === "rescheduled"}
                      onSave={(iso, time) =>
                        rescheduleItem(active.id, iso, time)
                      }
                      onClose={close}
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

                {/* §43's primary action. The label stays visible — an
                    unexplained "+" in a header is a guess — and the row has
                    room for it at 326px because the title is short. */}
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground">
                    Follow-ups
                  </h1>
                  <button
                    type="button"
                    onClick={() => {
                      setDone(null);
                      setSheet(null);
                      setCreating(true);
                    }}
                    aria-haspopup="dialog"
                    className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-primary/40 bg-primary/12 px-2.5 text-[12px] font-semibold text-primary"
                  >
                    <Plus className="size-4 shrink-0" aria-hidden="true" />
                    Follow-up
                  </button>
                </div>

                <label className="surface-solid mt-2 flex min-h-11 items-center gap-2.5 rounded-lg px-3">
                  <Search
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Search follow-ups</span>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Name, reference, product or type"
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
              {/* Operational only: what is late, what is due, what is coming.
                  No revenue, conversion or performance scoring — V1 defines
                  none of those for a salesperson's own screen. */}
              <dl className="grid grid-cols-3 gap-2">
                <Summary
                  label="Overdue"
                  value={counts.overdue}
                  tone="danger"
                  icon={AlarmClock}
                />
                <Summary
                  label="Due today"
                  value={counts.today}
                  tone="primary"
                  icon={CalendarCheck}
                />
                <Summary
                  label="Upcoming"
                  value={counts.upcoming}
                  tone="muted"
                  icon={CalendarClock}
                />
              </dl>

              <div
                role="group"
                aria-label="Filter follow-ups"
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
                  ? `Searching every follow-up assigned to you, not just ${activeFilter.label}.`
                  : activeFilter.hint}
              </p>

              <p role="status" aria-live="polite" className="sr-only">
                {visible.length === 0
                  ? searching
                    ? "No follow-ups match your search"
                    : `No follow-ups in ${activeFilter.label}`
                  : searching
                    ? `Showing ${visible.length} matching follow-ups`
                    : `Showing ${visible.length} ${activeFilter.label.toLowerCase()} follow-ups`}
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
                  {visible.map((f) => (
                    <li key={f.id}>
                      <FollowUpCard
                        followUp={f}
                        onAction={(kind) => {
                          setDone(null);
                          setSheet({ kind, id: f.id });
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}

              <p className="px-1 pb-1 text-[11px] leading-relaxed text-muted-foreground">
                You see the follow-ups assigned to you. Another
                salesperson&apos;s follow-ups are theirs, and a manager or
                administrator sees the whole team&apos;s.
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
  tone: "danger" | "primary" | "muted";
  icon: LucideIcon;
}) {
  const toneClass = {
    danger: "text-danger-on-subtle",
    primary: "text-primary",
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

const RECORD_HREF = {
  lead: "/wireframes/sales/record?from=followups",
  customer: "/wireframes/customers/mobile?from=followups",
} as const;

/**
 * One follow-up.
 *
 * The person's name is a link only where that person's record wireframe
 * exists — Priya Iyer's lead detail and Ramesh Kumar's customer record. Every
 * other row stays fully readable but offers no chevron and no focusable
 * wrapper, because sending Meera Krishnan to Priya's record would be worse
 * than not moving at all.
 *
 * Complete and Reschedule work for everyone: they are local sheets, not
 * destinations, so they promise nothing the walkthrough cannot honour.
 */
function FollowUpCard({
  followUp: f,
  onAction,
}: {
  followUp: MobileFollowUp;
  onAction: (kind: SheetKind) => void;
}) {
  const bucket = bucketOf(f);
  const TypeIcon = TYPE_ICON[f.type];
  const urgent = bucket === "overdue" || bucket === "today";
  const doneAlready = bucket === "completed";

  const identity = (
    <>
      <Avatar
        initials={initialsOf(f.person)}
        tone={doneAlready ? "muted" : urgent ? "primary" : "muted"}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-foreground">
          {f.person}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {f.reference} · {f.product}
        </span>
      </span>
    </>
  );

  return (
    <div className="surface-solid rounded-xl p-3">
      {f.record ? (
        <Link
          href={RECORD_HREF[f.record] as Route}
          aria-label={`Open ${f.person}'s ${f.recordType.toLowerCase()} record`}
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

      {/* The three things that decide what to do next, on one line. */}
      <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <TypeIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {f.type}
        </span>
        <span className="text-muted-foreground">
          {f.date} · {f.time}
        </span>
      </p>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {/* Urgency is stated, never left to the colour of a pill. */}
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-medium",
            bucket === "overdue"
              ? "border-danger/30 bg-danger-subtle text-danger-on-subtle"
              : bucket === "today"
                ? "border-warning/30 bg-warning-subtle text-warning-on-subtle"
                : bucket === "completed"
                  ? "border-success/30 bg-success-subtle text-success-on-subtle"
                  : "border-border bg-muted text-muted-foreground",
          )}
        >
          {statusWords(f)}
        </span>
      </div>

      <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
        {f.note}
      </p>

      {doneAlready ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CheckCheck className="size-3.5 shrink-0" aria-hidden="true" />
          {f.completedOn} · {f.assignedTo}
        </p>
      ) : (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <CardAction
            icon={Check}
            label="Complete"
            primary
            onClick={() => onAction("complete")}
          />
          <CardAction
            icon={CalendarPlus}
            label="Reschedule"
            onClick={() => onAction("reschedule")}
          />
          {/* §43: Call is offered for Call-type follow-ups on the Today,
              Upcoming and Overdue tabs — not once completed. */}
          {f.type === "Call" ? (
            <CardAction
              icon={Phone}
              label="Call"
              onClick={() => onAction("call")}
            />
          ) : null}
          {/* Offered whenever that person's conversation wireframe exists,
              whatever the follow-up type — which in this walkthrough means
              Ramesh Kumar alone. Priya has a conversation in the data but no
              conversation SCREEN, and sending her to Ramesh's thread would be
              a lie. */}
          {f.hasConversation ? (
            <CardLink
              icon={MessageCircle}
              label="WhatsApp"
              href="/wireframes/whatsapp/mobile"
              person={f.person}
            />
          ) : null}
        </div>
      )}

      {/* Capabilities V1 has but this walkthrough does not draw. Rendered as
          plain text, not disabled buttons, so they never take focus. */}
      {!doneAlready && !f.hasConversation && f.type === "WhatsApp" ? (
        <InactiveNote label="WhatsApp" />
      ) : null}
      {!doneAlready && f.type === "Email" ? (
        <InactiveNote label="Email" />
      ) : null}
    </div>
  );
}

function CardAction({
  icon: Icon,
  label,
  primary,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={cn(
        "inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 text-[12px] font-medium transition-colors",
        primary
          ? "border-primary/40 bg-primary/12 text-primary"
          : "border-border text-foreground hover:bg-accent",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}

function CardLink({
  icon: Icon,
  label,
  href,
  person,
}: {
  icon: LucideIcon;
  label: string;
  href: string;
  person: string;
}) {
  return (
    <Link
      href={href as Route}
      aria-label={`Open ${person}'s WhatsApp conversation`}
      className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}

function InactiveNote({ label }: { label: string }) {
  return (
    <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
      {label}: screen not included in this walkthrough.
    </p>
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

/* --------------------------------------------------------- complete sheet */

/**
 * Completion (spec §41, and §27.3 for call outcomes).
 *
 * V1 defines outcome OPTIONS only for calls, so a Call follow-up gets the
 * approved list and every other type gets the free "Outcome / note" field §41
 * actually describes. Inventing a set of WhatsApp or Email outcomes would be
 * putting words in the specification's mouth.
 *
 * "Call Back Requested" reveals the next-follow-up fields and makes them
 * prominent, because §27.3 asks for exactly that — and equally asks that one
 * is never scheduled silently, so the user still has to confirm.
 */
function CompleteSheet({
  followUp: f,
  done,
  onComplete,
  onClose,
}: {
  followUp: MobileFollowUp;
  done: boolean;
  onComplete: (outcome: CallOutcomeValue, scheduleNext: boolean) => void;
  onClose: () => void;
}) {
  const isCall = f.type === "Call";
  const [outcome, setOutcome] = useState<CallOutcomeValue>("connected");
  const [note, setNote] = useState("");
  const [scheduleNext, setScheduleNext] = useState(false);
  const callbackId = useId();
  const noteErrorId = useId();

  const callbackRequested = isCall && outcome === "callback_requested";
  // §27.3 makes Schedule Next Follow-up prominent for a callback, so the
  // fields are revealed and required rather than merely offered.
  const showNext = scheduleNext || callbackRequested;

  // "Other" says nothing on its own. A note is what makes it an outcome.
  const needsNote = isCall && outcome === "other";
  const noteMissing = needsNote && note.trim().length === 0;

  if (done) {
    return (
      <Confirmed
        title="Follow-up completed"
        detail={
          showNext
            ? `${f.person}'s ${f.type.toLowerCase()} follow-up is closed and a new one would be scheduled.`
            : `${f.person}'s ${f.type.toLowerCase()} follow-up is closed and would appear in the activity history.`
        }
        closeLabel="Back to follow-ups"
        onClose={onClose}
      />
    );
  }

  return (
    <>
      <SheetHeader
        title="Complete follow-up"
        subtitle={`${f.person} · ${f.reference}`}
        onClose={onClose}
      />
      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <SheetField label="Follow-up">
          <p className="flex min-h-11 items-center rounded-lg border border-border bg-muted px-2.5 text-[13px] text-foreground">
            {f.type} · {f.date}, {f.time}
          </p>
        </SheetField>

        {isCall ? (
          <SheetField label="Call outcome">
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as CallOutcomeValue)}
              className={FIELD_CLASS}
            >
              {CALL_OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </SheetField>
        ) : null}

        <SheetField
          label={
            needsNote ? "Note (required)" : isCall ? "Note" : "Outcome / note"
          }
        >
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required={needsNote}
            aria-invalid={noteMissing || undefined}
            aria-describedby={noteMissing ? noteErrorId : undefined}
            placeholder={
              needsNote
                ? "Say what happened — “Other” on its own explains nothing."
                : isCall
                  ? "What was agreed on the call."
                  : "What happened, in your own words."
            }
            className={cn(
              "w-full min-w-0 rounded-lg border border-input bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground",
              noteMissing && "border-danger",
            )}
          />
        </SheetField>
        {noteMissing ? (
          <p
            id={noteErrorId}
            className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-[11px] leading-relaxed text-danger-on-subtle"
          >
            Add a short note explaining the outcome.
          </p>
        ) : null}

        {callbackRequested ? (
          <p
            id={callbackId}
            className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-[11px] leading-relaxed text-warning-on-subtle"
          >
            They asked to be called back, so the next follow-up is opened below.
            It is not scheduled until you confirm.
          </p>
        ) : (
          <label className="flex min-h-11 items-center gap-2.5 rounded-lg border border-border px-2.5 text-[12px] text-foreground">
            <input
              type="checkbox"
              checked={scheduleNext}
              onChange={(e) => setScheduleNext(e.target.checked)}
              className="size-4 shrink-0"
            />
            Schedule the next follow-up
          </label>
        )}

        {showNext ? (
          <div
            aria-describedby={callbackRequested ? callbackId : undefined}
            className="flex flex-col gap-3 rounded-lg border border-border bg-muted/50 p-2.5"
          >
            <p className="text-[11px] font-semibold text-foreground">
              Next follow-up
            </p>
            <div className="grid grid-cols-2 gap-2">
              <SheetField label="Date">
                <input
                  type="date"
                  defaultValue="2026-09-18"
                  min={PRESENTATION_TODAY_ISO}
                  className={FIELD_CLASS}
                />
              </SheetField>
              <SheetField label="Time">
                <input
                  type="time"
                  defaultValue="10:00"
                  className={FIELD_CLASS}
                />
              </SheetField>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SheetField label="Type">
                <select defaultValue={f.type} className={FIELD_CLASS}>
                  {FOLLOW_UP_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </SheetField>
              {/* §162 gives Staff no right to reassign follow-ups, so this is
                  shown rather than offered. */}
              <SheetField label="Assigned to">
                <p className="flex h-11 items-center truncate rounded-lg border border-border bg-muted px-2.5 text-[13px] text-foreground">
                  {SALES_PERSONA.name}
                </p>
              </SheetField>
            </div>
            <SheetField label="Note">
              <textarea
                rows={2}
                defaultValue=""
                placeholder="What the next conversation is for."
                className="w-full min-w-0 rounded-lg border border-input bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground"
              />
            </SheetField>
          </div>
        ) : null}
      </div>

      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 flex-1 rounded-lg border border-border text-sm font-medium text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={noteMissing}
          onClick={() => onComplete(isCall ? outcome : "other", showNext)}
          className="inline-flex min-h-11 flex-[1.4] items-center justify-center gap-2 rounded-lg bg-primary px-2 text-center text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Check className="size-4 shrink-0" aria-hidden="true" />
          {showNext ? "Complete & schedule next" : "Complete"}
        </button>
      </div>
    </>
  );
}

/* ----------------------------------------------------------- create sheet */

/**
 * Creating a follow-up (spec §40 and §43).
 *
 * §40: "When + Add Follow-up is opened from the main Follow-ups screen, the
 * user must first select whether the Follow-up relates to a Lead or Customer
 * and then select the corresponding record." So this is two steps, not one
 * long form — and step one offers only records this salesperson may actually
 * reach, computed with the same rule the customer directory uses.
 *
 * Assigned To is fixed to the signed-in user. §162 denies Staff the right to
 * REASSIGN follow-ups; it does not deny them the right to make one for
 * themselves, which §40 and §43 both assume they can.
 */
function CreateSheet({
  done,
  onCreate,
  onClose,
}: {
  done: boolean;
  onCreate: (
    record: PermittedRecord,
    type: MobileFollowUp["type"],
    iso: string,
    time: string,
    note: string,
  ) => void;
  onClose: () => void;
}) {
  const [record, setRecord] = useState<PermittedRecord | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<MobileFollowUp["type"]>("Call");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const dateErrorId = useId();

  const records = useMemo(() => permittedRecordsFor(SALES_PERSONA.name), []);

  const found = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return records;
    return records.filter((r) =>
      [r.name, r.reference, r.product].join(" ").toLowerCase().includes(term),
    );
  }, [records, query]);

  if (done) {
    return (
      <Confirmed
        title="Follow-up created"
        detail={`${type} follow-up for ${record?.name ?? "the record"}, assigned to ${SALES_PERSONA.name}. It is already in your list.`}
        closeLabel="Back to follow-ups"
        onClose={onClose}
      />
    );
  }

  /* ------------------------------------------------ step 1: pick a record */
  if (!record) {
    return (
      <>
        <SheetHeader
          title="New follow-up"
          subtitle="Step 1 of 2 · Choose the lead or customer"
          onClose={onClose}
        />
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          <label className="surface-solid flex min-h-11 items-center gap-2.5 rounded-lg border border-input px-3">
            <Search
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="sr-only">Search leads and customers</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, reference or product"
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

          <p role="status" aria-live="polite" className="sr-only">
            {found.length === 0
              ? "No records match"
              : `${found.length} records available`}
          </p>

          {found.length === 0 ? (
            <div className="rounded-xl border border-border px-4 py-8 text-center">
              <Search
                className="mx-auto size-6 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-2.5 text-[13px] font-medium break-words text-foreground">
                No records match “{query.trim()}”
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                You can only create a follow-up for a lead or customer you are
                permitted to work with.
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-3.5 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground"
              >
                Clear search
              </button>
            </div>
          ) : (
            <ul className="flex max-h-[42vh] flex-col gap-1.5 overflow-y-auto">
              {found.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setRecord(r)}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 text-left transition-colors hover:bg-accent"
                  >
                    <span
                      aria-hidden="true"
                      className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      {r.recordType}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
                          {r.name}
                        </span>
                        {/* Its own marker rather than a tail on the line
                            below, which truncated to "share…" at 390px and
                            told the reader nothing. */}
                        {r.access === "shared" ? (
                          <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] font-medium text-muted-foreground">
                            Shared
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {r.reference} · {r.product}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    );
  }

  /* --------------------------------------------- step 2: the follow-up */
  const tooEarly = date !== "" && date < PRESENTATION_TODAY_ISO;
  const missingDate = date === "";
  const dateInvalid = tooEarly || (tried && missingDate);

  return (
    <>
      <SheetHeader
        title="New follow-up"
        subtitle="Step 2 of 2 · When and what for"
        onClose={onClose}
      />
      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <SheetField label="Related to">
          <p className="flex min-h-11 flex-col justify-center rounded-lg border border-border bg-muted px-2.5 py-1.5">
            <span className="truncate text-[13px] font-medium text-foreground">
              {record.name}
            </span>
            {/* `reference` already begins with the record type, so
                prefixing it again read as "Customer · Customer · …". */}
            <span className="truncate text-[11px] text-muted-foreground">
              {record.reference} · {record.product}
            </span>
            {record.access === "shared" ? (
              <span className="truncate text-[11px] text-muted-foreground">
                Shared with you · owned by {record.owner}
              </span>
            ) : null}
          </p>
        </SheetField>

        <div className="grid grid-cols-2 gap-2">
          <SheetField label="Follow-up type">
            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as MobileFollowUp["type"])
              }
              className={FIELD_CLASS}
            >
              {FOLLOW_UP_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </SheetField>
          {/* §162: Staff may not reassign, so this states the outcome rather
              than offering a choice that would be refused. */}
          <SheetField label="Assigned to">
            <p className="flex h-11 items-center truncate rounded-lg border border-border bg-muted px-2.5 text-[13px] text-foreground">
              {SALES_PERSONA.name}
            </p>
          </SheetField>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SheetField label="Due date">
            <input
              type="date"
              value={date}
              min={PRESENTATION_TODAY_ISO}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={dateInvalid || undefined}
              aria-describedby={dateInvalid ? dateErrorId : undefined}
              className={cn(FIELD_CLASS, dateInvalid && "border-danger")}
            />
          </SheetField>
          <SheetField label="Time">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={FIELD_CLASS}
            />
          </SheetField>
        </div>

        {dateInvalid ? (
          <p
            id={dateErrorId}
            className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-[11px] leading-relaxed text-danger-on-subtle"
          >
            {tooEarly
              ? `Choose ${PRESENTATION_TODAY} or a later date.`
              : "Choose a due date."}
          </p>
        ) : null}

        <SheetField label="Note or purpose">
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What this follow-up is for."
            className="w-full min-w-0 rounded-lg border border-input bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground"
          />
        </SheetField>
      </div>

      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          onClick={() => setRecord(null)}
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-border px-2.5 text-sm font-medium text-foreground"
        >
          <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
          Back
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 flex-1 rounded-lg border border-border text-sm font-medium text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            setTried(true);
            if (missingDate || tooEarly) return;
            onCreate(record, type, date, time, note);
          }}
          className="inline-flex min-h-11 flex-[1.3] items-center justify-center gap-1.5 rounded-lg bg-primary px-2 text-sm font-semibold text-primary-foreground"
        >
          <Check className="size-4 shrink-0" aria-hidden="true" />
          Create
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------- reschedule sheet */

/**
 * Rescheduling (spec §42).
 *
 * The same follow-up keeps its identity and moves — §42 is explicit that a
 * reschedule must not create a duplicate, and that an overdue item moved to a
 * future date returns to Upcoming. Assigned To is shown but not editable:
 * §42 permits changing it "where permitted", and §162 does not permit Staff.
 */
function RescheduleSheet({
  followUp: f,
  done,
  onSave,
  onClose,
}: {
  followUp: MobileFollowUp;
  done: boolean;
  onSave: (iso: string, time: string) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState("2026-09-18");
  const [time, setTime] = useState("10:00");
  const errorId = useId();

  // The presentation has a fixed "today", so a date before it is not a
  // judgement call — it is impossible.
  const tooEarly = date < PRESENTATION_TODAY_ISO;
  const invalid = tooEarly || date === "";

  if (done) {
    return (
      <Confirmed
        title="Follow-up rescheduled"
        detail={`${f.person}'s follow-up moves to ${f.date}, ${f.time}. It is the same follow-up, not a new one.`}
        closeLabel="Back to follow-ups"
        onClose={onClose}
      />
    );
  }

  return (
    <>
      <SheetHeader
        title="Reschedule follow-up"
        subtitle={`${f.person} · ${f.reference}`}
        onClose={onClose}
      />
      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <SheetField label="Currently due">
          <p className="flex min-h-11 items-center rounded-lg border border-border bg-muted px-2.5 text-[13px] text-foreground">
            {f.type} · {f.date}, {f.time}
          </p>
        </SheetField>

        <div className="grid grid-cols-2 gap-2">
          <SheetField label="New date">
            <input
              type="date"
              value={date}
              min={PRESENTATION_TODAY_ISO}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
              className={cn(FIELD_CLASS, invalid && "border-danger")}
            />
          </SheetField>
          <SheetField label="New time">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={FIELD_CLASS}
            />
          </SheetField>
        </div>

        {invalid ? (
          <p
            id={errorId}
            className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-[11px] leading-relaxed text-danger-on-subtle"
          >
            Choose {PRESENTATION_TODAY} or a later date.
          </p>
        ) : null}

        <SheetField label="Reason or note">
          <textarea
            rows={2}
            placeholder="Why it is moving — this goes on the activity history."
            className="w-full min-w-0 rounded-lg border border-input bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground"
          />
        </SheetField>

        <SheetField label="Assigned to">
          <p className="flex h-11 items-center truncate rounded-lg border border-border bg-muted px-2.5 text-[13px] text-foreground">
            {f.assignedTo} · reassigning needs a manager
          </p>
        </SheetField>
      </div>

      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 flex-1 rounded-lg border border-border text-sm font-medium text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={invalid}
          onClick={() => onSave(date, time)}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Check className="size-4 shrink-0" aria-hidden="true" />
          Reschedule
        </button>
      </div>
    </>
  );
}

/* ----------------------------------------------------------- empty states */

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
        title: `No follow-ups match “${query.trim()}”`,
        detail:
          "Search looks at the name, reference, product, follow-up type and note.",
      }
    : filter === "overdue"
      ? {
          title: "Nothing overdue",
          detail: "Every follow-up assigned to you is still within its date.",
        }
      : filter === "today"
        ? {
            title: "Nothing due today",
            detail: `No follow-up assigned to you falls on ${PRESENTATION_TODAY}.`,
          }
        : filter === "upcoming"
          ? {
              title: "Nothing scheduled ahead",
              detail: "No follow-up assigned to you has a future date.",
            }
          : {
              title: "Nothing completed yet",
              detail:
                "Follow-ups appear here once you mark them complete and record the outcome.",
            };

  return (
    <div className="surface-solid rounded-xl px-4 py-10 text-center">
      <CalendarCheck
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
        {!searching && filter !== "today" && counts.today > 0 ? (
          <button
            type="button"
            onClick={() => onGoTo("today")}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-[13px] font-medium text-foreground"
          >
            View today ({counts.today})
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
