import {
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";

import { workspaceMembershipStatus, workspaceRole } from "./enums";
import { userProfiles } from "./user-profiles";
import { workspaces } from "./workspaces";

/**
 * Which people belong to which workspace, and in what role.
 *
 * This table is the join that makes the product multi-tenant: a person is not a
 * member of the product, they are a member of a workspace. A user may belong to
 * several workspaces (architecture decision D1), and their role is per
 * workspace — an Owner/Admin in one may be Staff/Sales in another.
 *
 * **One row per person per workspace.** Spec §159 offers Deactivate and
 * Reactivate as actions on an existing user, so rejoining a workspace flips
 * this row's status rather than adding a second membership. (Sales Team
 * membership behaves differently — §160 gives a rejoining member "a new
 * membership period" — but that is §163.2's model for a different table, and is
 * out of scope here.)
 *
 * **Nothing is deleted.** Both foreign keys restrict deletion:
 *   - a workspace cannot be dropped out from under its memberships, and V1
 *     defines no workspace deletion at all;
 *   - a profile cannot be deleted while a membership records that it was once
 *     part of a workspace, which is what §159/§160 mean by deactivating rather
 *     than deleting.
 *
 * **Not enforced here:** "at least one active Owner/Admin must remain" (§159)
 * and the reassignment preconditions in §160 are cross-row rules that a column
 * constraint cannot express. They belong to the application, and are Milestone
 * 2 work — this schema does not pretend to guarantee them.
 */
export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),

    userProfileId: uuid("user_profile_id")
      .notNull()
      .references(() => userProfiles.id, { onDelete: "restrict" }),

    role: workspaceRole("role").notNull(),

    status: workspaceMembershipStatus("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    /**
     * Prevents a duplicate membership, and serves the workspace-scoped lookup
     * ("is this person a member of this workspace?") that every request makes.
     */
    uniqueIndex("workspace_memberships_workspace_id_user_profile_id_key").on(
      table.workspaceId,
      table.userProfileId,
    ),
    /**
     * The reverse lookup: "which workspaces does this signed-in person belong
     * to?" — needed on sign-in and by `requireWorkspaceContext()` in 1C-C.
     *
     * No status-filtered index yet: a person belongs to a handful of
     * workspaces, so filtering the few rows this returns is cheaper than
     * maintaining a second index. Add one when an access pattern demands it.
     */
    index("workspace_memberships_user_profile_id_idx").on(table.userProfileId),
  ],
);
