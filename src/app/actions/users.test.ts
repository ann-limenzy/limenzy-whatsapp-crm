import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Authorization for the Settings → Users mutations — spec §159, §160, §162.
 *
 * A Server Action is reachable by anyone who can POST to it, so these ask what
 * happens when someone calls it who should not, and whether anything in the
 * payload can change who the server thinks is calling or which workspace is
 * written.
 *
 * The database answers the same questions from the other side in
 * `src/server/db/users-isolation.db.test.ts`. Neither replaces the other: this
 * one proves nothing reaches the database, that one proves the database
 * refuses it if something ever does.
 */

const requireWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-workspace", () => ({ requireWorkspaceContext }));

const setMemberRole = vi.hoisted(() => vi.fn());
const setMemberStatus = vi.hoisted(() => vi.fn());
const deactivateMember = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-members", () => ({
  deactivateMember,
  setMemberRole,
  setMemberStatus,
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const { setMemberRoleAction, setMemberStatusAction } = await import("./users");

const ACTOR = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const CONTEXT = { workspaceId: "w", userProfileId: ACTOR };
const IDLE = { status: "idle" as const, attempt: 0 };

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  const all = {
    renderedWorkspaceId: "w",
    userProfileId: TARGET,
    ...fields,
  };
  for (const [key, value] of Object.entries(all)) data.set(key, value);
  return data;
};

const roleForm = (overrides: Record<string, string> = {}) =>
  form({ role: "manager", ...overrides });
const statusForm = (overrides: Record<string, string> = {}) =>
  form({ status: "inactive", ...overrides });

const as = (role: string) =>
  requireWorkspaceContext.mockResolvedValue({
    context: CONTEXT,
    role,
    workspaceId: "w",
  });

beforeEach(() => {
  vi.clearAllMocks();
  setMemberRole.mockResolvedValue({ ok: true });
  setMemberStatus.mockResolvedValue({ ok: true });
  deactivateMember.mockResolvedValue({ ok: true });
});

