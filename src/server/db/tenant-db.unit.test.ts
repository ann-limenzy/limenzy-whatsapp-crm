import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Contract for the two tenant gateways, offline.
 *
 * No pool is constructed, no socket is opened and no database is contacted:
 * the driver and the Drizzle handle are both replaced, and every assertion is
 * about what the gateways *do* before a statement would reach a database —
 * which context they accept, which settings they establish, in what order, and
 * what they refuse.
 *
 * The live behaviour of those settings (transaction-locality, fail-closed
 * policies, cross-workspace isolation) is proved against a real database by
 * `tenant.test.ts` and the hosted §6.1 harness. This file proves the parts that
 * are decided in TypeScript, which is where a nesting or ordering mistake would
 * actually be made.
 */

/** Statements the Drizzle gateway issued, rendered exactly as sent. */
const executed: { sql: string; params: unknown[] }[] = [];
/** Statements the SQL gateway issued, as tagged-template pieces. */
const taggedStatements: { strings: string[]; values: unknown[] }[] = [];
/** The interleaving of setup statements and the user callback. */
const order: string[] = [];

const dialect = new PgDialect();
let transactionCalls = 0;
let beginCalls = 0;

const drizzleTx = {
  execute: vi.fn(async (query: unknown) => {
    const { sql, params } = dialect.sqlToQuery(query as never);
    executed.push({ sql, params });
    order.push("set_config");
  }),
};

const sqlTx = Object.assign(
  async (strings: TemplateStringsArray, ...values: unknown[]) => {
    taggedStatements.push({ strings: [...strings], values });
    order.push("set_config");
    return [];
  },
  { marker: "postgres-js-tx" },
);

const fakeDb = {
  transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    transactionCalls += 1;
    return fn(drizzleTx);
  },
};
const fakePool = {
  begin: async (fn: (tx: unknown) => Promise<unknown>) => {
    beginCalls += 1;
    return fn(sqlTx);
  },
};

vi.mock("./client", () => ({
  runtimeDb: () => fakeDb,
  runtimeSql: () => fakePool,
}));

const { withTenantDb } = await import("./tenant-db");
const { withTenant, TenantContextConflict, TenantContextUntrusted } =
  await import("./tenant");
const { TenantGatewayConflict } = await import("./tenant-scope");
const { createTenantContext } = await import("./tenant-context");

const AUTH = "11111111-1111-4111-8111-111111111111";
const PROFILE = "22222222-2222-4222-8222-222222222222";
const WORKSPACE = "33333333-3333-4333-8333-333333333333";
const OTHER_WORKSPACE = "44444444-4444-4444-8444-444444444444";

const issued = (workspaceId = WORKSPACE) =>
  createTenantContext({
    authUserId: AUTH,
    userProfileId: PROFILE,
    workspaceId,
  });

beforeEach(() => {
  executed.length = 0;
  taggedStatements.length = 0;
  order.length = 0;
  transactionCalls = 0;
  beginCalls = 0;
  drizzleTx.execute.mockClear();
});

describe("withTenantDb only accepts a context it can trust", () => {
  it("refuses a plain object that was never issued", async () => {
    const forged = {
      authUserId: AUTH,
      userProfileId: PROFILE,
      workspaceId: WORKSPACE,
    };

    await expect(
      withTenantDb(forged as never, async () => "unreachable"),
    ).rejects.toBeInstanceOf(TenantContextUntrusted);
    // The decisive part: no transaction was opened for the forged context.
    expect(transactionCalls).toBe(0);
    expect(executed).toHaveLength(0);
  });

  it("refuses a structural copy of an issued context", async () => {
    const copy = { ...issued() };

    await expect(
      withTenantDb(copy as never, async () => "unreachable"),
    ).rejects.toBeInstanceOf(TenantContextUntrusted);
    expect(transactionCalls).toBe(0);
  });

  it("accepts a context from createTenantContext()", async () => {
    const result = await withTenantDb(issued(), async () => "ran");

    expect(result).toBe("ran");
    expect(transactionCalls).toBe(1);
  });
});

describe("withTenantDb establishes the tenant settings before the callback", () => {
  it("issues all three set_config statements first, in order", async () => {
    await withTenantDb(issued(), async () => {
      order.push("callback");
      return null;
    });

    // Not merely "three statements happened": three happened BEFORE the
    // callback. A callback that ran first would see no tenant context and,
    // thanks to fail-closed policies, would quietly read nothing.
    expect(order).toEqual([
      "set_config",
      "set_config",
      "set_config",
      "callback",
    ]);
  });

  it("parameterises every value and keeps each setting transaction-local", async () => {
    await withTenantDb(issued(), async () => null);

    expect(executed).toHaveLength(3);
    for (const statement of executed) {
      // `true` is the third argument to set_config: SET LOCAL semantics. A
      // plain SET would outlive the transaction and leak the workspace to the
      // next request on the same pooled connection.
      expect(statement.sql).toBe("select set_config($1, $2, true)");
    }
    expect(executed.map((s) => s.params)).toEqual([
      ["app.auth_user_id", AUTH],
      ["app.user_profile_id", PROFILE],
      ["app.workspace_id", WORKSPACE],
    ]);
  });

  it("hands the callback the transaction handle, not the database", async () => {
    const seen = await withTenantDb(issued(), async (tx) => tx);

    expect(seen).toBe(drizzleTx);
    expect(seen).not.toBe(fakeDb);
  });
});

