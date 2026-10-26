"use client";

import { useState } from "react";

/**
 * ACTIVITY / DETAILS on a phone — one DOM, not two.
 *
 * The first integration rendered a phone layout AND a wider layout, letting a
 * container query hide whichever did not apply. That duplicated every control
 * inside them, and therefore every `id`: measured on the real screen, all
 * three visible labels on the desktop page — Stage, Record owner, Log a note
 * — resolved to `display:none` controls in the other copy, so clicking a
 * label focused nothing and the visible field had no accessible name.
 *
 * So the sections are rendered ONCE and positioned by CSS. Below 46rem this
 * is a disclosure: two buttons, one section at a time. At 46rem and above the
 * buttons are gone and both sections are simply shown, placed by the grid.
 *
 * A disclosure rather than a tablist, deliberately. `role="tablist"` promises
 * a tab stop with arrow-key movement between panels; at wider widths the
 * buttons do not exist and both panels are visible, which is not what that
 * role describes. `aria-expanded` and `aria-controls` on plain buttons say
 * exactly what is true at every width.
 */
export function LeadDetailSections({
  activity,
  details,
}: {
  activity: React.ReactNode;
  details: React.ReactNode;
}) {
  const [shown, setShown] = useState<"activity" | "details">("activity");

  return (
    <>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1 @min-[46rem]/lead:hidden">
        {(["activity", "details"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-expanded={shown === key}
            aria-controls={`lead-section-${key}`}
            onClick={() => setShown(key)}
            className={`h-11 rounded-md text-sm font-medium transition-colors motion-reduce:transition-none ${
              shown === key
                ? "bg-surface text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {key === "activity" ? "Activity" : "Details"}
          </button>
        ))}
      </div>

      {/*
        `@max-[46rem]/lead:hidden` and nothing else: the section is hidden
        only at the width where the buttons exist to bring it back. Above
        that there is no `hidden` class at all, so both are shown and the
        grid decides where they go.
      */}
      <div
        id="lead-section-activity"
        className={`min-w-0 ${shown === "activity" ? "" : "@max-[46rem]/lead:hidden"}`}
      >
        {activity}
      </div>
      <div
        id="lead-section-details"
        className={`grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4 @min-[36rem]/lead:grid-cols-2 @min-[46rem]/lead:col-span-2 @min-[68rem]/lead:col-span-1 @min-[68rem]/lead:grid-cols-[minmax(0,1fr)] @min-[68rem]/lead:sticky @min-[68rem]/lead:top-20 ${
          shown === "details" ? "" : "@max-[46rem]/lead:hidden"
        }`}
      >
        {details}
      </div>
    </>
  );
}
