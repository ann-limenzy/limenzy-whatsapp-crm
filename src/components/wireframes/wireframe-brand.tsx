import type { Route } from "next";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * A&S FinCare brand layer for the presentation wireframes.
 *
 * Deliberately separate from `LimenzyLogo` rather than a variant of it.
 * Limenzy is the product; A&S FinCare is a workspace inside it, and the
 * approved architecture keeps customer branding out of the shared product
 * (spec §179.1). Holding the demo lockup in its own component lets the client
 * presentation carry their mark without that mark reaching the application
 * everyone else uses.
 *
 * Uses the official logo supplied in `brand/AS-LOGO-03-1.png`. That file is
 * never edited; two derivatives are served from /public/brand:
 *
 *   as-fincare-logo.png    the lockup without the strapline, measured at
 *                          y 0–317 of the original. The full artwork renders
 *                          the strapline at about 7px in a sidebar, which is
 *                          mush rather than brand.
 *   as-fincare-symbol.png  the chevron alone, measured at x 546–890, for the
 *                          collapsed rail where 76px leaves no room for a
 *                          5:1 lockup.
 *
 * The wordmark is printed in deep indigo, so on the dark theme it would sit
 * almost invisibly on navy. Rather than recolour someone else's logo, dark
 * mode places it on a light plate — the standard treatment for a single-
 * version asset, and it keeps the supplied colours exact.
 */

type BrandVariant = "sidebar" | "compact" | "plain";

const LOGO = { src: "/brand/as-fincare-logo.png", w: 1610, h: 318 };
const SYMBOL = { src: "/brand/as-fincare-symbol.png", w: 345, h: 318 };

/** Logo on a plate that only appears in dark mode, where it is needed. */
function Logo({ height, className }: { height: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md dark:bg-foreground/95 dark:px-2 dark:py-1.5",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size
          static raster; the optimiser adds nothing for a logo this small. */}
      <img
        src={LOGO.src}
        alt=""
        aria-hidden="true"
        width={LOGO.w}
        height={LOGO.h}
        style={{ height, width: Math.round(height * (LOGO.w / LOGO.h)) }}
        className="block max-w-full object-contain"
      />
    </span>
  );
}

function ProductName({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "leading-none font-semibold text-primary uppercase",
        className,
      )}
    >
      CRM
    </span>
  );
}

export function WireframeBrand({
  variant = "plain",
  className,
}: {
  /**
   * `sidebar` follows the product's collapse contract, `compact` is the
   * phone-sized lockup, `plain` is the standalone mark.
   */
  variant?: BrandVariant;
  className?: string;
}) {
  return (
    <Link
      href={"/wireframes" as Route}
      // One accessible name for the whole lockup; every visual part inside is
      // hidden, so it cannot announce twice.
      aria-label="A&S FinCare CRM — all wireframes"
      data-testid="wireframe-brand"
      className={cn(
        "inline-flex shrink-0 items-center rounded-md",
        variant === "sidebar" && "sidebar-brand",
        className,
      )}
    >
      {variant === "sidebar" ? (
        <>
          {/* Reuses the product's collapse classes, so the rail presentation
              is correct in the first painted frame rather than after React
              hydrates — and stays in step if those rules ever change. */}
          <span
            aria-hidden="true"
            // `flex` is needed for `flex-col` to apply; the collapse rule that
            // hides this is unlayered, so it still wins over this utility.
            className="sidebar-when-expanded flex flex-col items-start gap-1.5"
          >
            <Logo height={30} />
            <ProductName className="text-[10px] tracking-[0.2em]" />
          </span>
          <span aria-hidden="true" className="sidebar-when-collapsed">
            {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
            <img
              src={SYMBOL.src}
              alt=""
              width={SYMBOL.w}
              height={SYMBOL.h}
              className="block h-7 w-auto object-contain"
            />
          </span>
        </>
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            "flex items-center",
            variant === "compact" ? "gap-2" : "gap-2.5",
          )}
        >
          <Logo height={variant === "compact" ? 22 : 34} />
          <span
            aria-hidden="true"
            className="h-4 w-px shrink-0 bg-border-strong/60"
          />
          <ProductName
            className={
              variant === "compact"
                ? "text-[10px] tracking-[0.16em]"
                : "text-[12px] tracking-[0.18em]"
            }
          />
        </span>
      )}
    </Link>
  );
}

/**
 * Product credit.
 *
 * The wireframes wear the client's mark, but the CRM underneath is Limenzy —
 * so the product is credited quietly rather than hidden. Deliberately small
 * and muted: it belongs at the foot of a page, never competing with the
 * client's own brand.
 */
export function PoweredByLimenzy({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "text-[11px] leading-none text-muted-foreground",
        className,
      )}
    >
      Powered by <span className="font-medium">Limenzy</span>
    </p>
  );
}
