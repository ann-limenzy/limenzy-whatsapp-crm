#!/usr/bin/env node
/**
 * Apply migrations to a hosted Supabase project, safely and repeatably.
 *
 * This replaces the per-slice `hosted-3a` … `hosted-4` tooling. That pattern
 * grew a fresh ~2,000-line preflight for every milestone because each one
 * re-declared the tables, policies and triggers its migration introduced —
 * work that belongs to the migration, not to a deployment script.
 *
 * So this script checks only what is true of EVERY migration:
 *
 *   1. the target is the project you named, and is not one you denied;
 *   2. the ledger holds what you expect, and the pending set is exactly the
 *      migrations you intend, in order;
 *   3. each pending file matches both a committed hash manifest and the
 *      committed file in git;
 *   4. the connection verifies the server's certificate AND its hostname;
 *   5. the supported runner's own dry-run agrees with that plan.
 *
 * Everything slice-specific — "does this migration's trigger exist, are its
 * grants right" — belongs in the migration's own `DO $$ … $$` verification
 * block, which runs wherever the migration runs and needs no external tool.
 * Milestone 5A is the worked example.
 *
 * WHAT IT DOES NOT DO
 *
 *   - It does not execute SQL to apply anything. `supabase db push` is the
 *     runner; this wrapper only decides whether to call it.
 *   - It never writes a migration-history row. The runner owns the ledger.
 *   - It never prints a connection string, a password or an unfiltered error.
 *
 * USAGE
 *
 *   node scripts/hosted-migrate.mjs --url-env=KEY --expect-ref=REF [options]
 *
 *     --url-env=KEY       env/.env.local key holding the connection string
 *     --expect-ref=REF    the project ref the target MUST be
 *     --deny-ref=REF      a ref it must NOT be (repeatable). The development
 *                         project is denied automatically.
 *     --expect-count=N    how many migrations must be pending
 *     --require-empty     the target must have no ledger and no product
 *                         tables. For a bootstrap only; omit it for an
 *                         ordinary incremental migration.
 *     --apply             actually apply. Without it, verify and stop.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createSafeConsole, redact, redactError } from "./redact-secrets.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(`${REPO}/package.json`);
const postgres = require("postgres");

const MIGRATIONS_DIR = join(REPO, "supabase", "migrations");
/*
 * Deliberately NOT inside `supabase/migrations/`. The Supabase CLI treats
 * every file in that directory as a candidate migration and prints a skip
 * notice for anything that is not `<timestamp>_name.sql`, on every run.
 */
const MANIFEST = join(REPO, "supabase", "migration-manifest.json");

const SECRETS = [];
const out = createSafeConsole(SECRETS);

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  out.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
};
const abort = (message) => {
  out.error(`\n✗ ABORTED: ${message}\n`);
  cleanup();
  process.exit(1);
};

