import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { TopBar } from "@/components/app-shell/top-bar";

import { vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

/**
 * These assertions exist to stop a future change from turning the placeholder
 * controls into something that *looks* functional. Milestone 1A must not ship
 * a pretend search box, a pretend notification feed or a pretend signed-in
 * user.
 */
describe("top bar — unbuilt features are presented honestly", () => {
  it("offers no text input to type a search into", () => {
    render(<TopBar />);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("names the search control as unavailable", () => {
    render(<TopBar />);
    expect(
      screen.getAllByRole("button", { name: /global search — not available/i })
        .length,
    ).toBeGreaterThan(0);
  });

  it("explains that search is not available when activated", async () => {
    const user = userEvent.setup();
    render(<TopBar />);

    await user.click(screen.getByTestId("global-search"));

    expect(
      await screen.findByText(/global search isn't available yet/i),
    ).toBeVisible();
  });

  it("explains that notifications are not available when activated", async () => {
    const user = userEvent.setup();
    render(<TopBar />);

    await user.click(screen.getByTestId("notifications"));

    expect(
      await screen.findByText(/notifications aren't available yet/i),
    ).toBeVisible();
  });

  it("shows no notification count", () => {
    render(<TopBar />);
    const bell = screen.getByTestId("notifications");
    expect(bell.textContent?.trim()).toBe("");
  });

  it("presents the account menu as not signed in, with no invented identity", async () => {
    const user = userEvent.setup();
    render(<TopBar />);

    await user.click(screen.getByTestId("user-menu"));

    expect(await screen.findByText(/not signed in/i)).toBeVisible();
    expect(
      screen.getByText(/authentication is not configured yet/i),
    ).toBeVisible();
  });

  it("keeps the unavailable controls reachable by keyboard", async () => {
    const user = userEvent.setup();
    render(<TopBar />);

    const search = screen.getByTestId("global-search");
    search.focus();
    expect(search).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(
      await screen.findByText(/global search isn't available yet/i),
    ).toBeVisible();
  });
});
