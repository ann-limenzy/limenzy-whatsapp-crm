import { Mail, Phone, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/data/status-badge";
import {
  LeadLifecyclePanel,
  type StageOption,
} from "@/components/leads/lead-lifecycle-panel";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LEAD_LOST_REASON_LABELS } from "@/lib/validation/leads";
import type {
  LeadActivityEntry,
  LeadDetail,
  LeadForEdit,
} from "@/server/auth/workspace-leads";

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
 * **The activity section is the real §39 timeline**, read from
 * `lead_activities`. It renders the kinds this application can emit — notes,
 * edits, stage moves and outcomes — and says nothing about the ones it
 * cannot. A screen that lists what the product does not do yet is a build
 * plan, not a record; the gaps are tracked in `docs/dependencies.md`.
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

/** One line of §39's timeline, in plain words. */
function describe(
  entry: LeadActivityEntry,
  actorName: string,
): { readonly headline: string; readonly detail?: string } {
  switch (entry.kind) {
    case "record_created":
      return { headline: `Lead created by ${actorName}` };
    case "details_edited":
      return {
        headline: `${actorName} edited the details`,
        detail: (entry.changedFields ?? []).join(", "),
      };
    case "stage_changed":
      return {
        headline: `${actorName} changed the stage`,
        detail: `${entry.fromStageName} → ${entry.toStageName}`,
      };
    case "marked_won":
      return { headline: `${actorName} marked it won` };
    case "marked_lost":
      return {
        headline: `${actorName} marked it lost`,
        detail: [
          entry.lostReason ? LEAD_LOST_REASON_LABELS[entry.lostReason] : null,
          entry.note,
        ]
          .filter(Boolean)
          .join(" — "),
      };
    case "reopened":
      return {
        headline: `${actorName} reopened it`,
        detail: `moved to ${entry.toStageName}`,
      };
    case "note_added":
      return {
        headline: `${actorName} added a note`,
        detail: entry.note ?? "",
      };
  }
}

export function LeadDetailView({
  lead,
  editable,
  activity,
  actorNames,
  stages,
  sources,
  workspaceId,
  ownerName,
  createdOn,
  formatWhen,
}: {
  lead: LeadDetail;
  /**
   * The same Lead, with the revision every control has to carry — `null`
   * when §162 withholds `edit_permitted_records`, in which case no control
   * is drawn at all rather than one that would be refused on submission.
   */
  editable: LeadForEdit | null;
  activity: readonly LeadActivityEntry[];
  /** Profile id to display name, for §39's authorship. */
  actorNames: Readonly<Record<string, string>>;
  /** Open, ordinary stages — the only ones a Lead can be moved to by hand. */
  stages: readonly StageOption[];
  sources: readonly StageOption[];
  workspaceId: string;
  ownerName: string;
  /** Formatted on the server, so the markup does not depend on the locale. */
  createdOn: string;
  formatWhen: (when: Date) => string;
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
          {editable?.lostReason ? (
            <Row label="Lost reason">
              {LEAD_LOST_REASON_LABELS[editable.lostReason]}
              {editable.lostReasonNote ? ` — ${editable.lostReasonNote}` : null}
            </Row>
          ) : null}
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

      {editable ? (
        <>
          <Separator />

          <section aria-labelledby="lead-actions" className="grid gap-3">
            <h2 id="lead-actions" className="text-base font-semibold">
              Update this lead
            </h2>
            <LeadLifecyclePanel
              lead={editable}
              stages={stages}
              sources={sources}
              workspaceId={workspaceId}
            />
          </section>
        </>
      ) : null}

      <Separator />

      <section aria-labelledby="lead-activity" className="grid gap-2">
        <h2 id="lead-activity" className="text-base font-semibold">
          Activity
        </h2>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing has been recorded for this lead yet.
          </p>
        ) : null}
        <ol className="grid gap-2">
          {activity.map((entry) => {
            const actor = entry.actorUserProfileId
              ? (actorNames[entry.actorUserProfileId] ?? "a team member")
              : "the system";
            const { headline, detail } = describe(entry, actor);
            return (
              <li
                key={entry.id}
                className="rounded-lg border border-border p-3"
              >
                <p className="text-sm font-medium">{headline}</p>
                {detail ? (
                  <p className="mt-0.5 text-sm whitespace-pre-wrap">{detail}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatWhen(entry.occurredAt)}
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/leads">Back to leads</Link>
        </Button>
      </div>
    </div>
  );
}