describe("withTenantDb nesting", () => {
  it("reuses the running transaction for an identical context", async () => {
    const context = issued();

    const inner = await withTenantDb(context, async () => {
      executed.length = 0; // only count what the nested call issues
      return withTenantDb(context, async (tx) => tx);
    });

    expect(transactionCalls).toBe(1);
    expect(executed).toHaveLength(0);
    expect(inner).toBe(drizzleTx);
  });

  it("reuses it for a different context object with identical values", async () => {
    await withTenantDb(issued(), async () => {
      await withTenantDb(issued(), async () => null);
      return null;
    });

    expect(transactionCalls).toBe(1);
  });

  it("refuses a nested call whose workspace differs, before any statement", async () => {
    await expect(
      withTenantDb(issued(), async () => {
        executed.length = 0;
        return withTenantDb(issued(OTHER_WORKSPACE), async () => "unreachable");
      }),
    ).rejects.toBeInstanceOf(TenantContextConflict);

    expect(transactionCalls).toBe(1);
    expect(executed).toHaveLength(0);
  });

  it("names the field that disagreed", async () => {
    const error = await withTenantDb(issued(), async () =>
      withTenantDb(issued(OTHER_WORKSPACE), async () => null).catch(
        (caught: unknown) => caught,
      ),
    );

    expect((error as InstanceType<typeof TenantContextConflict>).field).toBe(
      "workspaceId",
    );
  });
});

describe("the two gateways refuse to nest inside one another", () => {
  it("rejects withTenantDb inside withTenant without opening a transaction", async () => {
    const context = issued();

    await expect(
      withTenant(context, async () =>
        withTenantDb(context, async () => "unreachable"),
      ),
    ).rejects.toBeInstanceOf(TenantGatewayConflict);

    // The SQL gateway opened its transaction; the Drizzle gateway opened none.
    expect(beginCalls).toBe(1);
    expect(transactionCalls).toBe(0);
  });

  it("rejects withTenant inside withTenantDb without opening a transaction", async () => {
    const context = issued();

    await expect(
      withTenantDb(context, async () =>
        withTenant(context, async () => "unreachable"),
      ),
    ).rejects.toBeInstanceOf(TenantGatewayConflict);

    expect(transactionCalls).toBe(1);
    expect(beginCalls).toBe(0);
  });

  it("reports which gateway was nested in which", async () => {
    const context = issued();
    const error = await withTenant(context, async () =>
      withTenantDb(context, async () => null).catch(
        (caught: unknown) => caught,
      ),
    );

    const conflict = error as InstanceType<typeof TenantGatewayConflict>;
    expect(conflict.outer).toBe("sql");
    expect(conflict.inner).toBe("drizzle");
    // The message names gateways, never identifiers: a context value is tenant
    // data and has no business in an error string.
    expect(conflict.message).toContain("withTenantDb()");
    expect(conflict.message).not.toContain(WORKSPACE);
  });

  it("checks a conflicting context before it checks the gateway", async () => {
    // A nested call that is wrong in both ways reports the context conflict,
    // because that is the more serious mistake: the caller asked for a
    // different tenant.
    await expect(
      withTenant(issued(), async () =>
        withTenantDb(issued(OTHER_WORKSPACE), async () => null),
      ),
    ).rejects.toBeInstanceOf(TenantContextConflict);
  });
});

describe("withTenant keeps its existing behaviour", () => {
  it("still establishes three transaction-local settings first", async () => {
    await withTenant(issued(), async () => {
      order.push("callback");
      return null;
    });

    expect(order).toEqual([
      "set_config",
      "set_config",
      "set_config",
      "callback",
    ]);
    expect(taggedStatements).toHaveLength(3);
    expect(taggedStatements.map((s) => s.values)).toEqual([
      ["app.auth_user_id", AUTH],
      ["app.user_profile_id", PROFILE],
      ["app.workspace_id", WORKSPACE],
    ]);
    for (const statement of taggedStatements) {
      expect(statement.strings.join("?")).toContain(", true)");
    }
  });

  it("still reuses the running transaction for an identical context", async () => {
    const context = issued();
    await withTenant(context, async () => {
      taggedStatements.length = 0;
      return withTenant(context, async () => null);
    });

    expect(beginCalls).toBe(1);
    expect(taggedStatements).toHaveLength(0);
  });

  it("still refuses a conflicting nested context", async () => {
    await expect(
      withTenant(issued(), async () =>
        withTenant(issued(OTHER_WORKSPACE), async () => null),
      ),
    ).rejects.toBeInstanceOf(TenantContextConflict);
  });

  it("still refuses a forged context", async () => {
    await expect(
      withTenant(
        {
          authUserId: AUTH,
          userProfileId: PROFILE,
          workspaceId: WORKSPACE,
        } as never,
        async () => null,
      ),
    ).rejects.toBeInstanceOf(TenantContextUntrusted);
    expect(beginCalls).toBe(0);
  });
});
