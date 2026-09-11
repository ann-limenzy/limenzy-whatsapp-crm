import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Empty state (spec §178).
 *
 * Used throughout Milestone 1A for module routes that exist so navigation can
 * be verified but whose functionality is not built yet. Each one states plainly
 * what is not there rather than rendering an unexplained blank panel.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  footnote,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Small print, e.g. the specification sections this screen will implement. */
  footnote?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "surface-elevated flex flex-col items-center justify-center rounded-xl px-6 py-14 text-center",
        className,
      )}
    >
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {footnote ? (
        <p className="mt-3 font-mono text-xs text-muted-foreground/80">
          {footnote}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
