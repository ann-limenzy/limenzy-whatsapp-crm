#!/usr/bin/env node
/**
 * Dedicated live-database verification for the schema suite.
 *
 * `npm test` is deliberately tolerant: when the local Supabase stack is not
 * running, the database tests skip themselves so the suite still passes on a
 * machine that has never started it. That tolerance is exactly what this
 * command removes. Here, anything short of "every database test actually ran
 * and passed" is a failure:
 *
 *   - no connection string                  -> fail
 *   - PostgreSQL unreachable                -> fail
 *   - the suite would have skipped          -> fail (REQUIRE_DATABASE_TESTS)
 *   - zero tests executed                   -> fail
 *   - any test skipped, pending or failing  -> fail
 *
 * The connection string is never printed, logged or included in an error.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SUITE = "src/server/db/schema.test.ts";
const VARIABLE = "DRIZZLE_TOOLING_DATABASE_URL";

const fail = (message, hint) => {
  console.error(`\n✗ test:db — ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error("");
  process.exit(1);
};

/** Read the connection string without ever echoing it. */
function connectionString() {
  if (process.env[VARIABLE]) return process.env[VARIABLE];
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      if (trimmed.slice(0, separator) !== VARIABLE) continue;
      const value = trimmed.slice(separator + 1).trim();
      if (value) return value;
    }
  } catch {
    // no .env.local — handled by the caller
  }
  return "";
}

const url = connectionString();
if (!url) {
  fail(
    `${VARIABLE} is not available.`,
    `Start the local stack with "npm run db:start" and copy its printed values into .env.local (see docs/local-development.md).`,
  );
}

// Reachability, before spending time on a test run.
const { default: postgres } = await import("postgres");
const probe = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });
try {
  await probe`select 1`;
} catch {
  // The driver's error can contain the connection string, so it is not shown.
  fail(
    "PostgreSQL could not be reached.",
    `Run "npm run db:start", then "npm run db:reset".`,
  );
} finally {
  await probe.end({ timeout: 2 }).catch(() => {});
}

const report = join(tmpdir(), `limenzy-test-db-${process.pid}.json`);
const result = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    SUITE,
    "--reporter=default",
    "--reporter=json",
    `--outputFile=${report}`,
  ],
  {
    stdio: "inherit",
    // The suite turns an unreachable database into a thrown error rather than
    // a skip when this is set.
    env: { ...process.env, [VARIABLE]: url, REQUIRE_DATABASE_TESTS: "1" },
  },
);

let summary;
try {
  summary = JSON.parse(readFileSync(report, "utf8"));
} catch {
  fail("the test run produced no report, so nothing can be verified.");
} finally {
  rmSync(report, { force: true });
}

const total = summary.numTotalTests ?? 0;
const passed = summary.numPassedTests ?? 0;
const failed = summary.numFailedTests ?? 0;
const pending = summary.numPendingTests ?? 0;
const todo = summary.numTodoTests ?? 0;

if (result.status !== 0 || failed > 0) {
  fail(`${failed} database test(s) failed.`);
}
if (total === 0) {
  fail(
    "zero database tests executed.",
    `Expected ${SUITE} to contribute tests; a filter or collection error would explain this.`,
  );
}
if (pending > 0 || todo > 0) {
  fail(
    `${pending + todo} database test(s) were skipped.`,
    "This command exists so the schema suite can never pass by skipping.",
  );
}

console.log(
  `\n✓ test:db — ${passed} database test(s) executed against the live local database, none skipped.\n`,
);
