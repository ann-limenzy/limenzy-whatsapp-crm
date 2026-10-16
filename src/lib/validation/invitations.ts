import { WORKSPACE_ROLES, type WorkspaceRole } from "@/lib/permissions";

/**
 * Invitation input — spec §159, §11.
 *
 * ## Which roles an invitation may name
 *
 * **All three, in Settings.** §11 restricts ONBOARDING's invite screen to
 * Manager and Staff because the owner is the person filling it in; §159's Add
 * User says nothing, and an Owner/Admin can already promote someone the
 * moment they join. Forbidding it here would only add a step, so the approved
 * default is that Settings may invite at any of the three roles. §11's screen
 * is a separate slice and keeps its two.
 */

export const MAX_INVITED_NAME = 120;
export const MAX_EMAIL = 254;

export type InvitationField = "email" | "role" | "invitedName";

export type InvitationIssue = {
  readonly field: InvitationField;
  readonly message: string;
};

export type InvitationInput = {
  readonly email: string;
  readonly role: WorkspaceRole;
  readonly invitedName: string | null;
};

export type InvitationParseResult =
  | { readonly ok: true; readonly value: InvitationInput }
  | { readonly ok: false; readonly issues: readonly InvitationIssue[] };

const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/u;

/**
 * The address shape the column's own check constraint accepts.
 *
 * Deliberately the same rule, not a stricter one: a value this accepts and
 * the database then refuses would be a confusing failure deep in a
 * transaction, and a value this refuses but the database would take is a
 * silent inconsistency.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalise an address the way the database stores it.
 *
 * One address is one row however it was typed, which is what makes
 * "one pending invitation per workspace and email" mean anything.
 */
export function normaliseInvitationEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parseInvitation(input: {
  email: unknown;
  role: unknown;
  invitedName: unknown;
}): InvitationParseResult {
  const issues: InvitationIssue[] = [];

  const rawEmail = typeof input.email === "string" ? input.email : "";
  const email = normaliseInvitationEmail(rawEmail);
  if (email === "") {
    issues.push({ field: "email", message: "Enter an email address" });
  } else if (email.length > MAX_EMAIL) {
    issues.push({ field: "email", message: "That email address is too long" });
  } else if (CONTROL_CHARACTERS.test(email) || !EMAIL.test(email)) {
    issues.push({ field: "email", message: "Enter a valid email address" });
  }

  const role = input.role;
  if (
    typeof role !== "string" ||
    !(WORKSPACE_ROLES as readonly string[]).includes(role)
  ) {
    issues.push({ field: "role", message: "Choose a role" });
  }

  const rawName =
    typeof input.invitedName === "string" ? input.invitedName.trim() : "";
  if (rawName.length > MAX_INVITED_NAME) {
    issues.push({ field: "invitedName", message: "That name is too long" });
  } else if (rawName !== "" && CONTROL_CHARACTERS.test(rawName)) {
    issues.push({
      field: "invitedName",
      message: "Remove the special characters from the name",
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      email,
      role: role as WorkspaceRole,
      // Empty means "not given", never an empty string — the column's check
      // constraint refuses a blank one.
      invitedName: rawName === "" ? null : rawName,
    },
  };
}
