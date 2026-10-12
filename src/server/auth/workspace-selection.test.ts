// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The workspace preference cookie: its attributes, and the boundary between
 * reading it (anywhere) and changing it (two places only).
 */

const cookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const serverEnv = vi.hoisted(() => vi.fn());
vi.mock("@/lib/env", () => ({ serverEnv }));

const {
  WORKSPACE_COOKIE,
  WORKSPACE_COOKIE_MAX_AGE,
  clearWorkspacePreference,
  isSecureEnvironment,
  readWorkspacePreference,
  workspaceCookieOptions,
  writeWorkspacePreference,
} = await import("@/server/auth/workspace-selection");

const WORKSPACE = "2b2b2b2b-2222-4222-8222-2222222222bb";

beforeEach(() => {
  serverEnv.mockReturnValue({
    NEXT_PUBLIC_SITE_URL: "https://crm.example.com",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("cookie attributes", () => {
  it("is the approved name with a thirty-day lifetime", () => {
    expect(WORKSPACE_COOKIE).toBe("limenzy_ws");
    expect(WORKSPACE_COOKIE_MAX_AGE).toBe(60 * 60 * 24 * 30);
  });

  it("is HttpOnly, SameSite=Lax, path-wide and domain-less", () => {
    const options = workspaceCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(WORKSPACE_COOKIE_MAX_AGE);
    // No Domain attribute: the cookie belongs to this origin only, and a
    // deletion has to match the scope the write used.
    expect("domain" in options).toBe(false);
  });
});

describe("Secure comes from server configuration, never from the request", () => {
  it("is set when the configured site URL is https", () => {
    serverEnv.mockReturnValue({
      NEXT_PUBLIC_SITE_URL: "https://crm.example.com",
    });
    expect(isSecureEnvironment()).toBe(true);
    expect(workspaceCookieOptions().secure).toBe(true);
  });

  it("is not set for a local http site URL", () => {
    serverEnv.mockReturnValue({
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    });
    expect(isSecureEnvironment()).toBe(false);
  });

  it("falls back to the build mode when no site URL is configured", () => {
    serverEnv.mockReturnValue({ NEXT_PUBLIC_SITE_URL: undefined });
    vi.stubEnv("NODE_ENV", "production");
    expect(isSecureEnvironment()).toBe(true);

    vi.stubEnv("NODE_ENV", "development");
    expect(isSecureEnvironment()).toBe(false);
  });

  it("reads no request header or origin to make that decision", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = (
      await readFile("src/server/auth/workspace-selection.ts", "utf8")
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    // A request arriving over plain HTTP must not be able to talk the server
    // into dropping Secure.
    for (const forbidden of [
      "x-forwarded-proto",
      "X-Forwarded-Proto",
      "headers(",
      "request.url",
      "nextUrl",
      "origin",
    ]) {
      expect(`${forbidden}: ${source.includes(forbidden)}`).toBe(
        `${forbidden}: false`,
      );
    }
  });
});

describe("reading", () => {
  it("returns the raw value, unrepaired", async () => {
    cookieStore.get.mockReturnValue({ value: "  NOT-a-UUID  " });
    expect(await readWorkspacePreference()).toBe("  NOT-a-UUID  ");
  });

  it("distinguishes absent from wrong", async () => {
    cookieStore.get.mockReturnValue(undefined);
    // `undefined` is what tells the resolver "nothing was chosen", which is a
    // different outcome from "something was chosen and is not yours".
    expect(await readWorkspacePreference()).toBeUndefined();
  });
});

describe("writing and clearing", () => {
  it("writes the id with the approved attributes", async () => {
    await writeWorkspacePreference(WORKSPACE);
    expect(cookieStore.set).toHaveBeenCalledWith(
      "limenzy_ws",
      WORKSPACE,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: true,
      }),
    );
  });

  it("clears with the same scope it wrote with", async () => {
    await clearWorkspacePreference();
    const [name, value, options] = cookieStore.set.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(name).toBe("limenzy_ws");
    expect(value).toBe("");
    expect(options.maxAge).toBe(0);
    expect(options.path).toBe("/");
    expect(options.httpOnly).toBe(true);
    expect("domain" in options).toBe(false);
  });

  it("stores nothing but the workspace id", async () => {
    await writeWorkspacePreference(WORKSPACE);
    const [, value] = cookieStore.set.mock.calls[0] as [string, string];
    // No role, profile id, membership id, expiry claim or signature: the
    // cookie is a preference, and authority stays in the database.
    expect(value).toBe(WORKSPACE);
    expect(value).not.toMatch(/owner_admin|manager|staff|\./);
  });
});
