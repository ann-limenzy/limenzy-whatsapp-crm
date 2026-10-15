import { Settings } from "lucide-react";
import type { Metadata } from "next";

import { countryOptions } from "@/lib/workspace-options";
import { ModulePlaceholder } from "@/components/data/module-placeholder";
import { BusinessSettingsForm } from "@/components/settings/business-settings-form";
import { ModuleSettingsForm } from "@/components/settings/module-settings-form";
import { UserSettingsList } from "@/components/settings/user-settings-list";
import { PermissionSettingsForm } from "@/components/settings/permission-settings-form";
import { MEMBERS_PER_PAGE, pageOf, parsePageParam } from "@/lib/member-list";
import { CONFIGURABLE_PERMISSIONS, can } from "@/lib/permissions";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import { workspaceMembers } from "@/server/auth/workspace-members";
import { businessSettingsFor } from "@/server/auth/workspace-business-settings";
import { emailsForAuthUsers } from "@/server/auth/member-emails";
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
export default async function SettingsPage(props: PageProps<"/settings">) {
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

  /*
   * §159, in the order that matters.
   *
   * 1. `manage_users` is checked FIRST, so an unauthorised caller never
   *    reaches the Auth Admin credential at all.
   * 2. The members come from the workspace-scoped database routine, which
   *    re-derives Owner/Admin from stored rows and returns only this
   *    workspace's rows.
   * 3. Only then are addresses looked up, and only for the ids THAT ROUTINE
   *    returned, for the page actually being displayed. The lookup is handed
   *    ids and nothing else — it has no workspace to check them against, so
   *    where they come from is the whole of its safety.
   */
  const allMembers = mayManageUsers ? await workspaceMembers(context) : [];
  const { items: pageMembers, ...paging } = pageOf(
    allMembers,
    parsePageParam((await props.searchParams).users),
    MEMBERS_PER_PAGE,
  );
  const lookup = mayManageUsers
    ? await emailsForAuthUsers(
        pageMembers
          .map((member) => member.authUserId)
          .filter((id): id is string => id !== null),
      )
    : null;

  /*
   * What crosses to the browser.
   *
   * `authUserId` is deliberately dropped here. The client needs a name, an
   * address, a role and a status; the Auth identifier is a server detail and
   * a test asserts it never appears in the client component's props.
   */
  const rows = pageMembers.map((member) => ({
    userProfileId: member.userProfileId,
    fullName: member.fullName,
    email:
      member.authUserId === null
        ? null
        : (lookup?.emails.get(member.authUserId) ?? null),
    emailResolved:
      member.authUserId === null ||
      (lookup?.emails.has(member.authUserId) ?? false),
    role: member.role,
    status: member.status,
    isSelf: member.isSelf,
  }));

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
            members={rows}
            workspaceId={workspaceId}
            emailStatus={lookup?.status ?? "ok"}
            paging={paging}
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
