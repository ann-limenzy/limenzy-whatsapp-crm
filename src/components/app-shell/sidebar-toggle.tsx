"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useSidebarState } from "@/components/app-shell/use-sidebar-state";
import { cn } from "@/lib/utils";

/**
 * Desktop sidebar collapse control.
 *
 * Rendered only inside the persistent desktop sidebar — never in the tablet
 * drawer or the mobile bottom bar, where the preference has no meaning.
 *
 * The sidebar only ever collapses because someone pressed this. Nothing about
 * the current route, the page content or the viewport collapses it on the
 * user's behalf.
 *
 * Both icons are rendered and swapped with CSS on the same `data-sidebar`
 * attribute the width uses, so the correct icon is painted in the first frame.
 * The accessible name and `aria-expanded` come from React state, which
 * reconciles immediately after hydration.
 */
export function SidebarToggle({ className }: { className?: string }) {
  const { isCollapsed, toggle } = useSidebarState();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!isCollapsed}
      aria-controls="app-sidebar"
      aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      data-testid="sidebar-toggle"
      className={cn(
        // 40x40 minimum target.
        "inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground",
        className,
      )}
    >
      <PanelLeftClose
        className="sidebar-when-expanded size-[18px]"
        aria-hidden="true"
      />
      <PanelLeftOpen
        className="sidebar-when-collapsed size-[18px]"
        aria-hidden="true"
      />
    </button>
  );
}
