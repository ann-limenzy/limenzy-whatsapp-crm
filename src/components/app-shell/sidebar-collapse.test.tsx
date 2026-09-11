import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NavList } from "@/components/app-shell/nav-list";
import { SidebarToggle } from "@/components/app-shell/sidebar-toggle";
import { ALL_NAV, PRIMARY_NAV } from "@/config/navigation";
import {
  SIDEBAR_ATTRIBUTE,
  SIDEBAR_STORAGE_KEY,
} from "@/lib/sidebar-preference";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

function resetShell() {
  window.localStorage.clear();
  document.documentElement.removeAttribute(SIDEBAR_ATTRIBUTE);
}

/** Mimics the pre-paint script that runs before React on a real page load. */
function bootFromStorage() {
  const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
  document.documentElement.setAttribute(
    SIDEBAR_ATTRIBUTE,
    stored === "collapsed" ? "collapsed" : "expanded",
  );
}

beforeEach(resetShell);

describe("sidebar toggle", () => {
  it("defaults to expanded on desktop with no stored value", () => {
    render(<SidebarToggle />);
    const toggle = screen.getByTestId("sidebar-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName("Collapse sidebar");
  });

  it("is associated with the sidebar element", () => {
    render(<SidebarToggle />);
    expect(screen.getByTestId("sidebar-toggle")).toHaveAttribute(
      "aria-controls",
      "app-sidebar",
    );
  });

  it("collapses and expands on activation, updating name and aria-expanded", async () => {
    const user = userEvent.setup();
    render(<SidebarToggle />);
    const toggle = screen.getByTestId("sidebar-toggle");

    await user.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    });
    expect(toggle).toHaveAccessibleName("Expand sidebar");
    expect(document.documentElement).toHaveAttribute(
      SIDEBAR_ATTRIBUTE,
      "collapsed",
    );

    await user.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });
    expect(toggle).toHaveAccessibleName("Collapse sidebar");
  });

  it("is operable by keyboard", async () => {
    const user = userEvent.setup();
    render(<SidebarToggle />);
    const toggle = screen.getByTestId("sidebar-toggle");

    await user.tab();
    expect(toggle).toHaveFocus();

    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    });
  });

  it("persists the choice to localStorage", async () => {
    const user = userEvent.setup();
    render(<SidebarToggle />);

    await user.click(screen.getByTestId("sidebar-toggle"));
    await waitFor(() => {
      expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe(
        "collapsed",
      );
    });
  });

  it("survives a remount — the reload path", async () => {
    const user = userEvent.setup();
    const first = render(<SidebarToggle />);
    await user.click(screen.getByTestId("sidebar-toggle"));
    await waitFor(() =>
      expect(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe(
        "collapsed",
      ),
    );
    first.unmount();

    // Simulate a fresh page load: attribute cleared, then the init script runs.
    document.documentElement.removeAttribute(SIDEBAR_ATTRIBUTE);
    bootFromStorage();

    render(<SidebarToggle />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-toggle")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });
    expect(screen.getByTestId("sidebar-toggle")).toHaveAccessibleName(
      "Expand sidebar",
    );
  });

  it("falls back to expanded when the stored value is invalid", async () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "not-a-state");
    bootFromStorage();

    render(<SidebarToggle />);
    await waitFor(() => {
      expect(screen.getByTestId("sidebar-toggle")).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    });
  });
});

describe("collapsed navigation", () => {
  it("renders the same destinations in both states", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        <SidebarToggle />
        <NavList collapsible />
      </>,
    );

    const expandedHrefs = screen
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"));

    await user.click(screen.getByTestId("sidebar-toggle"));
    rerender(
      <>
        <SidebarToggle />
        <NavList collapsible />
      </>,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute(
        SIDEBAR_ATTRIBUTE,
        "collapsed",
      );
    });

    const collapsedHrefs = screen
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"));

    expect(collapsedHrefs).toEqual(expandedHrefs);
    expect(collapsedHrefs).toEqual(ALL_NAV.map((i) => i.href));
  });

  it("keeps an accessible name on every link when collapsed", async () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
    bootFromStorage();

    render(<NavList collapsible />);

    for (const item of ALL_NAV) {
      expect(
        screen.getByRole("link", { name: item.label }),
        `${item.label} must keep its accessible name on the rail`,
      ).toBeInTheDocument();
    }
  });

  it("keeps the active indicator when collapsed", async () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
    bootFromStorage();

    render(<NavList collapsible />);
    const current = screen.getAllByRole("link", { current: "page" });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", "/dashboard");
  });
});

describe("collapsed tooltips", () => {
  it("shows a tooltip on keyboard focus when collapsed", async () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
    bootFromStorage();

    render(<NavList collapsible />);
    const link = screen.getByTestId("nav-leads");
    link.focus();

    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Leads");
    // The trigger points at the tooltip, so AT announces the two together.
    expect(link).toHaveAttribute("aria-describedby");
  });

  it("shows a tooltip on hover when collapsed", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
    bootFromStorage();

    render(<NavList collapsible />);
    await user.hover(screen.getByTestId("nav-customers"));

    const tip = await screen.findByRole("tooltip");
    expect(tip).toHaveTextContent("Customers");
  });

  it("gives every collapsed destination a tooltip trigger", () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
    bootFromStorage();

    render(<NavList collapsible />);
    expect(
      document.querySelectorAll("[data-slot='tooltip-trigger']"),
    ).toHaveLength(ALL_NAV.length);
  });

  it("renders no tooltip markup while expanded", () => {
    bootFromStorage();
    render(<NavList collapsible />);

    // Radix marks its triggers; none should exist when labels are visible.
    expect(
      document.querySelectorAll("[data-slot='tooltip-trigger']"),
    ).toHaveLength(0);
    expect(screen.getAllByText("Leads")).toHaveLength(1);
  });

  it("renders no tooltips in the drawer, which is never collapsible", () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
    bootFromStorage();

    render(<NavList />);
    expect(
      document.querySelectorAll("[data-slot='tooltip-trigger']"),
    ).toHaveLength(0);
    // The drawer keeps its visible labels regardless of the desktop preference.
    expect(screen.getAllByText("Leads")).toHaveLength(1);
  });
});

describe("tablet and mobile ignore the desktop preference", () => {
  it("drawer navigation keeps full labels and links when collapsed is stored", () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
    bootFromStorage();

    render(<NavList />);
    for (const item of PRIMARY_NAV) {
      expect(screen.getByRole("link", { name: item.label })).toBeVisible();
    }
  });

  it("the rail styling hook is never applied outside the sidebar", () => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
    bootFromStorage();

    render(<NavList />);
    // `.nav-link` / `.nav-label` are the only hooks the collapse CSS targets.
    expect(document.querySelectorAll(".nav-link")).toHaveLength(0);
    expect(document.querySelectorAll(".nav-label")).toHaveLength(0);
  });
});
