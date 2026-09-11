"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { StatusBadge } from "@/components/data/status-badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A top-bar control whose feature is not built yet.
 *
 * These exist so the shell's layout, spacing and responsive behaviour can be
 * assessed against the approved design. They are deliberately NOT simulations:
 * there is no text input to type into and no notification list. Each carries a
 * visible "Not available" chip and, when activated, states plainly which
 * milestone delivers it.
 *
 * Making it a real, focusable button rather than a `disabled` one is
 * intentional — a disabled control cannot be reached by keyboard, so a user
 * relying on the keyboard or a screen reader would get no explanation at all.
 */
export function UnavailableControl({
  icon: Icon,
  label,
  heading,
  body,
  specRef,
  children,
  className,
  testId,
}: {
  icon: LucideIcon;
  /** Accessible name for the trigger. */
  label: string;
  heading: string;
  body: string;
  specRef: string;
  /** Optional visible trigger content (e.g. the search-field presentation). */
  children?: ReactNode;
  className?: string;
  testId: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        data-testid={testId}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        {children ?? <Icon className="size-[18px]" aria-hidden="true" />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{heading}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {body}
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground/80">
              {specRef}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The visible "Not available" marker reused by the unavailable controls. */
export function NotAvailableChip() {
  return <StatusBadge tone="neutral" label="Not available" />;
}
