import { describe, expect, it } from "vitest";

import {
  ALL_MODULES_ENABLED,
  ALL_NAV,
  MOBILE_DIRECT_SLOTS,
  PRIMARY_NAV,
  SECONDARY_NAV,
  findActiveNavItem,
  resolveFollowUpsVisibility,
  resolveMobileNav,
  resolveVisibleNav,
  type ModuleKey,
} from "@/config/navigation";

const modules = (...keys: ModuleKey[]): ReadonlySet<ModuleKey> => new Set(keys);

describe("navigation configuration", () => {
  it("is the single source for both nav groups", () => {
    expect(ALL_NAV).toHaveLength(PRIMARY_NAV.length + SECONDARY_NAV.length);
  });

  it("has unique ids and hrefs", () => {
    expect(new Set(ALL_NAV.map((i) => i.id)).size).toBe(ALL_NAV.length);
    expect(new Set(ALL_NAV.map((i) => i.href)).size).toBe(ALL_NAV.length);
  });

  it("gives every item a label, icon and absolute href", () => {
    for (const item of ALL_NAV) {
      expect(item.label.trim()).not.toBe("");
      // lucide-react v1 icons are forwardRef components (objects), not
      // plain function components — assert renderability, not typeof.
      expect(item.icon).toBeTruthy();
      expect(["function", "object"]).toContain(typeof item.icon);
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.specSections).toMatch(/§/);
    }
  });

  it("covers the sidebar order in spec §3", () => {
    expect(PRIMARY_NAV.map((i) => i.label)).toEqual([
      "Dashboard",
      "Leads",
      "Customers",
      "Follow-ups",
      "Renewals & Reminders",
      "WhatsApp",
      "Reports",
    ]);
    expect(SECONDARY_NAV.map((i) => i.label)).toEqual(["Settings"]);
  });

  it("never module-gates Dashboard, Customers, Reports or Settings", () => {
    // Customer Management is core and cannot be disabled (spec §171).
    for (const id of ["dashboard", "customers", "reports", "settings"]) {
      expect(ALL_NAV.find((i) => i.id === id)?.module).toBeNull();
    }
  });

  it("assigns mobile slots 1-4 without collisions", () => {
    const slots = PRIMARY_NAV.map((i) => i.mobileSlot).filter(
      (s): s is number => s !== null,
    );
    expect(slots).toHaveLength(MOBILE_DIRECT_SLOTS);
    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe("resolveFollowUpsVisibility (approved interpretation)", () => {
  it("is visible when only Leads is enabled", () => {
    expect(resolveFollowUpsVisibility(modules("leads"))).toBe(true);
  });

  it("is visible when only Customer Follow-ups is enabled", () => {
    expect(resolveFollowUpsVisibility(modules("customer_followups"))).toBe(
      true,
    );
  });

  it("is visible when both are enabled", () => {
    expect(
      resolveFollowUpsVisibility(modules("leads", "customer_followups")),
    ).toBe(true);
  });

  it("is hidden only when neither source is enabled", () => {
    expect(resolveFollowUpsVisibility(modules("whatsapp"))).toBe(false);
    expect(resolveFollowUpsVisibility(modules())).toBe(false);
  });
});

describe("resolveVisibleNav", () => {
  it("shows everything when all modules are enabled", () => {
    expect(resolveVisibleNav(PRIMARY_NAV, ALL_MODULES_ENABLED)).toHaveLength(
      PRIMARY_NAV.length,
    );
  });

  it("hides Leads when the Leads module is off", () => {
    const visible = resolveVisibleNav(
      PRIMARY_NAV,
      modules("customer_followups", "whatsapp"),
    );
    expect(visible.map((i) => i.id)).not.toContain("leads");
  });

  it("hides Renewals when its module is off but keeps Customers", () => {
    const visible = resolveVisibleNav(PRIMARY_NAV, modules("leads"));
    expect(visible.map((i) => i.id)).not.toContain("renewals");
    expect(visible.map((i) => i.id)).toContain("customers");
  });

  it("keeps Follow-ups visible with Leads on and Customer Follow-ups off", () => {
    const visible = resolveVisibleNav(PRIMARY_NAV, modules("leads"));
    expect(visible.map((i) => i.id)).toContain("follow-ups");
  });
});

describe("resolveMobileNav (spec §25)", () => {
  it("renders the documented default order", () => {
    expect(resolveMobileNav(ALL_MODULES_ENABLED).map((i) => i.label)).toEqual([
      "Dashboard",
      "Leads",
      "Customers",
      "WhatsApp",
    ]);
  });

  it("never exceeds the direct-slot budget", () => {
    expect(resolveMobileNav(ALL_MODULES_ENABLED).length).toBeLessThanOrEqual(
      MOBILE_DIRECT_SLOTS,
    );
  });

  it("replaces Leads with Follow-ups when Leads is disabled", () => {
    const items = resolveMobileNav(modules("customer_followups", "whatsapp"));
    const labels = items.map((i) => i.label);
    expect(labels).not.toContain("Leads");
    expect(labels).toContain("Follow-ups");
    // Follow-ups takes the slot Leads would have held, directly after Dashboard.
    expect(labels).toEqual([
      "Dashboard",
      "Follow-ups",
      "Customers",
      "WhatsApp",
    ]);
  });

  it("does not substitute Follow-ups when neither source is enabled", () => {
    const labels = resolveMobileNav(modules("whatsapp")).map((i) => i.label);
    expect(labels).not.toContain("Leads");
    expect(labels).not.toContain("Follow-ups");
    expect(labels).toEqual(["Dashboard", "Customers", "WhatsApp"]);
  });
});

describe("findActiveNavItem", () => {
  it("matches an exact path", () => {
    expect(findActiveNavItem("/customers")?.id).toBe("customers");
  });

  it("matches nested detail routes", () => {
    expect(findActiveNavItem("/customers/abc-123")?.id).toBe("customers");
  });

  it("prefers the longest matching href", () => {
    expect(findActiveNavItem("/settings/users")?.id).toBe("settings");
  });

  it("returns undefined for an unknown route", () => {
    expect(findActiveNavItem("/nowhere")).toBeUndefined();
  });

  it("does not match a path that merely shares a prefix", () => {
    expect(findActiveNavItem("/leads-export")).toBeUndefined();
  });
});
