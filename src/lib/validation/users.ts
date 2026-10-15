import { WORKSPACE_ROLES, type WorkspaceRole } from "@/lib/permissions";

/**
 * Settings → Users input shapes — spec §159, §161.
 *
 * Small on purpose. The three roles are already an executable list in
 * `@/lib/permissions`, derived from the §162 matrix, so this module narrows
 * strings against that list rather than restating it. Membership status is the
 * two values §159 names and the database's enum allows.
 *
 * Nothing here decides authorisation. It decides only whether a submitted
 * value is one the product recognises, so a malformed payload is refused
 * before it reaches a transaction.
 */

/** The two §159 statuses, matching `public.workspace_membership_status`. */
export const MEMBERSHIP_STATUSES = ["active", "inactive"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner_admin: "Owner/Admin",
  manager: "Manager",
  staff_sales: "Staff/Sales",
};

export const STATUS_LABELS: Record<MembershipStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (
    typeof value === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(value)
  );
}

export function isMembershipStatus(value: unknown): value is MembershipStatus {
  return (
    typeof value === "string" &&
    (MEMBERSHIP_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * The canonical UUID form, and nothing else.
 *
 * A profile id arrives from a form, so it is checked for shape before it
 * becomes a query parameter. This is not a security control — the routine
 * resolves the membership inside the caller's own workspace regardless — but
 * a malformed value should be refused with a clear answer rather than raising
 * `invalid input syntax for type uuid` from inside a transaction.
 */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUserProfileId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
