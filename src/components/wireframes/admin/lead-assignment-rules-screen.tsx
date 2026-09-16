"use client";

import {
  Info,
  Plus,
  Route as RouteIcon,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { CrmChrome } from "@/components/wireframes/crm-chrome";
import {
  Breadcrumbs,
  ConceptDialog,
  Consequences,
  NothingSaved,
  StatusChip,
  WarningChip,
  buttonClass,
} from "@/components/wireframes/teams/team-parts";
import {
  Note,
  Panel,
  ScreenHeading,
  TableScroll,
} from "@/components/wireframes/wf-ui";
import {
  LEAD_ASSIGNMENT_RULES,
  ROUTING_TBC,
  SALES_TEAMS,
  rotationPool,
  ruleWarning,
  teamById,
  teamWarning,
  userById,
  type LeadAssignmentRule,
} from "@/lib/wireframes/sales-teams";
import { cn } from "@/lib/utils";

/**
 * T3 — Lead Assignment rules (Settings → Lead Assignment, spec §163.7).
 *
 * Every rule sends new Leads to exactly ONE Sales Team, by round robin. That
 * is the whole of the method list: there is no "all salespeople", no
 * workload routing, and nothing here assigns Customers, Follow-ups,
 * Renewals or conversations.
 *
 * How an incoming Lead selects a rule is decision 1 in §163.18, so the
 * screen names that as open rather than implying Product/Service routing.
 */

type Filter = "all" | "active" | "inactive" | "warning";

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "warning", label: "Warning" },
];

