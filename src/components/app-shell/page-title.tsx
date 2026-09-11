"use client";

import { usePathname } from "next/navigation";

import { findActiveNavItem } from "@/config/navigation";

/**
 * Derive a human-readable title from a pathname that has no navigation entry
 * (for example `/design-preview` → "Design preview").
 */
export function titleFromPathname(pathname: string): string {
  const segment = pathname.split("/").filter(Boolean).at(-1);
  if (!segment) return "Limenzy CRM";
  const spaced = segment.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Page title in the global top bar (spec §4).
 *
 * Resolved from the shared navigation config so a title can never disagree
 * with its nav label, falling back to the path for routes outside the nav.
 */
export function PageTitle() {
  const pathname = usePathname();
  const active = findActiveNavItem(pathname);
  const title = active?.label ?? titleFromPathname(pathname);

  return (
    <h1
      data-testid="page-title"
      className="hidden truncate text-[15px] font-semibold text-foreground sm:block"
    >
      {title}
    </h1>
  );
}
