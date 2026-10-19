import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LeadDetailView } from "@/components/leads/lead-detail-view";
import {
  formatWorkspaceDate,
  formatWorkspaceMoment,
  resolveTimeZone,
  timeZoneLabel,
} from "@/lib/workspace-time";
import { requireModule } from "@/server/auth/require-module";
import { workspaceTimeZone } from "@/server/auth/workspace-business-settings";
import { leadSources, leadStages } from "@/server/auth/workspace-lead-pipeline";
import {
  leadActivity,
  leadDetail,
  leadForEdit,
  recordOwnerNames,
} from "@/server/auth/workspace-leads";
import {
  permissionFor,
  workspacePermissionSettings,
} from "@/server/auth/workspace-permissions";

export const metadata: Metadata = { title: "Lead" };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Lead Detail — §35, §37, §39.
 *
 * **A Lead this person may not access is `notFound()`, not "forbidden".**
 * §162.1 decides visibility, and the policy already returns no row; saying
 * "you are not allowed to see this" would confirm that a Lead with this id
 * exists in this workspace, which is a disclosure in itself. The same answer
 * is given for an id that was never a Lead at all.
 *
 * The §162 check below decides whether the lifecycle controls are DRAWN. It
 * is not what makes them safe: every action re-runs the same gate on the
 * server, and the row policies decide the rest. Checking here only avoids
 * offering a button whose submission would be refused.
 */
export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { context, role } = await requireModule("leads");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const lead = await leadDetail(context, id);
  if (!lead) notFound();

  const settings = await workspacePermissionSettings(context);
  const canEdit = permissionFor(
    settings,
    role,
    "edit_permitted_records",
  ).allowed;

  const [owners, activity, editable, stages, sources, storedZone] =
    await Promise.all([
      recordOwnerNames(context),
      leadActivity(context, id),
      canEdit ? leadForEdit(context, id) : Promise.resolve(null),
      canEdit ? leadStages(context) : Promise.resolve([]),
      canEdit ? leadSources(context) : Promise.resolve([]),
      workspaceTimeZone(context),
    ]);

  const ownerName = lead.isOwnedByActor
    ? "You"
    : (owners.get(lead.recordOwnerUserProfileId) ?? "Another team member");

  /*
   * Only open, ordinary columns. §45 and §48 say Won and Lost are reached by
   * their own actions, which record a reason and a history entry; offering
   * them in the same list as "Contacted" would let a plain stage move become
   * an outcome without either.
   */
  const activeStages = stages
    .filter((stage) => stage.kind === "active" && stage.isActive)
    .map((stage) => ({ id: stage.id, name: stage.name }));
  const activeSources = sources
    .filter((source) => source.isActive)
    .map((source) => ({ id: source.id, name: source.name }));

  /*
   * Formatted HERE, on the server, in the WORKSPACE's §158 time zone.
   *
   * Two things are being avoided. A date rendered from the browser's locale
   * differs between the server pass and the client pass, which React reports
   * as a hydration mismatch — so the locale and the zone are both fixed. And
   * UTC, which this screen used to print, is nobody's clock: a team in
   * Kolkata reading "04:34" for something they did at 10:04 is being told
   * the wrong hour about their own work.
   *
   * `resolveTimeZone` falls back to UTC only when the stored zone cannot be
   * used by this runtime, and the label below then says UTC — so the reader
   * is never shown an hour without being told which clock it is on.
   */
  const zone = resolveTimeZone(storedZone);

  return (
    <LeadDetailView
      lead={lead}
      editable={editable}
      activity={activity}
      actorNames={Object.fromEntries(owners)}
      stages={activeStages}
      sources={activeSources}
      workspaceId={context.workspaceId}
      ownerName={ownerName}
      createdOn={formatWorkspaceDate(lead.createdAt, zone)}
      formatWhen={(when) => formatWorkspaceMoment(when, zone)}
      timeZoneLabel={timeZoneLabel(lead.createdAt, zone)}
    />
  );
}
