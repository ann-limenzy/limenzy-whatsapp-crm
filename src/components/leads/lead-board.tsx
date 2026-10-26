"use client";

import { PanelRightOpen, Phone, TriangleAlert, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Initials, formatDay } from "@/components/leads/presentation";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LeadStage } from "@/server/auth/workspace-lead-pipeline";
import type { LeadListItem } from "@/server/auth/workspace-leads";

/**
 * Leads by pipeline stage — §31's board view, read only.
 *
 * **No drag and drop and no stage mutation from a card.** A card opens the
 * Lead or its preview; moving a Lead is still the stage control on the
 * record, which carries the revision the server checks.
 *
 * ── Stages come from the workspace, by id and kind ────────────────────────
 *
 * Columns are the workspace's own `workspace_lead_stages`, ordered by their
 * configured `sort_order`, grouped by stable `stage_id`, and coloured from
 * the immutable `kind`. §34 lets any stage be renamed, so no label is
 * compared against anything here.
 *
 * A stage that has been switched OFF still appears when it holds Leads —
 * they have to live somewhere, and hiding the column would hide them — and
 * is marked as switched off. An empty switched-off stage is not drawn,
 * because it is a column nobody can put anything into.
 *
 * ── Counts mean the whole pipeline, cards mean what was loaded ────────────
 *
 * `listLeads` is capped at 200 rows with no pagination, so the cards here
 * are the newest 200 that match. The counts are a separate grouped query
 * over everything this actor may see, with the same scope and search — so a
 * column reading 240 is telling the truth, and says explicitly how many of
 * those it is showing rather than quietly dropping the rest.
 */

type Props = {
  leads: readonly LeadListItem[];
  stages: readonly LeadStage[];
  /** True totals per stage id, from `leadStageCounts`. */
  stageTotals: ReadonlyMap<string, number>;
  ownerNames: Readonly<Record<string, string>>;
  workspaceTimeZone: string;
  previewId: string | null;
  onPreview: (id: string, opener: HTMLElement | null) => void;
  searching: boolean;
  scope: "all" | "mine";
};

const KIND_DOT: Record<LeadStage["kind"], string> = {
  active: "bg-info",
  won: "bg-success",
  lost: "bg-danger",
};

