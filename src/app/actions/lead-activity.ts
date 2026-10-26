"use server";

import { describeActivity } from "@/components/leads/activity-line";
import { formatWorkspaceMoment, resolveTimeZone } from "@/lib/workspace-time";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import { workspaceTimeZone } from "@/server/auth/workspace-business-settings";
import {
  leadActivityPage,
  recordOwnerNames,
  type LeadActivityCursor,
} from "@/server/auth/workspace-leads";
import { enabledModulesFor } from "@/server/auth/workspace-modules";

/**
 * Older §39 timeline entries — spec §27, §30, §39, §162.1.
 *
 * §27 makes a Lead's history permanent, which the screen has to honour as
 * well as the table does: entries past the first page were previously
 * unreachable by any route, so a long-running Lead's history was effectively
 * truncated at the screen's edge.
 *
 * **Read-only.** Nothing here writes, so there is no §28 confirmation and no
 * §162 action permission to check — §162 carries no row for reading a
 * Lead's own history. The two gates that do apply are applied:
 *
 *   1. **The module.** §30 hides the entire Leads module when Lead
 *      Management is off, and a Server Action is reachable by anyone who can
 *      POST to it, so the screen being hidden is not the gate — this is.
 *   2. **The record.** §162.1 decides which Leads this actor may read at
 *      all, and that is enforced by the row-level policies on
 *      `lead_activities` rather than restated here. A Lead the actor cannot
 *      see yields no rows, exactly as it does on first load.
 *
 * A cursor is a POSITION, not a capability. Handing in one copied from
 * another workspace's Lead widens nothing: it only moves the window within
 * whatever the policies already allow, and for an unreadable Lead that is
 * nothing.
 *
 * The lines come back already worded and already stamped in the workspace's
 * §158 zone, because the first page is prepared that way on the server and
 * the two have to agree. Formatting the continuation in the browser would
 * print the reader's own clock halfway down a list written in the
 * workspace's.
 */

export type ActivityLineData = {
  readonly id: string;
  readonly headline: string;
  readonly detail?: string;
  readonly when: string;
};

export type OlderActivityResult =
  | {
      readonly status: "ok";
      readonly lines: readonly ActivityLineData[];
      readonly nextCursor: {
        readonly occurredAt: string;
        readonly id: string;
      } | null;
    }
  | { readonly status: "unavailable" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function olderLeadActivity(input: {
  readonly leadId: string;
  readonly before: { readonly occurredAt: string; readonly id: string };
}): Promise<OlderActivityResult> {
  /*
   * Shape first. Both values arrive from the browser and both are
   * interpolated as `uuid`/`timestamptz`, so a malformed one would surface
   * as a database error rather than as the "nothing more to show" this
   * screen can actually render.
   */
  if (!UUID.test(input.leadId) || !UUID.test(input.before.id)) {
    return { status: "unavailable" };
  }
  /*
   * The key is only CHECKED through a `Date`; the original text is what gets
   * sent. Parsing it and sending the result back would round the microseconds
   * off the cursor, and the entries written inside that rounding would never
   * be shown on any page.
   */
  if (
    typeof input.before.occurredAt !== "string" ||
    input.before.occurredAt.length > 64 ||
    Number.isNaN(Date.parse(input.before.occurredAt))
  ) {
    return { status: "unavailable" };
  }

  const { context } = await requireWorkspaceContext();
  const { enabled } = await enabledModulesFor(context);
  if (!enabled.has("leads")) return { status: "unavailable" };

  const cursor: LeadActivityCursor = {
    occurredAt: input.before.occurredAt,
    id: input.before.id,
  };
  const [page, owners, storedZone] = await Promise.all([
    leadActivityPage(context, input.leadId, { before: cursor }),
    recordOwnerNames(context),
    workspaceTimeZone(context),
  ]);

  const zone = resolveTimeZone(storedZone);
  /*
   * The same rule the first page uses: §162.1 decides which names this
   * reader is given at all, so an id with no name is a colleague they may
   * not see rather than a gap to fill in.
   */
  const nameOf = (userProfileId: string | null) =>
    userProfileId === null
      ? "the system"
      : (owners.get(userProfileId) ?? "a team member");

  return {
    status: "ok",
    lines: page.entries.map((entry) => {
      const { headline, detail } = describeActivity(
        entry,
        nameOf(entry.actorUserProfileId),
        nameOf,
      );
      return {
        id: entry.id,
        headline,
        detail,
        when: formatWorkspaceMoment(entry.occurredAt, zone),
      };
    }),
    nextCursor: page.nextCursor,
  };
}
