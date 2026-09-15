"use client";

import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ConceptBadge } from "@/components/wireframes/concept-badge";
import { usePresentation } from "@/components/wireframes/presentation-mode";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { INDEX_HREF, SEQUENCE, locate } from "@/lib/wireframes/flows";
import { cn } from "@/lib/utils";

/**
 * Presentation chrome.
 *
 * Wraps every wireframe screen with the controls needed to walk a client
 * through the workflows in order: where we are, what comes next, and a way
 * back to the index. It is scaffolding around the design, not part of it —
 * presentation mode removes it entirely for screenshots.
 */
export function PresentationChrome() {
  const pathname = usePathname();
  const position = locate(pathname);
  const { presenting, setPresenting } = usePresentation();

  if (presenting) {
    /**
     * Presentation mode leaves only the product surface on screen.
     *
     * The exit control has to exist — otherwise the mode is a trap — but it
     * must not appear in a client screenshot, so it stays transparent until
     * pointed at or focused. Keyboard users reach it with Tab and see it.
     *
     * No floating concept label here. It was tried and it interfered with the
     * screenshot on every layout — covering a work card on the phone screens
     * and the workspace name on the desktop ones. The labelling instead lives
     * on the contact sheets, on the wireframe chrome outside presentation
     * mode, and in-content where a screen needs it (the call sheet says
     * "nothing dials" on the screen itself).
     */
    return (
      <>
        <div className="fixed top-3 right-3 z-50 opacity-0 transition-opacity focus-within:opacity-100 hover:opacity-100 print:hidden">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPresenting(false)}
            aria-label="Show wireframe navigation"
            className="surface-glass-strong size-11"
          >
            <Minimize2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </>
    );
  }

  if (!position) return null;

  const { step, previous, next, indexInSequence, flow, indexInFlow } = position;

  return (
    <header className="surface-glass sticky top-0 z-40 rounded-none border-x-0 border-t-0">
      <div className="mx-auto w-full max-w-[1600px] px-3 py-2.5 sm:px-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="shrink-0 px-2 sm:px-3"
          >
            <Link href={INDEX_HREF as Route}>
              <LayoutGrid className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">All wireframes</span>
              <span className="sr-only sm:hidden">Back to wireframes</span>
            </Link>
          </Button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium tracking-wide text-muted-foreground">
              {flow.name} · step {indexInFlow} of {flow.steps.length}
            </p>
            <h1 className="truncate text-sm font-semibold text-foreground sm:text-[15px]">
              {step.title}
            </h1>
          </div>

          <ConceptBadge className="hidden lg:inline-flex" />

          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPresenting(true)}
              aria-label="Hide wireframe navigation"
              title="Presentation mode"
              className="hidden sm:inline-flex"
            >
              <Maximize2 className="size-4" aria-hidden="true" />
            </Button>

            <div className="ms-1 flex items-center gap-1">
              <NavButton
                href={previous?.href}
                label="Previous screen"
                icon={<ChevronLeft className="size-4" aria-hidden="true" />}
              />
              <NavButton
                href={next?.href}
                label="Next screen"
                icon={<ChevronRight className="size-4" aria-hidden="true" />}
              />
            </div>
          </div>
        </div>

        {/* The one-line brief for the screen. Withheld on phones, where the
            screen itself needs every pixel. */}
        <p className="mt-1.5 hidden text-xs leading-relaxed text-muted-foreground md:block">
          {step.summary}
          <span className="ms-2 text-muted-foreground/70">
            {indexInSequence} of {SEQUENCE.length} screens
          </span>
        </p>
      </div>
    </header>
  );
}

function NavButton({
  href,
  label,
  icon,
}: {
  href?: string;
  label: string;
  icon: React.ReactNode;
}) {
  if (!href) {
    return (
      <Button
        variant="outline"
        size="icon"
        disabled
        aria-label={`${label} (none)`}
      >
        {icon}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="icon" asChild>
      <Link href={href as Route} aria-label={label}>
        {icon}
      </Link>
    </Button>
  );
}

/**
 * Footer control repeated at the end of long screens, so the presenter does
 * not have to scroll back up to advance.
 */
export function StepFooter({ className }: { className?: string }) {
  const pathname = usePathname();
  const position = locate(pathname);
  const { presenting } = usePresentation();

  if (presenting || !position) return null;
  const { previous, next } = position;

  return (
    <nav
      aria-label="Wireframe sequence"
      className={cn(
        // Padding lives here rather than on a wrapper in each page, so that
        // when presentation mode hides this nav it leaves nothing behind. A
        // wrapper with `pb-10` was enough to make the page taller than the
        // viewport and push the phone's bottom navigation out of sight.
        "mx-auto mt-8 flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 pb-10 sm:px-6",
        className,
      )}
    >
      <FooterLink
        href={previous?.href}
        label={previous?.title}
        direction="previous"
      />
      <Button variant="ghost" size="sm" asChild>
        <Link href={INDEX_HREF as Route}>All wireframes</Link>
      </Button>
      <FooterLink href={next?.href} label={next?.title} direction="next" />
    </nav>
  );
}

function FooterLink({
  href,
  label,
  direction,
}: {
  href?: string;
  label?: string;
  direction: "previous" | "next";
}) {
  if (!href || !label) return <span className="w-24" aria-hidden="true" />;
  const isNext = direction === "next";
  return (
    <Button variant="outline" asChild className="max-w-[45%]">
      <Link href={href as Route}>
        {!isNext && (
          <ChevronLeft className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span className="truncate">{label}</span>
        {isNext && (
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        )}
      </Link>
    </Button>
  );
}
