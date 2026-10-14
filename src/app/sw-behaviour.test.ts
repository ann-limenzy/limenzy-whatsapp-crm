import { readFileSync } from "node:fs";
import vm from "node:vm";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Milestone 1E — the service worker's actual behaviour.
 *
 * `pwa.test.ts` asserts the *shape* of the rules by reading the source. This
 * file executes the worker: `public/sw.js` is run in a sandbox with a stubbed
 * `ServiceWorkerGlobalScope`, its listeners are captured, and real events are
 * dispatched at it. That is the difference between "the file says it never
 * caches navigations" and "it was asked to and did not".
 *
 * A browser would be better still, for registration and a genuine offline
 * navigation. No browser automation is installed here and adding one is out of
 * scope, so those remain pending — see the deferred list in the build plan.
 * What this does cover is the part that would be dangerous if wrong: what ends
 * up in a cache shared by everyone who uses the device.
 */

const ORIGIN = "https://app.limenzy.test";

type Handlers = Record<string, (event: unknown) => void>;

class FakeCache {
  readonly store = new Map<string, { body: string; headers: Headers }>();

  async match(request: { url: string } | string) {
    const key = typeof request === "string" ? request : request.url;
    const hit =
      this.store.get(key) ?? this.store.get(new URL(key, ORIGIN).pathname);
    return hit ? { cached: true, body: hit.body } : undefined;
  }

  async put(request: { url: string } | string, response: { body?: string }) {
    const key = typeof request === "string" ? request : request.url;
    this.store.set(key, { body: response.body ?? "", headers: new Headers() });
  }

