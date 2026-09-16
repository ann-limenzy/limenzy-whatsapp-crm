"use client";

import {
  BarChart3,
  CalendarCheck,
  ChevronRight,
  FileText,
  Lock,
  Mail,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useMemo } from "react";

import { PhoneFrame, PhoneScreen } from "@/components/wireframes/phone-frame";
import { WireframeBrand } from "@/components/wireframes/wireframe-brand";
import { Avatar } from "@/components/wireframes/wf-ui";
import {
  MOBILE_FOLLOW_UPS,
  MOBILE_RENEWALS,
  RENEWAL_DUE_SOON_DAYS,
  SALES_PERSONA,
} from "@/lib/wireframes/mock-data";

/**
 * M1 — More, on a phone.
 *
 * §25 puts five items in the bottom bar and says "More provides access to
 * Renewals & Reminders and other permitted modules". This is that screen: the
 * modules this role can actually reach, with the work waiting in each one.
 *
 * "Permitted" is doing real work here. Reports is present but closed, because
 * §162 gives Staff/Sales "View Reports: No" — that is a role boundary, not a
 * missing wireframe, and the row says so rather than hiding it and pretending
 * the module does not exist. Admin settings, user management and import are
 * absent entirely: §162 denies Staff all three, so offering them even greyed
 * out would misdescribe the product.
 *
 * Counts are derived from the same datasets the modules themselves read.
 */

type Module = {
  id: string;
  label: string;
  detail: string;
  icon: LucideIcon;
  /** Set only where the destination wireframe exists AND the role may go. */
  href?: Route;
  /** Why this cannot be opened, when it cannot. */
  reason?: string;
  /** Small derived figure shown on the right. */
  badge?: string;
};

export function MobileMoreScreen() {
  const counts = useMemo(() => {
    const open = MOBILE_FOLLOW_UPS.filter((f) => !f.outcome);
    return {
      followUpsDue: open.filter((f) => f.dueInDays <= 0).length,
      renewalsOverdue: MOBILE_RENEWALS.filter((r) => r.status === "Overdue")
        .length,
      renewalsDueSoon: MOBILE_RENEWALS.filter(
        (r) =>
          r.status !== "Overdue" &&
          r.status !== "Renewed / Completed" &&
          r.dueInDays <= RENEWAL_DUE_SOON_DAYS,
      ).length,
    };
  }, []);

  const modules: readonly Module[] = [
    {
      id: "follow-ups",
      label: "Follow-ups",
      detail: "Overdue, today and upcoming work assigned to you",
      icon: CalendarCheck,
      href: "/wireframes/follow-ups/mobile",
      badge: `${counts.followUpsDue} due`,
    },
    {
      id: "renewals",
      label: "Renewals & Reminders",
      detail: "Policies and services approaching or past their due date",
      icon: RefreshCw,
      href: "/wireframes/renewals/mobile",
      badge: `${counts.renewalsOverdue} overdue · ${counts.renewalsDueSoon} due soon`,
    },
    {
      id: "email",
      label: "Email",
      detail: "Send an email from a permitted lead or customer",
      icon: Mail,
      reason: "Screen not included in this walkthrough",
    },
    {
      id: "documents",
      label: "Customer documents",
      detail: "Files stored against a customer record",
      icon: FileText,
      reason: "Screen not included in this walkthrough",
    },
    {
      id: "reports",
      label: "Reports",
      detail: "Team and pipeline reporting",
      icon: BarChart3,
      // Not a missing screen — a role boundary (§162).
      reason: "Not available for your role",
    },
  ];

  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-0 py-0 md:px-6 md:py-8">
        <PhoneFrame caption="390 × 844 · the rest of the CRM on a phone">
          <PhoneScreen
            activeNav="more"
            header={
              <header className="surface-glass rounded-none border-x-0 border-t-0 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
                <WireframeBrand variant="compact" />

                <div className="mt-3 flex items-center gap-2.5">
                  <Avatar initials={SALES_PERSONA.initials} size="lg" />
                  <span className="min-w-0 flex-1">
                    <h1 className="truncate text-base font-semibold tracking-tight text-foreground">
                      {SALES_PERSONA.name}
                    </h1>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {SALES_PERSONA.role}
                    </span>
                  </span>
                </div>
              </header>
            }
          >
            <div className="flex flex-col gap-3 px-3 py-3">
              <h2 className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Modules
              </h2>

              <ul className="flex flex-col gap-2">
                {modules.map((m) => (
                  <li key={m.id}>
                    <ModuleRow module={m} />
                  </li>
                ))}
              </ul>

              <p className="px-1 pt-1 pb-1 text-[11px] leading-relaxed text-muted-foreground">
                What appears here depends on your role. Workspace settings,
                users and imports are administrator tools and are not part of a
                Sales Executive&apos;s app.
              </p>
            </div>
          </PhoneScreen>
        </PhoneFrame>
      </div>
    </div>
  );
}

/**
 * One module.
 *
 * A row that can be opened is a link with a chevron. A row that cannot is a
 * plain element carrying its reason — visible, so the client can see the shape
 * of the product, but out of the tab order and without a chevron promising a
 * destination that is not there.
 */
function ModuleRow({ module: m }: { module: Module }) {
  const Icon = m.icon;

  const body = (
    <>
      <span
        aria-hidden="true"
        className={
          m.href
            ? "grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"
            : "grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
        }
      >
        <Icon className="size-[18px]" />
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={
            m.href
              ? "block truncate text-[13px] font-semibold text-foreground"
              : "block truncate text-[13px] font-semibold text-muted-foreground"
          }
        >
          {m.label}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-muted-foreground">
          {m.href ? m.detail : m.reason}
        </span>
        {m.badge ? (
          <span className="mt-1.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {m.badge}
          </span>
        ) : null}
      </span>

      {m.href ? (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      ) : (
        <Lock
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      )}
    </>
  );

  const className =
    "surface-solid flex min-h-11 w-full items-start gap-3 rounded-xl p-3 text-left";

  if (!m.href) {
    return <span className={className}>{body}</span>;
  }

  return (
    <Link
      href={m.href}
      className={`${className} transition-colors hover:bg-accent/60`}
    >
      {body}
    </Link>
  );
}
