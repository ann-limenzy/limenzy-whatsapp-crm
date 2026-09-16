import {
  ArrowRight,
  CalendarCheck,
  Ellipsis,
  LayoutDashboard,
  MessageCircle,
  Monitor,
  Settings,
  RefreshCw,
  Smartphone,
  Upload,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import {
  PoweredByLimenzy,
  WireframeBrand,
} from "@/components/wireframes/wireframe-brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ConceptBadge } from "@/components/wireframes/concept-badge";
import { FLOWS, SEQUENCE, type Flow } from "@/lib/wireframes/flows";
import { WORKSPACE } from "@/lib/wireframes/mock-data";

export const metadata = { title: "Wireframes" };

const ICONS: Record<Flow["icon"], LucideIcon> = {
  Upload,
  MessageCircle,
  Smartphone,
  UserRound,
  CalendarCheck,
  RefreshCw,
  Ellipsis,
  LayoutDashboard,
  Settings,
  UsersRound,
};

export default function WireframesIndexPage() {
  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10 sm:px-6 sm:py-14">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <WireframeBrand />
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {WORKSPACE.name} — workflow wireframes
            </h1>
            <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
              {FLOWS.length} workflows, {SEQUENCE.length} screens. Each one
              shows how the work actually gets done — importing a spreadsheet of
              leads, answering a customer on WhatsApp, opening the customer
              behind that conversation, working a day from a phone, and
              configuring the CRM without a developer.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ConceptBadge />
            <ThemeToggle />
          </div>
        </header>

        <p className="mt-6 max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
          These are design concepts built with sample data. Nothing on these
          screens saves a record, sends a message or places a call.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FLOWS.map((flow) => (
            <FlowCard key={flow.id} flow={flow} />
          ))}
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
          <PoweredByLimenzy />
          <p className="text-[11px] leading-none text-muted-foreground">
            Concept wireframes · sample data · nothing is saved or sent
          </p>
        </footer>
      </div>
    </div>
  );
}

function FlowCard({ flow }: { flow: Flow }) {
  const Icon = ICONS[flow.icon];
  const first = flow.steps[0]!;

  return (
    <article className="surface-elevated flex flex-col rounded-xl p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            {flow.name}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {flow.device === "mobile" ? (
              <Smartphone className="size-3.5" aria-hidden="true" />
            ) : (
              <Monitor className="size-3.5" aria-hidden="true" />
            )}
            {flow.device === "both"
              ? "Desktop and phone"
              : flow.device === "mobile"
                ? "Phone"
                : "Desktop"}
            <span aria-hidden="true">·</span>
            {flow.steps.length} {flow.steps.length === 1 ? "screen" : "screens"}
          </p>
        </div>
      </div>

      <p className="mt-3.5 text-sm leading-relaxed text-muted-foreground">
        {flow.description}
      </p>

      <ol className="mt-4 flex flex-col gap-0.5 pb-1">
        {flow.steps.map((step, i) => (
          <li key={step.href}>
            <Link
              href={step.href as Route}
              className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
            >
              <span
                aria-hidden="true"
                className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
              >
                {i + 1}
              </span>
              <span className="min-w-0 truncate">{step.label}</span>
              {step.device === "mobile" ? (
                <Smartphone
                  className="ms-auto size-3.5 shrink-0 opacity-60"
                  aria-hidden="true"
                />
              ) : null}
            </Link>
          </li>
        ))}
      </ol>

      <Link
        href={first.href as Route}
        className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Open {flow.name}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </article>
  );
}
