/**
 * Desktop sidebar collapse preference.
 *
 * This is a PRESENTATION preference only. It never influences authorization,
 * which navigation destinations exist, or what a user may access — those are
 * decided on the server (Milestone 1D). A tampered or absent value can only
 * change how wide the sidebar is drawn.
 *
 * The single source of truth at runtime is a `data-sidebar` attribute on
 * <html>. A tiny blocking script applies it from localStorage before first
 * paint, so the correct width is present in the very first frame — there is no
 * expanded-to-collapsed flash and no hydration mismatch (React renders no such
 * attribute, and the root <html> already carries `suppressHydrationWarning`
 * for next-themes).
 *
 * Only the desktop presentation reads this. The tablet drawer and the mobile
 * bottom bar are driven purely by media queries, so a stored `collapsed`
 * cannot leak into them.
 */

export const SIDEBAR_STORAGE_KEY = "limenzy-crm:sidebar-state:v1";

export const SIDEBAR_ATTRIBUTE = "data-sidebar";

export type SidebarState = "expanded" | "collapsed";

/** Used when nothing is stored, when storage is unavailable, or on bad input. */
export const DEFAULT_SIDEBAR_STATE: SidebarState = "expanded";

/** Narrow an unknown value to a valid state, falling back safely. */
export function parseSidebarState(value: unknown): SidebarState {
  return value === "collapsed" || value === "expanded"
    ? value
    : DEFAULT_SIDEBAR_STATE;
}

/**
 * Read the stored preference.
 *
 * Storage access throws in some contexts (Safari private mode, embedded
 * webviews, browsers configured to block site data), so every access is
 * guarded and failure falls back to the default rather than breaking the shell.
 */
export function readStoredSidebarState(): SidebarState {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_STATE;
  try {
    return parseSidebarState(window.localStorage.getItem(SIDEBAR_STORAGE_KEY));
  } catch {
    return DEFAULT_SIDEBAR_STATE;
  }
}

/** Persist the preference. Silently ignores unavailable storage. */
export function writeStoredSidebarState(state: SidebarState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, state);
  } catch {
    // Preference simply will not persist; the shell still works this session.
  }
}

/** The state currently applied to the document. */
export function readAppliedSidebarState(): SidebarState {
  if (typeof document === "undefined") return DEFAULT_SIDEBAR_STATE;
  return parseSidebarState(
    document.documentElement.getAttribute(SIDEBAR_ATTRIBUTE),
  );
}

/** Apply a state to the document so the CSS width rules pick it up. */
export function applySidebarState(state: SidebarState): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(SIDEBAR_ATTRIBUTE, state);
}

/* -------------------------------------------------------------------------
 * A minimal external store so React can subscribe without owning the value.
 * Using the DOM attribute as the store is what lets the pre-hydration script
 * and React agree without a flash.
 * ---------------------------------------------------------------------- */

const listeners = new Set<() => void>();

export function subscribeToSidebarState(onChange: () => void): () => void {
  listeners.add(onChange);

  // Keep multiple tabs in step.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SIDEBAR_STORAGE_KEY) return;
    applySidebarState(parseSidebarState(event.newValue));
    onChange();
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Change the preference: apply it, persist it, notify subscribers. */
export function setSidebarState(state: SidebarState): void {
  applySidebarState(state);
  writeStoredSidebarState(state);
  for (const listener of listeners) listener();
}

export function toggleSidebarState(current: SidebarState): SidebarState {
  return current === "collapsed" ? "expanded" : "collapsed";
}

/**
 * The blocking script injected into <head>.
 *
 * Kept deliberately tiny and dependency-free: it runs before first paint, so
 * anything slow here would delay rendering. Wrapped in try/catch so a storage
 * failure can never block the page.
 */
export const SIDEBAR_INIT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(
  SIDEBAR_STORAGE_KEY,
)});document.documentElement.setAttribute(${JSON.stringify(
  SIDEBAR_ATTRIBUTE,
)},v==="collapsed"?"collapsed":"expanded")}catch(e){document.documentElement.setAttribute(${JSON.stringify(
  SIDEBAR_ATTRIBUTE,
)},"expanded")}})()`;
