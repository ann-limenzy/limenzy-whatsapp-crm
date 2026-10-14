// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The `/setup` Server Action.
 *
 * Only `createInitialWorkspace` is doubled - it is the boundary this action
 * talks to, and Phase 4C-2 already proves what happens beyond it. What is
 * tested here is the translation in both directions: a FormData becomes
 * exactly six named values, and the operation's answer becomes something safe
 * to serialise into a browser.
 */

const createInitialWorkspace = vi.hoisted(() => vi.fn());
const BootstrapErrorMock = vi.hoisted(
  () =>
    class BootstrapError extends Error {
      readonly reason: "database_unavailable" | "unexpected";
      constructor(reason: "database_unavailable" | "unexpected") {
        super("initial workspace: safe message");
        this.name = "BootstrapError";
        this.reason = reason;
      }
    },
);

vi.mock("@/server/auth/create-initial-workspace", () => ({
  createInitialWorkspace,
  BootstrapError: BootstrapErrorMock,
}));

/**
 * `redirect()` signals by throwing, exactly as Next.js does, so the tests can
 * tell "continued to a fresh request" from "returned a state" — and so a
 * redirect accidentally caught by the action's own `catch` would fail here
 * rather than silently becoming an error message.
 */
class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
}));

const actionsModule = await import("@/app/(account)/setup/actions");
const { createWorkspaceAction } = actionsModule;
const { SETUP_INITIAL_STATE } =
  await import("@/app/(account)/setup/setup-state");

const VALID = {
  fullName: "Ann Sebastian",
  workspaceName: "Limenzy Test Business",
  businessType: "Retail",
  country: "IN",
  currency: "INR",
  timeZone: "Asia/Kolkata",
};

const formDataOf = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
};

const callAction = (
  values: Record<string, string>,
  previous = SETUP_INITIAL_STATE,
) => createWorkspaceAction(previous, formDataOf(values));

/**
 * Submit and read the returned state.
 *
 * A successful submission now redirects instead of returning, so this
 * swallows that one signal — the tests that care about it use `submitFor`.
 * Any other throw still fails the test it happened in.
 */
const submit = async (
  values: Record<string, string>,
  previous = SETUP_INITIAL_STATE,
) => {
  try {
    return await callAction(values, previous);
  } catch (error) {
    if (error instanceof RedirectError) {
      return { status: "redirected", attempt: -1 } as unknown as Awaited<
        ReturnType<typeof createWorkspaceAction>
      >;
    }
    throw error;
  }
};

/** The destination a submission redirected to, or null when it returned state. */
const submitFor = async (
  values: Record<string, string>,
  previous = SETUP_INITIAL_STATE,
): Promise<string | null> => {
  try {
    await callAction(values, previous);
    return null;
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    throw error;
  }
};

afterEach(() => {
  createInitialWorkspace.mockReset();
  redirectMock.mockReset();
  redirectMock.mockImplementation((url: string) => {
    throw new RedirectError(url);
  });
});

redirectMock.mockImplementation((url: string) => {
  throw new RedirectError(url);
});

