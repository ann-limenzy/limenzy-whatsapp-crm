"use client";

import { Bell, CircleCheck, Info, Loader, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ImportShell } from "@/components/wireframes/import/import-shell";
import { Note, Panel } from "@/components/wireframes/wf-ui";
import {
  IMPORT_RESULT,
  VALIDATION_TOTALS,
  WORKSPACE,
} from "@/lib/wireframes/mock-data";

/**
 * A5 — Confirm and process.
 *
 * Import is a major data action, so it takes an explicit confirmation that
 * states exactly what will and will not happen. Once started, the admin is
 * released — processing continues without the page staying open.
 *
 * The progress here is a timer over mock data. No file is parsed and no
 * record is written.
 */
export function ConfirmScreen() {
  const [phase, setPhase] = useState<"confirm" | "processing" | "done">(
    "confirm",
  );
  const [processed, setProcessed] = useState(0);

  useEffect(() => {
    if (phase !== "processing") return;
    const timer = setInterval(() => {
      setProcessed((n) => {
        const next = n + 30;
        if (next >= IMPORT_RESULT.imported) {
          clearInterval(timer);
          setPhase("done");
          return IMPORT_RESULT.imported;
        }
        return next;
      });
    }, 220);
    return () => clearInterval(timer);
  }, [phase]);

  const percent = Math.round((processed / IMPORT_RESULT.imported) * 100);

  return (
    <ImportShell
      current={5}
      title="Confirm and process"
      description="The last checkpoint before records are created. Everything below is reversible up to the moment you start."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        {phase === "confirm" ? (
          <ConfirmCard onStart={() => setPhase("processing")} />
        ) : (
          <ProcessingCard
            processed={processed}
            percent={percent}
            done={phase === "done"}
            onReset={() => {
              setProcessed(0);
              setPhase("confirm");
            }}
          />
        )}

        <div className="flex flex-col gap-4">
          <Panel title="What happens next" bodyClassName="p-4 sm:p-5">
            <ol className="flex flex-col gap-3.5 text-sm">
              <NextStep n={1} title="Records are created">
                {IMPORT_RESULT.imported} new leads appear in the{" "}
                {WORKSPACE.name} workspace, owned by the users you mapped.
              </NextStep>
              <NextStep n={2} title="You carry on working">
                Processing runs in the background. You can close this screen.
              </NextStep>
              <NextStep n={3} title="You get a notification">
                A notification appears when the import finishes, with the result
                and any error report.
              </NextStep>
            </ol>
          </Panel>

          <Note icon={Info}>
            Rows outside the import are not deleted or altered — they stay in
            your spreadsheet, and the issue report tells you why each one was
            left out.
          </Note>
        </div>
      </div>
    </ImportShell>
  );
}

function ConfirmCard({ onStart }: { onStart: () => void }) {
  return (
    // Presented as the confirmation dialog it will be, shown inline so the
    // client can read it during the walkthrough.
    <section
      role="group"
      aria-label="Import confirmation"
      className="surface-solid rounded-xl p-5 shadow-lg sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning-subtle text-warning-on-subtle"
        >
          <TriangleAlert className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            Import {VALIDATION_TOTALS.ready} leads?
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This creates new records in the {WORKSPACE.name} workspace.
          </p>
        </div>
      </div>

      <ul className="mt-5 flex flex-col gap-3 text-sm">
        <Outcome tone="create">
          <strong className="font-semibold text-foreground">
            {VALIDATION_TOTALS.ready} new lead records
          </strong>{" "}
          will be created in the {WORKSPACE.name} workspace.
        </Outcome>
        <Outcome tone="skip">
          <strong className="font-semibold text-foreground">
            {VALIDATION_TOTALS.duplicates} possible duplicates
          </strong>{" "}
          will be skipped. Existing records are not changed.
        </Outcome>
        <Outcome tone="skip">
          <strong className="font-semibold text-foreground">
            {VALIDATION_TOTALS.attention + VALIDATION_TOTALS.cannotImport}{" "}
            invalid rows
          </strong>{" "}
          will remain outside the import and appear in the error report.
        </Outcome>
      </ul>

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href={"/wireframes/import/resolve" as Route}>Back</Link>
        </Button>
        <Button onClick={onStart}>Start import</Button>
      </div>
    </section>
  );
}

function ProcessingCard({
  processed,
  percent,
  done,
  onReset,
}: {
  processed: number;
  percent: number;
  done: boolean;
  onReset: () => void;
}) {
  return (
    <section className="surface-solid rounded-xl p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={
            done
              ? "grid size-10 shrink-0 place-items-center rounded-lg bg-success-subtle text-success-on-subtle"
              : "grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"
          }
        >
          {done ? (
            <CircleCheck className="size-5" />
          ) : (
            <Loader className="size-5 animate-spin motion-reduce:animate-none" />
          )}
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            {done ? "Import complete" : "Import in progress"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {done
              ? `${processed} leads were created in the ${WORKSPACE.name} workspace.`
              : `Processing ${processed} of ${IMPORT_RESULT.imported} records…`}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Import progress"
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">
          {percent}% complete
        </p>
      </div>

      {!done ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-info/30 bg-info-subtle px-3 py-2.5 text-xs leading-relaxed text-info-on-subtle">
          <Bell className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            You can keep using the CRM while this runs. A notification will
            appear when processing finishes.
          </span>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onReset}>
          Replay this step
        </Button>
        {/* Navigation is explicit rather than automatic: a demo that jumps
            screens on a timer takes control away from whoever is presenting. */}
        {done ? (
          <Button asChild>
            <Link href={"/wireframes/import/result" as Route}>
              View the import result
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function Outcome({
  tone,
  children,
}: {
  tone: "create" | "skip";
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2.5 text-muted-foreground">
      <span
        aria-hidden="true"
        className={
          tone === "create"
            ? "mt-1.5 size-2 shrink-0 rounded-full bg-success"
            : "mt-1.5 size-2 shrink-0 rounded-full bg-border-strong"
        }
      />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function NextStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
      >
        {n}
      </span>
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {children}
        </span>
      </span>
    </li>
  );
}
