"use client";

import {
  Columns3,
  Mail,
  PanelRightOpen,
  Phone,
  Rows3,
  Search,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { StatusBadge } from "@/components/data/status-badge";
import { LeadBoard } from "@/components/leads/lead-board";
import { LeadQuickPreview } from "@/components/leads/lead-quick-preview";
import { Initials, formatDay, stageTone } from "@/components/leads/presentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LeadStage } from "@/server/auth/workspace-lead-pipeline";
import type { LeadListItem } from "@/server/auth/workspace-leads";

/**
 * Leads — List View, §31.
 *
 * The quick filters are **All** and **My Leads**. §31 also lists Follow-up
 * Due and No Follow-up, which need follow-ups to exist, and filters by stage,
 * owner, product, date and Sales Team — none of which this slice carries. The
 * two that are here are the two that work.
 *
 * "All" is not a widening. It means everything §162.1 already allows, which
 * for a Staff/Sales user is their own leads anyway — which is also why §31
 * makes My Leads their default view.
 *
 * Search covers lead name, phone and email, as §31 lists. It runs on the
 * server; this component only puts the term in the URL, so a search can be
 * linked to, reloaded and gone back to. **That stays true of the Quick
 * Preview as well**: the preview is local panel state, never a navigation,
 * so opening and closing it cannot disturb a term the URL owns.
 */

export type LeadScope = "all" | "mine";

/** §31's two arrangements of the same leads. Held in the URL, not in state. */
export type LeadView = "list" | "board";

export function LeadList({
  leads,
  ownerNames,
  scope,
  search,
  canAdd,
  defaultsToMine,
  workspaceTimeZone,
  view,
  stages,
  stageTotals,
}: {
  leads: readonly LeadListItem[];
  ownerNames: Readonly<Record<string, string>>;
  scope: LeadScope;
  search: string;
  canAdd: boolean;
  /** §31: Staff/Sales default to My Leads unless their permissions are wider. */
  defaultsToMine: boolean;
  /** §158's zone, so every date on this screen is on the workspace's clock. */
  workspaceTimeZone: string;
  view: LeadView;
  /** The workspace's configured pipeline, for the board's columns. */
  stages: readonly LeadStage[];
  /** True per-stage totals; empty in the list view, which does not need them. */
  stageTotals: ReadonlyMap<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  /*
   * The box is UNCONTROLLED, keyed on the URL's term. Mirroring the prop into
   * state would need an effect to keep the two in step when the URL changes
   * underneath it — the back button — and an effect that calls setState is a
   * cascading render. Remounting on a new key does the same job with no
   * render of its own.
   */
  const box = useRef<HTMLInputElement>(null);

  /*
   * Which Lead the preview is showing. LOCAL state, deliberately: the URL is
   * the list's own, and a panel that can be opened and closed without
   * changing what the list is showing must not write to it.
   */
  const [previewId, setPreviewId] = useState<string | null>(null);
  const scrollAtOpen = useRef(0);
  const openerRef = useRef<HTMLElement | null>(null);

  const openPreview = (id: string, opener: HTMLElement | null) => {
    scrollAtOpen.current = window.scrollY;
    openerRef.current = opener;
    setPreviewId(id);
  };

  /*
   * Closing restores exactly what was there: the search, the scope and the
   * page position are untouched because none of them was ever changed, and
   * focus goes back to the control that opened the panel.
   */
  const closePreview = () => {
    setPreviewId(null);
    const opener = openerRef.current;
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollAtOpen.current, behavior: "auto" });
      opener?.focus();
    });
  };

  const navigate = (next: {
    scope?: LeadScope;
    search?: string;
    view?: LeadView;
  }) => {
    const query = new URLSearchParams(params.toString());
    const nextScope = next.scope ?? scope;
    const nextSearch = next.search ?? box.current?.value ?? search;
    const nextView = next.view ?? view;
    if (nextScope === (defaultsToMine ? "mine" : "all")) query.delete("scope");
    else query.set("scope", nextScope);
    if (nextSearch.trim().length === 0) query.delete("q");
    else query.set("q", nextSearch.trim());
    /* `list` is the default, so it is absent rather than spelled out. */
    if (nextView === "list") query.delete("view");
    else query.set("view", nextView);
    startTransition(() => {
      router.push(`${pathname}${query.size > 0 ? `?${query}` : ""}`);
    });
  };

  const nameOf = (lead: LeadListItem) =>
    lead.isOwnedByActor
      ? "You"
      : (ownerNames[lead.recordOwnerUserProfileId] ?? "Another team member");
  const ownerOf = (lead: LeadListItem) =>
    ownerNames[lead.recordOwnerUserProfileId] ?? "Another team member";

  return (
    <TooltipProvider delayDuration={200}>
      {/*
        `grid-cols-[minmax(0,1fr)]`: a bare `grid` sizes its single column to
        the content's min-content, and a long email address with `nowrap` on
        it makes that wider than a phone. Clamping the track is what keeps
        this page from scrolling sideways.
      */}
      <div className="@container/list grid w-full grid-cols-[minmax(0,1fr)] gap-4">
        {/* ─────────────── Toolbar ─────────────── */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 @min-[44rem]/list:flex @min-[44rem]/list:items-center @min-[44rem]/list:gap-3">
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              navigate({ search: box.current?.value ?? "" });
            }}
          >
            <Label htmlFor="lead-search" className="sr-only">
              Search leads by name, phone or email
            </Label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              key={search}
              id="lead-search"
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
                  navigate({ search: "" });
                }}
              >
                <X className="size-3.5" aria-hidden="true" />
              </Button>
            ) : null}
          </form>

          <div className="flex flex-wrap items-center gap-2">
            {/*
              LIST or BOARD. A radiogroup rather than two toggles: it is one
              choice with two answers, and arrow keys move between them as
              that role promises. The chosen view goes into the URL, so it
              can be linked to and gone back from.
            */}
            <div
              role="radiogroup"
              aria-label="How to show the leads"
              className="surface-glass flex items-center gap-0.5 rounded-lg p-0.5"
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
                  return;
                }
                event.preventDefault();
                navigate({ view: view === "list" ? "board" : "list" });
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
                      disabled={pending}
                      onClick={() => navigate({ view: key })}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      <span>{label}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {key === "list"
                      ? "Table of leads"
                      : "Leads by pipeline stage"}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            <div
              className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5"
              role="group"
              aria-label="Which leads to show"
            >
              {(["all", "mine"] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  className="min-h-11 min-w-11 @min-[44rem]/list:min-h-8 @min-[44rem]/list:min-w-0"
                  variant={scope === option ? "default" : "ghost"}
                  aria-pressed={scope === option}
                  disabled={pending}
                  onClick={() => navigate({ scope: option })}
                >
                  {option === "all" ? "All" : "My leads"}
                </Button>
              ))}
            </div>
          </div>

          <p
            aria-live="polite"
            className="order-last text-xs text-muted-foreground @min-[44rem]/list:order-none @min-[44rem]/list:shrink-0"
          >
            {pending
              ? "Loading leads…"
              : `${leads.length} lead${leads.length === 1 ? "" : "s"}`}
          </p>
        </div>

        {view === "board" ? (
          /*
            The board receives the SAME rows the table would, and its own
            true per-stage totals. Switching view changes how the leads are
            arranged, never which of them are in scope.
          */
          <div
            data-pending={pending ? "true" : undefined}
            className="transition-opacity duration-150 data-[pending=true]:opacity-60 motion-reduce:transition-none"
          >
            <LeadBoard
              leads={leads}
              stages={stages}
              stageTotals={stageTotals}
              ownerNames={ownerNames}
              workspaceTimeZone={workspaceTimeZone}
              previewId={previewId}
              onPreview={openPreview}
              searching={search.trim().length > 0}
              scope={scope}
            />
          </div>
        ) : leads.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title={
              search.trim().length > 0
                ? "No leads match that search"
                : scope === "mine"
                  ? "You have no leads yet"
                  : "No leads yet"
            }
            description={
              search.trim().length > 0
                ? "Try a different name, phone number or email address."
                : canAdd
                  ? "Add your first lead and it will appear here."
                  : "Leads you can see will appear here."
            }
          />
        ) : (
          <div
            data-pending={pending ? "true" : undefined}
            className="transition-opacity duration-150 data-[pending=true]:opacity-60 motion-reduce:transition-none"
          >
            {/* ─────────────── Desktop table ─────────────── */}
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
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      aria-selected={lead.id === previewId}
                      className={`group border-b border-border/70 transition-colors last:border-b-0 motion-reduce:transition-none ${
                        lead.id === previewId
                          ? "bg-primary/[0.07]"
                          : "hover:bg-accent/60 focus-within:bg-accent/60"
                      }`}
                    >
                      <Td>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Initials
                            name={lead.name}
                            className="size-7 text-[0.625rem]"
                          />
                          <div className="min-w-0">
                            {/*
                              The NAME is the link, not the row. A clickable
                              row swallows text selection and gives a keyboard
                              user one target with no accessible name.
                            */}
                            <Link
                              href={`/leads/${lead.id}`}
                              className="block truncate font-medium hover:underline"
                            >
                              {lead.name}
                            </Link>
                            <p className="truncate text-xs text-muted-foreground @min-[64rem]/list:hidden">
                              {[lead.phone, lead.email]
                                .filter(Boolean)
                                .join(" · ") || "No contact details"}
                            </p>
                          </div>
                        </div>
                      </Td>

                      <Td className="@max-[64rem]/list:hidden">
                        <div className="grid min-w-0 gap-0.5 text-muted-foreground">
                          {lead.phone ? (
                            <span className="flex min-w-0 items-center gap-1.5">
                              <Phone
                                className="size-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              <span className="truncate">{lead.phone}</span>
                            </span>
                          ) : null}
                          {lead.email ? (
                            <span className="flex min-w-0 items-center gap-1.5">
                              <Mail
                                className="size-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              <span className="truncate">{lead.email}</span>
                            </span>
                          ) : null}
                          {!lead.phone && !lead.email ? (
                            <span className="text-xs">No contact details</span>
                          ) : null}
                        </div>
                      </Td>

                      <Td>
                        <StatusBadge
                          tone={stageTone(lead.stageKind)}
                          label={lead.stageName}
                        />
                      </Td>

                      <Td>
                        <span className="flex min-w-0 items-center gap-2">
                          <Initials
                            name={ownerOf(lead)}
                            muted
                            className="size-6 text-[0.5625rem]"
                          />
                          <span className="truncate text-muted-foreground">
                            {nameOf(lead)}
                          </span>
                        </span>
                      </Td>

                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <span className="truncate text-xs text-muted-foreground">
                            {formatDay(lead.updatedAt, workspaceTimeZone)}
                          </span>
                          {/*
                            Revealed on hover, but present for the keyboard at
                            all times: `opacity-0` leaves a control focusable,
                            and it becomes visible the moment it takes focus.
                          */}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Preview ${lead.name} without leaving the list`}
                                aria-expanded={lead.id === previewId}
                                className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 motion-reduce:transition-none"
                                onClick={(event) =>
                                  openPreview(lead.id, event.currentTarget)
                                }
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* ─────────────── Phone cards ─────────────── */}
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 @min-[44rem]/list:hidden">
              {leads.map((lead) => (
                <li
                  key={lead.id}
                  className={`surface-solid rounded-xl transition-colors motion-reduce:transition-none ${
                    lead.id === previewId ? "ring-2 ring-ring" : ""
                  }`}
                >
                  <div className="flex items-start gap-3 p-3">
                    <Initials
                      name={lead.name}
                      className="mt-0.5 size-9 text-xs"
                    />

                    {/* The whole block is the link — a comfortable target. */}
                    <Link
                      href={`/leads/${lead.id}`}
                      className="-m-1 min-w-0 flex-1 rounded-md p-1"
                    >
                      <span className="block truncate font-medium">
                        {lead.name}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <StatusBadge
                          tone={stageTone(lead.stageKind)}
                          label={lead.stageName}
                        />
                        <span className="truncate text-xs text-muted-foreground">
                          {nameOf(lead)}
                        </span>
                      </span>
                      {lead.phone || lead.email ? (
                        <span className="mt-1.5 block truncate text-xs text-muted-foreground">
                          {[lead.phone, lead.email].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </Link>

                    {/* 44px of target, 16px of icon. No hover required. */}
                    <div className="flex shrink-0 flex-col gap-0.5">
                      {lead.phone ? (
                        <Button
                          asChild
                          size="icon"
                          variant="ghost"
                          className="size-11"
                          aria-label={`Call ${lead.name}`}
                        >
                          <a href={`tel:${lead.phone}`}>
                            <Phone className="size-4" aria-hidden="true" />
                          </a>
                        </Button>
                      ) : null}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-11"
                        aria-label={`Preview ${lead.name} without leaving the list`}
                        aria-expanded={lead.id === previewId}
                        onClick={(event) =>
                          openPreview(lead.id, event.currentTarget)
                        }
                      >
                        <PanelRightOpen className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {previewId ? (
          <LeadQuickPreview
            /* Remount per Lead, so the panel starts from its loading state. */
            key={previewId}
            leadId={previewId}
            timeZone={workspaceTimeZone}
            onClose={closePreview}
          />
        ) : null}
      </div>
    </TooltipProvider>
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
