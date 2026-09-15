"use client";

import {
  CircleCheck,
  Info,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ImportShell } from "@/components/wireframes/import/import-shell";
import { Note, Panel, TableScroll } from "@/components/wireframes/wf-ui";
import {
  COLUMN_MAPPINGS,
  CRM_FIELDS,
  IMPORT_FILE,
  TEAM,
  type MappingStatus,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * A2 — Map columns.
 *
 * Two ideas the client needs to take away: the CRM does the obvious matching
 * itself, and everything it cannot match becomes an explicit decision. It
 * never invents a user, a pipeline stage, a product or a custom field from a
 * spreadsheet value.
 */

const STATUS_META: Record<
  MappingStatus,
  { label: string; className: string; tone: "ok" | "warn" | "muted" }
> = {
  suggested: {
    label: "Suggested",
    className: "border-info/30 bg-info-subtle text-info-on-subtle",
    tone: "ok",
  },
  confirmed: {
    label: "Confirmed",
    className: "border-success/30 bg-success-subtle text-success-on-subtle",
    tone: "ok",
  },
  "required-missing": {
    label: "Not mapped",
    className: "border-warning/30 bg-warning-subtle text-warning-on-subtle",
    tone: "warn",
  },
  "needs-review": {
    label: "Needs a decision",
    className: "border-warning/30 bg-warning-subtle text-warning-on-subtle",
    tone: "warn",
  },
  custom: {
    label: "Custom field",
    className: "border-primary/30 bg-primary/12 text-primary",
    tone: "ok",
  },
  ignored: {
    label: "Not imported",
    className:
      "border-border-strong/40 bg-neutral-subtle text-neutral-on-subtle",
    tone: "muted",
  },
};

export function MappingScreen() {
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(COLUMN_MAPPINGS.map((m) => [m.id, m.crmField])),
  );
  const [resolvedOwner, setResolvedOwner] = useState<string>("");
  const [resolvedStage, setResolvedStage] = useState<string>("");

  const rows = useMemo(
    () =>
      COLUMN_MAPPINGS.map((m) => {
        const value = fields[m.id] ?? m.crmField;
        let status: MappingStatus = m.status;
        if (value === "Do not import") status = "ignored";
        else if (value === "Select CRM field") status = "required-missing";
        else if (value !== m.crmField) status = "confirmed";
        if (m.id === "c4" && resolvedOwner) status = "confirmed";
        if (m.id === "c5" && resolvedStage) status = "confirmed";
        return { ...m, value, status };
      }),
    [fields, resolvedOwner, resolvedStage],
  );

  // Lead Name plus one contact method — spec §123.
  const hasName = rows.some((r) => r.value === "Lead Name");
  const hasContact = rows.some(
    (r) => r.value === "Phone Number" || r.value === "Email",
  );
  const unresolved = rows.filter((r) => r.status === "needs-review").length;
  const canContinue = hasName && hasContact;

  return (
    <ImportShell
      current={1}
      title="Map columns to CRM fields"
      description={`${IMPORT_FILE.name} · ${IMPORT_FILE.columns} columns found. Matching columns have been suggested for you — change any of them before continuing.`}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] xl:items-start">
        <Panel
          title="Column mapping"
          icon={Wand2}
          count={`${rows.filter((r) => r.status !== "ignored").length} mapped`}
          action={
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="size-3.5" aria-hidden="true" />8 matched
              automatically
            </span>
          }
        >
          <TableScroll>
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Uploaded column
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Sample value
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    CRM field
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const meta = STATUS_META[row.status];
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-border/70 align-top last:border-0"
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">
                          {row.uploadedColumn}
                        </span>
                        {row.required ? (
                          <span className="ms-1.5 text-xs font-medium text-danger-on-subtle">
                            required
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="block max-w-[16rem] truncate">
                          {row.sampleValue}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          aria-label={`CRM field for ${row.uploadedColumn}`}
                          value={row.value}
                          onChange={(e) =>
                            setFields((f) => ({
                              ...f,
                              [row.id]: e.target.value,
                            }))
                          }
                          className="h-9 w-full min-w-[13rem] rounded-md border border-input bg-surface px-2.5 text-sm text-foreground"
                        >
                          {row.value === "Select CRM field" ? (
                            <option>Select CRM field</option>
                          ) : null}
                          {CRM_FIELDS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>

                        {row.status === "needs-review" && row.note ? (
                          <p className="mt-2 max-w-[30rem] text-xs leading-relaxed text-warning-on-subtle">
                            {row.note}
                          </p>
                        ) : null}

                        {row.id === "c4" && !resolvedOwner ? (
                          <ResolveInline
                            label="Map “Joseph K” to"
                            options={TEAM.map((t) => t.name)}
                            extra="Leave those rows unassigned"
                            onChoose={setResolvedOwner}
                          />
                        ) : null}
                        {row.id === "c4" && resolvedOwner ? (
                          <Resolved value={resolvedOwner} />
                        ) : null}

                        {row.id === "c5" && !resolvedStage ? (
                          <ResolveInline
                            label="Map “Follow Up” to"
                            options={[
                              "New",
                              "Contacted",
                              "Interested",
                              "Quote Sent",
                            ]}
                            extra="Use the first active stage"
                            onChoose={setResolvedStage}
                          />
                        ) : null}
                        {row.id === "c5" && resolvedStage ? (
                          <Resolved value={resolvedStage} />
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
                            meta.className,
                          )}
                        >
                          {meta.tone === "warn" ? (
                            <TriangleAlert
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <CircleCheck
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          )}
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Before you continue" bodyClassName="p-4 sm:p-5">
            <ul className="flex flex-col gap-3 text-sm">
              <Check ok={hasName} label="Lead Name is mapped" />
              <Check
                ok={hasContact}
                label="At least one of Phone Number or Email is mapped"
              />
              <Check
                ok={unresolved === 0}
                label={
                  unresolved === 0
                    ? "Unmatched values resolved"
                    : `${unresolved} unmatched value${unresolved === 1 ? "" : "s"} still to decide`
                }
                optional
              />
            </ul>

            {!canContinue ? (
              <p className="mt-4 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2.5 text-xs leading-relaxed text-warning-on-subtle">
                Lead Name has not been mapped. Map it to continue.
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="ghost" asChild>
                <Link href={"/wireframes/import/upload" as Route}>Back</Link>
              </Button>
              {canContinue ? (
                <Button asChild className="ms-auto">
                  <Link href={"/wireframes/import/validate" as Route}>
                    Continue to validation
                  </Link>
                </Button>
              ) : (
                <Button className="ms-auto" disabled>
                  Continue to validation
                </Button>
              )}
            </div>
          </Panel>

          <Note icon={Info}>
            Import never creates users, pipeline stages, products or custom
            fields. Unmatched values are mapped to something that already
            exists, or the rows are left out.
          </Note>
        </div>
      </div>
    </ImportShell>
  );
}

function ResolveInline({
  label,
  options,
  extra,
  onChoose,
}: {
  label: string;
  options: readonly string[];
  extra: string;
  onChoose: (value: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        defaultValue=""
        onChange={(e) => e.target.value && onChoose(e.target.value)}
        className="h-8 rounded-md border border-input bg-surface px-2 text-xs text-foreground"
      >
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={extra}>{extra}</option>
      </select>
    </div>
  );
}

function Resolved({ value }: { value: string }) {
  return (
    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-success-on-subtle">
      <CircleCheck className="size-3.5" aria-hidden="true" />
      Mapped to {value}
    </p>
  );
}

function Check({
  ok,
  label,
  optional,
}: {
  ok: boolean;
  label: string;
  optional?: boolean;
}) {
  return (
    <li className="flex items-start gap-2.5">
      {ok ? (
        <CircleCheck
          className="mt-0.5 size-4 shrink-0 text-success-on-subtle"
          aria-hidden="true"
        />
      ) : (
        <TriangleAlert
          className={cn(
            "mt-0.5 size-4 shrink-0",
            optional ? "text-muted-foreground" : "text-warning-on-subtle",
          )}
          aria-hidden="true"
        />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        {label}
        {optional && !ok ? (
          <span className="block text-xs text-muted-foreground">
            You can continue — unresolved rows are flagged at validation.
          </span>
        ) : null}
      </span>
    </li>
  );
}
