"use client";

import { useState, useTransition } from "react";

import { ActivityLine } from "@/components/leads/activity-line";
import {
  olderLeadActivity,
  type ActivityLineData,
} from "@/app/actions/lead-activity";
import { Button } from "@/components/ui/button";

/**
 * "Show older activity" — §27, §39.
 *
 * The first page of the timeline is rendered on the server with the record.
 * This appends the pages behind it, one at a time, on request. It is
 * deliberately not automatic: a Lead worked for a year has a long history,
 * and loading all of it to show the newest ten entries is a cost paid by
 * every reader for something almost none of them scroll to.
 *
 * It renders `<li>`s and nothing else, because it sits inside the `<ol>` the
 * server already opened — a `<div>` of entries after the list would be two
 * lists pretending to be one, and a screen reader would announce the count
 * of the first.
 *
 * The cursor it carries is the position of the oldest line now on screen.
 * Entries added while the reader pages do not disturb it: they are newer
 * than the cursor, so they belong above what is already shown rather than in
 * the page being asked for. That is the whole reason this is a keyset and
 * not an offset.
 */
export function LeadActivityMore({
  leadId,
  cursor,
}: {
  leadId: string;
  /** Position of the oldest entry the server rendered; null ends the list. */
  cursor: { readonly occurredAt: string; readonly id: string } | null;
}) {
  const [lines, setLines] = useState<readonly ActivityLineData[]>([]);
  const [next, setNext] = useState(cursor);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const loadOlder = () => {
    const before = next;
    if (!before || pending) return;
    setFailed(false);
    startTransition(async () => {
      const result = await olderLeadActivity({ leadId, before });
      if (result.status !== "ok") {
        setFailed(true);
        return;
      }
      /*
       * Appended, never merged by id. The cursor asked for entries strictly
       * older than the last one shown, so the server cannot return anything
       * already on screen — and if it somehow did, a de-duplicating merge
       * here would hide the fault rather than let the tests catch it.
       */
      setLines((shown) => [...shown, ...result.lines]);
      setNext(result.nextCursor);
    });
  };

  return (
    <>
      {lines.map((line) => (
        <ActivityLine
          key={line.id}
          headline={line.headline}
          detail={line.detail}
          when={line.when}
        />
      ))}

      {next ? (
        <li className="relative py-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadOlder}
            disabled={pending}
          >
            {pending ? "Loading…" : "Show older activity"}
          </Button>
          {failed ? (
            <p role="alert" className="mt-1.5 text-sm text-muted-foreground">
              Older activity could not be loaded. Try again.
            </p>
          ) : null}
        </li>
      ) : lines.length > 0 ? (
        /* Said only after the reader has paged: on a short history the end of
           the list is self-evident and this would be noise. */
        <li className="relative py-2.5 text-xs text-muted-foreground">
          That is the whole history of this lead.
        </li>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {pending
          ? "Loading older activity"
          : lines.length > 0
            ? `${lines.length} older entr${lines.length === 1 ? "y" : "ies"} loaded`
            : ""}
      </p>
    </>
  );
}
