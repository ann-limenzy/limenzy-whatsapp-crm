import {
  CircleAlert,
  CircleCheck,
  CircleDot,
  Info,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Semantic status tones.
 *
 * Domain statuses (Follow-up "Overdue", Renewal "Due Soon", Message "Failed" …)
 * map onto these five tones in one place, so every module renders the same
 * status the same way. Spec §178 (common UI states).
 */
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE: Record<StatusTone, { className: string; icon: LucideIcon }> = {
  success: {
    className: "bg-success-subtle text-success-on-subtle border-success/30",
    icon: CircleCheck,
  },
  warning: {
    className: "bg-warning-subtle text-warning-on-subtle border-warning/30",
    icon: TriangleAlert,
  },
  danger: {
    className: "bg-danger-subtle text-danger-on-subtle border-danger/30",
    icon: CircleAlert,
  },
  info: {
    className: "bg-info-subtle text-info-on-subtle border-info/30",
    icon: Info,
  },
  neutral: {
    className:
      "bg-neutral-subtle text-neutral-on-subtle border-border-strong/40",
    icon: CircleDot,
  },
};

/**
 * Status chip.
 *
 * Always renders an icon AND a text label alongside the colour, so status is
 * never communicated by colour alone — it stays readable in greyscale, under
 * colour-vision deficiency, and to assistive technology.
 */
export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  const { className: toneClass, icon: Icon } = TONE[tone];
  return (
    <span
      className={cn(
        // `max-w-full` + wrapping text: a long status can shrink onto two
        // lines instead of pushing the page into horizontal overflow.
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClass,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
