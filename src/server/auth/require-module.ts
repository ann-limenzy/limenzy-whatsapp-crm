import "server-only";

import { notFound } from "next/navigation";

import { resolveFollowUpsVisibility } from "@/config/navigation";
import type { ModuleKey } from "@/lib/modules";
import {
  requireWorkspaceContext,
  type WorkspaceAccess,
} from "./require-workspace";
import { enabledModulesFor } from "./workspace-modules";

/**
 * Resolve the workspace, then refuse the route if its module is disabled.
 *
 * **Hiding navigation is not enforcement.** §171 says disabling a module
 * "hides its normal navigation and entry points"; §172 adds that it "prevents
 * new activity belonging to that module". A link that is not rendered is still
 * a URL anyone can type, so every module route calls this for itself rather
 * than trusting the shell not to have offered it.
 *
 * This runs in the page, not only the layout, for the same reason the
 * workspace gate does: a layout is not re-executed for client-side navigation
 * between sibling routes, so a layout-only check can be stale by the time the
 * page renders.
 *
 * `notFound()` rather than a dedicated screen: a disabled module should look
 * like a route that is not part of this workspace, and a distinct error would
 * confirm to anyone probing URLs which modules a workspace runs.
 *
 * What this does NOT decide: whether the user may perform any action within
 * the module. That is the §162 permission matrix and §162.1 record access, in
 * `@/lib/permissions`, which this neither consults nor replaces.
 */
export async function requireModule(
  module: ModuleKey,
): Promise<WorkspaceAccess> {
  const access = await requireWorkspaceContext();
  const { enabled } = await enabledModulesFor(access.context);
  if (!enabled.has(module)) notFound();
  return access;
}

/**
 * The combined Follow-ups screen — spec §43, and the approved interpretation
 * recorded in `resolveFollowUpsVisibility`.
 *
 * It draws on two sources, so it stays reachable while EITHER Leads or
 * Customer Follow-ups is enabled, and is refused only when neither is. Using
 * `requireModule("customer_followups")` here would hide the screen from a
 * workspace that still has Lead follow-ups, which the navigation rule
 * deliberately does not do.
 */
export async function requireFollowUpsModule(): Promise<WorkspaceAccess> {
  const access = await requireWorkspaceContext();
  const { enabled } = await enabledModulesFor(access.context);
  if (!resolveFollowUpsVisibility(enabled)) notFound();
  return access;
}
