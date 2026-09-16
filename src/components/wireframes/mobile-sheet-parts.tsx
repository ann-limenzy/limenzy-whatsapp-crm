"use client";

import { CircleCheck, Lock, X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Shared chrome for the phone bottom sheets.
 *
 * The WhatsApp conversation and the customer record both drive the same set of
 * actions — call, follow-up, note, a More menu — so the rows, fields and
 * confirmation panel live here once. Duplicating them per screen is how two
 * "identical" sheets quietly drift into different touch targets and different
 * disclosure wording.
 *
 * Every control here is presentation-only. Nothing is saved, sent or dialled.
 */

/** Thumb-zone action above the fold: icon over a short label, 44px minimum. */
export function PrimaryAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
    >
      <Icon className="size-[18px] shrink-0 text-primary" aria-hidden="true" />
      <span className="w-full truncate text-center leading-tight">{label}</span>
    </button>
  );
}

export function SheetHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start gap-3 pb-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {subtitle}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={`Close ${title.toLowerCase()}`}
        className="-mt-1 grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Row in the More sheet that actually does something. */
export function SheetAction({
  icon: Icon,
  label,
  detail,
  tone = "default",
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  tone?: "default" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
    >
      <Icon
        className={cn(
          "size-[18px] shrink-0",
          tone === "danger" ? "text-danger-on-subtle" : "text-muted-foreground",
        )}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">
          {label}
        </span>
        {detail ? (
          // Two lines rather than an ellipsis: at 326px a truncated
          // explanation stops mid-sentence and explains nothing.
          <span className="line-clamp-2 block text-[11px] leading-snug text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * Row that exists to show the capability but cannot be used here.
 *
 * Rendered as a plain element rather than a disabled button: it is not a
 * control at all, so it stays out of the tab order instead of offering focus
 * to something that can never act.
 */
export function SheetInactive({
  icon: Icon,
  label,
  reason,
}: {
  icon: LucideIcon;
  label: string;
  reason: string;
}) {
  return (
    <span className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 opacity-70">
      <Icon
        className="size-[18px] shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-muted-foreground">
          {label}
        </span>
        <span className="line-clamp-2 block text-[11px] leading-snug text-muted-foreground/80">
          {reason}
        </span>
      </span>
      <Lock
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </span>
  );
}

export function SheetField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export const FIELD_CLASS =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-surface px-2.5 text-[13px] text-foreground";

/** Local confirmation panel shared by the follow-up and note sheets. */
export function Confirmed({
  title,
  detail,
  closeLabel,
  onClose,
}: {
  title: string;
  detail: string;
  /** Names where the sheet returns to, so the user is never guessing. */
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="pt-1">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-success-subtle text-success-on-subtle"
        >
          <CircleCheck className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {detail}
          </p>
        </div>
      </div>
      <p className="mt-3 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-[11px] leading-relaxed text-warning-on-subtle">
        Concept wireframe — nothing was saved.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-3.5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
      >
        {closeLabel}
      </button>
    </div>
  );
}
