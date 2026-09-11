import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NavList } from "@/components/app-shell/nav-list";
import { ALL_NAV } from "@/config/navigation";

const usePathname = vi.hoisted(() => vi.fn(() => "/dashboard"));
vi.mock("next/navigation", () => ({ usePathname }));

describe("NavList", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/dashboard");
  });

  it("renders one link per configured item and nothing else", () => {
    render(<NavList />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(ALL_NAV.length);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(
      ALL_NAV.map((i) => i.href),
    );
  });

  it("labels every link from the shared configuration", () => {
    render(<NavList />);
    for (const item of ALL_NAV) {
      expect(
        screen.getByRole("link", { name: item.label }),
      ).toBeInTheDocument();
    }
  });

  it("marks the active route with aria-current, and only that route", () => {
    usePathname.mockReturnValue("/customers");
    render(<NavList />);

    const current = screen.getAllByRole("link", { current: "page" });
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", "/customers");
  });

  it("keeps the parent active on a nested detail route", () => {
    usePathname.mockReturnValue("/customers/abc-123");
    render(<NavList />);

    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("marks nothing active on a route outside the navigation", () => {
    usePathname.mockReturnValue("/design-preview");
    render(<NavList />);
    expect(screen.queryAllByRole("link", { current: "page" })).toHaveLength(0);
  });

  it("exposes an accessible navigation landmark", () => {
    render(<NavList />);
    expect(
      screen.getByRole("navigation", { name: "Main" }),
    ).toBeInTheDocument();
  });
});
