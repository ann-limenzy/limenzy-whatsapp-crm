import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NextRequest } from "next/server";

/**
 * Email callback handling.
 *
 * These routes are the only place where an attacker controls the entire URL —
 * they can put whatever they like in a phishing email. So the tests care about
 * what happens with hostile and malformed links, not only with valid ones.
 */

const { redirectMock, RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    url: string;
    constructor(url: string) {
      super(`NEXT_REDIRECT:${url}`);
      this.name = "RedirectError";
      this.url = url;
    }
  }
  return {
    RedirectError,
    redirectMock: vi.fn((url: string) => {
      throw new RedirectError(url);
    }),
  };
});

const { verifyOtp, exchangeCodeForSession, createClient } = vi.hoisted(() => {
  const verifyOtp = vi.fn();
  const exchangeCodeForSession = vi.fn();
  return {
    verifyOtp,
    exchangeCodeForSession,
    createClient: vi.fn(async () => ({
      auth: { verifyOtp, exchangeCodeForSession },
    })),
  };
});

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { GET: confirmGET } = await import("@/app/auth/confirm/route");
const { GET: callbackGET } = await import("@/app/auth/callback/route");

const TOKEN = "a".repeat(32);
const CODE = "b".repeat(32);

/**
 * The handlers read only `request.nextUrl`, so a URL is the whole of the
 * request surface under test. Building a real NextRequest would pull in a
 * fetch polyfill for no added coverage.
 */
function req(url: string): NextRequest {
  return { nextUrl: new URL(url, "https://crm.example.com") } as NextRequest;
}

async function landsOn(
  handler: (request: NextRequest) => Promise<unknown>,
  url: string,
): Promise<string> {
  try {
    await handler(req(url));
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    throw error;
  }
  throw new Error("Expected a redirect, but the handler returned normally.");
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyOtp.mockResolvedValue({ error: null });
  exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe("/auth/confirm — rejects malformed links before any exchange", () => {
  it.each([
    ["/auth/confirm", "nothing at all"],
    [`/auth/confirm?type=signup`, "no token"],
    [`/auth/confirm?token_hash=${TOKEN}`, "no type"],
    [
      "/auth/confirm?token_hash=short&type=signup",
      "an implausibly short token",
    ],
    [`/auth/confirm?token_hash=${TOKEN}&type=`, "an empty type"],
    [`/auth/confirm?token_hash=${TOKEN}&type=admin`, "a type we do not allow"],
    [
      `/auth/confirm?token_hash=${TOKEN}&type=phone_change`,
      "a type outside the email set",
    ],
  ])("rejects a link with %s (%s)", async (url) => {
    expect(await landsOn(confirmGET, url)).toBe(
      "/auth/auth-error?reason=invalid_link",
    );
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("/auth/confirm — valid links", () => {
  it("verifies the token and sends a new signup to onboarding", async () => {
    const url = await landsOn(
      confirmGET,
      `/auth/confirm?token_hash=${TOKEN}&type=signup`,
    );
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "signup",
      token_hash: TOKEN,
    });
    expect(url).toBe("/setup");
  });

  it("honours a safe next", async () => {
    const url = await landsOn(
      confirmGET,
      `/auth/confirm?token_hash=${TOKEN}&type=signup&next=%2Fleads`,
    );
    expect(url).toBe("/leads");
  });

  it.each([
    "https://evil.test/steal",
    "//evil.test",
    "/%2f%2fevil.test",
    "/\\evil.test",
  ])("ignores a hostile next (%s) and uses the safe default", async (next) => {
    const url = await landsOn(
      confirmGET,
      `/auth/confirm?token_hash=${TOKEN}&type=signup&next=${encodeURIComponent(next)}`,
    );
    expect(url).toBe("/setup");
  });

  it("always sends a recovery link to the set-a-password screen", async () => {
    const url = await landsOn(
      confirmGET,
      `/auth/confirm?token_hash=${TOKEN}&type=recovery&next=%2Fdashboard`,
    );
    // The session exists but no new password has been chosen yet, so the user
    // must not be dropped into the application.
    expect(url).toBe("/reset-password");
  });
});

describe("/auth/confirm — failed verification", () => {
  it("reports an expired link without echoing the Supabase error", async () => {
    verifyOtp.mockResolvedValue({
      error: { message: "Token has expired or is invalid", status: 403 },
    });
    const url = await landsOn(
      confirmGET,
      `/auth/confirm?token_hash=${TOKEN}&type=signup`,
    );
    expect(url).toBe("/auth/auth-error?reason=expired_link");
    expect(url).not.toMatch(/expired or is invalid/);
  });

  it("does not follow next when verification failed", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "nope" } });
    const url = await landsOn(
      confirmGET,
      `/auth/confirm?token_hash=${TOKEN}&type=signup&next=%2Fleads`,
    );
    expect(url).toBe("/auth/auth-error?reason=expired_link");
  });
});

describe("/auth/callback — PKCE code exchange", () => {
  it.each([
    ["/auth/callback", "no code"],
    ["/auth/callback?code=", "an empty code"],
    ["/auth/callback?code=tooshort", "an implausibly short code"],
  ])("rejects a link with %s (%s)", async (url) => {
    expect(await landsOn(callbackGET, url)).toBe(
      "/auth/auth-error?reason=invalid_link",
    );
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("exchanges a plausible code and continues to onboarding", async () => {
    const url = await landsOn(callbackGET, `/auth/callback?code=${CODE}`);
    expect(exchangeCodeForSession).toHaveBeenCalledWith(CODE);
    expect(url).toBe("/setup");
  });

  it("honours a safe next", async () => {
    expect(
      await landsOn(callbackGET, `/auth/callback?code=${CODE}&next=%2Freports`),
    ).toBe("/reports");
  });

  it("ignores a hostile next", async () => {
    expect(
      await landsOn(
        callbackGET,
        `/auth/callback?code=${CODE}&next=https%3A%2F%2Fevil.test`,
      ),
    ).toBe("/setup");
  });

  it("reports a failed exchange without leaking the reason", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { message: "invalid request: both auth code and code verifier" },
    });
    const url = await landsOn(callbackGET, `/auth/callback?code=${CODE}`);
    expect(url).toBe("/auth/auth-error?reason=expired_link");
    expect(url).not.toMatch(/verifier/);
  });
});
