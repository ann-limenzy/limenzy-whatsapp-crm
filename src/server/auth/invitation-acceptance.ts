import "server-only";

import { getAuthenticatedUser } from "@/server/auth/require-user";
import { isInvitationTokenHash } from "@/lib/invitation-token";
import { runtimeSql } from "@/server/db/client";

/**
 * Accepting an invitation — spec §159.
 *
 * The one operation in the product that must work for a person with **no
 * membership and possibly no profile**, so it cannot go through
 * `withTenant()`: there is no workspace to scope a context by until this
 * succeeds. It follows the boundary `create-initial-workspace.ts`
 * established — one transaction, the verified identity set as a
 * transaction-local setting, and one SECURITY DEFINER routine owned by a
 * NOLOGIN role that owns nothing else.
 *
 * **Identity is never taken from the caller.** The Auth user id comes from
 * `getAuthenticatedUser()`, which reads signature-verified claims, and is set
 * as `app.auth_user_id`; the routine reads it from the transaction. The email
 * is likewise read from those claims here and compared with the invitation
 * inside the routine. Nothing on this path is read from a form.
 *
 * **An unconfirmed address cannot accept.** §159 binds an invitation to an
 * address, and an unverified one is a claim rather than a fact.
 */

const AUTH_USER_ID = "app.auth_user_id";

/**
 * SQLSTATEs that mean "this transaction aborted, nothing was written".
 *
 *   40001  serialization_failure — only reachable at an isolation level
 *          stricter than the READ COMMITTED this routine is written for.
 *   40P01  deadlock_detected — the lock order is chosen precisely so this
 *          should not happen, which is why it is an unexpected failure
 *          rather than a reason to retry.
 *
 * The same pair, and the same reasoning, as `workspace-members.ts`.
 */
const ABORTED_SQLSTATES: ReadonlySet<string> = new Set(["40001", "40P01"]);

const isConcurrencyAbort = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code?: unknown }).code === "string" &&
  ABORTED_SQLSTATES.has((error as { code: string }).code);

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AcceptanceOutcome =
  /** A new membership was created. */
  | "joined"
  /** An inactive membership was restored at the invited role. */
  | "reactivated"
  /**
   * An ACTIVE membership already existed. It was left exactly as it was —
   * an old invitation must never rewrite a role somebody holds now — and the
   * invitation was still used up.
   */
  | "already_member"
  /** Unknown, revoked, already redeemed, or expired. Deliberately one word. */
  | "invalid"
  /** The verified address is not the one invited. */
  | "email_mismatch"
  /** Whoever issued it is no longer an Owner/Admin of that workspace. */
  | "inviter_not_permitted"
  /** No verified, confirmed identity on this request. */
  | "unauthenticated"
  /** The routine answered with a word this build does not know. */
  | "unavailable";

const OUTCOMES: Readonly<Record<string, AcceptanceOutcome>> = {
  joined: "joined",
  reactivated: "reactivated",
  already_member: "already_member",
  invalid: "invalid",
  email_mismatch: "email_mismatch",
  inviter_not_permitted: "inviter_not_permitted",
  unauthenticated: "unauthenticated",
};

export type PendingInvitationForMe = {
  readonly invitationId: string;
  readonly workspaceName: string;
  readonly role: string;
  readonly expiresAt: Date;
};

/**
 * Redeem an invitation for the signed-in person.
 *
 * Takes the token's HASH, never the token: the plaintext stays in the request
 * that carried it and never reaches a query, a log or this module's callers.
 */
export async function acceptInvitation(
  by:
    | { readonly tokenHash: string }
    /**
     * The recovery path, for a lost continuation. An invitation id is not a
     * secret and confers nothing alone: the verified address still has to
     * equal the invited one, which is the binding that matters either way.
     */
    | { readonly invitationId: string },
): Promise<AcceptanceOutcome> {
  const tokenHash = "tokenHash" in by ? by.tokenHash : null;
  const invitationId = "invitationId" in by ? by.invitationId : null;
  if (tokenHash !== null && !isInvitationTokenHash(tokenHash)) return "invalid";
  if (invitationId !== null && !UUID.test(invitationId)) return "invalid";

  const user = await getAuthenticatedUser();
  if (!user || !user.emailVerified || !user.email) return "unauthenticated";

  let rows: { outcome: string | null }[];
  try {
    rows = await runtimeSql().begin(async (tx) => {
      await tx`select set_config(${AUTH_USER_ID}, ${user.id}, true)`;
      return tx<{ outcome: string | null }[]>`
        select app.accept_workspace_invitation(
          ${tokenHash}, ${invitationId}::uuid, ${user.email}, ${user.fullName}
        ) as outcome`;
    });
  } catch (error) {
    /*
     * An aborted transaction becomes the ordinary refusal, exactly as the
     * Milestone 2B mutations report it.
     *
     * The routine now takes the workspace's Owner/Admin lock set, so it can
     * be chosen as a deadlock victim where before it could not. An abort
     * means PostgreSQL rolled the whole transaction back: no profile, no
     * membership, no redeemed invitation. **Nothing is retried** — silently
     * re-attempting a membership grant is precisely what must not happen on
     * its own, and the person can press Join again.
     *
     * Only those two SQLSTATEs are absorbed. Anything else propagates: a
     * missing routine or a lost connection is a fault to surface, not an
     * outcome to report as "try again".
     */
    if (isConcurrencyAbort(error)) return "unavailable";
    throw error;
  }

  const outcome = rows[0]?.outcome;
  // An unrecognised word is never read as success: a routine that gained an
  // outcome this build has never heard of is a deployment skew.
  return (
    (typeof outcome === "string" ? OUTCOMES[outcome] : undefined) ??
    "unavailable"
  );
}

/**
 * Live invitations addressed to the signed-in person.
 *
 * The recovery path for a lost continuation — a confirmation link opened in
 * another browser, say. It returns no token, so it cannot be used to redeem
 * anything; it only tells someone an invitation is waiting, which they could
 * already learn from the link they were sent.
 */
export async function pendingInvitationsForMe(): Promise<
  readonly PendingInvitationForMe[]
> {
  const user = await getAuthenticatedUser();
  if (!user || !user.emailVerified || !user.email) return [];

  const rows = await runtimeSql().begin(async (tx) => {
    await tx`select set_config(${AUTH_USER_ID}, ${user.id}, true)`;
    return tx<
      {
        invitation_id: string;
        workspace_name: string;
        member_role: string;
        /**
         * Text, not a `Date`.
         *
         * Constructing the Drizzle handle replaces this pool's timestamptz
         * parser — the contract recorded in architecture-decisions §6.3 — so
         * a timestamp comes back as a string however it is typed here.
         * Taking it at its word produced an Invalid Date that only failed
         * where it was finally formatted.
         */
        expires_at: string;
      }[]
    >`select * from app.pending_invitations_for(${user.email})`;
  });

  return rows.map((row) => ({
    invitationId: row.invitation_id,
    workspaceName: row.workspace_name,
    role: row.member_role,
    expiresAt: new Date(row.expires_at),
  }));
}
