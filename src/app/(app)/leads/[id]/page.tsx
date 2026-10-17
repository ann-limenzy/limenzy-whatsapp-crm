import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LeadDetailView } from "@/components/leads/lead-detail-view";
import { requireModule } from "@/server/auth/require-module";
import { leadDetail, recordOwnerNames } from "@/server/auth/workspace-leads";

export const metadata: Metadata = { title: "Lead" };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Lead Detail — §35.
 *
 * **A Lead this person may not access is `notFound()`, not "forbidden".**
 * §162.1 decides visibility, and the policy already returns no row; saying
 * "you are not allowed to see this" would confirm that a Lead with this id
 * exists in this workspace, which is a disclosure in itself. The same answer
 * is given for an id that was never a Lead at all.
 */
export default async function LeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { context } = await requireModule("leads");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const lead = await leadDetail(context, id);
  if (!lead) notFound();

  const owners = await recordOwnerNames(context);
  const ownerName = lead.isOwnedByActor
    ? "You"
    : (owners.get(lead.recordOwnerUserProfileId) ?? "Another team member");
  const createdByName =
    lead.createdByUserProfileId === context.userProfileId
      ? "you"
      : (owners.get(lead.createdByUserProfileId) ?? "another team member");

  /*
   * Formatted on the server with a fixed locale and the UTC time zone. A
   * date rendered from the browser's locale differs between the server pass
   * and the client pass, which React reports as a hydration mismatch.
   */
  const createdOn = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(lead.createdAt);

  return (
    <LeadDetailView
      lead={lead}
      ownerName={ownerName}
      createdByName={createdByName}
      createdOn={createdOn}
    />
  );
}
