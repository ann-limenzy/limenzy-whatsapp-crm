#!/usr/bin/env node
/**
 * Run the live-database suites against a MATCHED LOCAL pair, process-scoped.
 *
 * `.env.local` is the application's configuration, and its `DATABASE_URL`
 * legitimately points wherever the developer runs the app — hosted
 * development, for instance. The database suites must never follow it there:
 * they create fixtures, assert that row-level security keeps them apart, and
 * attempt writes that are *supposed* to be refused.
 *
 * `npm run test:db` refuses outright when the two halves disagree, which is
 * correct but leaves nowhere to run them from. This is that somewhere. It
 * does what `npm run db:role:local` does, minus the file write:
 *
 *   - reads the TOOLING url from `.env.local` and refuses anything but
 *     loopback;
 *   - gives the local `limenzy_app` role a freshly generated, local-only
 *     password through the tooling connection;
 *   - keeps the resulting runtime url in THIS PROCESS's environment only;
 *   - hands both to the runner.
 *
 * `.env.local` is never modified and the password is never printed or stored.
 *
 *   node scripts/test-db-local.mjs                  # the whole db suite
 *   node scripts/test-db-local.mjs npx vitest run <file>   # one file
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isLoopback, describeTarget as describe } from "./database-target.mjs";
import {
  generatePassword,
  applyRolePassword,
  buildRuntimeUrl,
  readEnvValue,
  describeTarget,
} from "./db-role-local.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(`${REPO}/package.json`);
const postgres = require("postgres");

let env;
try {
  env = readFileSync(`${REPO}/.env.local`, "utf8");
} catch {
  console.error(
    "[test:db:local] no .env.local — run `npm run db:start` and " +
      "`npm run db:role:local` first.",
  );
  process.exit(1);
}

const tooling = readEnvValue(env, "DRIZZLE_TOOLING_DATABASE_URL");
if (!tooling) {
  console.error(
    "[test:db:local] no DRIZZLE_TOOLING_DATABASE_URL in .env.local",
  );
  process.exit(1);
}
if (!isLoopback(describe(tooling))) {
  console.error(
    `[test:db:local] REFUSING: the tooling target is ${describeTarget(tooling)}, ` +
      "which is not loopback. These suites create and delete rows.",
  );
  process.exit(1);
}
console.log(`tooling target: ${describeTarget(tooling)}`);

const sql = postgres(tooling, { max: 1, onnotice: () => {} });
let runtime;
try {
  const password = generatePassword();
  await applyRolePassword(sql, password);
  runtime = buildRuntimeUrl(tooling, "limenzy_app", password);
} finally {
  await sql.end({ timeout: 5 });
}
console.log(`runtime target: ${describeTarget(runtime.toString())}`);

const argv = process.argv.slice(2);
const [command, ...args] =
  argv.length > 0 ? argv : ["node", "scripts/test-db.mjs"];

const result = spawnSync(command, args, {
  cwd: REPO,
  stdio: "inherit",
  env: {
    ...process.env,
    REQUIRE_DATABASE_TESTS: "1",
    DRIZZLE_TOOLING_DATABASE_URL: tooling,
    DATABASE_URL: runtime.toString(),
  },
});
process.exit(result.status ?? 1);
