"use client";

import {
  ArrowLeft,
  CalendarPlus,
  CircleAlert,
  ExternalLink,
  FileText,
  RotateCcw,
  Send,
  UserCheck,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CrmChrome } from "@/components/wireframes/crm-chrome";
import {
  ChannelMark,
  DeliveryTag,
} from "@/components/wireframes/whatsapp/parts";
import { Note, Panel } from "@/components/wireframes/wf-ui";
import { CONVERSATIONS, TEMPLATES, THREAD } from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * B2 — WhatsApp conversation (desktop).
 *
 * A CRM screen that happens to use WhatsApp, not a copy of the WhatsApp app.
 * The difference shows in the right-hand column: who this person is, what
 * they hold, and the next action to take. The message list is the middle of
 * the screen, not the whole of it.
 */
export function ConversationScreen() {
  const conversation = CONVERSATIONS[0]!;
  const [templateOpen, setTemplateOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  return (
    <CrmChrome active="whatsapp">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={"/wireframes/whatsapp/inbox" as Route}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Inbox
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground">
            6 conversations · 3 unread
          </span>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] xl:items-start">
          <section className="surface-elevated flex flex-col overflow-hidden rounded-xl">
            {/* Conversation header: identity, record link, owner, status. */}
            <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
              <ChannelMark />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold text-foreground">
                  {conversation.person}
                </h2>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {conversation.phone} ·{" "}
                  <span className="text-primary underline underline-offset-2">
                    {conversation.recordLabel}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-subtle px-2.5 py-0.5 text-xs font-medium text-success-on-subtle">
                  {conversation.status}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  <UserCheck className="size-3.5" aria-hidden="true" />
                  {conversation.assignedTo}
                </span>
              </div>
            </header>

            {/* Thread */}
            <div className="flex flex-col gap-3.5 bg-muted/40 px-4 py-5 sm:px-5">
              <p className="text-center text-[11px] font-medium text-muted-foreground">
                Today
              </p>
              {THREAD.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>

            {/* Composer */}
            <div className="border-t border-border p-3 sm:p-4">
              {chosen ? (
                <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5">
                  <FileText
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">
                      Template: {chosen}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {TEMPLATES.find((t) => t.name === chosen)?.body}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove template"
                    onClick={() => setChosen(null)}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-wrap items-end gap-2">
                <div className="surface-solid min-h-11 min-w-0 flex-1 rounded-lg px-3 py-2.5 text-sm text-muted-foreground">
                  Write a reply…
                </div>
                {/**
                 * An anchored popover rather than a block appended under the
                 * composer. The composer sits at the bottom of a long page, so
                 * an inline list opened below the fold — the selector appeared
                 * to do nothing. `side="top"` opens it over the conversation,
                 * and Radix flips it back down if there is no room above.
                 */}
                <Popover open={templateOpen} onOpenChange={setTemplateOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="min-h-11">
                      <FileText className="size-4" aria-hidden="true" />
                      Templates
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="end"
                    sideOffset={8}
                    collisionPadding={16}
                    aria-label="Approved message templates"
                    className="w-[min(36rem,calc(100vw-2rem))] p-2"
                  >
                    <p className="px-2 pt-1 pb-2 text-xs font-medium text-muted-foreground">
                      Approved templates
                    </p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {TEMPLATES.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setChosen(t.name);
                              setTemplateOpen(false);
                            }}
                            className="surface-solid w-full rounded-lg p-3 text-left transition-colors hover:bg-accent focus-visible:bg-accent"
                          >
                            <span className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {t.name}
                              </span>
                              <span className="rounded-full bg-success-subtle px-2 py-0.5 text-[10px] font-medium text-success-on-subtle">
                                Approved
                              </span>
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                              {t.body}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </PopoverContent>
                </Popover>
                <Button className="min-h-11">
                  <Send className="size-4" aria-hidden="true" />
                  Send
                </Button>
              </div>

              <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">
                Outside the 24-hour reply window WhatsApp only permits an
                approved template. The composer is disabled then, and the
                template list opens instead.
              </p>
            </div>
          </section>

          {/* Customer context — enough to act, not the whole profile. */}
          <div className="flex flex-col gap-4">
            <Panel title="Customer context" bodyClassName="p-4 sm:p-5">
              <dl className="flex flex-col gap-3.5 text-sm">
                <ContextRow label="Record" value={conversation.recordLabel} />
                <ContextRow label="Product" value={conversation.product} />
                <ContextRow label="Renewal due" value="26 Sep 2026" />
                <ContextRow label="Record owner" value="Arun Menon" />
                <ContextRow label="Customer since" value="14 Mar 2024" />
              </dl>

              <div className="mt-5 flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="min-h-11 w-full justify-start"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Open customer record
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 w-full justify-start"
                >
                  <CalendarPlus className="size-4" aria-hidden="true" />
                  Create follow-up
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 w-full justify-start"
                >
                  <UserCheck className="size-4" aria-hidden="true" />
                  Assign conversation
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11 w-full justify-start"
                >
                  <X className="size-4" aria-hidden="true" />
                  Close conversation
                </Button>
              </div>
            </Panel>

            <Note icon={CircleAlert} tone="warning">
              One message failed to deliver. A retry sends a new message — the
              failed attempt stays in the history rather than being rewritten as
              successful.
            </Note>
          </div>
        </div>
      </div>
    </CrmChrome>
  );
}

function MessageBubble({ message }: { message: (typeof THREAD)[number] }) {
  const outgoing = message.direction === "out";
  const failed = message.delivery === "failed";

  return (
    <div className={cn("flex", outgoing ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[min(32rem,85%)]", outgoing && "text-right")}>
        {message.template ? (
          <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <FileText className="size-3" aria-hidden="true" />
            {message.template}
          </p>
        ) : null}

        <div
          className={cn(
            "rounded-xl px-3.5 py-2.5 text-left text-sm leading-relaxed",
            outgoing
              ? "bg-primary text-primary-foreground"
              : "surface-solid text-foreground",
            failed &&
              "border border-danger/40 bg-danger-subtle text-danger-on-subtle",
          )}
        >
          {message.body}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2 text-right">
          {outgoing && message.delivery ? (
            <DeliveryTag state={message.delivery} time={message.time} />
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {message.time}
            </span>
          )}
          {failed ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary underline underline-offset-2"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              Retry
            </button>
          ) : null}
        </div>

        {message.failureReason ? (
          <p className="mt-1 text-[11px] text-danger-on-subtle">
            {message.failureReason}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-sm font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}
