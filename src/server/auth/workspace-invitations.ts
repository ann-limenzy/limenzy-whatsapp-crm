import "server-only";

import type { WorkspaceRole } from "@/lib/permissions";
import { withTenant } from "@/server/db/tenant";
import type { TenantContext } from "@/server/db/tenant-context";

/**
 * Invitation administration — spec §159.
 *
 * Every call goes through `withTenant()`, so the three tenant settings are
 * established before any statement runs, and the rows are filtered by the
 * `workspace_invitations_owner_admin_*` policies, which require an ACTIVE
 * owner_admin of the selected workspace, re-derived from stored rows.
 *
 * **Why these are policies and not routines.** Milestone 2B needed SECURITY
 * DEFINER routines because a co-member policy on `workspace_memberships`
 * would read the table it guards and recurse. A policy on this table reads
 * `workspace_memberships`, whose own policy reads `user_profiles` and stops —
 * depth two, acyclic. Acceptance is the one operation that still needs a
 * routine, and it lives in `invitation-acceptance.ts` because it runs for
 * someone who has no membership yet.
 *
 * **No workspace parameter.** None of these takes a workspace id; the context
 * decides, so there is no argument through which a caller could reach
 * another workspace.
 *
 * **No token ever passes through here in plaintext.** Callers hash first.
 *
 * **Timestamps cross as ISO strings, not `Date`s.** Constructing the Drizzle
 * handle replaces this pool's timestamptz parser and serialiser — an accepted
 * contract recorded in architecture-decisions §6.3 — so binding a `Date`
 * raises a TypeError and a returned timestamp arrives as text. The conversion
 * is done here, once, rather than left for each caller to remember.
 */

export type WorkspaceInvitation = {
  readonly id: string;
  readonly email: string;
  readonly role: WorkspaceRole;
  readonly invitedName: string | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  /** Derived server-side so the screen never has to compare clocks. */
  readonly isExpired: boolean;
};

type Row = {
  id: string;
  email: string;
  role: WorkspaceRole;
  invited_name: string | null;
  /** Text, not Date — see the note above. */
  expires_at: string;
  created_at: string;
  is_expired: boolean;
};

const toInvitation = (row: Row): WorkspaceInvitation => ({
  id: row.id,
  email: row.email,
  role: row.role,
  invitedName: row.invited_name,
  expiresAt: new Date(row.expires_at),
  createdAt: new Date(row.created_at),
  isExpired: row.is_expired,
});

/**
 * Invitations that have neither been revoked nor redeemed.
 *
 * Expired ones are included and flagged, because an Owner/Admin needs to see
 * that an invitation lapsed rather than wonder why nothing happened.
 */
export async function pendingInvitations(
  context: TenantContext,
): Promise<readonly WorkspaceInvitation[]> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<Row[]>`
        select id, email, role, invited_name, expires_at, created_at,
               (expires_at <= now()) as is_expired
          from public.workspace_invitations
         where revoked_at is null and redeemed_at is null
         order by created_at desc
      `,
  );
  return rows.map(toInvitation);
}

export type InvitationWriteResult =
  | { readonly ok: true }
  /** Not an active Owner/Admin of this workspace, or no row matched. */
  | { readonly ok: false; readonly reason: "not_permitted" }
  /** A live invitation for that address already exists. */
  | { readonly ok: false; readonly reason: "already_invited" }
  | { readonly ok: false; readonly reason: "unavailable" };

/** The one-pending-per-email index raises this when a duplicate is attempted. */
const UNIQUE_VIOLATION = "23505";

/**
 * An INSERT a policy refuses raises this rather than returning no rows.
 *
 * It is the write-side counterpart of a SELECT policy matching nothing, and
 * it is how a Manager or a non-member is turned away — so it maps to the same
 * refusal, not to an error the screen would have to explain.
 */
const INSUFFICIENT_PRIVILEGE = "42501";

