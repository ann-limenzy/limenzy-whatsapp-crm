import { FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * "Concept wireframe" marker.
 *
 * Present on every wireframe screen so a screenshot cannot be mistaken for
 * finished software. Deliberately quiet — it labels the work without
 * competing with it.
 */
export function ConceptBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border-strong/40 bg-neutral-subtle px-2.5 py-1 text-[11px] font-medium text-neutral-on-subtle",
        className,
      )}
    >
      <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
      Concept wireframe
    </span>
  );
}
