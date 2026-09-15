"use client";

import {
  CalendarCheck,
  CircleAlert,
  Mail,
  MessageCircle,
  Package,
  Plus,
  Timer,
  Wrench,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CrmChrome } from "@/components/wireframes/crm-chrome";
import {
  Note,
  Panel,
  ScreenHeading,
  TableScroll,
} from "@/components/wireframes/wf-ui";
import {
  EMAIL_TEMPLATES,
  FOLLOW_UP_DEFAULTS,
  PRODUCTS,
  REMINDER_RULES,
  TEMPLATES,
} from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * E4 — Products, reminders and templates.
 *
 * The screen that answers the client's real question: "can we change this
 * ourselves later?" Everything here is business configuration — what you
 * sell, when customers are reminded, and what those reminders say — and none
 * of it needs a developer.
 */

const TABS = [
  { id: "products", label: "Products and services", icon: Package },
  { id: "reminders", label: "Renewal reminders", icon: Timer },
  { id: "followups", label: "Follow-up defaults", icon: CalendarCheck },
  { id: "whatsapp", label: "WhatsApp templates", icon: MessageCircle },
  { id: "email", label: "Email templates", icon: Mail },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ConfigurationScreen() {
  const [tab, setTab] = useState<TabId>("products");

  return (
    <CrmChrome active="settings">
      <div className="flex min-w-0 flex-col gap-5">
        <ScreenHeading
          title="Products, reminders and templates"
          description="The settings A&S Fincare will change most often, in one place. None of this needs a developer."
        />

        <div
          role="tablist"
          aria-label="Configuration sections"
          className="surface-elevated flex flex-wrap gap-1 rounded-xl p-1.5"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors sm:flex-none",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>

        {tab === "products" ? <ProductsTab /> : null}
        {tab === "reminders" ? <RemindersTab /> : null}
        {tab === "followups" ? <FollowUpsTab /> : null}
        {tab === "whatsapp" ? <WhatsAppTab /> : null}
        {tab === "email" ? <EmailTab /> : null}
      </div>
    </CrmChrome>
  );
}

function ProductsTab() {
  return (
    <Panel
      title="Products and services"
      icon={Package}
      count={PRODUCTS.length}
      action={
        <Button size="sm">
          <Plus className="size-4" aria-hidden="true" />
          Add product
        </Button>
      }
    >
      <TableScroll>
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-2.5 font-medium">
                Product / service
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Category
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Renewable
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                Active customers
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {PRODUCTS.map((p) => (
              <tr
                key={p.id}
                className="border-b border-border/70 last:border-0"
              >
                <td className="px-4 py-3 font-medium text-foreground">
                  {p.name}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {p.category}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      p.renewable
                        ? "border-success/30 bg-success-subtle text-success-on-subtle"
                        : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {p.renewable ? "Renewable" : "One-off"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground tabular-nums">
                  {p.activeCustomers}
                </td>
                <td className="px-4 py-3">
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}

function RemindersTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
      <Panel
        title="Renewal reminder timing"
        icon={Timer}
        count={REMINDER_RULES.length}
      >
        <ul className="divide-y divide-border/70">
          {REMINDER_RULES.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {rule.product}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Reminds the customer {rule.offsets}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                {rule.channel}
              </span>
              <Button variant="outline" size="sm">
                Edit
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      <Note icon={CircleAlert} tone="warning">
        Reminders only go out once the relevant channel is set up. WhatsApp is
        not connected and the email sender is not verified in these wireframes,
        so nothing would actually send.
      </Note>
    </div>
  );
}

function FollowUpsTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <Panel title="Follow-up defaults" icon={CalendarCheck}>
        <ul className="divide-y divide-border/70">
          {FOLLOW_UP_DEFAULTS.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                {d.label}
              </span>
              <span className="shrink-0 text-sm font-medium text-foreground">
                {d.value}
              </span>
              <Button variant="ghost" size="sm">
                Change
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Why this matters" icon={Wrench} bodyClassName="p-4 sm:p-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          These defaults decide what a salesperson sees before they type
          anything. Setting the default follow-up to a 10:00 AM call means the
          common case takes one tap, and the unusual case still takes the same
          three.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Round-robin assignment spreads new leads across the team automatically
          rather than leaving them unassigned until someone notices.
        </p>
      </Panel>
    </div>
  );
}

function WhatsAppTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
      <Panel
        title="WhatsApp templates"
        icon={MessageCircle}
        count={TEMPLATES.length}
        action={
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            New template
          </Button>
        }
      >
        <ul className="divide-y divide-border/70">
          {TEMPLATES.map((t) => (
            <li key={t.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {t.name}
                </p>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  {t.category}
                </span>
                <span className="shrink-0 rounded-full border border-success/30 bg-success-subtle px-2.5 py-0.5 text-xs font-medium text-success-on-subtle">
                  Approved
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {t.body}
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <Note icon={CircleAlert} tone="warning">
        WhatsApp requires Meta to approve each template before it can be sent.
        No approval has been requested in these wireframes — a real template
        moves through Draft, Submitted and Approved before it appears to
        salespeople.
      </Note>
    </div>
  );
}

function EmailTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
      <Panel
        title="Email templates"
        icon={Mail}
        count={EMAIL_TEMPLATES.length}
        action={
          <Button size="sm">
            <Plus className="size-4" aria-hidden="true" />
            New template
          </Button>
        }
      >
        <ul className="divide-y divide-border/70">
          {EMAIL_TEMPLATES.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {t.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {t.subject}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  t.status === "Active"
                    ? "border-success/30 bg-success-subtle text-success-on-subtle"
                    : "border-border bg-muted text-muted-foreground",
                )}
              >
                {t.status}
              </span>
              <Button variant="outline" size="sm">
                Edit
              </Button>
            </li>
          ))}
        </ul>
      </Panel>

      <Note icon={CircleAlert} tone="warning">
        Email sending needs a verified sender address for the workspace. Until
        that is set up, templates can be written but nothing will send.
      </Note>
    </div>
  );
}
