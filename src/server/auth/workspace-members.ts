import "server-only";

import type { WorkspaceRole } from "@/lib/permissions";
import type { MembershipStatus } from "@/lib/validation/users";
import { withTenant } from "@/server/db/tenant";
import type { TenantContext } from "@/server/db/tenant-context";

/**
 * Settings → Users data access — spec §159, §160.
 *
 * Every call goes through `withTenant()`, so the three tenant settings are
 * established before any statement runs, and then through one of the three
 * `app.*` routines the Milestone 2B migration defines. Nothing here issues a
 * statement against `workspace_memberships` or `user_profiles` directly, and
 * `limenzy_app` holds no privilege that would let it.
 *
 * **Why routines rather than policies.** A co-member SELECT policy for
 * `limenzy_app` has to read `workspace_memberships` to learn the reader's own
 * role, and a policy on that table that reads that table recurses —
 * PostgreSQL raises 42P17. The migration header sets this out in full. The
 * consequence here is that the role check lives inside the routine, which
 * re-derives it from stored rows, not from anything the caller passes.
 *
 * **No workspace parameter.** None of these functions takes a workspace id.
 * The routine reads `app.workspace_id`, so there is no argument through which
 * a caller could reach another workspace — the same property the business
 * settings gateway has.
 *
 * The role is NOT checked here. That is the caller's job, from the membership
 * the request resolved. The routine checks it again — twice, once before its
 * locks and once after — and those checks are the ones that cannot be
 * bypassed.
 *
 * ## Concurrency failures
 *
 * The routines are written for READ COMMITTED, which is what the pool uses.
 * Two outcomes can still arrive as exceptions rather than as one of the words
 * a routine returns: 40001 if anything ever runs them at a stricter isolation
 * level, and 40P01 on a genuine deadlock. Both mean the transaction aborted
 * and nothing was written, so both become the ordinary `unavailable` result —
 * no database detail reaches the caller, and nothing is retried. A membership
 * change is not idempotent from the person's point of view; silently
 * re-running one they did not re-request would be worse than telling them it
 * did not save.
 */

export type WorkspaceMember = {
  readonly userProfileId: string;
  /**
   * The Auth account behind this profile — §159's Email is looked up with it.
   *
   * **Server-side only.** It never reaches a client component: the Settings
   * page resolves the address and passes display data onward. `null` when the
   * Auth account was deleted and the profile was kept so history keeps the
   * person's name.
   */
  readonly authUserId: string | null;
  readonly fullName: string;
  readonly role: WorkspaceRole;
  readonly status: MembershipStatus;
  /** True for the signed-in person's own row, resolved by the database. */
  readonly isSelf: boolean;
};

type Row = {
  user_profile_id: string;
  auth_user_id: string | null;
  full_name: string;
  member_role: WorkspaceRole;
  member_status: MembershipStatus;
  is_self: boolean;
};

/**
 * Everyone who holds a membership of the context's workspace — §159.
 *
 * An empty array means the routine returned nothing, which it does both for a
 * workspace with no members (impossible: one always exists) and for a caller
 * who is not an active Owner/Admin. The caller checks the role first, so the
 * second case is the database backstop rather than the expected path.
 *
 * Inactive memberships are included: §159 lists Status as a column and offers
 * Reactivate as an action, so a deactivated person must stay visible.
 */
export async function workspaceMembers(
  context: TenantContext,
): Promise<readonly WorkspaceMember[]> {
  const rows = await withTenant(
    context,
    async (tx) => tx<Row[]>`select * from app.workspace_members()`,
  );
  return rows.map((row) => ({
    userProfileId: row.user_profile_id,
    authUserId: row.auth_user_id,
    fullName: row.full_name,
    role: row.member_role,
    status: row.member_status,
    isSelf: row.is_self,
  }));
}

/**
 * SQLSTATEs that mean "this transaction aborted, nothing was written".
 *
 *   40001  serialization_failure — only reachable at an isolation level
 *          stricter than the READ COMMITTED the routines are written for.
 *   40P01  deadlock_detected — the locks are taken in user_profile_id order
 *          precisely so this should not happen, which is why it is treated as
 *          an unexpected failure rather than a reason to retry.
 */
const ABORTED_SQLSTATES: ReadonlySet<string> = new Set(["40001", "40P01"]);

const isConcurrencyAbort = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code?: unknown }).code === "string" &&
  ABORTED_SQLSTATES.has((error as { code: string }).code);

/**
 * Run a mutation, turning an aborted transaction into the ordinary refusal.
 *
 * Only those two SQLSTATEs are absorbed. Anything else — a missing routine, a
 * lost connection, a permission error — propagates, because those are faults
 * to surface rather than outcomes to report as "could not save".
 */
async function mutate(
  run: () => Promise<string | undefined>,
): Promise<MemberChangeResult> {
  try {
    return toResult(await run());
  } catch (error) {
    if (isConcurrencyAbort(error)) {
      return { ok: false, reason: "unavailable" };
    }
    throw error;
  }
}

/** Every outcome the two mutation routines can report. */
export type MemberChangeResult =
  | { readonly ok: true }
  /** Not an active Owner/Admin of this workspace. */
  | { readonly ok: false; readonly reason: "not_permitted" }
  /** No membership for that profile in this workspace. */
  | { readonly ok: false; readonly reason: "unknown_member" }
  /** The change would leave the workspace with no active Owner/Admin (§159). */
  | { readonly ok: false; readonly reason: "last_owner_admin" }
  /** The role or status submitted is not one the product recognises. */
  | { readonly ok: false; readonly reason: "invalid" }
  /** The routine answered with a word this version does not know. */
  | { readonly ok: false; readonly reason: "unavailable" };

/**
 * Translate the routine's word into a result.
 *
 * An unrecognised word becomes `unavailable` rather than being treated as
 * success. A routine that gained an outcome this build has never heard of is
 * a deployment skew, and the safe reading of it is "something went wrong",
 * never "it worked".
 */
const toResult = (outcome: string | undefined): MemberChangeResult => {
  switch (outcome) {
    case "ok":
      return { ok: true };
    case "not_permitted":
      return { ok: false, reason: "not_permitted" };
    case "unknown_member":
      return { ok: false, reason: "unknown_member" };
    case "last_owner_admin":
      return { ok: false, reason: "last_owner_admin" };
    case "invalid_role":
    case "invalid_status":
      return { ok: false, reason: "invalid" };
    default:
      return { ok: false, reason: "unavailable" };
  }
};

/** Change one member's role — §159 Change Role. */
export async function setMemberRole(
  context: TenantContext,
  userProfileId: string,
  role: WorkspaceRole,
): Promise<MemberChangeResult> {
  return mutate(async () => {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ outcome: string }[]>`
          select app.set_member_role(${userProfileId}::uuid, ${role}) as outcome
        `,
    );
    return rows[0]?.outcome;
  });
}

/**
 * Deactivate or reactivate one membership — §160.
 *
 * This affects the membership of the context's workspace and nothing else:
 * the person's account, and any membership they hold of another workspace,
 * are untouched. Nothing is deleted, so history keeps their name.
 */
export async function setMemberStatus(
  context: TenantContext,
  userProfileId: string,
  status: MembershipStatus,
): Promise<MemberChangeResult> {
  return mutate(async () => {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ outcome: string }[]>`
          select app.set_member_status(${userProfileId}::uuid, ${status}) as outcome
        `,
    );
    return rows[0]?.outcome;
  });
}
