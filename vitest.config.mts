import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Read one value out of `.env.local` for the schema tests that need a live
 * local database.
 *
 * Only that single variable is taken. The rest of the file is deliberately
 * left alone: `src/lib/env.test.ts` asserts on an *unconfigured* environment,
 * so leaking real values into `process.env` would quietly change what it
 * tests. When the file or the value is absent — or the local stack is stopped
 * — the schema tests skip themselves.
 */
function localDatabaseUrl(): string {
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
      if (trimmed.slice(0, separator) !== "DRIZZLE_TOOLING_DATABASE_URL")
        continue;
      return trimmed.slice(separator + 1).trim();
    }
  } catch {
    // No .env.local on this machine (CI, a fresh clone) — tests skip.
  }
  return "";
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
      DRIZZLE_TOOLING_DATABASE_URL:
        process.env.DRIZZLE_TOOLING_DATABASE_URL ?? localDatabaseUrl(),
    },
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
