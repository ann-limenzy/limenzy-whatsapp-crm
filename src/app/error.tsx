"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * The boundary for failures a group's own `error.tsx` cannot catch.
 *
 * Next.js is explicit that `error.js` wraps the pages and nested layouts
 * BELOW it, and not the `layout.js` of its own segment. Both group layouts
 * resolve workspace access, so a database outage during that resolution throws
 * from exactly the place `(app)/error.tsx` and `(account)/error.tsx` cannot
 * see. Without this file such a failure escapes to `global-error`, which
 * replaces the document and offers no way back into the application.
 *
 * It also catches the root route, which resolves identity to decide where to
 * send a visitor.
 *
 * Retry is genuine: `reset()` re-renders the segment, which re-runs the
 * resolution against the database. An outage that has ended resolves normally.
 *
 * It must never explain an outage as a missing workspace or an onboarding
 * step. The resolver's own types keep that distinction — `database_unavailable`
 * is an error, never `access_unavailable` or `onboarding_required` — and this
 * screen is deliberately vague about the cause rather than guessing at one.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replaced by the application logger once one exists. The resolver's
    // errors carry no connection string, SQL or identifier by construction.
    console.error(error);
  }, [error]);

  return (
    <div className="app-ambient flex min-h-dvh items-center justify-center px-4 py-10">
      <div
        role="alert"
        className="surface-elevated flex w-full max-w-md flex-col items-center rounded-xl px-6 py-14 text-center"
      >
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-danger-subtle text-danger-on-subtle">
          <TriangleAlert className="size-6" aria-hidden="true" />
        </span>
        <h2 className="text-base font-semibold text-foreground">
          We could not load your workspace
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          This is a temporary problem on our side, not a change to your access.
          Your data and your sign-in are unaffected.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-muted-foreground/80">
            Reference: {error.digest}
          </p>
        ) : null}
        <Button onClick={reset} variant="outline" className="mt-6">
          <RotateCw className="size-4" aria-hidden="true" />
          Try again
        </Button>
      </div>
    </div>
  );
}
