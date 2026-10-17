import { Settings } from "lucide-react";
import type { Metadata } from "next";

import { countryOptions } from "@/lib/workspace-options";
import { isEmailConfigured } from "@/lib/env";
import { formatInvitationExpiry } from "@/lib/invitation-display";
import { ModulePlaceholder } from "@/components/data/module-placeholder";
import { BusinessSettingsForm } from "@/components/settings/business-settings-form";
import { ModuleSettingsForm } from "@/components/settings/module-settings-form";
import { InvitationSettings } from "@/components/settings/invitation-settings";
import { LeadPipelineSettings } from "@/components/settings/lead-pipeline-settings";
import { UserSettingsList } from "@/components/settings/user-settings-list";
import { PermissionSettingsForm } from "@/components/settings/permission-settings-form";
import { MEMBERS_PER_PAGE, pageOf, parsePageParam } from "@/lib/member-list";
import { CONFIGURABLE_PERMISSIONS, can } from "@/lib/permissions";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import { workspaceMembers } from "@/server/auth/workspace-members";
import { pendingInvitations } from "@/server/auth/workspace-invitations";
import { leadSources, leadStages } from "@/server/auth/workspace-lead-pipeline";
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

  /*
   * §172: "Lead Assignment and Pipeline configuration are available only when
   * Leads is enabled", and §30 hides the whole module when Lead Management is
   * off. Read only when it will be rendered, and the Server Actions behind
   * these controls re-check the same thing — hiding a section is presentation.
   */
  const leadsEnabled = mayConfigure && enabled.has("leads");
  const stages = leadsEnabled ? await leadStages(context) : [];
  const sources = leadsEnabled ? await leadSources(context) : [];
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
  // Same gate, same reason: a Manager has no business reading who has been
  // invited, and the policies behind this would refuse them anyway.
  const invitations = mayManageUsers ? await pendingInvitations(context) : [];

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
              CRM works in.
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
              Everyone who can use this workspace, their role, and whether their
              access is switched on.
            </p>
          </div>
          <UserSettingsList
            members={rows}
            workspaceId={workspaceId}
            emailStatus={lookup?.status ?? "ok"}
            paging={paging}
          />

          <div className="grid gap-1 pt-2">
            <h3 className="text-base font-semibold">Invitations</h3>
            <p className="text-sm text-muted-foreground">
              Invite someone by creating a link and sending it to them.
            </p>
          </div>
          <InvitationSettings
            workspaceId={workspaceId}
            /* Resolved on the server: the browser is never asked whether this
               deployment can send mail, and the buttons only promise to send
               when something can. */
            emailEnabled={isEmailConfigured()}
            invitations={invitations.map((invitation) => ({
              id: invitation.id,
              email: invitation.email,
              role: invitation.role,
              invitedName: invitation.invitedName,
              expiresLabel: formatInvitationExpiry(
                invitation.expiresAt,
                business?.timeZone ?? "UTC",
              ),
              isExpired: invitation.isExpired,
            }))}
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
              Choose which modules this workspace uses.
            </p>
          </div>
          <ModuleSettingsForm
            modules={CONFIGURABLE_MODULES}
            enabled={[...enabled]}
            usingDefaults={usingDefaults}
          />
        </section>
      ) : null}

      {leadsEnabled ? (
        <section aria-labelledby="leads-heading" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="leads-heading" className="text-lg font-semibold">
              Leads
            </h2>
            <p className="text-sm text-muted-foreground">
              The stages a lead moves through, and where your leads come from.
            </p>
          </div>
          <LeadPipelineSettings
            stages={stages.map((stage) => ({
              id: stage.id,
              name: stage.name,
              kind: stage.kind,
              isActive: stage.isActive,
            }))}
            sources={sources.map((source) => ({
              id: source.id,
              name: source.name,
              isActive: source.isActive,
            }))}
            workspaceId={workspaceId}
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
              Choose what Managers and Staff can do, and which records a Manager
              can see.
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
        description="Workspace administration still to come: products and services, custom fields and reminder defaults."
      />
    </div>
  );
}
