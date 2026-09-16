"use client";

import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Crown,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { useRef, type ReactNode } from "react";

import {
  ELIGIBILITY_LABEL,
  type Eligibility,
} from "@/lib/wireframes/sales-teams";
import { cn } from "@/lib/utils";

/**
 * Shared pieces for the Sales Teams wireframes (spec §163).
 *
 * The chips carry the exact wording the specification requires, so no screen
 * can drift into "Available" or turn Team Lead into a role.
 */

/* ---------------------------------------------------------------- buttons */

/** 44px minimum on every control, desktop included. */
export function buttonClass(
  variant: "primary" | "outline" | "ghost" | "danger" = "primary",
  className?: string,
) {
  return cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    variant === "primary" &&
      "bg-primary text-primary-foreground hover:bg-primary/90",
    variant === "outline" &&
      "border border-border bg-surface text-foreground hover:bg-accent",
    variant === "ghost" &&
      "text-muted-foreground hover:bg-accent hover:text-foreground",
    variant === "danger" &&
      "border border-danger/30 bg-danger-subtle text-danger-on-subtle hover:bg-danger-subtle/80",
    className,
  );
}

/* ------------------------------------------------------------------ chips */

const CHIP =
  "inline-flex w-fit items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

export function EligibilityChip({
  value,
  short = false,
}: {
  value: Eligibility;
  /** "Eligible" / "Paused" where the full label is already in a heading. */
  short?: boolean;
}) {
  return (
    <span
      className={cn(
        CHIP,
        value === "Eligible"
          ? "border-success/30 bg-success-subtle text-success-on-subtle"
          : "border-warning/30 bg-warning-subtle text-warning-on-subtle",
      )}
    >
      {short ? value : ELIGIBILITY_LABEL[value]}
    </span>
  );
}

/** A responsibility, not a role — so it never shares the role chip's look. */
export function TeamLeadBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        CHIP,
        "border-primary/30 bg-primary/12 text-primary",
        className,
      )}
    >
      <Crown className="size-3" aria-hidden="true" />
      Team Lead
    </span>
  );
}

export function StatusChip({
  status,
}: {
  status: "Active" | "Inactive" | "Ended";
}) {
  return (
    <span
      className={cn(
        CHIP,
        status === "Active"
          ? "border-success/30 bg-success-subtle text-success-on-subtle"
          : "border-border-strong/40 bg-neutral-subtle text-neutral-on-subtle",
      )}
    >
      {status}
    </span>
  );
}

export function RoleChip({ label }: { label: string }) {
  return (
    <span className={cn(CHIP, "border-border bg-muted text-muted-foreground")}>
      {label}
    </span>
  );
}

export function WarningChip({ children }: { children: ReactNode }) {
  return (
    <span
      className={cn(
        CHIP,
        "border-danger/30 bg-danger-subtle text-danger-on-subtle",
      )}
    >
      <CircleAlert className="size-3" aria-hidden="true" />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------- navigation */

export function Breadcrumbs({
  items,
}: {
  items: readonly { label: string; href?: Route }[];
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-1">
            {i > 0 ? (
              <ChevronRight className="size-3.5" aria-hidden="true" />
            ) : null}
            {item.href ? (
              <Link
                href={item.href}
                className="inline-flex min-h-11 items-center rounded-md px-1 font-medium transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="px-1 text-foreground">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* --------------------------------------------------------------- feedback */

/** Every successful concept action ends here. */
export function NothingSaved({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-relaxed font-medium text-warning-on-subtle",
        className,
      )}
    >
      Concept wireframe — nothing was saved.
    </p>
  );
}

/** A short list of consequences, stated rather than implied (§177). */
export function Consequences({
  items,
  icon: Icon = CircleCheck,
}: {
  items: readonly ReactNode[];
  icon?: LucideIcon;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground"
        >
          <Icon
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------- dialog */

/**
 * Desktop concept dialog.
 *
 * Radix supplies the modal behaviour — focus is trapped, Escape and the
 * backdrop close it — and this wrapper adds the two things the wireframes
 * need on top: focus lands on the dialog itself, so its title is announced
 * before its controls, and focus returns to whatever opened it even though
 * the dialogs are opened from ordinary buttons rather than Radix triggers.
 *
 * The panel is capped to the viewport and scrolls inside itself, so a long
 * confirmation never pushes its buttons off-screen at 1280 × 800.
 */
export function ConceptDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const returnTo = useRef<HTMLElement | null>(null);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/45" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            // Focus has not moved yet: this is still the control that opened
            // the dialog.
            returnTo.current = document.activeElement as HTMLElement | null;
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnTo.current;
            if (target?.isConnected) target.focus();
          }}
          className="surface-solid fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl shadow-2xl outline-none"
        >
          <div className="flex items-start gap-3 border-b border-border px-5 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold text-foreground">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">
                  {title}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label={`Close ${title}`}
              className="-me-2 grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {children}
          </div>
          {footer ? (
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
