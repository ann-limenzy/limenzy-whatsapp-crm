import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeToggle } from "@/components/theme/theme-toggle";

function renderToggle() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
  });

  it("exposes an accessible name", () => {
    renderToggle();
    expect(
      screen.getByRole("button", { name: /change colour theme/i }),
    ).toBeInTheDocument();
  });

  it("offers Light, Dark and System", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByTestId("theme-toggle"));

    expect(
      await screen.findByRole("menuitem", { name: /light/i }),
    ).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /dark/i })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /system/i })).toBeVisible();
  });

  it("puts the dark class on <html> when Dark is chosen", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByTestId("theme-toggle"));
    await user.click(await screen.findByRole("menuitem", { name: /dark/i }));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
  });

  it("removes the dark class when Light is chosen", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByTestId("theme-toggle"));
    await user.click(await screen.findByRole("menuitem", { name: /dark/i }));
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));

    await user.click(screen.getByTestId("theme-toggle"));
    await user.click(await screen.findByRole("menuitem", { name: /light/i }));

    await waitFor(() => {
      expect(document.documentElement).not.toHaveClass("dark");
    });
  });

  it("persists the choice", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByTestId("theme-toggle"));
    await user.click(await screen.findByRole("menuitem", { name: /dark/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem("theme")).toBe("dark");
    });
  });

  it("is operable by keyboard alone", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.tab();
    expect(screen.getByTestId("theme-toggle")).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(await screen.findByRole("menu")).toBeVisible();

    // Walk to the Dark option rather than assuming where focus lands on open.
    const dark = screen.getByRole("menuitem", { name: /dark/i });
    for (let step = 0; step < 5 && document.activeElement !== dark; step += 1) {
      await user.keyboard("{ArrowDown}");
    }
    expect(dark).toHaveFocus();

    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(document.documentElement).toHaveClass("dark");
    });
  });
});
