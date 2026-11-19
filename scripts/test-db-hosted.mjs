#!/usr/bin/env node
/**
 * Run the live-database suites against the DEDICATED HOSTED TEST PROJECT.
 *
 * The one command for hosted database tests:
 *
 *     npm run test:db:hosted                      # every registered suite
 *     npm run test:db:hosted -- <file> [file…]    # a subset
 *
 * ## What makes this safe to exist at all
 *
 * `npm run test:db:local` refuses anything but loopback, and that rule is
 * what has kept these suites — which create fixtures, delete them, and
 * attempt writes that are *supposed* to be refused — away from real data.
 * Relaxing it needs something narrower in its place, not nothing:
 *
 *   - hosted is reached only through this script, which sets the opt-in flag;
 *   - the approved project must be named, and both connections must state it;
 *   - the development project is denied, resolved from configuration so it
 *     cannot be forgotten;
 *   - the two connections must be two different roles — `limenzy_app` for the
 *     runtime half and `postgres` for the tooling half — because a pair that
 *     is secretly one superuser passes every policy assertion by bypassing
 *     row-level security;
 *   - `DATABASE_URL` is never consulted. The TEST variables are used
 *     exclusively, so no run can drift onto the application's own target.
 *
 * Every one of those is decided from the connection strings alone, before
 * anything connects, by `resolveHostedTestTargets` — which is unit-tested
 * offline in `src/test/database-target.test.ts`.
 *
 * ## Passwords
 *
 * This script does NOT set or rotate one. `limenzy_app`'s password is
 * configured once, deliberately, with
 * `node scripts/db-role-local.mjs --test --expect-ref=<ref>`. A test runner
 * that rotated a credential on every invocation would make every run a write
 * to the project's role configuration.
 *
 * ## Transport
 *
 * The Supabase root certificate is published to the whole child process
 * through `NODE_EXTRA_CA_CERTS`, and the suites ask for `ssl: true`
 * (`src/test/db-tls.ts`). That combination verifies the certificate chain
 * *and* the hostname. Nothing here weakens verification, and no suite handles
 * a certificate.
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatTarget,
  describeTarget,
  resolveTestTargets,
} from "./database-target.mjs";
import { redact } from "./redact-secrets.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const readEnvValue = (contents, key) => {
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    const at = trimmed.indexOf("=");
    if (at === -1 || trimmed.slice(0, at) !== key) continue;
    return trimmed.slice(at + 1).trim();
  }
  return "";
};

let env = "";
try {
  env = readFileSync(join(REPO, ".env.local"), "utf8");
} catch {
  console.error("[test:db:hosted] no .env.local — nothing to read.\n");
  process.exit(1);
}

const runtime = readEnvValue(env, "TEST_DATABASE_URL");
const tooling = readEnvValue(env, "TEST_DRIZZLE_TOOLING_DATABASE_URL");
const approvedRef = readEnvValue(env, "TEST_SUPABASE_PROJECT_REF");
const developmentRef = (() => {
  try {
    const host = new URL(readEnvValue(env, "NEXT_PUBLIC_SUPABASE_URL"))
      .hostname;
    return (host.match(/^([a-z0-9]{20})\./) ?? [])[1] ?? null;
  } catch {
    return null;
  }
})();

const decision = resolveTestTargets({
  mode: "hosted",
  runtime,
  tooling,
  approvedRef,
  developmentRef,
});

if (decision.refusal !== null) {
  console.error(
    `\n✗ test:db:hosted — ${redact(decision.refusal, [])}\n\n` +
      "  Configure the dedicated test project first:\n" +
      "    1. add TEST_SUPABASE_PROJECT_REF and " +
      "TEST_DRIZZLE_TOOLING_DATABASE_URL to .env.local\n" +
      "    2. node scripts/db-role-local.mjs --test " +
      "--expect-ref=<project-ref>\n",
  );
  process.exit(1);
}

const ca = (
  readEnvValue(env, "TEST_DATABASE_CA_CERT") ||
  readEnvValue(env, "DATABASE_CA_CERT")
)
  .replace(/^["']|["']$/g, "")
  .replace(/\\n/g, "\n");

if (!ca.includes("BEGIN CERTIFICATE")) {
  console.error(
    "\n✗ test:db:hosted — no CA certificate available; refusing to run " +
      "against a hosted project without verified TLS.\n",
  );
  process.exit(1);
}

const scratch = mkdtempSync(join(tmpdir(), "limenzy-test-ca-"));
const caPath = join(scratch, "ca.pem");
writeFileSync(caPath, ca.endsWith("\n") ? ca : `${ca}\n`, { mode: 0o600 });
chmodSync(caPath, 0o600);

const mask = (ref) => (ref ? `${ref.slice(0, 4)}…${ref.slice(-4)}` : "(none)");
console.log(`hosted test project : ${mask(approvedRef)}`);
console.log(`target              : ${formatTarget(describeTarget(runtime))}`);
console.log("roles               : limenzy_app (runtime) · postgres (tooling)");
console.log("transport           : verified TLS (chain and hostname)\n");

const passthrough = process.argv.slice(2);
const command = passthrough.length > 0 ? passthrough : ["npx", "vitest", "run"];
const argv = command[0] === "npx" ? command.slice(1) : command;

const result = spawnSync("npx", argv.length > 0 ? argv : ["vitest", "run"], {
  cwd: REPO,
  stdio: "inherit",
  env: {
    ...process.env,
    LIMENZY_TEST_MODE: "hosted",
    LIMENZY_TEST_PROJECT_REF: approvedRef,
    /* Exclusively the test pair. The application's values are not passed on. */
    TEST_DATABASE_URL: runtime,
    TEST_DRIZZLE_TOOLING_DATABASE_URL: tooling,
    DATABASE_URL: runtime,
    DRIZZLE_TOOLING_DATABASE_URL: tooling,
    DATABASE_CA_CERT: ca,
    REQUIRE_DATABASE_TESTS: "1",
    NODE_EXTRA_CA_CERTS: caPath,
  },
});

try {
  rmSync(scratch, { recursive: true, force: true });
} catch {
  /* best effort */
}

process.exit(result.status ?? 1);
