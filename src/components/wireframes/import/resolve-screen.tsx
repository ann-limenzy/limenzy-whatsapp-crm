"use client";

import { CircleCheck, Download, ShieldAlert, Wrench } from "lucide-react";
import { useState } from "react";

import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ImportShell } from "@/components/wireframes/import/import-shell";
import { Note, Panel, TableScroll } from "@/components/wireframes/wf-ui";
import { VALIDATION_ISSUES } from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * A4 — Resolve issues.
 *
 * Each problem row carries the actions that make sense for that problem, and
 * nothing more. Deliberately absent: "merge with existing record" and
 * "update existing record" — a normal import never overwrites CRM data.
 */

const CATEGORY_LABEL = {
  attention: "Needs attention",
  duplicate: "Possible duplicate",
  "cannot-import": "Cannot import",
} as const;

const CATEGORY_CLASS = {
  attention: "border-warning/30 bg-warning-subtle text-warning-on-subtle",
  duplicate: "border-info/30 bg-info-subtle text-info-on-subtle",
  "cannot-import": "border-danger/30 bg-danger-subtle text-danger-on-subtle",
} as const;

export function ResolveScreen() {
  const [decisions, setDecisions] = useState<Record<number, string>>({});
  const decided = Object.keys(decisions).length;

  return (
    <ImportShell
      current={3}
      title="Resolve issues"
      description="Each row below needs one decision. Rows you leave alone stay outside the import — they are never guessed at."
    >
      <Panel
        title="Rows to resolve"
        icon={Wrench}
        count={`${decided} of ${VALIDATION_ISSUES.length} decided`}
        action={
          <Button variant="outline" size="sm">
            <Download className="size-4" aria-hidden="true" />
            Download issue report
          </Button>
        }
      >
        <TableScroll>
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Row
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Lead
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Problem
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Category
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  What should happen
                </th>
              </tr>
            </thead>
            <tbody>
              {VALIDATION_ISSUES.map((issue) => {
                const chosen = decisions[issue.row];
                return (
                  <tr
                    key={issue.row}
                    className="border-b border-border/70 align-top last:border-0"
                  >
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {issue.row}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">
                        {issue.name}
                      </span>
                      <span className="mt-0.5 block max-w-[15rem] truncate text-xs text-muted-foreground">
                        {issue.detail}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="block max-w-[14rem]">
                        {issue.problem}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
                          CATEGORY_CLASS[issue.category],
                        )}
                      >
                        {CATEGORY_LABEL[issue.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {issue.actions.map((action) => {
                          const isChosen = chosen === action;
                          return (
                            <button
                              key={action}
                              type="button"
                              aria-pressed={isChosen}
                              onClick={() =>
                                setDecisions((d) => {
                                  if (d[issue.row] === action) {
                                    const next = { ...d };
                                    delete next[issue.row];
                                    return next;
                                  }
                                  return { ...d, [issue.row]: action };
                                })
                              }
                              className={cn(
                                "inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                                isChosen
                                  ? "border-primary/40 bg-primary/12 text-primary"
                                  : "border-border bg-surface text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {isChosen ? (
                                <CircleCheck
                                  className="size-3.5"
                                  aria-hidden="true"
                                />
                              ) : null}
                              {action}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <Note icon={ShieldAlert} tone="warning">
          <strong className="font-semibold">
            Import never merges or overwrites an existing record.
          </strong>{" "}
          A possible duplicate is either skipped or brought in as a separate new
          lead for someone to review later.
        </Note>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" asChild>
            <Link href={"/wireframes/import/validate" as Route}>Back</Link>
          </Button>
          <Button asChild>
            <Link href={"/wireframes/import/confirm" as Route}>
              Continue to confirmation
            </Link>
          </Button>
        </div>
      </div>
    </ImportShell>
  );
}
