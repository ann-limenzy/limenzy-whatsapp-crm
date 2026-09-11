import Link from "next/link";

import { cn } from "@/lib/utils";

/** Intrinsic dimensions of both approved SVG assets. */
const LOGO_WIDTH = 221;
const LOGO_HEIGHT = 43;

/**
 * Width of the chevron symbol within the 221x43 wordmark, in viewBox units.
 *
 * Measured from the asset itself by rasterising it and scanning for the first
 * gap between ink columns: the symbol (including its soft shadow filter) runs
 * from x 0 to x 56.3, then there is clear space before the "L" of the
 * wordmark at x 66.1. Rounded up slightly so nothing is shaved off an edge.
 *
 * The rail crops to this window with `overflow: hidden`, so it shows the
 * symbol alone WITHOUT the SVG files being edited, redrawn or re-exported.
 */
const SYMBOL_VIEWBOX_WIDTH = 56.5;
const SYMBOL_ASPECT = SYMBOL_VIEWBOX_WIDTH / LOGO_HEIGHT;

type LogoVariant =
  /** Wordmark + divider + CRM. Drawer and tablet top bar. */
  | "lockup"
  /** Symbol + small CRM. Narrow mobile header. */
  | "compact"
  /** Lockup when the sidebar is expanded, symbol alone when collapsed. */
  | "adaptive";

function Wordmark({ className }: { className?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size static SVG; see note below */}
      <img
        src="/brand/limenzy-glass-logo-light.svg"
        alt=""
        aria-hidden="true"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className={cn("block w-auto dark:hidden", className)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size static SVG; see note below */}
      <img
        src="/brand/limenzy-glass-logo-dark.svg"
        alt=""
        aria-hidden="true"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className={cn("hidden w-auto dark:block", className)}
      />
    </>
  );
}

/**
 * The chevron symbol alone, cropped out of the untouched wordmark asset.
 *
 * The image is laid out at the requested height with its natural aspect ratio
 * and `max-w-none`, so it overflows the wrapper; the wrapper is exactly as
 * wide as the symbol and clips the wordmark away. Deriving the width from the
 * measured constant means the crop cannot drift if the height changes.
 */
function Symbol({ size }: { size: number }) {
  return (
    <span
      aria-hidden="true"
      className="block shrink-0 overflow-hidden"
      style={{ height: size, width: Math.round(size * SYMBOL_ASPECT) }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size static SVG; see note below */}
      <img
        src="/brand/limenzy-glass-logo-light.svg"
        alt=""
        aria-hidden="true"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className="block h-full w-auto max-w-none dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size static SVG; see note below */}
      <img
        src="/brand/limenzy-glass-logo-dark.svg"
        alt=""
        aria-hidden="true"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className="hidden h-full w-auto max-w-none dark:block"
      />
    </span>
  );
}

function Divider() {
  return (
    <span
      aria-hidden="true"
      className="bg-border-strong/60 h-4 w-px shrink-0"
    />
  );
}

function ProductName({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "text-muted-foreground text-[13px] leading-none font-semibold tracking-wide",
        className,
      )}
    >
      CRM
    </span>
  );
}

/**
 * Limenzy CRM product lockup: the Limenzy wordmark, a hairline divider, then
 * the product name — `Limenzy | CRM`.
 *
 * This is a Limenzy *product*, not the corporate application, so the product
 * name sits beside the corporate mark rather than replacing it. `CRM` is
 * deliberately secondary: muted foreground, 13px, no badge, no gradient, no
 * glow.
 *
 * The two approved SVGs are served verbatim from /public/brand and swapped
 * with CSS. Deliberately NOT inlined: both files declare the same internal
 * gradient and filter ids (`limenzyInk`, `limenzyAccent`, `glassDepth`), so
 * inlining both into one document would make `url(#limenzyAccent)` resolve to
 * whichever appeared first and render one theme in the other theme's colours.
 * The SVG files themselves are never edited — every presentation here is
 * composed in markup and CSS around the untouched assets.
 *
 * CSS switching also means the correct logo is present in the first paint —
 * no theme flash and no dependence on client state. The `adaptive` variant
 * switches on the `data-sidebar` attribute for the same reason: the rail must
 * be correct in the first frame, not after React hydrates.
 *
 * Accessibility: the link carries the single accessible name "Limenzy CRM
 * home" in every variant, and every visual part inside it is hidden from
 * assistive technology. That is what stops the theme-switched images
 * announcing twice, and it is why collapsing the sidebar cannot cost the brand
 * its accessible name even though the visible `CRM` label is withheld.
 *
 * Plain <img> rather than next/image: these are fixed-size static SVGs, so the
 * image optimiser adds no value and SVG handling would need extra config.
 */
export function LimenzyLogo({
  className,
  variant = "lockup",
  onNavigate,
}: {
  className?: string;
  variant?: LogoVariant;
  /** Lets an overlay (the nav drawer) close itself when the lockup is used. */
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/dashboard"
      aria-label="Limenzy CRM home"
      onClick={onNavigate}
      data-testid="brand-lockup"
      data-variant={variant}
      className={cn(
        "inline-flex shrink-0 items-center gap-2.5 rounded-md",
        variant === "adaptive" && "sidebar-brand",
        className,
      )}
    >
      {variant === "compact" ? (
        <>
          <Symbol size={26} />
          <ProductName className="text-[12px]" />
        </>
      ) : null}

      {variant === "lockup" ? (
        <>
          <Wordmark className="h-6" />
          <Divider />
          <ProductName />
        </>
      ) : null}

      {variant === "adaptive" ? (
        <>
          <span className="sidebar-when-expanded inline-flex items-center gap-2.5">
            <Wordmark className="h-6" />
            <Divider />
            <ProductName />
          </span>
          <span className="sidebar-when-collapsed items-center justify-center">
            <Symbol size={30} />
          </span>
        </>
      ) : null}
    </Link>
  );
}
