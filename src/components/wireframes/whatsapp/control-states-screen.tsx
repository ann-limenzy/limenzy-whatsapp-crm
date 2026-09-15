import {
  BellOff,
  CircleAlert,
  Clock,
  FileText,
  PlugZap,
  UserX,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CrmChrome } from "@/components/wireframes/crm-chrome";
import { Note, ScreenHeading } from "@/components/wireframes/wf-ui";
import { cn } from "@/lib/utils";

/**
 * B5 — Control states.
 *
 * The five moments where sending is blocked. Each one says what happened, who
 * can fix it, and what to do instead — an error that only says "failed"
 * leaves a salesperson stuck in front of a customer.
 *
 * Nothing on this screen implies WhatsApp is connected or that Meta has
 * approved the business account.
 */

type State = {
  id: string;
  icon: LucideIcon;
  tone: "warning" | "danger" | "info" | "neutral";
  title: string;
  who: string;
  body: string;
  actions: readonly { label: string; primary?: boolean }[];
  detail?: string;
};

const STATES: readonly State[] = [
  {
    id: "not-connected",
    icon: PlugZap,
    tone: "warning",
    title: "WhatsApp isn't connected yet",
    who: "Seen by Owner and Admin",
    body: "Connect your business WhatsApp account to send and receive customer messages from the CRM. Everything else in the CRM keeps working.",
    actions: [
      { label: "Connect WhatsApp", primary: true },
      { label: "Learn what's involved" },
    ],
    detail:
      "Staff see a shorter version: “WhatsApp is not connected for this workspace. Contact your administrator.”",
  },
  {
    id: "opted-out",
    icon: BellOff,
    tone: "neutral",
    title: "Priya Iyer has opted out of WhatsApp",
    who: "Seen by everyone",
    body: "This customer asked not to receive WhatsApp messages. The composer stays closed and bulk reminders skip them automatically.",
    actions: [
      { label: "Call instead", primary: true },
      { label: "Send an email" },
    ],
    detail:
      "Opt-out is recorded on the customer record and can only be changed there.",
  },
  {
    id: "template-required",
    icon: Clock,
    tone: "info",
    title: "More than 24 hours since their last message",
    who: "Seen by everyone",
    body: "WhatsApp only allows an approved template outside the 24-hour window. Free text becomes available again as soon as the customer replies.",
    actions: [{ label: "Choose a template", primary: true }],
    detail: "This is a WhatsApp platform rule, not a CRM restriction.",
  },
  {
    id: "delivery-failed",
    icon: CircleAlert,
    tone: "danger",
    title: "Message not delivered",
    who: "Seen by the sender",
    body: "The number was unreachable. The failed attempt stays in the conversation history — retrying sends a new message rather than rewriting this one.",
    actions: [
      { label: "Retry send", primary: true },
      { label: "Check the number" },
    ],
    detail: "Reason shown where WhatsApp provides one.",
  },
  {
    id: "needs-assignment",
    icon: UserX,
    tone: "warning",
    title: "This conversation has no owner",
    who: "Seen by Manager and Admin",
    body: "An unassigned conversation is the one that goes unanswered. Assign it to a salesperson before replying so the follow-up lands with someone.",
    actions: [
      { label: "Assign to me", primary: true },
      { label: "Assign to someone else" },
    ],
  },
];

const TONE_CLASS = {
  warning: "border-warning/30 bg-warning-subtle text-warning-on-subtle",
  danger: "border-danger/30 bg-danger-subtle text-danger-on-subtle",
  info: "border-info/30 bg-info-subtle text-info-on-subtle",
  neutral: "border-border-strong/40 bg-neutral-subtle text-neutral-on-subtle",
} as const;

export function ControlStatesScreen() {
  return (
    <CrmChrome active="whatsapp">
      <div className="flex flex-col gap-5">
        <ScreenHeading
          title="When sending is blocked"
          description="Five states a salesperson will meet. Each one names the cause, says who can resolve it, and offers something useful to do instead."
        />

        <Note icon={FileText}>
          WhatsApp is <strong className="font-semibold">not connected</strong>{" "}
          in these wireframes, and no Meta business verification has been
          completed. These screens show the intended behaviour, not a working
          integration.
        </Note>

        {/* Cards keep their own height rather than matching the tallest in the
            row, which left a visible gap under the shorter ones. */}
        <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {STATES.map((state) => {
            const Icon = state.icon;
            return (
              <article
                key={state.id}
                className="surface-elevated flex flex-col rounded-xl p-5"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-lg border",
                    TONE_CLASS[state.tone],
                  )}
                >
                  <Icon className="size-5" />
                </span>

                <h3 className="mt-3.5 text-base font-semibold text-foreground">
                  {state.title}
                </h3>
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {state.who}
                </p>
                <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {state.body}
                </p>

                {state.detail ? (
                  <p className="mt-3 rounded-lg border border-border bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    {state.detail}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {state.actions.map((a) => (
                    <Button
                      key={a.label}
                      variant={a.primary ? "default" : "outline"}
                      size="sm"
                      className="min-h-11 sm:min-h-9"
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </CrmChrome>
  );
}
