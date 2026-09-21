// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Milestone 1C-C Phase 4C-2 - the operation, without a database.
 *
 * Two test-side substitutions, both of existing modules: the verified-auth
 * utility (how a test says "this user is signed in") and the runtime pool
 * boundary. There is no production seam, setter or environment branch, and the
 * operation takes exactly one argument.
 *
 * The fake pool records every statement and every bound value, so "it sets
 * only app.auth_user_id" and "it sends the normalized values" are observed
 * rather than assumed. It also refuses to be opened at all on the paths where
 * no connection may be made.
 */

const getAuthenticatedUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-user", () => ({ getAuthenticatedUser }));

type Statement = { sql: string; values: unknown[] };

const H = vi.hoisted(() => ({
  opened: 0,
  statements: [] as { sql: string; values: unknown[] }[],
  outcome: "created" as unknown,
  throwOnCall: null as unknown,
  throwOnConnect: null as unknown,
}));

vi.mock("@/server/db/client", () => ({
  runtimeSql: () => ({
    begin: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      H.opened += 1;
      if (H.throwOnConnect) throw H.throwOnConnect;
      const tx = (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?").replace(/\s+/g, " ").trim();
        H.statements.push({ sql, values });
        if (sql.includes("create_initial_workspace")) {
          if (H.throwOnCall) throw H.throwOnCall;
          return Promise.resolve([{ outcome: H.outcome }]);
        }
        return Promise.resolve([]);
      };
      return fn(tx);
    },
  }),
}));

const { BootstrapError, createInitialWorkspace } =
  await import("./create-initial-workspace");

const AUTH = "1a1a1a1a-1111-4111-8111-1111111111aa";

const VERIFIED = {
  id: AUTH,
  email: "person@example.com",
  emailVerified: true,
  fullName: "Metadata Name",
};

const VALID = {
  fullName: "Ann Sebastian",
  workspaceName: "Limenzy Test Business",
  businessType: "Retail",
  country: "IN",
  currency: "INR",
  timeZone: "Asia/Kolkata",
};

const signedIn = (overrides: Record<string, unknown> = {}) =>
  getAuthenticatedUser.mockResolvedValue({ ...VERIFIED, ...overrides });

const call = (input: unknown) => createInitialWorkspace(input);

const issuesOf = async (input: unknown) => {
  const result = await call(input);
  expect(result.kind).toBe("invalid_input");
  return result.kind === "invalid_input" ? result.issues : [];
};

const fieldsOf = async (input: unknown) =>
  (await issuesOf(input)).map((i) => i.field);

const statement = (fragment: string): Statement | undefined =>
  H.statements.find((s) => s.sql.includes(fragment));

beforeEach(() => {
  H.opened = 0;
  H.statements = [];
  H.outcome = "created";
  H.throwOnCall = null;
  H.throwOnConnect = null;
  signedIn();
});

afterEach(() => {
  getAuthenticatedUser.mockReset();
});

describe("identity comes only from verified claims", () => {
  it("1. returns unauthenticated when nobody is signed in", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    await expect(call(VALID)).resolves.toEqual({ kind: "unauthenticated" });
    expect(H.opened).toBe(0);
  });

  it("2. returns unauthenticated when the email is not verified", async () => {
    signedIn({ emailVerified: false });
    await expect(call(VALID)).resolves.toEqual({ kind: "unauthenticated" });
    expect(H.opened).toBe(0);
  });

  it.each([
    ["3. empty", ""],
    ["4. not a uuid", "definitely-not-a-uuid"],
    ["5. uppercase", AUTH.toUpperCase()],
    ["6. padded", ` ${AUTH} `],
    ["7. truncated", AUTH.slice(0, 20)],
    ["8. not a string", 12345],
    ["8. null", null],
    ["9. sql-shaped", `${AUTH}'; drop table public.workspaces --`],
    ["9. or-injection", `${AUTH}' or '1'='1`],
  ])("%s sub is refused before any connection", async (_label, sub) => {
    signedIn({ id: sub });
    await expect(call(VALID)).resolves.toEqual({ kind: "unauthenticated" });
    expect(H.opened).toBe(0);
  });

  it("reads identity from the utility, never from the submission", async () => {
    await call(VALID);
    expect(getAuthenticatedUser).toHaveBeenCalledWith();
    // The submitted name is display data; the identity is the claim.
    expect(statement("set_config")?.values).toEqual(["app.auth_user_id", AUTH]);
  });
});

