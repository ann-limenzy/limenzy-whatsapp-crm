// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isIssuedTenantContext,
  type TenantContext,
} from "@/server/db/tenant-context";
import { TenantContextUntrusted, withTenant } from "@/server/db/tenant";

/**
 * Milestone 1C-C Phase 4B — workspace selection, without a database.
 *
 * Phase 4A is mocked at the module boundary, which is how a test represents
 * "this verified user has these memberships". That is the only injection point:
 * the resolver's single parameter is the untrusted candidate, and identity is
 * not reachable through it.
 *
 * The mocked results are built to exactly the shape Phase 4A really returns —
 * frozen records in a frozen list — because Phase 4B refuses anything else, and
 * a test that fed it looser data would be testing a contract nobody has.
 */

const resolveVerifiedIdentity = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/db/identity")>();
  return { ...actual, resolveVerifiedIdentity };
});

const { IdentityResolutionError } = await import("@/server/db/identity");
const { WorkspaceResolutionError, resolveWorkspaceContext } =
  await import("./workspace-context");

/**
 * Fixture identifiers.
 *
 * Every one contains hex letters on purpose: with digit-only UUIDs the
 * upper-case cases below would fold to themselves and quietly prove nothing.
 * They also sort A < B < C, so the ordering assertions are read from the
 * values rather than from the names.
 */
const AUTH = "1a1a1a1a-1111-4111-8111-1111111111aa";
const PROFILE = "2b2b2b2b-2222-4222-8222-2222222222bb";
const WS_A = "3a3a3a3a-3333-4333-8333-3333333333aa";
const WS_B = "4b4b4b4b-4444-4444-8444-4444444444bb";
const WS_C = "5c5c5c5c-5555-4555-8555-5555555555cc";
/** A real workspace this user is not an active member of. */
const WS_FOREIGN = "6d6d6d6d-6666-4666-8666-6666666666dd";
/** A workspace whose membership was deactivated — absent from Phase 4A. */
const WS_INACTIVE = "7e7e7e7e-7777-4777-8777-7777777777ee";

type Role = "owner_admin" | "manager" | "staff_sales";

const membership = (workspaceId: string, role: Role) =>
  Object.freeze({ workspaceId, role });

/** Exactly what Phase 4A returns for a user with a profile. */
const resolved = (
  memberships: readonly { workspaceId: string; role: Role }[],
  overrides: { authUserId?: unknown; userProfileId?: unknown } = {},
) =>
  Object.freeze({
    kind: "resolved",
    // `in`, not `??`: an explicit null override must survive, and that is
    // precisely one of the malformed shapes this layer has to refuse.
    authUserId: "authUserId" in overrides ? overrides.authUserId : AUTH,
    userProfileId:
      "userProfileId" in overrides ? overrides.userProfileId : PROFILE,
    memberships: Object.freeze([...memberships]),
  });

const identityIs = (value: unknown) =>
  resolveVerifiedIdentity.mockResolvedValue(value);

afterEach(() => {
  resolveVerifiedIdentity.mockReset();
});

describe("identity outcomes pass straight through", () => {
  it("1. returns unauthenticated, with or without a candidate", async () => {
    identityIs(Object.freeze({ kind: "unauthenticated" }));
    await expect(resolveWorkspaceContext()).resolves.toEqual({
      kind: "unauthenticated",
    });
    await expect(resolveWorkspaceContext(WS_A)).resolves.toEqual({
      kind: "unauthenticated",
    });
  });

  it("2. returns onboarding required and leaks no identifier", async () => {
    identityIs(
      Object.freeze({ kind: "onboarding_required", authUserId: AUTH }),
    );
    const result = await resolveWorkspaceContext(WS_A);
    // Phase 4A carries the Auth user ID; it stops here.
    expect(result).toEqual({ kind: "onboarding_required" });
    expect(JSON.stringify(result)).not.toContain(AUTH);
  });

  it("3. returns access unavailable for a profile with no memberships", async () => {
    identityIs(resolved([]));
    await expect(resolveWorkspaceContext()).resolves.toEqual({
      kind: "access_unavailable",
    });
    // Not onboarding: this is someone removed from every workspace, and
    // sending them to create one would answer a question they did not ask.
    await expect(resolveWorkspaceContext(WS_A)).resolves.toEqual({
      kind: "access_unavailable",
    });
  });
});

