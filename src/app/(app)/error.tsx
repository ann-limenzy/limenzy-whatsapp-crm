"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary for in-application screens (spec §178).
 *
 * Scoped to the route, so the shell and navigation keep working when one
 * screen fails — spec §24 requires a partial failure not to block everything.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replaced by the application logger once one exists.
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="surface-elevated flex flex-col items-center rounded-xl px-6 py-14 text-center"
    >
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-danger-subtle text-danger-on-subtle">
        <TriangleAlert className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold text-foreground">
        Unable to load this screen
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        Something went wrong while rendering this page. Navigation and the rest
        of the application are unaffected.
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
  );
}
