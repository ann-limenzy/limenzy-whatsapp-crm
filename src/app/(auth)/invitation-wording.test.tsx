import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * What the sign-up and verification screens SAY on the invitation journey.
 *
 * Somebody who was invited was told they were "setting up the owner account
 * for your business" and would "continue setting up your workspace" — neither
 * of which is what happens to them. They join a team that already exists.
 *
 * Wording only. Nothing here decides a role, a permission or what acceptance
 * does; those are settled by stored memberships and the acceptance routine,
 * and are covered elsewhere.
 */

vi.mock("@/server/auth/require-user", () => ({
  requireAnonymous: vi.fn(async () => undefined),
}));
vi.mock("@/components/auth/sign-up-form", () => ({
  SignUpForm: ({ next }: { next: string }) => (
    <div data-testid="sign-up-form" data-next={next} />
  ),
}));
vi.mock("@/components/auth/resend-verification-form", () => ({
  ResendVerificationForm: ({ next }: { next?: string }) => (
    <div data-testid="resend-form" data-next={next ?? ""} />
  ),
}));

const SignUpPage = (await import("./sign-up/page")).default;
const VerifyEmailPage = (await import("./verify-email/page")).default;

const asPage = <T,>(params: T) =>
  ({ searchParams: Promise.resolve(params) }) as never;

describe("creating an account to join a team", () => {
  it("says so, and says which address to use", async () => {
    render(await SignUpPage(asPage({ next: "/invitations" })));

    expect(
      screen.getByText("Create your account to join your team"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Use the email address that received your invitation. After confirming your email, you can join your team's CRM.",
      ),
    ).toBeInTheDocument();
  });

  it("never calls them an owner or mentions creating a workspace", async () => {
    const { container } = render(
      await SignUpPage(asPage({ next: "/invitations" })),
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/owner/i);
    expect(text).not.toMatch(/create your workspace/i);
    expect(text).not.toMatch(/your business/i);
  });

  it("keeps the journey on the link across to signing in", async () => {
    render(await SignUpPage(asPage({ next: "/invitations" })));
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Finvitations",
    );
  });
});

describe("an ordinary signup is left alone", () => {
  it("still describes setting up the owner account", async () => {
    render(await SignUpPage(asPage({})));

    expect(screen.getByText("Create your account")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Set up the owner account for your business. You can create your workspace after confirming your email address.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });

  it("and is not diverted by a destination it should not trust", async () => {
    render(await SignUpPage(asPage({ next: "https://evil.test" })));
    expect(screen.getByText("Create your account")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
  });
});

describe("the verification screen", () => {
  it("promises joining a team, not setting one up", async () => {
    const { container } = render(
      await VerifyEmailPage(
        asPage({ email: "sam@example.com", next: "/invitations" }),
      ),
    );
    expect(container.textContent).toContain("join your team");
    expect(container.textContent).not.toMatch(/setting up your workspace/i);
    expect(screen.getByTestId("resend-form")).toHaveAttribute(
      "data-next",
      "/invitations",
    );
  });

  it("keeps the journey on its sign-in link", async () => {
    render(await VerifyEmailPage(asPage({ next: "/invitations" })));
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/sign-in?next=%2Finvitations");
  });

  it("still says 'setting up your workspace' for an ordinary signup", async () => {
    const { container } = render(
      await VerifyEmailPage(asPage({ email: "ann@example.com" })),
    );
    expect(container.textContent).toContain("setting up your workspace");
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/sign-in");
  });

  it("refuses an external destination on that link", async () => {
    render(await VerifyEmailPage(asPage({ next: "https://evil.test" })));
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/sign-in");
  });
});