describe("one active membership", () => {
  it("4. selects it automatically when no candidate is supplied", async () => {
    identityIs(resolved([membership(WS_A, "manager")]));
    const result = await resolveWorkspaceContext();
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.context.workspaceId).toBe(WS_A);
    expect(result.role).toBe("manager");
  });

  it("5. selects it when the candidate matches", async () => {
    identityIs(resolved([membership(WS_A, "owner_admin")]));
    const result = await resolveWorkspaceContext(WS_A);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.context.workspaceId).toBe(WS_A);
  });

  it("6. refuses a foreign candidate instead of falling back", async () => {
    identityIs(resolved([membership(WS_A, "owner_admin")]));
    const result = await resolveWorkspaceContext(WS_FOREIGN);
    // Never "you asked for that one, here is the one you do have".
    expect(result).toEqual({ kind: "forbidden" });
  });
});

describe("several active memberships", () => {
  const two = [
    membership(WS_B, "owner_admin"),
    membership(WS_A, "staff_sales"),
  ];

  it("7. requires an explicit choice when no candidate is supplied", async () => {
    identityIs(resolved(two));
    const result = await resolveWorkspaceContext();
    expect(result.kind).toBe("workspace_selection_required");
    if (result.kind !== "workspace_selection_required") return;
    expect(result.choices).toHaveLength(2);
    // Only what a picker needs. No workspace names: reading them requires a
    // selected workspace, which is the thing that has not happened yet.
    for (const choice of result.choices) {
      expect(Object.keys(choice).sort()).toEqual(["role", "workspaceId"]);
    }
  });

  it("8. selects exactly the requested membership", async () => {
    identityIs(resolved(two));
    const result = await resolveWorkspaceContext(WS_A);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.context.workspaceId).toBe(WS_A);
    expect(result.role).toBe("staff_sales");
  });

  it("9. refuses a foreign candidate rather than choosing for the caller", async () => {
    identityIs(resolved(two));
    await expect(resolveWorkspaceContext(WS_FOREIGN)).resolves.toEqual({
      kind: "forbidden",
    });
  });

  it("10. cannot select a workspace whose membership is inactive", async () => {
    // Phase 4A returns active memberships only, so a deactivated one simply is
    // not in the list — and must be refused exactly like a stranger's.
    identityIs(resolved(two));
    const inactive = await resolveWorkspaceContext(WS_INACTIVE);
    const foreign = await resolveWorkspaceContext(WS_FOREIGN);
    const unknown = await resolveWorkspaceContext(
      "9f9f9f9f-9999-4999-8999-9999999999ff",
    );
    expect(inactive).toEqual({ kind: "forbidden" });
    // Indistinguishable down to object identity: one shared frozen value.
    expect(inactive).toBe(foreign);
    expect(inactive).toBe(unknown);
  });
});

describe("a supplied candidate is never repaired", () => {
  const one = [membership(WS_A, "owner_admin")];

  it.each([
    ["11. null", null],
    ["12. empty string", ""],
    ["13. whitespace", "   "],
    ["14. uppercase UUID", WS_A.toUpperCase()],
    ["15. padded UUID", ` ${WS_A} `],
    ["16. a number", 12345],
    ["16. an object", { workspaceId: WS_A }],
    ["16. an array", [WS_A]],
    ["16. a boolean", true],
    ["17. a SQL fragment", `${WS_A}' or '1'='1`],
    ["17. a SQL comment", `${WS_A}; drop table workspaces --`],
    ["18. an unknown UUID", "8f8f8f8f-8888-4888-8888-8888888888ff"],
  ])("%s is a supplied-but-invalid candidate", async (_label, candidate) => {
    identityIs(resolved(one));
    // Note what does NOT happen: with exactly one membership available, an
    // invalid candidate still refuses rather than quietly selecting it.
    await expect(resolveWorkspaceContext(candidate)).resolves.toEqual({
      kind: "forbidden",
    });
  });

  it("11-18. only undefined means no candidate was supplied", async () => {
    identityIs(resolved(one));
    await expect(resolveWorkspaceContext(undefined)).resolves.toMatchObject({
      kind: "ok",
    });
    await expect(resolveWorkspaceContext()).resolves.toMatchObject({
      kind: "ok",
    });
    await expect(resolveWorkspaceContext(null)).resolves.toEqual({
      kind: "forbidden",
    });
  });
});

