import "server-only";

import {
  resolveVerifiedIdentity,
  type ResolvedMembership,
  type WorkspaceRole,
} from "@/server/db/identity";
import {
  createTenantContext,
  type TenantContext,
} from "@/server/db/tenant-context";

/**
 * Workspace selection: turning "who is this?" into "which workspace may they
 * act in, right now?".
 *
 * Phase 4A answered the first question and deliberately stopped there. This is
 * the second half of the bridge: it takes the memberships Phase 4A read from
 * the database, validates an *optional* workspace the caller would like to use
 * against them, and only then mints the `TenantContext` that `withTenant()`
 * requires.
 *
 * **The candidate is a preference, never authorization.** It is typed
 * `unknown` because it is expected to arrive from a cookie, a URL or a form in
 * some later phase, and nothing about holding a workspace UUID grants anything.
 * Every candidate is checked against memberships that were read under row-level
 * security as the signed-in user; a workspace that is not in that list is
 * refused whether it is malformed, stale, foreign, inactive or invented, and
 * the four are indistinguishable from the outside.
 *
 * **It reads no request and performs no navigation.** No cookies, no headers,
 * no redirects, no UI. It returns a plain discriminated result and leaves every
 * one of those decisions to the layer above, which does not exist yet.
 *
 * The role it returns is a request-scoped snapshot for application decisions —
 * which buttons to render, which action to allow. It is never cached, and it is
 * never the thing that protects a row: the database policies re-check the
 * membership on every statement, using the context this function issues.
 */

/** One workspace the user could choose. Nothing here is a default. */
export type WorkspaceChoice = {
  readonly workspaceId: string;
  readonly role: WorkspaceRole;
};

export type WorkspaceResolution =
  /** No verified session, or one this application will not act on. */
  | { readonly kind: "unauthenticated" }
  /** Verified user with no profile yet. Phase 4C creates the first one. */
  | { readonly kind: "onboarding_required" }
  /**
   * A profile exists, but it has no active membership anywhere.
   *
   * Deliberately NOT onboarding: this is most likely someone who was removed
   * from every workspace (spec §159/§160 deactivate rather than delete), and
   * sending them to create a workspace would be the wrong answer to the wrong
   * question.
   */
  | { readonly kind: "access_unavailable" }
  /** Several active memberships and no candidate. The caller must choose. */
  | {
      readonly kind: "workspace_selection_required";
      readonly choices: readonly WorkspaceChoice[];
    }
  /** A candidate was supplied and is not an active membership of this user. */
  | { readonly kind: "forbidden" }
  /** Validated. The context is genuine and the role came from the database. */
  | {
      readonly kind: "ok";
      readonly context: TenantContext;
      readonly role: WorkspaceRole;
    };

/**
 * The database returned something this layer refuses to interpret.
 *
 * Distinct from `forbidden`, which is a normal answer to a normal request. This
 * is "the data underneath is not the shape it is supposed to be", and guessing
 * what was meant is exactly how a user ends up in the wrong workspace. Like
 * Phase 4A's error it carries no identifier, no SQL and no connection detail.
 */
export class WorkspaceResolutionError extends Error {
  readonly reason: "membership_invalid";

  constructor(detail: string) {
    super(`workspace resolution: ${detail}`);
    this.name = "WorkspaceResolutionError";
    this.reason = "membership_invalid";
  }
}

/** The repository's canonical form: lower-case RFC 4122, no trimming. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ROLES: readonly WorkspaceRole[] = [
  "owner_admin",
  "manager",
  "staff_sales",
];

const UNAUTHENTICATED: WorkspaceResolution = Object.freeze({
  kind: "unauthenticated",
});
const ONBOARDING_REQUIRED: WorkspaceResolution = Object.freeze({
  kind: "onboarding_required",
});
const ACCESS_UNAVAILABLE: WorkspaceResolution = Object.freeze({
  kind: "access_unavailable",
});
/**
 * One shared, frozen refusal.
 *
 * Every rejected candidate returns this exact value, so nothing — not a field,
 * not a message, not an object identity — can distinguish "that workspace does
 * not exist" from "it exists and is not yours" from "your membership there was
 * deactivated". The caller learns only that this workspace is not available to
 * them.
 */
const FORBIDDEN: WorkspaceResolution = Object.freeze({ kind: "forbidden" });

/**
 * Validate what Phase 4A handed back, without repairing any of it.
 *
 * Phase 4A already validates its own output, so nothing here should ever fire.
 * That is the point: if it does, the contract between the two has broken, and
 * the safe response to "the membership data is not what it should be" is to
 * refuse rather than to pick something plausible.
 */
