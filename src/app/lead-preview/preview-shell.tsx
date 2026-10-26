"use client";

import { Moon, SlidersHorizontal, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { LeadDetailRefresh } from "@/components/leads/preview/lead-detail-refresh";
import { LeadListRefresh } from "@/components/leads/preview/lead-list-refresh";
import {
  SAMPLE_LEADS,
  type SampleKey,
} from "@/components/leads/preview/sample-leads";
import { Button } from "@/components/ui/button";
import { MODULE_KEYS } from "@/lib/modules";

/**
 * The preview, inside the REAL application shell.
 *
 * `AppShell` takes everything it needs as props and performs no server work
 * of its own, so the genuine sidebar, top bar and mobile navigation can be
 * mounted here against invented context. Nothing below reads the database,
 * and the page sits outside `(app)` so no workspace is resolved for it.
 *
 * There is no phone-width toggle. A width-constrained frame cannot be honest
 * once the real shell is here: its sidebar and mobile bar are fixed to the
 * VIEWPORT, so they escape any frame drawn inside it and the picture would
 * show a phone layout with desktop chrome around it. Resize the window — and
 * the screenshots for review are taken at a true 390px viewport.
 *
 * ── Why the shell matters for this review ─────────────────────────────────
 *
 * The first pass judged the layout at full viewport width, which no signed-in
 * user ever sees: the sidebar takes 264px, or 76px collapsed. A column count
 * that looks right at 1440px of window can be wrong at 1128px of content, and
 * collapsing the sidebar changes that number without changing a single
 * viewport breakpoint. The Lead layout is driven by CONTAINER queries for
 * exactly that reason — collapse the sidebar and watch it gain a column.
 *
 * ── Where the review bar lives, and why it is not a bar ───────────────────
 *
 * It floats in the bottom-right corner, clear of every piece of product
 * chrome: the sidebar is on the left, the top bar is along the top, and the
 * mobile navigation sits at the bottom edge — which this clears explicitly.
 * It is styled to be unmistakably not-product: dashed border, mono uppercase,
 * muted. A reviewer must never have to work out whether a control belongs to
 * the design or to the harness.
 *
 * It began as a strip above the shell. That required wrapping the shell in a
 * transformed element so the bar would not be slid under — and a transform
 * makes its subtree the containing block for `position: fixed`, which stopped
 * the sidebar being fixed at all. Measured: after a 400px scroll the sidebar's
 * top was -336px, i.e. it scrolled away with the page. Preserving the shell's
 * real behaviour matters more than where the harness sits, so the harness
 * moved.
 */

/*
 * SYNTHETIC CONTEXT. The same shapes the `(app)` layout resolves from the
 * database, filled with invented values — no session, no workspace, no query.
 */
const PREVIEW_USER = {
  id: "preview-user",
  email: "asha.nair@limenzy.example",
  emailVerified: true,
  fullName: "Asha Nair",
} as const;

const EXAMPLES: { key: SampleKey; label: string; hint: string }[] = [
  { key: "active", label: "Active", hint: "Proposal sent, busy timeline" },
  { key: "lost", label: "Lost", hint: "Outcome, reason, reopen path" },
];

type Screen = "list" | "detail";

export function PreviewShell() {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<Screen>("list");
  const [example, setExample] = useState<SampleKey>("active");
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <>
      <PreviewSubmitGuard>
        <AppShell
          user={PREVIEW_USER}
          workspaceName="Northwind Services"
          role="owner_admin"
          enabledModules={[...MODULE_KEYS]}
        >
          {/*
            Space for the harness, which floats bottom-right. The tool gets
            out of the product's way, not the other way round — on a phone it
            otherwise sat on top of the last card.
          */}
          {/*
            Room at the end of the page for the harness, which is fixed to
            the bottom-right. Without it the last supporting panel sat
            underneath the expanded controls once the page was scrolled to
            the bottom. The tool gets out of the product's way.
          */}
          <div className="pb-20 md:pb-28">
            {screen === "list" ? (
              <LeadListRefresh />
            ) : (
              <LeadDetailRefresh key={example} sample={SAMPLE_LEADS[example]} />
            )}
          </div>
        </AppShell>
      </PreviewSubmitGuard>

      {/*
        THE HARNESS — collapsed by default.

        It was a permanently open row of controls, and on a phone it sat on
        top of the last Lead card: measured, the point at its centre resolved
        to a card's contact line and its link. A review tool that covers the
        thing being reviewed is worse than one that takes a tap to open, so
        it is now a single 44px button that expands on demand and closes
        again. `fixed` to the viewport like the product chrome it sits beside,
        and lifted clear of two things it would otherwise collide with: the
        mobile navigation bar with its safe-area inset, and — measured — the
        Next.js dev indicator, which owns the bottom-right corner on desktop
        and was sitting directly on top of this button.
      */}
      <div
        role="region"
        aria-label="Preview harness"
        className="fixed right-3 bottom-[calc(var(--mobile-nav-h)+env(safe-area-inset-bottom)+0.75rem)] z-50 md:bottom-16"
      >
        {open ? (
          <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-1.5 rounded-lg border border-dashed border-border-strong/60 bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur sm:gap-2">
            <p className="hidden font-mono text-[0.625rem] font-semibold tracking-widest text-muted-foreground uppercase sm:block">
              Preview
            </p>

            <div
              role="group"
              aria-label="Which screen"
              className="flex items-center gap-1 rounded-md border border-dashed border-border-strong/50 p-0.5"
            >
              {(["list", "detail"] as const).map((key) => (
                <Button
                  key={key}
                  size="xs"
                  className="min-h-8"
                  variant={screen === key ? "secondary" : "ghost"}
                  aria-pressed={screen === key}
                  onClick={() => setScreen(key)}
                >
                  {key === "list" ? "List" : "Detail"}
                </Button>
              ))}
            </div>

            {screen === "detail" ? (
              <div
                role="group"
                aria-label="Example lead"
                className="flex items-center gap-1 rounded-md border border-dashed border-border-strong/50 p-0.5"
              >
                {EXAMPLES.map((option) => (
                  <Button
                    key={option.key}
                    size="xs"
                    className="min-h-8"
                    variant={example === option.key ? "secondary" : "ghost"}
                    aria-pressed={example === option.key}
                    title={option.hint}
                    onClick={() => setExample(option.key)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            ) : null}

            <Button
              size="xs"
              variant="ghost"
              className="min-h-8"
              aria-label="Switch between the light and dark theme"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              <Sun className="size-3 dark:hidden" aria-hidden="true" />
              <Moon className="hidden size-3 dark:block" aria-hidden="true" />
              <span className="hidden sm:inline">Theme</span>
            </Button>

            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Collapse the preview harness"
              aria-expanded={true}
              onClick={() => setOpen(false)}
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        ) : (
          <Button
            size="icon"
            variant="outline"
            aria-label="Open the preview harness"
            aria-expanded={false}
            className="size-11 rounded-full border-dashed border-border-strong/60 bg-background/90 shadow-lg backdrop-blur"
            onClick={() => setOpen(true)}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </>
  );
}

/**
 * Nothing in this page may submit a form.
 *
 * The shell is the real one, and the real user menu posts to
 * `signOutAction` — a Server Action that would genuinely end the reviewer's
 * session from inside a page that is supposed to change nothing. The Lead
 * layout itself uses buttons with handlers and contains no form at all, so
 * blocking every submit in this subtree costs the preview nothing and closes
 * the one live write path the shell brings with it.
 *
 * Capture phase, so it runs before React's own handling.
 *
 * It reaches the user menu even though Radix renders that menu into a PORTAL
 * attached to `document.body`, outside this element: React propagates events
 * through the REACT tree, not the DOM tree, and the portal's React parent is
 * in here. Measured rather than assumed — a real click on Sign out produces
 * no POST, no navigation, and leaves the page intact.
 */
function PreviewSubmitGuard({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-preview-guard=""
      onSubmitCapture={(event) => {
        /*
         * BLOCK THE SHELL'S FORMS, NOT THE PREVIEW'S OWN.
         *
         * An earlier version blocked every submit in the subtree. That did
         * stop the user menu's `signOutAction` — and it also silently ate
         * the Lead List's search, which is a plain form inside the page, so
         * searching did nothing at all. Measured: the field held "priya",
         * `requestSubmit()` fired, and nine of nine rows stayed.
         *
         * The distinction is where the form lives. Preview content renders
         * inside the shell's <main>; the only form outside it is the user
         * menu's, which Radix puts in a portal on <body> and which posts to
         * a Server Action. So a form inside <main> is the preview's own and
         * is allowed to handle itself.
         */
        const form = event.target as HTMLElement | null;
        if (form?.closest("main")) return;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}
