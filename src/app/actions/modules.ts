"use server";

import { revalidatePath } from "next/cache";

import { isModuleKey } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import { setModuleEnabled } from "@/server/auth/workspace-modules";

/**
 * Enable or disable one workspace module — spec §171, §172.
 *
 * §171: "Disabling and re-enabling a module are Owner/Admin actions (Section
 * 162)." That role check happens **here, on the server**, from the membership
 * row this request resolved — never from a form field, a cookie or anything
 * the browser sent.
 *
 * Four independent layers have to agree before the column changes, and none of
 * them substitutes for the others:
 *
 *   1. `requireWorkspaceContext()` — an active membership, re-resolved for
 *      this request, uncached;
 *   2. the §162 permission matrix, consulted through `can()`, which is the
 *      same policy the rest of the product will use;
 *   3. the §172 dependency rules, applied inside the transaction against the
 *      configuration the write lands on;
 *   4. row-level security and the column-scoped UPDATE grant, which permit
 *      this write only for an active owner_admin of the selected workspace.
 *
 * Layer 2 is deliberately not the last word: a Server Action is reachable by
 * anyone who can POST to it, so the database re-checks regardless.
 */

export type ModuleActionState =
  | { readonly status: "idle" }
  | { readonly status: "ok"; readonly enabled: readonly string[] }
  /** §172 requires the change to be blocked with an explanation. */
  | { readonly status: "blocked"; readonly message: string }
  | { readonly status: "forbidden" }
  | { readonly status: "unavailable" }
  | { readonly status: "invalid" };

export async function setModuleEnabledAction(
  _prev: ModuleActionState,
  formData: FormData,
): Promise<ModuleActionState> {
  // Named `moduleKey`, not `module`: Next.js reserves the bare identifier.
  const moduleKey = formData.get("module");
  const enable = formData.get("enable");
  if (typeof moduleKey !== "string" || !isModuleKey(moduleKey)) {
    return { status: "invalid" };
  }
  if (enable !== "true" && enable !== "false") return { status: "invalid" };

  const { context, role } = await requireWorkspaceContext();

  // §171 routes this through §162: configuring the CRM is Owner/Admin only.
  if (!can({ role, action: "configure_crm_settings" })) {
    return { status: "forbidden" };
  }

  const result = await setModuleEnabled(context, moduleKey, enable === "true");

  if (result.ok) {
    // Navigation is rendered from this configuration, so the shell must be
    // re-rendered rather than served from the client router cache.
    revalidatePath("/", "layout");
    return { status: "ok", enabled: result.enabled };
  }

  switch (result.reason) {
    case "refused":
      return { status: "blocked", message: result.refusal.message };
    case "unknown_module":
      return { status: "invalid" };
    case "not_configurable":
      // Either row-level security refused the write, or the column is not
      // there yet. Both mean "this workspace cannot be configured from here",
      // and neither is distinguished to the caller.
      return { status: "unavailable" };
  }
}
