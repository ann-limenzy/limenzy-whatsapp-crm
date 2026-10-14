// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The access-unavailable screen.
 *
 * Specification §159 and §160 deactivate rather than delete, so this is where
 * someone lands after being removed from every workspace. The two things this
 * screen must get right: it never offers a replacement workspace, and it
 * re-resolves rather than trusting how the visitor arrived.
 */

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-user", () => ({ requireUser }));

const resolveWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-context", () => ({ resolveWorkspaceContext }));

vi.mock("@/app/actions/auth", () => ({ signOutAction: vi.fn() }));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}
const redirectMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

const NoAccessPage = (await import("@/app/(account)/no-access/page")).default;

const VERIFIED = {
  id: "1a1a1a1a-1111-4111-8111-1111111111aa",
  email: "person@example.com",
  emailVerified: true,
  fullName: "Ann Sebastian",
};

const open = async () => {
  requireUser.mockResolvedValue(VERIFIED);
  redirectMock.mockImplementation((url: string) => {
    throw new RedirectError(url);
  });
  return NoAccessPage();
};

const outcomeOf = async () => {
  try {
    await open();
    return "(rendered)";
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    throw error;
  }
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("what it shows", () => {
  it("explains the situation and offers sign-out", async () => {
    resolveWorkspaceContext.mockResolvedValue({ kind: "access_unavailable" });
    render(await open());

    expect(
      screen.getByRole("heading", {
        name: /do not have access to a workspace/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /sign out/i }),
    ).toBeInTheDocument();
  });

  it("never offers to create a replacement workspace", async () => {
    resolveWorkspaceContext.mockResolvedValue({ kind: "access_unavailable" });
    const { container } = render(await open());

    expect(
      screen.queryByRole("link", { name: /create|set up|new workspace/i }),
    ).toBeNull();
    expect(container.innerHTML).not.toContain("/setup");
    // Deactivation is not permission to start again.
    expect(container.textContent).not.toMatch(/create a (new )?workspace/i);
  });
});

describe("it re-resolves on every visit", () => {
  it("routes onward when access has been restored", async () => {
    resolveWorkspaceContext.mockResolvedValue({
      kind: "ok",
      context: { workspaceId: "w" },
      role: "manager",
    });
    expect(await outcomeOf()).toBe("/");
  });

  it("routes to the chooser when several memberships now exist", async () => {
    resolveWorkspaceContext.mockResolvedValue({
      kind: "workspace_selection_required",
      choices: [],
    });
    expect(await outcomeOf()).toBe("/select-workspace");
  });

  it("routes to setup when the profile itself is gone", async () => {
    resolveWorkspaceContext.mockResolvedValue({ kind: "onboarding_required" });
    expect(await outcomeOf()).toBe("/setup");
  });
});
