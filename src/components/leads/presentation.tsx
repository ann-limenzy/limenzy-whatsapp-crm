import type { StatusTone } from "@/components/data/status-badge";
import type { LeadStageKind } from "@/lib/validation/lead-pipeline";

/**
 * Small presentational pieces the Lead screens share.
 *
 * In one place so the list, the preview panel and the detail screen cannot
 * disagree about what a date looks like or which tone a stage gets — two
 * screens formatting the same field differently is what makes a product feel
 * assembled rather than designed.
 */

/**
 * Stage colour, from the stage's KIND and nothing else.
 *
 * §34 lets a workspace rename any stage, Won and Lost included, so a label
 * is not an identity. Nor is `stageIsActive`, which is §34's "this stage is
 * switched on" — Won and Lost stages are switched on like any other, and
 * colouring from that flag showed finished Leads as open. Measured on the
 * real list before this took the kind instead.
 */
export const stageTone = (kind: LeadStageKind): StatusTone =>
  kind === "won" ? "success" : kind === "lost" ? "danger" : "info";

/**
 * A date on the WORKSPACE's §158 clock, formatted on whichever side renders.
 *
 * The locale is pinned so the server pass and the client pass produce the
 * same string: a date rendered from the browser's locale differs between the
 * two, which React reports as a hydration mismatch.
 */
export const formatDay = (date: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(date);

export const formatTime = (date: Date, timeZone: string): string =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);

/** "AN" from "Asha Nair" — two letters at most, never a cropped word. */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/**
 * An initials mark. Decorative — `aria-hidden`, because the name it
 * abbreviates is always beside it. A screen reader announcing "PR" before
 * "Priya Raghavan" is noise, not information.
 */
export function Initials({
  name,
  muted,
  className,
}: {
  name: string;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${
        muted
          ? "bg-muted text-muted-foreground"
          : "bg-primary/10 text-primary ring-1 ring-primary/20"
      } ${className ?? "size-9 text-xs"}`}
    >
      {initialsOf(name)}
    </span>
  );
}
