// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The workspace gate: every resolver state, and where it sends the request.
 *
 * The resolver itself is doubled — Phase 4A/4B already prove what it answers
 * against a real database. What is tested here is the half this phase owns:
 * that each answer becomes the right navigation, that a saved preference is
 * only ever a candidate, and that nothing here mutates a cookie.
 */

const resolveWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-context", () => ({ resolveWorkspaceContext }));

const requireUser = vi.hoisted(() => vi.fn());
const getAuthenticatedUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-user", () => ({
  requireUser,
  getAuthenticatedUser,
}));

const readWorkspacePreference = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-selection", () => ({
  readWorkspacePreference,
}));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}
const redirectMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

const headersMock = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: headersMock }));

const { WorkspaceGateError, requireWorkspaceContext, safeWorkspaceReturn } =
  await import("@/server/auth/require-workspace");

const VERIFIED = {
  id: "1a1a1a1a-1111-4111-8111-1111111111aa",
  email: "person@example.com",
  emailVerified: true,
  fullName: "Ann Sebastian",
};

const WORKSPACE = "2b2b2b2b-2222-4222-8222-2222222222bb";

afterEach(() => {
  vi.clearAllMocks();
});

const setUp = (path = "/leads") => {
  requireUser.mockResolvedValue(VERIFIED);
  // The recheck inside the `unauthenticated` branch sees the same person
  // unless a test says otherwise.
  getAuthenticatedUser.mockResolvedValue(VERIFIED);
  readWorkspacePreference.mockResolvedValue(undefined);
  headersMock.mockResolvedValue(new Headers({ "x-limenzy-pathname": path }));
  redirectMock.mockImplementation((url: string) => {
    throw new RedirectError(url);
  });
};

/** Where the gate sent this request, or "(allowed)" when it let it through. */
const gate = async (): Promise<string> => {
  try {
    await requireWorkspaceContext();
    return "(allowed)";
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    throw error;
  }
};

