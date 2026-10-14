import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import type { RuntimeDbTx, RuntimeTx } from "./client";
import type { TenantContext } from "./tenant-context";

/**
 * The transaction in flight for the current async execution path.
 *
 * **Internal to the two gateways.** `withTenant()` and `withTenantDb()` are the
 * supported entry points; nothing else may import this module, because the
 * store holds a live transaction handle and a mutable view of it would let a
 * caller run statements outside the gateway that established the context. An
 * ESLint restriction enforces that, the same way it does for `./client`.
 *
 * AsyncLocalStorage rather than a module-level variable: a module-level value
 * would be shared by every concurrent request on the server and would produce
 * exactly the cross-tenant bleed this design exists to prevent. Storage is
 * per-async-context, server-only, and carries no value once the callback
 * returns.
 *
 * One store serves both gateways deliberately. Two stores would each be blind
 * to the other, so a `withTenantDb()` nested inside a `withTenant()` would open
 * a second transaction on a second pooled connection while the first was still
 * open — two tenant contexts in flight at once, which is the failure this
 * design exists to prevent.
 */

/** Which gateway opened the transaction, and the handle it owns. */
export type ActiveScope =
  | {
      readonly gateway: "sql";
      readonly context: TenantContext;
      readonly tx: RuntimeTx;
    }
  | {
      readonly gateway: "drizzle";
      readonly context: TenantContext;
      readonly tx: RuntimeDbTx;
    };

export type GatewayName = ActiveScope["gateway"];

/** The human name of each gateway, for error messages only. */
const GATEWAY_LABEL: Record<GatewayName, string> = {
  sql: "withTenant()",
  drizzle: "withTenantDb()",
};

const SCOPE = new AsyncLocalStorage<ActiveScope>();

/** The transaction in flight, if any. Read-only by construction. */
export function activeScope(): ActiveScope | undefined {
  return SCOPE.getStore();
}

/** Run `fn` with `scope` established for the current async execution path. */
export function runInScope<T>(scope: ActiveScope, fn: () => T): T {
  return SCOPE.run(scope, fn);
}

/**
 * Raised when one gateway is nested inside the other.
 *
 * The two gateways cannot share a transaction: `withTenant()` hands out a
 * postgres.js `TransactionSql`, and Drizzle's `drizzle()` factory cannot be
 * built over one — it writes type parsers to `client.options`, which a
 * transaction handle does not have. Opening a second transaction instead would
 * put two tenant contexts on two pooled connections at the same time, so this
 * throws before any statement runs. Use one gateway for the whole operation.
 */
export class TenantGatewayConflict extends Error {
  readonly outer: GatewayName;
  readonly inner: GatewayName;

  constructor(outer: GatewayName, inner: GatewayName) {
    // No identifiers in the message: which gateways disagreed is the useful
    // part, and the context values are tenant data.
    super(
      `tenant gateway conflict: ${GATEWAY_LABEL[inner]} was called inside a ` +
        `${GATEWAY_LABEL[outer]} transaction. The two gateways cannot share a ` +
        `transaction, and opening a second one would run two tenant contexts ` +
        `at once. Use one gateway for the whole operation.`,
    );
    this.name = "TenantGatewayConflict";
    this.outer = outer;
    this.inner = inner;
  }
}

/** The three identifiers compared when deciding whether a nested call matches. */
export const CONTEXT_FIELDS = [
  "authUserId",
  "userProfileId",
  "workspaceId",
] as const;
