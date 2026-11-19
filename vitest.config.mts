import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { resolveTestTargets } from "./scripts/database-target.mjs";

/**
 * Read one value out of `.env.local` for the tests that need a live local
 * database.
 *
 * Only that single variable is taken. The rest of the file is deliberately
 * left alone: `src/lib/env.test.ts` asserts on an *unconfigured* environment,
 * so leaking real values into `process.env` would quietly change what it
 * tests. When the file or the value is absent — or the local stack is stopped
 * — the schema tests skip themselves.
 */
function localEnvValue(key: string): string {
  try {
    const file = readFileSync(
      resolve(import.meta.dirname, ".env.local"),
      "utf8",
    );
    for (const line of file.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      if (trimmed.slice(0, separator) !== key) continue;
      return trimmed.slice(separator + 1).trim();
    }
  } catch {
    // No .env.local on this machine (CI, a fresh clone) — tests skip.
  }
  return "";
}

/**
 * What the suites are allowed to be pointed at.
 *
 * The decision is made from the connection strings alone, before any suite
 * loads and long before a fixture could exist — see `resolveTestTargets`,
 * which is where the reasoning lives and where it is unit-tested offline.
 *
 * An explicit `process.env` value is put through the same check: the point is
 * the target, not where it was typed. `npm run test:db:local` injects a
 * matched loopback pair deliberately, and it passes.
 *
 * A refusal is announced HERE and passed on as `LIMENZY_DB_TARGET_REFUSED`,
 * so the suites that then skip cannot be mistaken for suites that passed.
 */
/*
 * Hosted is opt-in, and only the dedicated runner sets it. An ordinary
 * `npx vitest` run never sees it, so it keeps the loopback-only rule and the
 * database suites skip rather than reaching a real project.
 */
const hosted = process.env.LIMENZY_TEST_MODE === "hosted";

const targets = resolveTestTargets({
  mode: hosted ? "hosted" : "local",
  /*
   * In hosted mode the TEST variables are read EXCLUSIVELY. The application's
   * `DATABASE_URL` is not a fallback: a suite that followed it would create
   * and delete rows in whichever environment the developer is pointed at.
   */
  runtime: hosted
    ? (process.env.TEST_DATABASE_URL ?? localEnvValue("TEST_DATABASE_URL"))
    : (process.env.DATABASE_URL ?? localEnvValue("DATABASE_URL")),
  tooling: hosted
    ? (process.env.TEST_DRIZZLE_TOOLING_DATABASE_URL ??
      localEnvValue("TEST_DRIZZLE_TOOLING_DATABASE_URL"))
    : (process.env.DRIZZLE_TOOLING_DATABASE_URL ??
      localEnvValue("DRIZZLE_TOOLING_DATABASE_URL")),
  approvedRef:
    process.env.LIMENZY_TEST_PROJECT_REF ??
    localEnvValue("TEST_SUPABASE_PROJECT_REF"),
  developmentRef: (() => {
    try {
      const host = new URL(localEnvValue("NEXT_PUBLIC_SUPABASE_URL")).hostname;
      return (host.match(/^([a-z0-9]{20})\./) ?? [])[1] ?? null;
    } catch {
      return null;
    }
  })(),
});

/*
 * The suites read these, so hosted mode must put the approved pair where they
 * look — and must not leave the application's own values visible beside them.
 */
if (hosted && targets.refusal === null) {
  process.env.DATABASE_URL = targets.runtime;
  process.env.DRIZZLE_TOOLING_DATABASE_URL = targets.tooling;
}

if (targets.refusal !== null) {
  const rule = "!".repeat(72);
  console.warn(
    `\n${rule}\n` +
      "  DATABASE SUITES WILL NOT RUN - the configured target was refused.\n\n" +
      `  ${targets.refusal}\n\n` +
      "  They will report as SKIPPED, which is not the same as passing.\n" +
      "  To run them against the local stack: npm run test:db:local\n" +
      `${rule}\n`,
  );
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
      // See src/test/server-only-stub.ts for why.
      "server-only": resolve(
        import.meta.dirname,
        "./src/test/server-only-stub.ts",
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    env: {
      DRIZZLE_TOOLING_DATABASE_URL: targets.tooling,
      DATABASE_URL: targets.runtime,
      /** Non-empty only when the configuration above was refused. */
      LIMENZY_DB_TARGET_REFUSED: targets.refusal ?? "",
    },
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    /*
     * Hosted runs keep the same assertions and the same concurrency; only the
     * clock changes. A local round trip is sub-millisecond, a hosted one is
     * hundreds of milliseconds, and a test that makes a few dozen of them
     * exceeds the 5s default while doing nothing wrong — measured: twelve
     * suites failed with "Test timed out in 5000ms" and zero assertion
     * failures.
     *
     * Raised, not removed: a genuinely hung test still fails, just later.
     * Nothing here retries anything, and no assertion is relaxed.
     */
    /*
     * One shared hosted database, so suites run one file at a time. In
     * parallel they contend for the same rows and the same catalogue, and a
     * suite that passes alone fails in a batch — measured on `sales-teams`,
     * which reads grant state while another suite is mid-fixture. The local
     * stack is fast and private enough not to need this.
     */
    ...(hosted
      ? { testTimeout: 30_000, hookTimeout: 120_000, fileParallelism: false }
      : {}),
  },
});
