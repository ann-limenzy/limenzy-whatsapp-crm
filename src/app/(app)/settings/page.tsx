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
import { SalesTeamSettings } from "@/components/settings/sales-team-settings";
import { MEMBERS_PER_PAGE, pageOf, parsePageParam } from "@/lib/member-list";
import { CONFIGURABLE_PERMISSIONS, can } from "@/lib/permissions";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import { workspaceMembers } from "@/server/auth/workspace-members";
import {
  assignableTeamMembers,
  salesTeamMembers,
  salesTeams,
} from "@/server/auth/workspace-sales-teams";
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

  /*
   * §163.12's administrative surface. Every Sales Team row in §162 is a fixed
   * Owner/Admin "Yes"; a Manager's is Decision required (§163.18 #5), which
   * `can` denies, and Staff/Sales is No. Asking the matrix rather than the
   * role means that the day decision 5 is approved and configured, this line
   * does not have to change to honour it.
   *
   * No module condition. §172 gates Lead Assignment configuration on the
   * Leads module; Sales Teams are the workspace's people structure, and
   * hiding them when Leads is off would hide membership history with them.
   */
  const mayManageTeams = can({ role, action: "access_settings_sales_teams" });
  /*
   * Read for either surface, like the member list below: §159 shows a user's
   * Sales Team beside their role on the Users screen, which is a different
   * §162 row from managing teams. Both are Owner/Admin today; if §163.18
   * decision 5 ever separates them, the Users column must not silently become
   * a column of dashes.
   */
  const [teamList, teamMemberships, teamCandidates] =
    mayManageTeams || can({ role, action: "manage_users" })
      ? await Promise.all([
          salesTeams(context),
          salesTeamMembers(context),
          assignableTeamMembers(context),
        ])
      : [[], [], []];

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
  /*
   * Read for either surface. Both gates are Owner/Admin today, but they are
   * DIFFERENT §162 rows — if §163.18 decision 5 is ever approved, a Manager
   * could reach Sales Teams without reaching Users, and a team roster with
   * no names is not a roster. The addresses below stay behind `manage_users`.
   */
  const allMembers =
    mayManageUsers || mayManageTeams ? await workspaceMembers(context) : [];
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
  /*
   * §159 shows a user's Sales Team beside their role. Built from the two
   * reads this page already made, so the Users section costs no extra query
   * — and resolves to null for a workspace where no team has been created,
   * which is a fact about the person rather than about the feature.
   */
  const teamNameById = new Map(teamList.map((team) => [team.id, team.name]));
  const teamOf = new Map(
    teamMemberships.map((member) => [
      member.userProfileId,
      {
        name: teamNameById.get(member.salesTeamId) ?? null,
        isTeamLead: member.isTeamLead,
      },
    ]),
  );

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
    salesTeamName: teamOf.get(member.userProfileId)?.name ?? null,
    isTeamLead: teamOf.get(member.userProfileId)?.isTeamLead ?? false,
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

      {mayManageTeams ? (
        <section aria-labelledby="teams-heading" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="teams-heading" className="text-lg font-semibold">
              Sales Teams
            </h2>
            <p className="text-sm text-muted-foreground">
              Groups of salespeople, who leads each one, and who is in it.
            </p>
          </div>
          <SalesTeamSettings
            workspaceId={workspaceId}
            teams={teamList.map((team) => ({
              id: team.id,
              name: team.name,
              description: team.description,
              status: team.status,
              teamLeadUserProfileId: team.teamLeadUserProfileId,
              activeMemberCount: team.activeMemberCount,
              members: teamMemberships
                .filter((member) => member.salesTeamId === team.id)
                .map((member) => ({
                  userProfileId: member.userProfileId,
                  isTeamLead: member.isTeamLead,
                })),
            }))}
            candidates={teamCandidates.map((person) => ({
              userProfileId: person.userProfileId,
              currentTeamId: person.currentTeamId,
              currentTeamName: person.currentTeamName,
              currentMembershipId: person.currentMembershipId,
              leadsActiveTeam: person.leadsActiveTeam,
            }))}
            /* Names only, from the membership list this page already read.
               No address and no auth identifier crosses to the browser. */
            names={Object.fromEntries(
              allMembers.map((member) => [
                member.userProfileId,
                member.fullName,
              ]),
            )}
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
