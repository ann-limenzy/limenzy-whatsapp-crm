import type { ReactNode } from "react";

/**
 * Card wrapper for an authentication screen.
 *
 * Uses the ELEVATED tier rather than glass. Forms are data-entry surfaces, and
 * the approved surface rules keep those near-opaque for readability — glass is
 * reserved for navigation and summary surfaces.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="surface-elevated rounded-xl p-5 sm:p-7">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      {description ? (
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
      {footer ? (
        <div className="mt-6 border-t border-border/70 pt-4 text-sm text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
