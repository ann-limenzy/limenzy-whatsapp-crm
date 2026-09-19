#!/usr/bin/env node
/**
 * Enable the local runtime database login for `limenzy_app`.
 *
 * The Phase-1 migration creates `limenzy_app` as NOLOGIN, so no password is
 * ever written into a migration or committed anywhere. This script gives it a
 * local-only password and records the resulting connection string in
 * `.env.local`, which is git-ignored.
 *
 * It is LOCAL DEVELOPMENT TOOLING. It connects with the tooling (superuser)
 * connection, and it is the only place that connection is used for anything
 * other than tests and drizzle-kit.
 *
 * Safety properties, each covered by a test:
 *
 *   - the role name is a fixed source literal and is never read from argv,
 *     the environment, a file or any other input;
 *   - the password is generated with `crypto.randomBytes`, never supplied;
 *   - no shell is invoked and `psql` is never used, so there is no shell
 *     interpolation anywhere;
 *   - the ALTER ROLE statement is built by PostgreSQL itself via
 *     `pg_catalog.format('%I', '%L')` with bind parameters — the script never
 *     concatenates SQL;
 *   - the password, the generated statement and the full URL are never printed
 *     or logged;
 *   - `.env.local` is rewritten atomically (temp file, fsync, rename) with mode
 *     0600, preserving every unrelated line, comment and its order;
 *   - any failure removes the temp file, leaves the original untouched and
 *     exits non-zero.
 *
 * RECOVERY: if the database password is changed successfully but the rename
 * then fails, the role's password and `.env.local` disagree, and the
 * application cannot connect. The fix is simply to run this script again: it
 * generates a fresh password, re-applies it and rewrites the file. The
 * operation is idempotent in effect — nothing accumulates, and no manual
 * database repair is required.
 */
import { randomBytes } from "node:crypto";
import { open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Fixed literal. Never read from input — see the header. */
export const ROLE_NAME = "limenzy_app";

const ENV_KEY = "DATABASE_URL";
const TOOLING_KEY = "DRIZZLE_TOOLING_DATABASE_URL";

/**
 * 32 characters from [A-Za-z0-9] (~190 bits).
 *
 * The restricted alphabet is a second line of defence: `format('%L')` already
 * quotes any byte safely, but a password that cannot contain a quote or a
 * backslash cannot even theoretically alter the statement's shape.
 */
export function generatePassword(length = 32) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      // Reject bytes above the largest whole multiple of the alphabet size so
      // every character stays uniformly distributed.
      if (byte >= 256 - (256 % alphabet.length)) continue;
      out += alphabet[byte % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Read one value from a `.env`-style file body without evaluating it. */
export function readEnvValue(contents, key) {
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    if (trimmed.slice(0, separator) !== key) continue;
    return trimmed.slice(separator + 1).trim();
  }
  return "";
}

/**
 * Replace exactly one key's value, leaving every other line — including
 * comments, blank lines and ordering — byte-identical. Appends the key when it
 * is absent, keeping any trailing newline discipline the file already had.
 */
export function upsertEnvValue(contents, key, value) {
  const lines = contents.split("\n");
  let replaced = false;

  const next = lines.map((line) => {
    if (replaced) return line;
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) return line;
    const separator = trimmed.indexOf("=");
    if (separator === -1) return line;
    if (trimmed.slice(0, separator) !== key) return line;
    replaced = true;
    return `${key}=${value}`;
  });

  if (replaced) return next.join("\n");

  const hadTrailingNewline = contents.endsWith("\n");
  const body = hadTrailingNewline ? contents.slice(0, -1) : contents;
  const prefix = body.length > 0 ? `${body}\n` : "";
  return `${prefix}${key}=${value}\n`;
}

/**
 * Derive the runtime connection string from the tooling one: same host, port
 * and database, different role and password. Returns a URL object so the
 * caller decides whether it is ever stringified.
 */
export function buildRuntimeUrl(toolingUrl, role, password) {
  const url = new URL(toolingUrl);
  url.username = encodeURIComponent(role);
  url.password = encodeURIComponent(password);
  return url;
}

