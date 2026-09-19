import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit configuration.
 *
 * **`supabase/migrations/` is the single authoritative migration history.**
 * The Supabase CLI applies and resets the local database from that directory,
 * and nothing else applies SQL to a shared environment.
 *
 * Drizzle's role here is narrow and deliberate:
 *
 * - `src/server/db/schema` holds the typed application-schema definitions.
 * - `drizzle-kit generate` may produce *candidate* SQL from those definitions
 *   into `out` below, which is git-ignored scratch output for review only.
 * - Reviewed SQL is then placed into `supabase/migrations/` as the one applied
 *   history. Candidate output is never applied and never committed.
 *
 * Consequences of that rule, which this file exists to make hard to break:
 *
 * - Never run `drizzle-kit migrate` against an environment the Supabase CLI
 *   also migrates — two independent histories would diverge silently.
 * - Never use `drizzle-kit push` as a migration mechanism. It mutates a
 *   database without producing a reviewable, replayable migration file.
 *
 * `dbCredentials` points at a **tooling-only** connection string. It is used by
 * local Drizzle Kit commands (introspection, candidate generation) and is not
 * the application's runtime connection. Genuine runtime/migration role
 * separation is Milestone 1C-C and is not implemented yet.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
