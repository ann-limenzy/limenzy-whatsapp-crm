// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The chooser page: what it routes, what it refuses, and what it renders.
 *
 * The 404 on an explicit miss is the point of several of these: specification
 * work aside, the standing rule is that a cross-tenant miss returns 404, never
 * 403, because a 403 confirms the record exists somewhere.
 */

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-user", () => ({ requireUser }));

const resolveWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-context", () => ({ resolveWorkspaceContext }));

const resolveNamedWorkspaceChoices = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-names", () => ({
  resolveNamedWorkspaceChoices,
}));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}
class NotFoundError extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}
const redirectMock = vi.hoisted(() => vi.fn());
const notFoundMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  notFound: () => notFoundMock(),
}));

vi.mock("@/app/(account)/select-workspace/actions", () => ({
  selectWorkspaceAction: vi.fn(),
}));

const SelectWorkspacePage = (
  await import("@/app/(account)/select-workspace/page")
).default;

const A = "2b2b2b2b-2222-4222-8222-2222222222bb";
const B = "3c3c3c3c-3333-4333-8333-3333333333cc";

const VERIFIED = {
  id: "1a1a1a1a-1111-4111-8111-1111111111aa",
  email: "person@example.com",
  emailVerified: true,
  fullName: "Ann Sebastian",
};

const CHOICES = {
  kind: "choices",
  choices: [
    { workspaceId: A, role: "owner_admin", name: "Alpha Insurance" },
    { workspaceId: B, role: "staff_sales", name: "Beta Services" },
  ],
} as const;

const open = async (params: Record<string, string> = {}) => {
  requireUser.mockResolvedValue(VERIFIED);
  redirectMock.mockImplementation((url: string) => {
    throw new RedirectError(url);
  });
  notFoundMock.mockImplementation(() => {
    throw new NotFoundError();
  });
  return SelectWorkspacePage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(params),
  } as never);
};

/** Open the page, reporting a redirect or a 404 instead of throwing. */
const outcomeOf = async (params: Record<string, string> = {}) => {
  try {
    await open(params);
    return "(rendered)";
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    if (error instanceof NotFoundError) return "(404)";
    throw error;
  }
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("routing", () => {
  it("renders the chooser when there are choices", async () => {
    resolveNamedWorkspaceChoices.mockResolvedValue(CHOICES);
    expect(await outcomeOf()).toBe("(rendered)");
  });

  it("sends a profile-less user to setup, and a member-less one to no-access", async () => {
    resolveNamedWorkspaceChoices.mockResolvedValue({
      kind: "onboarding_required",
    });
    expect(await outcomeOf()).toBe("/setup");

    resolveNamedWorkspaceChoices.mockResolvedValue({
      kind: "access_unavailable",
    });
    expect(await outcomeOf()).toBe("/no-access");
  });

  it("puts those states ahead of ?change=1", async () => {
    resolveNamedWorkspaceChoices.mockResolvedValue({
      kind: "access_unavailable",
    });
    // change=1 asks for the chooser; it cannot conjure access.
    expect(await outcomeOf({ change: "1" })).toBe("/no-access");
  });

  it("reads no saved preference, so a stale cookie cannot bounce it", async () => {
    resolveNamedWorkspaceChoices.mockResolvedValue(CHOICES);
    await outcomeOf({ change: "1" });

    const { readFile } = await import("node:fs/promises");
    const source = (
      await readFile("src/app/(account)/select-workspace/page.tsx", "utf8")
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    for (const forbidden of [
      "readWorkspacePreference",
      "cookies(",
      "WORKSPACE_COOKIE",
    ]) {
      expect(`${forbidden}: ${source.includes(forbidden)}`).toBe(
        `${forbidden}: false`,
      );
    }
  });
});

describe("an explicit workspace in the URL", () => {
  it("is a 404 when it is not an active membership", async () => {
    resolveWorkspaceContext.mockResolvedValue({ kind: "forbidden" });
    resolveNamedWorkspaceChoices.mockResolvedValue(CHOICES);

    expect(await outcomeOf({ workspace: B })).toBe("(404)");
    expect(resolveWorkspaceContext).toHaveBeenCalledWith(B);
  });

  it("answers foreign, inactive, malformed and invented the same way", async () => {
    resolveNamedWorkspaceChoices.mockResolvedValue(CHOICES);
    for (const value of [
      B,
      "not-a-uuid",
      "00000000-0000-4000-8000-000000000000",
    ]) {
      resolveWorkspaceContext.mockResolvedValue({ kind: "forbidden" });
      expect(await outcomeOf({ workspace: value })).toBe("(404)");
    }
  });

  it("renders the chooser when the deep link is genuinely theirs", async () => {
    resolveWorkspaceContext.mockResolvedValue({
      kind: "ok",
      context: { workspaceId: A },
      role: "owner_admin",
    });
    resolveNamedWorkspaceChoices.mockResolvedValue(CHOICES);

    // A GET does not select: the preference is written by the action.
    expect(await outcomeOf({ workspace: A })).toBe("(rendered)");
  });
});

describe("what it renders", () => {
  it("offers one control per workspace, naming each", async () => {
    resolveNamedWorkspaceChoices.mockResolvedValue(CHOICES);
    render(await open());

    expect(
      screen.getByRole("button", { name: /Alpha Insurance/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Beta Services/ }),
    ).toBeInTheDocument();
  });

  it("shows the role as a label, and no identifier", async () => {
    resolveNamedWorkspaceChoices.mockResolvedValue(CHOICES);
    const { container } = render(await open());

    expect(screen.getByText("Owner / Admin")).toBeInTheDocument();
    expect(screen.getByText("Staff")).toBeInTheDocument();
    // The ids travel in hidden fields, never as visible text.
    expect(container.textContent).not.toContain(A);
    expect(container.textContent).not.toContain("owner_admin");
  });

  it("carries only a validated return destination into the form", async () => {
    resolveNamedWorkspaceChoices.mockResolvedValue(CHOICES);
    const { container } = render(await open({ next: "https://evil.test/x" }));

    const next = container.querySelector('input[name="next"]');
    expect(next?.getAttribute("value")).toBe("");
  });

  it("keeps a safe return destination", async () => {
    resolveNamedWorkspaceChoices.mockResolvedValue(CHOICES);
    const { container } = render(await open({ next: "/renewals" }));

    const next = container.querySelector('input[name="next"]');
    expect(next?.getAttribute("value")).toBe("/renewals");
  });
});
