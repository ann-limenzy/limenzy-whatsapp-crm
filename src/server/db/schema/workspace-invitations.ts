import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { workspaceRole } from "./enums";
import { userProfiles } from "./user-profiles";
import { workspaces } from "./workspaces";

/**
 * Pending and historical invitations to a workspace — spec §159 "Add User".
 *
 * **The application emails these itself**, through its own SMTP adapter in
 * `src/server/email/`, and the one-time link stays copyable as a secondary
 * option. That mail path is SEPARATE from Supabase Auth's: Auth sends
 * confirmation and password-reset messages with whatever SMTP its own
 * settings name, and configuring one does not configure the other. The
 * production provider for application mail is still an open §180.1 decision.
 *
 * NOTE: the migration that created this table carries a header saying no
 * email is sent and none can be. That was true when it was written and is no
 * longer. It is left alone deliberately — the file is applied and its
 * SHA-256 is pinned by the hosted migration tooling, so correcting a comment
 * would invalidate a reviewed artefact for no functional gain.
 *
 * **Only the hash is stored.** `tokenHash` is the SHA-256 of 32 random bytes;
 * the plaintext exists once, in the response that created it, and is never
 * written down. So the database holds nothing that can be redeemed.
 *
 * **The token is not sufficient on its own.** Acceptance also requires a
 * signed-in, email-verified user whose address equals `email`, so a leaked
 * link has to reach the person it was addressed to.
 *
 * **Nothing is deleted.** An invitation is revoked, never removed, so the
 * record of who invited whom survives (spec §177). Both foreign keys to
 * `user_profiles` restrict for the same reason.
 */
export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),

    /** Normalised to lower-case and trimmed; a check constraint enforces it. */
    email: text("email").notNull(),

    role: workspaceRole("role").notNull(),

    /**
     * The name §11 collects with an invitation.
     *
     * Used ONLY when the invitee has no profile yet and no name of their own.
     * It never overwrites an existing profile name.
     */
    invitedName: text("invited_name"),

    /** SHA-256 of the token, lower-case hex. Never the token itself. */
    tokenHash: text("token_hash").notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    /**
     * Who issued it. Their authority is re-checked at acceptance: an
     * Owner/Admin who has since been demoted or deactivated must not still be
     * adding people through a link they left behind.
     */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "restrict" }),

    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    redeemedBy: uuid("redeemed_by").references(() => userProfiles.id, {
      onDelete: "restrict",
    }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * One pending invitation per workspace and address.
     *
     * "Pending" is "neither revoked nor redeemed" and deliberately does not
     * exclude expired rows: an index predicate must be immutable and `now()`
     * is not. The creation routine supersedes an expired row before
     * inserting, so an expired invitation never blocks a fresh one.
     */
    uniqueIndex("workspace_invitations_pending_key")
      .on(table.workspaceId, table.email)
      .where(sql`revoked_at is null and redeemed_at is null`),

    /** Acceptance looks an invitation up by hash and by nothing else. */
    uniqueIndex("workspace_invitations_token_hash_key").on(table.tokenHash),

    index("workspace_invitations_workspace_id_idx").on(table.workspaceId),

    check(
      "workspace_invitations_email_normalised",
      sql`${table.email} = lower(btrim(${table.email})) and btrim(${table.email}) <> ''`,
    ),
    check(
      "workspace_invitations_email_shape",
      sql`${table.email} like '%_@_%._%' and ${table.email} not like '% %'`,
    ),
    check(
      "workspace_invitations_invited_name_not_blank",
      sql`${table.invitedName} is null or btrim(${table.invitedName}) <> ''`,
    ),
    check(
      "workspace_invitations_token_hash_shape",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "workspace_invitations_expires_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "workspace_invitations_redeemed_together",
      sql`(${table.redeemedAt} is null) = (${table.redeemedBy} is null)`,
    ),
  ],
);