function checkedMemberships(
  memberships: readonly ResolvedMembership[],
): readonly ResolvedMembership[] {
  if (!Array.isArray(memberships)) {
    throw new WorkspaceResolutionError("memberships are not a list");
  }
  // Phase 4A freezes what it returns. A mutable list means the value has been
  // rebuilt or tampered with somewhere between there and here.
  if (!Object.isFrozen(memberships)) {
    throw new WorkspaceResolutionError("memberships are mutable");
  }

  const seen = new Set<string>();
  for (const membership of memberships) {
    if (
      typeof membership !== "object" ||
      membership === null ||
      !Object.isFrozen(membership)
    ) {
      throw new WorkspaceResolutionError("a membership is not a frozen record");
    }
    const { workspaceId, role } = membership;
    if (typeof workspaceId !== "string" || !UUID.test(workspaceId)) {
      throw new WorkspaceResolutionError("a membership workspace is malformed");
    }
    if (!ROLES.includes(role)) {
      throw new WorkspaceResolutionError("a membership role is unknown");
    }
    // Two active rows for one workspace would make "which role?" ambiguous,
    // and the more permissive answer is never the safe one.
    if (seen.has(workspaceId)) {
      throw new WorkspaceResolutionError("a workspace appears twice");
    }
    seen.add(workspaceId);
  }
  return memberships;
}

function checkedIdentifier(field: string, value: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new WorkspaceResolutionError(`the ${field} is malformed`);
  }
  return value;
}

/**
 * The candidate, reduced to either "none supplied" or a canonical UUID string.
 *
 * `undefined` — and only `undefined` — means none was supplied. Everything else
 * was an attempt to choose: `null`, `""`, `"  "`, an upper-case or padded UUID,
 * a number, an object, a SQL fragment. None of them is repaired, because a
 * candidate that needs repairing did not come from a list this user was given.
 */
function readCandidate(candidate: unknown): {
  supplied: boolean;
  workspaceId: string | null;
} {
  if (candidate === undefined) return { supplied: false, workspaceId: null };
  if (typeof candidate !== "string" || !UUID.test(candidate)) {
    return { supplied: true, workspaceId: null };
  }
  return { supplied: true, workspaceId: candidate };
}

/**
 * Resolve the workspace this request may act in.
 *
 * The only parameter is the untrusted candidate. Identity is not a parameter
 * and cannot be: it comes from Phase 4A, which reads the signature-verified
 * access token itself. A caller may say *which* workspace it would like; it may
 * never say who it is, what its profile is, or what role it holds.
 */
export async function resolveWorkspaceContext(
  candidate?: unknown,
): Promise<WorkspaceResolution> {
  // Phase 4A's IdentityResolutionError already carries no connection string,
  // SQL or identifier, so it propagates unchanged rather than being re-wrapped
  // into something that would have to be kept safe all over again.
  const identity = await resolveVerifiedIdentity();

  if (identity.kind === "unauthenticated") return UNAUTHENTICATED;
  if (identity.kind === "onboarding_required") {
    // Note what is NOT returned: Phase 4A's result carries the Auth user ID,
    // and it stops here. A non-success outcome exposes no identifier.
    return ONBOARDING_REQUIRED;
  }

  const memberships = checkedMemberships(identity.memberships);

  // A profile with no active membership is not a new user. Onboarding would be
  // the wrong destination, and creating a workspace is not this phase's job.
  if (memberships.length === 0) return ACCESS_UNAVAILABLE;

  const wanted = readCandidate(candidate);

  let matched: ResolvedMembership | undefined;
  if (wanted.supplied) {
    // A supplied candidate is matched or refused. There is deliberately no
    // fallback to "some other workspace they do have": silently acting in a
    // workspace the caller did not ask for is its own kind of wrong.
    matched =
      wanted.workspaceId === null
        ? undefined
        : memberships.find((m) => m.workspaceId === wanted.workspaceId);
    if (!matched) return FORBIDDEN;
  } else if (memberships.length === 1) {
    // Exactly one membership: there is nothing to choose between.
    const [only] = memberships;
    if (!only) throw new WorkspaceResolutionError("a membership is missing");
    matched = only;
  } else {
    /**
     * Several memberships and no candidate. Sorted by workspace ID — an
     * arbitrary, stable order that is deterministic for tests and for repeat
     * requests, while carrying no hint of recency, priority or default.
     * Choosing is the caller's, and the ordering must not do it for them.
     */
    const choices = memberships
      .map((m) => Object.freeze({ workspaceId: m.workspaceId, role: m.role }))
      .sort((a, b) => (a.workspaceId < b.workspaceId ? -1 : 1));
    return Object.freeze({
      kind: "workspace_selection_required",
      choices: Object.freeze(choices),
    }) as WorkspaceResolution;
  }

  // Every value below was read from the database under RLS as this user. The
  // caller contributed at most a workspace ID, and only by matching one of
  // these rows exactly.
  const context = createTenantContext({
    authUserId: checkedIdentifier("auth user id", identity.authUserId),
    userProfileId: checkedIdentifier("profile id", identity.userProfileId),
    workspaceId: matched.workspaceId,
  });

  return Object.freeze({
    kind: "ok",
    context,
    // From the matched membership row, never from the caller and never
    // defaulted. RLS re-checks it on every statement regardless.
    role: matched.role,
  }) as WorkspaceResolution;
}