  async addAll(urls: string[]) {
    for (const url of urls)
      this.store.set(url, { body: "precached", headers: new Headers() });
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();
  async open(name: string) {
    const existing = this.caches.get(name);
    if (existing) return existing;
    const fresh = new FakeCache();
    this.caches.set(name, fresh);
    return fresh;
  }
  async keys() {
    return [...this.caches.keys()];
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
}

/** A response shaped like the parts the worker inspects. */
const response = (
  init: {
    ok?: boolean;
    type?: string;
    body?: string;
    headers?: Record<string, string>;
  } = {},
) => ({
  ok: init.ok ?? true,
  type: init.type ?? "basic",
  body: init.body ?? "fresh",
  headers: new Headers(init.headers ?? {}),
  clone() {
    return { ...this, clone: () => this };
  },
});

function loadWorker() {
  const handlers: Handlers = {};
  const cacheStorage = new FakeCacheStorage();
  const fetchMock = vi.fn(async () => response());
  const skipWaiting = vi.fn(async () => {});
  const claim = vi.fn(async () => {});
  const waits: Promise<unknown>[] = [];

  const self = {
    addEventListener(type: string, handler: (event: unknown) => void) {
      handlers[type] = handler;
    },
    location: { origin: ORIGIN },
    skipWaiting,
    clients: { claim },
  };

  const sandbox = {
    self,
    caches: cacheStorage,
    fetch: fetchMock,
    Response,
    Headers,
    URL,
    console,
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), sandbox);

  const dispatch = async (type: string, event: Record<string, unknown>) => {
    let responded: Promise<unknown> | undefined;
    const full = {
      ...event,
      waitUntil: (p: Promise<unknown>) => waits.push(p),
      respondWith: (p: Promise<unknown>) => {
        responded = p;
      },
    };
    handlers[type]?.(full);
    await Promise.all(waits.splice(0));
    return responded ? await responded : undefined;
  };

  return { handlers, cacheStorage, fetchMock, skipWaiting, claim, dispatch };
}

/** A request shaped like the parts the worker inspects. */
const request = (
  path: string,
  init: { method?: string; mode?: string; origin?: string } = {},
) => ({
  url: `${init.origin ?? ORIGIN}${path}`,
  method: init.method ?? "GET",
  mode: init.mode ?? "no-cors",
});

let worker: ReturnType<typeof loadWorker>;

beforeEach(async () => {
  worker = loadWorker();
  await worker.dispatch("install", {});
});

describe("install and activate", () => {
  it("precaches the offline page so the fallback can work", async () => {
    const [name] = await worker.cacheStorage.keys();
    const cache = await worker.cacheStorage.open(name!);
    expect(cache.store.has("/offline")).toBe(true);
  });

  it("deletes every cache from a previous version on activate", async () => {
    worker.cacheStorage.caches.set("limenzy-v0-static", new FakeCache());
    await worker.dispatch("activate", {});

    const remaining = await worker.cacheStorage.keys();
    expect(remaining).not.toContain("limenzy-v0-static");
    expect(remaining).toHaveLength(1);
    expect(worker.claim).toHaveBeenCalled();
  });

  it("takes over immediately, which is safe because nothing private is cached", async () => {
    expect(worker.skipWaiting).toHaveBeenCalled();
  });
});

describe("navigations are never cached", () => {
  it("returns the live response and stores nothing", async () => {
    worker.fetchMock.mockResolvedValueOnce(
      response({ body: "<html>a real authenticated page</html>" }),
    );
    const result = (await worker.dispatch("fetch", {
      request: request("/dashboard", { mode: "navigate" }),
    })) as { body: string };

    expect(result.body).toContain("authenticated page");

    const [name] = await worker.cacheStorage.keys();
    const cache = await worker.cacheStorage.open(name!);
    // The decisive assertion: the page did not enter the shared cache.
    expect([...cache.store.keys()]).not.toContain(`${ORIGIN}/dashboard`);
  });

  it("falls back to the offline page when the network fails", async () => {
    worker.fetchMock.mockRejectedValueOnce(new Error("offline"));
    const result = (await worker.dispatch("fetch", {
      request: request("/dashboard", { mode: "navigate" }),
    })) as { cached?: boolean; body?: string };

    expect(result.cached).toBe(true);
    expect(result.body).toBe("precached");
  });

  it("serves the offline page for a workspace URL too, never a stale copy", async () => {
    worker.fetchMock.mockRejectedValueOnce(new Error("offline"));
    const result = (await worker.dispatch("fetch", {
      request: request("/settings", { mode: "navigate" }),
    })) as { cached?: boolean };

    expect(result.cached).toBe(true);
  });
});

describe("requests the worker refuses to touch", () => {
  const untouched = async (
    path: string,
    init?: Parameters<typeof request>[1],
  ) => {
    const result = await worker.dispatch("fetch", {
      request: request(path, init),
    });
    // `undefined` means respondWith was never called: the browser handles it
    // exactly as if no service worker existed.
    expect(result).toBeUndefined();
    const [name] = await worker.cacheStorage.keys();
    const cache = await worker.cacheStorage.open(name!);
    expect(cache.store.has(`${ORIGIN}${path}`)).toBe(false);
  };

  it("leaves a POST alone, so no mutation response is stored", async () => {
    await untouched("/settings", { method: "POST" });
  });

  it("leaves an API GET alone", async () => {
    await untouched("/api/anything");
  });

  it("leaves auth routes alone", async () => {
    await untouched("/auth/confirm");
  });

  it("leaves the image optimiser alone", async () => {
    await untouched("/_next/image");
  });

  it("leaves cross-origin requests alone, which covers Supabase", async () => {
    const result = await worker.dispatch("fetch", {
      request: request("/rest/v1/workspaces", {
        // A Supabase-shaped host, with a placeholder ref: the assertion is
        // about the origin differing, and the real project ref has no business
        // in the repository.
        origin: "https://project-ref.supabase.co",
      }),
    });
    expect(result).toBeUndefined();
  });

  it("leaves an ordinary same-origin page request alone", async () => {
    // Not a navigation and not a cacheable prefix: nothing to do with it.
    await untouched("/some-page.txt");
  });
});

describe("static assets are cached, carefully", () => {
  it("caches build output on first request and serves it from cache after", async () => {
    worker.fetchMock.mockResolvedValueOnce(response({ body: "chunk" }));
    const first = (await worker.dispatch("fetch", {
      request: request("/_next/static/chunks/app.js"),
    })) as { body: string };
    expect(first.body).toBe("chunk");

    const second = (await worker.dispatch("fetch", {
      request: request("/_next/static/chunks/app.js"),
    })) as { cached?: boolean };
    expect(second.cached).toBe(true);
    // Served from cache, so the network was not asked a second time.
    expect(worker.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches an icon that was not precached", async () => {
    // icon-192 is already in the precache, so it would be served from there
    // and never re-stored. 512 exercises the fetch-and-store path.
    worker.fetchMock.mockResolvedValueOnce(response({ body: "png" }));
    await worker.dispatch("fetch", { request: request("/icons/icon-512.png") });

    const [name] = await worker.cacheStorage.keys();
    const cache = await worker.cacheStorage.open(name!);
    expect(cache.store.has(`${ORIGIN}/icons/icon-512.png`)).toBe(true);
  });

  it("serves a precached icon without touching the network", async () => {
    const result = (await worker.dispatch("fetch", {
      request: request("/icons/icon-192.png"),
    })) as { cached?: boolean };

    expect(result.cached).toBe(true);
    expect(worker.fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to cache a response carrying Set-Cookie", async () => {
    worker.fetchMock.mockResolvedValueOnce(
      response({ headers: { "Set-Cookie": "session=secret" } }),
    );
    await worker.dispatch("fetch", { request: request("/_next/static/x.js") });

    const [name] = await worker.cacheStorage.keys();
    const cache = await worker.cacheStorage.open(name!);
    expect(cache.store.has(`${ORIGIN}/_next/static/x.js`)).toBe(false);
  });

  it("refuses to cache a no-store response", async () => {
    worker.fetchMock.mockResolvedValueOnce(
      response({ headers: { "Cache-Control": "private, no-store" } }),
    );
    await worker.dispatch("fetch", { request: request("/_next/static/y.js") });

    const [name] = await worker.cacheStorage.keys();
    const cache = await worker.cacheStorage.open(name!);
    expect(cache.store.has(`${ORIGIN}/_next/static/y.js`)).toBe(false);
  });

  it("refuses to cache an opaque response, which cannot be inspected", async () => {
    worker.fetchMock.mockResolvedValueOnce(response({ type: "opaque" }));
    await worker.dispatch("fetch", { request: request("/_next/static/z.js") });

    const [name] = await worker.cacheStorage.keys();
    const cache = await worker.cacheStorage.open(name!);
    expect(cache.store.has(`${ORIGIN}/_next/static/z.js`)).toBe(false);
  });

  it("refuses to cache an error response", async () => {
    worker.fetchMock.mockResolvedValueOnce(response({ ok: false }));
    await worker.dispatch("fetch", { request: request("/_next/static/e.js") });

    const [name] = await worker.cacheStorage.keys();
    const cache = await worker.cacheStorage.open(name!);
    expect(cache.store.has(`${ORIGIN}/_next/static/e.js`)).toBe(false);
  });
});

describe("the update path", () => {
  it("skips waiting only for its own message, and ignores anything else", async () => {
    worker.skipWaiting.mockClear();
    await worker.dispatch("message", { data: "please-take-over" });
    expect(worker.skipWaiting).not.toHaveBeenCalled();

    await worker.dispatch("message", { data: "limenzy:skip-waiting" });
    expect(worker.skipWaiting).toHaveBeenCalledTimes(1);
  });
});
