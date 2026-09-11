"use client";

import { useSyncExternalStore } from "react";

import {
  DEFAULT_SIDEBAR_STATE,
  readAppliedSidebarState,
  setSidebarState,
  subscribeToSidebarState,
  toggleSidebarState,
  type SidebarState,
} from "@/lib/sidebar-preference";

/**
 * Subscribe to the desktop sidebar preference.
 *
 * `useSyncExternalStore` rather than state-in-an-effect: the server snapshot is
 * the default, React hydrates against it, then immediately reconciles with the
 * real value already applied to <html> by the pre-paint script. That avoids a
 * hydration mismatch without the `setState` in `useEffect` pattern (which
 * `react-hooks/set-state-in-effect` rejects) and without a visible flash — the
 * *width* never depended on React in the first place, only on CSS reading the
 * `data-sidebar` attribute.
 */
export function useSidebarState(): {
  state: SidebarState;
  isCollapsed: boolean;
  toggle: () => void;
} {
  const state = useSyncExternalStore(
    subscribeToSidebarState,
    readAppliedSidebarState,
    () => DEFAULT_SIDEBAR_STATE,
  );

  return {
    state,
    isCollapsed: state === "collapsed",
    toggle: () => setSidebarState(toggleSidebarState(state)),
  };
}
