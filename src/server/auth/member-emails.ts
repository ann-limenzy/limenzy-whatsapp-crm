import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { authAdminEnv, isAuthAdminConfigured } from "@/lib/env";
import type { MemberEmailStatus } from "@/lib/member-list";

/**
 * Current Auth addresses for workspace members — spec §159.
 *
 * ## Why this is not a database join
 *
 * `auth.users` has row-level security enabled with no policies and is owned by
 * `supabase_auth_admin`. No role this project can create is able to read it:
 * the migration role holds USAGE on schema `auth` WITHOUT grant option, so it
 * cannot pass that USAGE to a new role, and it is not a member of the schema
 * owner. Granting the reach another way would have meant `pg_read_all_data`,
 * `BYPASSRLS` on a role with wide SELECT, or a policy on a Supabase-managed
 * table — each far larger than one column is worth. So the addresses come from
 * Supabase's Auth Admin API instead.
 *
 * ## What that costs, stated plainly
 *
 * The application server now holds a PROJECT-WIDE privileged credential. The
 * secret key can administer every Auth user in the project and bypasses
 * row-level security on the Data API. The database-role separation is intact
 * and unchanged — every CRM read and write still goes through `limenzy_app`
 * and `withTenant()` — but it does **not** constrain this credential. What
 * constrains it is this module: it is the only reader of the key, it performs
 * exactly one operation, and it is given ids that the authorised,
 * workspace-scoped routine has already returned.
 *
 * ## Deliberately absent
 *
 *   * no project-wide user listing — that would return every user in the
 *     project, across every workspace, and nothing here needs it;
 *   * no `.from()`, `.rpc()` or `.storage` — this client never touches data;
 *   * no cache of any kind. Addresses are privileged results read fresh for
 *     each request; a cache would outlive the authorisation that justified it.
 */

/** How many lookups may be in flight at once. */
const CONCURRENCY = 6;

/** Per-request budget for the whole batch. */
const TOTAL_TIMEOUT_MS = 8_000;

/** Budget for one lookup. */
const PER_CALL_TIMEOUT_MS = 4_000;

export type MemberEmailLookup = {
  readonly status: MemberEmailStatus;
  /**
   * Auth user id → address. A key is present only when that id was resolved;
   * the value is `null` when the account exists but carries no address.
   */
  readonly emails: ReadonlyMap<string, string | null>;
};

const EMPTY: ReadonlyMap<string, string | null> = new Map();

/**
 * An admin client whose every request is cancellable.
 *
 * `auth.admin.getUserById(id)` takes no options in this version of
 * supabase-js, so there is nowhere to hand it a signal. Passing one there
 * would be silently ignored and the timeout would only abandon a promise
 * while the socket stayed open — which is the failure this is written to
 * avoid, because abandoned requests keep consuming the very concurrency
 * budget they were meant to release.
 *
 * So the signal is bound to the client's `fetch`. Every HTTP request this
 * client makes carries both budgets, and an abort genuinely cancels it.
 *
 * Built per batch rather than memoised. Construction performs no I/O, and a
 * client that closes over one request's signal must not outlive it.
 */
function adminClient(batch: AbortSignal): SupabaseClient {
  const env = authAdminEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            batch,
            AbortSignal.timeout(PER_CALL_TIMEOUT_MS),
            ...(init?.signal ? [init.signal] : []),
          ]),
        }),
    },
  });
}

/**
 * Run `work` over `items` with at most `limit` in flight.
 *
 * Hand-rolled rather than adding a dependency: it is a dozen lines, and a
 * pool library would bring scheduling behaviour nobody here needs.
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const runner = async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await work(items[index]!);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, runner),
  );
  return results;
}

type OneResult =
  | { readonly ok: true; readonly id: string; readonly email: string | null }
  | { readonly ok: false };

/** Resolve one id. Never throws: a missing address must not fail the page. */
async function resolveOne(
  client: SupabaseClient,
  id: string,
): Promise<OneResult> {
  try {
    const { data, error } = await client.auth.admin.getUserById(id);
    if (error) return { ok: false };
    return { ok: true, id, email: data.user?.email ?? null };
  } catch {
    // Network failure, abort, or a client that rejected rather than returning
    // an error.
    return { ok: false };
  }
}

/**
 * Addresses for the given Auth user ids.
 *
 * The caller must already have authorised the request and obtained these ids
 * from `workspaceMembers()`. This function performs no authorisation of its
 * own and cannot: it is given ids, not a workspace, so it has nothing to check
 * them against. That is why its only caller is the Settings page, after both
 * the `manage_users` check and the database routine.
 */
export async function emailsForAuthUsers(
  ids: readonly string[],
): Promise<MemberEmailLookup> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return { status: "ok", emails: EMPTY };

  if (!isAuthAdminConfigured()) {
    return { status: "not_configured", emails: EMPTY };
  }

  const client = adminClient(AbortSignal.timeout(TOTAL_TIMEOUT_MS));
  const settled = await mapWithConcurrency(unique, CONCURRENCY, (id) =>
    resolveOne(client, id),
  );

  const emails = new Map<string, string | null>();
  for (const result of settled) {
    if (result.ok) emails.set(result.id, result.email);
  }

  const status: MemberEmailStatus =
    emails.size === unique.length
      ? "ok"
      : emails.size === 0
        ? "unavailable"
        : "partial";

  return { status, emails };
}
