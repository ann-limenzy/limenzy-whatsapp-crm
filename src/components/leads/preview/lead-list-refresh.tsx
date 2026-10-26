"use client";

import {
  Columns3,
  Mail,
  PanelRightOpen,
  Phone,
  Plus,
  Rows3,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { StatusBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  SAMPLE_ROWS,
  ownerFullName,
  ownerNameOf,
  stageById,
  type SampleRow,
} from "./sample-list";
import { LeadBoardRefresh } from "./lead-board-refresh";
import { QuickPreview } from "./quick-preview";
import { Initials, dayLabel, stageTone } from "./shared";

/**
 * Lead List — VISUAL PREVIEW of a proposed layout. Development only.
 *
 * Synthetic data, local state, no Server Action. The shipping screen is
 * `components/leads/lead-list.tsx` and is untouched.
 *
 * ── What this list may contain ────────────────────────────────────────────
 *
 * Only what 3B–3D built: search across name, phone and email; the two §31
 * scopes All and My leads; open a Lead; add one. §31's other filters —
 * follow-up due, stage, owner, product, date, Sales Team — need features that
 * do not exist, so they are not drawn. Neither is bulk selection, export, a
 * saved view, a lead score or "last contacted". Every one of those would be a
 * promise.
 *
 * ── Desktop ───────────────────────────────────────────────────────────────
 *
 * A compact toolbar on one line, then a real table with a header row, because
 * a table is what this is: five like-for-like fields across many rows. The
 * previous version used stacked link cards, which costs a scan line per row
 * and gives the stage and the owner no column to live in.
 *
 * Row hover reveals a Preview control — HubSpot's index-page pattern — which
 * opens a drawer on the right rather than navigating. The reason it is worth
 * having is the cost of the alternative: opening a Lead to glance at it and
 * then coming back loses the search, the scope and the scroll position.
 *
 *
 * TOUCH TARGETS.
 *
 * 36px minimum for anything tappable, and the phone card's main target is
 * the whole content block rather than the name's own text box — measured,
 * the text link alone was 24px tall, which is a target you aim at rather
 * than hit. Controls shrink back to 32px only where the container is wide
 * enough that a mouse is doing the pointing.

 * ── Phone ─────────────────────────────────────────────────────────────────
 *
 * Cards, not a squeezed table. Five columns cannot be read at 390px, and
 * horizontal scrolling a table is a worse answer than designing for the
 * width that is actually there. The same preview opens as a bottom sheet.
 */

type Scope = "all" | "mine";
type View = "list" | "board";

/*
 * The chosen view survives a trip to the Detail screen and back.
 *
 * `sessionStorage`, not state lifted into the preview shell: the shell
 * unmounts this component when it switches screens, so component state
 * would not survive, and the real screen will put this in the URL where it
 * can be linked and gone back to. For a preview, per-tab memory is the
 * closest honest equivalent.
 */
const VIEW_KEY = "limenzy-preview:leads-view";

const listeners = new Set<() => void>();

const readView = (): View => {
  try {
    return sessionStorage.getItem(VIEW_KEY) === "board" ? "board" : "list";
  } catch {
    return "list";
  }
};

const writeView = (next: View) => {
  try {
    sessionStorage.setItem(VIEW_KEY, next);
  } catch {
    /* Private mode, blocked storage: the view simply does not persist. */
  }
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/*
 * `useSyncExternalStore` rather than an effect that calls setState.
 *
 * The server has no `sessionStorage`, so the snapshot it renders must be
 * "list"; reading storage into state from an effect would do that too, but
 * as a cascading render the project's lint rightly refuses. This is the
 * shape React provides for exactly this: one snapshot for the server, one
 * for the browser, and no second render pass to reconcile them.
 */
const useView = (): [View, (next: View) => void] => [
  useSyncExternalStore(subscribe, readView, () => "list" as View),
  writeView,
];

/* ------------------------------------------------------------------ */
/* Toolbar                                                             */
/* ------------------------------------------------------------------ */

function Toolbar({
  scope,
  onScope,
  search,
  onSearch,
  pending,
  count,
  view,
  onView,
}: {
  scope: Scope;
  onScope: (next: Scope) => void;
  search: string;
  onSearch: (next: string) => void;
  pending: boolean;
  count: number;
  view: View;
  onView: (next: View) => void;
}) {
  const box = useRef<HTMLInputElement>(null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 @min-[44rem]/list:flex @min-[44rem]/list:items-center @min-[44rem]/list:gap-3">
      {/*
        One line on anything wide enough, and the search keeps the flexible
        space because it is the control people reach for. The label is visually
        hidden rather than absent: the field has a placeholder, but a
        placeholder is not a label once something has been typed into it.
      */}
      <form
        className="relative min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(box.current?.value ?? "");
        }}
      >
        <Label htmlFor="preview-lead-search" className="sr-only">
          Search leads by name, phone or email
        </Label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="preview-lead-search"
          ref={box}
          defaultValue={search}
          placeholder="Search name, phone or email"
          className="h-11 pr-11 pl-9 @min-[44rem]/list:h-9 @min-[44rem]/list:pr-9"
          type="search"
        />
        {search.length > 0 ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Clear search"
            className="absolute top-1/2 right-1 size-9 -translate-y-1/2 @min-[44rem]/list:size-8"
            onClick={() => {
              if (box.current) box.current.value = "";
              onSearch("");
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {/*
          LIST or BOARD. A radiogroup rather than two toggle buttons: they
          are one choice with two answers, and that is what a screen reader
          should be told. Arrow keys move between them, as a radiogroup
          requires.
        */}
        <div
          role="radiogroup"
          aria-label="How to show the leads"
          className="surface-glass flex items-center gap-0.5 rounded-lg p-0.5"
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            event.preventDefault();
            onView(view === "list" ? "board" : "list");
          }}
        >
          {(
            [
              { key: "list", label: "List", Icon: Rows3 },
              { key: "board", label: "Board", Icon: Columns3 },
            ] as const
          ).map(({ key, label, Icon }) => (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  role="radio"
                  aria-checked={view === key}
                  tabIndex={view === key ? 0 : -1}
                  variant={view === key ? "secondary" : "ghost"}
                  className="min-h-11 @min-[44rem]/list:min-h-8"
                  onClick={() => onView(key)}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  <span>{label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {key === "list" ? "Table of leads" : "Leads by pipeline stage"}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div
          role="group"
          aria-label="Which leads to show"
          className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
        >
          {(["all", "mine"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              className="min-h-11 min-w-11 @min-[44rem]/list:min-h-8 @min-[44rem]/list:min-w-0"
              variant={scope === option ? "default" : "ghost"}
              aria-pressed={scope === option}
              onClick={() => onScope(option)}
            >
              {option === "all" ? "All" : "My leads"}
            </Button>
          ))}
        </div>

        <Button
          size="sm"
          className="min-h-11 shrink-0 @min-[44rem]/list:min-h-8"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add lead
        </Button>
      </div>

      {/*
        The count is the list's own status line. `aria-live` so a screen
        reader hears the result of a search it just ran, and visible so
        everyone else sees the same thing rather than only the lucky ones.
      */}
      <p
        aria-live="polite"
        className="order-last text-xs text-muted-foreground @min-[44rem]/list:order-none @min-[44rem]/list:shrink-0"
      >
        {pending ? "Searching…" : `${count} lead${count === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The screen                                                          */
/* ------------------------------------------------------------------ */

export function LeadListRefresh() {
  const [scope, setScope] = useState<Scope>("all");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [view, changeView] = useView();
  /** Remembered so closing the drawer can prove it restored the position. */
  const scrollAtOpen = useRef(0);

  const term = search.trim().toLowerCase();
  const rows = SAMPLE_ROWS.filter((row) => {
    if (scope === "mine" && !row.isOwnedByActor) return false;
    if (term.length === 0) return true;
    return [row.name, row.phone, row.email]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(term));
  });

  const preview = rows.find((row) => row.id === previewId) ?? null;

  const openPreview = (id: string) => {
    scrollAtOpen.current = window.scrollY;
    setPreviewId(id);
  };

  /*
   * CLOSING RESTORES WHAT WAS THERE.
   *
   * The search term, the scope and the scroll position are all untouched by
   * opening and closing the drawer — which is the entire reason the drawer
   * exists instead of a navigation. The scroll restore is explicit because
   * the drawer takes focus, and returning focus to the row can scroll the
   * page on its own.
   */
  const closePreview = () => {
    setPreviewId(null);
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollAtOpen.current, behavior: "auto" });
    });
  };

  const runSearch = (next: string) => {
    setPending(true);
    setSearch(next);
    /* A beat of pending state, so the pending treatment can be reviewed. */
    window.setTimeout(() => setPending(false), 220);
  };

  return (
    <TooltipProvider delayDuration={200}>
      {/*
        `grid-cols-[minmax(0,1fr)]` is not decoration.
        A bare `grid` gives its single column an `auto` track, which sizes to
        the CONTENT's min-content — and a long email with `white-space:
        nowrap` on it makes that 615px. The children then overflow a 358px
        container and the whole phone layout scrolls sideways. Measured: the
        container stayed 358 while its children were 615, and clamping the
        track brought them back to 358.
      */}
      <div className="@container/list grid w-full grid-cols-[minmax(0,1fr)] gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            People who have enquired, and where each one has reached.
          </p>
        </div>

        <Toolbar
          scope={scope}
          onScope={setScope}
          search={search}
          onSearch={runSearch}
          pending={pending}
          count={rows.length}
          view={view}
          onView={changeView}
        />

        {view === "board" ? (
          /*
            The board gets the SAME filtered rows the table would. Search and
            scope are owned here, so switching view changes nothing about
            what is in scope — only how it is arranged.
          */
          <div
            data-pending={pending ? "true" : undefined}
            className="transition-opacity duration-150 data-[pending=true]:opacity-60 motion-reduce:transition-none"
          >
            <LeadBoardRefresh
              rows={rows}
              term={term}
              scope={scope}
              previewId={previewId}
              onPreview={openPreview}
            />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title={
              term.length > 0
                ? "No leads match that search"
                : scope === "mine"
                  ? "You have no leads yet"
                  : "No leads yet"
            }
            description={
              term.length > 0
                ? "Try a different name, phone number or email address."
                : "Add your first lead and it will appear here."
            }
          />
        ) : (
          <div
            data-pending={pending ? "true" : undefined}
            className="transition-opacity duration-150 data-[pending=true]:opacity-60 motion-reduce:transition-none"
          >
            <DesktopTable
              rows={rows}
              previewId={previewId}
              onPreview={openPreview}
            />
            <PhoneCards
              rows={rows}
              previewId={previewId}
              onPreview={openPreview}
            />
          </div>
        )}

        {preview ? <QuickPreview row={preview} onClose={closePreview} /> : null}
      </div>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop table                                                       */
/* ------------------------------------------------------------------ */

function DesktopTable({
  rows,
  previewId,
  onPreview,
}: {
  rows: readonly SampleRow[];
  previewId: string | null;
  onPreview: (id: string) => void;
}) {
  return (
    <div className="surface-solid hidden overflow-hidden rounded-xl @min-[44rem]/list:block">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">
          Leads, with stage, record owner and when each was last active
        </caption>
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left">
            <Th className="w-[30%]">Lead</Th>
            <Th className="w-[26%] @max-[64rem]/list:hidden">Contact</Th>
            <Th className="w-[16%]">Stage</Th>
            <Th className="w-[16%]">Owner</Th>
            <Th className="w-[12%] text-right">Last activity</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = row.id === previewId;
            return (
              <tr
                key={row.id}
                aria-selected={selected}
                className={`group border-b border-border/70 transition-colors last:border-b-0 motion-reduce:transition-none ${
                  selected
                    ? "bg-primary/[0.07]"
                    : "focus-within:bg-accent/60 hover:bg-accent/60"
                }`}
              >
                <Td>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Initials
                      name={row.name}
                      className="size-7 text-[0.625rem]"
                    />
                    <div className="min-w-0">
                      {/*
                        The whole name is the link, and the row is not. A
                        clickable row swallows text selection and gives a
                        keyboard user one target with no name.
                      */}
                      <a
                        href="#lead-detail-preview"
                        className="block truncate font-medium hover:underline"
                        onClick={(event) => event.preventDefault()}
                      >
                        {row.name}
                      </a>
                      <p className="truncate text-xs text-muted-foreground @min-[64rem]/list:hidden">
                        {[row.phone, row.email].filter(Boolean).join(" · ") ||
                          "No contact details"}
                      </p>
                    </div>
                  </div>
                </Td>

                <Td className="@max-[64rem]/list:hidden">
                  <div className="grid min-w-0 gap-0.5 text-muted-foreground">
                    {row.phone ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Phone
                          className="size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate">{row.phone}</span>
                      </span>
                    ) : null}
                    {row.email ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Mail
                          className="size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="truncate">{row.email}</span>
                      </span>
                    ) : null}
                    {!row.phone && !row.email ? (
                      <span className="text-xs">No contact details</span>
                    ) : null}
                  </div>
                </Td>

                <Td>
                  <StatusBadge
                    tone={stageTone(stageById(row.stageId)?.kind ?? "active")}
                    label={row.stageName}
                  />
                </Td>

                <Td>
                  <span className="flex min-w-0 items-center gap-2">
                    <Initials
                      name={ownerFullName(row)}
                      muted
                      className="size-6 text-[0.5625rem]"
                    />
                    <span className="truncate text-muted-foreground">
                      {ownerNameOf(row)}
                    </span>
                  </span>
                </Td>

                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <span className="truncate text-xs text-muted-foreground">
                      {dayLabel(row.updatedAt)}
                    </span>
                    {/*
                      Revealed on hover, as HubSpot's index page does — but
                      present for the keyboard at all times, because
                      `opacity-0` still leaves a control focusable and it
                      becomes visible the moment it takes focus. A control
                      that only exists for a mouse is not a control.
                    */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Preview ${row.name}`}
                          aria-expanded={row.id === previewId}
                          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 motion-reduce:transition-none"
                          onClick={() => onPreview(row.id)}
                        >
                          <PanelRightOpen
                            className="size-4"
                            aria-hidden="true"
                          />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Preview without leaving the list
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`min-w-0 px-3 py-2.5 align-middle ${className ?? ""}`}>
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ */
/* Phone cards                                                         */
/* ------------------------------------------------------------------ */

function PhoneCards({
  rows,
  previewId,
  onPreview,
}: {
  rows: readonly SampleRow[];
  previewId: string | null;
  onPreview: (id: string) => void;
}) {
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 @min-[44rem]/list:hidden">
      {rows.map((row) => (
        <li
          key={row.id}
          className={`surface-solid rounded-xl transition-colors motion-reduce:transition-none ${
            row.id === previewId ? "ring-2 ring-ring" : ""
          }`}
        >
          <div className="flex items-start gap-3 p-3">
            <Initials name={row.name} className="mt-0.5 size-9 text-xs" />

            {/*
              The whole block is the link, which is how a card behaves on a
              phone and what makes the target comfortable. The name alone was
              a 24px-tall text link.
            */}
            <a
              href="#lead-detail-preview"
              className="-m-1 min-w-0 flex-1 rounded-md p-1"
              onClick={(event) => event.preventDefault()}
            >
              <span className="block truncate font-medium">{row.name}</span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <StatusBadge
                  tone={stageTone(stageById(row.stageId)?.kind ?? "active")}
                  label={row.stageName}
                />
                <span className="truncate text-xs text-muted-foreground">
                  {ownerNameOf(row)}
                </span>
              </span>
              {row.phone || row.email ? (
                <span className="mt-1.5 block truncate text-xs text-muted-foreground">
                  {[row.phone, row.email].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </a>

            {/*
              Two 44px targets, labelled, no hover required — the brief's
              "essential mobile actions must remain understandable without
              hover". Calling is the one outbound action this product can
              perform, so it earns a place on the card.
            */}
            {/*
              44px of TARGET, 16px of icon. The brief asks for comfortable
              phone targets without bigger icons, which is a padding change
              rather than an icon change — these were 36x36.
            */}
            <div className="flex shrink-0 flex-col gap-0.5">
              {row.phone ? (
                <Button
                  asChild
                  size="icon"
                  variant="ghost"
                  className="size-11"
                  aria-label={`Call ${row.name}`}
                >
                  <a href={`tel:${row.phone}`}>
                    <Phone className="size-4" aria-hidden="true" />
                  </a>
                </Button>
              ) : null}
              <Button
                size="icon"
                variant="ghost"
                className="size-11"
                aria-label={`Preview ${row.name} without leaving the list`}
                aria-expanded={row.id === previewId}
                onClick={() => onPreview(row.id)}
              >
                <PanelRightOpen className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
