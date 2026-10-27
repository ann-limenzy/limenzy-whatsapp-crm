import "server-only";

import { withTenant } from "@/server/db/tenant";
import type { TenantContext } from "@/server/db/tenant-context";

/**
 * Settings → Sales Teams data access — spec §163.1–§163.4, §163.12, §163.15.
 *
 * Reads go through `withTenant()` and the row-level policies, which scope
 * every table to the context's workspace. Writes go through the `app.*`
 * routines the Milestone 4 migration defines, because each one spans two or
 * three tables, must re-check authority after its locks are held, and must
 * commit or roll back as a unit. `limenzy_app` holds SELECT on these tables
 * and no INSERT or UPDATE at all, so there is no write path that could skip
 * an invariant.
 *
 * **No workspace parameter anywhere.** The routines read `app.workspace_id`,
 * so there is no argument through which a caller could reach another
 * workspace — the same property the members and business-settings gateways
 * have.
 *
 * **The role is not checked here.** That is the caller's job, from the
 * membership the request resolved. Each routine checks it again, twice — once
 * before its locks and once after — and those are the checks that cannot be
 * bypassed.
 *
 * **Team membership is not a record-access path.** §163.2 is explicit, and
 * nothing in this file reads or joins `leads`. A teammate's Lead is as
 * invisible to a team member as it was before they joined; the §162.1
 * policies decide that and are untouched by this slice.
 */

export type SalesTeamStatus = "active" | "inactive";

export type SalesTeamSummary = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: SalesTeamStatus;
  /** The current Team Lead's profile id, or null for an inactive team. */
  readonly teamLeadUserProfileId: string | null;
  /** Active members, the Team Lead included. */
  readonly activeMemberCount: number;
};

export type SalesTeamMember = {
  /** The membership PERIOD's id — stable, and never reused by a later one. */
  readonly membershipId: string;
  readonly salesTeamId: string;
  readonly userProfileId: string;
  readonly isTeamLead: boolean;
  readonly joinedAt: Date;
};

/** Someone who may be added to a team, and where they are now. */
export type AssignableMember = {
  readonly userProfileId: string;
  /** Their current active team, or null when they are in none. */
  readonly currentTeamId: string | null;
  readonly currentTeamName: string | null;
  /** The membership period a transfer would end. Null when there is none. */
  readonly currentMembershipId: string | null;
  /**
   * True when they lead an ACTIVE team. §163.4 refuses the transfer until a
   * replacement is designated there or that team is deactivated, and the
   * screen says so instead of offering a move that will be refused.
   */
  readonly leadsActiveTeam: boolean;
};

type TeamRow = {
  id: string;
  name: string;
  description: string | null;
  status: SalesTeamStatus;
  team_lead_user_profile_id: string | null;
  active_member_count: number;
};

/** Every team in the workspace, newest last, with its lead and member count. */
export async function salesTeams(
  context: TenantContext,
): Promise<readonly SalesTeamSummary[]> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<TeamRow[]>`
        select t.id, t.name, t.description, t.status::text as status,
               /*
                * The lead is DERIVED from the open period, not stored on the
                * team. One source of truth, and an inactive team — whose
                * periods are all closed — simply reports none.
                */
               (select m.user_profile_id
                  from public.sales_team_lead_periods p
                  join public.sales_team_memberships m
                    on m.workspace_id = p.workspace_id and m.id = p.membership_id
                 where p.workspace_id = t.workspace_id
                   and p.sales_team_id = t.id
                   and p.ended_at is null
                 limit 1) as team_lead_user_profile_id,
               (select count(*)::int
                  from public.sales_team_memberships m
                 where m.workspace_id = t.workspace_id
                   and m.sales_team_id = t.id
                   and m.status = 'active') as active_member_count
          from public.sales_teams t
         order by t.status, lower(t.name), t.id
      `,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    teamLeadUserProfileId: row.team_lead_user_profile_id,
    activeMemberCount: row.active_member_count,
  }));
}

type MemberRow = {
  membership_id: string;
  sales_team_id: string;
  user_profile_id: string;
  is_team_lead: boolean;
  joined_at: Date | string;
};

