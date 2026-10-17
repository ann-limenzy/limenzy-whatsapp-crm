"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseLead, type LeadProblem } from "@/lib/validation/leads";
import {
  acknowledgementIsValid,
  issueDuplicateAcknowledgement,
} from "@/server/auth/lead-duplicate-acknowledgement";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import { enabledModulesFor } from "@/server/auth/workspace-modules";
import {
  permissionFor,
  workspacePermissionSettings,
} from "@/server/auth/workspace-permissions";
import {
  createLead,
  describeForActor,
  type DuplicateWarning,
  type LeadWriteResult,
} from "@/server/auth/workspace-leads";

/**
 * Lead creation — spec §32, §130.1, §162, §172.
 *
 * Three gates, all on the server, all before anything the browser sent is
 * used:
 *
 *   1. **The module.** §30: "The entire Leads module is hidden when Lead
 *      Management is disabled for the workspace." A Server Action is
 *      reachable by anyone who can POST to it, so hiding the screen is
 *      presentation and this is the gate.
 *   2. **Authorization.** §162's `add_leads_customers`: Owner/Admin and
 *      Manager always, Staff/Sales only where the workspace granted it. The
 *      role comes from the membership this request re-resolved, never from a
 *      form field.
 *   3. **The workspace the form was rendered for**, so a preference cookie
 *      changed in another tab cannot redirect an older form's write.
 *
 * The database re-derives every one of those from stored rows for each
 * statement, so none of these checks is the only thing standing in the way.
 *
 * ## Create Anyway
 *
 * §130.1 restricts the override to Manager and Owner/Admin, and §162 carries
 * it as `create_anyway_after_duplicate_warning`. The check is HERE, not in
 * the component that decides whether to draw the button: a Staff/Sales user
 * who posts `override=true` is refused with the duplicate warning they would
 * have seen anyway, not with a different story.
 */

export type LeadActionState = {
  readonly status:
    | "idle"
    | "ok"
    | "invalid"
    | "duplicate"
    | "stage_unavailable"
    | "refused"
    | "forbidden"
    | "module_disabled"
    | "stale"
    | "unavailable";
  readonly problems?: readonly LeadProblem[];
  /**
   * §32's matching record(s), reduced to what §162.1 lets this actor learn.
   *
   * This object is SERIALISED TO THE BROWSER by `useActionState`, so what it
   * carries is what the person can read out of the response — not merely what
   * the component chooses to draw. Candidates they may not access are a
   * COUNT here and nothing more: no id, no matched field, nothing that would
   * confirm which record it is.
   */
  readonly duplicates?: DuplicateWarning;
  /**
   * Proof that this warning was shown, posted back with Create Anyway.
   *
   * Bound to the workspace, the actor and a fingerprint of this exact
   * submission, so it cannot be reused for a different person, a different
   * workspace, or changed data. It says nothing about the candidates.
   */
  readonly acknowledgement?: string;
  /** Whether this actor may offer Create Anyway at all (§130.1, §162). */
  readonly mayOverride?: boolean;
  readonly leadId?: string;
  readonly attempt: number;
};

const RENDERED_WORKSPACE_FIELD = "renderedWorkspaceId";

const text = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
};

async function authorise(formData: FormData) {
  const { context, role, workspaceId } = await requireWorkspaceContext();

  const { enabled } = await enabledModulesFor(context);
  if (!enabled.has("leads")) {
    return { ok: false as const, status: "module_disabled" as const };
  }

  /*
   * The workspace's §162 configuration, read once. `permissionFor` is what
   * turns a Configurable cell into an answer: an unconfigured workspace
   * supplies no toggle at all and the cell denies, because "not configured"
   * and "deliberately off" are different facts and neither is a grant.
   */
  const settings = await workspacePermissionSettings(context);
  if (!permissionFor(settings, role, "add_leads_customers").allowed) {
    return { ok: false as const, status: "forbidden" as const };
  }

  if (text(formData, RENDERED_WORKSPACE_FIELD) !== workspaceId) {
    return { ok: false as const, status: "stale" as const };
  }

  const mayOverride = permissionFor(
    settings,
    role,
    "create_anyway_after_duplicate_warning",
  ).allowed;

  return { ok: true as const, context, role, workspaceId, mayOverride };
}

/**
 * Translate a gateway result into the screen's vocabulary.
 *
 * §32: "Save Lead creates the Lead and opens the Lead Detail screen." The
 * navigation happens HERE rather than in an effect on the client, because the
 * two ways of doing it raced: `revalidatePath` re-renders the list underneath
 * a `router.push`, and which one won depended on timing. A server redirect
 * has no such race — it is the response.
 */
function settle(
  result: LeadWriteResult,
  attempt: number,
  mayOverride: boolean,
  issued?: string,
): LeadActionState {
  if (result.ok) {
    revalidatePath("/leads");
    redirect(`/leads/${result.leadId}`);
  }
  if (result.reason === "duplicate") {
    return {
      status: "duplicate",
      duplicates: describeForActor(result.candidates),
      acknowledgement: issued,
      mayOverride,
      attempt,
    };
  }
  const status =
    result.reason === "stage_unavailable"
      ? "stage_unavailable"
      : result.reason === "not_permitted"
        ? "forbidden"
        : result.reason === "refused"
          ? "refused"
          : "unavailable";
  return { status, attempt };
}

export async function addLeadAction(
  previous: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const parsed = parseLead({
    name: text(formData, "name"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    notes: text(formData, "notes"),
    stageId: text(formData, "stageId"),
    sourceId: text(formData, "sourceId"),
  });
  if (!parsed.ok) {
    return { status: "invalid", problems: parsed.problems, attempt };
  }

  /*
   * §130.1 restricts the override to Manager and Owner/Admin — and §32 has it
   * follow a WARNING. Two separate things, and both are required here:
   *
   *   * the permission, re-derived from the membership this request resolved,
   *     never from the form;
   *   * an acknowledgement this server issued, for this actor, in this
   *     workspace, for exactly this submission. A posted flag on its own is a
   *     browser's claim that a warning happened, not evidence that one did.
   *
   * A request failing either is treated as a request that did not ask: it
   * gets the ordinary warning — with a fresh acknowledgement — which is the
   * truthful answer, and the one a CHANGED submission deserves, because the
   * fingerprint it is bound to no longer matches.
   */
  const requested = text(formData, "override") === "true";
  const acknowledged =
    requested &&
    gate.mayOverride &&
    acknowledgementIsValid(
      gate.workspaceId,
      gate.context.userProfileId,
      parsed.value,
      text(formData, "acknowledgement"),
    );

  const explanation = text(formData, "overrideExplanation").trim();

  const result = await createLead(gate.context, parsed.value, {
    override: acknowledged,
    overrideExplanation:
      explanation.length > 0 ? explanation.slice(0, 1000) : null,
  });
  return settle(
    result,
    attempt,
    gate.mayOverride,
    issueDuplicateAcknowledgement(
      gate.workspaceId,
      gate.context.userProfileId,
      parsed.value,
    ),
  );
}
