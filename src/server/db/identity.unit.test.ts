// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Phase 4A unit coverage — the paths that never reach the database.
 *
 * The verified-authentication utility is mocked to represent different signed-in
 * users. That is the only injection point, and it is a test-side mock of an
 * existing production module: the resolver itself takes no arguments and offers
 * no seam.
 *
 * These do not replace the live proof in `identity.test.ts`.
 */

const getAuthenticatedUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-user", () => ({ getAuthenticatedUser }));

// Fails the test loudly if any of these paths ever touches the pool.
const runtimeSql = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("the database must not be reached on this path");
  }),
);
vi.mock("./client", () => ({ runtimeSql }));

const { resolveVerifiedIdentity } = await import("./identity");

const VERIFIED = {
  id: "a1b2c3d4-1111-4111-8111-1111111111ff",
  email: "person@example.com",
  emailVerified: true,
  fullName: "Test Person",
};

afterEach(() => {
  getAuthenticatedUser.mockReset();
  runtimeSql.mockClear();
});

describe("identity resolution without a database", () => {
  it("returns unauthenticated when there are no verified claims", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    await expect(resolveVerifiedIdentity()).resolves.toEqual({
      kind: "unauthenticated",
    });
    expect(runtimeSql).not.toHaveBeenCalled();
  });

  it("returns unauthenticated when the email is not verified", async () => {
    getAuthenticatedUser.mockResolvedValue({
      ...VERIFIED,
      emailVerified: false,
    });
    await expect(resolveVerifiedIdentity()).resolves.toEqual({
      kind: "unauthenticated",
    });
    expect(runtimeSql).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", ""],
    ["not a uuid", "definitely-not-a-uuid"],
    ["truncated", "a1b2c3d4-1111-4111-8111"],
    ["uppercase", VERIFIED.id.toUpperCase()],
    ["padded", ` ${VERIFIED.id}`],
    ["sql fragment", `${VERIFIED.id}'; select 1 --`],
    ["not a string", 12345],
  ])("returns unauthenticated for a %s sub", async (_label, sub) => {
    getAuthenticatedUser.mockResolvedValue({ ...VERIFIED, id: sub });
    await expect(resolveVerifiedIdentity()).resolves.toEqual({
      kind: "unauthenticated",
    });
    // Fails closed before any connection is opened.
    expect(runtimeSql).not.toHaveBeenCalled();
  });

  it("reads identity only from the verified utility", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    await resolveVerifiedIdentity();
    expect(getAuthenticatedUser).toHaveBeenCalledTimes(1);
    // No argument is passed to it either: it reads the token itself.
    expect(getAuthenticatedUser).toHaveBeenCalledWith();
  });
});

describe("the public API shape", () => {
  it("accepts zero arguments", () => {
    expect(resolveVerifiedIdentity).toHaveLength(0);
  });

  it("ignores anything a caller tries to pass", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    const forged = {
      authUserId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      userProfileId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      workspaceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      role: "owner_admin",
    };
    const callable = resolveVerifiedIdentity as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    // Whatever is supplied, identity still comes from the verified utility.
    await expect(callable(forged, "pool", {})).resolves.toEqual({
      kind: "unauthenticated",
    });
    expect(getAuthenticatedUser).toHaveBeenCalledWith();
  });
});
