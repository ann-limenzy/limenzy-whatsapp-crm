import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * How the runtime pool and its Drizzle handle are bound together.
 *
 * Offline: the driver and Drizzle are both replaced for the caching tests, so
 * no pool is constructed and no database is contacted. The one test that needs
 * the real libraries pulls them in with `importActual` and still opens nothing
 * — `postgres()` is lazy and connects on first query, not on construction.
 *
 * The property under test is *determinism*. `drizzle()` replaces the pool's
 * type parsers as a side effect, so whether it has run changes what every
 * query on that pool returns. Building it when the pool is built makes that a
 * fixed property of the pool rather than something that changes the first time
 * someone happens to call `withTenantDb()`.
 */

const poolSentinel = { sentinel: "pool" } as const;
const secondPoolSentinel = { sentinel: "second-pool" } as const;
let nextPool: unknown = poolSentinel;
const postgresFactory = vi.fn(() => nextPool);
vi.mock("postgres", () => ({
  default: (...args: unknown[]) => postgresFactory(...(args as [])),
}));

const drizzleFactory = vi.fn((client: unknown) => ({ sentinel: "db", client }));
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: (...args: unknown[]) => drizzleFactory(...(args as [never])),
}));

const { createRuntimePool, runtimeDb } = await import("./client");

beforeEach(() => {
  nextPool = poolSentinel;
  postgresFactory.mockClear();
  drizzleFactory.mockClear();
});

describe("the Drizzle handle is built when the pool is built", () => {
  it("constructs Drizzle during createRuntimePool, not on first use", async () => {
    createRuntimePool();

    // The assertion that matters: it already happened, before anybody asked
    // for a Drizzle handle or ran a query.
    expect(drizzleFactory).toHaveBeenCalledTimes(1);
  });

  it("binds it to the pool it just created", async () => {
    const pool = createRuntimePool();

    const [client] = drizzleFactory.mock.calls[0] as unknown as [unknown];
    expect(client).toBe(pool);
  });

  it("passes the application schema", async () => {
    createRuntimePool();

    const [, config] = drizzleFactory.mock.calls[0] as unknown as [
      unknown,
      { schema?: Record<string, unknown> },
    ];
    expect(config.schema).toBeDefined();
    expect(Object.keys(config.schema ?? {})).toContain("workspaces");
  });
});

describe("runtimeDb serves one handle per pool", () => {
  it("returns the handle built with the pool, without rebuilding", async () => {
    const pool = createRuntimePool();
    drizzleFactory.mockClear();

    const first = runtimeDb(pool);
    const second = runtimeDb(pool);

    expect(first).toBe(second);
    // No second construction: a rebuild would reinstall parsers on a live pool.
    expect(drizzleFactory).toHaveBeenCalledTimes(0);
  });

  it("gives a different pool a different handle", async () => {
    const first = createRuntimePool();
    nextPool = secondPoolSentinel;
    const second = createRuntimePool();

    expect(first).not.toBe(second);
    expect(runtimeDb(first)).not.toBe(runtimeDb(second));
  });

  it("never hands a pool the handle belonging to another pool", async () => {
    const first = createRuntimePool();
    nextPool = secondPoolSentinel;
    const second = createRuntimePool();

    // A module-level singleton would survive a pool swap and keep serving a
    // handle bound to the pool that was replaced — and, once that pool was
    // closed, to a closed connection.
    expect((runtimeDb(first) as unknown as { client: unknown }).client).toBe(
      first,
    );
    expect((runtimeDb(second) as unknown as { client: unknown }).client).toBe(
      second,
    );
  });

  it("builds a handle on demand for a pool it did not create", async () => {
    const foreign = { sentinel: "foreign-pool" } as const;
    drizzleFactory.mockClear();

    const db = runtimeDb(foreign as never);

    expect(drizzleFactory).toHaveBeenCalledTimes(1);
    expect((db as unknown as { client: unknown }).client).toBe(foreign);
  });
});

describe("the accepted parser contract", () => {
  it("drizzle() replaces the pool's timestamptz parser", async () => {
    // The real libraries, so this documents what actually happens rather than
    // what the mocks say. `postgres()` is lazy: nothing connects here.
    // `postgres` is a CJS `export =` module, so its type IS the callable.
    const postgresModule = await vi.importActual<{
      default: typeof import("postgres");
    }>("postgres");
    const postgres = postgresModule.default;
    const { drizzle } = await vi.importActual<
      typeof import("drizzle-orm/postgres-js")
    >("drizzle-orm/postgres-js");

    const pool = postgres("postgresql://user:pass@127.0.0.1:5432/db", {
      max: 1,
    });
    const options = (
      pool as unknown as {
        options: { parsers: Record<string, (value: string) => unknown> };
      }
    ).options;
    const TIMESTAMPTZ = "1184";
    const sample = "2026-10-14 03:00:00+00";

    const before = options.parsers[TIMESTAMPTZ];
    expect(before?.(sample)).toBeInstanceOf(Date);

    drizzle(pool, {});

    const after = options.parsers[TIMESTAMPTZ];
    expect(after).not.toBe(before);
    // This is the approved, documented contract: raw SQL on a runtime pool
    // returns timestamps as strings, because the pool carries a Drizzle
    // handle from the moment it is created. See docs/architecture-decisions.md §6.3.
    expect(after?.(sample)).toBe(sample);

    await pool.end({ timeout: 1 }).catch(() => {});
  });
});
