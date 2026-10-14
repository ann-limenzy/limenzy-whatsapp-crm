"use server";

import { revalidatePath } from "next/cache";

import { can, isConfigurablePermission } from "@/lib/permissions";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import {
  setManagerRecordScope,
  setPermissionGranted,
} from "@/server/auth/workspace-permissions";

/**
 * Workspace permission settings — spec §162 and §162.1.
 *
 * Two mutations, both Owner/Admin only. §162 makes "Configure CRM Settings" an
 * Owner/Admin action, and the role is resolved **here, on the server**, from
 * the membership this request re-resolved — never from a form field, a cookie
 * or anything the browser sent. A Server Action is reachable by anyone who can
 * POST to it, so row-level security and the column-scoped UPDATE grant re-check
 * regardless.
 *
 * A "Decision required" cell cannot be granted through either action:
 * `isConfigurablePermission` is derived from the §162 matrix, so a rule whose
 * cell is not Configurable is refused before the database is touched, the
 * column's check constraint refuses it again, and the evaluator would ignore
 * the stored value even then.
 */

export type PermissionActionState =
  | { readonly status: "idle" }
  | { readonly status: "ok" }
  | { readonly status: "forbidden" }
  | { readonly status: "unavailable" }
  | { readonly status: "invalid" };

/** Grant or revoke one §162 "Configurable" cell. */
export async function setPermissionGrantedAction(
  _prev: PermissionActionState,
  formData: FormData,
): Promise<PermissionActionState> {
  const permission = formData.get("permission");
  const grant = formData.get("grant");
  if (typeof permission !== "string" || !isConfigurablePermission(permission)) {
    return { status: "invalid" };
  }
  if (grant !== "true" && grant !== "false") return { status: "invalid" };

  const { context, role } = await requireWorkspaceContext();
  if (!can({ role, action: "configure_crm_settings" })) {
    return { status: "forbidden" };
  }

  const result = await setPermissionGranted(
    context,
    permission,
    grant === "true",
  );
  if (result.ok) {
    revalidatePath("/settings");
    return { status: "ok" };
  }
  return {
    status:
      result.reason === "not_configurable_cell" ? "invalid" : "unavailable",
  };
}

/** Choose the §162.1 Manager record scope. */
export async function setManagerRecordScopeAction(
  _prev: PermissionActionState,
  formData: FormData,
): Promise<PermissionActionState> {
  const scope = formData.get("scope");
  if (typeof scope !== "string") return { status: "invalid" };

  const { context, role } = await requireWorkspaceContext();
  if (!can({ role, action: "configure_crm_settings" })) {
    return { status: "forbidden" };
  }

  const result = await setManagerRecordScope(context, scope);
  if (result.ok) {
    // Record visibility changes what Managers can reach, so the whole tree is
    // revalidated rather than the settings page alone.
    revalidatePath("/", "layout");
    return { status: "ok" };
  }
  return {
    status: result.reason === "unknown_scope" ? "invalid" : "unavailable",
  };
}
