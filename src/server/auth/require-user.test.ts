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

  it("treats a missing verification claim as unverified — fail closed", async () => {
    signedIn({ sub: "u", email: "ann@example.com" });
    const user = await getAuthenticatedUser();
    expect(user?.emailVerified).toBe(false);
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