/** Current members of every team, so one read serves the whole screen. */
export async function salesTeamMembers(
  context: TenantContext,
): Promise<readonly SalesTeamMember[]> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<MemberRow[]>`
        select m.id as membership_id, m.sales_team_id, m.user_profile_id,
               exists (
                 select 1 from public.sales_team_lead_periods p
                  where p.workspace_id = m.workspace_id
                    and p.membership_id = m.id
                    and p.ended_at is null
               ) as is_team_lead,
               m.joined_at
          from public.sales_team_memberships m
         where m.status = 'active'
         order by m.sales_team_id, m.joined_at, m.id
      `,
  );
  return rows.map((row) => ({
    membershipId: row.membership_id,
    salesTeamId: row.sales_team_id,
    userProfileId: row.user_profile_id,
    isTeamLead: row.is_team_lead,
    joinedAt: new Date(row.joined_at),
  }));
}

type AssignableRow = {
  user_profile_id: string;
  current_team_id: string | null;
  current_team_name: string | null;
  current_membership_id: string | null;
  leads_active_team: boolean;
};

/**
 * Active workspace members, each with the team they are in now.
 *
 * Everyone active is listed, not only the teamless. §163.2 allows adding
 * someone who already belongs to a team as an explicit transfer, and a
 * picker that hid them would make a legitimate move look impossible. What
 * the screen must never do is move them without saying so, which is why the
 * current team travels with each row and the confirmation names it.
 */
export async function assignableTeamMembers(
  context: TenantContext,
): Promise<readonly AssignableMember[]> {
  /*
   * The members come from `app.workspace_members()`, NOT from a query against
   * `workspace_memberships`.
   *
   * `limenzy_app`'s only policy on that table is `workspace_memberships_self_select`
   * — a member may read their own row and no one else's, because a co-member
   * policy would have to read the table it guards and PostgreSQL raises 42P17
   * on that. A direct query here therefore returns exactly one row, the
   * actor's, and the picker silently offers the signed-in person alone. The
   * §159 routine is the same one Settings → Users reads, is SECURITY DEFINER,
   * and returns nothing at all unless the caller is an active Owner/Admin.
   *
   * The team columns ARE read directly: `limenzy_app` holds a workspace-scoped
   * SELECT policy on the Sales Team tables, so no routine is needed for them.
   */
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<AssignableRow[]>`
        select w.user_profile_id,
               m.sales_team_id as current_team_id,
               t.name          as current_team_name,
               m.id            as current_membership_id,
               coalesce((
                 select bool_or(lt.status = 'active')
                   from public.sales_team_lead_periods p
                   join public.sales_teams lt
                     on lt.workspace_id = p.workspace_id and lt.id = p.sales_team_id
                  where p.membership_id = m.id
                    and p.ended_at is null
               ), false) as leads_active_team
          from app.workspace_members() w
          left join public.sales_team_memberships m
            on m.user_profile_id = w.user_profile_id
           and m.status = 'active'
          left join public.sales_teams t
            on t.workspace_id = m.workspace_id and t.id = m.sales_team_id
         where w.member_status = 'active'
         order by w.full_name, w.user_profile_id
      `,
  );
  return rows.map((row) => ({
    userProfileId: row.user_profile_id,
    currentTeamId: row.current_team_id,
    currentTeamName: row.current_team_name,
    currentMembershipId: row.current_membership_id,
    leadsActiveTeam: row.leads_active_team,
  }));
}

export type SalesTeamActivityEntry = {
  readonly id: string;
  readonly salesTeamId: string;
  readonly kind:
    | "team_created"
    | "team_renamed"
    | "team_deactivated"
    | "team_reactivated"
    | "member_added"
    | "member_removed"
    | "member_transferred"
    | "team_lead_designated"
    | "team_lead_ended";
  readonly actorUserProfileId: string | null;
  readonly subjectUserProfileId: string | null;
  readonly fromSalesTeamId: string | null;
  readonly toSalesTeamId: string | null;
  readonly detail: string | null;
  readonly occurredAt: Date;
};

/**
 * The administrative history of one team — §163.12, §163.15.
 *
 * Owner/Admin only, by policy rather than by a check here: §162 gives
 * Staff/Sales no row for administrative audit information, and a Manager's is
 * Decision required (§163.18 #5). A reader without the role gets no rows.
 */