describe("what reaches the operation", () => {
  it("1. extracts exactly the six approved fields", async () => {
    createInitialWorkspace.mockResolvedValue({ kind: "created" });
    await submit(VALID);

    expect(createInitialWorkspace).toHaveBeenCalledTimes(1);
    const [input] = createInitialWorkspace.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(Object.keys(input).sort()).toEqual([
      "businessType",
      "country",
      "currency",
      "fullName",
      "timeZone",
      "workspaceName",
    ]);
    expect(input).toEqual(VALID);
  });

  it("2. never passes the FormData object through", async () => {
    createInitialWorkspace.mockResolvedValue({ kind: "created" });
    await submit(VALID);
    const [input] = createInitialWorkspace.mock.calls[0] as [unknown];
    expect(input).not.toBeInstanceOf(FormData);
    // A single argument, so no second channel exists either.
    expect(createInitialWorkspace.mock.calls[0]).toHaveLength(1);
  });

  it.each([
    ["3. forged auth id", "authUserId"],
    ["3. forged sub", "sub"],
    ["4. forged workspace id", "workspaceId"],
    ["4. forged profile id", "userProfileId"],
    ["4. forged membership id", "membershipId"],
    ["5. forged role", "role"],
    ["5. forged status", "status"],
    ["5. forged claims", "claims"],
    ["forged redirect", "redirectTo"],
    ["framework field", "$ACTION_ID_abc123"],
  ])("%s is ignored entirely", async (_label, key) => {
    createInitialWorkspace.mockResolvedValue({ kind: "created" });
    await submit({ ...VALID, [key]: "ffffffff-ffff-4fff-8fff-ffffffffffff" });

    const [input] = createInitialWorkspace.mock.calls[0] as [
      Record<string, unknown>,
    ];
    // Not merely overridden - the key never exists in the constructed object.
    expect(Object.keys(input)).not.toContain(key);
    expect(input).toEqual(VALID);
  });

  it("reads a missing or non-string field as an empty string", async () => {
    createInitialWorkspace.mockResolvedValue({ kind: "created" });
    const data = new FormData();
    data.append("fullName", "Ann Sebastian");
    data.append("workspaceName", new Blob(["x"]), "upload.txt");
    // The successful path redirects, which is not what this test is about.
    await createWorkspaceAction(SETUP_INITIAL_STATE, data).catch(
      (error: unknown) => {
        if (!(error instanceof RedirectError)) throw error;
      },
    );

    const [input] = createInitialWorkspace.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(input.workspaceName).toBe("");
    expect(input.country).toBe("");
  });
});

