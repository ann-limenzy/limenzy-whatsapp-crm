// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Choosing a workspace.
 *
 * The resolver is doubled; what is tested is this action's own promises: that
 * a submitted id is re-validated before anything is remembered, that a refusal
 * says nothing about why, and that no preference is written on a refusal.
 */

const resolveWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-context", () => ({ resolveWorkspaceContext }));

const writeWorkspacePreference = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-selection", () => ({
  writeWorkspacePreference,
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

const { selectWorkspaceAction } =
  await import("@/app/(account)/select-workspace/actions");
const { SELECTION_INITIAL_STATE } =
  await import("@/app/(account)/select-workspace/selection-state");

const WORKSPACE = "2b2b2b2b-2222-4222-8222-2222222222bb";
const OTHER = "3c3c3c3c-3333-4333-8333-3333333333cc";

const formOf = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
};

/** Submit, returning either the redirect destination or the returned state. */
const choose = async (values: Record<string, string>) => {
  redirectMock.mockImplementation((url: string) => {
    throw new RedirectError(url);
  });
  try {
    const state = await selectWorkspaceAction(
      SELECTION_INITIAL_STATE,
      formOf(values),
    );
    return { redirected: null as string | null, state };
  } catch (error) {
    if (error instanceof RedirectError) {
      return { redirected: error.url, state: null };
    }
    throw error;
  }
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("an accepted choice", () => {
  it("re-validates the submitted id before remembering it", async () => {
    resolveWorkspaceContext.mockResolvedValue({
      kind: "ok",
      context: { workspaceId: WORKSPACE },
      role: "manager",
    });

    const result = await choose({ workspaceId: WORKSPACE, next: "/leads" });

    expect(resolveWorkspaceContext).toHaveBeenCalledWith(WORKSPACE);
    expect(result.redirected).toBe("/leads");
  });

  it("remembers the id the resolver matched, not the one submitted", async () => {
    // They are the same string here, but the SOURCE matters: the value written
    // comes from the resolved context, so a resolver that matched something
    // else could never be overridden by the form.
    resolveWorkspaceContext.mockResolvedValue({
      kind: "ok",
      context: { workspaceId: OTHER },
      role: "staff_sales",
    });

    await choose({ workspaceId: WORKSPACE, next: "" });
    expect(writeWorkspacePreference).toHaveBeenCalledWith(OTHER);
  });

  it("falls back to the root route, which decides where they belong", async () => {
    resolveWorkspaceContext.mockResolvedValue({
      kind: "ok",
      context: { workspaceId: WORKSPACE },
      role: "owner_admin",
    });

    expect((await choose({ workspaceId: WORKSPACE })).redirected).toBe("/");
  });

  it("refuses an unsafe return destination", async () => {
    resolveWorkspaceContext.mockResolvedValue({
      kind: "ok",
      context: { workspaceId: WORKSPACE },
      role: "owner_admin",
    });

    const result = await choose({
      workspaceId: WORKSPACE,
      next: "https://evil.test/x",
    });
    expect(result.redirected).toBe("/");
  });
});

describe("a refused choice", () => {
  it("says nothing about why, and writes no preference", async () => {
    resolveWorkspaceContext.mockResolvedValue({ kind: "forbidden" });

    const result = await choose({ workspaceId: OTHER });

    expect(result.redirected).toBeNull();
    expect(result.state?.status).toBe("unavailable");
    expect(writeWorkspacePreference).not.toHaveBeenCalled();
    // Nothing that distinguishes foreign from deactivated from invented, and
    // no identifier echoed back.
    const serialised = JSON.stringify(result.state);
    expect(serialised).not.toContain(OTHER);
    expect(serialised).not.toMatch(
      /deactivat|inactive|another|other user|does not exist|belongs/i,
    );
  });

  it("answers a forged id exactly as it answers a stale one", async () => {
    resolveWorkspaceContext.mockResolvedValue({ kind: "forbidden" });
    const forged = await choose({ workspaceId: "not-a-uuid" });

    resolveWorkspaceContext.mockResolvedValue({ kind: "forbidden" });
    const stale = await choose({ workspaceId: OTHER });

    expect(forged.state?.status).toBe(stale.state?.status);
    expect(forged.state?.message).toBe(stale.state?.message);
  });

  it("does not treat a submitted id as proof it was ever offered", async () => {
    resolveWorkspaceContext.mockResolvedValue({ kind: "forbidden" });
    await choose({ workspaceId: OTHER });
    // The only thing consulted is the resolver, which reads memberships under
    // row-level security on this request.
    expect(resolveWorkspaceContext).toHaveBeenCalledTimes(1);
    expect(writeWorkspacePreference).not.toHaveBeenCalled();
  });

  it("handles access that changed underneath without writing anything", async () => {
    for (const kind of [
      "access_unavailable",
      "onboarding_required",
      "unauthenticated",
      "workspace_selection_required",
    ]) {
      vi.clearAllMocks();
      resolveWorkspaceContext.mockResolvedValue({ kind, choices: [] });
      const result = await choose({ workspaceId: WORKSPACE });
      expect(result.state?.status).toBe("unavailable");
      expect(writeWorkspacePreference).not.toHaveBeenCalled();
    }
  });

  it("reports a resolution failure as retryable, not as a refusal", async () => {
    resolveWorkspaceContext.mockRejectedValue(
      new Error("identity resolution: the database could not be reached"),
    );

    const result = await choose({ workspaceId: WORKSPACE });
    expect(result.state?.status).toBe("error");
    expect(result.state?.message).toMatch(/try again/i);
    // An outage must never read as "that workspace is not yours".
    expect(result.state?.message).not.toMatch(/not available|no longer/i);
    expect(JSON.stringify(result.state)).not.toMatch(/database|sql|postgres/i);
    expect(writeWorkspacePreference).not.toHaveBeenCalled();
  });
});

describe("what the action never does", () => {
  it("mints no context and reads no identity of its own", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = (
      await readFile("src/app/(account)/select-workspace/actions.ts", "utf8")
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    for (const forbidden of [
      "createTenantContext",
      "withTenant",
      "resolveVerifiedIdentity",
      "server/db/",
      "clearWorkspacePreference",
    ]) {
      expect(`${forbidden}: ${source.includes(forbidden)}`).toBe(
        `${forbidden}: false`,
      );
    }
  });
});
