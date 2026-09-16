"use client";

import {
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  Check,
  History,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  PhoneOutgoing,
  RefreshCw,
  ShieldCheck,
  SquarePen,
  StickyNote,
  Tag,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useId, useState } from "react";

import {
  CallHandoffSheet,
  Confirmed,
  FIELD_CLASS,
  PrimaryAction,
  SheetAction,
  SheetField,
  SheetHeader,
  SheetInactive,
} from "@/components/wireframes/mobile-sheet-parts";
import {
  PhoneFrame,
  PhoneScreen,
  PhoneSheet,
} from "@/components/wireframes/phone-frame";
import {
  CUSTOMER_ACTIVITY,
  CUSTOMER_POLICIES,
  CUSTOMER_RECORD,
  CUSTOMER_UPCOMING,
  FOLLOW_UP_TYPES,
  SALES_PERSONA,
  TEAM,
  type CustomerActivity,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * C1 — Customer record on a phone.
 *
 * Reached from the WhatsApp conversation's More menu, which is how a
 * salesperson actually gets here: mid-chat, needing the renewal date or the
 * policy reference. So the screen answers that first — who this is, what they
 * hold, what is due — and keeps the same four thumb-zone actions the
 * conversation offers, so moving between the two never relearns a toolbar.
 *
 * Two roles are deliberately shown separately and must not be collapsed:
 * Arun Menon OWNS the record, Sneha Thomas holds the WHATSAPP CONVERSATION.
 * Sneha is signed in. Opening or replying to a conversation does not transfer
 * ownership, and a wireframe that quietly showed "Owner: Sneha" would teach
 * the client the opposite of how the permission model works.
 *
 * Everything here is component state. Nothing is saved, sent or dialled.
 */

type SheetKind = "call" | "followup" | "note" | "more";
type Confirmation = "followup" | "note";
type TabId = "overview" | "policies" | "activity";

const SHEET_LABEL: Record<SheetKind, string> = {
  call: "Call hand-off",
  followup: "Create follow-up",
  note: "Add note",
  more: "Customer actions",
};

const TABS: readonly { id: TabId; label: string; short: string }[] = [
  { id: "overview", label: "Overview", short: "Overview" },
  { id: "policies", label: "Policies & Services", short: "Policies" },
  { id: "activity", label: "Activity", short: "Activity" },
];

/**
 * Where the back control returns to, keyed by the `from` query parameter.
 *
 * This is an ALLOW-LIST, not a redirect target: the parameter selects a key
 * in this table and its own text is never used as a URL. An unknown or
 * missing value falls back to the directory, so a hand-edited link cannot
 * send the back button anywhere the walkthrough does not own.
 */
const BACK_TARGETS = {
  directory: {
    href: "/wireframes/customers/mobile-directory",
    label: "Back to customers",
    short: "Customers",
  },
  whatsapp: {
    href: "/wireframes/whatsapp/mobile",
    label: "Back to conversation",
    short: "Conversation",
  },
  followups: {
    href: "/wireframes/follow-ups/mobile",
    label: "Back to follow-ups",
    short: "Follow-ups",
  },
  renewals: {
    href: "/wireframes/renewals/mobile",
    label: "Back to renewals",
    short: "Renewals",
  },
} as const;

type BackKey = keyof typeof BACK_TARGETS;

function backTarget(from: string | null) {
  return from !== null && from in BACK_TARGETS
    ? BACK_TARGETS[from as BackKey]
    : BACK_TARGETS.directory;
}

export function MobileCustomerRecordScreen({
  from,
}: {
  /** Raw `?from=` value, resolved against BACK_TARGETS below. Never a URL. */
  from: string | null;
}) {
  const customer = CUSTOMER_RECORD;
  const back = backTarget(from);
  const [tab, setTab] = useState<TabId>("overview");
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [confirmed, setConfirmed] = useState<Confirmation | null>(null);
  const tabsId = useId();

  /**
   * Arrow-key navigation for the tab list.
   *
   * Only the selected tab is in the tab sequence (roving tabindex), which is
   * the ARIA pattern — but roving tabindex WITHOUT this handler would leave a
   * keyboard user able to reach the tabs and unable to change them.
   */
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? TABS.length - 1
          : e.key === "ArrowRight"
            ? (i + 1) % TABS.length
            : (i - 1 + TABS.length) % TABS.length;
    const target = TABS[next]!;
    setTab(target.id);
    e.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus();
  };

  const close = () => {
    setSheet(null);
    setConfirmed(null);
  };

  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-0 py-0 md:px-6 md:py-8">
        <PhoneFrame caption="390 × 844 · reached from the conversation">
          <PhoneScreen
            activeNav="customers"
            sheet={
              sheet ? (
                <PhoneSheet label={SHEET_LABEL[sheet]} onClose={close}>
                  {sheet === "more" ? (
                    <MoreSheet
                      onClose={close}
                      onAddNote={() => setSheet("note")}
                      onViewActivity={() => {
                        setTab("activity");
                        close();
                      }}
                    />
                  ) : null}
                  {sheet === "followup" ? (
                    <FollowUpSheet
                      done={confirmed === "followup"}
                      onSave={() => setConfirmed("followup")}
                      onClose={close}
                    />
                  ) : null}
                  {sheet === "note" ? (
                    <NoteSheet
                      done={confirmed === "note"}
                      onSave={() => setConfirmed("note")}
                      onClose={close}
                    />
                  ) : null}
                  {sheet === "call" ? (
                    <CallHandoffSheet
                      person={customer.name}
                      phone={customer.phone}
                      returnsTo={`${customer.name}'s record`}
                      onClose={close}
                    />
                  ) : null}
                </PhoneSheet>
              ) : null
            }
            header={
              <header className="surface-glass sticky top-0 z-10 rounded-none border-x-0 border-t-0 px-3 pt-[env(safe-area-inset-top)]">
                {/* The back control NAMES its destination. This record is
                    reached from two places, and an unlabelled arrow would
                    leave the salesperson guessing which one they are about to
                    return to. */}
                <Link
                  href={back.href as Route}
                  aria-label={back.label}
                  className="-ms-1 inline-flex min-h-11 items-center gap-1 rounded-lg ps-1 pe-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
                  {back.short}
                </Link>

                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-sm font-semibold text-foreground">
                      {customer.name}
                    </h1>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {customer.reference}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-full border border-success/30 bg-success-subtle px-2.5 py-0.5 text-[11px] font-medium text-success-on-subtle">
                    {customer.status}
                  </span>
                </div>

                {/* Tenure and ownership sit on their own line, wrapping
                    rather than truncating: at 326px a clipped "Customer since
                    2…" tells the reader nothing, and ownership is the first
                    thing that decides whether you may act alone. */}
                <p className="pt-1 pb-2 text-[11px] leading-snug text-muted-foreground">
                  {customer.sinceLabel} · Record owner{" "}
                  <span className="font-medium text-foreground">
                    {customer.owner}
                  </span>
                </p>
              </header>
            }
          >
            <div className="px-3 pt-3 pb-6">
              {/* --------------------------------------- primary actions */}
              <div className="surface-glass grid grid-cols-4 gap-1 rounded-xl p-1.5">
                <PrimaryAction
                  icon={Phone}
                  label="Call"
                  onClick={() => setSheet("call")}
                />
                <WhatsAppAction />
                <PrimaryAction
                  icon={CalendarPlus}
                  label="Follow-up"
                  onClick={() => setSheet("followup")}
                />
                <PrimaryAction
                  icon={MoreHorizontal}
                  label="More"
                  onClick={() => setSheet("more")}
                />
              </div>

              {/* ------------------------------------------------- tabs */}
              <div
                role="tablist"
                aria-label="Customer record sections"
                className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
              >
                {TABS.map((t) => {
                  const selected = t.id === tab;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      id={`${tabsId}-${t.id}-tab`}
                      aria-selected={selected}
                      aria-controls={`${tabsId}-${t.id}-panel`}
                      tabIndex={selected ? 0 : -1}
                      aria-label={t.label}
                      onClick={() => setTab(t.id)}
                      onKeyDown={onTabKeyDown}
                      className={cn(
                        "min-h-11 min-w-0 rounded-md px-1 text-[11px] font-medium transition-colors",
                        selected
                          ? "bg-surface text-foreground shadow-sm"
                          : "text-muted-foreground",
                      )}
                    >
                      {/* "Policies & Services" needs ~380px to sit three-up
                          without clipping — measured, not guessed: at 360px it
                          rendered as "Policies & Servic…". Below that the
                          short form shows instead. The accessible name is the
                          full label at every width. */}
                      <span className="block truncate min-[380px]:hidden">
                        {t.short}
                      </span>
                      <span className="hidden truncate min-[380px]:block">
                        {t.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                role="tabpanel"
                id={`${tabsId}-${tab}-panel`}
                aria-labelledby={`${tabsId}-${tab}-tab`}
                tabIndex={0}
                className="mt-3 focus-visible:outline-none"
              >
                {tab === "overview" ? <OverviewTab /> : null}
                {tab === "policies" ? <PoliciesTab /> : null}
                {tab === "activity" ? <ActivityTab /> : null}
              </div>
            </div>
          </PhoneScreen>
        </PhoneFrame>
      </div>
    </div>
  );
}

/**
 * WhatsApp is a real navigation, not a sheet, so it is a link — a button that
 * moves the user to another route lies to the keyboard and to right-click.
 */
function WhatsAppAction() {
  return (
    <Link
      href={"/wireframes/whatsapp/mobile" as Route}
      className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
    >
      <MessageCircle
        className="size-[18px] shrink-0 text-primary"
        aria-hidden="true"
      />
      <span className="w-full truncate text-center leading-tight">
        WhatsApp
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ tabs */

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    // Opaque, not glass: policy and activity content has to stay readable, and
    // translucency over a busy ambient background is where that breaks first.
    <section className="surface-solid rounded-xl p-3">
      <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Label/value row that wraps rather than truncating the value. */
function Fact({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-b-0 last:pb-0">
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 text-right">
        <span className="block text-[13px] font-medium break-words text-foreground">
          {value}
        </span>
        {hint ? (
          <span className="block text-[10px] leading-snug text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function OverviewTab() {
  const c = CUSTOMER_RECORD;
  return (
    <div className="flex flex-col gap-3">
      <Card title="Contact">
        <Fact label="Phone" value={c.phone} />
        <Fact label="Email" value={c.email} />
        <Fact label="Preferred channel" value={c.preferredChannel} />
      </Card>

      <Card title="Ownership & access">
        {/* THREE distinct things, deliberately on three rows. Merging any two
            of them is the most misleading thing this screen could do: it would
            teach the client that handing someone a chat hands them the
            customer file. */}
        <Fact
          label="Record owner"
          value={c.owner}
          hint="Owns the customer record"
        />
        <Fact
          label="Your access"
          value="Shared with you"
          hint={`${SALES_PERSONA.name} is a permitted user on this record`}
        />
        <Fact
          label="WhatsApp conversation"
          value={c.conversationAssignee}
          hint="Assigned to you — the conversation only"
        />
        <p className="mt-2 rounded-lg bg-muted px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          These are three separate permissions. Holding the conversation does
          not give you the record, and neither makes you the owner. Each is
          granted and removed on its own.
        </p>
      </Card>

      <Card title="Upcoming actions">
        <ul className="flex flex-col gap-2">
          {CUSTOMER_UPCOMING.map((a) => (
            <li key={a.id} className="flex min-w-0 items-start gap-2.5">
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/12 text-primary"
              >
                {a.kind === "Renewal" ? (
                  <RefreshCw className="size-3.5" />
                ) : (
                  <CalendarClock className="size-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-foreground">
                  {a.kind} · {a.date}
                </span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  {a.detail} · {a.assignedTo}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Tags & service categories">
        <ul className="flex flex-wrap gap-1.5">
          {c.tags.map((t) => (
            <li
              key={t}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-foreground"
            >
              <Tag className="size-3 shrink-0" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function PoliciesTab() {
  return (
    <div className="flex flex-col gap-3">
      {CUSTOMER_POLICIES.map((p) => {
        const due = p.status === "Due soon";
        return (
          <section
            key={p.id}
            className={cn(
              "surface-solid rounded-xl p-3",
              due && "border-warning/50",
            )}
          >
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-[13px] font-semibold text-foreground">
                  {p.product}
                </h3>
                <p className="truncate text-[11px] text-muted-foreground">
                  {p.provider}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  due
                    ? "border-warning/40 bg-warning-subtle text-warning-on-subtle"
                    : "border-success/30 bg-success-subtle text-success-on-subtle",
                )}
              >
                {p.status}
              </span>
            </div>

            <div className="mt-2">
              <Fact label="Reference" value={p.reference} />
              <Fact label="Start date" value={p.start} />
              <Fact label="Renewal date" value={p.renewal} />
              <Fact label="Premium" value={p.amount} />
            </div>

            {due && p.daysLeft !== undefined ? (
              // Never colour alone: the badge above says "Due soon" in words
              // and this line says how soon.
              <p className="mt-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-2.5 py-2 text-[11px] leading-relaxed text-warning-on-subtle">
                <ShieldCheck
                  className="mt-px size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  Renews in {p.daysLeft} days. This is the renewal the current
                  WhatsApp conversation is about.
                </span>
              </p>
            ) : null}
          </section>
        );
      })}

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        Concept wireframe — policy details are read-only here. Payments, claims
        and accounting are not part of this walkthrough.
      </p>
    </div>
  );
}

const ACTIVITY_ICON: Record<CustomerActivity["kind"], LucideIcon> = {
  whatsapp: MessageCircle,
  call: PhoneOutgoing,
  followup: CalendarClock,
  note: StickyNote,
  renewal: RefreshCw,
  created: UserRoundPlus,
};

function ActivityTab() {
  return (
    <div className="surface-solid rounded-xl p-3">
      <h2 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        Activity history
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        One timeline for the whole record. Nothing from the lead stage is
        dropped when a lead becomes a customer.
      </p>

      <ol className="mt-3 flex flex-col">
        {CUSTOMER_ACTIVITY.map((a, i) => {
          const Icon = ACTIVITY_ICON[a.kind];
          const last = i === CUSTOMER_ACTIVITY.length - 1;
          return (
            <li key={a.id} className="flex min-w-0 gap-2.5">
              <span className="flex shrink-0 flex-col items-center">
                <span
                  aria-hidden="true"
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
                >
                  <Icon className="size-3.5" />
                </span>
                {!last ? (
                  <span aria-hidden="true" className="w-px flex-1 bg-border" />
                ) : null}
              </span>
              <span className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-3.5")}>
                <span className="block text-[13px] font-medium text-foreground">
                  {a.title}
                </span>
                <span className="block text-[12px] leading-snug text-muted-foreground">
                  {a.detail}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  {a.by} · {a.time}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ---------------------------------------------------------------- sheets */

function MoreSheet({
  onClose,
  onAddNote,
  onViewActivity,
}: {
  onClose: () => void;
  onAddNote: () => void;
  onViewActivity: () => void;
}) {
  const c = CUSTOMER_RECORD;
  return (
    <>
      <SheetHeader
        title="Customer actions"
        subtitle={`${c.name} · ${c.reference}`}
        onClose={onClose}
      />
      <div className="flex flex-col border-t border-border pt-2">
        {/* Email stays reachable on mobile (spec §79). The header only has
            room for four actions, so it lives here rather than being cut. */}
        <SheetInactive
          icon={Mail}
          label="Send email"
          reason="Screen not included in this walkthrough"
        />
        <SheetAction
          icon={StickyNote}
          label="Add note"
          detail="Appears on the activity timeline"
          onClick={onAddNote}
        />
        <SheetAction
          icon={History}
          label="View full activity"
          detail="Opens the Activity tab"
          onClick={onViewActivity}
        />
        <SheetInactive
          icon={ShieldCheck}
          label="Add product or service"
          reason="Screen not included in this walkthrough"
        />
        <SheetInactive
          icon={SquarePen}
          label="Edit customer"
          reason="Your role permits editing — the edit screen is not included in this walkthrough"
        />
      </div>
    </>
  );
}

function FollowUpSheet({
  done,
  onSave,
  onClose,
}: {
  done: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const c = CUSTOMER_RECORD;

  if (done) {
    return (
      <Confirmed
        title="Follow-up scheduled"
        detail={`Call · 21 Sep 2026, 11:00 AM · ${SALES_PERSONA.name}`}
        closeLabel="Back to customer record"
        onClose={onClose}
      />
    );
  }

  return (
    <>
      <SheetHeader
        title="Create follow-up"
        subtitle={`${c.name} · Health Insurance renewal`}
        onClose={onClose}
      />
      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <SheetField label="Contact">
          <p className="flex h-11 items-center rounded-lg border border-border bg-muted px-2.5 text-[13px] font-medium text-foreground">
            {c.name}
          </p>
        </SheetField>

        <div className="grid grid-cols-2 gap-2">
          <SheetField label="Follow-up type">
            <select defaultValue="Call" className={FIELD_CLASS}>
              {FOLLOW_UP_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </SheetField>
          <SheetField label="Assigned to">
            <select defaultValue={SALES_PERSONA.name} className={FIELD_CLASS}>
              {TEAM.map((m) => (
                <option key={m.id}>{m.name}</option>
              ))}
            </select>
          </SheetField>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SheetField label="Due date">
            <input
              type="date"
              defaultValue="2026-09-21"
              className={FIELD_CLASS}
            />
          </SheetField>
          <SheetField label="Time">
            <input type="time" defaultValue="11:00" className={FIELD_CLASS} />
          </SheetField>
        </div>

        <SheetField label="Note">
          <textarea
            rows={2}
            defaultValue="Check the renewal paperwork is complete before 26 Sep."
            className="w-full min-w-0 rounded-lg border border-input bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-foreground"
          />
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
          onClick={onSave}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-2 text-sm font-semibold text-primary-foreground"
        >
          <Check className="size-4 shrink-0" aria-hidden="true" />
          Save follow-up
        </button>
      </div>
    </>
  );
}

function NoteSheet({
  done,
  onSave,
  onClose,
}: {
  done: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const c = CUSTOMER_RECORD;

  if (done) {
    return (
      <Confirmed
        title="Note added"
        detail={`It would appear on ${c.name}'s activity timeline, with your name and the time.`}
        closeLabel="Back to customer record"
        onClose={onClose}
      />
    );
  }

  return (
    <>
      <SheetHeader
        title="Add note"
        subtitle={`On ${c.name}'s timeline`}
        onClose={onClose}
      />
      <div className="border-t border-border pt-3">
        <SheetField label="Note">
          <textarea
            rows={4}
            defaultValue="Renewing the health cover on the same sum insured. Send the payment link once the premium is confirmed."
            className="w-full min-w-0 rounded-lg border border-input bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-foreground"
          />
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
          onClick={onSave}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-2 text-sm font-semibold text-primary-foreground"
        >
          <Check className="size-4 shrink-0" aria-hidden="true" />
          Add note
        </button>
      </div>
    </>
  );
}