const sqlState = (error: unknown): string | undefined =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;

/**
 * Issue an invitation.
 *
 * The caller has already generated the token and hashed it; only the hash
 * reaches the database. An expired invitation for the same address is
 * superseded first — it must not block a fresh one — and the partial unique
 * index is what refuses a genuinely live duplicate, so two concurrent
 * requests cannot both succeed.
 */
export async function createInvitation(
  context: TenantContext,
  input: {
    readonly email: string;
    readonly role: WorkspaceRole;
    readonly invitedName: string | null;
    readonly tokenHash: string;
    readonly expiresAt: Date;
  },
): Promise<InvitationWriteResult> {
  try {
    const rows = await withTenant(context, async (tx) => {
      // Supersede an expired invitation for this address. Revoking rather
      // than deleting keeps the record of who invited whom (§177).
      await tx`
        update public.workspace_invitations
           set revoked_at = now()
         where email = ${input.email}
           and revoked_at is null
           and redeemed_at is null
           and expires_at <= now()
      `;
      return tx<{ id: string }[]>`
        insert into public.workspace_invitations
          (workspace_id, email, role, invited_name, token_hash, expires_at,
           created_by)
        values (${context.workspaceId}, ${input.email}, ${input.role},
                ${input.invitedName}, ${input.tokenHash},
                ${input.expiresAt.toISOString()}::timestamptz,
                ${context.userProfileId})
        returning id
      `;
    });
    return rows.length > 0
      ? { ok: true }
      : { ok: false, reason: "not_permitted" };
  } catch (error) {
    const state = sqlState(error);
    if (state === UNIQUE_VIOLATION) {
      return { ok: false, reason: "already_invited" };
    }
    if (state === INSUFFICIENT_PRIVILEGE) {
      return { ok: false, reason: "not_permitted" };
    }
    throw error;
  }
}

/**
 * Re-issue a pending invitation: a new token, a new seven days, and a new
 * issuer.
 *
 * One row, updated in place: the previous token stops working the moment its
 * hash is overwritten, which is what "regenerate invalidates the previous
 * link" means. A revoked or redeemed invitation is not regenerated — the
 * predicate excludes it, so the update matches nothing and the caller is told
 * the row is not available.
 *
 * **The issuer becomes whoever regenerated it**, and that is the point rather
 * than a side effect. Acceptance re-checks the ISSUER's authority, so an
 * invitation sent by somebody since demoted can never be redeemed; without
 * re-attribution, regenerating it would hand out a fresh link guaranteed to
 * fail while looking perfectly live. Taking it over is how an Owner/Admin
 * rescues it.
 *
 * The caller cannot name anybody else: a trigger on the table refuses a
 * `created_by` that is neither unchanged nor the caller's own profile.
 * Revoking is deliberately NOT re-attributed — it leaves the record of who
 * invited whom intact (§177), and stays available to anyone with authority.
 */
export async function regenerateInvitation(
  context: TenantContext,
  invitationId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<InvitationWriteResult> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<{ id: string }[]>`
        update public.workspace_invitations
           set token_hash = ${tokenHash},
               expires_at = ${expiresAt.toISOString()}::timestamptz,
               created_by = ${context.userProfileId}
         where id = ${invitationId}::uuid
           and revoked_at is null
           and redeemed_at is null
        returning id
      `,
  );
  return rows.length > 0
    ? { ok: true }
    : { ok: false, reason: "not_permitted" };
}

/** Withdraw a pending invitation. The row stays; the link stops working. */
export async function revokeInvitation(
  context: TenantContext,
  invitationId: string,
): Promise<InvitationWriteResult> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<{ id: string }[]>`
        update public.workspace_invitations
           set revoked_at = now()
         where id = ${invitationId}::uuid
           and revoked_at is null
           and redeemed_at is null
        returning id
      `,
  );
  return rows.length > 0
    ? { ok: true }
    : { ok: false, reason: "not_permitted" };
}
