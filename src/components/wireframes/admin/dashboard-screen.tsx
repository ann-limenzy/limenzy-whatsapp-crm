import {
  AlarmClock,
  BellRing,
  CalendarCheck,
  ChartColumn,
  Clock,
  MessageCircle,
  Phone,
  UserPlus,
  Users,
} from "lucide-react";

import { CrmChrome } from "@/components/wireframes/crm-chrome";
import {
  Avatar,
  Metric,
  Panel,
  ScreenHeading,
  TableScroll,
} from "@/components/wireframes/wf-ui";
import {
  CURRENT_USER,
  PIPELINE,
  PIPELINE_TOTALS,
  RECENT_ACTIVITY,
  TEAM_WORKLOAD,
  WORKLOAD_TOTALS,
  TODAY_FOLLOW_UPS,
  UPCOMING_RENEWALS,
  WORKSPACE,
  type Activity,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * D — Admin dashboard.
 *
 * Answers "how is the team's work progressing?" and nothing else. Every
 * number here is an operational count the specification defines — there is
 * deliberately no revenue, margin or conversion-rate analytics, because the
 * CRM does not hold the data to calculate them honestly.
 *
 * Team workload is the section a manager actually acts on: it is the only
 * place that shows work piling up on one person. It lists every active user
 * who can hold work — zeros included — and the Follow-ups Today, Renewals Due
 * Soon and Overdue cards are summed from those same rows, so the two can
 * never disagree.
 */

const STATUS_CLASS = {
  Due: "border-info/30 bg-info-subtle text-info-on-subtle",
  Scheduled: "border-border-strong/40 bg-neutral-subtle text-neutral-on-subtle",
  Overdue: "border-danger/30 bg-danger-subtle text-danger-on-subtle",
} as const;

const RENEWAL_CLASS = {
  "Due Soon": "border-warning/30 bg-warning-subtle text-warning-on-subtle",
  Upcoming: "border-info/30 bg-info-subtle text-info-on-subtle",
} as const;

export function AdminDashboardScreen() {
  const maxPipeline = Math.max(...PIPELINE.map((p) => p.count));

  return (
    <CrmChrome active="dashboard">
      <div className="flex flex-col gap-5">
        <ScreenHeading
          title={`Good morning, ${CURRENT_USER.firstName}`}
          description={`Here is how ${WORKSPACE.name} is progressing today.`}
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="New Leads"
            value={18}
            caption="this week"
            icon={UserPlus}
          />
          <Metric
            label="Follow-ups Today"
            value={WORKLOAD_TOTALS.followUpsToday}
            caption={`across ${WORKLOAD_TOTALS.usersWithFollowUpsToday} users`}
            icon={CalendarCheck}
            tone="info"
          />
          <Metric
            label="Renewals Due Soon"
            value={WORKLOAD_TOTALS.renewals}
            caption="next 30 days"
            icon={BellRing}
            tone="warning"
          />
          <Metric
            label="Overdue Actions"
            value={WORKLOAD_TOTALS.overdue}
            caption="needs attention"
            icon={AlarmClock}
            tone="danger"
          />
        </div>

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel
              title="Today's follow-ups"
              icon={CalendarCheck}
              count={TODAY_FOLLOW_UPS.length}
              action={
                <span className="text-xs font-medium text-primary">
                  View all
                </span>
              }
            >
              <TableScroll>
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Time
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Person
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Related to
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Type
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Assigned to
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Status
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {TODAY_FOLLOW_UPS.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border/70 last:border-0"
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                          {row.time}
                        </td>
                        {/* A name and a product read as one unit. Wrapping
                            them doubled the row height for no gain; the table
                            scrolls inside its own panel, so holding them on one
                            line cannot widen the page. */}
                        <td className="px-4 py-2.5 font-medium whitespace-nowrap text-foreground">
                          {row.person}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          {row.product}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {row.type}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          {row.assignedTo}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                              STATUS_CLASS[row.status],
                            )}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            aria-hidden="true"
                            className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground"
                          >
                            <Phone className="size-4" />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </Panel>

            <Panel title="Lead pipeline" icon={ChartColumn} count={41}>
              <div className="p-4 sm:p-5">
                <div className="flex items-end justify-between gap-3 sm:gap-6">
                  {PIPELINE.map((stage) => (
                    <div
                      key={stage.stage}
                      className="flex min-w-0 flex-1 flex-col items-center"
                    >
                      <span className="text-sm font-semibold text-foreground">
                        {stage.count}
                      </span>
                      <div
                        className="mt-1.5 w-full rounded-t-md bg-primary/80"
                        style={{
                          height: `${Math.max(12, (stage.count / maxPipeline) * 120)}px`,
                        }}
                        aria-hidden="true"
                      />
                      <span className="mt-2 w-full truncate text-center text-xs font-medium text-foreground">
                        {stage.stage}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {stage.share}%
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  {PIPELINE_TOTALS.total} leads across stages ·{" "}
                  {PIPELINE_TOTALS.active} active · {PIPELINE_TOTALS.won} won
                </p>
              </div>
            </Panel>

            <Panel
              title="Team workload"
              icon={Users}
              count={TEAM_WORKLOAD.length}
            >
              <TableScroll>
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Salesperson
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Assigned Leads
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Today
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Overdue
                      </th>
                      <th scope="col" className="px-4 py-2.5 font-medium">
                        Renewals due soon
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {TEAM_WORKLOAD.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-border/70 last:border-0"
                      >
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <Avatar initials={row.initials} size="sm" />
                            <span className="truncate font-medium text-foreground">
                              {row.user}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                          {row.assignedLeads}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                          {row.followUpsToday}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums">
                          <span
                            className={
                              row.overdue > 0
                                ? "font-semibold text-danger-on-subtle"
                                : "text-muted-foreground"
                            }
                          >
                            {row.overdue}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                          {row.renewals}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
              <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
                Every active user who can hold work, including those with none
                today. Invited and deactivated users are not listed.
              </p>
            </Panel>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Panel
              title="Upcoming renewals"
              icon={BellRing}
              count={UPCOMING_RENEWALS.length}
            >
              <ul className="divide-y divide-border/70">
                {UPCOMING_RENEWALS.map((r) => (
                  <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {r.customer}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {r.service} · {r.dueDate}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
                          RENEWAL_CLASS[r.status],
                        )}
                      >
                        {r.status}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {r.daysLeft} days
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Recent activity" icon={Clock}>
              <ul className="divide-y divide-border/70">
                {RECENT_ACTIVITY.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start gap-3 px-4 py-3"
                  >
                    <ActivityIcon kind={entry.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {entry.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {entry.detail}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">
                      {entry.time}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </CrmChrome>
  );
}

function ActivityIcon({ kind }: { kind: Activity["kind"] }) {
  const map = {
    call: { icon: Phone, className: "bg-primary/12 text-primary" },
    whatsapp: {
      icon: MessageCircle,
      className: "bg-channel-whatsapp-subtle text-channel-whatsapp-on-subtle",
    },
    note: { icon: Clock, className: "bg-muted text-muted-foreground" },
    stage: {
      icon: BellRing,
      className: "bg-success-subtle text-success-on-subtle",
    },
    created: {
      icon: UserPlus,
      className: "bg-info-subtle text-info-on-subtle",
    },
    followup: {
      icon: CalendarCheck,
      className: "bg-success-subtle text-success-on-subtle",
    },
  }[kind];
  const Icon = map.icon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full",
        map.className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}
