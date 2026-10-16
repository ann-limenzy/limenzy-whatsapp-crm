import { describe, expect, it } from "vitest";

import { WORKSPACE_ROLES } from "@/lib/permissions";
import {
  MAX_EMAIL,
  MAX_INVITED_NAME,
  normaliseInvitationEmail,
  parseInvitation,
} from "@/lib/validation/invitations";

/**
 * Invitation input — spec §159, §11.
 *
 * The parser is what stands between a form and a column with check
 * constraints on it, so these assert the two agree: everything it accepts the
 * database also accepts, and everything it normalises it normalises the same
 * way the database stores.
 */

const valid = {
  email: "Person@Example.COM ",
  role: "manager",
  invitedName: " Sam ",
};

const issuesFor = (input: Parameters<typeof parseInvitation>[0]) => {
  const result = parseInvitation(input);
  if (result.ok) throw new Error("expected a refusal");
  return result.issues;
};

describe("normaliseInvitationEmail", () => {
  it("is what makes one-pending-per-address mean anything", () => {
    for (const written of [
      "Person@Example.com",
      " person@example.com ",
      "PERSON@EXAMPLE.COM",
      "\tperson@example.com\n",
    ]) {
      expect(normaliseInvitationEmail(written)).toBe("person@example.com");
    }
  });
});

describe("parseInvitation", () => {
  it("normalises the address and trims the name", () => {
    const result = parseInvitation(valid);
    expect(result).toEqual({
      ok: true,
      value: {
        email: "person@example.com",
        role: "manager",
        invitedName: "Sam",
      },
    });
  });

  it("stores an omitted name as null, never an empty string", () => {
    // The column's check constraint refuses a blank name outright.
    for (const invitedName of ["", "   ", null, undefined, 42]) {
      const result = parseInvitation({ ...valid, invitedName });
      expect(result.ok && result.value.invitedName).toBeNull();
    }
  });

  it("accepts every role Settings may invite at", () => {
    // §159 says nothing about which roles, and an Owner/Admin can promote
    // someone the moment they join — so all three. §11's onboarding screen is
    // a separate surface and keeps its two.
    for (const role of WORKSPACE_ROLES) {
      const result = parseInvitation({ ...valid, role });
      expect(result.ok && result.value.role, role).toBe(role);
    }
  });

  it("refuses a role that is not one", () => {
    for (const role of ["", "owner", "admin", "OWNER_ADMIN", null, 1, {}]) {
      expect(issuesFor({ ...valid, role })).toContainEqual({
        field: "role",
        message: "Choose a role",
      });
    }
  });

  it("asks for an address before judging it", () => {
    expect(issuesFor({ ...valid, email: "   " })).toContainEqual({
      field: "email",
      message: "Enter an email address",
    });
  });

  it("refuses an address the column would refuse", () => {
    for (const email of [
      "not-an-address",
      "no-at-sign.example.com",
      "two@at@example.com",
      "spaces in@example.com",
      "@example.com",
      "person@",
      "person@example",
    ]) {
      expect(issuesFor({ ...valid, email }), email).toContainEqual({
        field: "email",
        message: "Enter a valid email address",
      });
    }
  });

  it("refuses control characters hidden in either field", () => {
    // A zero-width or bidirectional character makes two different addresses
    // look identical in a list — which is the whole point of inserting one.
    expect(issuesFor({ ...valid, email: "person​@example.com" })).toHaveLength(
      1,
    );
    expect(issuesFor({ ...valid, invitedName: "Sam‮" })).toContainEqual({
      field: "invitedName",
      message: "Remove the special characters from the name",
    });
  });

  it("refuses values longer than the columns hold", () => {
    const long = `${"a".repeat(MAX_EMAIL)}@example.com`;
    expect(issuesFor({ ...valid, email: long })).toContainEqual({
      field: "email",
      message: "That email address is too long",
    });
    expect(
      issuesFor({ ...valid, invitedName: "a".repeat(MAX_INVITED_NAME + 1) }),
    ).toContainEqual({
      field: "invitedName",
      message: "That name is too long",
    });
  });

  it("accepts a name of exactly the maximum", () => {
    const name = "a".repeat(MAX_INVITED_NAME);
    const result = parseInvitation({ ...valid, invitedName: name });
    expect(result.ok && result.value.invitedName).toBe(name);
  });

  it("reports every bad field at once", () => {
    const issues = issuesFor({ email: "nope", role: "boss", invitedName: 0 });
    expect(issues.map((issue) => issue.field).sort()).toEqual([
      "email",
      "role",
    ]);
  });

  it("refuses a submission with no fields at all", () => {
    // A Server Action is reachable by anything that can POST to it.
    expect(
      parseInvitation({
        email: undefined,
        role: undefined,
        invitedName: undefined,
      }).ok,
    ).toBe(false);
  });
});