describe("how each outcome is mapped", () => {
  it("8. created continues through a fresh request, carrying nothing", async () => {
    createInitialWorkspace.mockResolvedValue({ kind: "created" });
    // The root route, which re-resolves identity and membership from the
    // database. No id, role or context travels with the redirect — the whole
    // point of the bootstrap result carrying none.
    expect(await submitFor(VALID)).toBe("/");
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("9. already onboarded continues the same way and reveals nothing", async () => {
    createInitialWorkspace.mockResolvedValue({ kind: "already_onboarded" });
    const destination = await submitFor(VALID);
    expect(destination).toBe("/");
    // Not "/dashboard": where an existing member belongs is the root route's
    // decision, made from a fresh resolution, not this action's guess.
    expect(destination).not.toMatch(/dashboard|workspace|owner_admin/i);
  });

  it("10. access unavailable points at an administrator, not at retrying", async () => {
    createInitialWorkspace.mockResolvedValue({ kind: "access_unavailable" });
    const state = await submit(VALID);
    expect(state.status).toBe("access_unavailable");
    expect(state.message).toMatch(/administrator/i);
  });

  it("7. unauthenticated asks the person to sign in again", async () => {
    createInitialWorkspace.mockResolvedValue({ kind: "unauthenticated" });
    const state = await submit(VALID);
    expect(state.status).toBe("unauthenticated");
    expect(state.message).toMatch(/session has expired/i);
  });

  it("6. invalid input becomes field messages without the rejected values", async () => {
    createInitialWorkspace.mockResolvedValue({
      kind: "invalid_input",
      issues: [
        { field: "country", message: "Select a country from the list" },
        { field: "currency", message: "Select a currency from the list" },
        { field: "country", message: "a later duplicate that is ignored" },
      ],
    });
    const state = await submit({ ...VALID, country: "ZZ", currency: "ZZZ" });

    expect(state.status).toBe("invalid");
    expect(state.fieldErrors).toEqual({
      country: "Select a country from the list",
      currency: "Select a currency from the list",
    });
    const surface = JSON.stringify(state);
    expect(surface).not.toContain("ZZ");
    expect(surface).not.toContain("ZZZ");
  });

  it("6. uses a form-level issue as the summary when there is one", async () => {
    createInitialWorkspace.mockResolvedValue({
      kind: "invalid_input",
      issues: [{ field: "form", message: "Unrecognized key: nickname" }],
    });
    const state = await submit(VALID);
    expect(state.status).toBe("invalid");
    expect(state.message).toBe("Unrecognized key: nickname");
    expect(state.fieldErrors).toEqual({});
  });
});

describe("failures never leak", () => {
  const LEAKY_REASON = (reason: "database_unavailable" | "unexpected") => {
    const error = new BootstrapErrorMock(reason);
    // Even if something later attached detail, none of it may escape.
    (error as Error & { cause?: unknown }).cause = {
      query: "select app.create_initial_workspace($1)",
      url: "postgresql://not-a-real-user:not-a-real-password@db.invalid:5432/postgres",
    };
    return error;
  };

  it("11. a temporary failure invites a retry", async () => {
    createInitialWorkspace.mockRejectedValue(
      LEAKY_REASON("database_unavailable"),
    );
    const state = await submit(VALID);
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/try again/i);
  });

  it("12. an unexpected failure is generic and still retryable", async () => {
    createInitialWorkspace.mockRejectedValue(LEAKY_REASON("unexpected"));
    const state = await submit(VALID);
    expect(state.status).toBe("error");
    expect(state.message).toMatch(/something went wrong/i);
  });

  it("12. an error that is not a BootstrapError is handled the same way", async () => {
    createInitialWorkspace.mockRejectedValue(
      new TypeError("fetch failed for postgresql://user:pw@host/db"),
    );
    const state = await submit(VALID);
    expect(state.status).toBe("error");
    expect(JSON.stringify(state)).not.toContain("postgresql://");
  });

  it("13. serialises no message, cause, SQL, URL or reason internals", async () => {
    for (const rejection of [
      LEAKY_REASON("database_unavailable"),
      LEAKY_REASON("unexpected"),
      new Error(
        'connection terminated postgresql://not-a-real-user:not-a-real-password@db.invalid:5432 while executing "select 1"',
      ),
    ]) {
      createInitialWorkspace.mockRejectedValue(rejection);
      const state = await submit(VALID);
      const surface = JSON.stringify(state);
      for (const secret of [
        "postgresql://",
        "not-a-real-password",
        "db.invalid",
        "select app.create_initial_workspace",
        "database_unavailable",
        "initial workspace: safe message",
      ]) {
        expect(`${secret}: ${surface.includes(secret)}`).toBe(
          `${secret}: false`,
        );
      }
      expect(Object.keys(state).sort()).toEqual([
        "attempt",
        "message",
        "status",
      ]);
    }
  });
});

describe("the action's own boundaries", () => {
  it("14/15. imports no navigation, cookie or database module", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = (
      await readFile("src/app/(account)/setup/actions.ts", "utf8")
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    /**
     * `next/navigation` and `redirect(` are now DELIBERATE: the action hands
     * control to a fresh request so membership is re-resolved from the
     * database. Everything else stays forbidden — above all the cookie API,
     * because this action must never write a workspace preference, and the
     * database modules, because it must never mint a context.
     */
    expect(source).toContain("next/navigation");
    expect(source).toMatch(/redirect\("\/"\)/);

    for (const forbidden of [
      "next/headers",
      "cookies(",
      "headers(",
      "postgres",
      "drizzle",
      "runtimeSql",
      "server/db",
      "createTenantContext",
      "withTenant",
      "service_role",
      "DRIZZLE_TOOLING_DATABASE_URL",
    ]) {
      expect(`${forbidden}: ${source.includes(forbidden)}`).toBe(
        `${forbidden}: false`,
      );
    }

    // The only cross-boundary call it makes.
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual([
      "@/app/(account)/setup/setup-state",
      "@/server/auth/create-initial-workspace",
      // Deliberate: the successful path hands control to a fresh request.
      "next/navigation",
    ]);
  });

  it("does not re-submit from a terminal state", async () => {
    for (const status of [
      "created",
      "already_onboarded",
      "access_unavailable",
    ] as const) {
      createInitialWorkspace.mockResolvedValue({ kind: "created" });
      const previous = { status, attempt: 3 } as never;
      const state = await createWorkspaceAction(previous, formDataOf(VALID));
      expect(state).toBe(previous);
      expect(createInitialWorkspace).not.toHaveBeenCalled();
      createInitialWorkspace.mockReset();
    }
  });

  it("counts attempts so the form can announce each failure once", async () => {
    createInitialWorkspace.mockResolvedValue({
      kind: "invalid_input",
      issues: [{ field: "country", message: "Select a country from the list" }],
    });
    const first = await submit(VALID);
    const second = await submit(VALID, first);
    expect(first.attempt).toBe(1);
    expect(second.attempt).toBe(2);
  });

  it("returns frozen state", async () => {
    // A state-returning outcome: `created` now redirects instead.
    createInitialWorkspace.mockResolvedValue({ kind: "access_unavailable" });
    const state = await submit(VALID);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(SETUP_INITIAL_STATE)).toBe(true);
  });
});

