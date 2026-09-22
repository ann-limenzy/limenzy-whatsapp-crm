"use client";

import {
  CircleAlert,
  Download,
  FileSpreadsheet,
  Info,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { useState } from "react";

import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ImportShell } from "@/components/wireframes/import/import-shell";
import { Note, Panel } from "@/components/wireframes/wf-ui";
import { IMPORT_FILE } from "@/lib/wireframes/mock-data";

/**
 * A1 — Upload file.
 *
 * The screen's job is to be unambiguous about one thing: reading a file is
 * not importing it. The empty and chosen states both say so, and the only
 * forward action is called "Continue to column mapping" rather than
 * "Import".
 */
export function UploadScreen() {
  const [chosen, setChosen] = useState(true);

  return (
    <ImportShell
      current={0}
      title="Import Leads"
      description="Bring an existing spreadsheet of leads into the A&S Fincare workspace. You will be able to check every row before anything is created."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
        <Panel title="Choose a file" icon={Upload} bodyClassName="p-4 sm:p-5">
          {chosen ? (
            <div className="surface-solid rounded-lg p-4">
              <div className="flex flex-wrap items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-11 shrink-0 place-items-center rounded-lg bg-success-subtle text-success-on-subtle"
                >
                  <FileSpreadsheet className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {IMPORT_FILE.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {IMPORT_FILE.size} · uploaded {IMPORT_FILE.uploadedAt}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove file"
                  onClick={() => setChosen(false)}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Detected label="Rows detected" value={IMPORT_FILE.rows} />
                <Detected
                  label="Columns detected"
                  value={IMPORT_FILE.columns}
                />
                <Detected label="Records created" value="0" emphasis />
              </dl>
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed border-border-strong/50 px-6 py-12 text-center">
              <span
                aria-hidden="true"
                className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-accent-foreground"
              >
                <Upload className="size-5" />
              </span>
              <p className="mt-4 text-sm font-medium text-foreground">
                Drop a file here, or choose one
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                CSV and XLSX accepted · up to 5,000 rows per file
              </p>
              <Button className="mt-4" onClick={() => setChosen(true)}>
                Choose file
              </Button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {chosen ? (
              <Button variant="outline" onClick={() => setChosen(false)}>
                <RefreshCw className="size-4" aria-hidden="true" />
                Replace file
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setChosen(true)}>
                <Upload className="size-4" aria-hidden="true" />
                Choose file
              </Button>
            )}
            <Button variant="outline">
              <Download className="size-4" aria-hidden="true" />
              Download sample file
            </Button>
            <Button variant="ghost">Cancel</Button>
            {/* Enabled only once a file is chosen; the destination step
                exists, so this is a real route change. */}
            {chosen ? (
              <Button asChild className="ms-auto">
                <Link href={"/wireframes/import/map" as Route}>
                  Continue to column mapping
                </Link>
              </Button>
            ) : (
              <Button className="ms-auto" disabled>
                Continue to column mapping
              </Button>
            )}
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Note icon={Info}>
            <strong className="font-semibold">
              Nothing has been created yet.
            </strong>{" "}
            The file has been read for its structure only. Leads appear in the
            CRM after you confirm the import in step 6.
          </Note>

          <Panel title="What we accept" bodyClassName="p-4 sm:p-5">
            <ul className="flex flex-col gap-2.5 text-sm text-muted-foreground">
              <Requirement>CSV (.csv) or Excel (.xlsx)</Requirement>
              <Requirement>First row contains column headings</Requirement>
              <Requirement>
                Each lead needs a name and at least one of phone or email
              </Requirement>
              <Requirement>One sheet per file</Requirement>
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Not sure how to lay the file out? Download the sample file — it
              has the headings the CRM recognises automatically.
            </p>
          </Panel>

          <Note icon={CircleAlert} tone="warning">
            If a file cannot be read you will see{" "}
            <em className="font-medium not-italic">
              “Unable to read this file. Upload a valid CSV or Excel file.”
            </em>{" "}
            rather than a partial import.
          </Note>
        </div>
      </div>
    </ImportShell>
  );
}

function Detected({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string | number;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={
          emphasis
            ? "mt-0.5 text-lg font-semibold text-warning-on-subtle"
            : "mt-0.5 text-lg font-semibold text-foreground"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function Requirement({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border-strong"
      />
      <span className="min-w-0">{children}</span>
    </li>
  );
}