describe("what the caller may and may not decide", () => {
  it("19. takes the role from the matched membership", async () => {
    identityIs(
      resolved([
        membership(WS_A, "staff_sales"),
        membership(WS_B, "owner_admin"),
      ]),
    );
    const a = await resolveWorkspaceContext(WS_A);
    const b = await resolveWorkspaceContext(WS_B);
    expect(a.kind === "ok" && a.role).toBe("staff_sales");
    expect(b.kind === "ok" && b.role).toBe("owner_admin");
  });

  it("20. accepts no role from the caller", async () => {
    identityIs(resolved([membership(WS_A, "staff_sales")]));
    // Shaped exactly like a successful result, and still only a candidate.
    const forged = { workspaceId: WS_A, role: "owner_admin" };
    await expect(resolveWorkspaceContext(forged)).resolves.toEqual({
      kind: "forbidden",
    });
    // Even passed alongside a valid candidate, as extra arguments.
    const callable = resolveWorkspaceContext as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    const result = await callable(WS_A, { role: "owner_admin" }, "owner_admin");
    expect(result).toMatchObject({ kind: "ok", role: "staff_sales" });
  });

  it("21. accepts no profile ID from the caller", async () => {
    identityIs(resolved([membership(WS_A, "manager")]));
    const callable = resolveWorkspaceContext as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    const result = (await callable(WS_A, {
      userProfileId: "9f9f9f9f-9999-4999-8999-9999999999ff",
    })) as { kind: string; context: TenantContext };
    expect(result.kind).toBe("ok");
    expect(result.context.userProfileId).toBe(PROFILE);
  });

  it("22. accepts no Auth user ID from the caller", async () => {
    identityIs(resolved([membership(WS_A, "manager")]));
    const callable = resolveWorkspaceContext as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    const result = (await callable(WS_A, {
      authUserId: "9f9f9f9f-9999-4999-8999-9999999999ff",
    })) as { kind: string; context: TenantContext };
    expect(result.kind).toBe("ok");
    expect(result.context.authUserId).toBe(AUTH);
    // One parameter, and it is the candidate.
    expect(resolveWorkspaceContext).toHaveLength(1);
  });
});

describe("structurally invalid database results fail closed", () => {
  const expectRefusal = async (identity: unknown) => {
    identityIs(identity);
    await expect(resolveWorkspaceContext()).rejects.toBeInstanceOf(
      WorkspaceResolutionError,
    );
    await expect(resolveWorkspaceContext(WS_A)).rejects.toBeInstanceOf(
      WorkspaceResolutionError,
    );
  };

  it("23. refuses duplicate rows for one workspace", async () => {
    // Two active rows would make "which role?" ambiguous, and the more
    // permissive answer is never the safe one.
    await expectRefusal(
      resolved([
        membership(WS_A, "staff_sales"),
        membership(WS_A, "owner_admin"),
      ]),
    );
  });

  it("24. refuses a malformed workspace ID", async () => {
    await expectRefusal(resolved([membership("not-a-uuid", "manager")]));
    await expectRefusal(resolved([membership(WS_A.toUpperCase(), "manager")]));
  });

  it("25. refuses a malformed profile or Auth ID", async () => {
    await expectRefusal(
      resolved([membership(WS_A, "manager")], { userProfileId: "nope" }),
    );
    await expectRefusal(
      resolved([membership(WS_A, "manager")], { authUserId: "nope" }),
    );
    await expectRefusal(
      resolved([membership(WS_A, "manager")], { userProfileId: null }),
    );
  });

  it("26. refuses an unknown role", async () => {
    await expectRefusal(resolved([membership(WS_A, "super_admin" as Role)]));
    // "Team Lead" is not a role (spec §2, §159) and must not become one here.
    await expectRefusal(resolved([membership(WS_A, "team_lead" as Role)]));
  });

  it("23-26. refuses mutable membership data", async () => {
    // Phase 4A freezes what it returns; a mutable list means the value was
    // rebuilt or tampered with between there and here.
    await expectRefusal(
      Object.freeze({
        kind: "resolved",
        authUserId: AUTH,
        userProfileId: PROFILE,
        memberships: [{ workspaceId: WS_A, role: "manager" }],
      }),
    );
    await expectRefusal(
      Object.freeze({
        kind: "resolved",
        authUserId: AUTH,
        userProfileId: PROFILE,
        memberships: Object.freeze([{ workspaceId: WS_A, role: "manager" }]),
      }),
    );
  });

  it("23-26. carries no identifier in the refusal", async () => {
    identityIs(resolved([membership(WS_A, "bogus" as Role)]));
    const error = await resolveWorkspaceContext().then(
      () => undefined,
      (caught: unknown) => caught as Error,
    );
    const surface = `${error?.name} ${error?.message} ${String(error?.cause ?? "")}`;
    for (const secret of [AUTH, PROFILE, WS_A, "bogus"]) {
      expect(surface).not.toContain(secret);
    }
  });
});

