/**
 * Desktop sidebar collapse preference for the WIREFRAME chrome.
 *
 * Deliberately separate from `@/lib/sidebar-preference`, which belongs to the
 * production shell. The two must not share a key or an attribute: a wireframe
 * is a presentation artefact, and collapsing a rail while demonstrating a
 * workflow to a client must never reach into the real application's stored
 * preferences (nor the reverse). Same technique, different namespace.
 *
 * The single source of truth is `localStorage`; the `data-wf-sidebar`
 * attribute on <html> is how that value reaches CSS. A tiny blocking script
 * applies the attribute before first paint, so the correct rail width is in
 * the very first frame — no expanded-to-collapsed snap after hydration.
 *
 * Presentation only. Nothing here decides what a screen shows or which
 * wireframe exists; a tampered value can change one width and nothing else.
 */

/** Wireframe-specific, as required by the brief. */
export const WF_SIDEBAR_STORAGE_KEY = "wireframe-sidebar-collapsed";

export const WF_SIDEBAR_ATTRIBUTE = "data-wf-sidebar";

export type WfSidebarState = "expanded" | "collapsed";

/** Used when nothing is stored, when storage is unavailable, or on bad input. */
export const DEFAULT_WF_SIDEBAR_STATE: WfSidebarState = "expanded";

/**
 * The key names the collapsed case, so the stored value is a boolean string.
 * Anything other than `"true"` — absent, malformed, a leftover from an older
 * shape — means expanded, which is the safe default on a desktop.
 */
function stateFromStored(value: string | null): WfSidebarState {
  return value === "true" ? "collapsed" : DEFAULT_WF_SIDEBAR_STATE;
}

/**
 * Read the stored preference.
 *
 * Storage access throws outright in some contexts (Safari private mode,
 * embedded webviews, blocked site data), so every access is guarded and
 * failure falls back to the default rather than breaking the presentation.
 */
export function readStoredWfSidebarState(): WfSidebarState {
  if (typeof window === "undefined") return DEFAULT_WF_SIDEBAR_STATE;
  try {
    return stateFromStored(window.localStorage.getItem(WF_SIDEBAR_STORAGE_KEY));
  } catch {
    return DEFAULT_WF_SIDEBAR_STATE;
  }
}

/** Apply a state to <html> so the CSS width rules pick it up. */
export function applyWfSidebarState(state: WfSidebarState): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(WF_SIDEBAR_ATTRIBUTE, state);
}

/* -------------------------------------------------------------------------
 * A module store, so React can subscribe without owning the value. This is
 * the same shape `presentation-mode.tsx` already uses for the other
 * wireframe-local preference.
 * ---------------------------------------------------------------------- */

const listeners = new Set<() => void>();

export function subscribeToWfSidebarState(onChange: () => void): () => void {
  /**
   * Re-apply on subscribe.
   *
   * React's Strict Mode remounts once in development, and on that remount it
   * resets <html> to the attributes it renders from JSX — dropping the one the
   * pre-paint script set. Subscribing runs after every (re)mount, so healing
   * it here keeps the rail honest in dev. In production it writes the value
   * that is already there. See the Next.js "Preventing flash before
   * hydration" guide, "Re-applying attributes in development".
   */
  applyWfSidebarState(readStoredWfSidebarState());

  listeners.add(onChange);

  // Keep a second tab — or a second browser window during a demo — in step.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== WF_SIDEBAR_STORAGE_KEY) return;
    applyWfSidebarState(readStoredWfSidebarState());
    onChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Client snapshot. Reads storage, which is the source of truth. */
export function getWfSidebarSnapshot(): WfSidebarState {
  return readStoredWfSidebarState();
}

/**
 * Server snapshot.
 *
 * The server cannot know the preference and must not guess: this touches no
 * browser API at all, which is what keeps server rendering clean and the
 * hydrated markup consistent.
 */
export function getWfSidebarServerSnapshot(): WfSidebarState {
  return DEFAULT_WF_SIDEBAR_STATE;
}

/** Change the preference: persist it, apply it, notify subscribers. */
export function setWfSidebarState(state: WfSidebarState): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        WF_SIDEBAR_STORAGE_KEY,
        state === "collapsed" ? "true" : "false",
      );
    } catch {
      // Preference simply will not survive a reload; the toggle still works.
    }
  }
  applyWfSidebarState(state);
  for (const listener of listeners) listener();
}

export function toggleWfSidebarState(current: WfSidebarState): WfSidebarState {
  return current === "collapsed" ? "expanded" : "collapsed";
}

/**
 * The blocking script the wireframe layout injects.
 *
 * Tiny and dependency-free: it runs before first paint, so anything slow here
 * would delay rendering. Wrapped in try/catch so blocked storage can never
 * stop the page — it falls back to the expanded default.
 */
export const WF_SIDEBAR_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(
  WF_SIDEBAR_STORAGE_KEY,
)})==="true";document.documentElement.setAttribute(${JSON.stringify(
  WF_SIDEBAR_ATTRIBUTE,
)},c?"collapsed":"expanded")}catch(e){document.documentElement.setAttribute(${JSON.stringify(
  WF_SIDEBAR_ATTRIBUTE,
)},"expanded")}})()`;
