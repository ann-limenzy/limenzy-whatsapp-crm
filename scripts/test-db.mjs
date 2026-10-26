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
import { describeTargetMismatch } from "./database-target.mjs";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SUITES = [
  "src/server/db/schema.test.ts",
  "src/server/db/roles.test.ts",
  "src/server/db/rls.test.ts",
  "src/server/db/tenant.test.ts",
  "src/server/db/identity.test.ts",
  "src/server/auth/workspace-context.db.test.ts",
  "src/server/db/bootstrap.test.ts",
  "src/server/auth/create-initial-workspace.db.test.ts",
  "src/server/auth/workspace-names.db.test.ts",
  // Milestone 1D — the settings surface and the two-workspace fixture.
  "src/server/db/settings-isolation.db.test.ts",
  // Milestone 2B — Settings → Users: co-member visibility and the last-Owner
  // rule, including its behaviour under concurrency.
  "src/server/db/users-isolation.db.test.ts",
  // Milestone 3A — Lead pipeline and Lead sources: cross-workspace
  // invisibility, Owner/Admin-only writes, and the Won/Lost invariants.
  "src/server/db/lead-pipeline-isolation.db.test.ts",
  // Milestone 3B — Leads: §162.1 record access, cross-workspace invisibility,
  // §130.1 duplicate detection, and the stage-occupancy race.
  "src/server/db/leads-isolation.db.test.ts",
  // Milestone 2C — invitations: tenant scoping, identity binding, expiry,
  // regeneration and concurrent acceptance.
  "src/server/db/invitations-isolation.db.test.ts",
  // Milestone 3C — Lead editing, stage changes and §39 activity history,
  // including the revision guard and the append-only constraint.
  "src/server/db/lead-lifecycle.db.test.ts",
  // Milestone 3D — Record Owner reassignment: §162 authority independent of
  // edit permission, §162.1 access checked before the transfer, §163.13
  // history, and the deactivation and revocation races in both orders.
  "src/server/db/lead-reassignment.db.test.ts",
  // Milestone 3D — the stage/history lock order, including the deadlock it
  // was introduced to close.
  "src/server/db/lead-stage-locking.db.test.ts",
  // Lead list paging and §39 history continuation: every authorised Lead
  // reachable, an accurate total, and no entry served twice or lost.
  "src/server/db/lead-pagination.db.test.ts",
  // Concurrent §162 permission edits, where one administrator's change used
  // to erase another's.
  "src/server/db/permission-concurrency.db.test.ts",
];
const VARIABLE = "DRIZZLE_TOOLING_DATABASE_URL";
const RUNTIME_VARIABLE = "DATABASE_URL";

const fail = (message, hint) => {
  console.error(`\n✗ test:db — ${message}`);
  if (hint) console.error(`  ${hint}`);
  console.error("");
  process.exit(1);
};

/** Read a connection string without ever echoing it. */
function connectionString(variable = VARIABLE) {
  if (process.env[variable]) return process.env[variable];
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      if (trimmed.slice(0, separator) !== variable) continue;
      const value = trimmed.slice(separator + 1).trim();
      if (value) return value;
    }
  } catch {
    // no .env.local — handled by the caller
  }
  return "";
}

const url = connectionString();
const runtimeUrlForGuard = connectionString(RUNTIME_VARIABLE);

/**
 * Mixed targets are rejected BEFORE any probe, fixture or write.
 *
 * A runtime pointed at a hosted project while tooling points at the local
 * stack would create rows in one database and assert against the other — and
 * the writes still land. Checked here, first, rather than relying on a
 * container being stopped.
 */
{
  /*
   * The runner's own guard already refused this configuration before any
   * suite loaded, and replaced both urls with an unreachable sentinel. Saying
   * so here names the real problem; without it the mismatch check below would
   * report the sentinel instead of what was actually configured.
   */
  if (process.env.LIMENZY_DB_TARGET_REFUSED) {
    fail(
      process.env.LIMENZY_DB_TARGET_REFUSED,
      'Run these against the local stack with "npm run test:db:local" — see docs/development.md.',
    );
  }

  // Runtime first, tooling second — the order the helper documents. Passing
  // them the other way round still DETECTED a mismatch, but named the wrong
  // half as the hosted one, which is the detail that matters when this fires.
  const problem = describeTargetMismatch(runtimeUrlForGuard, url);
  if (problem !== null) {
    fail(problem, "Set both to the same database — see docs/development.md.");
  }
}

if (!url) {
  fail(
    `${VARIABLE} is not available.`,
    `Start the local stack with "npm run db:start" and copy its printed values into .env.local (see docs/development.md).`,
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

// The runtime role must exist too: a database suite that silently ran without
// it would be testing only half the design.
const runtimeUrl = connectionString(RUNTIME_VARIABLE);
if (!runtimeUrl) {
  fail(
    `${RUNTIME_VARIABLE} is not available.`,
    `Run "npm run db:role:local" to provision the runtime role after a reset.`,
  );
}
const runtimeProbe = postgres(runtimeUrl, {
  max: 1,
  connect_timeout: 5,
  onnotice: () => {},
});
try {
  await runtimeProbe`select 1`;
} catch {
  fail(
    "the runtime role could not connect.",
    `Run "npm run db:reset" then "npm run db:role:local".`,
  );
} finally {
  await runtimeProbe.end({ timeout: 2 }).catch(() => {});
}

const report = join(tmpdir(), `limenzy-test-db-${process.pid}.json`);
const result = spawnSync(
  "npx",
  [
    "vitest",
    "run",
    ...SUITES,
    "--reporter=default",
    "--reporter=json",
    `--outputFile=${report}`,
  ],
  {
    stdio: "inherit",
    // The suite turns an unreachable database into a thrown error rather than
    // a skip when this is set.
    env: {
      ...process.env,
      [VARIABLE]: url,
      [RUNTIME_VARIABLE]: runtimeUrl,
      REQUIRE_DATABASE_TESTS: "1",
    },
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
    `Expected ${SUITES.join(" and ")} to contribute tests; a filter or collection error would explain this.`,
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
