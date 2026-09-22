import { readFileSync } from "node:fs";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CrmChrome } from "@/components/wireframes/crm-chrome";
import { MobileBottomNav } from "@/components/wireframes/phone-frame";
import {
  WIREFRAME_SIDEBAR_ID,
  WireframeSidebarToggle,
} from "@/components/wireframes/wireframe-sidebar-toggle";
import {
  applyWfSidebarState,
  readStoredWfSidebarState,
  WF_SIDEBAR_ATTRIBUTE,
  WF_SIDEBAR_INIT_SCRIPT,
  WF_SIDEBAR_STORAGE_KEY,
} from "@/lib/wireframes/sidebar-preference";

/**
 * The collapsible rail on the wireframe chrome.
 *
 * These screens are shown to a client on a laptop, so the rail has to
 * collapse on demand, stay collapsed while the presenter walks through the
 * flows, and stay out of the way of the phone screens entirely.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");

/** Just the wireframe collapse rules, so the production block is not read. */
const WF_CSS = CSS.slice(CSS.indexOf("Wireframe rail collapse"));

function resetPreference() {
  window.localStorage.clear();
  document.documentElement.removeAttribute(WF_SIDEBAR_ATTRIBUTE);
}

/**
 * Stands in for the pre-paint script, which jsdom will not run (the test
 * environment does not execute injected scripts). It performs the same two
 * steps, and `pre-paint script` below pins the shipped string to them.
 */
function bootFromStorage() {
  applyWfSidebarState(readStoredWfSidebarState());
}

function renderChrome() {
  return render(
    <CrmChrome active="dashboard">
      <p>Screen body</p>
    </CrmChrome>,
  );
}

beforeEach(resetPreference);

describe("rail toggle", () => {
  it("defaults to expanded when nothing is stored", () => {
    renderChrome();
    const toggle = screen.getByTestId("wireframe-sidebar-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName("Collapse sidebar");
  });

  it("collapses and expands again on activation", async () => {
    const user = userEvent.setup();
    renderChrome();
    const toggle = screen.getByTestId("wireframe-sidebar-toggle");

    await user.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    });
    expect(toggle).toHaveAccessibleName("Expand sidebar");
    expect(document.documentElement).toHaveAttribute(
      WF_SIDEBAR_ATTRIBUTE,
      "collapsed",
    );

    await user.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });
    expect(toggle).toHaveAccessibleName("Collapse sidebar");
    expect(document.documentElement).toHaveAttribute(
      WF_SIDEBAR_ATTRIBUTE,
      "expanded",
    );
  });

  it("never touches the production sidebar preference", async () => {
    const user = userEvent.setup();
    renderChrome();

    await user.click(screen.getByTestId("wireframe-sidebar-toggle"));

    expect(document.documentElement).not.toHaveAttribute("data-sidebar");
    expect(
      window.localStorage.getItem("limenzy-crm:sidebar-state:v1"),
    ).toBeNull();
  });
});

