"use client";

import {
  ArrowRight,
  Building2,
  ChevronDown,
  Database,
  GitBranch,
  Mail,
  MessageCircle,
  Package,
  Route as RouteIcon,
  SlidersHorizontal,
  Timer,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { CrmChrome } from "@/components/wireframes/crm-chrome";
import { ScreenHeading } from "@/components/wireframes/wf-ui";
import { SETTINGS_USERS, WORKSPACE } from "@/lib/wireframes/mock-data";
import {
  LEAD_ASSIGNMENT_RULES,
  SALES_TEAMS,
  ruleWarning,
  teamWarning,
} from "@/lib/wireframes/sales-teams";
import { cn } from "@/lib/utils";

/**
 * E1 — Settings hub.
 *
 * Grouped by the job the administrator came to do, not by the shape of the
 * database. Each card expands to show what is inside, so someone who is not
 * sure where a setting lives can find it without opening five screens.
 */

type Card = {
  id: string;
  title: string;
  icon: LucideIcon;
  summary: string;
  detail: string;
  items: readonly string[];
  status?: { label: string; tone: "ok" | "warn" };
  /**
   * Destination wireframe, where one exists. Cards without a screen behind
   * them still expand to show what they contain — they just do not offer a
   * link the client can follow into nothing.
   */
  href?: Route;
};

const INVITED = SETTINGS_USERS.filter((u) => u.status === "Invited").length;
const TEAM_WARNINGS = SALES_TEAMS.filter((t) => teamWarning(t)).length;
const ACTIVE_RULES = LEAD_ASSIGNMENT_RULES.filter((r) => r.status === "Active");
const RULE_WARNINGS = ACTIVE_RULES.filter((r) => ruleWarning(r)).length;

const CARDS: readonly Card[] = [
  {
    id: "users",
    href: "/wireframes/admin/users",
    title: "Users and roles",
    icon: Users,
    summary: `${SETTINGS_USERS.length} users · ${INVITED} ${INVITED === 1 ? "invitation" : "invitations"} pending`,
    detail:
      "Who is on the team and what each person can see. Deactivating someone keeps their history and their name on past records.",
    items: [
      "User list",
      "Invite a user",
      "Roles and permissions",
      "Deactivate a user",
    ],
  },
  {
    id: "sales-teams",
    href: "/wireframes/admin/teams",
    title: "Sales Teams",
    icon: UsersRound,
    summary: `${SALES_TEAMS.length} teams`,
    detail:
      "Groups of salespeople who share automatic Leads. Each team has one Team Lead, and each member is either eligible for new Leads or paused.",
    items: [
      "Teams and Team Leads",
      "Members and transfers",
      "Lead-assignment eligibility",
      "Assignment warnings",
    ],
    status: TEAM_WARNINGS
      ? {
          label: `${TEAM_WARNINGS} ${TEAM_WARNINGS === 1 ? "team needs" : "teams need"} attention`,
          tone: "warn",
        }
      : undefined,
  },
  {
    id: "lead-assignment",
    href: "/wireframes/admin/lead-assignment",
    title: "Lead assignment",
    icon: RouteIcon,
    summary: `${ACTIVE_RULES.length} active rules · round robin`,
    detail:
      "Rules that give new Leads a Record Owner by rotating through one Sales Team's eligible members.",
    items: [
      "Assignment rules",
      "Target team",
      "Batch Size",
      "Rotation pool preview",
    ],
    status: RULE_WARNINGS
      ? {
          label: `${RULE_WARNINGS} ${RULE_WARNINGS === 1 ? "rule has a warning" : "rules have warnings"}`,
          tone: "warn",
        }
      : undefined,
  },
  {
    id: "pipeline",
    href: "/wireframes/admin/pipeline",
    title: "Lead pipeline",
    icon: GitBranch,
    summary: "6 active stages",
    detail:
      "The stages a lead moves through. Rename or reorder them to match how A&S Fincare actually sells.",
    items: ["Active stages", "Add a stage", "Reorder", "Default first stage"],
  },
  {
    id: "products",
    href: "/wireframes/admin/configuration",
    title: "Products and services",
    icon: Package,
    summary: "5 products · 4 renewable",
    detail:
      "What the business sells. Renewable products drive the renewal reminders.",
    items: [
      "Product list",
      "Categories",
      "Renewable products",
      "Add a product",
    ],
  },
  {
    id: "custom-fields",
    title: "Custom fields",
    icon: SlidersHorizontal,
    summary: "4 lead fields · 3 customer fields",
    detail:
      "Extra information the business needs — vehicle number, policy number, anything else.",
    items: [
      "Lead fields",
      "Customer fields",
      "Field types",
      "Dropdown options",
    ],
  },
  {
    id: "reminders",
    href: "/wireframes/admin/configuration",
    title: "Reminder rules",
    icon: Timer,
    summary: "4 rules configured",
    detail:
      "How far ahead of a renewal date the CRM reminds the customer, per product.",
    items: ["Reminder timing", "Channels", "Follow-up defaults", "Quiet hours"],
  },
  {
    id: "whatsapp",
    href: "/wireframes/admin/configuration",
    title: "WhatsApp settings",
    icon: MessageCircle,
    summary: "Not connected",
    detail:
      "Connect the business WhatsApp account and manage the message templates Meta has approved.",
    items: [
      "Connection",
      "Business number",
      "Message templates",
      "Opt-out list",
    ],
    status: { label: "Not connected", tone: "warn" },
  },
  {
    id: "email",
    href: "/wireframes/admin/configuration",
    title: "Email settings",
    icon: Mail,
    summary: "Sender not verified",
    detail:
      "The address business email is sent from, and the templates that use it.",
    items: [
      "Verified sender",
      "Email templates",
      "Reply-to address",
      "Opt-out list",
    ],
    status: { label: "Needs setup", tone: "warn" },
  },
  {
    id: "data",
    href: "/wireframes/import/upload",
    title: "Data import and export",
    icon: Database,
    summary: "Last import 11 Sep",
    detail:
      "Bring leads and customers in from a spreadsheet, or take a copy of your data out.",
    items: [
      "Import leads",
      "Import customers",
      "Export data",
      "Import history",
    ],
  },
  {
    id: "workspace",
    title: "Workspace settings",
    icon: Building2,
    summary: WORKSPACE.name,
    detail:
      "Business name, contact details, time zone and which modules are switched on.",
    items: [
      "Business details",
      "Time zone",
      "Modules and features",
      "Lead sources",
    ],
  },
];

export function SettingsHubScreen() {
  const [expanded, setExpanded] = useState<string | null>("users");

  return (
    <CrmChrome active="settings">
      <div className="flex flex-col gap-5">
        <ScreenHeading
          title="Settings"
          description={`Everything ${WORKSPACE.name} can change without asking a developer. Select a card to see what is inside.`}
        />

        {/* `items-start`: without it every card in a row stretches to match the
            expanded one, leaving two tall empty cards beside it. */}
        <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {CARDS.map((card) => {
            const Icon = card.icon;
            const isOpen = expanded === card.id;
            return (
              <article
                key={card.id}
                className={cn(
                  "surface-elevated flex flex-col rounded-xl p-4 transition-shadow",
                  isOpen && "ring-2 ring-primary/40",
                )}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : card.id)}
                  aria-expanded={isOpen}
                  className="flex min-h-11 w-full items-start gap-3 text-left"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {card.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {card.summary}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
                      isOpen && "rotate-180",
                    )}
                    aria-hidden="true"
                  />
                </button>

                {card.status ? (
                  <span
                    className={cn(
                      "mt-3 inline-flex w-fit rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                      card.status.tone === "warn"
                        ? "border-warning/30 bg-warning-subtle text-warning-on-subtle"
                        : "border-success/30 bg-success-subtle text-success-on-subtle",
                    )}
                  >
                    {card.status.label}
                  </span>
                ) : null}

                {isOpen ? (
                  <div className="mt-3.5 border-t border-border pt-3.5">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {card.detail}
                    </p>
                    {card.href ? (
                      <Link
                        href={card.href}
                        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        Open {card.title.toLowerCase()}
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    ) : (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Not built out in these wireframes.
                      </p>
                    )}
                    <ul className="mt-3 flex flex-col gap-1">
                      {card.items.map((item) => (
                        <li key={item}>
                          <span className="flex min-h-11 items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground">
                            <ArrowRight
                              className="size-3.5 shrink-0 opacity-60"
                              aria-hidden="true"
                            />
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </CrmChrome>
  );
}
