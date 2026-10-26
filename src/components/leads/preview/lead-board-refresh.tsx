"use client";

import { PanelRightOpen, Phone, UserRound } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  SAMPLE_STAGES,
  ownerFullName,
  ownerNameOf,
  type SampleBoardStage,
  type SampleRow,
} from "./sample-list";
import { Initials, dayLabel } from "./shared";

/**
 * Lead Board — VISUAL PREVIEW of a Kanban alternative to the List.
 *
 * Synthetic data, local state, no Server Action, and NO DRAG AND DROP: this
 * pass is for information hierarchy, layout and navigation. Nothing here
 * pretends a card can be moved.
 *
 * ── Stages come from `kind`, never from a label ───────────────────────────
 *
 * §34 lets a workspace rename and reorder its pipeline, so the columns are
 * built from `SAMPLE_STAGES` sorted by the workspace's own `sortOrder`, and
 * `active` / `won` / `lost` decide which group a column belongs to. No
 * string in this file is compared against a stage name. Rename "Won" to
 * "Signed" in the sample data and nothing below changes.
 *
 * ── What a card may show ──────────────────────────────────────────────────
 *
 * Only fields the application actually has: name, owner, phone, email,
 * source and when it was last active. There is no company field on a Lead —
 * so no company is shown rather than one invented — and no value, no score,
 * no probability, no follow-up. A board that shows a number nobody stores is
 * a board that will be believed.
 */

type Props = {
  rows: readonly SampleRow[];
  term: string;
  scope: "all" | "mine";
  previewId: string | null;
  onPreview: (id: string) => void;
};

/** The dot beside a column name. Tone by kind, same scale as the chips. */
const KIND_DOT: Record<SampleBoardStage["kind"], string> = {
  active: "bg-info",
  won: "bg-success",
  lost: "bg-danger",
};

const byOrder = (a: SampleBoardStage, b: SampleBoardStage) =>
  a.sortOrder - b.sortOrder;

