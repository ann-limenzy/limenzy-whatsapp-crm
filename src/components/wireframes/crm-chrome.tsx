import {
  BellRing,
  Building2,
  CalendarCheck,
  ChartColumn,
  LayoutDashboard,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  PoweredByLimenzy,
  WireframeBrand,
} from "@/components/wireframes/wireframe-brand";
import { Avatar } from "@/components/wireframes/wf-ui";
import { CURRENT_USER, WORKSPACE } from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * Desktop CRM chrome for wireframe screens.
 *
 * A non-interactive stand-in for the real application shell, so the client
 * sees each workflow in the place it will actually live. It reuses the
 * approved tokens and the real logo lockup, but none of the real navigation
 * components — wireframe screens must never depend on production shell state,
 * and the production shell must never have to accommodate a wireframe.
 *
 * Below `lg` the sidebar is withheld and the content becomes a single column,
 * so these desktop screens still render without horizontal overflow on a
 * phone. They are designed for 1280×800 and 1440×900.
 */

/**
 * `href` is set only where a wireframe for that destination exists. Entries
 * without one render as plain, non-clickable rows: the client can see the
 * module is planned without the demo offering a link to nowhere.
 */
type NavEntry = {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: Route;
};

const NAV: readonly NavEntry[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/wireframes/admin/dashboard",
  },
  { id: "leads", label: "Leads", icon: Users },
  { id: "customers", label: "Customers", icon: Building2 },
  { id: "follow-ups", label: "Follow-ups", icon: CalendarCheck },
  { id: "renewals", label: "Renewals & Reminders", icon: BellRing },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    href: "/wireframes/whatsapp/inbox",
  },
  { id: "reports", label: "Reports", icon: ChartColumn },
];

const SECONDARY: readonly NavEntry[] = [
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    href: "/wireframes/admin/settings",
  },
];

export function CrmChrome({
  active,
  children,
}: {
  /** Nav id to show as the current destination. */
  active: string;
  children: ReactNode;
}) {
  return (
    // `overflow-x-clip` rather than `-hidden`: clip contains the wide tables
    // without turning this into a scroll container, so the sticky sidebar and
    // top bar keep working. Each table still scrolls inside its own panel.
    <div className="app-ambient min-h-dvh overflow-x-clip">
      <div className="flex">
        <Sidebar active={active} />

        <div className="min-w-0 flex-1">
          <TopBar />
          <main className="px-4 py-5 sm:px-6">
            <div className="mx-auto w-full max-w-[1400px] min-w-0">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ active }: { active: string }) {
  return (
    <aside
      /**
       * Width comes from `--sidebar-w` rather than a fixed value. The pre-paint
       * script sets `data-sidebar` on <html> for every route, so a visitor who
       * collapsed the sidebar in the product arrives here with that preference
       * already applied — this makes the wireframe rail follow it instead of
       * silently ignoring it.
       */
      className="surface-glass sticky top-0 hidden h-dvh w-[var(--sidebar-w)] shrink-0 flex-col rounded-none border-y-0 border-s-0 px-3 py-4 transition-[width] duration-200 ease-out lg:flex"
    >
      <div className="px-2 pb-5">
        <WireframeBrand variant="sidebar" />
      </div>

      <nav aria-label="CRM sections" className="flex flex-col gap-1">
        {NAV.map((item) => (
          <NavRow key={item.id} item={item} active={item.id === active} />
        ))}
        <hr className="my-3 border-border/70" />
        {SECONDARY.map((item) => (
          <NavRow key={item.id} item={item} active={item.id === active} />
        ))}
      </nav>

      <div className="sidebar-when-expanded mt-auto flex flex-col gap-2.5 px-2 pt-4">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {WORKSPACE.name}
          <br />
          <span className="text-muted-foreground/70">Workspace</span>
        </p>
        {/* The wireframes wear the client's name; the CRM underneath is
            Limenzy, credited quietly at the foot of the rail. A fixed overlay
            was tried first and sat on top of the workspace name. */}
        <PoweredByLimenzy className="border-t border-border/60 pt-2.5" />
      </div>
    </aside>
  );
}

function NavRow({ item, active }: { item: NavEntry; active: boolean }) {
  const Icon = item.icon;
  const className = cn(
    "nav-link relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
    active ? "surface-glass-strong text-foreground" : "text-muted-foreground",
    item.href && !active && "hover:bg-accent/60 hover:text-foreground",
  );

  const inner = (
    <>
      {active ? (
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary"
        />
      ) : null}
      <Icon
        className={cn("size-[18px] shrink-0", active && "text-primary")}
        aria-hidden="true"
      />
      <span className="nav-label truncate">{item.label}</span>
    </>
  );

  if (!item.href) {
    // No wireframe behind this module yet, so it is not a control at all.
    return <span className={className}>{inner}</span>;
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {inner}
    </Link>
  );
}

function TopBar() {
  return (
    <div className="surface-glass sticky top-0 z-20 rounded-none border-x-0 border-t-0 px-4 py-3 sm:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-3">
        <div className="surface-solid hidden min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground md:flex">
          <Search className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">
            Search leads, customers, or anything…
          </span>
        </div>

        <span className="hidden shrink-0 text-sm text-muted-foreground lg:inline">
          {WORKSPACE.todayShort}
        </span>

        <span className="relative ms-auto grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground md:ms-0">
          <BellRing className="size-[18px]" aria-hidden="true" />
          <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-danger text-[10px] font-semibold text-danger-foreground">
            3
          </span>
          <span className="sr-only">3 unread notifications</span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <Avatar initials={CURRENT_USER.initials} />
          <span className="hidden text-sm font-medium text-foreground sm:inline">
            {CURRENT_USER.name}
          </span>
        </span>

        <span className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground sm:inline-flex">
          <Plus className="size-4" aria-hidden="true" />
          Add Lead
        </span>
      </div>
    </div>
  );
}
