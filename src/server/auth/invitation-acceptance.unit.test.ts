import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * How acceptance behaves when the transaction aborts — offline.
 *
 * The routine takes the workspace's Owner/Admin lock set, so it can now be
 * chosen as a deadlock victim where before it could not. An abort means
 * PostgreSQL rolled everything back; what matters here is that the module
 * reports it as the ordinary refusal, retries nothing, and does not mistake
 * any other failure for one.
 *
 * No database: the pool is replaced, so the SQLSTATEs can be produced exactly
 * and the behaviour pinned without racing anything.
 */

const getAuthenticatedUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-user", () => ({ getAuthenticatedUser }));

const begin = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/client", () => ({ runtimeSql: () => ({ begin }) }));

const { acceptInvitation } = await import("./invitation-acceptance");

const HASH = "a".repeat(64);
const USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "invited@example.com",
  emailVerified: true,
  fullName: "Invited Person",
};

/** A driver error as postgres.js raises it. */
const pgError = (code: string) => Object.assign(new Error("db"), { code });

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue(USER);
  begin.mockResolvedValue([{ outcome: "joined" }]);
});

describe("an aborted transaction", () => {
  for (const [code, label] of [
    ["40001", "serialization_failure"],
    ["40P01", "deadlock_detected"],
  ] as const) {
    it(`reports ${label} as the ordinary refusal`, async () => {
      begin.mockRejectedValue(pgError(code));
      await expect(acceptInvitation({ tokenHash: HASH })).resolves.toBe(
        "unavailable",
      );
    });

    it(`does not retry after ${label}`, async () => {
      // A silent second attempt at a membership grant is exactly what must
      // not happen on its own. The person presses Join again, or does not.
      begin.mockRejectedValue(pgError(code));
      await acceptInvitation({ tokenHash: HASH });
      expect(begin).toHaveBeenCalledTimes(1);
    });
  }

  it("lets every other failure through", async () => {
    // A missing routine, a lost connection or a permission error is a fault
    // to surface, not an outcome to report as "try again".
    for (const code of ["42883", "42501", "23503", "08006"]) {
      begin.mockRejectedValue(pgError(code));
      await expect(acceptInvitation({ tokenHash: HASH })).rejects.toMatchObject(
        { code },
      );
    }
  });

  it("does not reach the database at all without a verified address", async () => {
    getAuthenticatedUser.mockResolvedValue({ ...USER, emailVerified: false });
    await expect(acceptInvitation({ tokenHash: HASH })).resolves.toBe(
      "unauthenticated",
    );
    expect(begin).not.toHaveBeenCalled();
  });

  it("treats a word this build does not know as unavailable", async () => {
    begin.mockResolvedValue([{ outcome: "something_new" }]);
    await expect(acceptInvitation({ tokenHash: HASH })).resolves.toBe(
      "unavailable",
    );
  });
});
