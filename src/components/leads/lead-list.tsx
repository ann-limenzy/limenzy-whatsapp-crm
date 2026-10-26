"use client";

import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  Search,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { StatusBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
 * linked to, reloaded and gone back to.
 *
 * The list is paged on the server, and the page number lives in the URL
 * alongside the scope and the search term. The count shown is the count of
 * everything that matches, not the length of this page — a screen that says
 * "50 leads" while the workspace holds 300 is simply wrong, and that is what
 * the old fixed 200-row ceiling said.
 */

export type LeadScope = "all" | "mine";

export function LeadList({
  leads,
  total,
  page,
  pageCount,
  pageSize,
  ownerNames,
  scope,
  search,
  canAdd,
  defaultsToMine,
}: {
  leads: readonly LeadListItem[];
  /** Every matching lead, not this page. */
  total: number;
  /** 1-based, already clamped by the server. */
  page: number;
  pageCount: number;
  pageSize: number;
  ownerNames: Readonly<Record<string, string>>;
  scope: LeadScope;
  search: string;
  canAdd: boolean;
  /** §31: Staff/Sales default to My Leads unless their permissions are wider. */
  defaultsToMine: boolean;
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

  const navigate = (next: {
    scope?: LeadScope;
    search?: string;
    page?: number;
  }) => {
    const query = new URLSearchParams(params.toString());
    const nextScope = next.scope ?? scope;
    const nextSearch = next.search ?? box.current?.value ?? search;
    if (nextScope === (defaultsToMine ? "mine" : "all")) query.delete("scope");
    else query.set("scope", nextScope);
    if (nextSearch.trim().length === 0) query.delete("q");
    else query.set("q", nextSearch.trim());
    /*
     * Changing the scope or the search changes WHAT matches, so the page
     * number that came with the old filter means nothing against the new one
     * — staying on page 4 of a search with two results shows an empty screen
     * that looks like "no matches". Only an explicit page move keeps a page.
     */
    if (next.page !== undefined && next.page > 1) {
      query.set("page", String(next.page));
    } else {
      query.delete("page");
    }
    startTransition(() => {
      router.push(`${pathname}${query.size > 0 ? `?${query}` : ""}`);
    });
  };

  const firstOnPage = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastOnPage = (page - 1) * pageSize + leads.length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <form
          className="flex min-w-0 flex-1 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            navigate({ search: box.current?.value ?? "" });
          }}
        >
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="lead-search">Search leads</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                key={search}
                id="lead-search"
                ref={box}
                defaultValue={search}
                placeholder="Name, phone or email"
                className="h-9 pl-9"
                type="search"
              />
            </div>
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            Search
          </Button>
        </form>

        <div
          className="flex items-center gap-1 rounded-lg border border-border p-1"
          role="group"
          aria-label="Which leads to show"
        >
          {(["all", "mine"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={scope === option ? "default" : "ghost"}
              aria-pressed={scope === option}
              onClick={() => navigate({ scope: option })}
            >
              {option === "all" ? "All" : "My leads"}
            </Button>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {pending
          ? "Loading leads"
          : total === 0
            ? "No leads shown"
            : `Showing ${firstOnPage} to ${lastOnPage} of ${total} lead${
                total === 1 ? "" : "s"
              }`}
      </p>

      {leads.length === 0 ? (
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
        <ul className="grid gap-2" data-pending={pending ? "true" : undefined}>
          {leads.map((lead) => (
            <li
              key={lead.id}
              className="rounded-lg border border-border transition-colors hover:border-foreground/20"
            >
              <Link
                href={`/leads/${lead.id}`}
                className="grid gap-2 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-4"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {lead.name}
                  </span>
                  <span className="block text-xs text-muted-foreground sm:hidden">
                    {[lead.phone, lead.email].filter(Boolean).join(" · ") ||
                      "No contact details"}
                  </span>
                </span>

                <span className="hidden min-w-0 text-sm text-muted-foreground sm:block">
                  {lead.phone ? (
                    <span className="flex items-center gap-1.5 truncate">
                      <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                      {lead.phone}
                    </span>
                  ) : null}
                  {lead.email ? (
                    <span className="flex items-center gap-1.5 truncate">
                      <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                      {lead.email}
                    </span>
                  ) : null}
                </span>

                <span className="min-w-0">
                  <StatusBadge
                    tone={lead.stageIsActive ? "info" : "neutral"}
                    label={lead.stageName}
                  />
                </span>

                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {lead.isOwnedByActor
                    ? "You"
                    : (ownerNames[lead.recordOwnerUserProfileId] ??
                      "Another team member")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/*
        The pager is rendered whenever more than one page exists. The count
        beside it is the count of everything that matches, so a reader can
        tell at a glance that there is more behind the arrows.
      */}
      {pageCount > 1 ? (
        <nav
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
          aria-label="Lead list pages"
        >
          <p className="text-sm text-muted-foreground">
            Showing <strong className="font-medium">{firstOnPage}</strong>–
            <strong className="font-medium">{lastOnPage}</strong> of{" "}
            <strong className="font-medium">{total}</strong>
          </p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || page <= 1}
              onClick={() => navigate({ page: page - 1 })}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              Page {page} of {pageCount}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending || page >= pageCount}
              onClick={() => navigate({ page: page + 1 })}
            >
              Next
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
