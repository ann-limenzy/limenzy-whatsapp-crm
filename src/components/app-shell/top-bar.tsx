"use client";

import { Bell, Search } from "lucide-react";

import { NavDrawer } from "@/components/app-shell/nav-drawer";
import { PageTitle } from "@/components/app-shell/page-title";
import {
  NotAvailableChip,
  UnavailableControl,
} from "@/components/app-shell/unavailable-control";
import { UserMenu } from "@/components/app-shell/user-menu";
import { LimenzyLogo } from "@/components/brand/limenzy-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

/**
 * Global top bar (spec §4).
 *
 * Carries the page title, the (not yet available) global search and
 * notification controls, the theme toggle and the account menu.
 *
 * The optional per-screen primary action from §4 (`+ Add Lead` / `+ Add
 * Customer`) is intentionally absent: §4 forbids showing `+ Add Lead`
 * permanently when Leads is disabled, so it depends on module state that does
 * not exist until Milestone 1D.
 *
 * Responsive density — the phone header is deliberately not a shrunken desktop
 * header:
 *   < sm   drawer trigger · compact brand (symbol + CRM) · search ·
 *          notifications. Theme and account move into the drawer, where they
 *          get full-size rows instead of being squeezed into tiny targets.
 *   >= sm  full `Limenzy | CRM` lockup and the complete control set.
 *   >= lg  the sidebar carries the brand, so the top bar drops it.
 *
 * Glass tier: the top bar is one of the approved glass surfaces.
 *
 * Client component: every control in here is interactive, and the `icon` props
 * below are component references, which cannot cross a Server→Client boundary.
 * When Milestone 1B/1C introduces server-resolved values (signed-in user,
 * active workspace) they will be passed in from the `(app)` layout as plain
 * serializable props rather than by making this a Server Component again.
 */
export function TopBar() {
  return (
    <header className="surface-glass sticky top-0 z-20 rounded-none border-x-0 border-t-0">
      <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <NavDrawer />

        {/* The sidebar carries the brand on desktop; below `lg` the top bar
            does — compactly on phones, in full from `sm`. */}
        <LimenzyLogo variant="compact" className="sm:hidden" />
        <LimenzyLogo
          variant="lockup"
          className="hidden sm:inline-flex lg:hidden"
        />

        <PageTitle />

        <div className="ms-auto flex items-center gap-1 sm:gap-2">
          <UnavailableControl
            testId="global-search"
            icon={Search}
            label="Global search — not available yet"
            heading="Global search isn't available yet"
            body="It will search leads, customers, phone numbers, email addresses and reference fields such as policy, vehicle and certificate numbers."
            specRef="Spec §5 · later milestone"
            className="surface-solid hidden h-9 min-w-[220px] justify-between px-3 lg:inline-flex xl:min-w-[320px]"
          >
            <span className="flex items-center gap-2">
              <Search className="size-4" aria-hidden="true" />
              <span className="text-sm">Search</span>
            </span>
            <NotAvailableChip />
          </UnavailableControl>

          {/* Compact form of the same control below `lg`. 44px touch target
              on phones, 36px once the full control row has room. */}
          <UnavailableControl
            testId="global-search-compact"
            icon={Search}
            label="Global search — not available yet"
            heading="Global search isn't available yet"
            body="It will search leads, customers, phone numbers, email addresses and reference fields such as policy, vehicle and certificate numbers."
            specRef="Spec §5 · later milestone"
            className="grid size-11 place-items-center hover:bg-accent/60 sm:size-9 lg:hidden"
          />

          <UnavailableControl
            testId="notifications"
            icon={Bell}
            label="Notifications — not available yet"
            heading="Notifications aren't available yet"
            body="The notification centre will report assignments, follow-ups and renewals that are due or overdue, WhatsApp replies and failures, and import results."
            specRef="Spec §6 · §175 · later milestone"
            className="grid size-11 place-items-center hover:bg-accent/60 sm:size-9"
          />

          {/* Moved into the drawer below `sm`, so the phone header keeps four
              comfortable targets instead of six cramped ones. */}
          <ThemeToggle className="hidden sm:inline-flex" />
          <UserMenu className="hidden sm:inline-flex" />
        </div>
      </div>
    </header>
  );
}
