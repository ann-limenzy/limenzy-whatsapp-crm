import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route protection.
 *
 * Supabase is doubled at exactly one seam — the module that creates the server
 * client — so everything under test here is the real production code path:
 * real claim reading, real redirect validation, real fail-closed decisions.
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
    // Mirrors Next's behaviour: redirect() throws, so nothing after it runs.
    redirectMock: vi.fn((url: string) => {
      throw new RedirectError(url);
    }),
  };
});

const { headersMock } = vi.hoisted(() => ({ headersMock: vi.fn() }));

const { getClaims, createClient } = vi.hoisted(() => {
  const getClaims = vi.fn();
  return {
    getClaims,
    createClient: vi.fn(async () => ({ auth: { getClaims } })),
  };
});

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { getAuthenticatedUser, requireAnonymous, requireUser } =
  await import("@/server/auth/require-user");

/** Run something expected to redirect, and report where it went. */
async function redirectedTo(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    throw error;
  }
  throw new Error("Expected a redirect, but the call returned normally.");
}

function signedIn(claims: Record<string, unknown>) {
  getClaims.mockResolvedValue({ data: { claims }, error: null });
}

function signedOut() {
  getClaims.mockResolvedValue({ data: null, error: null });
}

beforeEach(() => {
  getClaims.mockReset();
  redirectMock.mockClear();
  headersMock.mockResolvedValue(new Headers());
});

/** Simulate the proxy having stamped the requested path onto the request. */
function requestPath(path: string) {
  headersMock.mockResolvedValue(new Headers({ "x-limenzy-pathname": path }));
}

describe("getAuthenticatedUser", () => {
  it("maps verified claims onto the user shape", async () => {
    signedIn({
      sub: "user-123",
      email: "ann@example.com",
      email_verified: true,
      user_metadata: { full_name: "Ann Sebastian" },
    });

    expect(await getAuthenticatedUser()).toEqual({
      id: "user-123",
      email: "ann@example.com",
      emailVerified: true,
      fullName: "Ann Sebastian",
    });
  });

  it("falls back to the name claim when full_name is absent", async () => {
    signedIn({ sub: "u", user_metadata: { name: "  Ann  " } });
    expect((await getAuthenticatedUser())?.fullName).toBe("Ann");
  });

  it("honours an explicit verification claim, including a false one", async () => {
    // A claim that says "not verified" still fails closed. This is the half of
    // the old assertion that was right.
    signedIn({ sub: "u", email: "ann@example.com", email_verified: false });
    expect((await getAuthenticatedUser())?.emailVerified).toBe(false);

    signedIn({ sub: "u", email: "ann@example.com", email_verified: "false" });
    expect((await getAuthenticatedUser())?.emailVerified).toBe(false);

    signedIn({ sub: "u", email: "ann@example.com", email_verified: true });
    expect((await getAuthenticatedUser())?.emailVerified).toBe(true);
  });

  /**
   * The regression that manual testing found.
   *
   * These are the exact top-level claim keys a local Supabase access token
   * carries — captured from a real token, not invented. There is **no**
   * `email_verified` among them, so the previous "absent means unverified"
   * rule made every signed-in user unverified. Pages kept working, because
   * `requireUser()` gates on identity alone; every Server Action that checks
   * verification classified a perfectly valid session as unauthenticated.
   */
  const REAL_SUPABASE_CLAIMS = Object.freeze({
    aal: "aal1",
    amr: [{ method: "password", timestamp: 1_758_000_000 }],
    app_metadata: { provider: "email", providers: ["email"] },
    aud: "authenticated",
    email: "ann@example.com",
    exp: 1_758_003_600,
    iat: 1_758_000_000,
    is_anonymous: false,
    iss: "http://127.0.0.1:54321/auth/v1",
    phone: "",
    role: "authenticated",
    session_id: "b0a1c2d3-e4f5-4678-9abc-def012345678",
    sub: "1a1a1a1a-1111-4111-8111-1111111111aa",
    user_metadata: {
      email: "ann@example.com",
      email_verified: true,
      full_name: "Ann Sebastian",
      phone_verified: false,
      sub: "1a1a1a1a-1111-4111-8111-1111111111aa",
    },
  });

  it("treats a real Supabase session as verified, with no such claim present", async () => {
    signedIn({ ...REAL_SUPABASE_CLAIMS });
    const user = await getAuthenticatedUser();

    expect(user).not.toBeNull();
    expect(user?.id).toBe("1a1a1a1a-1111-4111-8111-1111111111aa");
    // The token exists, and Supabase issues none to an unconfirmed address
    // while confirmations are on — so this must be true.
    expect(user?.emailVerified).toBe(true);
    expect(user?.fullName).toBe("Ann Sebastian");
  });

  it("does not let user-writable metadata assert verification", async () => {
    // `updateUser({ data })` lets a user write their own user_metadata, so it
    // must never be the authority. An explicit top-level claim of false wins
    // over metadata claiming true.
    signedIn({
      ...REAL_SUPABASE_CLAIMS,
      email_verified: false,
      user_metadata: {
        ...REAL_SUPABASE_CLAIMS.user_metadata,
        email_verified: true,
      },
    });
    expect((await getAuthenticatedUser())?.emailVerified).toBe(false);
  });

  it("still returns nothing for a missing or broken session", async () => {
    signedOut();
    expect(await getAuthenticatedUser()).toBeNull();

    getClaims.mockResolvedValue({
      data: null,
      error: { message: "jwt expired" },
    });
    expect(await getAuthenticatedUser()).toBeNull();

    // A token with no subject is not an identity either.
    signedIn({ ...REAL_SUPABASE_CLAIMS, sub: "" });
    expect(await getAuthenticatedUser()).toBeNull();
  });

  it("returns null when the token has no subject", async () => {
    signedIn({ email: "ann@example.com" });
    expect(await getAuthenticatedUser()).toBeNull();
  });

  it("returns null when verification fails", async () => {
    getClaims.mockResolvedValue({
      data: null,
      error: { message: "invalid JWT signature" },
    });
    expect(await getAuthenticatedUser()).toBeNull();
  });

  it("returns null when there is no session at all", async () => {
    signedOut();
    expect(await getAuthenticatedUser()).toBeNull();
  });

  it("does not accept a non-string subject", async () => {
    signedIn({ sub: 12345 });
    expect(await getAuthenticatedUser()).toBeNull();
  });

  it("ignores a malformed user_metadata rather than throwing", async () => {
    signedIn({ sub: "u", user_metadata: "not-an-object" });
    expect((await getAuthenticatedUser())?.fullName).toBeNull();
  });
});

