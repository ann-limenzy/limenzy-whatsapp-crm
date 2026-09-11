"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  PRIMARY_NAV,
  SECONDARY_NAV,
  findActiveNavItem,
  type NavItem,
} from "@/config/navigation";
import { cn } from "@/lib/utils";

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      data-testid={`nav-${item.id}`}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/**
 * Navigation list shared by the desktop sidebar and the tablet/mobile drawer.
 *
 * Both surfaces render this one component from the single navigation config,
 * so a nav item can never drift between viewports.
 */
export function NavList({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const active = findActiveNavItem(pathname);

  return (
    <nav className={cn("flex flex-col gap-1", className)} aria-label="Main">
      {PRIMARY_NAV.map((item) => (
        <NavLink
          key={item.id}
          item={item}
          active={active?.id === item.id}
          onNavigate={onNavigate}
        />
      ))}

      <hr className="my-3 border-border/70" />

      {SECONDARY_NAV.map((item) => (
        <NavLink
          key={item.id}
          item={item}
          active={active?.id === item.id}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}
