import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { databaseEnv } from "@/lib/env";

import * as schema from "./schema";

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

const POOL_OPTIONS = {
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
  return postgres(env.DATABASE_URL, { ...POOL_OPTIONS, ...overrides });
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

/** Drizzle bound to the runtime pool, for the gateway's own use. */
export function runtimeDb(sql: RuntimeSql = pool()) {
  return drizzle(sql, { schema });
}

export type RuntimeDb = ReturnType<typeof runtimeDb>;
