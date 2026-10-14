import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MODULE_KEYS } from "@/lib/modules";
import { NavList } from "@/components/app-shell/nav-list";
import { ALL_NAV } from "@/config/navigation";

const usePathname = vi.hoisted(() => vi.fn(() => "/dashboard"));
vi.mock("next/navigation", () => ({ usePathname }));

describe("NavList", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/dashboard");
  });

  it("renders one link per configured item and nothing else", () => {
    render(<NavList enabledModules={MODULE_KEYS} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(ALL_NAV.length);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(
      ALL_NAV.map((i) => i.href),
    );
  });

  it("labels every link from the shared configuration", () => {
    render(<NavList enabledModules={MODULE_KEYS} />);
    for (const item of ALL_NAV) {
      expect(
        screen.getByRole("link", { name: item.label }),
      ).toBeInTheDocument();
    }
  });

  it("marks the active route with aria-current, and only that route", () => {
    usePathname.mockReturnValue("/customers");
    render(<NavList enabledModules={MODULE_KEYS} />);

    const current = screen.getAllByRole("link", { current: "page" });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", "/customers");
  });

  it("keeps the parent active on a nested detail route", () => {
    usePathname.mockReturnValue("/customers/abc-123");
    render(<NavList enabledModules={MODULE_KEYS} />);

    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks nothing active on a route outside the navigation", () => {
    usePathname.mockReturnValue("/design-preview");
    render(<NavList enabledModules={MODULE_KEYS} />);
    expect(screen.queryAllByRole("link", { current: "page" })).toHaveLength(0);
  });

  it("exposes an accessible navigation landmark", () => {
    render(<NavList enabledModules={MODULE_KEYS} />);
    expect(
      screen.getByRole("navigation", { name: "Main" }),
    ).toBeInTheDocument();
  });
});

describe("navigation shows only the workspace's enabled modules (§171)", () => {
  it("hides Leads when the Leads module is disabled", () => {
    render(
      <NavList enabledModules={MODULE_KEYS.filter((key) => key !== "leads")} />,
    );

    expect(screen.queryByRole("link", { name: "Leads" })).toBeNull();
    // Core destinations are unaffected: Customer Management is not switchable.
    expect(screen.getByRole("link", { name: "Customers" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeTruthy();
  });

  it("hides Renewals and WhatsApp when those modules are disabled", () => {
    render(<NavList enabledModules={["leads", "customer_followups"]} />);

    expect(screen.queryByRole("link", { name: /Renewals/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
  });

  it("keeps Follow-ups while either source module is enabled (§43)", () => {
    const { unmount } = render(<NavList enabledModules={["leads"]} />);
    expect(screen.getByRole("link", { name: "Follow-ups" })).toBeTruthy();
    unmount();

    render(<NavList enabledModules={["customer_followups"]} />);
    expect(screen.getByRole("link", { name: "Follow-ups" })).toBeTruthy();
  });

  it("hides Follow-ups only when neither source is enabled", () => {
    render(<NavList enabledModules={["whatsapp", "email"]} />);
    expect(screen.queryByRole("link", { name: "Follow-ups" })).toBeNull();
  });

  it("keeps the core destinations reachable with every module disabled", () => {
    render(<NavList enabledModules={[]} />);

    for (const label of ["Dashboard", "Customers", "Reports", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeTruthy();
    }
  });
});