describe("it is a valid Server Action module", () => {
  /**
   * The regression this locks down.
   *
   * A file carrying `"use server"` may export **only** async functions. A
   * `SETUP_INITIAL_STATE` object was exported alongside the action, which
   * builds and typechecks perfectly and then fails at dispatch with "a 'use
   * server' file can only export async functions, found object" - so the first
   * real submission of the form was the first thing that noticed. Nothing in
   * the suite covered the module's export *shape*, only its behaviour.
   */
  it("exports exactly one runtime value, and it is an async function", async () => {
    const exports = Object.entries(actionsModule).filter(
      ([, value]) => value !== undefined,
    );

    expect(exports.map(([name]) => name)).toEqual(["createWorkspaceAction"]);

    for (const [name, value] of exports) {
      expect(`${name}: ${typeof value}`).toBe(`${name}: function`);
      // `async function` specifically - a plain function returning a promise
      // is not what Next.js serialises as an action.
      expect(
        `${name}: ${(value as unknown as () => void).constructor.name}`,
      ).toBe(`${name}: AsyncFunction`);
    }
  });

  it("exports no object, array, class or primitive at runtime", async () => {
    for (const [name, value] of Object.entries(actionsModule)) {
      const kind = Array.isArray(value)
        ? "array"
        : value === null
          ? "null"
          : typeof value;
      expect(`${name}: ${kind}`).toBe(`${name}: function`);
    }
  });

  it("declares the directive first and exports no runtime value in source", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/app/(account)/setup/actions.ts", "utf8");

    // The directive must be the first statement, or it is inert.
    const firstStatement = source
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("//"));
    expect(firstStatement).toBe('"use server";');

    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    // `export type` and `export async function` only. Anything else - const,
    // let, var, class, enum, or a plain `export function` - is either an
    // illegal runtime export or a non-async one.
    const exported = [...code.matchAll(/^export\s+(\w+(?:\s+\w+)?)/gm)].map(
      (match) => match[1],
    );
    for (const declaration of exported) {
      expect(declaration).toBe("async function");
    }
    expect(exported).toHaveLength(1);

    // And no re-export can smuggle a value back in.
    expect(code).not.toMatch(/^export\s*\{/m);
    expect(code).not.toMatch(/^export\s+\*/m);
    expect(code).not.toMatch(/^export\s+default/m);
  });

  it("keeps the state module free of the server directive", async () => {
    const { readFile } = await import("node:fs/promises");
    // Comments stripped: the file explains the `use server` rule, and prose
    // about a directive must not read as the directive itself.
    const source = (
      await readFile("src/app/(account)/setup/setup-state.ts", "utf8")
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    // It holds the shared constant, so it must remain importable from both
    // the action and the client form.
    expect(source).not.toContain('"use server"');
    expect(source).not.toContain('"use client"');
    expect(source).not.toContain("server-only");

    const state = await import("@/app/(account)/setup/setup-state");
    expect(Object.isFrozen(state.SETUP_INITIAL_STATE)).toBe(true);
    expect(state.SETUP_INITIAL_STATE).toEqual({ status: "idle", attempt: 0 });
    expect(Object.isFrozen(state.TERMINAL_SETUP_STATUSES)).toBe(true);
  });
});
