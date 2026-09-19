import { sql } from "drizzle-orm";
import {
  check,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Reference-only declaration of Supabase's `auth.users`.
 *
 * The `auth` schema is owned and migrated by Supabase. Nothing in this
 * repository creates, alters or seeds it — this stub exists so the foreign key
 * below is expressed in the typed schema rather than only in SQL.
 */
export const authSchema = pgSchema("auth");
export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});

/**
 * The application's view of a person, named `user_profiles` as the Build Plan's
 * 1C foundation schema specifies.
 *
 * **Why the identifier is not simply `auth.users.id`.** Spec §159 requires that
 * users with CRM history are "deactivated rather than permanently deleted", and
 * §160 requires that "historical activity should continue to show the original
 * user's name". If this row were keyed on `auth.users.id` and cascaded, then
 * deleting an authentication account would erase the name that history depends
 * on. Instead the profile owns its own identifier and merely *points at* an
 * authentication account:
 *
 *   - `auth_user_id` is unique, so one account maps to at most one profile;
 *   - it is nullable and `ON DELETE SET NULL`, so removing the authentication
 *     account detaches sign-in without destroying the person's history;
 *   - membership and (later) owned records reference `user_profiles.id`, which
 *     therefore never disappears.
 *
 * **Email is deliberately absent.** It lives in `auth.users` and is Supabase's
 * to maintain; duplicating it would create two sources of truth for identity
 * and a second place for it to go stale. §159 shows Email in the Users list —
 * that is a read joined server-side, not a stored copy.
 */
export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    authUserId: uuid("auth_user_id")
      .unique()
      .references(() => authUsers.id, { onDelete: "set null" }),

    /** "User Name" as shown in Settings → Users (§159) and in history (§160). */
    fullName: text("full_name").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "user_profiles_full_name_not_blank",
      sql`btrim(${table.fullName}) <> ''`,
    ),
  ],
);
