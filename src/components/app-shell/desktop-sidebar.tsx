import { NavList } from "@/components/app-shell/nav-list";
import { SidebarToggle } from "@/components/app-shell/sidebar-toggle";
import { LimenzyLogo } from "@/components/brand/limenzy-logo";

/**
 * Persistent desktop sidebar (spec §3).
 *
 * Flush to the viewport and full height, separated from the content column by
 * a single hairline rather than a floating frame. Glass tier: the ambient
 * field reads through the panel.
 *
 * Width comes from `--sidebar-w`, which the `data-sidebar` attribute on <html>
 * switches between the expanded and rail values. The same variable drives the
 * content offset in AppShell, so the two cannot drift apart, and the width is
 * already correct in the first painted frame.
 *
 * Visible from `lg` up; below that the same navigation is reached through the
 * drawer, and on phones additionally through the bottom bar.
 */
export function DesktopSidebar() {
  return (
    <aside
      id="app-sidebar"
      className="surface-glass fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col overflow-hidden rounded-none border-y-0 border-l-0 transition-[width] duration-200 ease-out lg:flex"
      data-testid="desktop-sidebar"
    >
      <div className="flex h-16 shrink-0 items-center px-4">
        <LimenzyLogo variant="adaptive" />
      </div>

      <div className="flex-1 overflow-x-hidden overflow-y-auto px-3 pb-4">
        <NavList collapsible />
      </div>

      <div className="flex shrink-0 items-center justify-end border-t border-border/70 px-3 py-3 [[data-sidebar='collapsed']_&]:justify-center">
        <SidebarToggle />
      </div>
    </aside>
  );
}