describe("input validation", () => {
  const without = (key: string) => {
    const copy: Record<string, unknown> = { ...VALID };
    delete copy[key];
    return copy;
  };

  it.each(["fullName", "workspaceName", "country", "currency", "timeZone"])(
    "10/11/12. rejects %s when missing, null or the wrong type",
    async (field) => {
      expect(await fieldsOf(without(field))).toContain(field);
      expect(await fieldsOf({ ...VALID, [field]: null })).toContain(field);
      expect(await fieldsOf({ ...VALID, [field]: 42 })).toContain(field);
      expect(await fieldsOf({ ...VALID, [field]: {} })).toContain(field);
      expect(H.opened).toBe(0);
    },
  );

  it.each(["fullName", "workspaceName", "country", "currency", "timeZone"])(
    "13. rejects a blank or whitespace-only %s",
    async (field) => {
      expect(await fieldsOf({ ...VALID, [field]: "" })).toContain(field);
      expect(await fieldsOf({ ...VALID, [field]: "   " })).toContain(field);
    },
  );

  it("14. accepts the minimum and maximum boundaries", async () => {
    const result = await call({
      ...VALID,
      fullName: "Jo".padEnd(120, "x"),
      workspaceName: "Ab".padEnd(160, "y"),
      businessType: "B".padEnd(120, "z"),
    });
    expect(result).toEqual({ kind: "created" });

    // ...and the shortest permitted values.
    H.statements = [];
    await expect(
      call({ ...VALID, fullName: "Jo", workspaceName: "Ab" }),
    ).resolves.toEqual({ kind: "created" });
  });

  it("15. rejects over-length values", async () => {
    expect(await fieldsOf({ ...VALID, fullName: "x".repeat(121) })).toContain(
      "fullName",
    );
    expect(
      await fieldsOf({ ...VALID, workspaceName: "x".repeat(161) }),
    ).toContain("workspaceName");
    expect(
      await fieldsOf({ ...VALID, businessType: "x".repeat(121) }),
    ).toContain("businessType");
    expect(await fieldsOf({ ...VALID, timeZone: "A".repeat(101) })).toContain(
      "timeZone",
    );
    expect(H.opened).toBe(0);
  });

  it.each([
    ["fullName", "Ann" + "\u0000"],
    ["fullName", ["Ann", "Sebastian"].join("\u000a")],
    ["workspaceName", "Limenzy" + "\u0000"],
    ["workspaceName", ["Limenzy", "Ltd"].join("\u0009")],
    ["businessType", "Retail" + "\u001b"],
    ["country", "I" + "\u0000" + "N"],
    ["currency", "IN" + "\u007f" + "R"],
    ["timeZone", "Asia/" + "\u0000" + "Kolkata"],
  ])("16. rejects a control character in %s", async (field, value) => {
    expect(await fieldsOf({ ...VALID, [field]: value })).toContain(field);
    expect(H.opened).toBe(0);
  });

  it("17/18/19/20. treats business type as optional free text", async () => {
    const businessTypeSent = () =>
      statement("create_initial_workspace")?.values[2];

    // Omitted entirely.
    H.statements = [];
    await expect(call(without("businessType"))).resolves.toEqual({
      kind: "created",
    });
    expect(businessTypeSent()).toBeNull();

    // Explicitly null.
    H.statements = [];
    await call({ ...VALID, businessType: null });
    expect(businessTypeSent()).toBeNull();

    // Whitespace-only becomes null, never an empty string.
    H.statements = [];
    await call({ ...VALID, businessType: "   " });
    expect(businessTypeSent()).toBeNull();

    // A real value is trimmed and kept, and is not restricted to the eight
    // suggestions in spec 7.
    H.statements = [];
    await call({ ...VALID, businessType: "  Boutique Bakery  " });
    expect(businessTypeSent()).toBe("Boutique Bakery");
  });

  it("21/22. normalizes country and rejects an unassigned code", async () => {
    H.statements = [];
    await call({ ...VALID, country: " in " });
    expect(statement("create_initial_workspace")?.values[3]).toBe("IN");

    for (const bad of ["ZZ", "XX", "IND", "I", "India", "99"]) {
      expect(await fieldsOf({ ...VALID, country: bad })).toContain("country");
    }
  });

  it("23/24. normalizes currency and rejects an unassigned code", async () => {
    H.statements = [];
    await call({ ...VALID, currency: " inr " });
    expect(statement("create_initial_workspace")?.values[4]).toBe("INR");

    for (const bad of ["ZZZ", "XXXX", "IN", "Rupee", "$", "12345"]) {
      expect(await fieldsOf({ ...VALID, currency: bad })).toContain("currency");
    }
  });

  it("25/26/27. accepts real IANA zones and rejects offsets and inventions", async () => {
    for (const zone of [
      "Asia/Kolkata",
      "Europe/London",
      "America/Argentina/Buenos_Aires",
      "UTC",
      "Etc/GMT+5",
    ]) {
      H.statements = [];
      const result = await call({ ...VALID, timeZone: zone });
      expect(`${zone}: ${result.kind}`).toBe(`${zone}: created`);
      expect(statement("create_initial_workspace")?.values[5]).toBe(zone);
    }

    // The five accepted zones above each opened a connection, legitimately.
    H.opened = 0;

    for (const bad of [
      "+05:30",
      "-08:00",
      "05:30",
      "GMT+5:30",
      "Mars/Olympus",
      "Asia/Nowhere",
      // Lower case is refused on purpose: the database trigger compares
      // pg_timezone_names exactly, so accepting this would turn a form
      // mistake into a database error.
      "asia/kolkata",
      "ASIA/KOLKATA",
    ]) {
      expect(await fieldsOf({ ...VALID, timeZone: bad })).toContain("timeZone");
    }
    expect(H.opened).toBe(0);
  });

  it("28/29. rejects unknown and authorization-shaped keys", async () => {
    for (const extra of [
      { nickname: "x" },
      { authUserId: AUTH },
      { userProfileId: AUTH },
      { workspaceId: AUTH },
      { membershipId: AUTH },
      { role: "owner_admin" },
      { status: "active" },
      { claims: { sub: AUTH } },
      { session: {} },
      { redirectTo: "/dashboard" },
    ]) {
      const fields = await fieldsOf({ ...VALID, ...extra });
      // Refused loudly rather than silently dropped: whoever sent it believed
      // it would be honoured.
      expect(`${Object.keys(extra)[0]}: ${fields.length > 0}`).toBe(
        `${Object.keys(extra)[0]}: true`,
      );
      expect(H.opened).toBe(0);
    }
  });

  it("30. opens no connection for any invalid submission", async () => {
    for (const bad of [
      null,
      undefined,
      "a string",
      42,
      [],
      { ...VALID, country: "ZZ" },
    ]) {
      const result = await call(bad);
      expect(result.kind).toBe("invalid_input");
    }
    expect(H.opened).toBe(0);
  });

  it("never echoes a submitted value back in an issue", async () => {
    const secret = "Definitely-Secret-Business-Name";
    const issues = await issuesOf({
      ...VALID,
      workspaceName: secret,
      country: "ZZ",
      currency: "ZZZ",
      timeZone: "Mars/Olympus",
    });
    const surface = JSON.stringify(issues);
    for (const value of [secret, "ZZ", "ZZZ", "Mars/Olympus"]) {
      expect(surface).not.toContain(value);
    }
    // Field names are stable and drawn from the fixed set.
    for (const issue of issues) {
      expect([
        "fullName",
        "workspaceName",
        "businessType",
        "country",
        "currency",
        "timeZone",
        "form",
      ]).toContain(issue.field);
    }
  });
});

