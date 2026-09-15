import {
  CircleCheck,
  Download,
  History,
  SkipForward,
  Upload,
  XCircle,
} from "lucide-react";

import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ImportShell } from "@/components/wireframes/import/import-shell";
import { Panel, TableScroll } from "@/components/wireframes/wf-ui";
import {
  IMPORT_HISTORY,
  IMPORT_RESULT,
  WORKSPACE,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * A6 — Import result and history.
 *
 * Closes the loop: what was created, what was not, and where to go next.
 * The history panel matters more than it looks — it is how an administrator
 * answers "who loaded these 200 leads last month?" six weeks later.
 */

const STATUS_CLASS = {
  Completed: "border-success/30 bg-success-subtle text-success-on-subtle",
  "Completed with errors":
    "border-warning/30 bg-warning-subtle text-warning-on-subtle",
  Cancelled: "border-border-strong/40 bg-neutral-subtle text-neutral-on-subtle",
} as const;

export function ResultScreen() {
  return (
    <ImportShell
      current={5}
      title="Import complete"
      description={`Finished at ${IMPORT_RESULT.finishedAt}. The leads are in the ${WORKSPACE.name} workspace and ready to work.`}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <ResultCard
          icon={CircleCheck}
          value={IMPORT_RESULT.imported}
          label="Leads imported"
          caption="Created and assigned"
          tone="success"
        />
        <ResultCard
          icon={SkipForward}
          value={IMPORT_RESULT.skippedDuplicates}
          label="Duplicates skipped"
          caption="Existing records untouched"
          tone="info"
        />
        <ResultCard
          icon={XCircle}
          value={IMPORT_RESULT.excluded}
          label="Rows excluded"
          caption="Listed in the error report"
          tone="danger"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {/* "View imported leads" has no Leads wireframe behind it, so it stays
            inert. Starting another import does have a destination. */}
        <Button>View imported leads</Button>
        <Button variant="outline">
          <Download className="size-4" aria-hidden="true" />
          Download error report
        </Button>
        <Button variant="outline" asChild>
          <Link href={"/wireframes/import/upload" as Route}>
            <Upload className="size-4" aria-hidden="true" />
            Import another file
          </Link>
        </Button>
        <Button variant="ghost" className="sm:ms-auto" asChild>
          <Link href={"/wireframes/admin/settings" as Route}>Done</Link>
        </Button>
      </div>

      <Panel
        title="Import history"
        icon={History}
        count={IMPORT_HISTORY.length}
      >
        <TableScroll>
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  File
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Record type
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Imported by
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Date
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {IMPORT_HISTORY.map((row, i) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border/70 last:border-0",
                    i === 0 && "bg-accent/40",
                  )}
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {row.filename}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.recordType}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.user}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {row.date}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
                        STATUS_CLASS[row.status],
                      )}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.result}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>
    </ImportShell>
  );
}

function ResultCard({
  icon: Icon,
  value,
  label,
  caption,
  tone,
}: {
  icon: typeof CircleCheck;
  value: number;
  label: string;
  caption: string;
  tone: "success" | "info" | "danger";
}) {
  const toneClass = {
    success: "bg-success-subtle text-success-on-subtle",
    info: "bg-info-subtle text-info-on-subtle",
    danger: "bg-danger-subtle text-danger-on-subtle",
  }[tone];

  return (
    <div className="surface-elevated rounded-xl p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-lg",
            toneClass,
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-2xl leading-none font-semibold tracking-tight text-foreground">
            {value}
          </p>
          <p className="mt-1 truncate text-sm font-medium text-foreground">
            {label}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {caption}
          </p>
        </div>
      </div>
    </div>
  );
}
