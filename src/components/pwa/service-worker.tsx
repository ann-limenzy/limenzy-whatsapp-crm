"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker — Milestone 1E.
 *
 * Registration is deliberately late (`load`) and failure is deliberately
 * silent: the worker exists only to provide an offline screen, so a browser
 * that refuses it loses nothing the application depends on.
 *
 * It is NOT registered in development. A worker that intercepts requests
 * across hot reloads produces confusing staleness, and Milestone 1E's own
 * caching rules are what need testing in a production build anyway.
 *
 * Service workers require a secure context: HTTPS, or localhost. On a deployed
 * HTTP origin this quietly does nothing, which is correct — see the HTTPS note
 * in docs/build-plan.md.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // An unavailable offline screen is not worth surfacing to the user.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
