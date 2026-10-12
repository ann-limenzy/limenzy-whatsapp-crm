import type { ReactNode } from "react";

import { DesktopSidebar } from "@/components/app-shell/desktop-sidebar";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { TopBar } from "@/components/app-shell/top-bar";
import type { AuthenticatedUser } from "@/server/auth/require-user";
import type { WorkspaceRole } from "@/server/db/identity";

/**
 * Authenticated application shell (spec §3, §4, §25).
 *
 * Layout is identical in both themes — only token values change.
 *
 * Responsive behaviour:
 *   < md   phones   : drawer navigation + bottom bar
 *   md–lg  tablets  : drawer navigation, no bottom bar
 *   >= lg  desktop  : persistent sidebar, collapsible to a rail
 *
 * The content column is offset by `--sidebar-w`, the same variable the sidebar
 * is sized from, so collapsing the sidebar releases that space to the top bar
 * and the page automatically — there is no second copy of the width to keep in
 * step.
 *
 * The ambient gradient is painted here, once, via `app-ambient`. No feature
 * component carries a gradient of its own.
 */
export function AppShell({
  user,
  workspaceName,
  role,
  children,
}: {
  /** Resolved on the server by the `(app)` layout. Never read from the browser. */
  user: AuthenticatedUser;
  /**
   * The current workspace's name, read under its own tenant context. Display
   * only — `null` when the row became unreadable, which the next request's
   * workspace gate turns into a redirect.
   */
  workspaceName: string | null;
  /**
   * The role from the membership row, for presentation. Never an authorization
   * decision: hiding a control is not a permission check, and row-level
   * security re-checks the membership on every statement regardless.
   */
  role: WorkspaceRole;
  children: ReactNode;
}) {
  return (
    <div className="app-ambient min-h-dvh">
      <DesktopSidebar />

      <div className="transition-[padding] duration-200 ease-out lg:ps-[var(--sidebar-w)]">
        <TopBar user={user} workspaceName={workspaceName} role={role} />

        {/* Bottom padding clears the fixed mobile bar and its safe-area inset;
            removed once the bar is hidden at `md`. */}
        <main className="px-4 pt-6 pb-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom)+1.5rem)] sm:px-6 md:pb-10">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
