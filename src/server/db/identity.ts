import "server-only";

import { getAuthenticatedUser } from "@/server/auth/require-user";

import { runtimeSql } from "./client";

/**
 * Identity-scoped resolution: who is signed in, and which workspaces they are
 * an active member of.
 *
 * This is the first half of the bridge between Supabase authentication and the
 * tenant gateway. It answers only two questions — "which profile is this
 * verified user?" and "which workspaces may they act in?" — and deliberately
 * answers neither "which workspace are they using now?" nor "may they see this
 * row?". Selecting a workspace and minting a `TenantContext` is Phase 4B;
 * creating the first workspace is Phase 4C.
 *
 * **It reads no business data.** The only tables it touches are
 * `user_profiles` and `workspace_memberships`, and it never sets
 * `app.workspace_id`, so the workspace policy matches nothing for the whole of
 * this transaction. It performs no INSERT, UPDATE or DELETE.
 *
 * **Identity is not an argument.** The resolver takes no parameters at all: it
 * obtains the current user from `getAuthenticatedUser()`, which reads the
 * signature-verified access token via `getClaims()`. There is no overload, no
 * options object and no injection point, so a caller cannot ask it to resolve
 * somebody else — the strongest available form of "the browser cannot choose
 * who it is".
 */

/** The three workspace roles, as the database defines them (spec §2, §159). */
export type WorkspaceRole = "owner_admin" | "manager" | "staff_sales";

/**
 * One active membership. Exactly what Phase 4B needs to validate a selection
 * and build a context — nothing more.
 *
 * The workspace's name is deliberately absent: reading it requires
 * `app.workspace_id`, which is precisely the value this slice must not choose.
 * A picker that needs names belongs to Phase 4D, after the selection rules are
 * a product decision rather than an assumption.
 */
export type ResolvedMembership = {
  readonly workspaceId: string;
  /** Read from `workspace_memberships.role`. Never inferred, never defaulted. */
  readonly role: WorkspaceRole;
};

export type IdentityResolution =
  /** No verified session, or one this application will not act on. */
  | { readonly kind: "unauthenticated" }
  /** Verified user, but no `user_profiles` row exists for them yet. */
  | { readonly kind: "onboarding_required"; readonly authUserId: string }
  /** Verified user with a profile. `memberships` may legitimately be empty. */
  | {
      readonly kind: "resolved";
      readonly authUserId: string;
      readonly userProfileId: string;
      readonly memberships: readonly ResolvedMembership[];
    };

/**
 * A failure the caller may surface, carrying nothing a browser should not see.
 *
 * Database errors are replaced rather than wrapped: the driver's message can
 * contain the connection string, and its `cause` can carry the failing SQL.
 * Neither is attached.
 */
export class IdentityResolutionError extends Error {
  readonly reason: "database_unavailable" | "ambiguous_profile";

  constructor(reason: IdentityResolutionError["reason"]) {
    super(
      reason === "database_unavailable"
        ? "identity resolution: the database could not be reached"
        : "identity resolution: more than one profile matched the verified user",
    );
    this.name = "IdentityResolutionError";
    this.reason = reason;
  }
}

/** Fixed setting names. `app.workspace_id` is absent on purpose. */
const SETTINGS = {
  authUserId: "app.auth_user_id",
  userProfileId: "app.user_profile_id",
} as const;

/**
 * Canonical lower-case RFC 4122, matching `tenant-context.ts`.
 *
 * No trimming and no case folding: a `sub` that is not already canonical means
 * something upstream is not what we think it is, and repairing it quietly would
 * hide that.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ROLES: readonly string[] = ["owner_admin", "manager", "staff_sales"];

const UNAUTHENTICATED: IdentityResolution = Object.freeze({
  kind: "unauthenticated",
});

/**
 * Resolve the current verified user's profile and active memberships.
 *
 * Takes no arguments, by design. Returns a frozen result; throws only
 * `IdentityResolutionError`.
 */
export async function resolveVerifiedIdentity(): Promise<IdentityResolution> {
  const user = await getAuthenticatedUser();
  if (!user) return UNAUTHENTICATED;

  // Fail closed on an unverified address. The account exists, but nothing in
  // this application should act on an identity whose owner has not confirmed
  // it. Phase 4B decides what the UI says about that; here it is simply not a
  // usable identity.
  if (!user.emailVerified) return UNAUTHENTICATED;

  // `sub` is the only identity input, and it must already be canonical.
  // Anything else is treated as no identity rather than repaired.
  const authUserId = user.id;
  if (typeof authUserId !== "string" || !UUID.test(authUserId)) {
    return UNAUTHENTICATED;
  }

  try {
    return await runtimeSql().begin(async (tx) => {
      // 1. Only the auth setting. The profile policy keys on exactly this.
      await tx`select set_config(${SETTINGS.authUserId}, ${authUserId}, true)`;

      // 2. No WHERE clause: row-level security is what restricts this to the
      //    caller's own profile, so this query also demonstrates that it does.
      //    If the policy were ever dropped, every profile would return, the
      //    count check below would trip, and this would fail closed rather
      //    than silently resolve somebody else.
      const profiles = await tx<{ id: string }[]>`
        select id from public.user_profiles`;

      if (profiles.length === 0) {
        return Object.freeze({
          kind: "onboarding_required",
          authUserId,
        }) as IdentityResolution;
      }
      if (profiles.length > 1)
        throw new IdentityResolutionError("ambiguous_profile");

      const profile = profiles[0];
      const userProfileId = profile?.id;
      if (typeof userProfileId !== "string" || !UUID.test(userProfileId)) {
        throw new IdentityResolutionError("ambiguous_profile");
      }

      // 3. The profile setting comes from the database result, never from a
      //    caller. The membership policy requires it to agree with the auth
      //    setting against stored data, so a mismatch matches nothing.
      await tx`select set_config(${SETTINGS.userProfileId}, ${userProfileId}, true)`;

      // 4. Own memberships only, active only. `app.workspace_id` is still
      //    unset, so no workspace row is readable from this transaction.
      const rows = await tx<{ workspace_id: string; role: string }[]>`
        select workspace_id, role
          from public.workspace_memberships
         where status = 'active'
         order by created_at asc, workspace_id asc`;

      const memberships = rows.map((row) => {
        if (!ROLES.includes(row.role)) {
          // The column is an enum, so this is unreachable unless the schema
          // changed underneath us. Refusing beats guessing.
          throw new IdentityResolutionError("ambiguous_profile");
        }
        return Object.freeze({
          workspaceId: row.workspace_id,
          role: row.role as WorkspaceRole,
        });
      });

      return Object.freeze({
        kind: "resolved",
        authUserId,
        userProfileId,
        memberships: Object.freeze(memberships),
      }) as IdentityResolution;
    });
  } catch (error) {
    if (error instanceof IdentityResolutionError) throw error;
    // Anything else is a driver or connection failure. Replaced, not wrapped.
    throw new IdentityResolutionError("database_unavailable");
  }
}
