import { readFile, stat } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { GROUND_DARK, GROUND_LIGHT } from "@/lib/brand-colors";

import manifest from "./manifest";

/**
 * Milestone 1E — the installable foundation.
 *
 * Two kinds of assertion live here. The first is that the manifest says what
 * §179.1 requires. The second, and the one that matters more, is that the
 * service worker cannot cache anything belonging to a person: its cache is
 * shared by every user of the browser profile and survives sign-out, so a
 * single over-broad rule there would outlive every other control in the
 * product.
 *
 * The caching assertions read the worker's source rather than executing it.
 * That is a deliberate trade: a behavioural test would need a full
 * ServiceWorkerGlobalScope, and what actually needs guarding is the shape of
 * the rules — that navigations are never written to the cache, that only two
 * prefixes are cacheable, and that nobody later adds a third.
 */

const SW = "public/sw.js";

describe("the web app manifest (§179.1)", () => {
  const m = manifest();

  it("launches at the root so the app resolves where the user belongs", () => {
    // §179.1: an installed app must resolve its destination, not assume one.
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
  });

  it("is installable as a standalone application", () => {
    expect(m.display).toBe("standalone");
    expect(m.name).toBe("Limenzy CRM");
    expect(m.short_name).toBeTruthy();
    expect((m.short_name ?? "").length).toBeLessThanOrEqual(12);
  });

  it("uses colours derived from the theme tokens", () => {
    expect(m.background_color).toBe(GROUND_LIGHT);
    expect(m.theme_color).toBe(GROUND_LIGHT);
  });

  it("offers both a plain and a maskable icon at 192 and 512", () => {
    const icons = m.icons ?? [];
    for (const purpose of ["any", "maskable"]) {
      for (const size of ["192x192", "512x512"]) {
        expect(
          icons.some((i) => i.purpose === purpose && i.sizes === size),
          `missing ${purpose} ${size}`,
        ).toBe(true);
      }
    }
  });

  it("ships every icon file it advertises", async () => {
    for (const icon of manifest().icons ?? []) {
      const path = `public${icon.src}`;
      const info = await stat(path);
      expect(info.size, `${path} is empty`).toBeGreaterThan(1000);
    }
  });

  it("advertises no authenticated shortcut or handler", () => {
    // A shortcut is an unauthenticated launcher entry point; pointing one at a
    // workspace screen would advertise structure and land a signed-out user on
    // a redirect.
    const extra = m as Record<string, unknown>;
    expect(extra.shortcuts).toBeUndefined();
    expect(extra.share_target).toBeUndefined();
    expect(extra.protocol_handlers).toBeUndefined();
    expect(extra.file_handlers).toBeUndefined();
  });
});

describe("the service worker caches nothing that belongs to a person", () => {
  it("never writes a navigation response to the cache", async () => {
    const source = await readFile(SW, "utf8");
    const navigation = source.slice(
      source.indexOf('request.mode === "navigate"'),
      source.indexOf("if (!isCacheableAsset"),
    );
    expect(navigation).toContain("await fetch(request)");
    // The decisive assertion: no cache write anywhere in the navigation branch.
    expect(navigation).not.toMatch(/cache\.put|cache\.add/);
  });

  it("limits the cacheable prefixes to build output and icons", async () => {
    const source = await readFile(SW, "utf8");
    const line = /const CACHEABLE_PREFIXES = \[([^\]]*)\]/.exec(source);
    expect(line).not.toBeNull();
    const prefixes = [...(line?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
      (x) => x[1],
    );
    expect(prefixes.sort()).toEqual(["/_next/static/", "/icons/"]);
  });

  it("refuses API, auth and image-optimiser paths outright", async () => {
    const source = await readFile(SW, "utf8");
    const line = /const NEVER = \[([^\]]*)\]/.exec(source);
    const never = [...(line?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
      (x) => x[1],
    );
    for (const path of ["/api/", "/auth/"]) expect(never).toContain(path);
  });

  it("handles only GET, so no mutation response is ever stored", async () => {
    const source = await readFile(SW, "utf8");
    expect(source).toContain('if (request.method !== "GET") return;');
  });

  it("leaves cross-origin requests alone, which excludes Supabase", async () => {
    const source = await readFile(SW, "utf8");
    expect(source).toContain(
      "if (url.origin !== self.location.origin) return;",
    );
  });

  it("stores only inspectable, cookie-free responses", async () => {
    const source = await readFile(SW, "utf8");
    // `basic` excludes opaque and CORS responses; an opaque response cannot be
    // read, so it cannot be shown to be safe to keep.
    expect(source).toContain('response.type === "basic"');
    expect(source).toContain("no-store");
    expect(source).toContain('response.headers.has("Set-Cookie")');
  });

  it("precaches only the offline screen and public branding", async () => {
    const source = await readFile(SW, "utf8");
    const line = /const PRECACHE = \[([^\]]*)\]/.exec(source);
    const precache = [...(line?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
      (x) => x[1] ?? "",
    );
    for (const entry of precache) {
      expect(
        entry === "/offline" ||
          entry.startsWith("/icons/") ||
          entry.endsWith(".webmanifest"),
        `${entry} is precached but is not public static content`,
      ).toBe(true);
    }
  });

  it("adds no push, sync or notification behaviour", async () => {
    // Explicitly out of scope for Milestone 1E.
    const source = await readFile(SW, "utf8");
    for (const forbidden of [
      "push",
      "sync",
      "showNotification",
      "notificationclick",
      "periodicsync",
    ]) {
      expect(
        source.includes(`addEventListener("${forbidden}"`),
        `the worker listens for ${forbidden}`,
      ).toBe(false);
    }
  });

  it("drops every cache but the current version on activate", async () => {
    const source = await readFile(SW, "utf8");
    expect(source).toContain("caches.delete(name)");
    expect(source).toContain("name !== CACHE");
  });
});

