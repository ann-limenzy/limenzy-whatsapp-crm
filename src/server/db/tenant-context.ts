import "server-only";

/**
 * The trusted tenant-context boundary.
 *
 * This module is separate from `./tenant` for one reason: `withTenant()` must
 * be importable by services and repositories, while the *constructor* below
 * must not be. Keeping them apart lets the import rule restrict construction
 * precisely, instead of restricting the gateway everything needs.
 *
 * **Constructing a context is not authorization.** This module validates shape
 * and issues an authenticated token; it does not verify that the user exists,
 * that the profile belongs to them, or that the membership is active. Phase 4's
 * resolver does that, from verified Supabase claims and a live membership read,
 * and only then calls `createTenantContext()`. Anything that calls it with
 * values it has not itself verified has created a hole that RLS cannot close,
 * because the policies trust the settings this context becomes.
 */

/** Opaque marker. Present only on contexts this module issued. */
declare const brand: unique symbol;

export type TenantContext = {
  readonly [brand]: "TenantContext";
  readonly authUserId: string;
  readonly userProfileId: string;
  readonly workspaceId: string;
};

export class TenantContextError extends Error {
  readonly field: string;

  constructor(field: string, reason: string) {
    // The offending value is deliberately absent: these are identifiers that
    // belong in no log line. The field name is enough to debug with.
    super(`tenant context: ${field} ${reason}`);
    this.name = "TenantContextError";
    this.field = field;
  }
}

/**
 * Canonical RFC 4122 form, lower-case, any version.
 *
 * Deliberately strict rather than "anything Postgres would cast": a value that
 * differs only in case or spacing would produce a different string in the GUC
 * while comparing equal in the database, which is exactly the sort of mismatch
 * that makes an audit trail disagree with reality.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Runtime authenticity — and an honest account of what it is worth.
 *
 * A TypeScript brand is erased at compile time, so `as never` or an object
 * parsed from JSON defeats it entirely. This registry is the runtime check that
 * the type cannot be: only an object this module froze and recorded is accepted
 * by `withTenant()`, so a hand-made object with three perfectly valid UUIDs is
 * rejected, as is a spread copy of a genuine one.
 *
 * **What it does NOT do.** It stops accidental fabrication — a plain object
 * assembled from request data, a context rebuilt from a cache, a copy that lost
 * its provenance. It is not a defence against deliberately malicious code
 * running on the server, which could simply import this module and call
 * `createTenantContext()` with whatever it liked. Nothing in a single process
 * can prevent that.
 *
 * Security is completed by three things outside this file: the exact import
 * boundary in `eslint.config.mjs` and its contract tests, which keep this
 * constructor out of ordinary application code; code review of the few modules
 * permitted to call it; and Phase 4's resolver, which derives all three values
 * from verified Supabase claims and a live membership read before issuing a
 * context. Phase 3 makes no browser input authoritative, because it reads no
 * request at all.
 *
 * A WeakSet keeps no strong reference, so a finished request's context is
 * collected normally.
 */
const ISSUED = new WeakSet<object>();

function requireUuid(field: string, value: unknown): string {
  if (typeof value !== "string")
    throw new TenantContextError(field, "must be a string");
  if (value.length === 0)
    throw new TenantContextError(field, "must not be empty");
  // Deliberately no trimming and no case folding. A trusted caller passes the
  // identifier it read from the database; silently repairing a value here would
  // hide that something upstream handed us a shape it should not have.
  if (!UUID.test(value)) throw new TenantContextError(field, "must be a UUID");
  return value;
}

/**
 * Issue a tenant context.
 *
 * **Trusted boundary — callers must have verified every value first.** Reserved
 * for Phase 4's workspace-context resolver and the database test suites; the
 * import rule in `eslint.config.mjs` and a contract test keep ordinary
 * application code away from it.
 */
export function createTenantContext(input: {
  authUserId: string;
  userProfileId: string;
  workspaceId: string;
}): TenantContext {
  const context = Object.freeze({
    authUserId: requireUuid("authUserId", input.authUserId),
    userProfileId: requireUuid("userProfileId", input.userProfileId),
    workspaceId: requireUuid("workspaceId", input.workspaceId),
  }) as TenantContext;

  ISSUED.add(context);
  return context;
}

/** True only for a context this module issued. Used by the gateway. */
export function isIssuedTenantContext(value: unknown): value is TenantContext {
  return typeof value === "object" && value !== null && ISSUED.has(value);
}
