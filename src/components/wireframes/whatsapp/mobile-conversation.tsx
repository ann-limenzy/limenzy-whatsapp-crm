"use client";

import {
  ArrowLeft,
  CalendarPlus,
  ExternalLink,
  FileText,
  MoreVertical,
  Phone,
  RotateCcw,
  Send,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { PhoneFrame, PhoneScreen } from "@/components/wireframes/phone-frame";
import { DeliveryTag } from "@/components/wireframes/whatsapp/parts";
import { CONVERSATIONS, THREAD } from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * B3 — Conversation on a phone.
 *
 * Built for one thumb. Everything that needs reaching while holding a phone —
 * the composer, templates, send — sits in the bottom third. Call and the
 * record link sit in the header, where they are read but rarely pressed
 * mid-sentence.
 */
export function MobileConversationScreen() {
  const conversation = CONVERSATIONS[0]!;
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-0 py-0 md:px-6 md:py-8">
        <PhoneFrame caption="390 × 844 · one-handed reach">
          <PhoneScreen
            activeNav="whatsapp"
            header={
              <header className="surface-glass sticky top-0 z-10 rounded-none border-x-0 border-t-0 px-2 pt-[env(safe-area-inset-top)]">
                <div className="flex items-center gap-1 py-2">
                  <button
                    type="button"
                    aria-label="Back to inbox"
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground"
                  >
                    <ArrowLeft className="size-5" aria-hidden="true" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {conversation.person}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {conversation.recordLabel} · {conversation.product}
                    </p>
                  </div>

                  <a
                    href={`tel:+917000012345`}
                    aria-label={`Call ${conversation.person}`}
                    onClick={(e) => e.preventDefault()}
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-primary"
                  >
                    <Phone className="size-5" aria-hidden="true" />
                  </a>
                  <button
                    type="button"
                    aria-label="More actions"
                    aria-expanded={actionsOpen}
                    onClick={() => setActionsOpen((v) => !v)}
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground"
                  >
                    <MoreVertical className="size-5" aria-hidden="true" />
                  </button>
                </div>

                {actionsOpen ? (
                  <div className="flex flex-col gap-1 border-t border-border/70 py-2">
                    <SheetAction
                      icon={ExternalLink}
                      label="Open customer record"
                    />
                    <SheetAction icon={CalendarPlus} label="Create follow-up" />
                  </div>
                ) : null}
              </header>
            }
          >
            <div className="flex flex-col gap-3 bg-muted/40 px-3 py-4">
              <p className="text-center text-[11px] font-medium text-muted-foreground">
                Today
              </p>
              {THREAD.map((m) => {
                const outgoing = m.direction === "out";
                const failed = m.delivery === "failed";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex",
                      outgoing ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn("max-w-[85%]", outgoing && "text-right")}
                    >
                      {m.template ? (
                        <p className="mb-1 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                          <FileText className="size-3" aria-hidden="true" />
                          {m.template}
                        </p>
                      ) : null}
                      <div
                        className={cn(
                          "rounded-xl px-3 py-2 text-left text-[13px] leading-relaxed",
                          outgoing
                            ? "bg-primary text-primary-foreground"
                            : "surface-solid text-foreground",
                          failed &&
                            "border border-danger/40 bg-danger-subtle text-danger-on-subtle",
                        )}
                      >
                        {m.body}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                        {outgoing && m.delivery ? (
                          <DeliveryTag state={m.delivery} time={m.time} />
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            {m.time}
                          </span>
                        )}
                        {failed ? (
                          <button
                            type="button"
                            className="inline-flex min-h-11 items-center gap-1 text-[11px] font-medium text-primary underline underline-offset-2"
                          >
                            <RotateCcw className="size-3" aria-hidden="true" />
                            Retry
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Composer sits directly above the navigation — thumb territory. */}
            <div className="surface-solid sticky bottom-0 border-t border-border p-2.5">
              <div className="flex items-end gap-2">
                <Link
                  href={"/wireframes/whatsapp/templates" as Route}
                  aria-label="Choose a message template"
                  className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground"
                >
                  <FileText className="size-5" aria-hidden="true" />
                </Link>
                <div className="min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-3 text-[13px] text-muted-foreground">
                  Message
                </div>
                <button
                  type="button"
                  aria-label="Send message"
                  className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"
                >
                  <Send className="size-5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </PhoneScreen>
        </PhoneFrame>
      </div>
    </div>
  );
}

function SheetAction({
  icon: Icon,
  label,
}: {
  icon: typeof ExternalLink;
  label: string;
}) {
  return (
    <button
      type="button"
      className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-foreground"
    >
      <Icon
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      {label}
    </button>
  );
}
