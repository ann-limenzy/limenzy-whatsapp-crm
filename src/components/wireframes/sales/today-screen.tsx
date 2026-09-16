"use client";

import {
  AlarmClock,
  BellRing,
  CalendarCheck,
  ChevronRight,
  MessageCircle,
  Phone,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import type { Route } from "next";
import Link from "next/link";

import { PhoneFrame, PhoneScreen } from "@/components/wireframes/phone-frame";
import { WireframeBrand } from "@/components/wireframes/wireframe-brand";
import {
  SALES_PERSONA,
  DUE_TODAY,
  NEW_LEADS,
  OVERDUE,
  RENEWALS_SOON,
  WORKSPACE,
  type WorkItem,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * C1 — Today's work.
 *
 * The screen answers one question on opening: what needs my attention today?
 * So it is ordered by urgency rather than by module — overdue first, then
 * today's calls, then the things that are merely approaching.
 *
 * Every row carries its own primary action. A salesperson standing in a shop
 * should be able to act without first opening a record.
 */

type Section = {
  id: string;
  title: string;
  items: readonly WorkItem[];
  icon: LucideIcon;
  tone: "danger" | "primary" | "warning" | "info";
  emptyNote?: string;
};

const SECTIONS: readonly Section[] = [
  {
    id: "overdue",
    title: "Overdue",
    items: OVERDUE,
    icon: AlarmClock,
    tone: "danger",
  },
  {
    id: "today",
    title: "Due today",
    items: DUE_TODAY,
    icon: CalendarCheck,
    tone: "primary",
  },
  {
    id: "renewals",
    title: "Renewals coming up",
    items: RENEWALS_SOON,
    icon: BellRing,
    tone: "warning",
  },
  {
    id: "leads",
    title: "New leads for you",
    items: NEW_LEADS,
    icon: UserPlus,
    tone: "info",
  },
];

const TONE_CLASS = {
  danger: "bg-danger-subtle text-danger-on-subtle",
  primary: "bg-primary/12 text-primary",
  warning: "bg-warning-subtle text-warning-on-subtle",
  info: "bg-info-subtle text-info-on-subtle",
} as const;

export function TodayScreen() {
  const totalDue = OVERDUE.length + DUE_TODAY.length;

  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-0 py-0 md:px-6 md:py-8">
        <PhoneFrame caption="390 × 844 · the screen a salesperson opens first">
          <PhoneScreen
            activeNav="home"
            header={
              <header className="surface-glass rounded-none border-x-0 border-t-0 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
                {/* The brand sits on the app's home screen only. The detail
                    screens carry a back arrow and the record's name instead —
                    at 326px there is no room for both, and a contextual header
                    is more useful there than a repeated mark. */}
                <div className="flex items-center justify-between gap-2 pb-2.5">
                  <WireframeBrand variant="compact" />
                  {/* These are the salesperson's screens, and which actions
                      they may take depends on that role — so the role is
                      stated rather than left to be inferred. */}
                  <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {SALES_PERSONA.role}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">
                      {WORKSPACE.today}
                    </p>
                    <h1 className="mt-0.5 truncate text-lg font-semibold tracking-tight text-foreground">
                      Good morning, {SALES_PERSONA.firstName}
                    </h1>
                  </div>
                  <span className="relative grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground">
                    <BellRing className="size-5" aria-hidden="true" />
                    <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-danger text-[10px] font-semibold text-danger-foreground">
                      3
                    </span>
                    <span className="sr-only">3 notifications</span>
                  </span>
                </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  {totalDue} follow-ups need you today · 1 unread WhatsApp
                </p>
              </header>
            }
          >
            <div className="flex flex-col gap-4 px-3 py-4">
              {/* Unread WhatsApp gets its own card: it is the one item where
                  a customer is already waiting on a reply. */}
              <Link
                href={"/wireframes/whatsapp/mobile" as Route}
                className="surface-solid flex min-h-11 w-full items-center gap-3 rounded-xl p-3 text-left"
              >
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-lg bg-channel-whatsapp-subtle text-channel-whatsapp-on-subtle"
                >
                  <MessageCircle className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    1 unread WhatsApp message
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    Ramesh Kumar · “Yes, please renew it”
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>

              {SECTIONS.map((section) => (
                <section key={section.id}>
                  <h2 className="flex items-center gap-2 px-1 pb-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-md",
                        TONE_CLASS[section.tone],
                      )}
                    >
                      <section.icon className="size-3.5" />
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {section.title}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {section.items.length}
                    </span>
                  </h2>

                  <ul className="flex flex-col gap-2">
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <WorkCard item={item} />
                      </li>
                    ))}
                  </ul>

                  {/* Spec §18's "View All", on the follow-up section it
                      belongs to rather than at the foot of the screen where it
                      would look like it covered renewals and new leads too.
                      One link, not one per section. */}
                  {section.id === "today" ? (
                    <Link
                      href={"/wireframes/follow-ups/mobile" as Route}
                      className="surface-solid mt-2 flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-accent/60"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <CalendarCheck
                          className="size-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span className="truncate">View all follow-ups</span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                          {totalDue} due
                        </span>
                        <ChevronRight className="size-4" aria-hidden="true" />
                      </span>
                    </Link>
                  ) : null}
                </section>
              ))}

              <p className="px-1 pb-2 text-center text-[11px] leading-relaxed text-muted-foreground">
                That is everything for today.
              </p>
            </div>
          </PhoneScreen>
        </PhoneFrame>
      </div>
    </div>
  );
}

/**
 * The lead-detail wireframe shows one specific lead, so only that row can
 * open it. Every other row keeps its chevron as a plain, inert affordance
 * rather than pointing somewhere that does not exist.
 */
const BUILT_OUT_LEAD = "Priya Iyer";

function WorkCard({ item }: { item: WorkItem }) {
  const opensDetail = item.person === BUILT_OUT_LEAD;
  const statusClass = {
    Due: "border-info/30 bg-info-subtle text-info-on-subtle",
    Overdue: "border-danger/30 bg-danger-subtle text-danger-on-subtle",
    Scheduled:
      "border-border-strong/40 bg-neutral-subtle text-neutral-on-subtle",
    New: "border-primary/30 bg-primary/12 text-primary",
    Unread:
      "border-channel-whatsapp/30 bg-channel-whatsapp-subtle text-channel-whatsapp-on-subtle",
  }[item.status];

  const primary =
    item.type === "WhatsApp"
      ? { label: "WhatsApp", icon: MessageCircle, whatsapp: true }
      : item.type === "Call"
        ? { label: "Call", icon: Phone, whatsapp: false }
        : { label: "Open", icon: ChevronRight, whatsapp: false };
  const PrimaryIcon = primary.icon;

  return (
    <article className="surface-solid rounded-xl p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {item.person}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.product}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            statusClass,
          )}
        >
          {item.status}
        </span>
      </div>

      {item.note ? (
        <p className="mt-1.5 truncate text-xs text-muted-foreground">
          {item.note}
        </p>
      ) : null}

      <div className="mt-2.5 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
          {item.due}
        </span>

        {opensDetail ? (
          <Link
            href={"/wireframes/sales/record" as Route}
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`Open ${item.person}`}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground"
          >
            <ChevronRight className="size-4" />
          </span>
        )}
        <button
          type="button"
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium",
            primary.whatsapp
              ? "bg-channel-whatsapp text-channel-whatsapp-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          <PrimaryIcon className="size-4" aria-hidden="true" />
          {primary.label}
        </button>
      </div>
    </article>
  );
}
