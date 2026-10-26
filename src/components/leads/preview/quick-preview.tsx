"use client";

import { ArrowRight, X } from "lucide-react";
import { useRef } from "react";

import { StatusBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { LEAD_LOST_REASON_LABELS } from "@/lib/validation/leads";

import { SAMPLE_PEOPLE } from "./sample-leads";
import { ownerNameOf, stageById, type SampleRow } from "./sample-list";
import { Initials, dayLabel, stageTone, timeLabel } from "./shared";

/**
 * The Quick Preview drawer, in one place.
 *
 * It began inside the Lead List. The Board needs exactly the same thing, and
 * two drawers that drift apart is the failure the brief names — so it moved
 * here rather than being copied. Nothing about it changed in the move.
 */

/* ------------------------------------------------------------------ */
/* Quick-preview drawer                                                */
/* ------------------------------------------------------------------ */

/**
 * A drawer, not a navigation.
 *
 * Side panel on a desktop, bottom sheet on a phone — the same component,
 * because the content is identical and only the edge it arrives from
 * differs. Focus moves in, Escape and the backdrop close it, and closing
 * restores the list exactly as it was.
 */
export function QuickPreview({
  row,
  onClose,
}: {
  row: SampleRow;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  return (
    <div
      /* Above the review harness (z-50): a modal that a dev tool floats
         over is a modal the reviewer cannot judge. */
      className="fixed inset-0 z-[60]"
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
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-preview-title"
        className="surface-solid absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl shadow-xl motion-safe:animate-in motion-safe:slide-in-from-bottom sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[min(26rem,100vw)] sm:rounded-none sm:rounded-l-2xl sm:motion-safe:slide-in-from-right"
      >
        <div className="flex items-start gap-3 border-b border-border p-4">
          <Initials name={row.name} className="size-10" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Quick preview
            </p>
            <h2
              id="lead-preview-title"
              className="truncate text-base font-semibold"
            >
              {row.name}
            </h2>
            <div className="mt-1">
              <StatusBadge
                tone={stageTone(stageById(row.stageId)?.kind ?? "active")}
                label={row.stageName}
              />
            </div>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Close preview"
            autoFocus
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="@container/panel min-h-0 flex-1 overflow-y-auto p-4">
          <dl className="grid gap-0 divide-y divide-border">
            <PreviewFact label="Phone">
              {row.phone ? (
                <a href={`tel:${row.phone}`} className="hover:underline">
                  {row.phone}
                </a>
              ) : (
                <span className="text-muted-foreground">Not recorded</span>
              )}
            </PreviewFact>
            <PreviewFact label="Email">
              {row.email ? (
                <a
                  href={`mailto:${row.email}`}
                  className="break-all hover:underline"
                >
                  {row.email}
                </a>
              ) : (
                <span className="text-muted-foreground">Not recorded</span>
              )}
            </PreviewFact>
            <PreviewFact label="Owner">{ownerNameOf(row)}</PreviewFact>
            <PreviewFact label="Source">
              {row.sourceName ?? (
                <span className="text-muted-foreground">Not recorded</span>
              )}
            </PreviewFact>
            <PreviewFact label="Created">{dayLabel(row.createdAt)}</PreviewFact>
          </dl>

          {row.notes ? (
            <section className="mt-4">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                About this lead
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">
                {row.notes}
              </p>
            </section>
          ) : null}

          <section className="mt-4">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Recent activity
            </h3>
            <ol className="mt-1.5 grid gap-2">
              {row.recent.map((item) => (
                <li key={item.id} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">
                      {SAMPLE_PEOPLE[item.actorUserProfileId ?? ""] ??
                        "A team member"}
                    </span>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {dayLabel(item.occurredAt)} · {timeLabel(item.occurredAt)}
                    </time>
                  </div>
                  <p className="text-muted-foreground">{summarise(item)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="border-t border-border p-3">
          <Button className="w-full" asChild>
            <a href="#lead-detail-preview" onClick={(e) => e.preventDefault()}>
              Open full lead record
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function PreviewFact({
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

/** One line of history, in the drawer's shorter voice. */
function summarise(item: {
  kind: string;
  note: string | null;
  fromStageName: string | null;
  toStageName: string | null;
  lostReason: string | null;
}): string {
  switch (item.kind) {
    case "note_added":
      return item.note ?? "Added a note";
    case "stage_changed":
      return `Moved ${item.fromStageName} → ${item.toStageName}`;
    case "record_created":
      return "Created this lead";
    case "marked_won":
      return "Marked it won";
    case "marked_lost":
      return item.lostReason
        ? `Marked it lost — ${
            LEAD_LOST_REASON_LABELS[
              item.lostReason as keyof typeof LEAD_LOST_REASON_LABELS
            ]
          }`
        : "Marked it lost";
    case "owner_changed":
      return "Changed the record owner";
    case "details_edited":
      return "Edited the details";
    default:
      return "Activity";
  }
}
