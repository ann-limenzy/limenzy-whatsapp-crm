import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { databaseEnv } from "@/lib/env";

import * as schema from "./schema";
import { runtimeTlsOptions } from "./tls";

/**
 * The application's runtime database connection.
 *
 * It connects as `limenzy_app`: a non-owner, non-superuser, NOBYPASSRLS role,
 * so every policy committed in Phase 2 applies to it in full. It is emphatically
 * NOT the tooling connection — `DRIZZLE_TOOLING_DATABASE_URL` is a superuser
 * that bypasses row-level security, and using it here would silently delete the
 * database half of tenant isolation. `databaseEnv()` enforces that distinction
 * by rejecting any URL whose username is not the runtime role.
 *
 * **Nothing in the application may import this module.** Tenant-scoped work
 * goes through `withTenant()` in `./tenant`, which is the only place that opens
 * a transaction and establishes the tenant settings the policies read. An
 * ESLint rule and a contract test enforce that, because a repository that
 * imported the pool directly would run with no tenant context and — thanks to
 * fail-closed policies — silently see nothing, which is a bug that looks like
 * an empty database rather than like a security failure.
 *
 * `server-only` makes importing this from a Client Component a build error, so
 * the connection string can never reach a browser bundle.
 */

/** Never widened. Only ./tenant and the database test suites may reach this. */
export type RuntimeSql = postgres.Sql;

/**
 * The handle a tenant callback receives.
 *
 * Re-exported from here so `./tenant` never imports the driver itself: the
 * fewer modules that can name `postgres`, the narrower the surface the import
 * boundary has to police. It is `TransactionSql`, which genuinely lacks `end`,
 * `END`, `CLOSE`, `options`, `listen` and `reserve` — a callback cannot close
 * the pool, open a second connection, or read the connection options.
 */
export type RuntimeTx = postgres.TransactionSql;

/**
 * The Drizzle handle a tenant callback receives from `withTenantDb()`.
 *
 * Derived from Drizzle's own `transaction()` signature rather than written out,
 * so it cannot drift from the installed version. Drizzle opens the transaction
 * through `postgres.js` `begin()` internally and builds its session over the
 * transaction client, so this handle and the context set on it are the same
 * transaction on the same connection.
 */
export type RuntimeDbTx = Parameters<
  Parameters<RuntimeDb["transaction"]>[0]
>[0];

/**
 * Exported so the TLS unit test can assert the contract without opening a
 * connection. Nothing else may import it: the pool is built here.
 */
export const POOL_OPTIONS = {
  /**
   * Required for Supabase's transaction pooler: in transaction mode a
   * connection is not guaranteed to be the same backend between statements, so
   * server-side prepared statements cannot be relied upon. Set here rather than
   * discovered later against the hosted pooler.
   */
  prepare: false,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  /**
   * Notices would otherwise reach stdout. Nothing this driver emits is needed
   * in application logs, and silence removes a channel that could carry
   * connection details.
   */
  onnotice: () => {},
} as const;

/**
 * Create a pool. Exported for the database test suites, which need a pool of a
 * controlled size to prove that transaction-local settings do not survive a
 * physically reused connection. Production code uses `runtimeSql()`.
 */
export function createRuntimePool(overrides?: { max?: number }): RuntimeSql {
  const env = databaseEnv();

  /**
   * TLS is decided from the validated URL, never from the URL's query string.
   * `runtimeTlsOptions` returns verified-TLS options for every host except an
   * explicit loopback literal, and throws rather than returning a weakened
   * configuration.
   */
  const tls = runtimeTlsOptions(env.DATABASE_URL, env.DATABASE_CA_CERT);

  /**
   * `overrides` is NOT spread. The type says `{ max?: number }`, but a type is
   * a compile-time promise and this is the one place a stray property would
   * reach the driver's options — where `ssl`, `host`, `user`, `pass` and
   * `prepare` all live. A caller that has lost its types, or a value that
   * arrived through a cast, must not be able to move the connection or
   * disable verification. Only `max` is copied, by name.
   */
  const max = overrides?.max;

  const sql = postgres(env.DATABASE_URL, {
    ...POOL_OPTIONS,
    ...(max === undefined ? {} : { max }),
    // Last, so nothing above can displace it.
    ...tls,
  });

  /**
   * Build Drizzle now, not on first use.
   *
   * `drizzle()` replaces this pool's type parsers and serializers as a side
   * effect — timestamps in particular come back as raw strings rather than
   * `Date`. Deferring it would mean the raw-SQL path behaved one way before the
   * first `withTenantDb()` call and another way after it, which is a behaviour
   * change that moves with traffic. Doing it here makes the parser contract a
   * property of the pool: identical for `withTenant()` and `withTenantDb()`,
   * from the first statement, in every process. See docs/architecture-decisions.md §6.3.
   */
  attachDb(sql);
  return sql;
}

/**
 * One Drizzle handle per pool.
 *
 * Keyed weakly by the pool itself, so a handle can never outlive or be served
 * for a pool that has been closed and replaced: when the pool is collected, so
 * is its entry. A module-level singleton would survive a pool swap and hand out
 * a Drizzle bound to a closed connection.
 */
const DB_BY_POOL = new WeakMap<RuntimeSql, RuntimeDb>();

function attachDb(sql: RuntimeSql): RuntimeDb {
  const db = drizzle(sql, { schema });
  DB_BY_POOL.set(sql, db);
  return db;
}

/**
 * One pool per server process, cached across hot reloads.
 *
 * Next.js re-evaluates server modules on change; without this each reload would
 * leak a pool and eventually exhaust PostgreSQL's connection slots. The cache
 * lives on `globalThis` behind a Symbol — this module is `server-only`, so the
 * value is never bundled for or observable by a browser, and the symbol holds a
 * driver handle, never the URL or password.
 */
const POOL_KEY = Symbol.for("limenzy.runtime.pool");

type PoolCarrier = { [POOL_KEY]?: RuntimeSql };

function pool(): RuntimeSql {
  const carrier = globalThis as unknown as PoolCarrier;
  carrier[POOL_KEY] ??= createRuntimePool();
  return carrier[POOL_KEY];
}

/**
 * The raw runtime pool.
 *
 * Deliberately not a default export and deliberately awkward to reach: this is
 * the unrestricted handle, and the import boundary exists so that application
 * code cannot acquire it. `withTenant()` is the supported entry point.
 */
export function runtimeSql(): RuntimeSql {
  return pool();
}

/**
 * Drizzle bound to the runtime pool, for the gateways' own use.
 *
 * Returns the handle built when the pool was created. A pool that reached here
 * without one — only possible for a pool this module did not build — gets one
 * now, so the caller still receives a handle bound to the pool it asked for.
 */
export function runtimeDb(sql: RuntimeSql = pool()): RuntimeDb {
  return DB_BY_POOL.get(sql) ?? attachDb(sql);
}

export type RuntimeDb = PostgresJsDatabase<typeof schema>;
