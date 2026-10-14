import { Settings } from "lucide-react";
import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/data/module-placeholder";
import { ModuleSettingsForm } from "@/components/settings/module-settings-form";
import { can } from "@/lib/permissions";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import {
  CONFIGURABLE_MODULES,
  enabledModulesFor,
} from "@/server/auth/workspace-modules";

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
  const { context, role } = await requireWorkspaceContext();
  const { enabled, usingDefaults } = await enabledModulesFor(context);
  // §171 routes this through §162: configuring the CRM is Owner/Admin only.
  // The Server Action re-checks the same thing — this only decides whether to
  // render controls that would be refused anyway.
  const mayConfigure = can({ role, action: "configure_crm_settings" });

  return (
    <div className="grid gap-8">
      {mayConfigure ? (
        <section aria-labelledby="modules-heading" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="modules-heading" className="text-lg font-semibold">
              Modules &amp; Features
            </h2>
            <p className="text-sm text-muted-foreground">
              Choose which modules this workspace uses. Spec §171, §172.
            </p>
          </div>
          <ModuleSettingsForm
            modules={CONFIGURABLE_MODULES}
            enabled={[...enabled]}
            usingDefaults={usingDefaults}
          />
        </section>
      ) : null}

      <ModulePlaceholder
        icon={Settings}
        title="Settings"
        description="Workspace administration: business settings, users, roles and permissions, pipeline, products and services, custom fields, reminder defaults and modules."
        specSections="§157–§174"
        milestone="Milestone 2"
      />
    </div>
  );
}