export async function salesTeamActivity(
  context: TenantContext,
  salesTeamId: string,
  limit = 50,
): Promise<readonly SalesTeamActivityEntry[]> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<
        {
          id: string;
          sales_team_id: string;
          kind: SalesTeamActivityEntry["kind"];
          actor_user_profile_id: string | null;
          subject_user_profile_id: string | null;
          from_sales_team_id: string | null;
          to_sales_team_id: string | null;
          detail: string | null;
          occurred_at: Date | string;
        }[]
      >`
        select id, sales_team_id, kind::text as kind, actor_user_profile_id,
               subject_user_profile_id, from_sales_team_id, to_sales_team_id,
               detail, occurred_at
          from public.sales_team_activities
         where sales_team_id = ${salesTeamId}::uuid
         order by occurred_at desc, id desc
         limit ${Math.min(Math.max(limit, 1), 200)}
      `,
  );
  return rows.map((row) => ({
    id: row.id,
    salesTeamId: row.sales_team_id,
    kind: row.kind,
    actorUserProfileId: row.actor_user_profile_id,
    subjectUserProfileId: row.subject_user_profile_id,
    fromSalesTeamId: row.from_sales_team_id,
    toSalesTeamId: row.to_sales_team_id,
    detail: row.detail,
    occurredAt: new Date(row.occurred_at),
  }));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Every word a Sales Team routine can answer with.
 *
 * An unrecognised word becomes `unavailable` rather than success. A routine
 * that gained an outcome this build has never heard of is a deployment skew,
 * and the safe reading of that is "something went wrong", never "it worked".
 */
export type SalesTeamChangeReason =
  | "not_permitted"
  | "unknown_team"
  | "unknown_member"
  | "member_not_active"
  | "not_a_member"
  | "already_in_this_team"
  | "already_team_lead"
  | "transfer_not_confirmed"
  | "source_changed"
  | "leads_source_team"
  | "is_team_lead"
  | "team_lead_required"
  | "inactive_members"
  | "invalid_name"
  | "name_taken"
  | "name_too_long"
  | "description_too_long"
  | "conflict"
  | "unavailable";

export type SalesTeamChangeResult =
  | { readonly ok: true; readonly teamId?: string }
  | { readonly ok: false; readonly reason: SalesTeamChangeReason };

const KNOWN: readonly SalesTeamChangeReason[] = [
  "not_permitted",
  "unknown_team",
  "unknown_member",
  "member_not_active",
  "not_a_member",
  "already_in_this_team",
  "already_team_lead",
  "transfer_not_confirmed",
  "source_changed",
  "leads_source_team",
  "is_team_lead",
  "team_lead_required",
  "inactive_members",
  "invalid_name",
  "name_taken",
  "name_too_long",
  "description_too_long",
  "conflict",
];

/**
 * 40001 and 40P01 mean the transaction aborted and nothing was written.
 * Both become `unavailable`, and nothing is retried: an administrative change
 * is not idempotent from the administrator's point of view, and silently
 * re-running one they did not re-request is worse than saying it did not
 * save.
 */
const isConcurrencyAbort = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "40001" || code === "40P01";
};

const toResult = (
  outcome: string | undefined,
  teamId?: string | null,
): SalesTeamChangeResult => {
  if (outcome === "ok") {
    return teamId ? { ok: true, teamId } : { ok: true };
  }
  const known = KNOWN.find((reason) => reason === outcome);
  return { ok: false, reason: known ?? "unavailable" };
};

async function mutate(
  run: () => Promise<{ outcome: string | undefined; teamId?: string | null }>,
): Promise<SalesTeamChangeResult> {
  try {
    const { outcome, teamId } = await run();
    return toResult(outcome, teamId);
  } catch (error) {
    if (isConcurrencyAbort(error)) return { ok: false, reason: "unavailable" };
    throw error;
  }
}

/**
 * Create a team with its first member and first Team Lead — §163.1–§163.4.
 *
 * One transaction. The team, the membership period and the leadership period
 * commit together or not at all, which is the only way §163.1's "every active
 * team has exactly one active Team Lead" can be true at every moment another
 * transaction could observe.
 *
 * `confirmTransfer` and `expectedSourceMembershipId` are how §163.2's "refused,
 * or handled as an explicit transfer" is honoured. Without the confirmation
 * the routine refuses. With it, the source membership the administrator was
 * shown is compared with what is actually there under lock, so a confirmation
 * given about one team can never take effect against another.
 */
