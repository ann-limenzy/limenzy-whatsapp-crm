"use server";

import { revalidatePath } from "next/cache";

import { can } from "@/lib/permissions";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import {
  addOrTransferTeamMember,
  createSalesTeam,
  deactivateSalesTeam,
  designateTeamLead,
  reactivateSalesTeam,
  removeTeamMember,
  renameSalesTeam,
  type SalesTeamChangeResult,
} from "@/server/auth/workspace-sales-teams";

/**
 * Settings → Sales Teams — spec §162, §163.1–§163.4, §163.12, §163.18.
 *
 * Two gates, both on the server, both before anything the browser sent is
 * read:
 *
 *   1. **Authorization.** §162 makes every Sales Team administration row a
 *      fixed Owner/Admin "Yes". A Manager's cell is **Decision required
 *      (§163.18 #5)** and `evaluatePermission` denies it; a Staff/Sales cell
 *      is No. None of that is restated here — the actions ask the matrix, so
 *      the day decision 5 is approved and configured, this code does not have
 *      to change to honour it.
 *   2. **The workspace the form was rendered for**, so a preference cookie
 *      changed in another tab cannot reconfigure a different workspace.
 *
 * There is **no module gate**. §172 gates Lead Assignment configuration on
 * the Leads module; Sales Teams are a workspace's people structure, §163.12
 * lists them under Settings without a module condition, and gating them on
 * Leads would make a team disappear — along with its membership history —
 * the moment Lead Management was switched off.
 *
 * The database re-derives Owner/Admin from stored rows, twice per routine,
 * so neither check here is the only thing standing in the way.
 *
 * **No eligibility, no My Team, no assignment.** §163.5–§163.9 are Milestone
 * 5 and nothing here writes toward them.
 */

export type SalesTeamState = {
  readonly status:
    | "idle"
    | "ok"
    /** The name is blank, too long, or the description is too long. */
    | "invalid"
    | "name_taken"
    /** Another team in this workspace already has that name, or a race lost. */
    | "conflict"
    /** The person already belongs to a team and no transfer was confirmed. */
    | "transfer_not_confirmed"
    /** The confirmed source membership is no longer the one they hold. */
    | "source_changed"
    /** §163.4: they lead an active team; replace or deactivate it first. */
    | "leads_source_team"
    /** §163.3: they lead this team; designate a replacement first. */
    | "is_team_lead"
    /** §163.12: the team has no active Team Lead to activate it with. */
    | "team_lead_required"
    /** §163.12: an active member is no longer an active workspace user. */
    | "inactive_members"
    | "not_a_member"
    | "already_in_this_team"
    | "already_team_lead"
    | "unknown_team"
    | "unknown_member"
    | "member_not_active"
    | "forbidden"
    | "stale"
    | "unavailable";
  /** Which team the outcome concerns, so a screen can place it. */
  readonly targetId?: string;
  /**
   * Set when the person already belongs to a team and the administrator has
   * not confirmed moving them. The screen names the team and asks; §163.4
   * forbids a silent transfer.
   */
  readonly pendingTransfer?: {
    readonly userProfileId: string;
    readonly salesTeamId: string;
    /**
     * What the administrator had already typed, carried back so the
     * confirmation can restate it. Without this the creation form asks them
     * to type the team name a second time, and pressing the confirm button
     * as it stands fails validation on an empty name — a confirmation step
     * that loses the thing being confirmed.
     */
    readonly name?: string;
    readonly description?: string;
  };
  readonly attempt: number;
};

const RENDERED_WORKSPACE_FIELD = "renderedWorkspaceId";

const text = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
};

const flag = (data: FormData, key: string): boolean =>
  text(data, key) === "true";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const uuidOrNull = (value: string): string | null =>
  UUID.test(value) ? value : null;

/** Authorization, then the workspace the form was rendered for. */
async function authorise(formData: FormData) {
  const { context, role, workspaceId } = await requireWorkspaceContext();

  /*
   * Four §162 rows cover this screen. They are asked together because the
   * screen is one surface: an actor who may not access it has no business
   * reaching any action behind it, whichever button they POST to.
   */
  const permitted =
    can({ role, action: "access_settings_sales_teams" }) &&
    can({ role, action: "manage_sales_teams" }) &&
    can({ role, action: "manage_team_members" }) &&
    can({ role, action: "designate_or_replace_team_lead" });

  if (!permitted) return { ok: false as const, status: "forbidden" as const };

  /* Fails closed: a submission that cannot say which workspace it was
     rendered for must not reconfigure whichever one the cookie names now. */
  if (text(formData, RENDERED_WORKSPACE_FIELD) !== workspaceId) {
    return { ok: false as const, status: "stale" as const };
  }

  return { ok: true as const, context };
}

