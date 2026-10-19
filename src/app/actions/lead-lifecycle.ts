"use server";

import { revalidatePath } from "next/cache";

import {
  parseActivityNote,
  parseLead,
  parseLostOutcome,
  type LeadProblem,
} from "@/lib/validation/leads";
import {
  acknowledgementIsValid,
  issueDuplicateAcknowledgement,
} from "@/server/auth/lead-duplicate-acknowledgement";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import {
  addLeadNote,
  changeLeadStage,
  describeForActor,
  editLead,
  markLeadLost,
  markLeadWon,
  reopenLead,
  type DuplicateWarning,
  type LeadChangeResult,
} from "@/server/auth/workspace-leads";
import { enabledModulesFor } from "@/server/auth/workspace-modules";
import {
  permissionFor,
  workspacePermissionSettings,
} from "@/server/auth/workspace-permissions";

/**
 * Editing a Lead, moving it, and its history — spec §28, §37, §39, §45, §48,
 * §130.1, §162, §162.1.
 *
 * Three gates on every one of these, all server-side, all before anything
 * the browser sent is used: the Leads module, §162's
 * `edit_permitted_records`, and the workspace the form was rendered for.
 *
 * **There is no new permission here.** §162 carries no row for changing a
 * stage or adding a note; the nearest is `edit_permitted_records`, which it
 * grants to all three roles. Whether this actor may touch THIS Lead is
 * §162.1, and that is decided by the row-level policies rather than restated
 * here. Inventing two matrix rows would have been inventing product rules.
 *
 * **No confirmations.** §28 lists "save standard field edits" and "add note"
 * among the actions that must NOT ask, and prefers Undo afterwards to a
 * dialog in front.
 */

export type LifecycleState = {
  readonly status:
    | "idle"
    | "ok"
    | "invalid"
    | "duplicate"
    | "stale"
    | "stage_unavailable"
    | "outcome_missing"
    | "refused"
    | "forbidden"
    | "module_disabled"
    | "workspace_stale"
    | "unavailable";
  readonly problems?: readonly LeadProblem[];
  readonly issue?: string;
  readonly duplicates?: DuplicateWarning;
  readonly acknowledgement?: string;
  readonly mayOverride?: boolean;
  readonly attempt: number;
};

const RENDERED_WORKSPACE_FIELD = "renderedWorkspaceId";

const text = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorise(formData: FormData) {
  const { context, role, workspaceId } = await requireWorkspaceContext();

  const { enabled } = await enabledModulesFor(context);
  if (!enabled.has("leads")) {
    return { ok: false as const, status: "module_disabled" as const };
  }

  const settings = await workspacePermissionSettings(context);
  if (!permissionFor(settings, role, "edit_permitted_records").allowed) {
    return { ok: false as const, status: "forbidden" as const };
  }

  if (text(formData, RENDERED_WORKSPACE_FIELD) !== workspaceId) {
    return { ok: false as const, status: "workspace_stale" as const };
  }

  const leadId = text(formData, "leadId");
  if (!UUID.test(leadId)) {
    return { ok: false as const, status: "forbidden" as const };
  }

  /*
   * §130.1 keeps Create Anyway with Manager and Owner/Admin. An edit that
   * collides with another Lead is the same decision as a creation that does.
   */
  const mayOverride = permissionFor(
    settings,
    role,
    "create_anyway_after_duplicate_warning",
  ).allowed;

  return { ok: true as const, context, workspaceId, leadId, mayOverride };
}

