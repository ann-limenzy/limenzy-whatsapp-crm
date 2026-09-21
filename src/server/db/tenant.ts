import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { runtimeSql, type RuntimeTx } from "./client";
import { isIssuedTenantContext, type TenantContext } from "./tenant-context";

/**
 * The tenant gateway: the only supported way to run a tenant-scoped query.
 *
 * Every protected statement runs inside one transaction that first establishes
 * three transaction-local settings. The Phase-2 policies read exactly those
 * settings, so a query run outside this gateway sees NULL context and returns
 * nothing — fail-closed, by design.
 *
 * The third argument to `set_config` is `true`, which makes each setting
 * transaction-local (`SET LOCAL`). A session-scoped `SET` would survive the
 * transaction and leak the tenant to whichever request borrowed the same pooled
 * connection next. That is the single most dangerous mistake available in this
 * architecture, and the live suite proves it does not happen by forcing
 * physical connection reuse on a pool of size one.
 *
 * What this gateway is not: it does not authenticate anybody, and it does not
 * decide which workspace a request belongs to. It trusts the context it is
 * given, which is why `createTenantContext()` is a restricted boundary and why
 * Phase 4's resolver must verify identity and active membership before issuing
 * one.
 */

/** The three fixed setting names. Never assembled from input. */
const SETTINGS = {
  authUserId: "app.auth_user_id",
  userProfileId: "app.user_profile_id",
  workspaceId: "app.workspace_id",
} as const;

/**
 * The handle given to callbacks.
 *
 * Deliberately the transaction type, not the pool type: it genuinely lacks
 * `end`, `END`, `CLOSE`, `options`, `listen` and `reserve`, so a callback
 * cannot close the pool, open a second connection, or read the connection
 * options. The narrower type is the guarantee, not a cast.
 */
export type TenantTx = RuntimeTx;

export class TenantContextConflict extends Error {
  readonly field: "authUserId" | "userProfileId" | "workspaceId";

  constructor(field: TenantContextConflict["field"]) {
    // No identifiers in the message: which field disagreed is the useful part,
    // and the values are tenant data.
    super(
      `tenant context conflict: a nested withTenant() call supplied a different ` +
        `${field} than the transaction already running. Nested calls must reuse ` +
        `the same context.`,
    );
    this.name = "TenantContextConflict";
    this.field = field;
  }
}

export class TenantContextUntrusted extends Error {
  constructor() {
    super(
      "withTenant() requires a context issued by createTenantContext(); a " +
        "plain object is not accepted.",
    );
    this.name = "TenantContextUntrusted";
  }
}

type ActiveScope = { context: TenantContext; tx: TenantTx };

/**
 * The transaction in flight for the current async execution path.
 *
 * AsyncLocalStorage rather than a module-level variable: a module-level value
 * would be shared by every concurrent request on the server and would produce
 * exactly the cross-tenant bleed this design exists to prevent. Storage is
 * per-async-context, server-only, and carries no value once the callback
 * returns.
 */
const SCOPE = new AsyncLocalStorage<ActiveScope>();

/**
 * Run `fn` inside one transaction carrying the given tenant context.
 *
 * Nesting: a nested call with an identical context reuses the outer
 * transaction — no second transaction, no second `set_config`, the same handle.
 * A nested call whose context differs in any of the three identifiers throws
 * `TenantContextConflict` **before** the callback runs, so no statement is ever
 * executed under a context the caller did not intend.
 */
export async function withTenant<T>(
  context: TenantContext,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  // Authenticity first: a forged object never reaches the database.
  if (!isIssuedTenantContext(context)) throw new TenantContextUntrusted();

  const active = SCOPE.getStore();
  if (active) {
    // Compare before anything executes, so a conflicting nested call cannot
    // run a single statement under a context the caller did not intend.
    for (const field of [
      "authUserId",
      "userProfileId",
      "workspaceId",
    ] as const) {
      if (active.context[field] !== context[field]) {
        throw new TenantContextConflict(field);
      }
    }
    // Same tenant: reuse the running transaction exactly as it is. No second
    // BEGIN, no second set_config.
    return fn(active.tx);
  }

  return runtimeSql().begin(async (tx) => {
    // Fixed names, bound values. Nothing here is assembled from caller input.
    await tx`select set_config(${SETTINGS.authUserId}, ${context.authUserId}, true)`;
    await tx`select set_config(${SETTINGS.userProfileId}, ${context.userProfileId}, true)`;
    await tx`select set_config(${SETTINGS.workspaceId}, ${context.workspaceId}, true)`;

    // Only `tx` crosses into the callback: the pool is not reachable from it.
    return SCOPE.run({ context, tx }, () => fn(tx));
  }) as T;
}