describe("the database call", () => {
  it("32. maps the three outcomes exactly", async () => {
    for (const [outcome, kind] of [
      ["created", "created"],
      ["already_onboarded", "already_onboarded"],
      ["access_unavailable", "access_unavailable"],
    ] as const) {
      H.outcome = outcome;
      await expect(call(VALID)).resolves.toEqual({ kind });
    }
  });

  it("33. treats an unknown outcome as an unexpected failure", async () => {
    for (const outcome of ["", "something_else", null, 42, undefined]) {
      H.outcome = outcome;
      const error = await call(VALID).then(
        () => undefined,
        (caught: unknown) => caught as InstanceType<typeof BootstrapError>,
      );
      expect(error).toBeInstanceOf(BootstrapError);
      expect(error?.reason).toBe("unexpected");
    }
  });

  it("sets only app.auth_user_id, and calls only the bootstrap routine", async () => {
    await call(VALID);
    expect(H.statements).toHaveLength(2);
    expect(H.statements[0]?.sql).toContain("set_config");
    expect(H.statements[0]?.values[0]).toBe("app.auth_user_id");
    expect(H.statements[1]?.sql).toContain("app.create_initial_workspace");

    const all = H.statements.map((s) => s.sql).join(" ");
    expect(all).not.toContain("app.user_profile_id");
    expect(all).not.toContain("app.workspace_id");
    expect(all).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/i);
    expect(all).not.toMatch(/from public\./i);
    // Transaction-local, never a session-wide SET.
    expect(H.statements[0]?.values[2]).toBeUndefined();
    expect(H.statements[0]?.sql).toMatch(/set_config\(.*true\)/);
  });

  it("sends exactly the six normalized values, in order", async () => {
    H.statements = [];
    await call({
      ...VALID,
      fullName: "  Ann Sebastian ",
      workspaceName: "  Limenzy Test Business  ",
      businessType: "  Retail  ",
      country: "in",
      currency: "inr",
      timeZone: "Asia/Kolkata",
    });
    expect(statement("create_initial_workspace")?.values).toEqual([
      "Ann Sebastian",
      "Limenzy Test Business",
      "Retail",
      "IN",
      "INR",
      "Asia/Kolkata",
    ]);
  });
});

