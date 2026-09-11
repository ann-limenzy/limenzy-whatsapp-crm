import { cn } from "@/lib/utils";

/** Intrinsic dimensions of both approved SVG assets. */
const LOGO_WIDTH = 221;
const LOGO_HEIGHT = 43;

/**
 * Limenzy wordmark.
 *
 * The two approved SVGs are served verbatim from /public/brand and swapped
 * with CSS. Deliberately NOT inlined: both files declare the same internal
 * gradient and filter ids (`limenzyInk`, `limenzyAccent`, `glassDepth`), so
 * inlining both into one document would make `url(#limenzyAccent)` resolve to
 * whichever appeared first and render one theme in the other theme's colours.
 *
 * CSS switching also means the correct logo is present in the first paint —
 * no theme flash and no dependence on client state.
 *
 * Both elements carry the same `alt`. Only one is displayed at a time, and
 * `display: none` removes the other from the accessibility tree, so exactly
 * one accessible name is exposed in either theme.
 *
 * Plain <img> rather than next/image: these are fixed-size static SVGs, so the
 * image optimiser adds no value and SVG handling would need extra config.
 */
export function LimenzyLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size static SVG; see note above */}
      <img
        src="/brand/limenzy-glass-logo-light.svg"
        alt="Limenzy"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className="block h-[26px] w-auto dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size static SVG; see note above */}
      <img
        src="/brand/limenzy-glass-logo-dark.svg"
        alt="Limenzy"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className="hidden h-[26px] w-auto dark:block"
      />
    </span>
  );
}
