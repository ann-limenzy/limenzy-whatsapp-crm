import { AppShell } from "@/components/app-shell/app-shell";
import { requireUser } from "@/server/auth/require-user";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import { enabledModulesFor } from "@/server/auth/workspace-modules";
import { workspaceNameFor } from "@/server/auth/workspace-names";

/**
 * Layout for every in-application route.
 *
 * Two server-side checks run here on every request: `requireUser()` resolves
 * identity from the verified access token, and `requireWorkspaceContext()`
 * resolves an active membership and the workspace this request may act in.
 * Neither is cached.
 *
 * **This is not the authorization boundary.** It is one of several checks:
 *
 *   * every page beneath it calls `requireWorkspaceContext()` itself, because
 *     a layout is not re-executed for each client-side navigation between
 *     sibling routes, so a layout-only check can be stale by the time a page
 *     renders;
 *   * every Server Action re-checks independently, because Next.js warns that
 *     proxy coverage can be removed silently by a matcher change;
 *   * and PostgreSQL row-level security re-checks the membership on every
 *     statement, using the context this resolution issues.
 *
 * The workspace name is read for display only, through the same authorised
 * tenant path as everything else. The role travels no further than the shell,
 * which uses it for presentation; no component decides access from it.
 *
 * Account surfaces — `/setup`, `/select-workspace`, `/no-access` — deliberately
 * live outside this group, under `(account)`. They exist to answer "which
 * workspace?" and so cannot require an answer to it.
 */

/**
 * Every route beneath this layout renders per-user content behind an
 * authentication check, so none of it may be prerendered into static HTML.
 * Stated explicitly rather than relying on implicit `cookies()` detection.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const { context, role } = await requireWorkspaceContext();
  const workspaceName = await workspaceNameFor(context);
  // §171: navigation shows only the workspace's enabled modules. Read through
  // the same authorised tenant path as the name, uncached, every request.
  const { enabled } = await enabledModulesFor(context);

  return (
    <AppShell
      user={user}
      workspaceName={workspaceName}
      role={role}
      enabledModules={[...enabled]}
    >
      {children}
    </AppShell>
  );
}