/** Translate a gateway result into the screen's vocabulary. */
function settle(
  result: SalesTeamChangeResult,
  attempt: number,
  targetId?: string,
  pending?: SalesTeamState["pendingTransfer"],
): SalesTeamState {
  if (result.ok) {
    revalidatePath("/settings");
    return { status: "ok", targetId: result.teamId ?? targetId, attempt };
  }

  switch (result.reason) {
    case "not_permitted":
      return { status: "forbidden", targetId, attempt };
    case "invalid_name":
    case "name_too_long":
    case "description_too_long":
      return { status: "invalid", targetId, attempt };
    case "transfer_not_confirmed":
      /* The one refusal that is a QUESTION rather than a failure: the screen
         names the team they are in now and asks before moving them. */
      return {
        status: "transfer_not_confirmed",
        targetId,
        pendingTransfer: pending,
        attempt,
      };
    case "name_taken":
    case "conflict":
    case "source_changed":
    case "leads_source_team":
    case "is_team_lead":
    case "team_lead_required":
    case "inactive_members":
    case "not_a_member":
    case "already_in_this_team":
    case "already_team_lead":
    case "unknown_team":
    case "unknown_member":
    case "member_not_active":
      return { status: result.reason, targetId, attempt };
    default:
      return { status: "unavailable", targetId, attempt };
  }
}

export async function createSalesTeamAction(
  previous: SalesTeamState,
  formData: FormData,
): Promise<SalesTeamState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const leadId = uuidOrNull(text(formData, "teamLeadUserProfileId"));
  if (leadId === null) return { status: "invalid", attempt };

  const result = await createSalesTeam(gate.context, {
    name: text(formData, "name"),
    description: text(formData, "description"),
    teamLeadUserProfileId: leadId,
    confirmTransfer: flag(formData, "confirmTransfer"),
    expectedSourceMembershipId: uuidOrNull(
      text(formData, "expectedSourceMembershipId"),
    ),
  });

  return settle(result, attempt, undefined, {
    userProfileId: leadId,
    salesTeamId: "",
    name: text(formData, "name"),
    description: text(formData, "description"),
  });
}

export async function renameSalesTeamAction(
  previous: SalesTeamState,
  formData: FormData,
): Promise<SalesTeamState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const teamId = uuidOrNull(text(formData, "salesTeamId"));
  if (teamId === null) return { status: "invalid", attempt };

  const result = await renameSalesTeam(gate.context, teamId, {
    name: text(formData, "name"),
    description: text(formData, "description"),
  });
  return settle(result, attempt, teamId);
}

export async function addTeamMemberAction(
  previous: SalesTeamState,
  formData: FormData,
): Promise<SalesTeamState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const teamId = uuidOrNull(text(formData, "salesTeamId"));
  const userId = uuidOrNull(text(formData, "userProfileId"));
  if (teamId === null || userId === null) {
    return { status: "invalid", attempt };
  }

  const result = await addOrTransferTeamMember(gate.context, {
    salesTeamId: teamId,
    userProfileId: userId,
    confirmTransfer: flag(formData, "confirmTransfer"),
    expectedSourceMembershipId: uuidOrNull(
      text(formData, "expectedSourceMembershipId"),
    ),
  });

  return settle(result, attempt, teamId, {
    userProfileId: userId,
    salesTeamId: teamId,
  });
}

export async function removeTeamMemberAction(
  previous: SalesTeamState,
  formData: FormData,
): Promise<SalesTeamState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const teamId = uuidOrNull(text(formData, "salesTeamId"));
  const userId = uuidOrNull(text(formData, "userProfileId"));
  if (teamId === null || userId === null) {
    return { status: "invalid", attempt };
  }

  const result = await removeTeamMember(gate.context, teamId, userId);
  return settle(result, attempt, teamId);
}

export async function designateTeamLeadAction(
  previous: SalesTeamState,
  formData: FormData,
): Promise<SalesTeamState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const teamId = uuidOrNull(text(formData, "salesTeamId"));
  const userId = uuidOrNull(text(formData, "userProfileId"));
  if (teamId === null || userId === null) {
    return { status: "invalid", attempt };
  }

  const result = await designateTeamLead(gate.context, teamId, userId);
  return settle(result, attempt, teamId);
}

export async function setSalesTeamActiveAction(
  previous: SalesTeamState,
  formData: FormData,
): Promise<SalesTeamState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const teamId = uuidOrNull(text(formData, "salesTeamId"));
  if (teamId === null) return { status: "invalid", attempt };

  /*
   * Two different operations behind one control, deliberately NOT one toggle.
   * §163.12: reactivation "is a guarded configuration workflow, not a single
   * toggle" — it validates and refuses, where deactivation always proceeds.
   * The screen offers whichever applies; the server decides which it ran.
   */
  const result = flag(formData, "active")
    ? await reactivateSalesTeam(gate.context, teamId)
    : await deactivateSalesTeam(gate.context, teamId);

  return settle(result, attempt, teamId);
}
