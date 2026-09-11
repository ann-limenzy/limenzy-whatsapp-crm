import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TopBar } from "@/components/app-shell/top-bar";
import type { AuthenticatedUser } from "@/server/auth/require-user";

import { vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

// The sign-out action is a Server Action; the account menu only needs it to
// exist as a form target here.
vi.mock("@/app/actions/auth", () => ({ signOutAction: vi.fn() }));

/**
 * Search and notifications remain unbuilt, and these assertions stop a future
 * change from turning them into something that merely *looks* functional.
 *
 * The account control is different now: Milestone 1B replaced the "not signed
 * in" placeholder with a real, server-resolved identity. The assertion below
 * changed accordingly — it now checks that the menu shows the authenticated
 * user and offers a real sign-out, rather than that it disclaims having one.
 */
const TEST_USER: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "owner@example.com",
  emailVerified: true,
  fullName: "Test Owner",
};
describe("top bar — unbuilt features are presented honestly", () => {
  it("offers no text input to type a search into", () => {
    render(<TopBar user={TEST_USER} />);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("names the search control as unavailable", () => {
    render(<TopBar user={TEST_USER} />);
    expect(
      screen.getAllByRole("button", { name: /global search — not available/i })
        .length,
    ).toBeGreaterThan(0);
  });

  it("explains that search is not available when activated", async () => {
    const user = userEvent.setup();
    render(<TopBar user={TEST_USER} />);

    await user.click(screen.getByTestId("global-search"));

    expect(
      await screen.findByText(/global search isn't available yet/i),
    ).toBeVisible();
  });

  it("explains that notifications are not available when activated", async () => {
    const user = userEvent.setup();
    render(<TopBar user={TEST_USER} />);

    await user.click(screen.getByTestId("notifications"));

    expect(
      await screen.findByText(/notifications aren't available yet/i),
    ).toBeVisible();
  });

  it("shows no notification count", () => {
    render(<TopBar user={TEST_USER} />);
    const bell = screen.getByTestId("notifications");
    expect(bell.textContent?.trim()).toBe("");
  });

  it("presents the server-resolved identity and a real sign-out", async () => {
    const user = userEvent.setup();
    render(<TopBar user={TEST_USER} />);

    await user.click(screen.getByTestId("user-menu"));

    expect(await screen.findByText("Test Owner")).toBeVisible();
    expect(screen.getByText("owner@example.com")).toBeVisible();

    // Sign-out posts to a Server Action, so it must be a real submit inside a
    // form — not a client-side handler that only looks like one.
    const signOut = screen.getByTestId("sign-out");
    expect(signOut).toHaveAttribute("type", "submit");
    expect(signOut.closest("form")).not.toBeNull();
  });

  it("never renders an identity the browser supplied", async () => {
    const user = userEvent.setup();
    render(<TopBar user={TEST_USER} />);
    await user.click(screen.getByTestId("user-menu"));

    // The menu shows only what the server passed in. Nothing is read from
    // localStorage, a cookie, or a client-side store.
    expect(screen.queryByText(/not signed in/i)).not.toBeInTheDocument();
  });

  it("keeps the unavailable controls reachable by keyboard", async () => {
    const user = userEvent.setup();
    render(<TopBar user={TEST_USER} />);

    const search = screen.getByTestId("global-search");
    search.focus();
    expect(search).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(
      await screen.findByText(/global search isn't available yet/i),
    ).toBeVisible();
  });
});