/** The revision the form was rendered with. Absent or malformed is stale. */
function revisionFrom(formData: FormData): number | null {
  const raw = text(formData, "revision");
  if (!/^[0-9]{1,9}$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function settle(
  result: LeadChangeResult,
  attempt: number,
  extras: { mayOverride?: boolean; acknowledgement?: string } = {},
): LifecycleState {
  if (result.ok) {
    revalidatePath("/leads");
    return { status: "ok", attempt };
  }
  if (result.reason === "duplicate") {
    return {
      status: "duplicate",
      duplicates: describeForActor(result.candidates),
      acknowledgement: extras.acknowledgement,
      mayOverride: extras.mayOverride,
      attempt,
    };
  }
  const status =
    result.reason === "not_permitted"
      ? "forbidden"
      : result.reason === "stale"
        ? "stale"
        : result.reason === "stage_unavailable"
          ? "stage_unavailable"
          : result.reason === "outcome_missing"
            ? "outcome_missing"
            : result.reason === "refused"
              ? "refused"
              : "unavailable";
  return { status, attempt };
}

export async function editLeadAction(
  previous: LifecycleState,
  formData: FormData,
): Promise<LifecycleState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const revision = revisionFrom(formData);
  if (revision === null) return { status: "stale", attempt };

  const parsed = parseLead({
    name: text(formData, "name"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    notes: text(formData, "notes"),
    // The edit form does not move the stage; the detail screen does.
    stageId: text(formData, "stageId"),
    sourceId: text(formData, "sourceId"),
  });
  if (!parsed.ok) {
    return { status: "invalid", problems: parsed.problems, attempt };
  }

  const requested = text(formData, "override") === "true";
  const acknowledged =
    requested &&
    gate.mayOverride &&
    acknowledgementIsValid(
      gate.workspaceId,
      gate.context.userProfileId,
      gate.leadId,
      parsed.value,
      text(formData, "acknowledgement"),
    );

  const explanation = text(formData, "overrideExplanation").trim();
  const result = await editLead(
    gate.context,
    gate.leadId,
    revision,
    parsed.value,
    {
      override: acknowledged,
      overrideExplanation:
        explanation.length > 0 ? explanation.slice(0, 1000) : null,
    },
  );
  return settle(result, attempt, {
    mayOverride: gate.mayOverride,
    acknowledgement: issueDuplicateAcknowledgement(
      gate.workspaceId,
      gate.context.userProfileId,
      gate.leadId,
      parsed.value,
    ),
  });
}

export async function changeLeadStageAction(
  previous: LifecycleState,
  formData: FormData,
): Promise<LifecycleState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };
  const revision = revisionFrom(formData);
  if (revision === null) return { status: "stale", attempt };

  const stageId = text(formData, "stageId");
  if (!UUID.test(stageId)) return { status: "stage_unavailable", attempt };

  return settle(
    await changeLeadStage(gate.context, gate.leadId, revision, stageId),
    attempt,
  );
}

export async function markLeadWonAction(
  previous: LifecycleState,
  formData: FormData,
): Promise<LifecycleState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };
  const revision = revisionFrom(formData);
  if (revision === null) return { status: "stale", attempt };

  return settle(
    await markLeadWon(gate.context, gate.leadId, revision),
    attempt,
  );
}

export async function markLeadLostAction(
  previous: LifecycleState,
  formData: FormData,
): Promise<LifecycleState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };
  const revision = revisionFrom(formData);
  if (revision === null) return { status: "stale", attempt };

  const outcome = parseLostOutcome({
    reason: text(formData, "lostReason"),
    note: text(formData, "lostReasonNote"),
  });
  if (!outcome.ok) {
    return { status: "invalid", issue: outcome.issue, attempt };
  }

  return settle(
    await markLeadLost(gate.context, gate.leadId, revision, {
      reason: outcome.reason,
      note: outcome.note,
    }),
    attempt,
  );
}

export async function reopenLeadAction(
  previous: LifecycleState,
  formData: FormData,
): Promise<LifecycleState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };
  const revision = revisionFrom(formData);
  if (revision === null) return { status: "stale", attempt };

  const stageId = text(formData, "stageId");
  if (!UUID.test(stageId)) return { status: "stage_unavailable", attempt };

  return settle(
    await reopenLead(gate.context, gate.leadId, revision, stageId),
    attempt,
  );
}

export async function addLeadNoteAction(
  previous: LifecycleState,
  formData: FormData,
): Promise<LifecycleState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const note = parseActivityNote(text(formData, "note"));
  if (!note.ok) return { status: "invalid", issue: note.issue, attempt };

  return settle(
    await addLeadNote(gate.context, gate.leadId, note.note),
    attempt,
  );
}
