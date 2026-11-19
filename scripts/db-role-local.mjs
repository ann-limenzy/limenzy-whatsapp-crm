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

/*
 * The hosted TEST project's own pair. Separate keys, never the application's:
 * this script's whole job is to set a role password, and pointing it at the
 * wrong project rotates the credential a running environment depends on.
 */
const TEST_ENV_KEY = "TEST_DATABASE_URL";
const TEST_TOOLING_KEY = "TEST_DRIZZLE_TOOLING_DATABASE_URL";

/** The 20-character project ref Supabase gives every project. */
export function projectRefFrom(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const user = decodeURIComponent(url.username || "");
  /* Pooler: `postgres.<ref>`. The hostname is shared regionally and is not
     evidence of anything. Direct: `db.<ref>.supabase.co`. */
  const fromUser = user.includes(".")
    ? user.slice(user.indexOf(".") + 1)
    : null;
  const fromHost =
    (url.hostname.toLowerCase().match(/^db\.([a-z0-9]{20})\.supabase\.co$/) ??
      [])[1] ?? null;
  if (fromUser && fromHost && fromUser !== fromHost) return null;
  return fromUser ?? fromHost;
}

/** Is this target the loopback interface? */
export function isLoopbackUrl(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * Decide which target this run may touch, from the strings alone.
 *
 * Pure, so the guards can be proven offline with no database and no
 * environment. The rules, in the order they matter:
 *
 *   - **Local is the default and stays local.** Without an explicit test
 *     mode the target must be loopback. Before this existed, a developer
 *     who pointed `DRIZZLE_TOOLING_DATABASE_URL` at hosted development and
 *     ran `npm run db:role:local` would have rotated the password the
 *     running application uses, with no warning.
 *   - **Hosted requires naming the project.** Test mode is opt-in AND must
 *     state which project ref it expects; a mismatch is refused rather than
 *     reconciled.
 *   - **The development project is never a target**, in either mode, even
 *     if someone names it explicitly.
 */
/**
 * @param {{
 *   mode?: string,
 *   toolingUrl?: string,
 *   expectRef?: string | null,
 *   developmentRef?: string | null,
 * }} [options]
 * @returns {{ ok: true, mode: string, envKey: string, ref: string | null }
 *          | { ok: false, reason: string }}
 */
export function resolveRoleSetupTarget({
  mode = "local",
  toolingUrl = "",
  expectRef = null,
  developmentRef = null,
} = {}) {
  /** @type {(reason: string) => { ok: false, reason: string }} */
  const refuse = (reason) => ({ ok: false, reason });

  if (!toolingUrl) return refuse("no tooling connection string was supplied.");
  let parsed;
  try {
    parsed = new URL(toolingUrl);
  } catch {
    return refuse("the tooling connection string is not readable.");
  }
  const ref = projectRefFrom(toolingUrl);

  if (developmentRef && ref && ref === developmentRef) {
    return refuse(
      "that connection names the DEVELOPMENT project. This script sets a " +
        "role password; it must never touch development.",
    );
  }

  if (mode === "local") {
    if (!isLoopbackUrl(toolingUrl)) {
      return refuse(
        `the default mode is local-only and ${parsed.hostname} is not ` +
          "loopback. Pass --test with --expect-ref to target the hosted " +
          "test project deliberately.",
      );
    }
    return { ok: true, mode, envKey: ENV_KEY, ref: null };
  }

  if (mode !== "test") return refuse(`unknown mode "${mode}".`);

  if (!expectRef) {
    return refuse("--test requires --expect-ref=<project-ref>.");
  }
  if (developmentRef && expectRef === developmentRef) {
    return refuse("--expect-ref names the development project. Refusing.");
  }
  if (!ref) {
    return refuse(
      "no project reference in the connection string; a pooler URI needs " +
        "the `postgres.<ref>` username form.",
    );
  }
  if (ref !== expectRef) {
    return refuse(
      `the connection string names a different project than --expect-ref ` +
        `(${ref.slice(0, 4)}… vs ${expectRef.slice(0, 4)}…).`,
    );
  }
  return { ok: true, mode, envKey: TEST_ENV_KEY, ref };
}

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
 *
 * ## Why the username is not simply the role name
 *
 * Supabase's connection pooler routes by TENANT, and it takes the tenant from
 * the username: `<role>.<project-ref>`. A bare `limenzy_app` is unroutable and
 * the pooler rejects it before any authentication happens, with
 *
 *     no tenant identifier provided (external_id or sni_hostname required)
 *
 * which reads like a credential problem and is not one. So when the tooling
 * URL carries a tenant suffix, the runtime URL carries the same one.
 *
 * A direct connection, and every loopback connection, has no suffix to carry
 * — `tenantRefFrom` returns null and the username stays the bare role, which
 * is what the local stack has always used.
 */
export function tenantRefFrom(rawUrl) {
  try {
    const user = decodeURIComponent(new URL(rawUrl).username || "");
    return user.includes(".") ? user.slice(user.indexOf(".") + 1) : null;
  } catch {
    return null;
  }
}

export function buildRuntimeUrl(toolingUrl, role, password) {
  const url = new URL(toolingUrl);
  const tenant = tenantRefFrom(toolingUrl);
  url.username = encodeURIComponent(tenant ? `${role}.${tenant}` : role);
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

  /* `--test --expect-ref=<ref>`; anything else keeps the local default. */
  const args = new Map(
    process.argv
      .slice(2)
      .map((a) => a.replace(/^--/, "").split("="))
      .map(([k, v = "true"]) => [k, v]),
  );
  const mode = args.get("test") === "true" ? "test" : "local";
  const expectRef = args.get("expect-ref") ?? null;
  const label = mode === "test" ? "db:role:test" : "db:role:local";

  const toolingKey = mode === "test" ? TEST_TOOLING_KEY : TOOLING_KEY;
  const toolingUrl =
    process.env[toolingKey] || readEnvValue(existing, toolingKey);

  if (!toolingUrl) {
    console.error(
      `\n✗ ${label} — ${toolingKey} is not available.\n` +
        (mode === "test"
          ? `  Add the test project's tooling URI to .env.local first.\n`
          : `  Start the local stack with "npm run db:start" first ` +
            `(see docs/development.md).\n`),
    );
    process.exit(1);
  }

  /* The development project, resolved from configuration so nobody has to
     remember to deny it. */
  const developmentRef = (() => {
    try {
      const host = new URL(readEnvValue(existing, "NEXT_PUBLIC_SUPABASE_URL"))
        .hostname;
      return (host.match(/^([a-z0-9]{20})\./) ?? [])[1] ?? null;
    } catch {
      return null;
    }
  })();

  const decision = resolveRoleSetupTarget({
    mode,
    toolingUrl,
    expectRef,
    developmentRef,
  });
  if (!decision.ok) {
    console.error(`\n✗ ${label} — ${decision.reason}\n`);
    process.exit(1);
  }
  const envKey = decision.envKey;

  /*
   * Hosted targets verify the server's certificate AND its hostname. A
   * password set over an unverified connection is a password set to whoever
   * answered.
   */
  let ssl;
  if (mode === "test") {
    const ca = (
      process.env.TEST_DATABASE_CA_CERT ||
      readEnvValue(existing, "TEST_DATABASE_CA_CERT") ||
      readEnvValue(existing, "DATABASE_CA_CERT") ||
      ""
    )
      .replace(/^["']|["']$/g, "")
      .replace(/\\n/g, "\n");
    if (!ca.includes("BEGIN CERTIFICATE")) {
      console.error(
        `\n✗ ${label} — no CA certificate available; refusing to set a ` +
          `password over an unverified connection.\n`,
      );
      process.exit(1);
    }
    ssl = {
      ca,
      rejectUnauthorized: true,
      servername: new URL(toolingUrl).hostname,
    };
  }

  const { default: postgres } = await import("postgres");
  const sql = postgres(toolingUrl, {
    max: 1,
    connect_timeout: mode === "test" ? 15 : 5,
    prepare: false,
    onnotice: () => {},
    ...(ssl ? { ssl } : {}),
  });

  const password = generatePassword();
  try {
    await applyRolePassword(sql, password);
  } catch {
    // The driver's error can echo the connection string, so it is not shown.
    console.error(
      `\n✗ ${label} — could not enable the ${ROLE_NAME} login.\n` +
        (mode === "test"
          ? `  Is ${describeTarget(toolingUrl)} reachable and migrated?\n`
          : `  Is the local stack running and migrated? ` +
            `Try "npm run db:start" then "npm run db:reset".\n`),
    );
    process.exit(1);
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }

  try {
    const runtimeUrl = buildRuntimeUrl(toolingUrl, ROLE_NAME, password);
    const next = upsertEnvValue(existing, envKey, runtimeUrl.toString());
    await writeFileAtomic(envPath, next);
  } catch {
    console.error(
      `\n✗ ${label} — the ${ROLE_NAME} password was changed, but ` +
        `.env.local could not be updated.\n` +
        `  The original file is unchanged. Re-run this command ` +
        `to generate a fresh password and rewrite it.\n`,
    );
    process.exit(1);
  }

  // Nothing identifying: no password, no username, no full URL.
  console.log(
    `\n✓ ${label} — ${ROLE_NAME} login enabled; ` +
      `${envKey} written to .env.local (mode 0600) for ` +
      `${describeTarget(toolingUrl)}` +
      (decision.ref
        ? ` (project ${decision.ref.slice(0, 4)}…${decision.ref.slice(-4)})`
        : "") +
      `\n`,
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