describe("only an Owner/Admin may manage users (§162)", () => {
  it("allows an owner_admin to change a role", async () => {
    as("owner_admin");
    const state = await setMemberRoleAction(IDLE, roleForm());
    expect(state.status).toBe("ok");
    expect(setMemberRole).toHaveBeenCalledWith(CONTEXT, TARGET, "manager");
  });

  it("allows an owner_admin to deactivate", async () => {
    as("owner_admin");
    const state = await setMemberStatusAction(IDLE, statusForm());
    expect(state.status).toBe("ok");
    // Deactivation goes through the gateway that also checks §160, in one
    // transaction; see "the §160 precondition" below.
    expect(deactivateMember).toHaveBeenCalledWith(CONTEXT, TARGET);
  });

  it.each(["manager", "staff_sales"])(
    "refuses a %s changing a role",
    async (role) => {
      as(role);
      const state = await setMemberRoleAction(IDLE, roleForm());
      expect(state.status).toBe("forbidden");
      // The decisive assertion: nothing reached the database.
      expect(setMemberRole).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it.each(["manager", "staff_sales"])(
    "refuses a %s deactivating",
    async (role) => {
      as(role);
      const state = await setMemberStatusAction(IDLE, statusForm());
      expect(state.status).toBe("forbidden");
      expect(setMemberStatus).not.toHaveBeenCalled();
    },
  );

  it("refuses an unrecognised role rather than falling through", async () => {
    as("some_future_role");
    expect((await setMemberRoleAction(IDLE, roleForm())).status).toBe(
      "forbidden",
    );
    expect(setMemberRole).not.toHaveBeenCalled();
  });

  it("takes the actor's role from the membership, never from the form", async () => {
    as("manager");
    const state = await setMemberRoleAction(
      IDLE,
      roleForm({ actorRole: "owner_admin" }),
    );
    expect(state.status).toBe("forbidden");
    expect(setMemberRole).not.toHaveBeenCalled();
  });

  it("checks authorization before anything the browser sent", async () => {
    as("manager");
    const data = new FormData();
    data.set("userProfileId", "not-a-uuid");
    const state = await setMemberStatusAction(IDLE, data);
    // Not "invalid" and not "stale": a Manager learns only that they may not
    // do this.
    expect(state.status).toBe("forbidden");
  });

  it("resolves the workspace before doing anything else", async () => {
    requireWorkspaceContext.mockRejectedValue(new Error("not signed in"));
    await expect(setMemberRoleAction(IDLE, roleForm())).rejects.toThrow();
    expect(setMemberRole).not.toHaveBeenCalled();
  });
});

describe("a list rendered for another workspace cannot change this one", () => {
  it("refuses when the rendered workspace is not the resolved one", async () => {
    as("owner_admin");
    const state = await setMemberRoleAction(
      IDLE,
      roleForm({ renderedWorkspaceId: "another-workspace" }),
    );
    expect(state.status).toBe("stale");
    expect(setMemberRole).not.toHaveBeenCalled();
  });

  it("refuses a submission that names no workspace at all", async () => {
    as("owner_admin");
    const data = statusForm();
    data.delete("renderedWorkspaceId");
    expect((await setMemberStatusAction(IDLE, data)).status).toBe("stale");
    expect(setMemberStatus).not.toHaveBeenCalled();
  });

  it("still passes the resolved context, never a workspace from the payload", async () => {
    as("owner_admin");
    await setMemberRoleAction(IDLE, roleForm({ workspaceId: "elsewhere" }));
    expect(setMemberRole).toHaveBeenCalledWith(CONTEXT, TARGET, "manager");
    expect(setMemberRole.mock.calls[0]?.[0]).toBe(CONTEXT);
  });
});

describe("input validation", () => {
  it.each([
    ["a missing profile id", {}, true],
    ["a non-UUID profile id", { userProfileId: "nope" }, false],
    [
      "an all-zero UUID",
      { userProfileId: "00000000-0000-0000-0000-000000000000" },
      false,
    ],
  ])("rejects %s", async (_why, overrides, remove) => {
    as("owner_admin");
    const data = roleForm(overrides as Record<string, string>);
    if (remove) data.delete("userProfileId");
    expect((await setMemberRoleAction(IDLE, data)).status).toBe("invalid");
    expect(setMemberRole).not.toHaveBeenCalled();
  });

  it.each(["team_lead", "", "OWNER_ADMIN", "owner admin", "toString"])(
    "rejects the role %s",
    async (role) => {
      as("owner_admin");
      expect((await setMemberRoleAction(IDLE, roleForm({ role }))).status).toBe(
        "invalid",
      );
      expect(setMemberRole).not.toHaveBeenCalled();
    },
  );

  it.each(["deleted", "", "ACTIVE", "archived"])(
    "rejects the status %s",
    async (status) => {
      as("owner_admin");
      expect(
        (await setMemberStatusAction(IDLE, statusForm({ status }))).status,
      ).toBe("invalid");
      expect(setMemberStatus).not.toHaveBeenCalled();
    },
  );

  it("accepts all three roles", async () => {
    as("owner_admin");
    for (const role of ["owner_admin", "manager", "staff_sales"]) {
      vi.clearAllMocks();
      setMemberRole.mockResolvedValue({ ok: true });
      await setMemberRoleAction(IDLE, roleForm({ role }));
      expect(setMemberRole).toHaveBeenCalledWith(CONTEXT, TARGET, role);
    }
  });
});

describe("what the list is told afterwards", () => {
  it.each([
    ["not_permitted", "forbidden"],
    ["unknown_member", "unknown_member"],
    ["last_owner_admin", "last_owner_admin"],
    ["invalid", "invalid"],
    ["unavailable", "unavailable"],
  ])("maps the gateway refusal %s onto %s", async (reason, status) => {
    as("owner_admin");
    setMemberRole.mockResolvedValue({ ok: false, reason });
    const state = await setMemberRoleAction(IDLE, roleForm());
    expect(state.status).toBe(status);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates the whole tree, because access may have changed", async () => {
    as("owner_admin");
    await setMemberRoleAction(IDLE, roleForm());
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("flags a change to the actor's own membership", async () => {
    as("owner_admin");
    const state = await setMemberStatusAction(
      IDLE,
      statusForm({ userProfileId: ACTOR }),
    );
    expect(state.selfAffected).toBe(true);
  });

  it("does not flag a change to somebody else's", async () => {
    as("owner_admin");
    const state = await setMemberStatusAction(IDLE, statusForm());
    expect(state.selfAffected).toBe(false);
  });

  it("decides self from the resolved membership, not from the payload", async () => {
    as("owner_admin");
    const state = await setMemberStatusAction(
      IDLE,
      statusForm({ isSelf: "true" }),
    );
    expect(state.selfAffected).toBe(false);
  });

  it("advances the attempt counter on two identical failures", async () => {
    as("manager");
    const first = await setMemberRoleAction(IDLE, roleForm());
    const second = await setMemberRoleAction(first, roleForm());
    expect(second.attempt).toBe(first.attempt + 1);
  });
});

describe("the §160 precondition is consulted on deactivation", () => {
  it("does not consult it when reactivating", async () => {
    // Reactivation strands nothing, so it has no precondition in §160.
    as("owner_admin");
    const state = await setMemberStatusAction(
      IDLE,
      statusForm({ status: "active" }),
    );
    expect(state.status).toBe("ok");
    expect(setMemberStatus).toHaveBeenCalledWith(CONTEXT, TARGET, "active");
  });

  it("deactivates through the gateway that checks §160 in one transaction", async () => {
    /*
     * The count and the status change cannot be separate statements: a Lead
     * created between them would leave someone deactivated and still owning
     * work. `deactivateMember` is where both happen, under one lock, so the
     * action's job here is only to ask it and translate the answer.
     */
    as("owner_admin");
    expect((await setMemberStatusAction(IDLE, statusForm())).status).toBe("ok");
    expect(deactivateMember).toHaveBeenCalledWith(CONTEXT, TARGET);
    expect(setMemberStatus).not.toHaveBeenCalled();
  });

  it("refuses while the person is the Record Owner of a lead", async () => {
    /*
     * §160: active responsibilities must be reassigned to an active user
     * before deactivation. There is no reassignment workflow yet, so this is
     * a refusal with no offered remedy — the order the registry describes,
     * and a limitation recorded with it rather than smoothed over here.
     */
    as("owner_admin");
    deactivateMember.mockResolvedValue({ ok: false, reason: "blocked" });
    const state = await setMemberStatusAction(IDLE, statusForm());
    expect(state.status).toBe("blocked_by_responsibilities");
  });

  it("passes a concurrency abort through as the safe result", async () => {
    // The gateway maps 40001/40P01 to `unavailable` and does not retry.
    as("owner_admin");
    deactivateMember.mockResolvedValue({ ok: false, reason: "unavailable" });
    expect((await setMemberStatusAction(IDLE, statusForm())).status).toBe(
      "unavailable",
    );
  });

  it("reactivates through the ordinary status gateway", async () => {
    // Reactivation strands nothing, so it has no §160 precondition and no
    // reason to take the heavier path.
    as("owner_admin");
    const state = await setMemberStatusAction(
      IDLE,
      statusForm({ status: "active" }),
    );
    expect(state.status).toBe("ok");
    expect(setMemberStatus).toHaveBeenCalledWith(CONTEXT, TARGET, "active");
    expect(deactivateMember).not.toHaveBeenCalled();
  });
});
