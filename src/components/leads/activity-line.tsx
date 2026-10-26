import { LEAD_LOST_REASON_LABELS } from "@/lib/validation/leads";
import type { LeadActivityEntry } from "@/server/auth/workspace-leads";

/**
 * One line of §39's timeline.
 *
 * This lives apart from the detail screen because the timeline is now drawn
 * in two places: the first page, rendered on the server with the record, and
 * the older pages, appended in the browser as the reader asks for them. Two
 * renderers of the same history would drift — the same event would read one
 * way above the "Show older" button and another way below it — so there is
 * one, and both paths go through it.
 *
 * The import of `LeadActivityEntry` is type-only, so nothing from the server
 * gateway is pulled into the browser bundle by it.
 */

/** A timeline entry, in plain words. */
export function describeActivity(
  entry: LeadActivityEntry,
  actorName: string,
  nameOf: (userProfileId: string | null) => string,
): { readonly headline: string; readonly detail?: string } {
  switch (entry.kind) {
    case "record_created":
      return { headline: `Lead created by ${actorName}` };
    case "details_edited":
      return {
        headline: `${actorName} edited the details`,
        detail: (entry.changedFields ?? []).join(", "),
      };
    case "stage_changed":
      return {
        headline: `${actorName} changed the stage`,
        detail: `${entry.fromStageName} → ${entry.toStageName}`,
      };
    case "marked_won":
      return { headline: `${actorName} marked it won` };
    case "marked_lost":
      return {
        headline: `${actorName} marked it lost`,
        detail: [
          entry.lostReason ? LEAD_LOST_REASON_LABELS[entry.lostReason] : null,
          entry.note,
        ]
          .filter(Boolean)
          .join(" — "),
      };
    case "reopened":
      return {
        headline: `${actorName} reopened it`,
        detail: `moved to ${entry.toStageName}`,
      };
    case "note_added":
      return {
        headline: `${actorName} added a note`,
        detail: entry.note ?? "",
      };
    case "owner_changed":
      /* §163.13 asks for both ends, so both are shown rather than just the
         new one — "who had it before" is the question people ask. */
      return {
        headline: `${actorName} changed the record owner`,
        detail: `${nameOf(entry.fromOwnerUserProfileId)} → ${nameOf(
          entry.toOwnerUserProfileId,
        )}`,
      };
  }
}

/**
 * One `<li>` of the timeline. The moment arrives already formatted in the
 * workspace's §158 zone: a component that formatted it here would render one
 * string on the server and another in the browser.
 */
export function ActivityLine({
  headline,
  detail,
  when,
}: {
  headline: string;
  detail?: string;
  when: string;
}) {
  return (
    <li className="relative py-2.5">
      <span
        aria-hidden="true"
        className="absolute top-[1.1rem] -left-[1.4rem] size-2 rounded-full border-2 border-surface bg-border"
      />
      {/*
        Stacked on a phone, ranged right on anything wider. Left to wrap, the
        time sat beside a short headline and under a long one, which made the
        column look accidental.
      */}
      <div className="flex flex-col gap-y-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-x-3">
        <p className="text-sm font-medium">{headline}</p>
        <time className="order-first text-xs whitespace-nowrap text-muted-foreground sm:order-none">
          {when}
        </time>
      </div>
      {detail ? (
        <p className="mt-0.5 text-sm whitespace-pre-wrap text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </li>
  );
}
