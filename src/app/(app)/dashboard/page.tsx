import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/data/module-placeholder";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";

export const metadata: Metadata = { title: "Dashboard" };

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
export default async function DashboardPage() {
  await requireWorkspaceContext();

  return (
    <ModulePlaceholder
      icon={LayoutDashboard}
      title="Dashboard"
      description="The dashboard will answer “What needs my attention today?” with summary cards, today’s follow-ups, upcoming renewals, the lead pipeline and recent activity. Admin/Manager and Staff see different versions."
      specSections="§15–§25"
      milestone="Milestone 3+"
    />
  );
}