describe("failures are sanitized", () => {
  const LEAKY = () => {
    const error = new Error(
      "connection terminated: postgresql://not-a-real-user:not-a-real-password@db.invalid:5432/postgres" +
        ' while executing "select app.create_initial_workspace($1,$2,$3,$4,$5,$6)"',
    );
    (error as Error & { cause?: unknown }).cause = {
      query: "select app.create_initial_workspace($1)",
      parameters: ["Ann Sebastian"],
    };
    return error;
  };

  it("34/35. replaces a driver error that reached the database", async () => {
    const leaky = LEAKY() as Error & { code?: string };
    leaky.code = "22023";
    H.throwOnCall = leaky;

    const error = await call(VALID).then(
      () => undefined,
      (caught: unknown) => caught as InstanceType<typeof BootstrapError>,
    );
    expect(error).toBeInstanceOf(BootstrapError);
    expect(error?.reason).toBe("unexpected");

    const surface = [
      error?.name,
      error?.message,
      String(error?.cause ?? ""),
      JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})),
    ].join(" ");
    expect(error?.cause).toBeUndefined();
    for (const secret of [
      "postgresql://",
      "not-a-real-password",
      "db.invalid",
      "5432",
      "select app.create_initial_workspace",
      "Ann Sebastian",
    ]) {
      expect(`${secret}: ${surface.includes(secret)}`).toBe(`${secret}: false`);
    }
  });

  it("34. reports a connection failure as database_unavailable", async () => {
    H.throwOnConnect = LEAKY();
    const error = await call(VALID).then(
      () => undefined,
      (caught: unknown) => caught as InstanceType<typeof BootstrapError>,
    );
    expect(error).toBeInstanceOf(BootstrapError);
    expect(error?.reason).toBe("database_unavailable");
    expect(error?.message).not.toMatch(/postgres(ql)?:\/\//);
  });
});

