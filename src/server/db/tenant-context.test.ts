// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  TenantContextError,
  createTenantContext,
  isIssuedTenantContext,
} from "./tenant-context";

/**
 * Unit coverage for the trusted context boundary.
 *
 * These run with or without a database, because validation and authenticity are
 * pure logic. They do not replace the live proof in `tenant.test.ts`, which is
 * what demonstrates that the database actually behaves as designed.
 *
 * Every identifier here is a synthetic UUID.
 */

const A = "a1b2c3d4-1111-4111-8111-1111111111ff";
const B = "b2c3d4e5-2222-4222-8222-2222222222ff";
const C = "c3d4e5f6-3333-4333-8333-3333333333ff";

describe("createTenantContext", () => {
  it("accepts three well-formed UUIDs", () => {
    const context = createTenantContext({
      authUserId: A,
      userProfileId: B,
      workspaceId: C,
    });
    expect(context.authUserId).toBe(A);
    expect(context.userProfileId).toBe(B);
    expect(context.workspaceId).toBe(C);
  });

  it("freezes what it issues", () => {
    const context = createTenantContext({
      authUserId: A,
      userProfileId: B,
      workspaceId: C,
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(() => {
      (context as unknown as { workspaceId: string }).workspaceId = A;
    }).toThrow();
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["blank", "   "],
    ["not a uuid", "definitely-not-a-uuid"],
    ["truncated", "a1b2c3d4-1111-4111-8111"],
    ["uppercase", A.toUpperCase()],
    ["padded", ` ${A}`],
    ["sql fragment", `${A}'; select 1 --`],
  ])("rejects a %s authUserId", (_label, value) => {
    expect(() =>
      createTenantContext({
        authUserId: value as string,
        userProfileId: B,
        workspaceId: C,
      }),
    ).toThrow(TenantContextError);
  });

  it("rejects a malformed value in any position", () => {
    expect(() =>
      createTenantContext({
        authUserId: A,
        userProfileId: "x",
        workspaceId: C,
      }),
    ).toThrow(/userProfileId/);
    expect(() =>
      createTenantContext({
        authUserId: A,
        userProfileId: B,
        workspaceId: "x",
      }),
    ).toThrow(/workspaceId/);
  });

  it("names the field but never echoes the value", () => {
    try {
      createTenantContext({
        authUserId: "not-a-uuid-but-SENSITIVE",
        userProfileId: B,
        workspaceId: C,
      });
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("authUserId");
      expect(message).not.toContain("SENSITIVE");
      expect(message).not.toContain(B);
      expect(message).not.toContain(C);
    }
  });

  it("accepts only its own objects as authentic", () => {
    const issued = createTenantContext({
      authUserId: A,
      userProfileId: B,
      workspaceId: C,
    });
    expect(isIssuedTenantContext(issued)).toBe(true);

    // A plain object with identical, valid values is not authentic.
    expect(
      isIssuedTenantContext({
        authUserId: A,
        userProfileId: B,
        workspaceId: C,
      }),
    ).toBe(false);
    // Nor is a copy of a genuine one.
    expect(isIssuedTenantContext({ ...issued })).toBe(false);
    for (const value of [null, undefined, "", 0, [], () => {}]) {
      expect(isIssuedTenantContext(value)).toBe(false);
    }
  });

  it("issues distinct objects per call", () => {
    const one = createTenantContext({
      authUserId: A,
      userProfileId: B,
      workspaceId: C,
    });
    const two = createTenantContext({
      authUserId: A,
      userProfileId: B,
      workspaceId: C,
    });
    expect(one).not.toBe(two);
    expect(isIssuedTenantContext(one)).toBe(true);
    expect(isIssuedTenantContext(two)).toBe(true);
  });
});
