"use client";

import {
  ArrowLeft,
  BellRing,
  CircleAlert,
  CircleCheck,
  EyeOff,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import {
  Confirmed,
  SheetHeader,
} from "@/components/wireframes/mobile-sheet-parts";
import {
  PhoneFrame,
  PhoneScreen,
  PhoneSheet,
} from "@/components/wireframes/phone-frame";
import {
  EligibilityChip,
  TeamLeadBadge,
} from "@/components/wireframes/teams/team-parts";
import { WireframeBrand } from "@/components/wireframes/wireframe-brand";
import { Avatar } from "@/components/wireframes/wf-ui";
import { SALES_PERSONA } from "@/lib/wireframes/mock-data";
import {
  ELIGIBILITY_LABEL,
  USER,
  activeMemberships,
  activeTeamOf,
  eligibilityOf,
  initialsOf,
  rotationPool,
  teamLeadOf,
  userById,
  type Eligibility,
  type EligibilityMap,
} from "@/lib/wireframes/sales-teams";
import { cn } from "@/lib/utils";

/**
 * T5 — My Team, on a phone (spec §163.6, §163.16).
 *
 * Sneha Thomas is a Sales Executive, and ALSO Team Lead of the Health
 * Insurance Team — a responsibility, shown as a badge beside the role, never
 * as a replacement for it.
 *
 * The screen is deliberately small. It shows the minimum roster §163.6
 * allows — name, membership status, eligibility, and who the Team Lead is —
 * and the controls that come with the responsibility: pause or restore a
 * member of their OWN team, themselves included. Everything administrative (adding,
 * transferring, replacing the Team Lead, rules, other teams) stays with the
 * Owner/Admin in Settings, and nothing here reveals another member's
 * records, workload or assignment history.
 */

// Sneha's team is looked up from the data, never assumed.
const TEAM = activeTeamOf(USER.sneha)!;

type SheetState =
  | { kind: "confirm"; userId: string; to: Eligibility }
  | { kind: "done"; userId: string; to: Eligibility };

export function MyTeamMobileScreen() {
  const [eligibility, setEligibility] = useState<EligibilityMap>(() =>
    eligibilityOf(TEAM),
  );
  const [sheet, setSheet] = useState<SheetState | null>(null);

  const members = activeMemberships(TEAM);
  const pool = rotationPool(TEAM, eligibility);
  const lead = teamLeadOf(TEAM);
  const eligibleCount = members.filter(
    (m) => eligibility[m.userId] === "Eligible",
  ).length;
  const counts = {
    eligible: eligibleCount,
    paused: members.length - eligibleCount,
  };

  const closeSheet = () => setSheet(null);

  return (
    <div className="app-ambient min-h-dvh">
      <div className="mx-auto w-full max-w-[1100px] px-0 py-0 md:px-6 md:py-8">
        <PhoneFrame caption="390 × 844 · a Team Lead's own-team controls">
          <PhoneScreen
            activeNav="more"
            sheet={
              sheet ? (
                <PhoneSheet
                  label={
                    sheet.kind === "done"
                      ? "Eligibility updated"
                      : "Change Lead-assignment eligibility"
                  }
                  onClose={closeSheet}
                >
                  {sheet.kind === "confirm" ? (
                    <ConfirmSheet
                      userId={sheet.userId}
                      to={sheet.to}
                      leavesNoneEligible={
                        sheet.to === "Paused" &&
                        pool.length === 1 &&
                        pool[0] === sheet.userId
                      }
                      onCancel={closeSheet}
                      onConfirm={() => {
                        setEligibility((prev) => ({
                          ...prev,
                          [sheet.userId]: sheet.to,
                        }));
                        setSheet({ ...sheet, kind: "done" });
                      }}
                    />
                  ) : (
                    <Confirmed
                      title={
                        sheet.userId === USER.sneha
                          ? `You are ${sheet.to === "Paused" ? "paused" : "eligible again"}`
                          : `${userById(sheet.userId).name} is ${sheet.to === "Paused" ? "paused" : "eligible again"}`
                      }
                      detail={
                        sheet.to === "Paused"
                          ? "From the next automatic Lead onwards. Existing work has not moved."
                          : "From the next automatic Lead onwards, with no backlog and no priority."
                      }
                      closeLabel="Back to My Team"
                      onClose={closeSheet}
                    />
                  )}
                </PhoneSheet>
              ) : null
            }
            header={
              <header className="surface-glass rounded-none border-x-0 border-t-0 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href="/wireframes/more/mobile"
                    className="-ms-1 inline-flex min-h-11 items-center gap-1 rounded-lg ps-1 pe-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
                    More
                  </Link>
                  <WireframeBrand variant="compact" />
                </div>

                <h1 className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">
                  My Team
                </h1>

                <div className="mt-2 flex items-center gap-2.5">
                  <Avatar initials={SALES_PERSONA.initials} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-foreground">
                      {SALES_PERSONA.name}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {SALES_PERSONA.role}
                      </span>
                      <TeamLeadBadge className="px-2 text-[10px]" />
                    </span>
                  </span>
                </div>
              </header>
            }
          >
            <div className="flex flex-col gap-3 px-3 py-3">
              <section className="surface-elevated rounded-xl p-3">
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"
                  >
                    <UsersRound className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[13px] font-semibold text-foreground">
                      {TEAM.name}
                    </h2>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      You lead this team. You choose which members receive new
                      automatic Leads.
                    </p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                  <Stat label="Members" value={members.length} />
                  <Stat
                    label="Eligible"
                    value={counts.eligible}
                    tone={counts.eligible === 0 ? "danger" : "default"}
                  />
                  <Stat label="Paused" value={counts.paused} />
                </dl>
              </section>

              {pool.length === 0 ? (
                <section
                  role="alert"
                  className="rounded-xl border border-danger/30 bg-danger-subtle p-3 text-danger-on-subtle"
                >
                  <p className="flex items-center gap-2 text-[13px] font-semibold">
                    <CircleAlert
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                    No eligible members
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed">
                    New Leads for {TEAM.name} will wait, unassigned, in{" "}
                    <strong className="font-semibold">
                      Assignment Required
                    </strong>
                    . They are kept — never sent to another team.
                  </p>
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed">
                    <BellRing
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    You and the Owner/Admin will get an in-app alert for each
                    one. Make someone eligible to start assigning again.
                  </p>
                </section>
              ) : (
                <p className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-[11px] leading-snug text-muted-foreground">
                  <CircleCheck
                    className="size-3.5 shrink-0 text-success-on-subtle"
                    aria-hidden="true"
                  />
                  No Assignment Required alerts for your team.
                </p>
              )}

              <h2 className="px-1 pt-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                Team members
              </h2>

              <ul className="flex flex-col gap-2">
                {members.map((m) => {
                  const user = userById(m.userId);
                  const value = eligibility[m.userId] ?? "Paused";
                  const isMe = m.userId === USER.sneha;
                  const to: Eligibility =
                    value === "Eligible" ? "Paused" : "Eligible";
                  return (
                    <li
                      key={m.userId}
                      className="surface-solid flex flex-col gap-2 rounded-xl p-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <Avatar
                          initials={initialsOf(user.name)}
                          size="sm"
                          tone={value === "Eligible" ? "primary" : "muted"}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                            <span className="text-[13px] font-semibold text-foreground">
                              {user.name}
                            </span>
                            {isMe ? (
                              <span className="text-[11px] text-muted-foreground">
                                (you)
                              </span>
                            ) : null}
                            {lead?.userId === m.userId ? (
                              <TeamLeadBadge className="px-2 text-[10px]" />
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            Active member
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <EligibilityChip value={value} />
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          onClick={() =>
                            setSheet({ kind: "confirm", userId: m.userId, to })
                          }
                          aria-label={
                            isMe
                              ? to === "Paused"
                                ? "Pause yourself from Lead assignment"
                                : "Make yourself eligible for Lead assignment"
                              : `${to === "Paused" ? "Pause" : "Make eligible"}: ${user.name}`
                          }
                          className={cn(
                            "inline-flex min-h-11 min-w-24 items-center justify-center rounded-lg px-3 text-[13px] font-semibold transition-colors",
                            to === "Paused"
                              ? "border border-border bg-surface text-foreground hover:bg-accent"
                              : "bg-primary text-primary-foreground hover:bg-primary/90",
                          )}
                        >
                          {to === "Paused" ? "Pause" : "Make eligible"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-start gap-2 px-1 pt-1 pb-1 text-[11px] leading-relaxed text-muted-foreground">
                <EyeOff
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <p>
                  This list shows only who is in your team and whether they
                  receive new Leads. It does not open their Leads, Customers,
                  Follow-ups, Renewals, conversations or workload. Adding,
                  moving or replacing members is done by your Owner/Admin.
                </p>
              </div>
            </div>
          </PhoneScreen>
        </PhoneFrame>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-lg bg-muted px-1 py-1.5">
      <dt className="text-[10px] leading-tight text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "text-base font-semibold tabular-nums",
          tone === "danger" ? "text-danger-on-subtle" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function ConfirmSheet({
  userId,
  to,
  leavesNoneEligible,
  onCancel,
  onConfirm,
}: {
  userId: string;
  to: Eligibility;
  leavesNoneEligible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isMe = userId === USER.sneha;
  const name = userById(userId).name;
  const pausing = to === "Paused";
  const title = pausing
    ? isMe
      ? "Pause yourself?"
      : `Pause ${name}?`
    : isMe
      ? "Make yourself eligible?"
      : `Make ${name} eligible?`;

  return (
    <>
      <SheetHeader
        title={title}
        subtitle={`Sets ${isMe ? "you" : name} to "${ELIGIBILITY_LABEL[to]}"`}
        onClose={onCancel}
      />
      <div className="flex flex-col gap-2.5 border-t border-border pt-3">
        {leavesNoneEligible ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-[12px] leading-relaxed text-danger-on-subtle"
          >
            <p className="flex items-center gap-1.5 font-semibold">
              <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
              No one will be eligible
            </p>
            <p className="mt-0.5">
              {TEAM.name} will have no eligible members. New Leads will wait in
              Assignment Required until someone is made eligible again.
            </p>
          </div>
        ) : null}

        <ul className="flex flex-col gap-1.5 text-[12px] leading-relaxed text-foreground">
          <Bullet>Only future automatic Leads are affected.</Bullet>
          <Bullet>
            {isMe ? "Your" : `${name}'s`} existing Leads, Customers, Follow-ups,
            Renewals and WhatsApp conversations do not change.
          </Bullet>
          {isMe ? (
            <Bullet>You remain Team Lead and an active member.</Bullet>
          ) : null}
          {pausing ? null : (
            <Bullet>
              Eligible straight away — no backlog of missed Leads and no
              priority.
            </Bullet>
          )}
        </ul>
      </div>
      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 flex-1 rounded-lg border border-border text-sm font-medium text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={cn(
            "min-h-11 flex-1 rounded-lg px-2 text-sm font-semibold",
            leavesNoneEligible
              ? "bg-danger text-danger-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          {leavesNoneEligible
            ? "Pause anyway"
            : pausing
              ? "Pause"
              : "Make eligible"}
        </button>
      </div>
    </>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CircleCheck
        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0">{children}</span>
    </li>
  );
}
