/* eslint-env serviceworker */

/**
 * Limenzy service worker — Milestone 1E.
 *
 * It exists for ONE reason: to show a branded offline screen when a navigation
 * fails. It is not an installation requirement, it is not a performance
 * feature, and it is not a step towards offline CRM.
 *
 * ## What it must never do
 *
 * A service worker sits in front of every request from this origin, and its
 * cache is shared by everyone who uses the device. Caching an authenticated
 * page would therefore survive sign-out and could be served to the next person
 * at this browser profile. So:
 *
 *   * **No navigation response is ever cached.** Navigations are network-only.
 *     On failure the user gets the offline page from the precache — never a
 *     stale copy of a real screen.
 *   * **No API, auth or Server Action response is cached**, and no cross-origin
 *     response is touched at all, which excludes every Supabase call.
 *   * **Only GET is handled.** A POST is a mutation; it goes straight to the
 *     network and its response is never stored.
 *   * **Only same-origin build output and icons are cached**, and only from
 *     `/_next/static/` and `/icons/`, both of which are content-hashed or
 *     static branding. Nothing there is user-specific.
 *
 * Opaque responses are never stored either: a 0-status response cannot be
 * inspected, so it cannot be shown to be safe.
 *
 * ## Updating
 *
 * The cache name carries a version. On `activate` every cache that is not the
 * current version is deleted, so a new deployment cannot be served stale
 * assets. `skipWaiting` + `clients.claim` make that happen on the next load
 * rather than after every tab is closed — acceptable precisely because nothing
 * user-specific is cached, so there is no stale private data to inherit.
 */

const VERSION = "limenzy-v1";
const CACHE = `${VERSION}-static`;

/** The offline screen and the assets it needs to render unaided. */
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/manifest.webmanifest"];

/** Same-origin prefixes whose contents are safe to cache. */
const CACHEABLE_PREFIXES = ["/_next/static/", "/icons/"];

/** Paths that must never be touched, even for a GET. */
const NEVER = ["/api/", "/auth/", "/_next/image"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll fails the whole install if any entry 404s, which is the
      // behaviour we want: a half-populated precache cannot serve the offline
      // page, and a service worker that cannot do its one job should not be
      // installed at all.
      await cache.addAll(PRECACHE);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Is this a same-origin GET for something we are willing to store? */
function isCacheableAsset(request, url) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (NEVER.some((prefix) => url.pathname.startsWith(prefix))) return false;
  return CACHEABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Anything that is not a plain GET goes to the network untouched. This is
  // the first gate, so a Server Action POST can never reach the cache paths.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin — Supabase, fonts, anything else — is left entirely alone.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Network-only, with the offline page as the fallback. The real response
    // is returned to the page and never written to the cache.
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ??
            new Response("You are offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })(),
    );
    return;
  }

  if (!isCacheableAsset(request, url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;

      const response = await fetch(request);
      // `ok` excludes redirects and errors; `basic` excludes opaque and CORS
      // responses, which cannot be inspected and so cannot be shown to be safe.
      if (response.ok && response.type === "basic") {
        // Belt and braces: respect an explicit no-store even on a path we
        // believe is static.
        const control = response.headers.get("Cache-Control") ?? "";
        if (!control.includes("no-store") && !response.headers.has("Set-Cookie")) {
          cache.put(request, response.clone());
        }
      }
      return response;
    })(),
  );
});

/**
 * Let the page ask for an immediate update after a new version is deployed.
 * Nothing else is accepted: the worker takes no other instruction from a page.
 */
self.addEventListener("message", (event) => {
  if (event.data === "limenzy:skip-waiting") self.skipWaiting();
});