let scratch = null;
const cleanup = () => {
  if (scratch) {
    try {
      rmSync(scratch, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
    scratch = null;
  }
};
process.on("exit", cleanup);

// ------------------------------------------------------------------- arguments
const args = new Map();
const repeated = [];
for (const argument of process.argv.slice(2)) {
  const [key, value = "true"] = argument.replace(/^--/, "").split("=");
  if (key === "deny-ref") repeated.push(value);
  else args.set(key, value);
}
const urlEnvKey = args.get("url-env");
const expectRef = args.get("expect-ref");
const expectCount = args.has("expect-count")
  ? Number(args.get("expect-count"))
  : null;
const requireEmpty = args.get("require-empty") === "true";
const doApply = args.get("apply") === "true";

if (!urlEnvKey || !expectRef) {
  abort("--url-env and --expect-ref are required. See the header for usage.");
}

// ----------------------------------------------------------------- configuration
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

let envFile = "";
try {
  envFile = readFileSync(join(REPO, ".env.local"), "utf8");
} catch {
  abort("no .env.local to read.");
}

const rawUrl = process.env[urlEnvKey] || readEnvValue(envFile, urlEnvKey);
if (!rawUrl) abort(`${urlEnvKey} is not set.`);

let parsed;
try {
  parsed = new URL(rawUrl);
} catch {
  abort(`${urlEnvKey} is not a readable connection string.`);
}
/* Registered before anything can throw with it embedded. */
if (parsed.password) {
  SECRETS.push(decodeURIComponent(parsed.password), parsed.password);
}

const mask = (ref) =>
  typeof ref === "string" && ref.length >= 8
    ? `${ref.slice(0, 4)}…${ref.slice(-4)}`
    : "(unreadable)";

// =============================================================== 1. the target
out.log("1. target identity");

const host = parsed.hostname.toLowerCase();
const port = parsed.port || "(default)";
const database = parsed.pathname.replace(/^\//, "") || "(none)";
const username = decodeURIComponent(parsed.username || "");

/*
 * A pooler hostname is shared by every project in its region, so the host
 * identifies nothing. The ref lives in the username (`postgres.<ref>`) for a
 * pooler, and in the host for a direct connection. Both are read, and every
 * ref found must be the expected one.
 */
const refFromUser = username.includes(".")
  ? username.slice(username.indexOf(".") + 1)
  : null;
const refFromHost =
  (host.match(/^db\.([a-z0-9]{20})\.supabase\.co$/) ?? [])[1] ?? null;
const refs = [refFromUser, refFromHost].filter(Boolean);

if (refs.length === 0) {
  abort(
    "no project reference in the connection string; a pooler URI needs the `postgres.<ref>` username form.",
  );
}
if (refs.some((ref) => ref !== expectRef)) {
  abort(
    `the connection string names a different project: found ${refs.map(mask).join(", ")}, expected ${mask(expectRef)}.`,
  );
}
check(
  "names the expected project",
  true,
  `${mask(expectRef)} via ${refFromUser ? "username" : "hostname"}`,
);
out.log(`    host ${host}  port ${port}  database ${database}`);

/* The development project is denied whether or not anyone remembered to. */
const devUrl = readEnvValue(envFile, "NEXT_PUBLIC_SUPABASE_URL");
let devRef = null;
try {
  devRef =
    (new URL(devUrl).hostname.match(/^([a-z0-9]{20})\./) ?? [])[1] ?? null;
} catch {
  /* not configured; the explicit deny list still applies */
}
const denied = new Set([...repeated, ...(devRef ? [devRef] : [])]);
if (denied.has(expectRef)) {
  abort(
    `the expected ref ${mask(expectRef)} is also on the deny list. Refusing.`,
  );
}
check(
  "distinct from development",
  devRef !== null && devRef !== expectRef,
  devRef === null
    ? "development ref not resolvable from config"
    : `development is ${mask(devRef)}`,
);
if (devRef === null)
  abort(
    "could not resolve the development project ref, so 'not development' cannot be proven.",
  );

// ========================================================== 2. TLS, before connecting
out.log("\n2. transport security");

const caPem = (
  process.env.TEST_DATABASE_CA_CERT ||
  readEnvValue(envFile, "TEST_DATABASE_CA_CERT") ||
  readEnvValue(envFile, "DATABASE_CA_CERT") ||
  ""
)
  .replace(/^["']|["']$/g, "")
  .replace(/\\n/g, "\n");

if (!caPem.includes("BEGIN CERTIFICATE")) {
  abort(
    "no CA certificate available; certificate verification cannot be enabled.",
  );
}
scratch = mkdtempSync(join(tmpdir(), "limenzy-migrate-"));
const caPath = join(scratch, "ca.pem");
writeFileSync(caPath, caPem.endsWith("\n") ? caPem : `${caPem}\n`, {
  mode: 0o600,
});
chmodSync(caPath, 0o600);
check(
  "CA certificate available",
  true,
  "Supabase root, written 0600 to a private temp file",
);

/*
 * verify-full, not verify-ca: the difference is hostname verification, which
 * is the half that stops a valid certificate for another host being accepted.
 */
const tlsUrlObject = new URL(rawUrl);
tlsUrlObject.searchParams.set("sslmode", "verify-full");
tlsUrlObject.searchParams.set("sslrootcert", caPath);
const tlsUrl = tlsUrlObject.toString();
check(
  "sslmode=verify-full requested",
  true,
  "certificate chain and hostname both checked",
);

// ============================================= 3. connect read-only and inspect
out.log("\n3. target state (read-only)");

const sql = postgres(rawUrl, {
  max: 1,
  idle_timeout: 5,
  connect_timeout: 15,
  prepare: false,
  onnotice: () => {},
  ssl: { ca: caPem, rejectUnauthorized: true, servername: host },
});

let applied = [];
let looksReal = false;
try {
  const [tls] =
    await sql`select current_database() as db, current_user as role`;
  check(
    "connected with verified TLS",
    true,
    `as ${tls.role} (rejectUnauthorized, servername ${host})`,
  );

  const [shape] = await sql`
    select to_regclass('public.workspaces') is not null as has_workspaces,
           to_regclass('public.leads')      is not null as has_leads,
           to_regclass('supabase_migrations.schema_migrations') is not null as has_ledger`;

  if (shape.has_ledger) {
    const rows = await sql`
      select version from supabase_migrations.schema_migrations order by version`;
    applied = rows.map((r) => String(r.version));
  }
  looksReal = shape.has_workspaces || shape.has_leads || applied.length > 0;

  if (requireEmpty) {
    check(
      "target is empty (bootstrap requirement)",
      !looksReal,
      `workspaces=${shape.has_workspaces} leads=${shape.has_leads} applied=${applied.length}`,
    );
    if (looksReal)
      abort(
        "--require-empty was given but the target already carries schema or history.",
      );
  } else {
    check(
      "ledger read",
      true,
      `${applied.length} migration(s) already applied`,
    );
  }
} catch (error) {
  abort(redactError(error, SECRETS));
} finally {
  await sql.end({ timeout: 5 }).catch(() => {});
}

// ================================================ 4. the plan, and file integrity
out.log("\n4. migration plan and file integrity");

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch {
  abort(`no readable manifest at ${MANIFEST}.`);
}
const manifestEntries = manifest.migrations ?? [];
const appliedSet = new Set(applied);
const pending = manifestEntries.filter(
  (entry) => !appliedSet.has(entry.version),
);

/* An applied version with no file is drift, and drift is never safe to push past. */
const manifestVersions = new Set(manifestEntries.map((entry) => entry.version));
const orphans = applied.filter((version) => !manifestVersions.has(version));
check(
  "no applied migration is missing from the repository",
  orphans.length === 0,
  orphans.join(", ") || "none",
);
if (orphans.length > 0)
  abort("the target has history this repository cannot account for.");

const ordered =
  pending.map((entry) => entry.version).join(",") ===
  [...pending]
    .sort((a, b) => a.version.localeCompare(b.version))
    .map((entry) => entry.version)
    .join(",");
check(
  "pending migrations are in ascending order",
  ordered,
  `${pending.length} pending`,
);

if (expectCount !== null) {
  check(
    "pending count matches expectation",
    pending.length === expectCount,
    `${pending.length} pending, expected ${expectCount}`,
  );
  if (pending.length !== expectCount)
    abort("the pending set is not what was expected.");
}

let integrityOk = true;
for (const entry of pending) {
  const path = join(MIGRATIONS_DIR, entry.file);
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    integrityOk = false;
    out.log(`    ✗ ${entry.version} — file missing`);
    continue;
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  const manifestOk = actual === entry.sha256;

  /* The committed file, read from git rather than from the working tree. */
  const show = spawnSync(
    "git",
    ["show", `HEAD:supabase/migrations/${entry.file}`],
    {
      cwd: REPO,
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const committedOk =
    show.status === 0 &&
    createHash("sha256").update(show.stdout).digest("hex") === actual;

  if (!manifestOk || !committedOk) {
    integrityOk = false;
    out.log(
      `    ✗ ${entry.version} — manifest=${manifestOk} committed=${committedOk}`,
    );
  }
}
check(
  "every pending file matches the manifest and its committed version",
  integrityOk,
  `${pending.length} file(s) checked`,
);
if (!integrityOk)
  abort(
    "a migration file differs from the manifest or from the version committed in git.",
  );

out.log("\n   plan:");
for (const entry of pending) out.log(`     ${entry.version}  ${entry.file}`);

// ================================================= 5. the runner's own dry-run
out.log("\n5. supported runner agrees (supabase db push --dry-run)");

const pushArgs = [
  "supabase",
  "db",
  "push",
  "--db-url",
  tlsUrl,
  "--include-all",
  "--skip-vault",
  "--yes",
];
const dry = spawnSync("npx", [...pushArgs, "--dry-run"], {
  cwd: REPO,
  encoding: "utf8",
  timeout: 300_000,
});
const dryOutput = `${dry.stdout ?? ""}${dry.stderr ?? ""}`;
if (dry.status !== 0) {
  out.error(redactError(dryOutput, SECRETS));
  abort(`the runner's dry-run exited ${dry.status}.`);
}
const dryVersions = [
  ...new Set(
    (dryOutput.match(/\b(\d{14})_/g) ?? []).map((m) => m.slice(0, 14)),
  ),
];
const planVersions = pending.map((entry) => entry.version);
const agrees =
  dryVersions.length === planVersions.length &&
  dryVersions.every((version, index) => version === planVersions[index]);
check(
  "dry-run plan matches, in order",
  agrees,
  `runner reported ${dryVersions.length}`,
);
if (!agrees) {
  out.log("   runner said:");
  out.log(
    redact(dryOutput, SECRETS)
      .split("\n")
      .map((l) => `     ${l}`)
      .join("\n"),
  );
  abort("the runner's plan differs from the expected plan.");
}

// ========================================================================= apply
const failed = checks.filter((c) => !c.ok);
out.log(
  `\n${failed.length === 0 ? "✓" : "✗"} ${checks.length - failed.length}/${checks.length} checks passed`,
);
if (failed.length > 0) abort(`failed: ${failed.map((c) => c.name).join(", ")}`);

if (!doApply) {
  out.log(
    "\nVERIFY ONLY — nothing was applied. Re-run with --apply to proceed.\n",
  );
  cleanup();
  process.exit(0);
}

out.log("\n6. applying");
const run = spawnSync("npx", pushArgs, {
  cwd: REPO,
  encoding: "utf8",
  timeout: 1_800_000,
});
const runOutput = `${run.stdout ?? ""}${run.stderr ?? ""}`;
out.log(redact(runOutput, SECRETS));
if (run.status !== 0)
  abort(
    `the runner exited ${run.status}. The ledger above is the actual state; read it before retrying.`,
  );
out.log(
  `\n✓ applied ${planVersions.length} migration(s) to ${mask(expectRef)}\n`,
);
cleanup();
