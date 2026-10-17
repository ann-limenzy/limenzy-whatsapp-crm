"use server";

import { revalidatePath } from "next/cache";

import { can } from "@/lib/permissions";
import {
  MAX_SOURCE_NAME,
  MAX_STAGE_NAME,
  parseName,
  type LeadPipelineIssue,
} from "@/lib/validation/lead-pipeline";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import { enabledModulesFor } from "@/server/auth/workspace-modules";
import {
  addLeadSource,
  addLeadStage,
  moveLeadStage,
  renameLeadSource,
  renameLeadStage,
  setLeadSourceActive,
  setLeadStageActive,
  type LeadPipelineWriteResult,
} from "@/server/auth/workspace-lead-pipeline";

/**
 * Lead pipeline and source configuration — spec §34, §164, §165, §172.
 *
 * Two gates, both on the server, both before anything the browser sent is
 * read:
 *
 *   1. **Authorization.** §171 routes Settings through §162, where
 *      "Configure CRM Settings" is Owner/Admin. The role comes from the
 *      membership this request re-resolved, never from a form field.
 *   2. **The module.** §172: "Lead Assignment and Pipeline configuration are
 *      available only when Leads is enabled", and §30 hides the whole module
 *      when Lead Management is off. A Server Action is reachable by anyone who
 *      can POST to it, so hiding the section is presentation and this is the
 *      gate.
 *
 * The database re-derives the Owner/Admin requirement from stored rows for
 * every statement, so neither check is the only thing standing in the way.
 */

export type LeadPipelineState = {
  readonly status:
    | "idle"
    | "ok"
    | "invalid"
    | "name_taken"
    | "cannot_move"
    | "refused"
    | "forbidden"
    | "module_disabled"
    | "stale"
    | "unavailable";
  /** Which row the outcome concerns, so a screen can place it. */
  readonly targetId?: string;
  readonly issue?: LeadPipelineIssue;
  readonly attempt: number;
};

const RENDERED_WORKSPACE_FIELD = "renderedWorkspaceId";

const text = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Authorization, then the module, then the workspace the form was rendered for. */
async function authorise(formData: FormData) {
  const { context, role, workspaceId } = await requireWorkspaceContext();

  if (!can({ role, action: "configure_crm_settings" })) {
    return { ok: false as const, status: "forbidden" as const };
  }

  const { enabled } = await enabledModulesFor(context);
  if (!enabled.has("leads")) {
    return { ok: false as const, status: "module_disabled" as const };
  }

  /*
   * Fails closed. A submission that cannot say which workspace it was
   * rendered for is exactly the one that must not reconfigure whichever
   * workspace the preference cookie happens to name now.
   */
  if (text(formData, RENDERED_WORKSPACE_FIELD) !== workspaceId) {
    return { ok: false as const, status: "stale" as const };
  }

  return { ok: true as const, context };
}

/** Translate a gateway result into the screen's vocabulary. */
function settle(
  result: LeadPipelineWriteResult,
  attempt: number,
  targetId?: string,
): LeadPipelineState {
  if (result.ok) {
    revalidatePath("/settings");
    return { status: "ok", targetId, attempt };
  }
  const status =
    result.reason === "name_taken"
      ? "name_taken"
      : result.reason === "cannot_move"
        ? "cannot_move"
        : result.reason === "refused"
          ? "refused"
          : result.reason === "not_permitted"
            ? "forbidden"
            : "unavailable";
  return { status, targetId, attempt };
}

async function withName(
  previous: LeadPipelineState,
  formData: FormData,
  max: number,
  /*
   * The context type is inferred from a gateway rather than imported: an
   * action receives a context and must never be able to mint one, which the
   * import boundary enforces by refusing `@/server/db/tenant-context` here.
   */
  run: (
    context: Parameters<typeof addLeadStage>[0],
    name: string,
  ) => Promise<LeadPipelineWriteResult>,
): Promise<LeadPipelineState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const parsed = parseName(formData.get("name"), max);
  if (!parsed.ok) return { status: "invalid", issue: parsed.issue, attempt };

  return settle(await run(gate.context, parsed.value), attempt);
}

export async function addLeadStageAction(
  previous: LeadPipelineState,
  formData: FormData,
): Promise<LeadPipelineState> {
  return withName(previous, formData, MAX_STAGE_NAME, addLeadStage);
}

export async function addLeadSourceAction(
  previous: LeadPipelineState,
  formData: FormData,
): Promise<LeadPipelineState> {
  return withName(previous, formData, MAX_SOURCE_NAME, addLeadSource);
}

export async function renameLeadStageAction(
  previous: LeadPipelineState,
  formData: FormData,
): Promise<LeadPipelineState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const id = text(formData, "stageId");
  if (!UUID.test(id)) return { status: "invalid", attempt };

  const parsed = parseName(formData.get("name"), MAX_STAGE_NAME);
  if (!parsed.ok) {
    return { status: "invalid", issue: parsed.issue, targetId: id, attempt };
  }

  return settle(
    await renameLeadStage(gate.context, id, parsed.value),
    attempt,
    id,
  );
}

export async function renameLeadSourceAction(
  previous: LeadPipelineState,
  formData: FormData,
): Promise<LeadPipelineState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const id = text(formData, "sourceId");
  if (!UUID.test(id)) return { status: "invalid", attempt };

  const parsed = parseName(formData.get("name"), MAX_SOURCE_NAME);
  if (!parsed.ok) {
    return { status: "invalid", issue: parsed.issue, targetId: id, attempt };
  }

  return settle(
    await renameLeadSource(gate.context, id, parsed.value),
    attempt,
    id,
  );
}

export async function moveLeadStageAction(
  previous: LeadPipelineState,
  formData: FormData,
): Promise<LeadPipelineState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const id = text(formData, "stageId");
  const direction = text(formData, "direction");
  if (!UUID.test(id) || (direction !== "up" && direction !== "down")) {
    return { status: "invalid", attempt };
  }

  return settle(await moveLeadStage(gate.context, id, direction), attempt, id);
}

export async function setLeadStageActiveAction(
  previous: LeadPipelineState,
  formData: FormData,
): Promise<LeadPipelineState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const id = text(formData, "stageId");
  if (!UUID.test(id)) return { status: "invalid", attempt };

  return settle(
    await setLeadStageActive(
      gate.context,
      id,
      text(formData, "isActive") === "true",
    ),
    attempt,
    id,
  );
}

export async function setLeadSourceActiveAction(
  previous: LeadPipelineState,
  formData: FormData,
): Promise<LeadPipelineState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const id = text(formData, "sourceId");
  if (!UUID.test(id)) return { status: "invalid", attempt };

  return settle(
    await setLeadSourceActive(
      gate.context,
      id,
      text(formData, "isActive") === "true",
    ),
    attempt,
    id,
  );
}