describe("each resolver state routes somewhere that can fix it", () => {
  it("lets a resolved membership through, with its role", async () => {
    setUp();
    const context = { workspaceId: WORKSPACE };
    resolveWorkspaceContext.mockResolvedValue({
      kind: "ok",
      context,
      role: "manager",
    });

    const access = await requireWorkspaceContext();
    expect(access.workspaceId).toBe(WORKSPACE);
    expect(access.role).toBe("manager");
    expect(access.context).toBe(context);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("sends a profile-less user to setup", async () => {
    setUp();
    resolveWorkspaceContext.mockResolvedValue({ kind: "onboarding_required" });
    expect(await gate()).toBe("/setup");
  });

  it("sends a user with no active membership to no-access, never to setup", async () => {
    setUp();
    resolveWorkspaceContext.mockResolvedValue({ kind: "access_unavailable" });
    const destination = await gate();
    expect(destination).toBe("/no-access");
    // Deactivation is not permission to create a replacement workspace.
    expect(destination).not.toBe("/setup");
  });

  it("sends several memberships to the chooser, preserving where they were going", async () => {
    setUp("/customers");
    resolveWorkspaceContext.mockResolvedValue({
      kind: "workspace_selection_required",
      choices: [],
    });
    expect(await gate()).toBe("/select-workspace?next=%2Fcustomers");
  });

  it("explains an unconfirmed address instead of looping through sign-in", async () => {
    setUp();
    // Positively identified: a present identity whose address is unconfirmed.
    getAuthenticatedUser.mockResolvedValue({
      ...VERIFIED,
      emailVerified: false,
    });
    resolveWorkspaceContext.mockResolvedValue({ kind: "unauthenticated" });
    expect(await gate()).toBe("/verify-email");
  });
});

/**
 * The resolver answers `unauthenticated` for three different situations — no
 * user, an unconfirmed address, and a subject claim it will not act on. Only
 * the middle one is about email verification, and treating them alike sent a
 * visitor whose session had just expired to a page about confirming an email.
 */
describe("a lost identity is not an unverified address", () => {
  it("sends an expired session through the ordinary sign-in handling", async () => {
    setUp("/renewals");
    // The identity was there for the first read and gone for the second.
    getAuthenticatedUser.mockResolvedValue(null);
    requireUser.mockResolvedValueOnce(VERIFIED).mockImplementationOnce(() => {
      // What the real one does when nobody is signed in.
      redirectMock("/sign-in?next=%2Frenewals");
    });
    resolveWorkspaceContext.mockResolvedValue({ kind: "unauthenticated" });

    expect(await gate()).toBe("/sign-in?next=%2Frenewals");
    // Never the verification page: nothing here establishes that an address is
    // unconfirmed, because there is no identity to say it about.
    expect(redirectMock).not.toHaveBeenCalledWith("/verify-email");
  });

  it("refuses an identity it will not act on, without a redirect loop", async () => {
    setUp();
    // Present and confirmed, yet the resolver refuses — a malformed subject
    // claim is the remaining cause. Sign-in would bounce a live session
    // straight back here, so this fails closed instead.
    getAuthenticatedUser.mockResolvedValue(VERIFIED);
    resolveWorkspaceContext.mockResolvedValue({ kind: "unauthenticated" });

    await expect(requireWorkspaceContext()).rejects.toBeInstanceOf(
      WorkspaceGateError,
    );
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("carries no identifier in the refusal", async () => {
    setUp();
    resolveWorkspaceContext.mockResolvedValue({ kind: "unauthenticated" });

    const error = await requireWorkspaceContext().catch((e: unknown) => e);
    const text = `${(error as Error).name} ${(error as Error).message}`;
    expect(text).not.toContain(VERIFIED.id);
    expect(text).not.toContain(VERIFIED.email);
    expect(text).not.toMatch(/claim|token|sub\b|postgres|sql/i);
  });

  it("reads identity at most once more, so it cannot spin", async () => {
    setUp();
    resolveWorkspaceContext.mockResolvedValue({ kind: "unauthenticated" });

    await requireWorkspaceContext().catch(() => undefined);
    expect(getAuthenticatedUser).toHaveBeenCalledTimes(1);
    expect(resolveWorkspaceContext).toHaveBeenCalledTimes(1);
  });

  it("leaves every other resolution untouched", async () => {
    setUp();
    resolveWorkspaceContext.mockResolvedValue({ kind: "onboarding_required" });
    expect(await gate()).toBe("/setup");
    // The recheck belongs to the unauthenticated branch alone.
    expect(getAuthenticatedUser).not.toHaveBeenCalled();

    vi.clearAllMocks();
    setUp();
    resolveWorkspaceContext.mockResolvedValue({
      kind: "ok",
      context: { workspaceId: WORKSPACE },
      role: "manager",
    });
    const access = await requireWorkspaceContext();
    expect(access.workspaceId).toBe(WORKSPACE);
    expect(getAuthenticatedUser).not.toHaveBeenCalled();
  });
});

describe("a saved preference is only a candidate", () => {
  it("passes the cookie to the resolver untouched", async () => {
    setUp();
    readWorkspacePreference.mockResolvedValue("  NOT-A-UUID  ");
    resolveWorkspaceContext.mockResolvedValue({ kind: "forbidden" });

    await gate();
    // Not trimmed, lower-cased or otherwise repaired: a value needing repair
    // did not come from a list this user was given.
    expect(resolveWorkspaceContext).toHaveBeenCalledWith("  NOT-A-UUID  ");
  });

  it("sends a refused preference to the reset handler, not to a 404", async () => {
    setUp("/renewals");
    readWorkspacePreference.mockResolvedValue(WORKSPACE);
    resolveWorkspaceContext.mockResolvedValue({ kind: "forbidden" });

    expect(await gate()).toBe("/workspace/reset?next=%2Frenewals");
  });

  it("resolves with no candidate when nothing is saved", async () => {
    setUp();
    resolveWorkspaceContext.mockResolvedValue({
      kind: "ok",
      context: { workspaceId: WORKSPACE },
      role: "staff_sales",
    });

    await requireWorkspaceContext();
    expect(resolveWorkspaceContext).toHaveBeenCalledWith(undefined);
  });

  it("checks identity before it looks at any preference", async () => {
    setUp();
    const order: string[] = [];
    requireUser.mockImplementation(async () => {
      order.push("identity");
      return VERIFIED;
    });
    readWorkspacePreference.mockImplementation(async () => {
      order.push("preference");
      return undefined;
    });
    resolveWorkspaceContext.mockResolvedValue({
      kind: "ok",
      context: { workspaceId: WORKSPACE },
      role: "owner_admin",
    });

    await requireWorkspaceContext();
    expect(order).toEqual(["identity", "preference"]);
  });
});

describe("return destinations", () => {
  it("refuses external, scheme and protocol-relative destinations", async () => {
    for (const unsafe of [
      "https://evil.test/x",
      "//evil.test",
      "/\\evil.test",
      "javascript:alert(1)",
      "",
      null,
      undefined,
      42,
    ]) {
      expect(safeWorkspaceReturn(unsafe)).toBe("");
    }
  });

  it("refuses the account surfaces, so a choice cannot bounce back", async () => {
    for (const path of [
      "/setup",
      "/select-workspace",
      "/select-workspace?change=1",
      "/no-access",
      "/workspace/reset",
      "/workspace/reset?next=/leads",
    ]) {
      expect(safeWorkspaceReturn(path)).toBe("");
    }
  });

  it("keeps a real application destination", async () => {
    expect(safeWorkspaceReturn("/leads")).toBe("/leads");
    expect(safeWorkspaceReturn("/customers?page=2")).toBe("/customers?page=2");
  });
});

describe("what the gate never does", () => {
  it("mutates no cookie", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = (
      await readFile("src/server/auth/require-workspace.ts", "utf8")
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    // Writing during render is not supported by the platform, and clearing a
    // preference belongs to the reset handler.
    for (const forbidden of [
      "writeWorkspacePreference",
      "clearWorkspacePreference",
      "cookies(",
      "createTenantContext",
    ]) {
      expect(`${forbidden}: ${source.includes(forbidden)}`).toBe(
        `${forbidden}: false`,
      );
    }
  });

  it("caches nothing between requests", async () => {
    const { readFile } = await import("node:fs/promises");
    // Comments stripped: the doc comment above the gate explains that it
    // caches nothing, and the word itself must not fail its own assertion.
    const source = (
      await readFile("src/server/auth/require-workspace.ts", "utf8")
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(source).not.toMatch(/\bcache\(/);
    expect(source).not.toMatch(/unstable_cache/);
    // No module-level mutable state to hold a context or role in.
    const moduleLevel = source
      .split("\n")
      .filter((line) => /^(let|var)\s+\w/.test(line));
    expect(moduleLevel).toEqual([]);
  });
});
