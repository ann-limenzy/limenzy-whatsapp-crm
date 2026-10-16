import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What `/setup` says to somebody who expected to join a team.
 *
 * The case this comes from: an invitation was sent to
 * `someone@example.com` and the person signed up as `someone@example.test`.
 * Both accounts were confirmed, the lookup ran perfectly, and it correctly
 * found nothing — because an invitation matches the invited address exactly.
 * They were then shown a form for building a company, with nothing on the
 * page to explain why their invitation had apparently vanished.
 *
 * So the three states must each say their own thing, and must not be
 * confusable:
 *
 *   an invitation is waiting  -> offer it
 *   none is waiting           -> name the address they used
 *   the lookup failed         -> say it is UNKNOWN, and warn them off
 */

const requireUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-user", () => ({ requireUser }));

const resolveWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-context", () => ({ resolveWorkspaceContext }));

const pendingInvitationsForMe = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/invitation-acceptance", () => ({
  pendingInvitationsForMe,
}));

vi.mock("@/app/(account)/setup/setup-form", () => ({
  SetupForm: () => <div data-testid="setup-form" />,
}));

const SetupPage = (await import("./page")).default;

const SIGNED_IN = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "laksmi@example.test",
  emailVerified: true,
  fullName: "Laksmi",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue(SIGNED_IN);
  resolveWorkspaceContext.mockResolvedValue({ kind: "onboarding_required" });
  pendingInvitationsForMe.mockResolvedValue({ status: "ok", invitations: [] });
});

describe("when no invitation matches the address they used", () => {
  it("names that address, so the mismatch is visible", async () => {
    render(await SetupPage());

    expect(screen.getByText("Were you invited to a team?")).toBeInTheDocument();
    expect(screen.getByText("laksmi@example.test")).toBeInTheDocument();
  });

  it("explains that the address must match exactly", async () => {
    const { container } = render(await SetupPage());
    expect(container.textContent).toContain(
      "only works for the exact address it was sent to",
    );
  });

  it("still offers the company form — an ordinary signup is the common case", async () => {
    render(await SetupPage());
    expect(screen.getByTestId("setup-form")).toBeInTheDocument();
    expect(screen.getByText("Set up your company")).toBeInTheDocument();
  });

  it("names no address but their own", async () => {
    // It must not confirm or deny that any particular invitation exists.
    const { container } = render(await SetupPage());
    const addresses = (container.textContent ?? "").match(/[\w.+-]+@[\w.-]+/g);
    expect(addresses).toEqual(["laksmi@example.test"]);
  });
});

describe("when an invitation IS waiting", () => {
  beforeEach(() => {
    pendingInvitationsForMe.mockResolvedValue({
      status: "ok",
      invitations: [
        {
          invitationId: "22222222-2222-4222-8222-222222222222",
          workspaceName: "Test Business",
          role: "staff_sales",
          expiresAt: new Date("2026-10-30T00:00:00.000Z"),
        },
      ],
    });
  });

  it("offers it, and does not ask whether they were invited", async () => {
    render(await SetupPage());
    expect(
      screen.getByText("You have been invited to join Test Business."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Were you invited to a team?")).toBeNull();
  });
});

describe("when the lookup could not be made", () => {
  beforeEach(() => {
    pendingInvitationsForMe.mockResolvedValue({ status: "unavailable" });
  });

  it("says it is unknown rather than claiming nothing is waiting", async () => {
    render(await SetupPage());
    expect(
      screen.getByText("We could not check whether you have an invitation."),
    ).toBeInTheDocument();
    // The "no invitation for your address" note would be a claim it cannot
    // support, so it must not appear alongside.
    expect(screen.queryByText("Were you invited to a team?")).toBeNull();
  });

  it("and still lets an ordinary signup proceed", async () => {
    render(await SetupPage());
    expect(screen.getByTestId("setup-form")).toBeInTheDocument();
  });
});
