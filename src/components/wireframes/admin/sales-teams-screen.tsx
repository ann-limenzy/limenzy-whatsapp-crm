"use client";

import {
  CircleAlert,
  Info,
  Plus,
  Route as RouteIcon,
  ShieldCheck,
  UserCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { CrmChrome } from "@/components/wireframes/crm-chrome";
import {
  Breadcrumbs,
  ConceptDialog,
  Consequences,
  NothingSaved,
  RoleChip,
  StatusChip,
  TeamLeadBadge,
  WarningChip,
  buttonClass,
} from "@/components/wireframes/teams/team-parts";
import {
  Avatar,
  Metric,
  Note,
  Panel,
  ScreenHeading,
  TableScroll,
} from "@/components/wireframes/wf-ui";
import { WORKSPACE } from "@/lib/wireframes/mock-data";
import {
  SALES_TEAMS,
  addCandidates,
  initialsOf,
  roleLabel,
  rulesTargeting,
  teamCounts,
  teamLeadOf,
  teamWarning,
  userById,
} from "@/lib/wireframes/sales-teams";
import { cn } from "@/lib/utils";

/**
 * T1 — Sales Teams (Settings → Sales Teams, spec §163.12).
 *
 * The administrative surface: Owner/Admin sees every team, who leads it, how
 * many members are currently receiving automatic Leads, and where assignment
 * is failing. Team Leads do not come here — they use My Team on their phone.
 *
 * Teams exist only to scope automatic Lead assignment (§180): there are no
 * departments, reporting lines or nested teams on this screen.
 */
export function SalesTeamsScreen() {
  const [creating, setCreating] = useState(false);

  const totals = SALES_TEAMS.reduce(
    (acc, team) => {
      const c = teamCounts(team);
      return {
        eligible: acc.eligible + c.eligible,
        members: acc.members + c.active,
        waiting: acc.waiting + team.assignmentRequired,
      };
    },
    { eligible: 0, members: 0, waiting: 0 },
  );

  return (
    <CrmChrome active="settings">
      <div className="flex min-w-0 flex-col gap-5">
        <Breadcrumbs
          items={[
            { label: "Settings", href: "/wireframes/admin/settings" },
            { label: "Sales Teams" },
          ]}
        />

        <ScreenHeading
          title="Sales Teams"
          description={`Teams decide who shares ${WORKSPACE.name}'s automatic Leads. Each Lead assignment rule sends new Leads to exactly one team, and the rotation never leaves that team.`}
          actions={
            <>
              <Link
                href="/wireframes/admin/lead-assignment"
                className={buttonClass("outline")}
              >
                <RouteIcon className="size-4" aria-hidden="true" />
                Lead Assignment
              </Link>
              <button
                type="button"
                onClick={() => setCreating(true)}
                aria-haspopup="dialog"
                className={buttonClass("primary")}
              >
                <Plus className="size-4" aria-hidden="true" />
                Create team
              </button>
            </>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Metric
            label="Active teams"
            value={SALES_TEAMS.filter((t) => t.status === "Active").length}
            caption="Each with exactly one Team Lead"
            icon={UsersRound}
          />
          <Metric
            label="Receiving automatic Leads"
            value={`${totals.eligible} of ${totals.members}`}
            caption="Active members who are eligible"
            icon={UserCheck}
            tone="info"
          />
          <Metric
            label="Assignment Required"
            value={totals.waiting}
            caption="Leads kept, waiting for an owner"
            icon={CircleAlert}
            tone={totals.waiting > 0 ? "danger" : "primary"}
          />
        </div>

        <Panel title="Teams" icon={UsersRound} count={SALES_TEAMS.length}>
          <TableScroll>
            <table className="w-full min-w-[62rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Team
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Team Lead
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-right font-medium"
                  >
                    Active members
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-right font-medium"
                  >
                    Eligible
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-right font-medium"
                  >
                    Paused
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-right font-medium"
                  >
                    Active rules
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Assignment warning
                  </th>
                </tr>
              </thead>
              <tbody>
                {SALES_TEAMS.map((team) => {
                  const lead = teamLeadOf(team);
                  const leadUser = lead ? userById(lead.userId) : null;
                  const c = teamCounts(team);
                  const warning = teamWarning(team);
                  const activeRules = rulesTargeting(team.id).filter(
                    (r) => r.status === "Active",
                  ).length;
                  return (
                    <tr
                      key={team.id}
                      className="border-b border-border/70 align-top last:border-0"
                    >
                      <td className="px-4 py-3">
                        {team.detailHref ? (
                          <Link
                            href={team.detailHref}
                            className="inline-flex min-h-11 flex-col justify-center rounded-md font-semibold text-primary underline-offset-4 hover:underline"
                          >
                            {team.name}
                          </Link>
                        ) : (
                          <span className="flex min-h-11 flex-col justify-center font-semibold text-foreground">
                            {team.name}
                          </span>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          {team.description}
                        </span>
                        {team.detailHref ? null : (
                          <span className="mt-1 block text-[11px] text-muted-foreground/80">
                            Team page not included in this walkthrough
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {leadUser ? (
                          <span className="flex min-h-11 items-center gap-2.5">
                            <Avatar
                              initials={initialsOf(leadUser.name)}
                              size="sm"
                            />
                            <span className="min-w-0">
                              <span className="block font-medium text-foreground">
                                {leadUser.name}
                              </span>
                              <span className="mt-0.5 flex flex-wrap gap-1">
                                <RoleChip label={roleLabel(leadUser.role)} />
                                <TeamLeadBadge />
                              </span>
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex min-h-11 items-center">
                          <StatusChip status={team.status} />
                        </span>
                      </td>
                      <Num value={c.active} />
                      <Num value={c.eligible} emphasise={c.eligible === 0} />
                      <Num value={c.paused} />
                      <Num value={activeRules} />
                      <td className="px-4 py-3">
                        {warning ? (
                          <span className="flex min-h-11 flex-col justify-center gap-1">
                            <WarningChip>{warning}</WarningChip>
                            {team.assignmentRequired > 0 ? (
                              <span className="text-xs text-danger-on-subtle">
                                {team.assignmentRequired} Leads in Assignment
                                Required
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="flex min-h-11 items-center text-xs text-muted-foreground">
                            None
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-3">
          <Note icon={ShieldCheck}>
            <strong className="font-semibold">
              Round robin assigns new Leads only.
            </strong>{" "}
            Customers, Follow-ups, Renewals and WhatsApp conversations are never
            assigned by a team rule.
          </Note>
          <Note icon={Info}>
            <strong className="font-semibold">
              Being in a team is not record access.
            </strong>{" "}
            Members still see only the records their role and ownership allow.
          </Note>
          <Note icon={UsersRound} tone="neutral">
            <strong className="font-semibold">
              Team Leads work from My Team.
            </strong>{" "}
            They pause or restore their own team&apos;s members there, without
            access to Settings. This screen is the Owner/Admin view.
          </Note>
        </div>
      </div>

      <CreateTeamDialog open={creating} onClose={() => setCreating(false)} />
    </CrmChrome>
  );
}

function Num({ value, emphasise }: { value: number; emphasise?: boolean }) {
  return (
    <td
      className={cn(
        "px-3 py-3 text-right tabular-nums",
        emphasise ? "font-semibold text-danger-on-subtle" : "text-foreground",
      )}
    >
      <span className="flex min-h-11 items-center justify-end">{value}</span>
    </td>
  );
}

/* ------------------------------------------------------------- create team */

/**
 * Create team — concept only.
 *
 * Enforces what §163.1–163.3 require before anything could be saved: a name
 * unique in this workspace, members who are existing ACTIVE users with no
 * other active team, and exactly one Team Lead chosen from those members.
 */
function CreateTeamDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ids = useId();
  const [name, setName] = useState("");
  const [members, setMembers] = useState<readonly string[]>([]);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [done, setDone] = useState(false);

  const candidates = addCandidates("new-team");
  const trimmed = name.trim();
  const duplicate = SALES_TEAMS.find(
    (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
  );

  const errors = {
    name: !trimmed
      ? "Enter a team name."
      : duplicate
        ? `${duplicate.name} already exists in this workspace. Team names must be unique.`
        : null,
    members: members.length === 0 ? "Choose at least one active member." : null,
    lead:
      leadId && members.includes(leadId)
        ? null
        : "Choose exactly one Team Lead from the members above.",
  };
  const valid = !errors.name && !errors.members && !errors.lead;

  const reset = () => {
    setName("");
    setMembers([]);
    setLeadId(null);
    setAttempted(false);
    setDone(false);
  };
  const close = () => {
    onClose();
    reset();
  };

  const toggle = (userId: string) => {
    setMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
    if (leadId === userId) setLeadId(null);
  };

  if (done && leadId) {
    return (
      <ConceptDialog
        open={open}
        onClose={close}
        title="Team created — concept"
        footer={
          <button
            type="button"
            onClick={close}
            className={buttonClass("primary")}
          >
            Back to Sales Teams
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">
            <strong className="font-semibold">{trimmed}</strong> would be
            created with {members.length}{" "}
            {members.length === 1 ? "member" : "members"}, led by{" "}
            {userById(leadId).name}.
          </p>
          <Consequences
            items={[
              "Every member starts as Eligible for Lead assignment.",
              "No existing Lead, Customer, Follow-up, Renewal or WhatsApp conversation is reassigned.",
              "The team receives no automatic Leads until a Lead assignment rule targets it.",
            ]}
          />
          <NothingSaved />
        </div>
      </ConceptDialog>
    );
  }

  return (
    <ConceptDialog
      open={open}
      onClose={close}
      title="Create team"
      description="Only existing, active users can join. Each person can belong to one active team."
      footer={
        <>
          <button
            type="button"
            onClick={close}
            className={buttonClass("outline")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setAttempted(true);
              if (valid) setDone(true);
            }}
            className={buttonClass("primary")}
          >
            Create team
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label
            htmlFor={`${ids}-name`}
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Team name
          </label>
          <input
            id={`${ids}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="For example, Travel Insurance Team"
            aria-invalid={attempted && !!errors.name}
            aria-describedby={`${ids}-name-error`}
            className="h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground"
          />
          <p
            id={`${ids}-name-error`}
            className="mt-1 min-h-4 text-xs text-danger-on-subtle"
          >
            {attempted || duplicate ? errors.name : null}
          </p>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
            Members
          </legend>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {candidates.map(({ user, blocked }) => {
              const checked = members.includes(user.id);
              return (
                <li key={user.id}>
                  <label
                    className={cn(
                      "flex min-h-11 items-start gap-3 px-3 py-2",
                      blocked ? "opacity-70" : "cursor-pointer",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!!blocked}
                      onChange={() => toggle(user.id)}
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                        {user.name}
                        <RoleChip label={roleLabel(user.role)} />
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {blocked ?? "Active · not in a team"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {attempted && errors.members ? (
            <p className="mt-1 text-xs text-danger-on-subtle">
              {errors.members}
            </p>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
            Team Lead — exactly one, chosen from the members
          </legend>
          {members.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
              Choose members first. The Team Lead must be an active member of
              this team.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {members.map((id) => (
                <label
                  key={id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3"
                >
                  <input
                    type="radio"
                    name={`${ids}-lead`}
                    checked={leadId === id}
                    onChange={() => setLeadId(id)}
                    className="size-4 accent-primary"
                  />
                  <span className="text-sm text-foreground">
                    {userById(id).name}
                  </span>
                </label>
              ))}
            </div>
          )}
          {attempted && errors.lead ? (
            <p className="mt-1 text-xs text-danger-on-subtle">{errors.lead}</p>
          ) : null}
        </fieldset>

        <Note icon={Info} tone="neutral">
          Team Lead is a responsibility, not a role — the person keeps their
          workspace role. Creating a team reassigns no existing records.
        </Note>
      </div>
    </ConceptDialog>
  );
}
