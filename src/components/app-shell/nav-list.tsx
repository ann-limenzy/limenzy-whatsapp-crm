"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentPropsWithRef } from "react";

import { useSidebarState } from "@/components/app-shell/use-sidebar-state";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PRIMARY_NAV,
  SECONDARY_NAV,
  findActiveNavItem,
  type NavItem,
} from "@/config/navigation";
import { cn } from "@/lib/utils";

/**
 * A single navigation destination.
 *
 * Spreads `...rest` onto the anchor and accepts a `ref`. That is what lets it
 * be used as a Radix `asChild` tooltip trigger: Radix clones this element and
 * passes the trigger's props and ref through it. Without the spread the
 * tooltip would silently never open — the props would land on the component
 * and be dropped.
 */
function NavLink({
  item,
  active,
  collapsible,
  onNavigate,
  ...rest
}: {
  item: NavItem;
  active: boolean;
  /** True only inside the desktop sidebar, which can collapse to a rail. */
  collapsible: boolean;
  onNavigate?: () => void;
} & Omit<ComponentPropsWithRef<typeof Link>, "href" | "onClick">) {
  const Icon = item.icon;
  return (
    <Link
      {...rest}
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      // Always present, so the link keeps its accessible name on the rail
      // where the visible label is withheld.
      aria-label={item.label}
      data-testid={`nav-${item.id}`}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        collapsible && "nav-link",
        active
          ? // Selected emphasis: a step brighter than the sidebar it sits on.
            "surface-glass-strong text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary"
        />
      ) : null}
      <Icon
        className={cn("size-[18px] shrink-0", active && "text-primary")}
        aria-hidden="true"
      />
      <span className={cn("truncate", collapsible && "nav-label")}>
        {item.label}
      </span>
    </Link>
  );
}

/**
 * Navigation list shared by the desktop sidebar and the tablet/mobile drawer.
 *
 * Both surfaces — and both sidebar states — render this one component from the
 * single navigation config, so a destination can never drift between
 * presentations. Collapsing changes how a link is drawn, never which links
 * exist.
 */
export function NavList({
  onNavigate,
  collapsible = false,
  className,
}: {
  onNavigate?: () => void;
  /** Enables rail styling and collapsed-state tooltips (desktop sidebar). */
  collapsible?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const active = findActiveNavItem(pathname);
  const { isCollapsed } = useSidebarState();

  // Tooltips exist only where the label is actually hidden. Showing them while
  // the sidebar is expanded would just repeat the visible text.
  const showTooltips = collapsible && isCollapsed;

  const render = (item: NavItem) => {
    const link = (
      <NavLink
        item={item}
        active={active?.id === item.id}
        collapsible={collapsible}
        onNavigate={onNavigate}
      />
    );

    if (!showTooltips) {
      return (
        <div key={item.id} className="contents">
          {link}
        </div>
      );
    }

    return (
      <Tooltip key={item.id}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  };

  const content = (
    <nav className={cn("flex flex-col gap-1", className)} aria-label="Main">
      {PRIMARY_NAV.map(render)}

      <hr className="my-3 border-border/70" />

      {SECONDARY_NAV.map(render)}
    </nav>
  );

  // The provider owns shared open/close timing, so it wraps the whole list
  // rather than each item. Only mounted where tooltips are actually used.
  return showTooltips ? (
    <TooltipProvider delayDuration={150}>{content}</TooltipProvider>
  ) : (
    content
  );
}
