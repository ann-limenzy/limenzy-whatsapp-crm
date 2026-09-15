"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/**
 * Presentation mode.
 *
 * Hides the wireframe navigation so a screenshot shows only the product
 * surface. Kept outside the URL so moving between screens does not require
 * every link to carry a flag, and mirrored into sessionStorage so a reload
 * during a client presentation does not drop it.
 *
 * Read through `useSyncExternalStore` rather than an effect: the server has
 * no sessionStorage, so the server snapshot is always `false` and React
 * reconciles the real value at hydration without a state write in an effect.
 */

const STORAGE_KEY = "limenzy-crm:wireframe-presenting:v1";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab toggling the mode should be reflected here too.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private browsing or blocked storage — the default is correct.
    return false;
  }
}

/** The server cannot know the preference, and must not guess. */
function getServerSnapshot(): boolean {
  return false;
}

function setPresenting(value: boolean) {
  try {
    sessionStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Non-fatal: the toggle simply will not survive a reload.
  }
  for (const listener of listeners) listener();
}

/**
 * Kept as a component so the wireframe layout reads the same as any other
 * provider-wrapped tree, even though the state now lives in a module store.
 */
export function PresentationProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function usePresentation() {
  const presenting = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { presenting, setPresenting };
}
