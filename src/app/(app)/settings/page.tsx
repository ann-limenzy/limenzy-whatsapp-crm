import { Settings } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/data/module-placeholder";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";

export const metadata: Metadata = { title: "Settings" };

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
export default async function SettingsPage() {
  await requireWorkspaceContext();

  return (
    <ModulePlaceholder
      icon={Settings}
      title="Settings"
      description="Workspace administration: business settings, users, roles and permissions, pipeline, products and services, custom fields, reminder defaults and modules."
      specSections="§157–§174"
      milestone="Milestone 2"
    />
  );
}
