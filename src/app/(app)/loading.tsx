import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level loading state for in-application screens (spec §178, §24).
 *
 * Skeleton blocks rather than a full-page spinner, so the shell stays visible
 * and the page does not jump when content arrives.
 */
export default function AppLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
