"use client";

import {
  ArrowDown,
  BellRing,
  CircleAlert,
  FlaskConical,
  Inbox,
  Info,
  RotateCcw,
  Route as RouteIcon,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { CrmChrome } from "@/components/wireframes/crm-chrome";
import {
  Breadcrumbs,
  Consequences,
  EligibilityChip,
  NothingSaved,
  RoleChip,
  StatusChip,
  TeamLeadBadge,
  WarningChip,
  buttonClass,
} from "@/components/wireframes/teams/team-parts";
import {
  Avatar,
  Note,
  Panel,
  ScreenHeading,
} from "@/components/wireframes/wf-ui";
import {
  ROUTING_TBC,
  eligibilityOf,
  initialsOf,
  previewAssignments,
  roleLabel,
  rotationPool,
  ruleBySlug,
  teamById,
  teamLeadOf,
  userById,
  type EligibilityMap,
} from "@/lib/wireframes/sales-teams";
import { cn } from "@/lib/utils";

/**
 * T4 — Round-robin rule detail and pool preview (spec §163.7–163.9).
 *
 * Shows what the rule WOULD do next, computed from the team's own order and
 * each member's eligibility — never a saved assignment. The demonstration
 * switches change only this preview, so the client can watch the pool
 * shrink to nothing and see Assignment Required take over, then restore a
 * member and see that nobody is compensated.
 *
 * Batch Size stays at the default 1. Nothing here simulates what §163.18
 * leaves open: manual assignment and the rotation, a Batch Size maximum,
 * where a new member joins the order, or a reactivated team's position.
 */

const RULE = ruleBySlug("health-insurance");
const TEAM = teamById(RULE.teamId);
const PREVIEW_LENGTH = 4;

type LastChange = { name: string; to: "Paused" | "Eligible" } | null;

export function LeadAssignmentRuleScreen() {
  const [eligibility, setEligibility] = useState<EligibilityMap>(() =>
    eligibilityOf(TEAM),
  );
  const [lastChange, setLastChange] = useState<LastChange>(null);

  const pool = rotationPool(TEAM, eligibility);
  const preview = previewAssignments(
    TEAM.rotationOrder,
    pool,
    RULE.lastAssignedUserId,
    PREVIEW_LENGTH,
  );
  const lead = teamLeadOf(TEAM);
  const lastAssigned = RULE.lastAssignedUserId
    ? userById(RULE.lastAssignedUserId)
    : null;
  const empty = pool.length === 0;
  const changed = TEAM.rotationOrder.some(
    (id) => eligibility[id] !== eligibilityOf(TEAM)[id],
  );

  const set = (userId: string, to: "Paused" | "Eligible") => {
    setEligibility((prev) => ({ ...prev, [userId]: to }));
    setLastChange({ name: userById(userId).name, to });
  };

  const pauseAll = () => {
    setEligibility((prev) =>
      Object.fromEntries(Object.keys(prev).map((id) => [id, "Paused"])),
    );
    setLastChange({ name: "Every member", to: "Paused" });
  };

  const reset = () => {
    setEligibility(eligibilityOf(TEAM));
    setLastChange(null);
  };

  return (
    <CrmChrome active="settings">
      <div className="flex min-w-0 flex-col gap-5">
        <Breadcrumbs
          items={[
            { label: "Settings", href: "/wireframes/admin/settings" },
            {
              label: "Lead Assignment",
              href: "/wireframes/admin/lead-assignment",
            },
            { label: RULE.name },
          ]}
        />

        <ScreenHeading
          title={RULE.name}
          description="Assigns each new Lead that uses this rule to the next eligible member of one Sales Team."
          actions={
            TEAM.detailHref ? (
              <Link href={TEAM.detailHref} className={buttonClass("outline")}>
                <UsersRound className="size-4" aria-hidden="true" />
                Open {TEAM.name}
              </Link>
            ) : null
          }
        />

        <Panel title="Rule" icon={RouteIcon}>
          <dl className="grid gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-4">
            <Item label="Target Sales Team">
              {TEAM.detailHref ? (
                <Link
                  href={TEAM.detailHref}
                  className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
                >
                  {TEAM.name}
                </Link>
              ) : (
                TEAM.name
              )}
              <span className="block text-xs text-muted-foreground">
                Exactly one team per rule
              </span>
            </Item>
            <Item label="Assignment method">
              <span className="font-semibold">Round Robin</span>
              <span className="block text-xs text-muted-foreground">
                Fixed — the only automatic method
              </span>
            </Item>
            <Item label="Batch Size">
              <span className="font-semibold tabular-nums">
                {RULE.batchSize}
              </span>
              <span className="block text-xs text-muted-foreground">
                Positive whole number · default 1 · one Lead per member at a
                time
              </span>
            </Item>
            <Item label="Status">
              <StatusChip status={RULE.status} />
              <span className="mt-1 block text-xs text-muted-foreground">
                Updated {RULE.updated} by {userById(RULE.updatedByUserId).name}
              </span>
            </Item>
            <div className="sm:col-span-2 xl:col-span-4">
              <dt className="text-xs font-medium text-muted-foreground">
                Which Leads use this rule
              </dt>
              <dd className="mt-1 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                Routing condition to be agreed. {ROUTING_TBC}
              </dd>
            </div>
          </dl>
        </Panel>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Panel
            title={`Rotation pool — ${TEAM.name}`}
            icon={UsersRound}
            count={`${pool.length} eligible`}
            action={
              changed ? (
                <button
                  type="button"
                  onClick={reset}
                  aria-label="Reset demonstration"
                  className={buttonClass("ghost", "px-3")}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Reset
                </button>
              ) : null
            }
          >
            <div className="flex flex-col gap-3 px-4 py-3 sm:px-5">
              <p className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                <FlaskConical
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  <strong className="font-semibold text-foreground">
                    Demonstration controls.
                  </strong>{" "}
                  They change this preview only. Real eligibility is changed by
                  the Team Lead in My Team, or by an audited Owner/Admin
                  override.
                </span>
              </p>

              <ol className="flex flex-col gap-2">
                {TEAM.rotationOrder.map((userId, i) => {
                  const user = userById(userId);
                  const value = eligibility[userId] ?? "Paused";
                  const inPool = pool.includes(userId);
                  const isLead = lead?.userId === userId;
                  return (
                    <li
                      key={userId}
                      className={cn(
                        "surface-solid flex flex-wrap items-center gap-3 rounded-lg p-3",
                        !inPool && "opacity-80",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
                      >
                        {i + 1}
                      </span>
                      <Avatar
                        initials={initialsOf(user.name)}
                        size="sm"
                        tone={inPool ? "primary" : "muted"}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-foreground">
                            {user.name}
                          </span>
                          <RoleChip label={roleLabel(user.role)} />
                          {isLead ? <TeamLeadBadge /> : null}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <EligibilityChip value={value} />
                          <span className="text-xs text-muted-foreground">
                            {inPool ? "In rotation" : "Excluded from rotation"}
                          </span>
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            userId,
                            value === "Eligible" ? "Paused" : "Eligible",
                          )
                        }
                        aria-label={`Demonstration: ${value === "Eligible" ? "pause" : "restore"} ${user.name}`}
                        className={buttonClass("outline", "px-3")}
                      >
                        {value === "Eligible" ? "Pause" : "Restore"}
                      </button>
                    </li>
                  );
                })}
              </ol>

              {pool.length > 0 ? (
                <button
                  type="button"
                  onClick={pauseAll}
                  className={buttonClass("ghost", "self-start px-3")}
                >
                  Pause every eligible member
                </button>
              ) : null}

              <div className="rounded-lg border border-border px-3 py-2.5">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  Current rotation position
                </h3>
                <p className="mt-1 text-sm text-foreground">
                  Last automatic assignment went to{" "}
                  <strong className="font-semibold">
                    {lastAssigned?.name ?? "nobody yet"}
                  </strong>
                  . The next Lead goes to the next eligible member after them in
                  the order above.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Pausing or restoring someone never moves this position.
                </p>
              </div>
            </div>
          </Panel>

          <div className="flex min-w-0 flex-col gap-4">
            {empty ? (
              <AssignmentRequiredPanel
                leadName={lead ? userById(lead.userId).name : null}
              />
            ) : (
              <Panel title="Next assignments — preview" icon={ArrowDown}>
                <div className="flex flex-col gap-3 px-4 py-3 sm:px-5">
                  <ol className="flex flex-col gap-2">
                    {preview.map((userId, i) => {
                      const user = userById(userId);
                      return (
                        <li
                          key={`${userId}-${i}`}
                          className="flex items-center gap-3 rounded-lg bg-muted/70 px-3 py-2.5"
                        >
                          <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
                            {PREVIEW_LABELS[i]}
                          </span>
                          <ArrowDown
                            className="size-3.5 shrink-0 -rotate-90 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-foreground">
                              {user.name}
                            </span>
                            {lead?.userId === userId ? <TeamLeadBadge /> : null}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  <Consequences
                    icon={ShieldCheck}
                    items={[
                      `The rotation stays inside ${TEAM.name}. No other team, and no workspace-wide pool, is ever used.`,
                      lead && pool.includes(lead.userId)
                        ? "The Team Lead takes a turn like every other eligible member."
                        : "The Team Lead is paused, so is skipped like any other paused member.",
                      "Paused members are skipped until they are made eligible again.",
                    ]}
                  />
                  <p className="text-xs text-muted-foreground">
                    Preview only — no Lead is assigned.
                  </p>
                </div>
              </Panel>
            )}

            {lastChange ? <ChangeExplanation change={lastChange} /> : null}

            <Note icon={Info} tone="neutral">
              Not shown in this preview, because they are still to be confirmed:
              whether manual assignment moves the rotation, where a newly added
              member joins the order, and any maximum Batch Size.
            </Note>
          </div>
        </div>
      </div>
    </CrmChrome>
  );
}

const PREVIEW_LABELS = ["Next Lead", "Following Lead", "Then", "Then"] as const;

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function AssignmentRequiredPanel({ leadName }: { leadName: string | null }) {
  return (
    <section
      role="alert"
      className="min-w-0 overflow-hidden rounded-xl border border-danger/30 bg-danger-subtle"
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-danger/20 px-4 py-3 sm:px-5">
        <CircleAlert
          className="size-4 shrink-0 text-danger-on-subtle"
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold text-danger-on-subtle">
          No eligible members
        </h2>
        <WarningChip>Assignment warning</WarningChip>
      </header>
      <div className="flex flex-col gap-3 px-4 py-3 sm:px-5">
        <p className="text-[13px] leading-relaxed text-danger-on-subtle">
          This rule cannot choose anyone in {TEAM.name}. New Leads that use it
          are not rejected and not sent elsewhere.
        </p>

        <div className="surface-solid rounded-lg p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Inbox className="size-3.5" aria-hidden="true" />
            What a new Lead looks like now
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Record Owner</dt>
            <dd className="font-medium text-foreground">Unassigned</dd>
            <dt className="text-muted-foreground">State</dt>
            <dd>
              <WarningChip>Assignment Required</WarningChip>
            </dd>
            <dt className="text-muted-foreground">Rule and team</dt>
            <dd className="text-foreground">
              {RULE.name} · {TEAM.name}
            </dd>
            <dt className="text-muted-foreground">Reason recorded</dt>
            <dd className="text-foreground">
              No eligible member in the target team
            </dd>
          </dl>
        </div>

        <Consequences
          icon={CircleAlert}
          items={[
            "The Lead is kept, with no Record Owner, in Assignment Required.",
            <>
              <BellRing
                className="me-1 inline size-3.5 align-[-2px]"
                aria-hidden="true"
              />
              {leadName ? `${leadName} (Team Lead)` : "The Team Lead"} and the
              Owner/Admin receive an in-app alert.
            </>,
            "An authorized user can assign it manually.",
            "No fallback: it is never given to another team or to the workspace at large.",
          ]}
        />
      </div>
    </section>
  );
}

function ChangeExplanation({ change }: { change: NonNullable<LastChange> }) {
  return (
    <section
      aria-live="polite"
      className="surface-elevated min-w-0 rounded-xl px-4 py-3 sm:px-5"
    >
      {change.to === "Eligible" ? (
        <>
          <h2 className="text-sm font-semibold text-foreground">
            {change.name} is eligible again
          </h2>
          <div className="mt-2">
            <Consequences
              items={[
                "Eligible immediately, from the next assignment.",
                "No backlog of Leads they would otherwise have received.",
                "No compensation or priority — they are reached when the rotation next comes to their place.",
                "With a Batch Size above 1, an unfinished former batch would not be resumed.",
              ]}
            />
          </div>
        </>
      ) : (
        <>
          <h2 className="text-sm font-semibold text-foreground">
            {change.name === "Every member"
              ? "Every member is paused"
              : `${change.name} is paused`}
          </h2>
          <div className="mt-2">
            <Consequences
              items={[
                "Excluded from the next automatic Lead onwards.",
                "Existing Leads, Customers, Follow-ups, Renewals and WhatsApp conversations stay as they are.",
                "The stored rotation position does not move.",
              ]}
            />
          </div>
        </>
      )}
      <NothingSaved className="mt-3" />
    </section>
  );
}
