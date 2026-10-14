import "server-only";

import {
  parseWorkspaceSetup,
  type WorkspaceSetupIssue,
} from "@/lib/validation/workspace-setup";
import { getAuthenticatedUser } from "@/server/auth/require-user";
import { runtimeSql } from "@/server/db/client";

/**
 * Milestone 1C-C Phase 4C-2 - creating a verified user's first tenancy.
 *
 * This is the only TypeScript caller of `app.create_initial_workspace`, the
 * narrow SECURITY DEFINER routine added in Phase 4C-1. Everything privileged
 * happens inside that routine, owned by the NOLOGIN `limenzy_bootstrap` role;
 * this operation contributes exactly two things the database cannot know for
 * itself - the verified identity, and validated business input.
 *
 * **Identity is not a parameter.** The single argument carries business fields
 * only, and is typed `unknown` because it will arrive from a form. The user
 * comes from `getAuthenticatedUser()`, which reads the signature-verified
 * access token via `getClaims()`. There is no overload, no options object and
 * no injection point, so a caller cannot ask this to onboard somebody else.
 *
 * **It mints no context.** A successful bootstrap returns `created` and
 * nothing else - no profile id, no workspace id, no role. The next request
 * resolves its context through Phase 4A/4B exactly as any other request does,
 * which is the only path permitted to hand out a `TenantContext` and the only
 * one that re-reads the membership under row-level security. Redirecting,
 * remembering the choice and rendering a form are later phases.
 */

export type BootstrapResult =
  /** No verified session, or one this application will not act on. */
  | { readonly kind: "unauthenticated" }
  /** The submission was rejected. Field names and safe messages only. */
  | {
      readonly kind: "invalid_input";
      readonly issues: readonly WorkspaceSetupIssue[];
    }
  /** Profile, workspace and active Owner/Admin membership now exist. */
  | { readonly kind: "created" }
  /** A profile with at least one active membership already existed. */
  | { readonly kind: "already_onboarded" }
  /** A profile exists with no active membership. Fails closed by design. */
  | { readonly kind: "access_unavailable" };

/**
 * A failure the caller may surface, carrying nothing a browser should not see.
 *
 * The driver's error is **replaced, never wrapped**: its message can contain
 * the connection string and its `cause` can carry the failing SQL, so neither
 * is attached. `cause` is deliberately left undefined.
 */
export class BootstrapError extends Error {
  readonly reason: "database_unavailable" | "unexpected";

  constructor(reason: BootstrapError["reason"]) {
    super(
      reason === "database_unavailable"
        ? "initial workspace: the database could not be reached"
        : "initial workspace: the database returned an unexpected result",
    );
    this.name = "BootstrapError";
    this.reason = reason;
  }
}

/** Canonical lower-case RFC 4122, matching `identity.ts` and `tenant-context.ts`. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The only setting this operation writes. `app.workspace_id` is absent on purpose. */
const AUTH_USER_ID = "app.auth_user_id";

const UNAUTHENTICATED: BootstrapResult = Object.freeze({
  kind: "unauthenticated",
});
const CREATED: BootstrapResult = Object.freeze({ kind: "created" });
const ALREADY_ONBOARDED: BootstrapResult = Object.freeze({
  kind: "already_onboarded",
});
const ACCESS_UNAVAILABLE: BootstrapResult = Object.freeze({
  kind: "access_unavailable",
});

/**
 * The routine's three outcomes, mapped exhaustively.
 *
 * Anything else - a new word, an empty string, a null - is a broken contract
 * between this file and the migration, not a fourth result kind to invent.
 */
const OUTCOMES: Readonly<Record<string, BootstrapResult>> = Object.freeze({
  created: CREATED,
  already_onboarded: ALREADY_ONBOARDED,
  access_unavailable: ACCESS_UNAVAILABLE,
});

/**
 * Classify a thrown driver error without keeping any of it.
 *
 * Only the SQLSTATE is read, and only to tell "never reached the database"
 * from "the database answered with something we did not expect". The message,
 * the query, the parameters and the cause are all discarded.
 */
function sanitize(error: unknown): BootstrapError {
  if (error instanceof BootstrapError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  const reachedDatabase =
    typeof code === "string" && /^[0-9A-Z]{5}$/.test(code);
  return new BootstrapError(
    reachedDatabase ? "unexpected" : "database_unavailable",
  );
}

/**
 * Create the signed-in user's first profile, workspace and Owner/Admin
 * membership.
 *
 * Takes exactly one argument: the untrusted submission. Returns a frozen
 * discriminated result; throws only `BootstrapError`.
 */
export async function createInitialWorkspace(
  input: unknown,
): Promise<BootstrapResult> {
  // 1. Validate first, so a malformed submission never reaches the database
  //    and never opens a connection.
  const parsed = parseWorkspaceSetup(input);
  if (!parsed.ok) {
    return Object.freeze({
      kind: "invalid_input",
      issues: parsed.issues,
    }) as BootstrapResult;
  }

  // 2. Identity comes from the verified token, never from the submission. The
  //    name in `input` is profile display data and nothing more.
  const user = await getAuthenticatedUser();
  if (!user) return UNAUTHENTICATED;

  // Fail closed on an unconfirmed address: the account exists, but nothing
  // here should create a tenancy for an identity whose owner has not
  // confirmed it.
  if (!user.emailVerified) return UNAUTHENTICATED;

  // `sub` is the only identity input and must already be canonical. Anything
  // else is treated as no identity rather than repaired.
  const authUserId = user.id;
  if (typeof authUserId !== "string" || !UUID.test(authUserId)) {
    return UNAUTHENTICATED;
  }

  // 3. One transaction, one setting, one call.
  try {
    return await runtimeSql().begin(async (tx) => {
      await tx`select set_config(${AUTH_USER_ID}, ${authUserId}, true)`;

      const rows = await tx<{ outcome: string | null }[]>`
        select app.create_initial_workspace(
          ${parsed.value.fullName},
          ${parsed.value.workspaceName},
          ${parsed.value.businessType},
          ${parsed.value.country},
          ${parsed.value.currency},
          ${parsed.value.timeZone}
        ) as outcome`;

      const outcome = rows[0]?.outcome;
      const result =
        typeof outcome === "string" ? OUTCOMES[outcome] : undefined;
      // Throwing here rolls the transaction back, which matters: an
      // unrecognised answer must not leave a half-understood tenancy behind.
      if (!result) throw new BootstrapError("unexpected");
      return result;
    });
  } catch (error) {
    throw sanitize(error);
  }
}