export async function createSalesTeam(
  context: TenantContext,
  input: {
    readonly name: string;
    readonly description?: string | null;
    readonly teamLeadUserProfileId: string;
    readonly confirmTransfer?: boolean;
    readonly expectedSourceMembershipId?: string | null;
  },
): Promise<SalesTeamChangeResult> {
  return mutate(async () => {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ outcome: string; team_id: string | null }[]>`
          select outcome, team_id from app.create_sales_team(
            ${input.name},
            ${input.description ?? null},
            ${input.teamLeadUserProfileId}::uuid,
            ${input.expectedSourceMembershipId ?? null}::uuid,
            ${input.confirmTransfer ?? false}
          )
        `,
    );
    return { outcome: rows[0]?.outcome, teamId: rows[0]?.team_id ?? null };
  });
}

/** Rename a team, or change its description — §163.12. */
export async function renameSalesTeam(
  context: TenantContext,
  salesTeamId: string,
  input: { readonly name: string; readonly description?: string | null },
): Promise<SalesTeamChangeResult> {
  return mutate(async () => {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ outcome: string }[]>`
          select app.rename_sales_team(
            ${salesTeamId}::uuid, ${input.name}, ${input.description ?? null}
          ) as outcome
        `,
    );
    return { outcome: rows[0]?.outcome };
  });
}

/**
 * Add someone to a team, or transfer them into it — §163.2, §163.4.
 *
 * The same routine for both, because they are the same decision seen from
 * two sides: whether the person already holds an active membership is a fact
 * the server reads under lock, not something the form asserts.
 */
export async function addOrTransferTeamMember(
  context: TenantContext,
  input: {
    readonly salesTeamId: string;
    readonly userProfileId: string;
    readonly confirmTransfer?: boolean;
    readonly expectedSourceMembershipId?: string | null;
  },
): Promise<SalesTeamChangeResult> {
  return mutate(async () => {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ outcome: string }[]>`
          select app.add_or_transfer_team_member(
            ${input.salesTeamId}::uuid,
            ${input.userProfileId}::uuid,
            ${input.expectedSourceMembershipId ?? null}::uuid,
            ${input.confirmTransfer ?? false}
          ) as outcome
        `,
    );
    return { outcome: rows[0]?.outcome };
  });
}

/** End someone's membership of a team — §163.2. The period stays as history. */
export async function removeTeamMember(
  context: TenantContext,
  salesTeamId: string,
  userProfileId: string,
): Promise<SalesTeamChangeResult> {
  return mutate(async () => {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ outcome: string }[]>`
          select app.remove_team_member(
            ${salesTeamId}::uuid, ${userProfileId}::uuid
          ) as outcome
        `,
    );
    return { outcome: rows[0]?.outcome };
  });
}

/**
 * Designate or replace the Team Lead — §163.3.
 *
 * The outgoing period is closed and a NEW one opened, rather than a flag
 * being moved. That is what lets a team whose leadership changed hands twice
 * during one unbroken membership still show both spells (§163.15).
 */
export async function designateTeamLead(
  context: TenantContext,
  salesTeamId: string,
  userProfileId: string,
): Promise<SalesTeamChangeResult> {
  return mutate(async () => {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ outcome: string }[]>`
          select app.designate_team_lead(
            ${salesTeamId}::uuid, ${userProfileId}::uuid
          ) as outcome
        `,
    );
    return { outcome: rows[0]?.outcome };
  });
}

/**
 * Deactivate a team — §163.1.
 *
 * Ends every active membership and the Team Lead period, and changes no
 * Lead, no Record Owner and no history.
 */
export async function deactivateSalesTeam(
  context: TenantContext,
  salesTeamId: string,
): Promise<SalesTeamChangeResult> {
  return mutate(async () => {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ outcome: string }[]>`
          select app.deactivate_sales_team(${salesTeamId}::uuid) as outcome
        `,
    );
    return { outcome: rows[0]?.outcome };
  });
}

/**
 * Activate a prepared team — §163.12.
 *
 * Guarded, not a toggle: it restores nothing, and refuses unless the team
 * already has exactly one active Team Lead and every active member is an
 * active workspace user. The validation and the activation are one
 * statement's distance apart inside one transaction, so the team is never
 * visible as Active without a lead.
 */
export async function reactivateSalesTeam(
  context: TenantContext,
  salesTeamId: string,
): Promise<SalesTeamChangeResult> {
  return mutate(async () => {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ outcome: string }[]>`
          select app.reactivate_sales_team(${salesTeamId}::uuid) as outcome
        `,
    );
    return { outcome: rows[0]?.outcome };
  });
}