export function LeadBoard({
  leads,
  stages,
  stageTotals,
  ownerNames,
  workspaceTimeZone,
  previewId,
  onPreview,
  searching,
  scope,
}: Props) {
  const [showClosed, setShowClosed] = useState(false);

  const ordered = [...stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const loadedIn = (stageId: string) =>
    leads.filter((lead) => lead.stageId === stageId);

  /*
   * A switched-off stage is drawn only while something is still in it.
   * §34 lets a stage be turned off without emptying it first.
   */
  const relevant = ordered.filter(
    (stage) =>
      stage.isActive ||
      (stageTotals.get(stage.id) ?? 0) > 0 ||
      loadedIn(stage.id).length > 0,
  );
  const columns = relevant.filter(
    (stage) => showClosed || stage.kind === "active",
  );
  const closedCount = relevant.length - relevant.filter((s) => s.kind === "active").length;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    columns.find((s) => s.id === selectedId) ?? columns[0] ?? null;

  const shownTotal = columns.reduce(
    (sum, stage) => sum + (stageTotals.get(stage.id) ?? 0),
    0,
  );
  const loadedTotal = columns.reduce(
    (sum, stage) => sum + loadedIn(stage.id).length,
    0,
  );
  const capped = shownTotal > loadedTotal;

  if (columns.length === 0) {
    return (
      <EmptyState
        icon={UserRound}
        title="No stages to show"
        description="This workspace has no pipeline stage with leads in it."
      />
    );
  }

  return (
    <div className="@container/board grid w-full grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {shownTotal} lead{shownTotal === 1 ? "" : "s"} across{" "}
          {columns.length} stage{columns.length === 1 ? "" : "s"}
        </p>
        {closedCount > 0 ? (
          <Button
            size="sm"
            variant={showClosed ? "secondary" : "outline"}
            aria-pressed={showClosed}
            className="min-h-11 @min-[44rem]/board:min-h-8"
            onClick={() => setShowClosed((on) => !on)}
          >
            {showClosed ? "Hide" : "Show"} closed stages
            <span className="text-muted-foreground">({closedCount})</span>
          </Button>
        ) : null}
      </div>

      {/*
        Said once, plainly, when the 200-row cap is actually biting. Without
        it a column reading 240 above 200 cards would look like a bug or, far
        worse, like nothing at all.
      */}
      {capped ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-warning-on-subtle"
        >
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Showing the {loadedTotal} most recent of {shownTotal} leads. The
            counts on each column are the full totals; search or switch to My
            leads to narrow them.
          </span>
        </p>
      ) : null}

      {/* ─────────────── Wide: columns ─────────────── */}
      <div className="hidden @min-[44rem]/board:block">
        <div
          role="group"
          aria-label="Pipeline stages"
          className="flex min-w-0 snap-x gap-3 overflow-x-auto pb-2"
        >
          {columns.map((stage) => {
            const cards = loadedIn(stage.id);
            const total = stageTotals.get(stage.id) ?? cards.length;
            return (
              <section
                key={stage.id}
                aria-label={`${stage.name}, ${total} lead${total === 1 ? "" : "s"}`}
                className="flex w-72 shrink-0 snap-start flex-col gap-2"
              >
                <ColumnHeader stage={stage} total={total} shown={cards.length} />
                <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                  {cards.map((lead) => (
                    <BoardCard
                      key={lead.id}
                      lead={lead}
                      ownerNames={ownerNames}
                      timeZone={workspaceTimeZone}
                      selected={lead.id === previewId}
                      onPreview={onPreview}
                    />
                  ))}
                  {cards.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                      {total > 0 ? "Not in the leads loaded" : "No leads here"}
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* ─────────────── Phone: one stage at a time ─────────────── */}
      <div className="@min-[44rem]/board:hidden">
        <div
          role="group"
          aria-label="Pipeline stages"
          className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-2"
        >
          {columns.map((stage) => {
            const total = stageTotals.get(stage.id) ?? 0;
            const active = stage.id === selected?.id;
            return (
              <button
                key={stage.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedId(stage.id)}
                className={`flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors motion-reduce:transition-none ${
                  active
                    ? "surface-glass-strong border-transparent text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${KIND_DOT[stage.kind]}`}
                />
                {stage.name}
                <span className="text-xs text-muted-foreground">{total}</span>
              </button>
            );
          })}
        </div>

        {selected ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
            <p aria-live="polite" className="sr-only">
              {selected.name}, {stageTotals.get(selected.id) ?? 0} leads
            </p>
            {loadedIn(selected.id).map((lead) => (
              <BoardCard
                key={lead.id}
                lead={lead}
                ownerNames={ownerNames}
                timeZone={workspaceTimeZone}
                selected={lead.id === previewId}
                onPreview={onPreview}
              />
            ))}
            {loadedIn(selected.id).length === 0 ? (
              <EmptyState
                icon={UserRound}
                title={`Nothing in ${selected.name}`}
                description={
                  searching || scope === "mine"
                    ? "No lead in this stage matches the current search and filter."
                    : "Leads in this stage will appear here."
                }
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ColumnHeader({
  stage,
  total,
  shown,
}: {
  stage: LeadStage;
  total: number;
  shown: number;
}) {
  return (
    <div className="surface-glass flex items-center gap-2 rounded-lg px-3 py-2">
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${KIND_DOT[stage.kind]}`}
      />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold">{stage.name}</h2>
        {/* Only said when it differs, so the usual case stays quiet. */}
        {shown < total ? (
          <p className="truncate text-[0.6875rem] text-muted-foreground">
            showing {shown}
          </p>
        ) : null}
        {!stage.isActive ? (
          <p className="truncate text-[0.6875rem] text-muted-foreground">
            switched off
          </p>
        ) : null}
      </div>
      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
        {total}
      </span>
    </div>
  );
}

function BoardCard({
  lead,
  ownerNames,
  timeZone,
  selected,
  onPreview,
}: {
  lead: LeadListItem;
  ownerNames: Readonly<Record<string, string>>;
  timeZone: string;
  selected: boolean;
  onPreview: (id: string, opener: HTMLElement | null) => void;
}) {
  const ownerFull =
    ownerNames[lead.recordOwnerUserProfileId] ?? "Another team member";
  const ownerLabel = lead.isOwnedByActor ? "You" : ownerFull;

  return (
    <article
      data-selected={selected ? "true" : undefined}
      className={`group surface-solid rounded-xl p-3 transition-colors motion-reduce:transition-none ${
        selected
          ? "ring-2 ring-ring"
          : "hover:border-border-strong/60 focus-within:border-border-strong/60"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Initials name={lead.name} className="mt-0.5 size-8 text-[0.6875rem]" />
        <div className="min-w-0 flex-1">
          {/*
            A comfortable target on a phone, back to a plain line above it.
            Measured on the real board: the name alone was 20px tall.
          */}
          <Link
            href={`/leads/${lead.id}`}
            className="-my-2 flex min-h-11 min-w-0 items-center py-2 text-sm font-medium hover:underline @min-[44rem]/board:my-0 @min-[44rem]/board:min-h-0 @min-[44rem]/board:py-0"
          >
            <span className="min-w-0 truncate">{lead.name}</span>
          </Link>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Initials
              name={ownerFull}
              muted
              className="size-4 text-[0.5rem]"
            />
            <span className="truncate">{ownerLabel}</span>
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {lead.sourceName ?? "No source"} ·{" "}
          {formatDay(lead.updatedAt, timeZone)}
        </p>
        <div className="flex shrink-0 items-center gap-0.5">
          {lead.phone ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  size="icon"
                  variant="ghost"
                  className="size-11 @min-[44rem]/board:size-8"
                  aria-label={`Call ${lead.name}`}
                >
                  <a href={`tel:${lead.phone}`}>
                    <Phone className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Call {lead.phone}</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Preview ${lead.name} without leaving the board`}
                aria-expanded={selected}
                className="size-11 @min-[44rem]/board:size-8 @min-[44rem]/board:opacity-0 @min-[44rem]/board:transition-opacity @min-[44rem]/board:group-hover:opacity-100 @min-[44rem]/board:focus-visible:opacity-100 @min-[44rem]/board:aria-expanded:opacity-100 motion-reduce:transition-none"
                onClick={(event) => onPreview(lead.id, event.currentTarget)}
              >
                <PanelRightOpen className="size-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Quick preview</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </article>
  );
}
