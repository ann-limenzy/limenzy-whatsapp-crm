import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Users gateway's handling of outcomes and of aborted transactions.
 *
 * Offline: `withTenant` is mocked, so these are about how the gateway reads
 * what the database said, not about what the database decides. The decisions
 * themselves are proved against a real database in
 * `src/server/db/users-isolation.db.test.ts`.
 */

const withTenant = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/tenant", () => ({ withTenant }));

const { workspaceMembers, setMemberRole, setMemberStatus } =
  await import("./workspace-members");

const CONTEXT = { workspaceId: "w", userProfileId: "p" } as never;
const TARGET = "22222222-2222-4222-8222-222222222222";

/** An error shaped the way the driver reports a PostgreSQL failure. */
const pgError = (code: string) =>
  Object.assign(new Error("database"), { code });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("an aborted transaction becomes the ordinary refusal", () => {
  it.each([
    ["40001 serialization_failure", "40001"],
    ["40P01 deadlock_detected", "40P01"],
  ])("maps %s onto unavailable", async (_why, code) => {
    withTenant.mockRejectedValue(pgError(code));

    // Both mean the transaction aborted and nothing was written, so the honest
    // answer is "could not save" — never "saved", and never a retry.
    expect(await setMemberRole(CONTEXT, TARGET, "manager")).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await setMemberStatus(CONTEXT, TARGET, "inactive")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("does not retry the mutation", async () => {
    withTenant.mockRejectedValue(pgError("40P01"));
    await setMemberRole(CONTEXT, TARGET, "manager");
    // A membership change is not idempotent from the person's point of view:
    // re-running one they did not re-request is worse than telling them it
    // did not save.
    expect(withTenant).toHaveBeenCalledTimes(1);
  });

  it("reveals nothing about the database in the result", async () => {
    withTenant.mockRejectedValue(
      Object.assign(new Error("deadlock detected on relation 16421"), {
        code: "40P01",
        detail: "Process 123 waits for ShareLock on transaction 456",
        schema: "public",
        table: "workspace_memberships",
      }),
    );
    const result = await setMemberRole(CONTEXT, TARGET, "manager");
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    expect(JSON.stringify(result)).not.toMatch(
      /deadlock|relation|16421|workspace_memberships|Process/i,
    );
  });
});

describe("other failures are faults, not outcomes", () => {
  it.each([
    ["42883 undefined_function — the routine is missing", "42883"],
    ["42501 insufficient_privilege — the grant is wrong", "42501"],
    ["57P01 admin_shutdown — the connection died", "57P01"],
    ["22P02 invalid_text_representation", "22P02"],
  ])("lets %s propagate", async (_why, code) => {
    withTenant.mockRejectedValue(pgError(code));
    // Reporting these as "could not save" would hide a broken deployment
    // behind a message that invites the person to try again forever.
    await expect(setMemberRole(CONTEXT, TARGET, "manager")).rejects.toThrow();
    await expect(
      setMemberStatus(CONTEXT, TARGET, "inactive"),
    ).rejects.toThrow();
  });

  it("lets an error with no SQLSTATE propagate", async () => {
    withTenant.mockRejectedValue(new Error("something else entirely"));
    await expect(setMemberRole(CONTEXT, TARGET, "manager")).rejects.toThrow();
  });

  it("does not absorb a failure in the read path", async () => {
    // The list has no refusal shape to fall back on, so a failure there must
    // surface rather than render as an empty workspace.
    withTenant.mockRejectedValue(pgError("40P01"));
    await expect(workspaceMembers(CONTEXT)).rejects.toThrow();
  });
});

describe("the routine's words are read exactly", () => {
  const outcome = (word: string) =>
    withTenant.mockResolvedValue([{ outcome: word }]);

  it.each([
    ["ok", { ok: true }],
    ["not_permitted", { ok: false, reason: "not_permitted" }],
    ["unknown_member", { ok: false, reason: "unknown_member" }],
    ["last_owner_admin", { ok: false, reason: "last_owner_admin" }],
    ["invalid_role", { ok: false, reason: "invalid" }],
    ["invalid_status", { ok: false, reason: "invalid" }],
  ])("maps %s", async (word, expected) => {
    outcome(word);
    expect(await setMemberRole(CONTEXT, TARGET, "manager")).toEqual(expected);
  });

  it.each([
    ["a word this build has never heard of", "some_future_outcome"],
    ["an empty string", ""],
  ])("treats %s as unavailable, never as success", async (_why, word) => {
    outcome(word);
    expect(await setMemberStatus(CONTEXT, TARGET, "active")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("treats no row at all as unavailable", async () => {
    withTenant.mockResolvedValue([]);
    expect(await setMemberRole(CONTEXT, TARGET, "manager")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("the list", () => {
  it("maps the routine's columns onto the member shape", async () => {
    withTenant.mockResolvedValue([
      {
        user_profile_id: TARGET,
        full_name: "Someone",
        member_role: "manager",
        member_status: "inactive",
        is_self: false,
      },
    ]);
    expect(await workspaceMembers(CONTEXT)).toEqual([
      {
        userProfileId: TARGET,
        fullName: "Someone",
        role: "manager",
        status: "inactive",
        isSelf: false,
      },
    ]);
  });

  it("returns an empty list when the routine refuses", async () => {
    withTenant.mockResolvedValue([]);
    expect(await workspaceMembers(CONTEXT)).toEqual([]);
  });
});
