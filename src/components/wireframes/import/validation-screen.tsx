"use client";

import {
  CircleAlert,
  CircleCheck,
  Copy,
  Info,
  ListFilter,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";

import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ImportShell } from "@/components/wireframes/import/import-shell";
import { Note, Panel, TableScroll } from "@/components/wireframes/wf-ui";
import {
  VALIDATION_ISSUES,
  VALIDATION_TOTALS,
  type IssueCategory,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * A3 — Validation summary.
 *
 * Every row is sorted into one of four buckets before anything is written.
 * The point the client should take from this screen: a handful of bad rows
 * never holds back the 390 good ones.
 */

type Filter = "all" | IssueCategory | "ready";

const CATEGORIES: {
  id: Filter;
  label: string;
  count: number;
  description: string;
  className: string;
  icon: typeof CircleCheck;
}[] = [
  {
    id: "ready",
    label: "Ready",
    count: VALIDATION_TOTALS.ready,
    description: "Will be imported",
    className: "border-success/30 bg-success-subtle text-success-on-subtle",
    icon: CircleCheck,
  },
  {
    id: "attention",
    label: "Needs attention",
    count: VALIDATION_TOTALS.attention,
    description: "Fixable — your decision",
    className: "border-warning/30 bg-warning-subtle text-warning-on-subtle",
    icon: TriangleAlert,
  },
  {
    id: "duplicate",
    label: "Possible duplicate",
    count: VALIDATION_TOTALS.duplicates,
    description: "Matches an existing record",
    className: "border-info/30 bg-info-subtle text-info-on-subtle",
    icon: Copy,
  },
  {
    id: "cannot-import",
    label: "Cannot import",
    count: VALIDATION_TOTALS.cannotImport,
    description: "Missing required data",
    className: "border-danger/30 bg-danger-subtle text-danger-on-subtle",
    icon: CircleAlert,
  },
];

export function ValidationScreen() {
  const [filter, setFilter] = useState<Filter>("all");

  const visible =
    filter === "all" || filter === "ready"
      ? VALIDATION_ISSUES
      : VALIDATION_ISSUES.filter((i) => i.category === filter);

  return (
    <ImportShell
      current={2}
      title="Validation summary"
      description={`All ${VALIDATION_TOTALS.found} rows were checked against the CRM. Nothing has been written yet — this is what will happen if you continue.`}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const isActive = filter === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilter(isActive ? "all" : c.id)}
              aria-pressed={isActive}
              className={cn(
                "surface-elevated rounded-xl p-4 text-left transition-shadow",
                isActive &&
                  "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-lg border",
                    c.className,
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-2xl leading-none font-semibold tracking-tight text-foreground">
                    {c.count}
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-foreground">
                    {c.label}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <Panel
        title="Rows needing a decision"
        icon={ListFilter}
        count={visible.length}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip
              active={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All
            </FilterChip>
            {CATEGORIES.filter((c) => c.id !== "ready").map((c) => (
              <FilterChip
                key={c.id}
                active={filter === c.id}
                onClick={() => setFilter(c.id)}
              >
                {c.label}
              </FilterChip>
            ))}
          </div>
        }
      >
        {filter === "ready" ? (
          <div className="px-4 py-10 text-center sm:px-6">
            <CircleCheck
              className="mx-auto size-8 text-success-on-subtle"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium text-foreground">
              {VALIDATION_TOTALS.ready} rows are ready to import
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              These rows have a name, a valid contact method and a recognised
              owner. Nothing to do.
            </p>
          </div>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Row
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Value
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Problem
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Category
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((issue) => {
                  const cat = CATEGORIES.find((c) => c.id === issue.category)!;
                  return (
                    <tr
                      key={issue.row}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {issue.row}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {issue.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="block max-w-[18rem] truncate">
                          {issue.detail}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {issue.problem}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            cat.className,
                          )}
                        >
                          <cat.icon className="size-3.5" aria-hidden="true" />
                          {cat.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <Note icon={Info}>
          You do not have to fix everything. Importing the{" "}
          {VALIDATION_TOTALS.ready} ready rows now and dealing with the rest
          later is a normal way to work.
        </Note>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost">Cancel import</Button>
          <Button variant="outline" asChild>
            <Link href={"/wireframes/import/resolve" as Route}>
              Review issues
            </Link>
          </Button>
          <Button asChild>
            <Link href={"/wireframes/import/confirm" as Route}>
              Import {VALIDATION_TOTALS.ready} ready rows
            </Link>
          </Button>
        </div>
      </div>
    </ImportShell>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/12 text-primary"
          : "border-border bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
