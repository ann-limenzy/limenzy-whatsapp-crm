import { Plus } from "lucide-react";
import type { Metadata } from "next";

import { AddLeadPanel } from "@/components/leads/add-lead-panel";
import { LeadList, type LeadScope } from "@/components/leads/lead-list";
import { requireModule } from "@/server/auth/require-module";
import { leadSources, leadStages } from "@/server/auth/workspace-lead-pipeline";
import { listLeads, recordOwnerNames } from "@/server/auth/workspace-leads";
import {
  permissionFor,
  workspacePermissionSettings,
} from "@/server/auth/workspace-permissions";

export const metadata: Metadata = { title: "Leads" };

/**
 * Leads — List View, §30, §31.
 *
 * The module gate runs HERE, not only in the `(app)` layout: a layout is not
 * re-executed for every client-side navigation between sibling routes, so a
 * layout-only check can be stale by the time this page renders. §30 hides the
 * entire module when Lead Management is disabled, and `requireModule` is what
 * enforces that for this route.
 *
 * Everything below reads through `withTenant()`, so what the list contains is
 * decided by the §162.1 policies on `leads` — not by this page choosing what
 * to ask for. The `scope` parameter can only narrow that.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { context, role } = await requireModule("leads");
  const params = await searchParams;

  const settings = await workspacePermissionSettings(context);
  const canAdd = permissionFor(settings, role, "add_leads_customers").allowed;
  /*
   * §31: "For Staff users, My Leads should be the default view unless their
   * permissions allow broader access." Anyone who cannot see every record is
   * only ever shown their own leads anyway, so defaulting them to My Leads
   * describes the list accurately instead of labelling it All.
   */
  const seesEveryRecord = permissionFor(
    settings,
    role,
    "view_all_leads_customers",
  ).allowed;
  const defaultsToMine = !seesEveryRecord;

  const requested = typeof params.scope === "string" ? params.scope : undefined;
  const scope: LeadScope =
    requested === "mine" || requested === "all"
      ? requested
      : defaultsToMine
        ? "mine"
        : "all";
  const search = typeof params.q === "string" ? params.q : "";
  /*
   * The page is a URL parameter so a page can be linked to, reloaded and gone
   * back to, exactly as the scope and search term already are. An unparseable
   * value is page 1 rather than an error: a bad `?page=` in a pasted link
   * should show the list, not a failure.
   */
  const requestedPage = Number.parseInt(
    typeof params.page === "string" ? params.page : "",
    10,
  );

  const [leads, owners, stages, sources] = await Promise.all([
    listLeads(context, { scope, search, page: requestedPage }),
    recordOwnerNames(context),
    leadStages(context),
    leadSources(context),
  ]);

  const activeStages = stages
    .filter((stage) => stage.kind === "active" && stage.isActive)
    .map((stage) => ({ id: stage.id, name: stage.name }));
  const activeSources = sources
    .filter((source) => source.isActive)
    .map((source) => ({ id: source.id, name: source.name }));

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            People who have enquired, and where each one has reached.
          </p>
        </div>

        {canAdd ? (
          <AddLeadPanel
            stages={activeStages}
            sources={activeSources}
            workspaceId={context.workspaceId}
            ownerName={owners.get(context.userProfileId) ?? "you"}
            trigger={
              <>
                <Plus className="size-4" aria-hidden="true" />
                Add lead
              </>
            }
          />
        ) : null}
      </header>

      {/*
        §163.10: the actor handed this Lead to somebody else and, because
        §162.1 showed it to them only as its owner, can no longer see it.
        That is a success, and saying nothing after a screen vanishes reads
        as a fault. A flag rather than a name: the value comes from a URL.
      */}
      {params["handed-over"] === "1" ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
        >
          Lead handed over. It is now with its new record owner, and no longer
          in your list.
        </p>
      ) : null}

      {canAdd && activeStages.length === 0 ? (
        <p
          role="alert"
          className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-on-subtle"
        >
          This workspace has no active pipeline stage, so a lead has nowhere to
          start. An owner can switch one back on in Settings.
        </p>
      ) : null}

      <LeadList
        leads={leads.items}
        total={leads.total}
        page={leads.page}
        pageCount={leads.pageCount}
        pageSize={leads.pageSize}
        ownerNames={Object.fromEntries(owners)}
        scope={scope}
        search={search}
        canAdd={canAdd}
        defaultsToMine={defaultsToMine}
      />
    </div>
  );
}