export function LeadAssignmentRulesScreen() {
  const [filter, setFilter] = useState<Filter>("all");
  const [inactive, setInactive] = useState<readonly string[]>([]);
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<LeadAssignmentRule | null>(
    null,
  );

  const statusOf = (rule: LeadAssignmentRule) =>
    inactive.includes(rule.id) ? "Inactive" : rule.status;
  const warningOf = (rule: LeadAssignmentRule) =>
    statusOf(rule) === "Active" ? ruleWarning(rule) : null;

  const matches = (rule: LeadAssignmentRule, f: Filter) =>
    f === "all" ||
    (f === "active" && statusOf(rule) === "Active") ||
    (f === "inactive" && statusOf(rule) === "Inactive") ||
    (f === "warning" && warningOf(rule) !== null);

  const visible = LEAD_ASSIGNMENT_RULES.filter((r) => matches(r, filter));

  return (
    <CrmChrome active="settings">
      <div className="flex min-w-0 flex-col gap-5">
        <Breadcrumbs
          items={[
            { label: "Settings", href: "/wireframes/admin/settings" },
            { label: "Lead Assignment" },
          ]}
        />

        <ScreenHeading
          title="Lead Assignment"
          description="Rules that give new Leads a Record Owner automatically. Each rule targets one Sales Team and rotates only among that team's eligible members."
          actions={
            <>
              <Link
                href="/wireframes/admin/teams"
                className={buttonClass("outline")}
              >
                <UsersRound className="size-4" aria-hidden="true" />
                Sales Teams
              </Link>
              <button
                type="button"
                onClick={() => setCreating(true)}
                aria-haspopup="dialog"
                className={buttonClass("primary")}
              >
                <Plus className="size-4" aria-hidden="true" />
                Create rule
              </button>
            </>
          }
        />

        <div
          role="group"
          aria-label="Filter rules"
          className="flex flex-wrap gap-2"
        >
          {FILTERS.map((f) => {
            const count = LEAD_ASSIGNMENT_RULES.filter((r) =>
              matches(r, f.id),
            ).length;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                  filter === f.id
                    ? "border-primary/40 bg-primary/12 text-primary"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs font-semibold",
                    filter === f.id
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          Showing {visible.length} rules
        </p>

        <Panel title="Rules" icon={RouteIcon} count={visible.length}>
          <TableScroll>
            <table className="w-full min-w-[68rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Rule
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Target Sales Team
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Method
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-right font-medium"
                  >
                    Batch Size
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-right font-medium"
                  >
                    Eligible pool
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Assignment warning
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Last updated
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((rule) => {
                  const team = teamById(rule.teamId);
                  const status = statusOf(rule);
                  const warning = warningOf(rule);
                  const pool = rotationPool(team).length;
                  return (
                    <tr
                      key={rule.id}
                      className="border-b border-border/70 align-top last:border-0"
                    >
                      <td className="px-4 py-3">
                        {rule.detailHref ? (
                          <Link
                            href={rule.detailHref}
                            className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
                          >
                            {rule.name}
                          </Link>
                        ) : (
                          <span className="flex min-h-11 items-center font-semibold text-foreground">
                            {rule.name}
                          </span>
                        )}
                        {rule.detailHref ? null : (
                          <span className="block text-[11px] text-muted-foreground/80">
                            Rule page not included in this walkthrough
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex min-h-11 items-center">
                          <StatusChip status={status} />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {team.detailHref ? (
                          <Link
                            href={team.detailHref}
                            className="inline-flex min-h-11 items-center text-foreground underline-offset-4 hover:underline"
                          >
                            {team.name}
                          </Link>
                        ) : (
                          <span className="flex min-h-11 items-center text-foreground">
                            {team.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex min-h-11 items-center text-foreground">
                          {rule.method}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span className="flex min-h-11 items-center justify-end">
                          {rule.batchSize}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        <span
                          className={cn(
                            "flex min-h-11 items-center justify-end",
                            pool === 0 && "font-semibold text-danger-on-subtle",
                          )}
                        >
                          {pool}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {warning ? (
                          <span className="flex min-h-11 flex-col justify-center gap-1">
                            <WarningChip>{warning}</WarningChip>
                            {team.assignmentRequired > 0 ? (
                              <span className="text-xs text-danger-on-subtle">
                                {team.assignmentRequired} Leads in Assignment
                                Required
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="flex min-h-11 items-center text-xs text-muted-foreground">
                            None
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        <span className="flex min-h-11 flex-col justify-center">
                          {rule.updated}
                          <span className="text-xs">
                            {userById(rule.updatedByUserId).name}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {status === "Active" ? (
                          <button
                            type="button"
                            onClick={() => setDeactivating(rule)}
                            aria-haspopup="dialog"
                            aria-label={`Deactivate ${rule.name}`}
                            className={buttonClass("ghost", "px-3")}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <span className="flex min-h-11 items-center text-xs text-muted-foreground">
                            History kept
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {visible.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-8 text-center text-sm text-muted-foreground"
                    >
                      No rules match this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </TableScroll>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-3">
          <Note icon={Info}>
            <strong className="font-semibold">Routing condition.</strong>{" "}
            {ROUTING_TBC}
          </Note>
          <Note icon={ShieldCheck}>
            <strong className="font-semibold">Never outside the team.</strong>{" "}
            If a rule&apos;s team has no eligible member, the Lead is kept in
            Assignment Required — never given to another team or the whole
            workspace.
          </Note>
          <Note icon={RouteIcon} tone="neutral">
            <strong className="font-semibold">Leads only.</strong> Customers,
            Follow-ups, Renewals and WhatsApp conversations keep their own
            assignment and are never part of a rule.
          </Note>
        </div>
      </div>

      <CreateRuleDialog open={creating} onClose={() => setCreating(false)} />

      {deactivating ? (
        <DeactivateRuleDialog
          rule={deactivating}
          onClose={() => setDeactivating(null)}
          onConfirm={() => setInactive((prev) => [...prev, deactivating.id])}
        />
      ) : null}
    </CrmChrome>
  );
}

/* ------------------------------------------------------------- create rule */

function CreateRuleDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ids = useId();
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [batch, setBatch] = useState("1");
  const [attempted, setAttempted] = useState(false);
  const [done, setDone] = useState(false);

  const batchValid = /^\d+$/.test(batch.trim()) && Number(batch) >= 1;
  const errors = {
    name: name.trim() ? null : "Enter a rule name.",
    team: teamId ? null : "Choose the one Sales Team this rule assigns to.",
    batch: batchValid
      ? null
      : "Batch Size must be a whole number of 1 or more.",
  };
  const valid = !errors.name && !errors.team && !errors.batch;
  const team = teamId ? teamById(teamId) : null;
  const teamWarn = team ? teamWarning(team) : null;

  const close = () => {
    onClose();
    setName("");
    setTeamId("");
    setBatch("1");
    setAttempted(false);
    setDone(false);
  };

  if (done && team) {
    return (
      <ConceptDialog
        open={open}
        onClose={close}
        title="Rule created — concept"
        footer={
          <button
            type="button"
            onClick={close}
            className={buttonClass("primary")}
          >
            Back to Lead Assignment
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">
            <strong className="font-semibold">{name.trim()}</strong> would
            assign new Leads by round robin to {team.name}, Batch Size{" "}
            {Number(batch)}.
          </p>
          <Consequences
            items={[
              "Applies to future Leads only. Existing Lead ownership is unchanged.",
              ROUTING_TBC,
            ]}
          />
          <NothingSaved />
        </div>
      </ConceptDialog>
    );
  }

  return (
    <ConceptDialog
      open={open}
      onClose={close}
      title="Create Lead assignment rule"
      description="A rule assigns new Leads to the eligible members of exactly one Sales Team."
      footer={
        <>
          <button
            type="button"
            onClick={close}
            className={buttonClass("outline")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setAttempted(true);
              if (valid) setDone(true);
            }}
            className={buttonClass("primary")}
          >
            Create rule
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          id={`${ids}-name`}
          label="Rule name"
          error={attempted ? errors.name : null}
        >
          <input
            id={`${ids}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={attempted && !!errors.name}
            className="h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground"
          />
        </Field>

        <Field
          id={`${ids}-team`}
          label="Target Sales Team — exactly one"
          error={attempted ? errors.team : null}
          hint={teamWarn ? `Assignment warning: ${teamWarn}.` : undefined}
        >
          <select
            id={`${ids}-team`}
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            aria-invalid={attempted && !!errors.team}
            className="h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground"
          >
            <option value="">Choose a team…</option>
            {SALES_TEAMS.filter((t) => t.status === "Active").map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <p className="mb-1 block text-xs font-medium text-muted-foreground">
            Assignment method
          </p>
          <p className="flex h-11 items-center rounded-lg border border-border bg-muted px-3 text-sm font-medium text-foreground">
            Round Robin
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            The only automatic method. It rotates within the chosen team.
          </p>
        </div>

        <Field
          id={`${ids}-batch`}
          label="Batch Size"
          error={attempted ? errors.batch : null}
          hint="How many consecutive Leads one member receives before the rotation moves on. Default 1."
        >
          <input
            id={`${ids}-batch`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={batch}
            onChange={(e) => setBatch(e.target.value)}
            aria-invalid={attempted && !!errors.batch}
            className="h-11 w-32 rounded-lg border border-input bg-surface px-3 text-sm text-foreground tabular-nums"
          />
        </Field>

        <div>
          <p className="mb-1 block text-xs font-medium text-muted-foreground">
            Which Leads use this rule
          </p>
          <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
            Routing condition to be agreed. {ROUTING_TBC}
          </p>
        </div>
      </div>
    </ConceptDialog>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error: string | null;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs text-danger-on-subtle">{error}</p>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- deactivate rule */

function DeactivateRuleDialog({
  rule,
  onClose,
  onConfirm,
}: {
  rule: LeadAssignmentRule;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [done, setDone] = useState(false);
  const team = teamById(rule.teamId);

  if (done) {
    return (
      <ConceptDialog
        open
        onClose={onClose}
        title="Rule deactivated — concept"
        footer={
          <button
            type="button"
            onClick={onClose}
            className={buttonClass("primary")}
          >
            Back to Lead Assignment
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground">
            {rule.name} is now shown as Inactive.
          </p>
          <NothingSaved />
        </div>
      </ConceptDialog>
    );
  }

  return (
    <ConceptDialog
      open
      onClose={onClose}
      title={`Deactivate ${rule.name}?`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className={buttonClass("outline")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              setDone(true);
            }}
            className={buttonClass("danger")}
          >
            Deactivate rule
          </button>
        </>
      }
    >
      <Consequences
        items={[
          "No new Lead is assigned through this rule from now on.",
          "Existing Leads keep their current Record Owners.",
          `${team.name} and its members are unchanged.`,
          "The rule's audit history is preserved.",
        ]}
      />
    </ConceptDialog>
  );
}
