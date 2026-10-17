import { Info, Mail, Phone, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { LeadDetail } from "@/server/auth/workspace-leads";

/**
 * Lead Detail — §35, §36, §37, and the one §27 activity this slice can show.
 *
 * §36's header actions are Call, WhatsApp, Email, Add Follow-up, Edit and
 * More. Only **Call** is here, because it is the only one whose preconditions
 * this slice can meet: §27.1 makes it a `tel:` link, enabled when the user
 * can access the Lead and a valid phone number exists. WhatsApp needs a
 * connected workspace, Email needs a verified sender and the Email module,
 * Add Follow-up needs follow-ups, Edit needs the edit form, and More needs
 * actions that do not exist. Drawing them disabled would promise six features
 * instead of shipping one honestly.
 *
 * **The activity section is the §27 "record created" entry and nothing else.**
 * It is derived from the Lead's own `created_at` and creator rather than read
 * from a timeline table, because there is no timeline: notes, calls, stage
 * changes and the rest arrive with the features that emit them.
 */

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4 sm:py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

export function LeadDetailView({
  lead,
  ownerName,
  createdByName,
  createdOn,
}: {
  lead: LeadDetail;
  ownerName: string;
  createdByName: string;
  /** Formatted on the server, so the markup does not depend on the locale. */
  createdOn: string;
}) {
  return (
    <div className="grid gap-6">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{lead.name}</h1>
          <StatusBadge
            tone={lead.stageIsActive ? "info" : "neutral"}
            label={lead.stageName}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {lead.phone ? (
            <span className="flex items-center gap-1.5">
              <Phone className="size-4" aria-hidden="true" />
              {lead.phone}
            </span>
          ) : null}
          {lead.email ? (
            <span className="flex items-center gap-1.5">
              <Mail className="size-4" aria-hidden="true" />
              {lead.email}
            </span>
          ) : null}
          <span>Record owner: {ownerName}</span>
        </div>

        {/* §27.1: click-to-call, and only when there is a number to call. */}
        {lead.phone ? (
          <div>
            <Button asChild size="sm" variant="outline">
              <a href={`tel:${lead.phoneNormalised ?? lead.phone}`}>
                Call {lead.name.split(" ")[0]}
              </a>
            </Button>
          </div>
        ) : null}

        {lead.phoneNeedsReview ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning-on-subtle">
            <TriangleAlert
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            <span>
              This number has no country code, so it is stored exactly as it was
              typed and is not compared against other leads. Adding the country
              code — for example +91 — makes duplicate checking work.
            </span>
          </p>
        ) : null}
      </header>

      <Separator />

      <section aria-labelledby="lead-information" className="grid gap-2">
        <h2 id="lead-information" className="text-base font-semibold">
          Lead information
        </h2>
        <dl className="divide-y divide-border">
          <Row label="Stage">
            {lead.stageName}
            {lead.stageIsActive ? null : " (switched off)"}
          </Row>
          <Row label="Lead source">{lead.sourceName ?? "Not recorded"}</Row>
          <Row label="Record owner">{ownerName}</Row>
          <Row label="Phone">{lead.phone ?? "Not recorded"}</Row>
          <Row label="Email">{lead.email ?? "Not recorded"}</Row>
          <Row label="Created">{createdOn}</Row>
          <Row label="Notes">
            {lead.notes ? (
              <span className="whitespace-pre-wrap">{lead.notes}</span>
            ) : (
              "None"
            )}
          </Row>
        </dl>
      </section>

      <Separator />

      <section aria-labelledby="lead-activity" className="grid gap-2">
        <h2 id="lead-activity" className="text-base font-semibold">
          Activity
        </h2>
        <ol className="grid gap-2">
          <li className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Lead created</p>
            <p className="text-xs text-muted-foreground">
              {createdOn} · by {createdByName}
            </p>
          </li>
        </ol>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Notes, calls, follow-ups and stage changes will appear here as those
            features arrive.
          </span>
        </p>
      </section>

      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/leads">Back to leads</Link>
        </Button>
      </div>
    </div>
  );
}
