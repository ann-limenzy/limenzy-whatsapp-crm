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
        // No fixed or minimum height: the panel is sized by its content, so a
        // narrow screen gets a short card instead of a tall empty one.
        "surface-elevated flex flex-col items-center justify-center rounded-xl px-4 py-10 text-center sm:px-6 sm:py-14",
        className,
      )}
    >
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-muted text-muted-foreground sm:mb-4 sm:size-12">
        <Icon className="size-5 sm:size-6" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold text-balance text-foreground">
        {title}
      </h2>
      {/* Full card width on narrow screens, capped for line length once there
          is room. Body text never drops below 14px. */}
      <p className="mt-1.5 max-w-full text-sm leading-relaxed text-pretty text-muted-foreground sm:max-w-md">
        {description}
      </p>
      {footnote ? (
        <p className="mt-3 font-mono text-xs break-words text-muted-foreground/80">
          {footnote}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
