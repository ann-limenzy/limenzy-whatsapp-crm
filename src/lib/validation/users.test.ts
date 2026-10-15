import { describe, expect, it } from "vitest";

import { WORKSPACE_ROLES } from "@/lib/permissions";
import {
  MEMBERSHIP_STATUSES,
  ROLE_LABELS,
  STATUS_LABELS,
  isMembershipStatus,
  isUserProfileId,
  isWorkspaceRole,
} from "./users";

/**
 * Settings → Users input narrowing — spec §159, §161.
 *
 * Small by design: these guards decide only whether a submitted value is one
 * the product recognises. Nothing here decides authorisation.
 */

describe("roles", () => {
  it.each(WORKSPACE_ROLES)("accepts %s", (role) => {
    expect(isWorkspaceRole(role)).toBe(true);
  });

  it.each([
    ["Team Lead, which §161 says is not a role", "team_lead"],
    ["a different case", "Owner_Admin"],
    ["a label rather than a key", "Owner/Admin"],
    ["an empty string", ""],
    ["a prototype name", "toString"],
    ["a number", 1],
    ["null", null],
    ["an object", { role: "owner_admin" }],
  ])("refuses %s", (_why, value) => {
    expect(isWorkspaceRole(value)).toBe(false);
  });

  it("labels every role, and only the roles", () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(
      [...WORKSPACE_ROLES].sort(),
    );
    // §161 names these three exactly; the screen must not invent its own.
    expect(ROLE_LABELS.owner_admin).toBe("Owner/Admin");
    expect(ROLE_LABELS.manager).toBe("Manager");
    expect(ROLE_LABELS.staff_sales).toBe("Staff/Sales");
  });
});

describe("statuses", () => {
  it("offers exactly the two §159 statuses", () => {
    expect([...MEMBERSHIP_STATUSES]).toEqual(["active", "inactive"]);
  });

  it.each(MEMBERSHIP_STATUSES)("accepts %s", (status) => {
    expect(isMembershipStatus(status)).toBe(true);
  });

  it.each([
    ["deleted, which §159 does not offer", "deleted"],
    ["archived", "archived"],
    ["a different case", "Active"],
    ["an empty string", ""],
    ["a boolean", true],
  ])("refuses %s", (_why, value) => {
    expect(isMembershipStatus(value)).toBe(false);
  });

  it("labels both statuses", () => {
    expect(STATUS_LABELS.active).toBe("Active");
    expect(STATUS_LABELS.inactive).toBe("Inactive");
  });
});

describe("profile identifiers", () => {
  it.each([
    "11111111-1111-4111-8111-111111111111",
    "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    "3F2504E0-4F89-41D3-9A0C-0305E82C3301",
  ])("accepts the canonical form %s", (value) => {
    expect(isUserProfileId(value)).toBe(true);
  });

  it.each([
    ["an all-zero UUID", "00000000-0000-0000-0000-000000000000"],
    ["no hyphens", "3f2504e04f8941d39a0c0305e82c3301"],
    ["a truncated value", "3f2504e0-4f89-41d3-9a0c"],
    ["trailing text", "3f2504e0-4f89-41d3-9a0c-0305e82c3301x"],
    ["a leading space", " 3f2504e0-4f89-41d3-9a0c-0305e82c3301"],
    ["SQL-shaped text", "' or 1=1 --"],
    ["an empty string", ""],
    ["a number", 42],
  ])("refuses %s", (_why, value) => {
    expect(isUserProfileId(value)).toBe(false);
  });
});