/** Host and port only — safe to print. Never includes credentials. */
export function describeTarget(rawUrl) {
  const url = new URL(rawUrl);
  return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
}

/**
 * Write atomically: temp file with mode 0600, fsync, rename over the target.
 * `onBeforeRename` is a test seam for proving the failure path leaves the
 * original file untouched.
 */
export async function writeFileAtomic(
  target,
  contents,
  { onBeforeRename } = {},
) {
  const temp = resolve(dirname(target), `.${Date.now()}.${process.pid}.tmp`);
  let handle;
  try {
    handle = await open(temp, "wx", 0o600);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (onBeforeRename) await onBeforeRename(temp);
    await rename(temp, target);
  } catch (error) {
    await handle?.close().catch(() => {});
    await unlink(temp).catch(() => {});
    throw error;
  }
}

/**
 * The two-step statement construction.
 *
 * PostgreSQL's `DO` takes a code string and accepts NO parameters, so a
 * parameterised DO block is impossible. Instead an ordinary SELECT — which does
 * take bind parameters — asks the server to build and quote the statement with
 * `format('%I', '%L')`, and only then is that server-generated text executed
 * through the driver's raw API. The script never assembles SQL from strings.
 */
export async function applyRolePassword(sql, password) {
  await sql.begin(async (tx) => {
    // Keep the generated statement out of the server log where permitted.
    // Not fatal if the role may not set it: the statement is still never
    // written to application output.
    await tx.unsafe("set local log_statement = 'none'").catch(() => {});
    await tx
      .unsafe("set local log_min_duration_statement = -1")
      .catch(() => {});

    const [row] = await tx`
      select pg_catalog.format(
        $fmt$ALTER ROLE %I LOGIN PASSWORD %L$fmt$,
        ${ROLE_NAME}::text,
        ${password}::text
      ) as stmt`;

    if (!row?.stmt) throw new Error("the server returned no statement");
    // Executed as generated by PostgreSQL. Never logged.
    await tx.unsafe(row.stmt);
  });
}

async function main() {
  const envPath = resolve(process.cwd(), ".env.local");

  let existing = "";
  try {
    existing = await readFile(envPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const toolingUrl =
    process.env[TOOLING_KEY] || readEnvValue(existing, TOOLING_KEY);

  if (!toolingUrl) {
    console.error(
      `\n✗ db:role:local — ${TOOLING_KEY} is not available.\n` +
        `  Start the local stack with "npm run db:start" first ` +
        `(see docs/local-development.md).\n`,
    );
    process.exit(1);
  }

  const { default: postgres } = await import("postgres");
  const sql = postgres(toolingUrl, {
    max: 1,
    connect_timeout: 5,
    onnotice: () => {},
  });

  const password = generatePassword();
  try {
    await applyRolePassword(sql, password);
  } catch {
    // The driver's error can echo the connection string, so it is not shown.
    console.error(
      `\n✗ db:role:local — could not enable the ${ROLE_NAME} login.\n` +
        `  Is the local stack running and migrated? ` +
        `Try "npm run db:start" then "npm run db:reset".\n`,
    );
    process.exit(1);
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }

  try {
    const runtimeUrl = buildRuntimeUrl(toolingUrl, ROLE_NAME, password);
    const next = upsertEnvValue(existing, ENV_KEY, runtimeUrl.toString());
    await writeFileAtomic(envPath, next);
  } catch {
    console.error(
      `\n✗ db:role:local — the ${ROLE_NAME} password was changed, but ` +
        `.env.local could not be updated.\n` +
        `  The original file is unchanged. Re-run "npm run db:role:local" ` +
        `to generate a fresh password and rewrite it.\n`,
    );
    process.exit(1);
  }

  // Nothing identifying: no password, no username, no full URL.
  console.log(
    `\n✓ db:role:local — ${ROLE_NAME} login enabled; ` +
      `${ENV_KEY} written to .env.local (mode 0600) for ` +
      `${describeTarget(toolingUrl)}\n`,
  );
}

// Only run when invoked directly, so tests can import the helpers.
// `pathToFileURL` rather than a template literal: this repository's path
// contains spaces, which `import.meta.url` percent-encodes.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
