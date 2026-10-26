"use server";

import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import {
  leadActivity,
  leadDetail,
  recordOwnerNames,
  type LeadActivityEntry,
  type LeadDetail,
} from "@/server/auth/workspace-leads";
import { enabledModulesFor } from "@/server/auth/workspace-modules";

/**
 * What the Lead List's Quick Preview needs, for ONE Lead.
 *
 * A read, and only a read. The list already carries name, stage, owner and
 * contact for every row; the preview adds the two things it does not — the
 * Lead's standing description and the top of its §39 timeline — and fetching
 * those for every row of every list would be a page of work to show a panel
 * that is usually never opened.
 *
 * **No new authorization lives here.** It calls the same `leadDetail()` and
 * `leadActivity()` gateways the Lead Detail route uses, so §162.1's row
 * policies decide what comes back exactly as they do there. A Lead this
 * actor may not access, or one that has been deleted, returns the same
 * `null` — which is the answer the detail route gives too, and the only
 * honest one: saying "you may not see this" would confirm it exists.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type QuickViewLead = {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly phoneNormalised: string | null;
  readonly email: string | null;
  readonly stageName: string;
  readonly stageKind: LeadDetail["stageKind"];
  readonly sourceName: string | null;
  readonly ownerName: string;
  readonly createdAt: Date;
  readonly notes: string | null;
  /** Newest first, already trimmed to what the panel shows. */
  readonly recent: readonly LeadActivityEntry[];
  /** Profile id to display name, for the entries above. */
  readonly actorNames: Readonly<Record<string, string>>;
};

export async function leadQuickView(
  leadId: string,
): Promise<QuickViewLead | null> {
  if (!UUID.test(leadId)) return null;

  const { context } = await requireWorkspaceContext();

  /* §30: the module gate, the same one the Lead routes apply. */
  const { enabled } = await enabledModulesFor(context);
  if (!enabled.has("leads")) return null;

  const lead = await leadDetail(context, leadId);
  if (!lead) return null;

  const [activity, owners] = await Promise.all([
    leadActivity(context, leadId),
    recordOwnerNames(context),
  ]);

  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    phoneNormalised: lead.phoneNormalised,
    email: lead.email,
    stageName: lead.stageName,
    stageKind: lead.stageKind,
    sourceName: lead.sourceName,
    ownerName: lead.isOwnedByActor
      ? "You"
      : (owners.get(lead.recordOwnerUserProfileId) ?? "Another team member"),
    createdAt: lead.createdAt,
    notes: lead.notes,
    /* Three is what the panel has room for without becoming the timeline. */
    recent: activity.slice(0, 3),
    actorNames: Object.fromEntries(owners),
  };
}