describe("persistence", () => {
  it("writes the preference on every toggle", async () => {
    const user = userEvent.setup();
    renderChrome();
    const toggle = screen.getByTestId("wireframe-sidebar-toggle");

    await user.click(toggle);
    expect(window.localStorage.getItem(WF_SIDEBAR_STORAGE_KEY)).toBe("true");

    await user.click(toggle);
    expect(window.localStorage.getItem(WF_SIDEBAR_STORAGE_KEY)).toBe("false");
  });

  it("restores a stored collapsed preference on the next load", () => {
    window.localStorage.setItem(WF_SIDEBAR_STORAGE_KEY, "true");
    bootFromStorage();

    renderChrome();

    expect(document.documentElement).toHaveAttribute(
      WF_SIDEBAR_ATTRIBUTE,
      "collapsed",
    );
    expect(screen.getByTestId("wireframe-sidebar-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("falls back to expanded on a malformed stored value", () => {
    window.localStorage.setItem(WF_SIDEBAR_STORAGE_KEY, "yes-please");
    bootFromStorage();

    renderChrome();

    expect(document.documentElement).toHaveAttribute(
      WF_SIDEBAR_ATTRIBUTE,
      "expanded",
    );
    expect(screen.getByTestId("wireframe-sidebar-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("keeps working when storage is unavailable", async () => {
    const user = userEvent.setup();
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    try {
      renderChrome();
      const toggle = screen.getByTestId("wireframe-sidebar-toggle");
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      // The toggle must not throw; the preference simply will not persist.
      await user.click(toggle);
      expect(document.documentElement).toHaveAttribute(
        WF_SIDEBAR_ATTRIBUTE,
        "collapsed",
      );
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe("pre-paint script", () => {
  it("reads the wireframe key and writes the wireframe attribute", () => {
    expect(WF_SIDEBAR_INIT_SCRIPT).toContain(
      JSON.stringify(WF_SIDEBAR_STORAGE_KEY),
    );
    expect(WF_SIDEBAR_INIT_SCRIPT).toContain(
      JSON.stringify(WF_SIDEBAR_ATTRIBUTE),
    );
    // It must not reach for the production preference.
    expect(WF_SIDEBAR_INIT_SCRIPT).not.toContain("limenzy-crm:sidebar-state");
    expect(WF_SIDEBAR_INIT_SCRIPT).not.toContain('"data-sidebar"');
  });

  it("falls back to expanded rather than throwing on blocked storage", () => {
    expect(WF_SIDEBAR_INIT_SCRIPT).toMatch(/catch\(e\)\{.*"expanded"/);
  });

  it("is injected by the wireframe layout, not the production root layout", () => {
    const wireframes = readFileSync("src/app/wireframes/layout.tsx", "utf8");
    const root = readFileSync("src/app/layout.tsx", "utf8");
    expect(wireframes).toContain("WF_SIDEBAR_INIT_SCRIPT");
    expect(root).not.toContain("WF_SIDEBAR_INIT_SCRIPT");
  });
});

describe("server rendering", () => {
  it("reads no browser storage while rendering on the server", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");

    try {
      const html = renderToString(
        <CrmChrome active="dashboard">
          <p>Screen body</p>
        </CrmChrome>,
      );
      // The server snapshot is the default, so the expanded name is what the
      // markup carries — and nothing consulted localStorage to decide it.
      expect(getItem).not.toHaveBeenCalled();
      expect(html).toContain("Collapse sidebar");
    } finally {
      getItem.mockRestore();
    }
  });

  it("sets no attribute on the document while rendering on the server", () => {
    renderToString(
      <CrmChrome active="dashboard">
        <p>Screen body</p>
      </CrmChrome>,
    );
    expect(document.documentElement).not.toHaveAttribute(WF_SIDEBAR_ATTRIBUTE);
  });
});

describe("accessibility", () => {
  it("is a real button, named, and wired to the rail", () => {
    const { container } = renderChrome();
    const toggle = screen.getByTestId("wireframe-sidebar-toggle");

    expect(toggle.tagName).toBe("BUTTON");
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-controls", WIREFRAME_SIDEBAR_ID);
    expect(container.querySelector(`#${WIREFRAME_SIDEBAR_ID}`)).not.toBeNull();
  });

  it("operates from the keyboard", async () => {
    const user = userEvent.setup();
    render(<WireframeSidebarToggle />);
    const toggle = screen.getByTestId("wireframe-sidebar-toggle");

    toggle.focus();
    expect(toggle).toHaveFocus();

    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    await user.keyboard(" ");
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });
  });

  it("carries a visible focus style", () => {
    render(<WireframeSidebarToggle />);
    expect(screen.getByTestId("wireframe-sidebar-toggle").className).toContain(
      "focus-visible:ring-2",
    );
  });

  it("keeps every navigation name once the rail is collapsed", async () => {
    const user = userEvent.setup();
    renderChrome();

    await user.click(screen.getByTestId("wireframe-sidebar-toggle"));

    // The names survive because the label is visually hidden, not removed.
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "WhatsApp" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    // The rows with no wireframe behind them are plain spans, so read their
    // label directly rather than by role.
    const labels = [...document.querySelectorAll(".wf-nav-label")].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual([
      "Dashboard",
      "Leads",
      "Customers",
      "Follow-ups",
      "Renewals & Reminders",
      "WhatsApp",
      "Reports",
      "Settings",
    ]);
  });

  it("hides the hover label from assistive technology", () => {
    renderChrome();
    for (const tip of document.querySelectorAll(".wf-nav-tip")) {
      expect(tip).toHaveAttribute("aria-hidden", "true");
    }
    // One decorative label per navigation row, none of them announced.
    expect(document.querySelectorAll(".wf-nav-tip").length).toBe(
      document.querySelectorAll(".wf-nav-link").length,
    );
  });
});

describe("collapsed presentation", () => {
  it("withholds the label from view without removing it from the tree", () => {
    const rule =
      WF_CSS.match(
        /\[data-wf-sidebar="collapsed"\]\s+\.wf-nav-label\s*\{([^}]*)\}/,
      )?.[1] ?? "";

    expect(rule).not.toBe("");
    // `display: none` would take the link's accessible name with it.
    expect(rule).not.toMatch(/display:\s*none/);
    // Visually hidden and out of flow, so the rail shows no empty gap.
    expect(rule).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(rule).toMatch(/position:\s*absolute/);
  });

  it("narrows the rail from the same variable the layout reads", () => {
    expect(WF_CSS).toMatch(
      /\[data-wf-sidebar="collapsed"\]\s*\{\s*--wf-sidebar-w:\s*var\(--wf-sidebar-w-collapsed\);/,
    );
    const chrome = readFileSync(
      "src/components/wireframes/crm-chrome.tsx",
      "utf8",
    );
    expect(chrome).toContain("w-[var(--wf-sidebar-w)]");
  });

  it("reveals the hover label on hover and on keyboard focus", () => {
    expect(WF_CSS).toContain(".wf-nav-link:hover > .wf-nav-tip");
    expect(WF_CSS).toContain(".wf-nav-link:focus-visible > .wf-nav-tip");
  });

  it("transitions the width within the agreed 180-250ms band", () => {
    const chrome = readFileSync(
      "src/components/wireframes/crm-chrome.tsx",
      "utf8",
    );
    const duration = Number(
      chrome.match(/transition-\[width\] duration-(\d+)/)?.[1],
    );
    expect(duration).toBeGreaterThanOrEqual(180);
    expect(duration).toBeLessThanOrEqual(250);
    expect(chrome).toContain("motion-reduce:transition-none");
  });

  it("keeps the current page marked while collapsed", async () => {
    const user = userEvent.setup();
    renderChrome();

    const dashboard = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboard).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByTestId("wireframe-sidebar-toggle"));

    // Same element, same marking: nothing about collapsing re-renders the
    // active row differently.
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // The accent bar and the raised surface are on the row itself, so neither
    // sits inside anything the collapsed rules hide.
    expect(dashboard.className).toContain("surface-glass-strong");
    expect(dashboard.querySelector("span[aria-hidden]")).not.toBeNull();
  });
});

describe("mobile", () => {
  it("renders no rail below lg, so the toggle cannot reach a phone", () => {
    const { container } = renderChrome();
    const rail = container.querySelector(`#${WIREFRAME_SIDEBAR_ID}`)!;

    expect(rail.className).toContain("hidden");
    expect(rail.className).toContain("lg:flex");
    // The control lives inside the rail, so it is withheld with it.
    expect(rail.contains(screen.getByTestId("wireframe-sidebar-toggle"))).toBe(
      true,
    );
  });

  it("confines every collapse rule to lg and up", () => {
    const mediaAt = WF_CSS.indexOf("@media (min-width: 64rem)");
    const firstRule = WF_CSS.indexOf('[data-wf-sidebar="collapsed"]');
    expect(mediaAt).toBeGreaterThan(-1);
    expect(mediaAt).toBeLessThan(firstRule);
  });

  it("leaves the phone screens' own bottom navigation intact", () => {
    window.localStorage.setItem(WF_SIDEBAR_STORAGE_KEY, "true");
    bootFromStorage();

    render(<MobileBottomNav active="today" />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();
    expect(nav.querySelectorAll("a, span").length).toBeGreaterThan(0);
  });

  it("adds no unconditional wide fixed width to the chrome", () => {
    const chrome = readFileSync(
      "src/components/wireframes/crm-chrome.tsx",
      "utf8",
    );
    // A fixed width that is not behind a breakpoint is what causes horizontal
    // overflow at 326px. The rail's own width is a variable behind `lg:flex`.
    const offenders = chrome
      .split("\n")
      .filter((line) => /(^|[\s"'`])(min-w|w)-\[\d/.test(line))
      .filter((line) => !/lg:flex/.test(line));
    expect(offenders).toEqual([]);
  });
});
