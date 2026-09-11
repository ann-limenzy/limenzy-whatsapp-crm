import { NavList } from "@/components/app-shell/nav-list";
import { LimenzyLogo } from "@/components/brand/limenzy-logo";

/**
 * Persistent desktop sidebar (spec §3).
 *
 * Flush to the viewport and full height, separated from the content column by
 * a single hairline rather than a floating frame. Glass tier: the ambient
 * field reads through the panel.
 *
 * Visible from `lg` up; below that the same navigation is reached through the
 * drawer, and on phones additionally through the bottom bar.
 */
export function DesktopSidebar() {
  return (
    <aside
      className="surface-glass fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col rounded-none border-y-0 border-l-0 lg:flex"
      data-testid="desktop-sidebar"
    >
      <div className="flex h-16 shrink-0 items-center px-5">
        <LimenzyLogo />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        <NavList />
      </div>
    </aside>
  );
}
