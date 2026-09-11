import {
  BellRing,
  Building2,
  CalendarCheck,
  ChartColumn,
  LayoutDashboard,
  MessageCircle,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for application navigation.
 *
 * Desktop sidebar, tablet drawer and mobile bottom navigation all derive from
 * this array. Nothing may hard-code a nav item anywhere else.
 *
 * Spec references: §3 (Overall Application Navigation), §25 (responsive /
 * mobile bottom navigation), §157 (Settings).
 */

/**
 * Workspace modules that can be enabled or disabled (spec §171).
 *
 * Declared here as *data* so navigation items can name the module that governs
 * them. No gating behaviour exists yet — module state is loaded and enforced in
 * Milestone 1D. Until then every item renders.
 */
export type ModuleKey =
  | "leads"
  | "customer_followups"
  | "products_services"
  | "renewals_reminders"
  | "whatsapp";

export type NavItem = {
  /** Stable identifier, also used as a React key and test handle. */
  readonly id: string;
  /** Visible label. */
  readonly label: string;
  /** Route path. */
  readonly href: string;
  readonly icon: LucideIcon;
  /**
   * Module that governs this item's visibility (spec §171, §172).
   * `null` means the item is always available — Dashboard, Customers
   * (core module, never disabled) and Settings.
   */
  readonly module: ModuleKey | null;
  /**
   * Placement in the mobile bottom bar (spec §25:
   * `Home | Leads | Customers | WhatsApp | More`).
   * Items without a slot are reached through "More".
   */
  readonly mobileSlot: number | null;
  /** Spec sections this destination implements, for traceability. */
  readonly specSections: string;
};

export const PRIMARY_NAV: readonly NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    module: null,
    mobileSlot: 1,
    specSections: "§15–§25",
  },
  {
    id: "leads",
    label: "Leads",
    href: "/leads",
    icon: Users,
    module: "leads",
    mobileSlot: 2,
    specSections: "§30–§51",
  },
  {
    id: "customers",
    label: "Customers",
    href: "/customers",
    icon: Building2,
    module: null,
    mobileSlot: 3,
    specSections: "§52–§80",
  },
  {
    id: "follow-ups",
    label: "Follow-ups",
    href: "/follow-ups",
    icon: CalendarCheck,
    // Governed by BOTH the Leads and Customer Follow-ups modules; see
    // resolveFollowUpsVisibility() below for the approved interpretation.
    module: "customer_followups",
    mobileSlot: null,
    specSections: "§43–§44",
  },
  {
    id: "renewals",
    label: "Renewals & Reminders",
    href: "/renewals",
    icon: BellRing,
    module: "renewals_reminders",
    mobileSlot: null,
    specSections: "§64–§75",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    href: "/whatsapp",
    icon: MessageCircle,
    module: "whatsapp",
    mobileSlot: 4,
    specSections: "§81–§116",
  },
  {
    id: "reports",
    label: "Reports",
    href: "/reports",
    icon: ChartColumn,
    module: null,
    mobileSlot: null,
    specSections: "§144–§156",
  },
] as const;

/** Rendered below a divider in the sidebar (spec §3). */
export const SECONDARY_NAV: readonly NavItem[] = [
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: Settings,
    module: null,
    mobileSlot: null,
    specSections: "§157–§174",
  },
] as const;

export const ALL_NAV: readonly NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV];

/** Number of direct destinations in the mobile bar before the "More" entry. */
export const MOBILE_DIRECT_SLOTS = 4;

/**
 * Every module enabled.
 *
 * Milestone 1A has no workspace and therefore no module configuration to read,
 * so the shell renders the full navigation. Milestone 1D replaces this constant
 * at the call sites with the authenticated workspace's real module set.
 */
export const ALL_MODULES_ENABLED: ReadonlySet<ModuleKey> = new Set<ModuleKey>([
  "leads",
  "customer_followups",
  "products_services",
  "renewals_reminders",
  "whatsapp",
]);

/**
 * Approved interpretation of the Follow-ups module rules.
 *
 * - The "Customer Follow-ups" setting governs follow-ups whose subject is a
 *   Customer.
 * - Lead follow-ups remain available whenever the Leads module is enabled.
 * - The combined Follow-ups screen (spec §43) shows whichever sources are
 *   enabled, so it is hidden only when NEITHER source is enabled.
 *
 * Pure function: it takes the enabled set explicitly and reads no global
 * state. Module state is not loaded anywhere until Milestone 1D.
 */
export function resolveFollowUpsVisibility(
  enabledModules: ReadonlySet<ModuleKey>,
): boolean {
  return (
    enabledModules.has("leads") || enabledModules.has("customer_followups")
  );
}

/**
 * Navigation items visible for a given set of enabled modules.
 *
 * Pure and side-effect free. Milestone 1A always passes the full module set;
 * Milestone 1D supplies the workspace's real configuration.
 */
export function resolveVisibleNav(
  items: readonly NavItem[],
  enabledModules: ReadonlySet<ModuleKey>,
): readonly NavItem[] {
  return items.filter((item) => {
    if (item.id === "follow-ups") {
      return resolveFollowUpsVisibility(enabledModules);
    }
    return item.module === null || enabledModules.has(item.module);
  });
}

/**
 * Mobile bottom-bar destinations (spec §25).
 *
 * Items are ordered by `mobileSlot`. Per §25, when Leads is unavailable its
 * slot is taken by Follow-ups; the caller renders a trailing "More" entry for
 * everything else.
 */
export function resolveMobileNav(
  enabledModules: ReadonlySet<ModuleKey>,
): readonly NavItem[] {
  const visible = resolveVisibleNav(PRIMARY_NAV, enabledModules);
  const slotted = visible
    .filter((item) => item.mobileSlot !== null)
    .sort((a, b) => (a.mobileSlot ?? 0) - (b.mobileSlot ?? 0));

  const leadsVisible = slotted.some((item) => item.id === "leads");
  if (!leadsVisible) {
    const followUps = visible.find((item) => item.id === "follow-ups");
    if (followUps) {
      // Take the slot Leads would have occupied (§25).
      const insertAt = slotted.findIndex((item) => (item.mobileSlot ?? 0) > 1);
      const index = insertAt === -1 ? slotted.length : insertAt;
      slotted.splice(index, 0, followUps);
    }
  }

  return slotted.slice(0, MOBILE_DIRECT_SLOTS);
}

/**
 * The currently active nav item for a pathname.
 *
 * Matches the longest `href` that the pathname equals or is nested beneath, so
 * `/customers/123` correctly highlights Customers.
 */
export function findActiveNavItem(
  pathname: string,
  items: readonly NavItem[] = ALL_NAV,
): NavItem | undefined {
  return items
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
}
