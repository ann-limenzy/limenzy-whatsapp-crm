// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The reset handler: the only place a stale workspace preference is cleared.
 *
 * What matters here is that it clears one cookie and no other, that it cannot
 * be turned into an open redirect or a loop, and that its response is not
 * cacheable.
 */

const readWorkspacePreference = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-selection", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/auth/workspace-selection")>();
  return { ...actual, readWorkspacePreference };
});

const serverEnv = vi.hoisted(() =>
  vi.fn(() => ({ NEXT_PUBLIC_SITE_URL: undefined })),
);
vi.mock("@/lib/env", () => ({ serverEnv }));

const { GET } = await import("@/app/workspace/reset/route");

const WORKSPACE = "2b2b2b2b-2222-4222-8222-2222222222bb";

const call = async (url: string, origin = "http://localhost:3000") => {
  const { NextRequest } = await import("next/server");
  return GET(new NextRequest(new URL(url, origin)));
};

/** Every assertion about where the browser is sent reads this. */
const locationOf = (response: { headers: Headers }) =>
  response.headers.get("location");

afterEach(() => {
  vi.clearAllMocks();
});

describe("clearing", () => {
  it("expires the workspace cookie, and names no other", async () => {
    readWorkspacePreference.mockResolvedValue(WORKSPACE);
    const response = await call("/workspace/reset?next=/leads");

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("limenzy_ws=");
    expect(setCookie.toLowerCase()).toContain("max-age=0");
    expect(setCookie.toLowerCase()).toContain("path=/");
    expect(setCookie.toLowerCase()).toContain("httponly");
    // The Supabase session is untouched: a stale workspace is not a reason to
    // sign anybody out.
    expect(setCookie).not.toMatch(/sb-|auth-token|refresh/i);
  });

  it("attempts the clear even when it could not read a preference", async () => {
    readWorkspacePreference.mockResolvedValue(undefined);
    const response = await call("/workspace/reset");
    expect(response.headers.get("set-cookie") ?? "").toContain("limenzy_ws=");
  });

  it("is never cached", async () => {
    readWorkspacePreference.mockResolvedValue(WORKSPACE);
    const response = await call("/workspace/reset?next=/leads");
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
  });
});

describe("the browser's origin survives the redirect", () => {
  /**
   * The defect this pins down.
   *
   * The handler used to build an absolute URL from `request.nextUrl`, whose
   * host the framework normalises. A browser on `http://127.0.0.1:3100` was
   * answered with `Location: http://localhost:3100/…`, a different origin —
   * so the host-scoped session cookie was not sent onward and recovering from
   * a stale preference looked like being signed out.
   */
  it("names no scheme, host or port at all", async () => {
    readWorkspacePreference.mockResolvedValue(WORKSPACE);
    const response = await call("/workspace/reset?next=/leads");
    const location = locationOf(response) ?? "";

    expect(location.startsWith("/")).toBe(true);
    expect(location.startsWith("//")).toBe(false);
    expect(location).not.toMatch(/^https?:/);
    expect(location).not.toContain("localhost");
    expect(location).not.toContain("127.0.0.1");
  });

  it.each([
    ["http://127.0.0.1:3100", "an IP origin"],
    ["http://localhost:3100", "a hostname origin"],
    ["https://crm.example.com", "a deployed https origin"],
    ["http://localhost:3000", "the configured site origin"],
  ])("answers %s (%s) with the same relative path", async (origin) => {
    readWorkspacePreference.mockResolvedValue(WORKSPACE);
    const response = await call("/workspace/reset?next=/renewals", origin);
    // Identical whatever the request origin was: the browser resolves it
    // against the URL it actually asked for.
    expect(locationOf(response)).toBe("/select-workspace?next=%2Frenewals");
  });

  it("derives nothing from a Host or forwarded header", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = (await readFile("src/app/workspace/reset/route.ts", "utf8"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    for (const forbidden of [
      "x-forwarded",
      "X-Forwarded",
      'get("host")',
      "headers.get",
      "NextResponse.redirect",
      "new URL(",
    ]) {
      expect(`${forbidden}: ${source.includes(forbidden)}`).toBe(
        `${forbidden}: false`,
      );
    }
  });

  it("still redirects, with the status a redirect needs", async () => {
    readWorkspacePreference.mockResolvedValue(WORKSPACE);
    const response = await call("/workspace/reset?next=/leads");
    expect(response.status).toBe(307);
  });
});

describe("where it sends the visitor", () => {
  it("sends a cleared preference to the chooser, carrying the destination", async () => {
    readWorkspacePreference.mockResolvedValue(WORKSPACE);
    const response = await call("/workspace/reset?next=/renewals");
    expect(locationOf(response)).toBe("/select-workspace?next=%2Frenewals");
  });

  it("cannot bounce back into the gate that sent it here", async () => {
    readWorkspacePreference.mockResolvedValue(WORKSPACE);
    const response = await call("/workspace/reset?next=/leads");
    const location = locationOf(response) ?? "";
    // The chooser consults no preference and runs no workspace gate, so even
    // a deletion that did not take effect cannot produce a loop.
    expect(location).toContain("/select-workspace");
    expect(location).not.toContain("/workspace/reset");
  });

  it("refuses to be used as an open redirect", async () => {
    readWorkspacePreference.mockResolvedValue(undefined);
    for (const unsafe of [
      "https://evil.test/x",
      "//evil.test",
      "/\\evil.test",
      "javascript:alert(1)",
    ]) {
      const response = await call(
        `/workspace/reset?next=${encodeURIComponent(unsafe)}`,
      );
      expect(locationOf(response)).toBe("/");
    }
  });

  it("refuses reset recursion and the account surfaces", async () => {
    readWorkspacePreference.mockResolvedValue(undefined);
    for (const looping of [
      "/workspace/reset",
      "/workspace/reset?next=/leads",
      "/select-workspace",
      "/setup",
      "/no-access",
      "/sign-in",
    ]) {
      const response = await call(
        `/workspace/reset?next=${encodeURIComponent(looping)}`,
      );
      expect(locationOf(response)).toBe("/");
    }
  });

  it("honours a plain application destination when nothing was cleared", async () => {
    readWorkspacePreference.mockResolvedValue(undefined);
    const response = await call("/workspace/reset?next=/customers");
    expect(locationOf(response)).toBe("/customers");
  });
});
