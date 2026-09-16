"use client";

import {
  CalendarClock,
  CircleAlert,
  Inbox,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";

import { PhoneFrame, PhoneScreen } from "@/components/wireframes/phone-frame";
import { WireframeBrand } from "@/components/wireframes/wireframe-brand";
import { Avatar } from "@/components/wireframes/wf-ui";
import { DeliveryTag } from "@/components/wireframes/whatsapp/parts";
import {
  CONVERSATIONS,
  SALES_PERSONA,
  type Conversation,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * B3 — WhatsApp inbox on a phone.
 *
 * The salesperson's starting point for WhatsApp work, and deliberately NOT a
 * phone copy of the desktop shared inbox.
 *
 * Visibility follows spec §83: "Mine" is the conversations assigned to the
 * signed-in user, Unassigned is reserved for "Owner/Admin and permitted
 * Managers", and "Staff users should not automatically have access to all
 * workspace conversations". So this screen shows Sneha's own conversations
 * and offers no route to anyone else's — there is no All tab and no
 * Unassigned tab on the phone.
 *
 * Ordering is operational rather than purely chronological, because the
 * question this screen answers is "what do I deal with first?". Nothing is
 * synchronised or prioritised automatically; the order is computed from the
 * data already on screen.
 */

type FilterId = "mine" | "unread" | "needs-action" | "closed";

const FILTERS: readonly { id: FilterId; label: string }[] = [
  // "Mine" and "Closed" are the specification's own words (§83, §88).
  // "Unread" is the state §84 asks to make distinguishable. "Needs action" is
  // a derived view, not a spec tab — see `needsAction` below.
  { id: "mine", label: "Mine" },
  { id: "unread", label: "Unread" },
  { id: "needs-action", label: "Needs action" },
  { id: "closed", label: "Closed" },
];

/**
 * A conversation needs the salesperson to do something: the customer is
 * waiting on a reply, a message failed to reach them, or a follow-up on the
 * related record has fallen due. All three are read from data already shown
 * in the row, so nothing here is a hidden judgement.
 */
function needsAction(c: Conversation): boolean {
  return (
    c.status === "Open" &&
    (c.unread > 0 || c.delivery === "failed" || Boolean(c.followUpDue))
  );
}

/** Nothing is owed by us: we spoke last and they have not replied. */
function waitingForCustomer(c: Conversation): boolean {
  return c.status === "Open" && !needsAction(c) && c.lastDirection === "out";
}

/** Lower sorts first. */
function rank(c: Conversation): number {
  if (needsAction(c)) return 0;
  if (waitingForCustomer(c)) return 2;
  return 1;
}

/** The one conversation with a built-out thread wireframe. */
const BUILT_OUT_CONVERSATION = "w1";

export function MobileInboxScreen() {
  const [filter, setFilter] = useState<FilterId>("mine");
  const [query, setQuery] = useState("");

  const mine = useMemo(
    () => CONVERSATIONS.filter((c) => c.assignedTo === SALES_PERSONA.name),
    [],
  );

  const counts = useMemo(
    () => ({
      unread: mine.filter((c) => c.status === "Open" && c.unread > 0).length,
      action: mine.filter(needsAction).length,
      waiting: mine.filter(waitingForCustomer).length,
    }),
    [mine],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return mine
      .filter((c) => {
        if (filter === "closed") return c.status === "Closed";
        if (c.status === "Closed") return false;
        if (filter === "unread") return c.unread > 0;
        if (filter === "needs-action") return needsAction(c);
        return true;
      })
      .filter(
        (c) =>
          !term ||
          c.person.toLowerCase().includes(term) ||
          c.phone.toLowerCase().includes(term),
      )
      .sort((a, b) => rank(a) - rank(b));
  }, [mine, filter, query]);

  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-0 py-0 md:px-6 md:py-8">
        <PhoneFrame caption="390 × 844 · the salesperson's WhatsApp starting point">
          <PhoneScreen
            activeNav="whatsapp"
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
                  WhatsApp
                </h1>

                <label className="surface-solid mt-2 flex min-h-11 items-center gap-2.5 rounded-lg px-3">
                  <Search
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="sr-only">Search conversations</span>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name or phone number"
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
              {/* What to deal with first, in three numbers. */}
              <dl className="grid grid-cols-3 gap-2">
                <Summary label="Unread" value={counts.unread} tone="whatsapp" />
                <Summary
                  label="Needs action"
                  value={counts.action}
                  tone="warning"
                />
                <Summary label="Waiting" value={counts.waiting} tone="muted" />
              </dl>

              <div
                role="group"
                aria-label="Filter conversations"
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

              {visible.length === 0 ? (
                <EmptyState filter={filter} query={query} />
              ) : (
                <ul className="flex flex-col gap-2">
                  {visible.map((c) => (
                    <li key={c.id}>
                      <ConversationRow conversation={c} />
                    </li>
                  ))}
                </ul>
              )}

              <p className="px-1 pb-1 text-[11px] leading-relaxed text-muted-foreground">
                You see the conversations assigned to you. Unassigned and
                team-wide conversations are handled by a manager or
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
}: {
  label: string;
  value: number;
  tone: "whatsapp" | "warning" | "muted";
}) {
  const toneClass = {
    whatsapp: "text-channel-whatsapp-on-subtle",
    warning: "text-warning-on-subtle",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="surface-glass rounded-lg px-2.5 py-2">
      <dt className="truncate text-[10px] font-medium text-muted-foreground">
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

/**
 * One conversation.
 *
 * Only the conversation with a thread wireframe behind it is a link. The
 * others stay visible so the inbox looks like a real working list, but they
 * are plain elements — no chevron, not focusable, nothing that offers a
 * destination the walkthrough cannot honour.
 */
function ConversationRow({ conversation: c }: { conversation: Conversation }) {
  const opens = c.id === BUILT_OUT_CONVERSATION;
  const action = needsAction(c);

  const body = (
    <>
      <Avatar
        initials={initialsOf(c.person)}
        tone={c.unread > 0 ? "whatsapp" : "muted"}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px] text-foreground",
              c.unread > 0 ? "font-semibold" : "font-medium",
            )}
          >
            {c.person}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {c.time}
          </span>
        </span>

        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
          {c.lastDirection === "out" ? "You: " : ""}
          {c.lastMessage}
        </span>

        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {c.unread > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-channel-whatsapp px-2 py-0.5 text-[10px] font-semibold text-channel-whatsapp-foreground">
              {c.unread} unread
            </span>
          ) : null}
          {c.delivery === "failed" ? <DeliveryTag state="failed" /> : null}
          {c.followUpDue ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-subtle px-2 py-0.5 text-[10px] font-medium text-warning-on-subtle">
              <CalendarClock className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{c.followUpDue}</span>
            </span>
          ) : null}
          {c.status === "Closed" ? (
            <span className="rounded-full border border-border-strong/40 bg-neutral-subtle px-2 py-0.5 text-[10px] font-medium text-neutral-on-subtle">
              Closed
            </span>
          ) : null}
          {!action && c.status === "Open" && !c.followUpDue ? (
            <span className="truncate rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {waitingForCustomer(c) ? "Waiting for customer" : "Open"}
            </span>
          ) : null}
        </span>
      </span>
    </>
  );

  const className =
    "surface-solid flex min-h-11 w-full items-start gap-3 rounded-xl p-3 text-left";

  if (!opens) {
    return (
      <span className={className} aria-label={rowLabel(c)}>
        {body}
      </span>
    );
  }

  return (
    <Link
      href={"/wireframes/whatsapp/mobile" as Route}
      aria-label={rowLabel(c)}
      className={cn(className, "transition-colors hover:bg-accent/60")}
    >
      {body}
    </Link>
  );
}

