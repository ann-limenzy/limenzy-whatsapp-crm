import "server-only";

import { sql } from "drizzle-orm";

import { runtimeDb, type RuntimeDbTx } from "./client";
import { TenantContextConflict, TenantContextUntrusted } from "./tenant";
import {
  CONTEXT_FIELDS,
  TenantGatewayConflict,
  activeScope,
  runInScope,
} from "./tenant-scope";
import { isIssuedTenantContext, type TenantContext } from "./tenant-context";

/**
 * The tenant gateway for Drizzle queries.
 *
 * Identical in purpose to `withTenant()` in `./tenant`: one transaction, the
 * three tenant settings established before any caller statement, fail-closed
 * policies doing the rest. The difference is only the handle the callback
 * receives — a Drizzle transaction instead of a postgres.js one.
 *
 * **Why a second gateway rather than a flag on the first.** Drizzle's
 * `drizzle()` factory writes type parsers to `client.options`, and a postgres.js
 * `TransactionSql` has no `options` — it is built by an inner `Sql(handler)`
 * that assigns only `types`, `typed`, `unsafe`, `notify`, `array`, `json` and
 * `file`. So a Drizzle handle cannot be constructed over a transaction that
 * `withTenant()` already opened. What Drizzle *does* support is opening the
 * transaction itself: its `transaction()` calls postgres.js `begin()` and
 * builds its session over the resulting transaction client. This gateway uses
 * that supported path, which is why it owns its transaction outright.
 *
 * Both gateways run on the same restricted runtime pool (`limenzy_app`, no
 * BYPASSRLS, verified TLS, `prepare: false`), share one transaction scope, and
 * set the same three settings, so neither is a privileged route around the
 * other.
 */

/** The three fixed setting names. Never assembled from input. */
const SETTINGS = {
  authUserId: "app.auth_user_id",
  userProfileId: "app.user_profile_id",
  workspaceId: "app.workspace_id",
} as const;

/** The handle given to callbacks: a Drizzle transaction, not the database. */
export type TenantDbTx = RuntimeDbTx;

export { TenantGatewayConflict } from "./tenant-scope";

/**
 * Run `fn` inside one transaction carrying the given tenant context, with a
 * Drizzle handle.
 *
 * Nesting behaves exactly as `withTenant()` does: an identical context reuses
 * the running transaction, a differing context throws `TenantContextConflict`
 * before the callback runs, and a call made while the *other* gateway owns the
 * transaction throws `TenantGatewayConflict` rather than opening a second one.
 */
export async function withTenantDb<T>(
  context: TenantContext,
  fn: (tx: TenantDbTx) => Promise<T>,
): Promise<T> {
  // Authenticity first: a forged object never reaches the database.
  if (!isIssuedTenantContext(context)) throw new TenantContextUntrusted();

  const active = activeScope();
  if (active) {
    // Compare before anything executes, so a conflicting nested call cannot
    // run a single statement under a context the caller did not intend.
    for (const field of CONTEXT_FIELDS) {
      if (active.context[field] !== context[field]) {
        throw new TenantContextConflict(field);
      }
    }
    if (active.gateway !== "drizzle") {
      throw new TenantGatewayConflict(active.gateway, "drizzle");
    }
    // Same tenant, same gateway: reuse the running transaction exactly as it
    // is. No second BEGIN, no second set_config.
    return fn(active.tx);
  }

  return runtimeDb().transaction(async (tx) => {
    // Fixed names, bound values. `sql` interpolation parameterises both, so
    // nothing here is assembled from caller input. `true` makes each setting
    // transaction-local: a plain SET would leak the workspace to whichever
    // request borrowed the same pooled connection next.
    await tx.execute(
      sql`select set_config(${SETTINGS.authUserId}, ${context.authUserId}, true)`,
    );
    await tx.execute(
      sql`select set_config(${SETTINGS.userProfileId}, ${context.userProfileId}, true)`,
    );
    await tx.execute(
      sql`select set_config(${SETTINGS.workspaceId}, ${context.workspaceId}, true)`,
    );

    // Only `tx` crosses into the callback: the pool is not reachable from it.
    return runInScope({ gateway: "drizzle", context, tx }, () => fn(tx));
  });
}
