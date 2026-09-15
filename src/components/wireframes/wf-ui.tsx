import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Wireframe building blocks.
 *
 * These follow the approved surface tiers: glass for summary and navigation
 * surfaces, elevated for section panels, solid for anything holding data or
 * input. They exist only to keep the wireframe screens consistent with each
 * other — production modules build their own components.
 */

/** Section panel. Holds a titled group of content. */
export function Panel({
  title,
  count,
  action,
  icon: Icon,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  count?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        // `min-w-0`: a panel is often a grid or flex item, and without this it
        // refuses to shrink below the width of a wide table inside it — which
        // is how a scrollable table ends up widening the whole page instead.
        "surface-elevated min-w-0 overflow-hidden rounded-xl",
        className,
      )}
    >
      {title ? (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-5">
          {Icon ? (
            <Icon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          ) : null}
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {count !== undefined ? (
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
              {count}
            </span>
          ) : null}
          {action ? <div className="ms-auto">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
  );
}

/**
 * Summary metric.
 *
 * Glass tier, matching the approved dashboard reference: the number carries
 * the emphasis and the caption stays quiet.
 */
export function Metric({
  label,
  value,
  caption,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  caption?: string;
  icon: LucideIcon;
  tone?: "primary" | "info" | "warning" | "danger";
}) {
  const toneClass = {
    primary: "bg-primary/12 text-primary",
    info: "bg-info-subtle text-info-on-subtle",
    warning: "bg-warning-subtle text-warning-on-subtle",
    danger: "bg-danger-subtle text-danger-on-subtle",
  }[tone];

  return (
    <div className="surface-glass rounded-xl p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-lg",
            toneClass,
          )}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 text-2xl leading-none font-semibold tracking-tight text-foreground">
            {value}
          </p>
          {caption ? (
            <p className="mt-1.5 truncate text-xs text-muted-foreground">
              {caption}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Initials avatar. No external image, so it renders identically everywhere. */
export function Avatar({
  initials,
  size = "md",
  tone = "primary",
}: {
  initials: string;
  size?: "sm" | "md" | "lg";
  tone?: "primary" | "muted" | "whatsapp";
}) {
  const sizeClass = {
    sm: "size-7 text-[10px]",
    md: "size-9 text-xs",
    lg: "size-11 text-sm",
  }[size];
  const toneClass = {
    primary: "bg-primary/15 text-primary",
    muted: "bg-muted text-muted-foreground",
    whatsapp: "bg-channel-whatsapp-subtle text-channel-whatsapp-on-subtle",
  }[tone];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        sizeClass,
        toneClass,
      )}
    >
      {initials}
    </span>
  );
}

/**
 * Table wrapper.
 *
 * Every wireframe table scrolls inside its own container rather than pushing
 * the page sideways — that is what keeps the narrowest supported phone free
 * of horizontal overflow.
 */
export function TableScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    /**
     * `contain-paint` is doing real work here, not decoration.
     *
     * `overflow-x-auto` alone scrolls the table correctly — measured at 326px,
     * the box stays 292px wide with an 890px scroll width — but Chrome still
     * propagates that overflow to the document, so the whole page gained ~450px
     * of empty horizontal scroll. Neither `overflow-hidden` on the panel nor
     * `overflow-x-clip` on the page root stopped it; containing paint does.
     */
    <div className={cn("w-full overflow-x-auto contain-paint", className)}>
      {children}
    </div>
  );
}

/** Explanatory note. Used to state what the CRM deliberately does not do. */
export function Note({
  icon: Icon,
  tone = "info",
  children,
  className,
}: {
  icon?: LucideIcon;
  tone?: "info" | "warning" | "neutral";
  children: ReactNode;
  className?: string;
}) {
  const toneClass = {
    info: "border-info/30 bg-info-subtle text-info-on-subtle",
    warning: "border-warning/30 bg-warning-subtle text-warning-on-subtle",
    neutral: "border-border bg-muted text-muted-foreground",
  }[tone];
  return (
    <p
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-relaxed",
        toneClass,
        className,
      )}
    >
      {Icon ? (
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : null}
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Step rail shown across the top of the multi-step import flow. */
export function StepRail({
  steps,
  current,
}: {
  steps: readonly string[];
  current: number;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs">
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
                state === "current" &&
                  "border-primary/40 bg-primary/12 text-primary",
                state === "done" &&
                  "border-success/30 bg-success-subtle text-success-on-subtle",
                state === "todo" &&
                  "border-border bg-muted text-muted-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-4 place-items-center rounded-full text-[10px] font-semibold",
                  state === "current" && "bg-primary text-primary-foreground",
                  state === "done" && "bg-success text-success-foreground",
                  state === "todo" && "bg-border-strong/40 text-foreground",
                )}
              >
                {i + 1}
              </span>
              {label}
              {state === "current" ? (
                <span className="sr-only">(current step)</span>
              ) : null}
            </span>
            {i < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="h-px w-3 bg-border-strong/40"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Page heading used inside a wireframe screen. */
export function ScreenHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
