"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
  getWfSidebarServerSnapshot,
  getWfSidebarSnapshot,
  setWfSidebarState,
  subscribeToWfSidebarState,
  toggleWfSidebarState,
  type WfSidebarState,
} from "@/lib/wireframes/sidebar-preference";
import { cn } from "@/lib/utils";

/** The `id` on the wireframe rail, so `aria-controls` has something to name. */
export const WIREFRAME_SIDEBAR_ID = "wireframe-sidebar";

/**
 * Subscribe to the wireframe sidebar preference.
 *
 * `useSyncExternalStore` rather than state-in-an-effect: the server snapshot
 * is the default, React hydrates against it, then reconciles with the stored
 * value immediately. That avoids a hydration mismatch without the `setState`
 * in `useEffect` pattern (which `react-hooks/set-state-in-effect` rejects) and
 * without a visible flash — the *width* never depended on React at all, only
 * on CSS reading the `data-wf-sidebar` attribute the pre-paint script wrote.
 */
export function useWireframeSidebar(): {
  state: WfSidebarState;
  isCollapsed: boolean;
  toggle: () => void;
} {
  const state = useSyncExternalStore(
    subscribeToWfSidebarState,
    getWfSidebarSnapshot,
    getWfSidebarServerSnapshot,
  );

  return {
    state,
    isCollapsed: state === "collapsed",
    toggle: () => setWfSidebarState(toggleWfSidebarState(state)),
  };
}

/**
 * Collapse control for the wireframe rail.
 *
 * Lives inside the rail itself, which is `lg`-and-up only — so it cannot
 * appear over a phone layout, cannot widen one, and cannot compete with the
 * mobile screens' own bottom navigation.
 *
 * Both icons are rendered and swapped by CSS on the same `data-wf-sidebar`
 * attribute the width uses, so the right one is painted in the first frame.
 * The accessible name and `aria-expanded` come from React state, which
 * reconciles immediately after hydration.
 */
export function WireframeSidebarToggle({ className }: { className?: string }) {
  const { isCollapsed, toggle } = useWireframeSidebar();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={!isCollapsed}
      aria-controls={WIREFRAME_SIDEBAR_ID}
      aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      data-testid="wireframe-sidebar-toggle"
      className={cn(
        // 40x40 minimum target, and a focus ring that is visible on glass.
        "inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors",
        "hover:bg-accent/60 hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        className,
      )}
    >
      <PanelLeftClose
        className="wf-sidebar-when-expanded size-[18px]"
        aria-hidden="true"
      />
      <PanelLeftOpen
        className="wf-sidebar-when-collapsed size-[18px]"
        aria-hidden="true"
      />
    </button>
  );
}
