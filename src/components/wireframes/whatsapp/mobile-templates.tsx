"use client";

import { ArrowLeft, Check, FileText, Lock, Send, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { PhoneFrame, PhoneScreen } from "@/components/wireframes/phone-frame";
import { CONVERSATIONS, TEMPLATES } from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * B4 — Choose a message template (phone).
 *
 * A bottom sheet, because the list is short and the salesperson is already at
 * the bottom of the screen composing. Selecting a template previews the exact
 * text with this customer's details filled in — nothing is sent until they
 * read it and press send.
 */
export function MobileTemplatesScreen() {
  const conversation = CONVERSATIONS[0]!;
  const [selected, setSelected] = useState(TEMPLATES[1]!.id);
  const chosen = TEMPLATES.find((t) => t.id === selected)!;

  const preview = chosen.body
    .replace("{{customer_name}}", conversation.person)
    .replace("{{product}}", conversation.product)
    .replace("{{due_date}}", "26 September 2026")
    .replace("{{document}}", "your Aadhaar card")
    .replace("{{date}}", "15 September")
    .replace("{{time}}", "11:30 AM");

  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-0 py-0 md:px-6 md:py-8">
        <PhoneFrame caption="Bottom sheet · preview before sending">
          <PhoneScreen
            activeNav="whatsapp"
            header={
              <header className="surface-glass sticky top-0 z-10 flex items-center gap-1 rounded-none border-x-0 border-t-0 px-2 py-2 pt-[env(safe-area-inset-top)]">
                <Link
                  href={"/wireframes/whatsapp/mobile" as Route}
                  aria-label="Back to conversation"
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground"
                >
                  <ArrowLeft className="size-5" aria-hidden="true" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {conversation.person}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Choosing a template
                  </p>
                </div>
              </header>
            }
          >
            {/* Dimmed conversation behind the sheet. */}
            <div
              aria-hidden="true"
              className="flex flex-col gap-3 bg-muted/40 px-3 py-4 opacity-40"
            >
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-xl bg-primary px-3 py-2 text-[13px] text-primary-foreground">
                  Yes, please renew it
                </div>
              </div>
              <div className="flex justify-start">
                <div className="surface-solid max-w-[85%] rounded-xl px-3 py-2 text-[13px]">
                  Same cover as last year is fine.
                </div>
              </div>
            </div>

            {/* Bottom sheet */}
            <section
              aria-label="Message templates"
              className="surface-solid sticky bottom-0 rounded-t-2xl border-t border-border shadow-2xl"
            >
              <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                <span
                  aria-hidden="true"
                  className="absolute top-2 left-1/2 mx-auto h-1 w-10 -translate-x-1/2 rounded-full bg-border-strong/50"
                />
                <FileText
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <h2 className="text-sm font-semibold text-foreground">
                  Approved templates
                </h2>
                <Link
                  href={"/wireframes/whatsapp/mobile" as Route}
                  aria-label="Close templates"
                  className="ms-auto grid size-11 place-items-center rounded-lg text-muted-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </Link>
              </div>

              <ul className="max-h-[15rem] divide-y divide-border/70 overflow-y-auto">
                {TEMPLATES.map((t) => {
                  const isSelected = t.id === selected;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(t.id)}
                        aria-pressed={isSelected}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left",
                          isSelected && "bg-accent",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-full border",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border-strong",
                          )}
                        >
                          {isSelected ? <Check className="size-3" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-foreground">
                            {t.name}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {t.category} · approved
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="border-t border-border px-4 py-3">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Preview
                </p>
                <p className="mt-1.5 rounded-lg bg-primary px-3 py-2.5 text-[13px] leading-relaxed text-primary-foreground">
                  {preview}
                </p>

                <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <Lock className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                  Your administrator decides which templates appear here.
                  Templates must be approved by WhatsApp before they can be
                  used.
                </p>

                <div className="mt-3 flex gap-2">
                  <Link
                    href={"/wireframes/whatsapp/mobile" as Route}
                    className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground"
                  >
                    Cancel
                  </Link>
                  <button
                    type="button"
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground"
                  >
                    <Send className="size-4" aria-hidden="true" />
                    Send
                  </button>
                </div>
              </div>
            </section>
          </PhoneScreen>
        </PhoneFrame>
      </div>
    </div>
  );
}
