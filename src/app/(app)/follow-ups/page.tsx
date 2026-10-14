import { CalendarCheck } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/data/module-placeholder";
import { requireFollowUpsModule } from "@/server/auth/require-module";

export const metadata: Metadata = { title: "Follow-ups" };

/**
 * The workspace gate runs HERE, not only in the `(app)` layout: a layout is
 * not re-executed for every client-side navigation between sibling routes, so
 * a layout-only check can be stale by the time this page renders. It resolves
 * identity and active membership from the database, uncached, every request.
 *
 * This placeholder reads no tenant data yet. When it does, the read goes
 * through `withTenant(context, …)` — and any future write resolves the
 * workspace of the RECORD it touches inside that context, never from the saved
 * preference, so a cookie changed in another tab cannot redirect an older
 * form's write into a different workspace.
 */
export default async function FollowUpsPage() {
  await requireFollowUpsModule();

  return (
    <ModulePlaceholder
      icon={CalendarCheck}
      title="Follow-ups"
      description="One work list combining lead and customer follow-ups across Today, Upcoming, Overdue and Completed, with complete and reschedule actions."
      specSections="§43–§44"
      milestone="Milestone 4"
    />
  );
}
