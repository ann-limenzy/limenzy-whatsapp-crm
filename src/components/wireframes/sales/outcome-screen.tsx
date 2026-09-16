"use client";

import {
  ArrowLeft,
  CalendarPlus,
  Check,
  MessageCircle,
  Phone,
  Users,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { PhoneFrame, PhoneScreen } from "@/components/wireframes/phone-frame";
import {
  CALL_OUTCOMES,
  type CallOutcomeValue,
  FOLLOW_UP_TYPES,
  LEAD_RECORD,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * C3 — Record the result.
 *
 * The screen a salesperson sees within seconds of hanging up, so it is built
 * for speed: the outcome is a row of taps rather than a dropdown, the next
 * follow-up is pre-filled with a sensible date, and Save is always reachable
 * at the bottom.
 *
 * The outcomes are spec §27.3's V1 list, held as stable values with separate
 * labels so the behaviour attached to "call back requested" survives any
 * rewording. Choosing it turns the next follow-up on — prominent, per §27.3,
 * but still the salesperson's decision to keep or remove.
 *
 * Saving an outcome changes nothing else: §27.3 is explicit that it must not
 * move the Lead stage or the Customer status, so nothing here does.
 */

const INTERACTION_TYPES = [
  { id: "call", label: "Call", icon: Phone },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "visit", label: "Visit", icon: Users },
] as const;

export function OutcomeScreen() {
  const [interaction, setInteraction] = useState<string>("call");
  const [outcome, setOutcome] =
    useState<CallOutcomeValue>("callback_requested");
  const [complete, setComplete] = useState(true);
  const [scheduleNext, setScheduleNext] = useState(true);
  const [followUpType, setFollowUpType] = useState("Call");

  // The one outcome that all but implies another call (§27.3).
  const suggestsNext = outcome === "callback_requested";

  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-0 py-0 md:px-6 md:py-8">
        <PhoneFrame caption="Back from the call — log it and set the next step">
          <PhoneScreen
            activeNav="leads"
            header={
              <header className="surface-glass sticky top-0 z-10 flex items-center gap-1 rounded-none border-x-0 border-t-0 px-2 py-2 pt-[max(env(safe-area-inset-top),0.5rem)]">
                <Link
                  href={"/wireframes/sales/record" as Route}
                  aria-label="Back to the lead"
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground"
                >
                  <ArrowLeft className="size-5" aria-hidden="true" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    Record the result
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {LEAD_RECORD.name} · {LEAD_RECORD.product}
                  </p>
                </div>
              </header>
            }
          >
            <div className="flex flex-col gap-4 px-3 py-4">
              <Field label="What was it?">
                <div className="grid grid-cols-3 gap-2">
                  {INTERACTION_TYPES.map((t) => {
                    const Icon = t.icon;
                    const active = interaction === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setInteraction(t.id)}
                        className={cn(
                          "inline-flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border text-xs font-medium",
                          active
                            ? "border-primary bg-primary/12 text-primary"
                            : "border-border bg-surface text-muted-foreground",
                        )}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="How did it go?" required>
                <div className="flex flex-wrap gap-2">
                  {CALL_OUTCOMES.map((o) => {
                    const active = outcome === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setOutcome(o.value);
                          if (o.value === "callback_requested")
                            setScheduleNext(true);
                        }}
                        className={cn(
                          "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium",
                          active
                            ? "border-primary bg-primary/12 text-primary"
                            : "border-border bg-surface text-muted-foreground",
                        )}
                      >
                        {active ? (
                          <Check className="size-3.5" aria-hidden="true" />
                        ) : null}
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Notes" hint="Optional">
                <textarea
                  rows={3}
                  defaultValue="Wants the premium breakdown in writing before deciding. Asked me to call back on Monday morning."
                  aria-label="Notes"
                  className="w-full rounded-lg border border-input bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-foreground"
                />
              </Field>

              <label className="surface-solid flex min-h-11 cursor-pointer items-center gap-3 rounded-xl p-3">
                <input
                  type="checkbox"
                  checked={complete}
                  onChange={(e) => setComplete(e.target.checked)}
                  className="size-5 shrink-0 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-foreground">
                    Mark today&apos;s follow-up complete
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    Today, 10:00 AM · Call
                  </span>
                </span>
              </label>

              <section className="surface-solid rounded-xl p-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={scheduleNext}
                    onChange={(e) => setScheduleNext(e.target.checked)}
                    className="size-5 shrink-0 accent-primary"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-foreground">
                      Schedule the next follow-up
                    </span>
                    {suggestsNext ? (
                      <span className="mt-0.5 block text-[11px] text-primary">
                        Suggested — they asked for a callback
                      </span>
                    ) : null}
                  </span>
                  <CalendarPlus
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </label>

                {scheduleNext ? (
                  <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <SmallField label="Date">
                        <input
                          type="date"
                          defaultValue="2026-09-14"
                          aria-label="Next follow-up date"
                          className="h-11 w-full rounded-lg border border-input bg-surface px-2.5 text-[13px] text-foreground"
                        />
                      </SmallField>
                      <SmallField label="Time">
                        <input
                          type="time"
                          defaultValue="10:00"
                          aria-label="Next follow-up time"
                          className="h-11 w-full rounded-lg border border-input bg-surface px-2.5 text-[13px] text-foreground"
                        />
                      </SmallField>
                    </div>

                    <SmallField label="Type">
                      <div className="flex flex-wrap gap-1.5">
                        {FOLLOW_UP_TYPES.map((t) => (
                          <button
                            key={t}
                            type="button"
                            aria-pressed={followUpType === t}
                            onClick={() => setFollowUpType(t)}
                            className={cn(
                              "min-h-11 rounded-lg border px-3 text-[13px] font-medium",
                              followUpType === t
                                ? "border-primary bg-primary/12 text-primary"
                                : "border-border bg-surface text-muted-foreground",
                            )}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </SmallField>
                  </div>
                ) : null}
              </section>

              <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
                Saving adds a Call activity to {LEAD_RECORD.name}&apos;s
                timeline with the outcome, your name and the time. It does not
                change the lead stage — that stays your decision.
              </p>
            </div>

            {/* Save stays within thumb reach at the bottom of the screen. */}
            <div className="surface-solid sticky bottom-0 border-t border-border p-3">
              <div className="flex gap-2">
                <Link
                  href={"/wireframes/sales/record" as Route}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-foreground"
                >
                  Cancel
                </Link>
                <button
                  type="button"
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
                >
                  <Check className="size-4" aria-hidden="true" />
                  {complete && scheduleNext
                    ? "Save, complete and schedule"
                    : complete
                      ? "Save and complete"
                      : "Save outcome"}
                </button>
              </div>
            </div>
          </PhoneScreen>
        </PhoneFrame>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="px-1 pb-2 text-[13px] font-semibold text-foreground">
        {label}
        {required ? (
          <span className="ms-1.5 text-[11px] font-normal text-danger-on-subtle">
            required
          </span>
        ) : null}
        {hint ? (
          <span className="ms-1.5 text-[11px] font-normal text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

function SmallField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="pb-1.5 text-[11px] font-medium text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}
