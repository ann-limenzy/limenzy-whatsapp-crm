import { Settings } from "lucide-react";
import type { Metadata } from "next";

import { countryOptions } from "@/lib/workspace-options";
import { ModulePlaceholder } from "@/components/data/module-placeholder";
import { BusinessSettingsForm } from "@/components/settings/business-settings-form";
import { ModuleSettingsForm } from "@/components/settings/module-settings-form";
import { UserSettingsList } from "@/components/settings/user-settings-list";
import { PermissionSettingsForm } from "@/components/settings/permission-settings-form";
import { CONFIGURABLE_PERMISSIONS, can } from "@/lib/permissions";
import { requireUser } from "@/server/auth/require-user";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import { workspaceMembers } from "@/server/auth/workspace-members";
import { businessSettingsFor } from "@/server/auth/workspace-business-settings";
import {
  CONFIGURABLE_MODULES,
  enabledModulesFor,
} from "@/server/auth/workspace-modules";
import { workspacePermissionSettings } from "@/server/auth/workspace-permissions";

export const metadata: Metadata = { title: "Settings" };

/**
 * The workspace gate runs HERE, not only in the `(app)` layout: a layout is
 * not re-executed for every client-side navigation between sibling routes, so
 * a layout-only check can be stale by the time this page renders. It resolves
 * identity and active membership from the database, uncached, every request.
 *
 * Every tenant read below goes through `withTenant(context, …)`, and the
 * Server Actions behind these forms re-resolve the membership and re-check the
 * role themselves. Hiding a section here is presentation, never the gate.
 */
export default async function SettingsPage() {
  const { context, role, workspaceId } = await requireWorkspaceContext();
  // §171 routes this through §162: configuring the CRM is Owner/Admin only.
  const mayConfigure = can({ role, action: "configure_crm_settings" });

  const { enabled, usingDefaults } = await enabledModulesFor(context);
  const permissions = await workspacePermissionSettings(context);
  // Read only when it will be rendered — a Manager or Staff member has no use
  // for these values and no reason for the request to fetch them.
  const business = mayConfigure ? await businessSettingsFor(context) : null;

  // §162 makes Manage Users a fixed Owner/Admin "Yes" — a different action
  // from configuring the CRM, so it is asked separately rather than assumed
  // to travel with it.
  const mayManageUsers = can({ role, action: "manage_users" });
  const members = mayManageUsers ? await workspaceMembers(context) : [];
  // The signed-in person's own address, from their verified session. The CRM
  // cannot read anyone else's — see the note the list renders.
  const signedInEmail = mayManageUsers ? (await requireUser()).email : null;

  return (
    <div className="grid gap-8">
      {mayConfigure ? (
        <section aria-labelledby="business-heading" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="business-heading" className="text-lg font-semibold">
              Business Settings
            </h2>
            <p className="text-sm text-muted-foreground">
              Your business details, and the country, currency and time zone the
              CRM works in. Spec §158.
            </p>
          </div>
          {business ? (
            <BusinessSettingsForm
              settings={business}
              workspaceId={workspaceId}
              countries={countryOptions()}
            />
          ) : (
            /* The workspace row was not readable in this context. Reported
               rather than papered over with empty fields, which would invite a
               save that replaced real details with blanks. */
            <p className="text-sm text-danger-on-subtle">
              These settings are not available right now. Nothing has been
              changed.
            </p>
          )}
        </section>
      ) : null}

      {mayManageUsers ? (
        <section aria-labelledby="users-heading" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="users-heading" className="text-lg font-semibold">
              Users
            </h2>
            <p className="text-sm text-muted-foreground">
              Everyone with a membership of this workspace, their role and
              whether they are active. Spec §159, §160.
            </p>
          </div>
          <UserSettingsList
            members={members}
            workspaceId={workspaceId}
            signedInEmail={signedInEmail}
          />
        </section>
      ) : null}

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

      {mayConfigure ? (
        <section aria-labelledby="permissions-heading" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="permissions-heading" className="text-lg font-semibold">
              Roles &amp; Permissions
            </h2>
            <p className="text-sm text-muted-foreground">
              The permission cells this workspace may decide, and Manager record
              visibility. Spec §162, §162.1.
            </p>
          </div>
          <PermissionSettingsForm
            configurable={CONFIGURABLE_PERMISSIONS}
            granted={[...permissions.granted]}
            isConfigured={permissions.isConfigured}
            managerRecordScope={permissions.managerRecordScope}
          />
        </section>
      ) : null}

      <ModulePlaceholder
        icon={Settings}
        title="Settings"
        description="Workspace administration still to come: inviting people, pipeline, products and services, custom fields and reminder defaults."
        specSections="§163–§170, §173–§174"
        milestone="Milestone 2"
      />
    </div>
  );
}
