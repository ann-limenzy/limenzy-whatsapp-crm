import type { ReactNode } from "react";

import { DesktopSidebar } from "@/components/app-shell/desktop-sidebar";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { TopBar } from "@/components/app-shell/top-bar";

/**
 * Authenticated application shell (spec §3, §4, §25).
 *
 * Layout is identical in both themes — only token values change.
 *
 * Responsive behaviour:
 *   < md   phones   : drawer navigation + bottom bar
 *   md–lg  tablets  : drawer navigation, no bottom bar
 *   >= lg  desktop  : persistent sidebar
 *
 * The ambient gradient is painted here, once, via `app-ambient`. No feature
 * component carries a gradient of its own.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-ambient min-h-dvh">
      <DesktopSidebar />

      <div className="lg:ps-[264px]">
        <TopBar />

        {/* Bottom padding clears the mobile bar; removed once it is hidden. */}
        <main className="px-4 pt-6 pb-24 sm:px-6 md:pb-10">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
