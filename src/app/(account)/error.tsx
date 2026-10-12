"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Boundary for the account pages — setup, the chooser, and no-access.
 *
 * It catches failures in those pages, including a database outage while
 * resolving memberships or reading workspace names. It does NOT catch a
 * failure in `(account)/layout.tsx` itself; that is what the root
 * `app/error.tsx` is for.
 *
 * The wording stays on the right side of one line: a resolution failure is a
 * temporary fault, never evidence about this user's access. It must not read
 * as "you have no workspace".
 */
export default function AccountError({
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
        Something went wrong
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        We could not finish checking your workspace access just now. This is a
        temporary problem, not a change to your account.
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
