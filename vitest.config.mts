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
const targets = resolveTestTargets({
  runtime: process.env.DATABASE_URL ?? localEnvValue("DATABASE_URL"),
  tooling:
    process.env.DRIZZLE_TOOLING_DATABASE_URL ??
    localEnvValue("DRIZZLE_TOOLING_DATABASE_URL"),
});

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
  },
});
