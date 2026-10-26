import { Plus } from "lucide-react";
import type { Metadata } from "next";

import { AddLeadPanel } from "@/components/leads/add-lead-panel";
import {
  LeadList,
  type LeadScope,
  type LeadView,
} from "@/components/leads/lead-list";
import { resolveTimeZone } from "@/lib/workspace-time";
import { requireModule } from "@/server/auth/require-module";
import { workspaceTimeZone } from "@/server/auth/workspace-business-settings";
import { leadSources, leadStages } from "@/server/auth/workspace-lead-pipeline";
import {
  leadStageCounts,
  listLeads,
  recordOwnerNames,
} from "@/server/auth/workspace-leads";
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
   * §31's two arrangements of the same leads. In the URL, so a board can be
   * linked to, reloaded and gone back from — the same place the scope and
   * the search live.
   */
  const view: LeadView = params.view === "board" ? "board" : "list";

  const [leads, owners, stages, sources, storedZone, stageTotals] =
    await Promise.all([
      listLeads(context, { scope, search }),
      recordOwnerNames(context),
      leadStages(context),
      leadSources(context),
      workspaceTimeZone(context),
      /*
       * Only for the board, and only one grouped read. `listLeads` is capped
       * at 200 rows, so counting what it returned would describe the newest
       * 200 rather than the pipeline.
       */
      view === "board"
        ? leadStageCounts(context, { scope, search })
        : Promise.resolve(new Map<string, number>()),
    ]);

  /*
   * §158's zone, resolved once here. Every date on this screen is formatted
   * against it rather than the reader's laptop, and pinning it on the server
   * is what keeps the server pass and the client pass producing the same
   * string.
   */
  const zone = resolveTimeZone(storedZone);

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
        leads={leads}
        ownerNames={Object.fromEntries(owners)}
        scope={scope}
        search={search}
        canAdd={canAdd}
        defaultsToMine={defaultsToMine}
        workspaceTimeZone={zone}
        view={view}
        stages={stages}
        stageTotals={stageTotals}
      />
    </div>
  );
}
