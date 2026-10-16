import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/data/empty-state";
import { StatusBadge } from "@/components/data/status-badge";

/**
 * Route placeholder for a module that has not been built yet.
 *
 * These routes exist only so navigation, the active-item state, page titles and
 * responsive layout can be verified end to end. They render no metrics, no
 * records and no sample business data — an unbuilt screen says so plainly
 * rather than showing invented numbers.
 */
export function ModulePlaceholder({
  icon,
  title,
  description,
  specSections,
  milestone,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /**
   * Optional. These are build-tracking details, not something a person using
   * the CRM needs, so screens that are in front of real users leave them out.
   */
  specSections?: string;
  /** Which milestone delivers this screen. Optional, for the same reason. */
  milestone?: string;
}) {
  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="min-w-0 text-xl font-semibold tracking-tight break-words text-foreground sm:text-2xl">
          {title}
        </h2>
        <StatusBadge
          tone="neutral"
          label={milestone ? `Not built · ${milestone}` : "Not built yet"}
        />
      </div>

      <EmptyState
        icon={icon}
        title={`${title} isn't built yet`}
        description={description}
        footnote={specSections ? `Specification ${specSections}` : undefined}
      />
    </div>
  );
}