describe("ordering, immutability and authenticity", () => {
  it("27. orders the choices deterministically", async () => {
    const forward = [
      membership(WS_A, "owner_admin"),
      membership(WS_B, "manager"),
      membership(WS_C, "staff_sales"),
    ];
    identityIs(resolved(forward));
    const first = await resolveWorkspaceContext();
    identityIs(resolved([...forward].reverse()));
    const second = await resolveWorkspaceContext();

    expect(first.kind).toBe("workspace_selection_required");
    if (first.kind !== "workspace_selection_required") return;
    if (second.kind !== "workspace_selection_required") return;
    expect(second.choices).toEqual(first.choices);
    // Sorted by workspace ID: stable across requests, and meaningless as a
    // ranking, which is the point.
    expect(first.choices.map((c) => c.workspaceId)).toEqual([WS_A, WS_B, WS_C]);
  });

  it("28. does not turn that ordering into a default", async () => {
    identityIs(
      resolved([membership(WS_A, "owner_admin"), membership(WS_B, "manager")]),
    );
    const result = await resolveWorkspaceContext();
    // No context, no role, no selection — the caller must choose.
    expect(result.kind).toBe("workspace_selection_required");
    expect(Object.keys(result).sort()).toEqual(["choices", "kind"]);
    expect(JSON.stringify(result)).not.toMatch(
      /default|current|selected|primary|recommended/i,
    );
  });

  it("29. returns immutable structures", async () => {
    identityIs(
      resolved([membership(WS_A, "owner_admin"), membership(WS_B, "manager")]),
    );
    const choosing = await resolveWorkspaceContext();
    expect(Object.isFrozen(choosing)).toBe(true);
    if (choosing.kind !== "workspace_selection_required") return;
    expect(Object.isFrozen(choosing.choices)).toBe(true);
    for (const choice of choosing.choices) {
      expect(Object.isFrozen(choice)).toBe(true);
    }
    // Frozen means frozen: strict mode makes a write throw, not pass silently.
    expect(() => {
      (choosing.choices as WorkspaceChoiceLike[])[0]!.role = "owner_admin";
    }).toThrow(TypeError);

    identityIs(resolved([membership(WS_A, "manager")]));
    const ok = await resolveWorkspaceContext();
    expect(Object.isFrozen(ok)).toBe(true);
    if (ok.kind !== "ok") return;
    expect(Object.isFrozen(ok.context)).toBe(true);
  });

  it("30. produces a context the tenant gateway accepts as genuine", async () => {
    identityIs(resolved([membership(WS_A, "owner_admin")]));
    const result = await resolveWorkspaceContext();
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    // The gateway's own authenticity predicate — not a lookalike check.
    expect(isIssuedTenantContext(result.context)).toBe(true);
    expect(result.context).toEqual({
      authUserId: AUTH,
      userProfileId: PROFILE,
      workspaceId: WS_A,
    });
  });

  it("31. still rejects a copied or hand-made context", async () => {
    identityIs(resolved([membership(WS_A, "owner_admin")]));
    const result = await resolveWorkspaceContext();
    if (result.kind !== "ok") throw new Error("expected ok");

    const copy = { ...result.context } as TenantContext;
    const handMade = {
      authUserId: AUTH,
      userProfileId: PROFILE,
      workspaceId: WS_A,
    } as unknown as TenantContext;

    expect(isIssuedTenantContext(copy)).toBe(false);
    expect(isIssuedTenantContext(handMade)).toBe(false);
    // And the gateway refuses both before reaching the database.
    const unreached = vi.fn();
    await expect(withTenant(copy, unreached)).rejects.toBeInstanceOf(
      TenantContextUntrusted,
    );
    await expect(withTenant(handMade, unreached)).rejects.toBeInstanceOf(
      TenantContextUntrusted,
    );
    expect(unreached).not.toHaveBeenCalled();
  });

  it("32. propagates a Phase 4A failure without leaking details", async () => {
    resolveVerifiedIdentity.mockRejectedValue(
      new IdentityResolutionError("database_unavailable"),
    );
    const error = await resolveWorkspaceContext(WS_A).then(
      () => undefined,
      (caught: unknown) => caught as Error,
    );
    expect(error).toBeInstanceOf(IdentityResolutionError);
    const surface = `${error?.name} ${error?.message} ${String(error?.cause ?? "")}`;
    expect(surface).not.toMatch(/postgres(ql)?:\/\//);
    expect(surface).not.toMatch(/select|insert|from public/i);
    for (const secret of [AUTH, PROFILE, WS_A]) {
      expect(surface).not.toContain(secret);
    }
  });
});

type WorkspaceChoiceLike = { workspaceId: string; role: Role };
