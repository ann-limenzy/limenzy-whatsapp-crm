"use client";

import {
  CalendarClock,
  ChevronRight,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  UserRoundSearch,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  PhoneFrame,
  PhoneScreen,
  PhoneSheet,
} from "@/components/wireframes/phone-frame";
import { CallHandoffSheet } from "@/components/wireframes/mobile-sheet-parts";
import { WireframeBrand } from "@/components/wireframes/wireframe-brand";
import { Avatar } from "@/components/wireframes/wf-ui";
import {
  DIRECTORY_CUSTOMERS,
  RENEWAL_WINDOW_DAYS,
  SALES_PERSONA,
  type DirectoryCustomer,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * C1 — Customer directory on a phone.
 *
 * The salesperson's way into customer work when they are not already in a
 * conversation: find someone, see what is falling due, and act.
 *
 * VISIBILITY. Spec §162 gives Staff/Sales "View all Leads/Customers: No", and
 * §53 says the list shows "all Customers the user is permitted to access",
 * defaulting Staff to "My Customers ... owned/permitted Customers". So this
 * screen shows exactly two groups: the customers Sneha OWNS, and the ones
 * whose record has been explicitly SHARED with her. It offers no route to
 * anyone else's customers — there is no All tab, because Staff cannot have
 * one.
 *
 * A WhatsApp conversation being assigned to Sneha does NOT put a customer in
 * this list. Ramesh Kumar appears because his record names her in
 * `permittedUsers`, not because she is handling his chat. Deriving record
 * access from a messaging assignment would quietly widen the permission model
 * — reassigning a conversation would hand over the whole customer file — so
 * the two are computed from different fields and shown as different rows.
 *
 * "+ Add Customer" is deliberately absent. §162 makes "Add Leads/Customers"
 * Configurable for Staff, not granted, and inventing the permission to make
 * the screen look complete would misrepresent what this role can do.
 *
 * Ordering and filtering are computed from the data already on the cards.
 * Nothing is synchronised, scored or prioritised automatically.
 */

type FilterId = "mine" | "due-soon" | "follow-up" | "recent";

const FILTERS: readonly { id: FilterId; label: string; hint: string }[] = [
  // "My customers" and "Due soon" are the specification's own quick-filter
  // words (§53). "Follow-up due" and "Recently contacted" are derived views
  // built from the Next Due Date and Last Activity columns §53 defines.
  {
    id: "mine",
    label: "My customers",
    hint: "Records you own or that are shared with you.",
  },
  {
    id: "due-soon",
    label: "Due soon",
    hint: `Renewal falls within the next ${RENEWAL_WINDOW_DAYS} days, or is already overdue.`,
  },
  {
    id: "follow-up",
    label: "Follow-up due",
    hint: "A follow-up that is overdue or due today.",
  },
  {
    id: "recent",
    label: "Recently contacted",
    hint: "Ordered by last recorded activity, most recent first.",
  },
];

/**
 * Whether this salesperson may work with this customer record.
 *
 * Ownership or an explicit share — nothing else. `conversationAssignee` is
 * deliberately not consulted here.
 */
function permitted(c: DirectoryCustomer, user: string): boolean {
  return c.owner === user || c.permittedUsers.includes(user);
}

/** Renewal needs attention: inside the window, due today, or already past. */
function dueSoon(c: DirectoryCustomer): boolean {
  if (c.renewalStatus === "Renewed") return false;
  return c.renewalInDays <= RENEWAL_WINDOW_DAYS;
}

/** A follow-up the salesperson is late for, or owes today. */
function followUpDue(c: DirectoryCustomer): boolean {
  return c.followUp !== undefined && c.followUp.inDays <= 0;
}

/** Search covers the fields spec §53 lists for the customer search. */
function matches(c: DirectoryCustomer, term: string): boolean {
  if (!term) return true;
  const hay = [
    c.name,
    c.reference,
    c.phone,
    // So "7000012345" finds a number written "70000 12345".
    c.phone.replace(/\s/g, ""),
    c.email,
    c.product,
    c.policyRef,
  ]
    .join(" ")
    .toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

export function MobileCustomerDirectoryScreen() {
  const [filter, setFilter] = useState<FilterId>("mine");
  const [query, setQuery] = useState("");
  const [calling, setCalling] = useState<DirectoryCustomer | null>(null);

  // The permission filter runs first, and every count is derived from its
  // result — so a record that stops being shared disappears from the list AND
  // from the summary, with no second place to keep in step.
  const permittedCustomers = useMemo(
    () => DIRECTORY_CUSTOMERS.filter((c) => permitted(c, SALES_PERSONA.name)),
    [],
  );

  const counts = useMemo(
    () => ({
      mine: permittedCustomers.length,
      dueSoon: permittedCustomers.filter(dueSoon).length,
      followUp: permittedCustomers.filter(followUpDue).length,
    }),
    [permittedCustomers],
  );

  const visible = useMemo(() => {
    const term = query.trim();
    const rows = permittedCustomers
      .filter((c) => {
        if (filter === "due-soon") return dueSoon(c);
        if (filter === "follow-up") return followUpDue(c);
        return true;
      })
      .filter((c) => matches(c, term));

    if (filter === "recent") {
      return [...rows].sort(
        (a, b) => a.lastActivityDaysAgo - b.lastActivityDaysAgo,
      );
    }
    // Otherwise the most pressing renewal leads.
    return [...rows].sort((a, b) => a.renewalInDays - b.renewalInDays);
  }, [permittedCustomers, filter, query]);

  const activeFilter = FILTERS.find((f) => f.id === filter)!;

  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-0 py-0 md:px-6 md:py-8">
        <PhoneFrame caption="390 × 844 · finding a customer without a desk">
          <PhoneScreen
            activeNav="customers"
            sheet={
              calling ? (
                <PhoneSheet
                  label="Call hand-off"
                  onClose={() => setCalling(null)}
                >
                  <CallHandoffSheet
                    person={calling.name}
                    phone={calling.phone}
                    returnsTo="the customer directory"
                    onClose={() => setCalling(null)}
                  />
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
                  Customers
                </h1>

                <label className="surface-solid mt-2 flex min-h-11 items-center gap-2.5 rounded-lg px-3">
                  <Search
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Search customers</span>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Name, phone, email or policy"
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
              {/* Operational counts only — no revenue, commission or
                  conversion metrics, none of which V1 defines. */}
              <dl className="grid grid-cols-3 gap-2">
                <Summary
                  label="My customers"
                  value={counts.mine}
                  tone="primary"
                />
                <Summary
                  label="Due soon"
                  value={counts.dueSoon}
                  tone="warning"
                />
                <Summary
                  label="Follow-ups due"
                  value={counts.followUp}
                  tone="muted"
                />
              </dl>

              <div
                role="group"
                aria-label="Filter customers"
                className="flex flex-wrap gap-1.5"
              >
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      "min-h-11 rounded-full border px-3 text-[12px] font-medium transition-colors",
                      filter === f.id
                        ? "border-primary/40 bg-primary/12 text-primary"
                        : "border-border bg-surface text-muted-foreground",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* What the active filter means, in words, so the list is never
                  a black box. */}
              <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
                {activeFilter.hint}
              </p>

              {/* Spoken when the result set changes, so a screen-reader user
                  learns the list shrank without hunting for it. */}
              <p role="status" aria-live="polite" className="sr-only">
                {visible.length === 0
                  ? "No customers match"
                  : `Showing ${visible.length} of ${counts.mine} customers`}
              </p>

              {visible.length === 0 ? (
                <EmptyState
                  query={query}
                  filter={filter}
                  onClearSearch={() => setQuery("")}
                  onResetFilter={() => setFilter("mine")}
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {visible.map((c) => (
                    <li key={c.id}>
                      <CustomerCard customer={c} onCall={() => setCalling(c)} />
                    </li>
                  ))}
                </ul>
              )}

              <p className="px-1 pb-1 text-[11px] leading-relaxed text-muted-foreground">
                You see the customers you own, plus the records shared with you.
                Being assigned someone&apos;s WhatsApp conversation does not put
                them here — that is a separate permission.
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
}: {
  label: string;
  value: number;
  tone: "primary" | "warning" | "muted";
}) {
  const toneClass = {
    primary: "text-primary",
    warning: "text-warning-on-subtle",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="surface-glass rounded-lg px-2.5 py-2">
      {/* Wraps rather than truncating: at 326px "Follow-ups due" clipped to
          "Follow-ups d…" names nothing. All three tiles grow together. */}
      <dt className="text-[10px] leading-tight font-medium text-muted-foreground">
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

/** "in 15 days" / "Due today" / "8 days overdue" — never a bare date. */
function renewalPhrase(c: DirectoryCustomer): string {
  if (c.renewalStatus === "Renewed") return "Renewed — next cycle";
  if (c.renewalInDays === 0) return "Due today";
  if (c.renewalInDays < 0) return `${Math.abs(c.renewalInDays)} days overdue`;
  return `in ${c.renewalInDays} days`;
}

/** The row is already labelled "Follow-up"; don't say it twice. */
function followUpPhrase(f: { label: string; inDays: number }): string {
  return f.inDays < 0 ? `Overdue · ${f.label}` : f.label;
}

/**
 * One customer.
 *
 * Only Ramesh Kumar has a record wireframe behind him, so only his name is a
 * link and only his card shows a chevron. The others stay fully visible and
 * fully readable — they are what makes filtering mean anything — but they
 * offer no destination the walkthrough cannot honour, and they never enter
 * the tab order as a whole row.
 *
 * Call is different: it opens a local sheet rather than another screen, so it
 * works for everyone here without promising a record that does not exist.
 */
function CustomerCard({
  customer: c,
  onCall,
}: {
  customer: DirectoryCustomer;
  onCall: () => void;
}) {
  const attention =
    c.renewalStatus === "Overdue" ||
    c.renewalStatus === "Due Today" ||
    (c.followUp !== undefined && c.followUp.inDays <= 0);

  const identity = (
    <>
      <Avatar
        initials={initialsOf(c.name)}
        tone={attention ? "primary" : "muted"}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-foreground">
          {c.name}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {c.reference} · {c.product}
          {c.serviceCount && c.serviceCount > 1
            ? ` · ${c.serviceCount} services`
            : ""}
        </span>
      </span>
    </>
  );

  return (
    // Opaque surface: these cards carry dates and references that have to stay
    // legible over the ambient background.
    <div className="surface-solid rounded-xl p-3">
      {c.hasRecord ? (
        <Link
          href={"/wireframes/customers/mobile?from=directory" as Route}
          aria-label={`Open ${c.name}'s customer record`}
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
        <Row
          icon={<RefreshCw className="size-3 shrink-0" aria-hidden="true" />}
          label="Renewal"
          value={`${c.renewal} · ${renewalPhrase(c)}`}
        />
        {c.followUp ? (
          <Row
            icon={
              <CalendarClock className="size-3 shrink-0" aria-hidden="true" />
            }
            label="Follow-up"
            value={followUpPhrase(c.followUp)}
          />
        ) : null}
        <Row label="Last activity" value={c.lastActivity} />
        <Row
          label="Record owner"
          value={c.owner === SALES_PERSONA.name ? "You" : c.owner}
        />
        {/* Only worth spelling out when you are NOT the owner. Then the two
            extra facts matter and must not be run together: the share is what
            lets you open the record, the conversation is only the chat. */}
        {c.owner !== SALES_PERSONA.name ? (
          <>
            <Row label="Your access" value="Shared with you" />
            {c.conversationAssignee === SALES_PERSONA.name ? (
              <Row label="WhatsApp" value="Conversation assigned to you" />
            ) : null}
          </>
        ) : null}
      </dl>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {/* Status in words as well as colour. */}
        {c.renewalStatus === "Overdue" ? (
          <Tag tone="danger">Renewal overdue</Tag>
        ) : null}
        {c.renewalStatus === "Due Today" ? (
          <Tag tone="warning">Renewal due today</Tag>
        ) : null}
        {c.renewalStatus === "Upcoming" && dueSoon(c) ? (
          <Tag tone="warning">Renewal due soon</Tag>
        ) : null}
        {c.renewalStatus === "Renewed" ? (
          <Tag tone="success">Renewed</Tag>
        ) : null}
        {c.followUp && c.followUp.inDays < 0 ? (
          <Tag tone="danger">Follow-up overdue</Tag>
        ) : null}
        {c.followUp && c.followUp.inDays === 0 ? (
          <Tag tone="warning">Follow-up today</Tag>
        ) : null}
      </div>

      <div className="mt-2.5 flex gap-1.5">
        <button
          type="button"
          onClick={onCall}
          aria-haspopup="dialog"
          aria-label={`Call ${c.name}`}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Phone className="size-3.5 shrink-0" aria-hidden="true" />
          Call
        </button>

        {c.hasConversation ? (
          <Link
            href={"/wireframes/whatsapp/mobile" as Route}
            aria-label={`Open ${c.name}'s WhatsApp conversation`}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border text-[12px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            <MessageCircle className="size-3.5 shrink-0" aria-hidden="true" />
            WhatsApp
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="flex shrink-0 items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </dt>
      {/* Wraps rather than truncating: a clipped date is useless. */}
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
  tone: "danger" | "warning" | "success";
  children: React.ReactNode;
}) {
  const toneClass = {
    danger: "border-danger/30 bg-danger-subtle text-danger-on-subtle",
    warning: "border-warning/30 bg-warning-subtle text-warning-on-subtle",
    success: "border-success/30 bg-success-subtle text-success-on-subtle",
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

/* ----------------------------------------------------------- empty state */

function EmptyState({
  query,
  filter,
  onClearSearch,
  onResetFilter,
}: {
  query: string;
  filter: FilterId;
  onClearSearch: () => void;
  onResetFilter: () => void;
}) {
  const searching = query.trim().length > 0;
  return (
    <div className="surface-solid rounded-xl px-4 py-10 text-center">
      {searching ? (
        <Search
          className="mx-auto size-7 text-muted-foreground"
          aria-hidden="true"
        />
      ) : (
        <UserRoundSearch
          className="mx-auto size-7 text-muted-foreground"
          aria-hidden="true"
        />
      )}
      <p className="mt-3 text-[13px] font-medium break-words text-foreground">
        {searching
          ? `No customers match “${query.trim()}”`
          : "Nothing in this view"}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        {searching
          ? "Search looks at the name, phone number, email, product and policy reference."
          : filter === "due-soon"
            ? `No renewal falls within the next ${RENEWAL_WINDOW_DAYS} days.`
            : filter === "follow-up"
              ? "No follow-up is overdue or due today."
              : "No customers to show."}
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
        {filter !== "mine" ? (
          <button
            type="button"
            onClick={onResetFilter}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-[13px] font-medium text-foreground"
          >
            Back to My customers
          </button>
        ) : null}
      </div>
    </div>
  );
}
