"use client";

import {
  ArrowLeft,
  CalendarPlus,
  CircleCheck,
  Mail,
  MessageCircle,
  MessageSquarePlus,
  Phone,
  PhoneOutgoing,
  Smartphone,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import {
  PhoneFrame,
  PhoneScreen,
  PhoneSheet,
} from "@/components/wireframes/phone-frame";
import {
  LEAD_RECORD,
  RECORD_ACTIVITY,
  SALES_PERSONA,
  type Activity,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * C2 — Lead detail on a phone.
 *
 * Built around the call, because that is what the salesperson came here to
 * do. Contact details sit at the top where they are read aloud, the four
 * actions sit beneath them, and the history is below the fold.
 *
 * The Call demonstration is deliberately inert: it is a button, not a `tel:`
 * link, and it opens a sheet explaining what would happen on a real handset.
 * Nothing dials.
 */
/**
 * Where the back control returns to, keyed by the `from` query parameter.
 *
 * An ALLOW-LIST, not a redirect target: the parameter picks a key in this
 * table and its own text is never used as a URL. Anything unknown falls back
 * to Today's work, which is how this screen has always been reached.
 */
const BACK_TARGETS = {
  today: {
    href: "/wireframes/sales/today",
    label: "Back to today's work",
    short: "Today",
  },
  followups: {
    href: "/wireframes/follow-ups/mobile",
    label: "Back to follow-ups",
    short: "Follow-ups",
  },
} as const;

type BackKey = keyof typeof BACK_TARGETS;

function backTarget(from: string | null) {
  return from !== null && from in BACK_TARGETS
    ? BACK_TARGETS[from as BackKey]
    : BACK_TARGETS.today;
}

export function RecordScreen({ from }: { from: string | null }) {
  const [handover, setHandover] = useState(false);
  const back = backTarget(from);

  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-0 py-0 md:px-6 md:py-8">
        <PhoneFrame caption="Tap Call to see the hand-off to the phone's dialler">
          <PhoneScreen
            activeNav="leads"
            sheet={
              handover ? (
                <PhoneSheet
                  label="Call hand-off"
                  onClose={() => setHandover(false)}
                >
                  <CallHandover onClose={() => setHandover(false)} />
                </PhoneSheet>
              ) : null
            }
            header={
              <header className="surface-glass sticky top-0 z-10 flex items-center gap-1 rounded-none border-x-0 border-t-0 px-2 py-2 pt-[max(env(safe-area-inset-top),0.5rem)]">
                {/* Named, not just an arrow: this record is reachable from
                    two places and the salesperson should not have to guess
                    which one they are about to return to. */}
                <Link
                  href={back.href as Route}
                  aria-label={back.label}
                  className="-ms-1 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg ps-1 pe-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
                  {back.short}
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {LEAD_RECORD.name}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {LEAD_RECORD.reference}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-primary/30 bg-primary/12 px-2.5 py-1 text-[11px] font-medium text-primary">
                  {LEAD_RECORD.stage}
                </span>
              </header>
            }
          >
            <div className="flex flex-col gap-4 px-3 py-4">
              {/* Identity and contact */}
              <section className="surface-solid rounded-xl p-4">
                <h2 className="text-base font-semibold text-foreground">
                  {LEAD_RECORD.name}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {LEAD_RECORD.product} · lead since {LEAD_RECORD.since}
                </p>

                <dl className="mt-3.5 flex flex-col gap-2.5 text-sm">
                  <ContactRow
                    icon={Phone}
                    label="Phone"
                    value={LEAD_RECORD.phone}
                  />
                  <ContactRow
                    icon={Mail}
                    label="Email"
                    value={LEAD_RECORD.email}
                  />
                </dl>

                {/* Four primary actions, each a full 44px target. */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setHandover(true)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
                  >
                    <Phone className="size-4" aria-hidden="true" />
                    Call
                  </button>
                  <Link
                    href={"/wireframes/whatsapp/mobile" as Route}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-channel-whatsapp text-sm font-semibold text-channel-whatsapp-foreground"
                  >
                    <MessageCircle className="size-4" aria-hidden="true" />
                    WhatsApp
                  </Link>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-foreground"
                  >
                    <MessageSquarePlus className="size-4" aria-hidden="true" />
                    Add note
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-foreground"
                  >
                    <CalendarPlus className="size-4" aria-hidden="true" />
                    Follow-up
                  </button>
                </div>
              </section>

              {/* Status facts */}
              <section className="surface-solid rounded-xl p-4">
                <dl className="flex flex-col gap-3 text-sm">
                  <FactRow label="Stage" value={LEAD_RECORD.stage} />
                  {/* "You" rather than her own name: on the salesperson's own screen,
                      repeating it says less than confirming the lead is hers. */}
                  <FactRow
                    label="Assigned to"
                    value={
                      LEAD_RECORD.owner === SALES_PERSONA.name
                        ? "You"
                        : LEAD_RECORD.owner
                    }
                  />
                  <FactRow
                    label="Next follow-up"
                    value={LEAD_RECORD.nextFollowUp}
                    emphasis
                  />
                </dl>
              </section>

              {/* Activity */}
              <section>
                <h3 className="px-1 pb-2 text-sm font-semibold text-foreground">
                  Recent activity
                </h3>
                <ol className="surface-solid divide-y divide-border/70 overflow-hidden rounded-xl">
                  {RECORD_ACTIVITY.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-3 p-3">
                      <ActivityDot kind={entry.kind} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-foreground">
                          {entry.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {entry.detail}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {entry.time}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </PhoneScreen>
        </PhoneFrame>
      </div>
    </div>
  );
}

/**
 * The call hand-off.
 *
 * This is the moment the specification is careful about (§27.1–27.2): the CRM
 * opens the phone's own calling interface and steps aside. It is not in-app
 * VoIP, and the CRM cannot tell whether the call connected.
 */
function CallHandover({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/12 text-primary"
        >
          <PhoneOutgoing className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            Your phone&apos;s dialler opens
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            The CRM hands {LEAD_RECORD.phone} to the phone and steps aside. The
            call itself happens in your normal calling screen, over your mobile
            network.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3.5 rounded-lg border border-border bg-muted px-3 py-2.5">
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Smartphone className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            When you come back, the CRM reopens this lead and offers to record
            what happened. It cannot tell on its own whether the call connected
            — you say.
          </span>
        </p>
      </div>

      <p className="mt-3 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-[11px] leading-relaxed text-warning-on-subtle">
        Concept wireframe — nothing dials. On a real phone this opens the native
        calling screen.
      </p>

      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 flex-1 rounded-lg border border-border text-sm font-medium text-foreground"
        >
          Cancel
        </button>
        {/* Shortened from "Next: record the result": it now stays on one
              line at 390px and wraps cleanly rather than awkwardly at 326px. */}
        <Link
          href={"/wireframes/sales/outcome" as Route}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-2 text-sm font-semibold text-primary-foreground"
        >
          <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
          Record the result
        </Link>
      </div>
    </>
  );
}

function ContactRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <dt className="sr-only">{label}</dt>
      <dd className="min-w-0 truncate text-foreground">{value}</dd>
    </div>
  );
}

function FactRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right text-sm",
          emphasis
            ? "font-semibold text-primary"
            : "font-medium text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function ActivityDot({ kind }: { kind: Activity["kind"] }) {
  const map = {
    call: { icon: Phone, className: "bg-primary/12 text-primary" },
    whatsapp: {
      icon: MessageCircle,
      className: "bg-channel-whatsapp-subtle text-channel-whatsapp-on-subtle",
    },
    note: {
      icon: MessageSquarePlus,
      className: "bg-muted text-muted-foreground",
    },
    stage: {
      icon: CircleCheck,
      className: "bg-info-subtle text-info-on-subtle",
    },
    created: {
      icon: MessageSquarePlus,
      className: "bg-muted text-muted-foreground",
    },
    followup: {
      icon: CalendarPlus,
      className: "bg-success-subtle text-success-on-subtle",
    },
  }[kind];
  const Icon = map.icon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full",
        map.className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