describe("the service worker is registered safely", () => {
  it("does not register in development", async () => {
    const source = await readFile(
      "src/components/pwa/service-worker.tsx",
      "utf8",
    );
    expect(source).toContain('process.env.NODE_ENV !== "production"');
  });

  it("fails silently, because the offline screen is not load-bearing", async () => {
    const source = await readFile(
      "src/components/pwa/service-worker.tsx",
      "utf8",
    );
    expect(source).toMatch(/\.catch\(/);
  });
});

describe("the offline screen shows nothing about a workspace", () => {
  it("reads no tenant data and resolves no context", async () => {
    const source = await readFile("src/app/offline/page.tsx", "utf8");
    for (const forbidden of [
      "withTenant",
      "requireWorkspaceContext",
      "requireUser",
      "runtimeSql",
      "createClient",
    ]) {
      expect(source, `the offline page uses ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it("offers a document navigation, which is what retries the network", async () => {
    const source = await readFile("src/app/offline/page.tsx", "utf8");
    expect(source).toContain('<a href="/">');
  });

  it("is a static page, so the precached copy is never user-specific", async () => {
    const source = await readFile("src/app/offline/page.tsx", "utf8");
    expect(source).not.toContain("force-dynamic");
    expect(source).not.toContain("cookies()");
  });
});

describe("install guidance covers both supported platforms", () => {
  it("explains Android Chrome and iOS Safari separately", async () => {
    const source = await readFile("src/app/install/page.tsx", "utf8");
    expect(source).toContain("Add to Home screen");
    expect(source).toContain("Add to Home Screen");
    expect(source).toMatch(/Safari/);
  });

  it("warns that the installed app may not inherit the session", async () => {
    // Required by the build plan, and true: iOS usually does not.
    const source = await readFile("src/app/install/page.tsx", "utf8");
    expect(source.replace(/\s+/g, " ")).toContain(
      "may or may not inherit the session",
    );
  });

  it("does not promise offline functionality", async () => {
    const source = await readFile("src/app/install/page.tsx", "utf8");
    // Whitespace-insensitive: the formatter reflows prose across lines.
    expect(source.replace(/\s+/g, " ")).toContain(
      "does not make the application work offline",
    );
  });
});

describe("the safe-area defect is fixed", () => {
  it("sets viewportFit cover, without which the insets resolve to 0", async () => {
    const source = await readFile("src/app/layout.tsx", "utf8");
    expect(source).toContain('viewportFit: "cover"');
  });

  it("keeps the theme colours derived from the tokens", async () => {
    const source = await readFile("src/app/layout.tsx", "utf8");
    expect(source).toContain("GROUND_LIGHT");
    expect(source).toContain("GROUND_DARK");
    // Stronger than naming the two stale values, and it keeps this file free
    // of colour literals itself: the layout must carry NO hex at all, because
    // every colour it needs comes from @/lib/brand-colors, where the
    // token conversion is recorded and checked.
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("still pads for the insets in the three places that need it", async () => {
    for (const file of [
      "src/components/app-shell/mobile-nav.tsx",
      "src/components/app-shell/nav-drawer.tsx",
      "src/components/app-shell/app-shell.tsx",
    ]) {
      const source = await readFile(file, "utf8");
      expect(source, `${file} lost its safe-area padding`).toContain(
        "env(safe-area-inset-bottom)",
      );
    }
  });
});

describe("the ground colours match the theme tokens", () => {
  it("converts --background from globals.css to the recorded values", async () => {
    const css = await readFile("src/app/globals.css", "utf8");

    const oklchToHex = (L: number, C: number, hDeg: number) => {
      const h = (hDeg * Math.PI) / 180;
      const a = C * Math.cos(h);
      const b = C * Math.sin(h);
      const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = L - 0.0894841775 * a - 1.291485548 * b;
      const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3];
      const lin = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
      ];
      return `#${lin
        .map((v) => {
          const c =
            v <= 0.0031308
              ? 12.92 * v
              : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055;
          return Math.round(Math.min(1, Math.max(0, c)) * 255)
            .toString(16)
            .padStart(2, "0");
        })
        .join("")}`;
    };

    const matches = [
      ...css.matchAll(/--background:\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g),
    ];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    const [light, dark] = matches;

    expect(
      oklchToHex(Number(light![1]), Number(light![2]), Number(light![3])),
    ).toBe(GROUND_LIGHT);
    expect(
      oklchToHex(Number(dark![1]), Number(dark![2]), Number(dark![3])),
    ).toBe(GROUND_DARK);
  });
});
