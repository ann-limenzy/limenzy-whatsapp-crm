"use client";

import {
  ArrowLeft,
  CalendarPlus,
  Check,
  ExternalLink,
  FileText,
  MessageSquarePlus,
  MoreHorizontal,
  Phone,
  RotateCcw,
  Send,
  UserCog,
  XCircle,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

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
import { DeliveryTag } from "@/components/wireframes/whatsapp/parts";
import {
  CONVERSATIONS,
  SALES_PERSONA,
  FOLLOW_UP_TYPES,
  TEAM,
  THREAD,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * B3 — Conversation on a phone.
 *
 * A&S Fincare's salespeople work from phones, so every CRM action the desktop
 * conversation offers has to be reachable here too. Cramming that toolbar into
 * the header would wreck it, so the screen uses the usual phone pattern: three
 * primary actions in the thumb zone directly above the composer, everything
 * secondary behind More in a bottom sheet.
 *
 * Order follows how the work actually goes — reply, call, schedule the next
 * step — with the record, notes and conversation admin one layer down.
 *
 * Every sheet here is component state. Nothing is saved, sent or dialled.
 */

/** Which sheet is open, if any. */
type SheetKind = "call" | "followup" | "note" | "more";

/** Local confirmations, cleared when the sheet closes. */
type Confirmation = "followup" | "note";

export function MobileConversationScreen() {
  const conversation = CONVERSATIONS[0]!;
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [confirmed, setConfirmed] = useState<Confirmation | null>(null);

  const close = () => {
    setSheet(null);
    setConfirmed(null);
  };

  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-0 py-0 md:px-6 md:py-8">
        <PhoneFrame caption="390 × 844 · one-handed reach">
          <PhoneScreen
            activeNav="whatsapp"
            sheet={
              sheet ? (
                <PhoneSheet label={SHEET_LABEL[sheet]} onClose={close}>
                  {sheet === "more" ? (
                    <MoreSheet
                      person={conversation.person}
                      recordLabel={conversation.recordLabel}
                      onClose={close}
                      onAddNote={() => setSheet("note")}
                    />
                  ) : null}
                  {sheet === "followup" ? (
                    <FollowUpSheet
                      person={conversation.person}
                      done={confirmed === "followup"}
                      onSave={() => setConfirmed("followup")}
                      onClose={close}
                    />
                  ) : null}
                  {sheet === "note" ? (
                    <NoteSheet
                      person={conversation.person}
                      done={confirmed === "note"}
                      onSave={() => setConfirmed("note")}
                      onClose={close}
                    />
                  ) : null}
                  {sheet === "call" ? (
                    <CallHandoffSheet
                      person={conversation.person}
                      phone={conversation.phone}
                      returnsTo={`${conversation.person}'s conversation`}
                      onClose={close}
                    />
                  ) : null}
                </PhoneSheet>
              ) : null
            }
            header={
              <header className="surface-glass sticky top-0 z-10 rounded-none border-x-0 border-t-0 px-2 pt-[env(safe-area-inset-top)]">
                <div className="flex items-center gap-1 py-2">
                  <Link
                    href={"/wireframes/whatsapp/mobile-inbox" as Route}
                    aria-label="Back to inbox"
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground"
                  >
                    <ArrowLeft className="size-5" aria-hidden="true" />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {conversation.person}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {conversation.recordLabel} · {conversation.product}
                    </p>
                  </div>

                  <span className="shrink-0 rounded-full border border-success/30 bg-success-subtle px-2.5 py-0.5 text-[11px] font-medium text-success-on-subtle">
                    {conversation.status}
                  </span>
                </div>
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

            {/* Actions and composer share one sticky block, so the thumb zone
                is a single surface rather than two stacked bars. */}
            <div className="surface-solid sticky bottom-0 border-t border-border">
              <div className="grid grid-cols-3 gap-1 border-b border-border/70 p-1.5">
                <PrimaryAction
                  icon={Phone}
                  label="Call"
                  onClick={() => setSheet("call")}
                />
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

              <div className="flex items-end gap-2 p-2.5">
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

const SHEET_LABEL: Record<SheetKind, string> = {
  call: "Call hand-off",
  followup: "Create follow-up",
  note: "Add note",
  more: "Conversation actions",
};

/** One of the three thumb-zone actions. Always at least 44px tall. */
/* ---------------------------------------------------------------- sheets */

function MoreSheet({
  person,
  recordLabel,
  onClose,
  onAddNote,
}: {
  person: string;
  recordLabel: string;
  onClose: () => void;
  onAddNote: () => void;
}) {
  return (
    <>
      <SheetHeader
        title="Conversation actions"
        subtitle={`${person} · ${recordLabel}`}
        onClose={onClose}
      />
      <div className="flex flex-col gap-0.5 border-t border-border pt-2">
        {/*
         * This customer's record is not one of the screens in the walkthrough,
         * and the lead-detail wireframe belongs to a different person —
         * linking there would tell the client the CRM had opened the wrong
         * customer. So the capability is shown and labelled instead.
         */}
        <Link
          href={"/wireframes/customers/mobile?from=whatsapp" as Route}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
        >
          <ExternalLink
            className="size-[18px] shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-foreground">
              Open customer record
            </span>
            <span className="line-clamp-2 block text-[11px] leading-snug text-muted-foreground">
              {person}&apos;s full profile, policies and activity
            </span>
          </span>
        </Link>
        <SheetAction
          icon={MessageSquarePlus}
          label="Add note"
          detail="Records a note on the customer timeline"
          onClick={onAddNote}
        />
        {/*
         * Spec §162 permission matrix: "Assign WhatsApp conversations" is
         * Yes for Owner/Admin, Configurable for Manager, No for Staff/Sales.
         * This is the salesperson's phone, so it is not theirs to do.
         */}
        <SheetInactive
          icon={UserCog}
          label="Assign conversation"
          reason="Managers and admins only"
        />
        {/*
         * Spec §112 names closing/reopening as its own permission, but the
         * §162 matrix gives it no row — so whether a Sales Executive may do it
         * is genuinely undecided. Showing it as available would put a product
         * decision into the client's head as though it were settled, so the
         * capability is shown and the permission question left open.
         */}
        <SheetInactive
          icon={XCircle}
          label="Close conversation"
          reason="Available based on role permission"
        />
      </div>

      <p className="mt-2 border-t border-border pt-2.5 text-[11px] leading-snug text-muted-foreground">
        Signed in as {SALES_PERSONA.name} · {SALES_PERSONA.role}. What appears
        here depends on the role.
      </p>
    </>
  );
}

function FollowUpSheet({
  person,
  done,
  onSave,
  onClose,
}: {
  person: string;
  done: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  if (done) {
    return (
      <Confirmed
        title="Follow-up scheduled"
        detail={`Call · 14 Sep 2026, 10:00 AM · ${SALES_PERSONA.name}`}
        closeLabel="Back to conversation"
        onClose={onClose}
      />
    );
  }

  return (
    <>
      <SheetHeader
        title="Create follow-up"
        subtitle={`${person} · Health Insurance renewal`}
        onClose={onClose}
      />
      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <SheetField label="Contact">
          <p className="flex h-11 items-center rounded-lg border border-border bg-muted px-2.5 text-[13px] font-medium text-foreground">
            {person}
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
              defaultValue="2026-09-14"
              className={FIELD_CLASS}
            />
          </SheetField>
          <SheetField label="Time">
            <input type="time" defaultValue="10:00" className={FIELD_CLASS} />
          </SheetField>
        </div>

        <SheetField label="Note">
          <textarea
            rows={2}
            defaultValue="Confirm renewal premium and send the payment link."
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
  person,
  done,
  onSave,
  onClose,
}: {
  person: string;
  done: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  if (done) {
    return (
      <Confirmed
        title="Note added"
        detail={`It would appear on ${person}'s activity timeline, with your name and the time.`}
        closeLabel="Back to conversation"
        onClose={onClose}
      />
    );
  }

  return (
    <>
      <SheetHeader
        title="Add note"
        subtitle={`On ${person}'s timeline`}
        onClose={onClose}
      />
      <div className="border-t border-border pt-3">
        <SheetField label="Note">
          <textarea
            rows={4}
            defaultValue="Customer confirmed the renewal on WhatsApp and asked for the payment link before 4 PM."
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