describe("the public surface", () => {
  it("36. freezes every result and issue collection", async () => {
    const created = await call(VALID);
    expect(Object.isFrozen(created)).toBe(true);

    const invalid = await call({ ...VALID, country: "ZZ" });
    expect(Object.isFrozen(invalid)).toBe(true);
    if (invalid.kind !== "invalid_input") throw new Error("expected issues");
    expect(Object.isFrozen(invalid.issues)).toBe(true);
    for (const issue of invalid.issues)
      expect(Object.isFrozen(issue)).toBe(true);
    expect(() => {
      (invalid.issues as unknown as { field: string }[])[0]!.field = "form";
    }).toThrow(TypeError);
  });

  it("37/38. accepts exactly one argument and ignores anything else", async () => {
    expect(createInitialWorkspace).toHaveLength(1);

    const callable = createInitialWorkspace as unknown as (
      ...args: unknown[]
    ) => Promise<unknown>;
    H.statements = [];
    const result = await callable(
      VALID,
      { authUserId: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
      "pool",
      { begin: () => Promise.reject(new Error("forged pool used")) },
    );
    expect(result).toEqual({ kind: "created" });
    // Identity still came from the verified utility, and the real pool was used.
    expect(statement("set_config")?.values[1]).toBe(AUTH);
    expect(H.opened).toBe(1);
  });

  it("returns no identifier, role, claim or input in any result", async () => {
    for (const outcome of [
      "created",
      "already_onboarded",
      "access_unavailable",
    ]) {
      H.outcome = outcome;
      const result = await call(VALID);
      expect(Object.keys(result)).toEqual(["kind"]);
      const surface = JSON.stringify(result);
      for (const secret of [
        AUTH,
        "owner_admin",
        "Ann Sebastian",
        "Asia/Kolkata",
      ]) {
        expect(surface).not.toContain(secret);
      }
    }
  });
});

describe("the validation module is safe to load in a browser", () => {
  /**
   * The Phase 4C-3 form will import these rules, so this module has to
   * initialise in whatever the visitor is running. `Intl.supportedValuesOf`
   * reached Safari only in 15.4; a module-level call would throw on an older
   * iPhone and the setup form would not render at all.
   *
   * Each test removes or replaces the global, re-imports the module fresh, and
   * restores the global in `finally` so nothing leaks into another test.
   */
  const withIntlSupportedValues = async (
    replacement: unknown,
    assertion: (
      module: typeof import("@/lib/validation/workspace-setup"),
    ) => void | Promise<void>,
  ) => {
    const intl = Intl as unknown as Record<string, unknown>;
    const original = Object.getOwnPropertyDescriptor(intl, "supportedValuesOf");
    try {
      if (replacement === undefined) {
        delete intl.supportedValuesOf;
      } else {
        Object.defineProperty(intl, "supportedValuesOf", {
          value: replacement,
          configurable: true,
          writable: true,
        });
      }
      vi.resetModules();
      const fresh = await import("@/lib/validation/workspace-setup");
      await assertion(fresh);
    } finally {
      if (original) {
        Object.defineProperty(intl, "supportedValuesOf", original);
      } else {
        delete intl.supportedValuesOf;
      }
      vi.resetModules();
    }
  };

  it("1/3. parses a valid submission with Intl.supportedValuesOf absent", async () => {
    await withIntlSupportedValues(undefined, ({ parseWorkspaceSetup }) => {
      expect(
        (Intl as unknown as Record<string, unknown>).supportedValuesOf,
      ).toBeUndefined();

      const result = parseWorkspaceSetup(VALID);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.currency).toBe("INR");
    });
  });

  it("2. never calls Intl.supportedValuesOf while importing or parsing", async () => {
    const spy = vi.fn(() => {
      throw new Error("Intl.supportedValuesOf must not be called");
    });
    await withIntlSupportedValues(spy, ({ parseWorkspaceSetup }) => {
      expect(parseWorkspaceSetup(VALID).ok).toBe(true);
      expect(parseWorkspaceSetup({ ...VALID, currency: "ZZZ" }).ok).toBe(false);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it("3. accepts the same currencies whatever the runtime claims to support", async () => {
    // A hostile runtime that reports only one currency must change nothing.
    await withIntlSupportedValues(
      () => ["XTS"],
      ({ parseWorkspaceSetup, CURRENCY_CODES }) => {
        expect(CURRENCY_CODES).toHaveLength(162);
        for (const currency of ["INR", "USD", "AED", "AUD", "EUR", "GBP"]) {
          const result = parseWorkspaceSetup({ ...VALID, currency });
          expect(`${currency}: ${result.ok}`).toBe(`${currency}: true`);
        }
        // ...and XTS is still not a business currency.
        expect(parseWorkspaceSetup({ ...VALID, currency: "XTS" }).ok).toBe(
          false,
        );
      },
    );
  });

  it("4/5. normalizes lower-case codes and still rejects invalid ones", async () => {
    await withIntlSupportedValues(undefined, ({ parseWorkspaceSetup }) => {
      for (const [input, expected] of [
        ["inr", "INR"],
        ["  usd  ", "USD"],
        ["Gbp", "GBP"],
      ] as const) {
        const result = parseWorkspaceSetup({ ...VALID, currency: input });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.value.currency).toBe(expected);
      }

      for (const bad of ["ZZZ", "XXXX", "IN", "$", "Rupee", "123", "", "   "]) {
        const result = parseWorkspaceSetup({ ...VALID, currency: bad });
        expect(`${bad}: ${result.ok}`).toBe(`${bad}: false`);
        // The rejected value is never repeated back.
        if (!result.ok && bad.trim() !== "") {
          expect(JSON.stringify(result.issues)).not.toContain(bad);
        }
      }
    });
  });

  it("exposes frozen lists that a caller cannot mutate", async () => {
    const { COUNTRY_CODES, CURRENCY_CODES, TIME_ZONES } =
      await import("@/lib/validation/workspace-setup");
    for (const list of [COUNTRY_CODES, CURRENCY_CODES, TIME_ZONES]) {
      expect(Object.isFrozen(list)).toBe(true);
      expect(() => {
        (list as string[]).push("ZZZ");
      }).toThrow(TypeError);
    }
  });
});