export function LeadBoardRefresh({
  rows,
  term,
  scope,
  previewId,
  onPreview,
}: Props) {
  /*
   * Closed stages are OFF by default and the choice is remembered for the
   * session. A pipeline board is about what is still in play; Won and Lost
   * are history, and on a real workspace they are also the two longest
   * columns by far.
   */
  const [showClosed, setShowClosed] = useState(false);
  const [stageId, setStageId] = useState<string>(
    () => SAMPLE_STAGES.filter((s) => s.kind === "active").sort(byOrder)[0]!.id,
  );

  const ordered = [...SAMPLE_STAGES].sort(byOrder);
  const columns = ordered.filter(
    (stage) => showClosed || stage.kind === "active",
  );
  const closedCount =
    ordered.length - ordered.filter((s) => s.kind === "active").length;

  /* Counts follow the search and the scope, because the board is the list. */
  const inStage = (stage: SampleBoardStage) =>
    rows.filter((row) => row.stageId === stage.id);

  const selected =
    columns.find((stage) => stage.id === stageId) ?? columns[0] ?? ordered[0]!;

  return (
    <div className="@container/board grid w-full grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {rows.length} lead{rows.length === 1 ? "" : "s"} across{" "}
          {columns.length} stage{columns.length === 1 ? "" : "s"}
        </p>
        {/*
          One switch, not a colour scheme. The brief asks for a compact way
          to include the closed stages without flooding the screen — a
          toggle adds them at the end of the workspace's own order.
        */}
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
      </div>

      {/* ───────────────── Wide: columns side by side ───────────────── */}
      <div className="hidden @min-[44rem]/board:block">
        {/*
          The board scrolls sideways; the PAGE does not. `overflow-x-auto`
          with `min-w-0` keeps the scroll inside this element — the brief
          allows horizontal scrolling here and nowhere else.
        */}
        <div
          role="group"
          aria-label="Pipeline stages"
          className="flex min-w-0 snap-x gap-3 overflow-x-auto pb-2"
        >
          {columns.map((stage) => {
            const leads = inStage(stage);
            return (
              <section
                key={stage.id}
                aria-label={`${stage.name}, ${leads.length} lead${leads.length === 1 ? "" : "s"}`}
                className="flex w-72 shrink-0 snap-start flex-col gap-2"
              >
                <ColumnHeader stage={stage} count={leads.length} />
                {/*
                  Cards are not stretched to a column height. A short column
                  is allowed to be short — padding it out would say the
                  pipeline is fuller than it is.
                */}
                <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                  {leads.map((row) => (
                    <BoardCard
                      key={row.id}
                      row={row}
                      selected={row.id === previewId}
                      onPreview={onPreview}
                    />
                  ))}
                  {leads.length === 0 ? <EmptyColumn /> : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* ───────────────── Phone: one stage at a time ───────────────── */}
      <div className="@min-[44rem]/board:hidden">
        {/*
          A stage SELECTOR, not five columns squeezed into 390px. The chips
          scroll sideways inside their own strip; the page does not move.
          `role="tablist"` with arrow keys, because that is what this is.
        */}
        <div
          role="tablist"
          aria-label="Pipeline stages"
          className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-2"
          onKeyDown={(event) => {
            const i = columns.findIndex((s) => s.id === selected.id);
            const step =
              event.key === "ArrowRight"
                ? 1
                : event.key === "ArrowLeft"
                  ? -1
                  : 0;
            if (step === 0) return;
            event.preventDefault();
            const next = columns[(i + step + columns.length) % columns.length]!;
            setStageId(next.id);
            requestAnimationFrame(() =>
              document.getElementById(`stage-${next.id}`)?.focus(),
            );
          }}
        >
          {columns.map((stage) => {
            const count = inStage(stage).length;
            const active = stage.id === selected.id;
            return (
              <button
                key={stage.id}
                id={`stage-${stage.id}`}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls="board-stage-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => setStageId(stage.id)}
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
                <span className="text-xs text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>

        <div
          id="board-stage-panel"
          role="tabpanel"
          aria-label={selected.name}
          className="grid grid-cols-[minmax(0,1fr)] gap-2"
        >
          {inStage(selected).map((row) => (
            <BoardCard
              key={row.id}
              row={row}
              selected={row.id === previewId}
              onPreview={onPreview}
            />
          ))}
          {inStage(selected).length === 0 ? (
            <EmptyState
              icon={UserRound}
              title={`Nothing in ${selected.name}`}
              description={
                term.length > 0 || scope === "mine"
                  ? "No lead in this stage matches the current search and filter."
                  : "Leads in this stage will appear here."
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ColumnHeader({
  stage,
  count,
}: {
  stage: SampleBoardStage;
  count: number;
}) {
  return (
    <div className="surface-glass flex items-center gap-2 rounded-lg px-3 py-2">
      <span
        aria-hidden="true"
        className={`size-2 shrink-0 rounded-full ${KIND_DOT[stage.kind]}`}
      />
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
        {stage.name}
      </h2>
      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
        {count}
      </span>
    </div>
  );
}

function EmptyColumn() {
  return (
    <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
      No leads here
    </p>
  );
}

/**
 * One Lead, as a card.
 *
 * The name is the link to the full record; the icon button opens the Quick
 * Preview. Both are labelled, and the preview control stays reachable by
 * keyboard at all times — it only becomes VISIBLE on hover, which is a
 * different thing from only existing for a mouse. On a phone it is always
 * visible, because there is no hover to reveal it.
 */
function BoardCard({
  row,
  selected,
  onPreview,
}: {
  row: SampleRow;
  selected: boolean;
  onPreview: (id: string) => void;
}) {
  return (
    <article
      data-selected={selected ? "true" : undefined}
      className={`group surface-solid rounded-xl p-3 transition-colors motion-reduce:transition-none ${
        selected
          ? "ring-2 ring-ring"
          : "focus-within:border-border-strong/60 hover:border-border-strong/60"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Initials name={row.name} className="mt-0.5 size-8 text-[0.6875rem]" />

        <div className="min-w-0 flex-1">
          <a
            href="#lead-detail-preview"
            className="block truncate text-sm font-medium hover:underline"
            onClick={(event) => event.preventDefault()}
          >
            {row.name}
          </a>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Initials
              name={ownerFullName(row)}
              muted
              className="size-4 text-[0.5rem]"
            />
            <span className="truncate">{ownerNameOf(row)}</span>
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {row.sourceName ?? "No source"} · {dayLabel(row.updatedAt)}
        </p>

        <div className="flex shrink-0 items-center gap-0.5">
          {row.phone ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  size="icon"
                  variant="ghost"
                  className="size-11 @min-[44rem]/board:size-8"
                  aria-label={`Call ${row.name}`}
                >
                  <a href={`tel:${row.phone}`}>
                    <Phone className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Call {row.phone}</TooltipContent>
            </Tooltip>
          ) : null}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Preview ${row.name} without leaving the board`}
                aria-expanded={selected}
                className="size-11 motion-reduce:transition-none @min-[44rem]/board:size-8 @min-[44rem]/board:opacity-0 @min-[44rem]/board:transition-opacity @min-[44rem]/board:group-hover:opacity-100 @min-[44rem]/board:focus-visible:opacity-100 @min-[44rem]/board:aria-expanded:opacity-100"
                onClick={() => onPreview(row.id)}
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
