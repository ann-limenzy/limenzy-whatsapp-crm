"use client";

import {
  Contact,
  Ellipsis,
  LayoutDashboard,
  MessageCircle,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Phone presentation frame.
 *
 * On a laptop — where this will be presented — the mobile screens sit inside
 * a 390px device outline, so the client can see they are phone screens rather
 * than a narrow web page. On an actual phone the frame dissolves: the screen
 * fills the viewport and behaves exactly as it would in the installed app.
 *
 * The outline is decoration, so it is `md`-and-up only and never constrains
 * the real mobile layout.
 */
export function PhoneFrame({
  children,
  caption,
}: {
  children: ReactNode;
  caption?: string;
}) {
  return (
    <div className="md:flex md:flex-col md:items-center">
      {/* Device outline: a plain rounded bezel, not a photo-real handset. */}
      <div
        className={cn(
          "relative mx-auto w-full",
          "md:w-[390px] md:rounded-[2.25rem] md:border-8 md:border-foreground/85 md:shadow-2xl",
        )}
      >
        {/* Status bar. Purely illustrative — it shows the safe area is
            respected rather than pretending to be iOS. */}
        <div className="hidden items-center justify-between rounded-t-[1.6rem] bg-foreground/85 px-6 pt-1 pb-2 text-[11px] font-medium text-background md:flex">
          <span>9:41</span>
          <span aria-hidden="true">▮▮▮ ▮</span>
        </div>

        <div className="surface-solid h-dvh overflow-hidden border-0 md:h-[780px] md:rounded-b-[1.6rem] md:border-x-0 md:border-b-0">
          {children}
        </div>
      </div>

      {caption ? (
        <p className="mt-3 hidden text-center text-xs text-muted-foreground md:block">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The approved mobile bottom navigation (spec §25), as a static mock.
 *
 * Sticky inside the phone frame rather than fixed to the viewport, so several
 * phone screens can sit side by side on a presentation page without four
 * navigation bars stacking on top of one another.
 */
const MOBILE_NAV: readonly {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Set only where the destination wireframe exists. */
  href?: Route;
}[] = [
  {
    id: "home",
    label: "Home",
    icon: LayoutDashboard,
    href: "/wireframes/sales/today",
  },
  { id: "leads", label: "Leads", icon: Users },
  /**
   * No href. The customer DIRECTORY does not exist yet, and pointing this at
   * Ramesh Kumar's record would tell the client that tapping "Customers" from
   * any screen opens one particular customer. The item stays visible because
   * the specification puts it in the default bar; it becomes a link when the
   * directory screen is built.
   */
  { id: "customers", label: "Customers", icon: Contact },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    href: "/wireframes/whatsapp/mobile-inbox",
  },
];

export function MobileBottomNav({ active }: { active: string }) {
  return (
    <nav
      aria-label="Primary"
      className="surface-glass sticky bottom-0 z-10 grid grid-cols-5 rounded-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]"
    >
      {MOBILE_NAV.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === active;
        // 56px tall: comfortably over the 44px minimum target.
        const className = cn(
          "relative flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium xs:text-[11px]",
          isActive ? "text-primary" : "text-muted-foreground",
        );
        const inner = (
          <>
            {isActive ? (
              <span
                aria-hidden="true"
                className="absolute top-0 h-0.5 w-8 rounded-b-full bg-primary"
              />
            ) : null}
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="w-full truncate text-center leading-tight">
              {item.label}
            </span>
          </>
        );

        if (!item.href) {
          return (
            // `aria-current` belongs here too, not only on the link branch:
            // Customers marks the section the user is in even though the
            // directory it would link to does not exist yet.
            <span
              key={item.id}
              aria-current={isActive ? "page" : undefined}
              className={className}
            >
              {inner}
            </span>
          );
        }

        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={className}
          >
            {inner}
          </Link>
        );
      })}
      <span className="flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-medium text-muted-foreground xs:text-[11px]">
        <Ellipsis className="size-5 shrink-0" aria-hidden="true" />
        <span className="w-full truncate text-center leading-tight">More</span>
      </span>
    </nav>
  );
}

/**
 * Phone screen scaffold: a compact app bar, a scrolling body and the bottom
 * navigation, laid out so the body is the only thing that scrolls.
 */
export function PhoneScreen({
  header,
  children,
  activeNav,
  sheet,
}: {
  header: ReactNode;
  children: ReactNode;
  activeNav: string;
  /**
   * Modal sheet for this screen. Rendered as a sibling of the scrolling pane
   * rather than inside it, so it covers the visible phone viewport instead of
   * being carried away by the page scroll.
   */
  sheet?: ReactNode;
}) {
  return (
    /**
     * `relative` makes this element the positioning context for `sheet`, and
     * its height is exactly one phone viewport.
     *
     * The height must be DEFINITE (`h-dvh`, not `min-h-dvh`): a column with an
     * automatic height grows to fit its content no matter what `flex-1` and
     * `min-h-0` say, because flex-grow only distributes free space that a
     * definite height creates. With `min-h-dvh` the frame grew past the
     * viewport, the bottom navigation fell below the fold, and anything
     * positioned against this box landed off-screen.
     */
    <div className="relative flex h-dvh flex-col md:h-[780px]">
      {header}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          // Nothing behind a modal sheet should scroll.
          sheet && "overflow-hidden",
        )}
      >
        {children}
      </div>
      <MobileBottomNav active={activeNav} />
      {sheet}
    </div>
  );
}

/**
 * Bottom sheet for a phone screen.
 *
 * Covers the phone viewport only — on a laptop it stays inside the device
 * outline rather than taking over the browser window, which is why this is an
 * absolutely positioned overlay rather than `fixed inset-0`.
 *
 * Behaves like a modal dialog: focus moves in on open and returns to the
 * trigger on close, Escape and the backdrop dismiss it, and Tab is kept
 * inside the sheet.
 */
export function PhoneSheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = sheetRef.current;
    // Focus the sheet itself rather than its first control, so a screen
    // reader announces the dialog before its actions.
    //
    // `preventScroll` then `scrollIntoView({block: "nearest"})` rather than a
    // plain focus(): the default focus scroll jumps the sheet to the top of
    // the window and drags the phone's own header out of view. "nearest" does
    // nothing when the sheet is already visible — the normal case, and always
    // the case inside the desktop device frame — and otherwise nudges by the
    // minimum needed, which is what happens when the wireframe chrome above
    // the frame has pushed its lower edge past the fold.
    node?.focus({ preventScroll: true });
    node?.scrollIntoView({ block: "nearest" });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !node) return;

      const focusable = node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-30 flex items-end">
      {/* Backdrop. Presentational — the dialog below owns the semantics. */}
      <button
        type="button"
        aria-label={`Close ${label}`}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-foreground/45"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        // Bottom padding clears the home indicator on devices that have one.
        className="surface-solid relative w-full rounded-t-2xl border-x-0 border-b-0 p-4 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-2xl outline-none"
      >
        {children}
      </div>
    </div>
  );
}
