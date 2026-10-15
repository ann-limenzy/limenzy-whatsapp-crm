/**
 * Paging for the Settings → Users list — spec §159.
 *
 * Deliberately tiny, and deliberately not a framework. §159 describes one
 * table; what it needs is a page size, a clamp and two links. A pagination
 * library would bring sorting, filtering and URL-state machinery that nothing
 * here asks for.
 *
 * **Why page at all.** Each address on screen costs one Auth Admin request,
 * so the cost of rendering has to be bounded by something. Paging bounds it
 * by what is *displayed* rather than by refusing to show large workspaces: no
 * member is ever unreachable, they are simply on a later page.
 *
 * The slice is taken in the application rather than in SQL on purpose. The
 * routine returns a handful of narrow columns already ordered by name, and
 * adding limit/offset to a SECURITY DEFINER routine would mean another
 * migration and another set of arguments to validate for no benefit at this
 * size. Revisit if a workspace ever has thousands of members.
 */

/**
 * How the address lookup went for a page of members.
 *
 * Lives here, beside the paging types, rather than in
 * `server/auth/member-emails.ts` — that module is `server-only`, and a client
 * component must not import from it even for a type. An `import type` would
 * be erased and would happen to work, but it would leave a client file one
 * careless edit away from pulling a privileged module into the browser bundle.
 */
export type MemberEmailStatus =
  /** Every requested id was resolved. */
  | "ok"
  /** Some resolved, some did not. */
  | "partial"
  /** Nothing resolved: the API was unreachable or refused. */
  | "unavailable"
  /** No secret key is configured in this environment. */
  | "not_configured";

/** Rows per page. Modest, because each one costs a lookup. */
export const MEMBERS_PER_PAGE = 25;

export type MemberPage<T> = {
  readonly items: readonly T[];
  /** 1-based, already clamped to what exists. */
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
};

/**
 * Read a page number from a query string.
 *
 * Anything that is not a positive integer — absent, empty, `0`, `-3`, `2.5`,
 * `"abc"`, an array from a repeated parameter — is page 1. A bad page number
 * is a typo, not an error worth a screen.
 */
export function parsePageParam(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return 1;
  if (!/^\d+$/.test(raw)) return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/**
 * Take one page out of an ordered list.
 *
 * A page beyond the end clamps to the last page rather than showing nothing,
 * so a stale link or a member removed since the page was rendered lands
 * somewhere useful.
 */
export function pageOf<T>(
  items: readonly T[],
  requested: number,
  perPage: number = MEMBERS_PER_PAGE,
): MemberPage<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, requested), pageCount);
  const start = (page - 1) * perPage;

  return {
    items: items.slice(start, start + perPage),
    page,
    pageCount,
    total,
    hasPrevious: page > 1,
    hasNext: page < pageCount,
  };
}
