"use client";

import { ArrowRight, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { StatusBadge } from "@/components/data/status-badge";
import {
  Initials,
  formatDay,
  formatTime,
  stageTone,
} from "@/components/leads/presentation";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { LEAD_LOST_REASON_LABELS } from "@/lib/validation/leads";
import {
  leadQuickView,
  type QuickViewLead,
} from "@/app/actions/lead-quick-view";
import type { LeadActivityEntry } from "@/server/auth/workspace-leads";

/**
 * Quick Preview — a Lead, without leaving the list.
 *
 * Side panel on a desktop, bottom sheet on a phone: one component, because
 * the content is identical and only the edge it arrives from differs.
 *
 * It is a PANEL, not a navigation. Opening and closing it changes nothing
 * about the URL, so the list's search, scope and scroll position survive by
 * construction rather than by being restored.
 *
 * **It invents no authorization.** The data comes from `leadQuickView()`,
 * which calls the same gateways the Lead Detail route uses, so §162.1's row
 * policies decide what comes back. A Lead this actor may not access and one
 * that has been deleted both answer `null`, and both are shown the same way
 * — saying "you may not see this" would confirm that it exists.
 */

export function LeadQuickPreview({
  leadId,
  timeZone,
  onClose,
}: {
  leadId: string;
  timeZone: string;
  onClose: () => void;
}) {
  const [lead, setLead] = useState<QuickViewLead | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "gone" | "failed">(
    "loading",
  );
  const closeRef = useRef<HTMLButtonElement>(null);

  /*
   * No synchronous `setState("loading")` here: the list keys this component
   * on the Lead id, so opening a different row remounts it and the initial
   * state is already "loading". Resetting it from the effect body would be
   * a cascading render, which the project's lint rightly refuses.
   */
  useEffect(() => {
    let current = true;
    leadQuickView(leadId)
      .then((result) => {
        if (!current) return;
        setLead(result);
        setState(result ? "ready" : "gone");
      })
      .catch(() => {
        if (current) setState("failed");
      });
    return () => {
      current = false;
    };
  }, [leadId]);

  /* Focus moves in on open; the list puts it back on close. */
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50"
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <button
        type="button"
        aria-label="Close preview"
        tabIndex={-1}
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[1px] motion-safe:animate-in motion-safe:fade-in"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-quick-preview-title"
        className="surface-solid absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl shadow-xl motion-safe:animate-in motion-safe:slide-in-from-bottom sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[min(26rem,100vw)] sm:rounded-none sm:rounded-l-2xl sm:motion-safe:slide-in-from-right"
      >
        <div className="flex items-start gap-3 border-b border-border p-4">
          {state === "ready" && lead ? (
            <Initials name={lead.name} className="size-10" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Quick preview
            </p>
            <h2
              id="lead-quick-preview-title"
              className="truncate text-base font-semibold"
            >
              {state === "ready" && lead ? lead.name : "Lead"}
            </h2>
            {state === "ready" && lead ? (
              <div className="mt-1">
                <StatusBadge
                  tone={stageTone(lead.stageKind)}
                  label={lead.stageName}
                />
              </div>
            ) : null}
          </div>
          <Button
            ref={closeRef}
            size="icon-sm"
            variant="ghost"
            aria-label="Close preview"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="@container/panel min-h-0 flex-1 overflow-y-auto p-4">
          {state === "loading" ? <Loading /> : null}

          {state === "gone" ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm"
            >
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span>
                This lead is no longer available to you. It may have been
                handed to somebody else, or removed.
              </span>
            </p>
          ) : null}

          {state === "failed" ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-on-subtle"
            >
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>That did not load. Close this and try again.</span>
            </p>
          ) : null}

          {state === "ready" && lead ? (
            <Details lead={lead} timeZone={timeZone} />
          ) : null}
        </div>

        <div className="border-t border-border p-3">
          <Button className="w-full" asChild disabled={state !== "ready"}>
            <Link href={`/leads/${leadId}`}>
              Open full lead record
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading this lead</span>
      {[0, 1, 2, 3].map((row) => (
        <Skeleton key={row} className="h-8 w-full" />
      ))}
    </div>
  );
}

function Details({
  lead,
  timeZone,
}: {
  lead: QuickViewLead;
  timeZone: string;
}) {
  return (
    <>
      <dl className="grid gap-0 divide-y divide-border">
        <Fact label="Phone">
          {lead.phone ? (
            <a
              href={`tel:${lead.phoneNormalised ?? lead.phone}`}
              className="hover:underline"
            >
              {lead.phone}
            </a>
          ) : (
            <span className="text-muted-foreground">Not recorded</span>
          )}
        </Fact>
        <Fact label="Email">
          {lead.email ? (
            <a
              href={`mailto:${lead.email}`}
              className="break-all hover:underline"
            >
              {lead.email}
            </a>
          ) : (
            <span className="text-muted-foreground">Not recorded</span>
          )}
        </Fact>
        <Fact label="Owner">{lead.ownerName}</Fact>
        <Fact label="Source">
          {lead.sourceName ?? (
            <span className="text-muted-foreground">Not recorded</span>
          )}
        </Fact>
        <Fact label="Created">{formatDay(lead.createdAt, timeZone)}</Fact>
      </dl>

      {lead.notes ? (
        <section className="mt-4">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            About this lead
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">
            {lead.notes}
          </p>
        </section>
      ) : null}

      {lead.recent.length > 0 ? (
        <section className="mt-4">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Recent activity
          </h3>
          <ol className="mt-1.5 grid gap-2">
            {lead.recent.map((entry) => (
              <li key={entry.id} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">
                    {entry.actorUserProfileId === null
                      ? "The system"
                      : (lead.actorNames[entry.actorUserProfileId] ??
                        "A team member")}
                  </span>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {formatDay(entry.occurredAt, timeZone)} ·{" "}
                    {formatTime(entry.occurredAt, timeZone)}
                  </time>
                </div>
                <p className="text-muted-foreground">{summarise(entry)}</p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-0.5 py-2 @min-[20rem]/panel:grid-cols-[6rem_minmax(0,1fr)] @min-[20rem]/panel:gap-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/** One line of §39's history, in the panel's shorter voice. */
function summarise(entry: LeadActivityEntry): string {
  switch (entry.kind) {
    case "note_added":
      return entry.note ?? "Logged a note";
    case "stage_changed":
      return `Moved ${entry.fromStageName} → ${entry.toStageName}`;
    case "record_created":
      return "Created this lead";
    case "marked_won":
      return "Marked it won";
    case "marked_lost":
      return entry.lostReason
        ? `Marked it lost — ${LEAD_LOST_REASON_LABELS[entry.lostReason]}`
        : "Marked it lost";
    case "reopened":
      return `Reopened it into ${entry.toStageName}`;
    case "owner_changed":
      return "Changed the record owner";
    case "details_edited":
      return `Edited ${(entry.changedFields ?? []).join(", ") || "the details"}`;
  }
}
