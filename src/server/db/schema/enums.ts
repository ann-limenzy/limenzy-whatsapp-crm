import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Workspace roles — spec §2 (User Roles), §159 (Users) and §161/§162.
 *
 * Exactly three, and the set is closed. **Team Lead is deliberately absent**:
 * spec §2 and §159 state it "is not a role and does not appear in the Roles
 * list" — it is a responsibility held by one member of a Sales Team, which is
 * out of scope here and arrives with Sales Teams (§163).
 */
export const workspaceRole = pgEnum("workspace_role", [
  "owner_admin",
  "manager",
  "staff_sales",
]);

/**
 * Membership status — spec §159, which lists exactly two statuses: Active and
 * Inactive.
 *
 * There is no "invited" state here. Spec §11 models invitations as their own
 * step, and the Build Plan gives `workspace_invitations` its own table; a
 * membership exists once a person is actually a member. Deactivation flips this
 * value rather than deleting the row (§159, §160).
 */
export const workspaceMembershipStatus = pgEnum("workspace_membership_status", [
  "active",
  "inactive",
]);