describe("requireUser — protects authenticated routes", () => {
  it("returns the user and does not redirect when signed in", async () => {
    signedIn({ sub: "u", email: "ann@example.com", email_verified: true });
    const user = await requireUser("/dashboard");
    expect(user.id).toBe("u");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated visitor to sign-in", async () => {
    signedOut();
    expect(await redirectedTo(() => requireUser())).toBe("/sign-in");
  });

  it("preserves the intended destination", async () => {
    signedOut();
    expect(
      await redirectedTo(() => requireUser("/customers/42?tab=notes")),
    ).toBe("/sign-in?next=%2Fcustomers%2F42%3Ftab%3Dnotes");
  });

  it("refuses to carry an external destination into the sign-in link", async () => {
    signedOut();
    expect(
      await redirectedTo(() => requireUser("https://evil.test/steal")),
    ).toBe("/sign-in");
  });

  it("does not build a sign-in link that points back at sign-in", async () => {
    signedOut();
    expect(await redirectedTo(() => requireUser("/sign-in"))).toBe("/sign-in");
  });
});

describe("requireUser — recovers the destination from the proxy header", () => {
  it("preserves the path the proxy stamped, with no argument passed", async () => {
    signedOut();
    requestPath("/renewals");
    expect(await redirectedTo(() => requireUser())).toBe(
      "/sign-in?next=%2Frenewals",
    );
  });

  it("prefers an explicit argument over the header", async () => {
    signedOut();
    requestPath("/renewals");
    expect(await redirectedTo(() => requireUser("/reports"))).toBe(
      "/sign-in?next=%2Freports",
    );
  });

  it("validates the header like any other input", async () => {
    signedOut();
    // The proxy overwrites this header on every request, but the value is
    // still validated rather than trusted.
    requestPath("//evil.test");
    expect(await redirectedTo(() => requireUser())).toBe("/sign-in");
  });

  it("works outside a request context", async () => {
    signedOut();
    headersMock.mockRejectedValue(new Error("no request scope"));
    expect(await redirectedTo(() => requireUser())).toBe("/sign-in");
  });
});

describe("requireAnonymous — keeps signed-in users off the auth screens", () => {
  it("does nothing when nobody is signed in", async () => {
    signedOut();
    await expect(requireAnonymous("/dashboard")).resolves.toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("moves a signed-in user forward", async () => {
    signedIn({ sub: "u" });
    expect(await redirectedTo(() => requireAnonymous("/leads"))).toBe("/leads");
  });

  it("sends a signed-in user to the default when next is hostile", async () => {
    signedIn({ sub: "u" });
    expect(await redirectedTo(() => requireAnonymous("//evil.test"))).toBe(
      "/dashboard",
    );
  });
});
