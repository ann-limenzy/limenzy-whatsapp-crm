"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NavDrawer } from "@/components/app-shell/nav-drawer";
import { findActiveNavItem, resolveMobileNav } from "@/config/navigation";
import type { ModuleKey } from "@/lib/modules";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom navigation (spec §25).
 *
 * Shows the direct destinations resolved from the shared navigation config
 * plus a trailing "More" entry that opens the same drawer used on tablet.
 *
 * The workspace's real module configuration arrives from the server (spec
 * §171). With all modules enabled the bar renders the §25 default
 * (`Home | Leads | Customers | WhatsApp | More`); when Leads is unavailable its
 * slot is taken by Follow-ups, which `resolveMobileNav` implements.
 */
export function MobileNav({
  enabledModules,
}: {
  /** Resolved on the server. Required for the same reason as in NavList. */
  enabledModules: readonly ModuleKey[];
}) {
  const pathname = usePathname();
  const active = findActiveNavItem(pathname);
  const items = resolveMobileNav(new Set(enabledModules));

  return (
    <nav
      aria-label="Primary"
      data-testid="mobile-nav"
      // Column count follows the resolved item count (+1 for "More") so the bar
      // stays evenly divided when a module hides one of the direct slots.
      style={{
        gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))`,
      }}
      className="surface-glass fixed inset-x-0 bottom-0 z-30 grid rounded-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active?.id === item.id;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            data-testid={`mobile-nav-${item.id}`}
            className={cn(
              // `min-w-0` lets the grid track shrink below its content at
              // 320px instead of forcing the bar wider than the viewport.
              "relative flex h-[var(--mobile-nav-h)] min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium transition-colors xs:text-[11px]",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {/* Active state carries a shape as well as a colour, so it does
                not depend on colour perception alone. */}
            {isActive ? (
              <span
                aria-hidden="true"
                className="absolute top-0 h-0.5 w-8 rounded-b-full bg-primary"
              />
            ) : null}
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="w-full truncate text-center leading-tight">
              {item.label}
            </span>
          </Link>
        );
      })}

      <NavDrawer
        enabledModules={enabledModules}
        trigger={
          <button
            type="button"
            data-testid="mobile-nav-more"
            className="flex h-[var(--mobile-nav-h)] min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground xs:text-[11px]"
          >
            <Ellipsis className="size-5 shrink-0" aria-hidden="true" />
            <span className="w-full truncate text-center leading-tight">
              More
            </span>
          </button>
        }
      />
    </nav>
  );
}
