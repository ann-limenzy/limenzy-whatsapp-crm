
/**
 * Formatting and small marks shared by the two Lead previews.
 *
 * In one place so the list and the detail screen cannot disagree about what
 * a date looks like or which tone a stage gets — two screens formatting the
 * same field differently is the thing that makes a product feel assembled
 * rather than designed.
 */

/** The workspace's §158 zone. Fixed here; the real screens read it per workspace. */
export const ZONE = "Asia/Kolkata";

export const dayLabel = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: ZONE,
  }).format(d);

export const longDayLabel = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: ZONE,
  }).format(d);

export const timeLabel = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONE,
  }).format(d);

/** Re-exported so the preview and the real screens cannot disagree. */
export { stageTone } from "@/components/leads/presentation";

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