/** Unread and status are spoken, not left to the colour of a pill. */
function rowLabel(c: Conversation): string {
  const bits = [c.person];
  if (c.unread > 0) bits.push(`${c.unread} unread messages`);
  if (c.delivery === "failed") bits.push("last message failed to send");
  if (c.followUpDue) bits.push(c.followUpDue);
  if (c.status === "Closed") bits.push("conversation closed");
  return bits.join(", ");
}

function EmptyState({ filter, query }: { filter: FilterId; query: string }) {
  // Wording follows spec §113, which is explicit that an empty list must
  // explain itself rather than simply show nothing.
  const { icon: Icon, title, detail } = emptyCopy(filter, query);
  return (
    <div className="surface-solid rounded-xl px-4 py-10 text-center">
      <Icon
        className="mx-auto size-7 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="mt-3 text-[13px] font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function emptyCopy(
  filter: FilterId,
  query: string,
): { icon: LucideIcon; title: string; detail: string } {
  if (query.trim()) {
    return {
      icon: Search,
      title: `No conversations match “${query.trim()}”`,
      detail: "Search looks at the customer name and phone number.",
    };
  }
  if (filter === "unread") {
    return {
      icon: Inbox,
      title: "Nothing unread",
      detail: "Every customer message assigned to you has been read.",
    };
  }
  if (filter === "needs-action") {
    return {
      icon: CircleAlert,
      title: "Nothing needs you right now",
      detail:
        "No unread replies, failed messages or follow-ups due on your conversations.",
    };
  }
  if (filter === "closed") {
    return {
      icon: Inbox,
      title: "No closed conversations",
      detail: "Conversations you close will be listed here.",
    };
  }
  return {
    icon: Inbox,
    title: "No conversations assigned to you",
    detail:
      "Messages appear here once a conversation is assigned to you or a customer replies.",
  };
}

function initialsOf(name: string): string {
  if (/^\d/.test(name)) return "#";
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
