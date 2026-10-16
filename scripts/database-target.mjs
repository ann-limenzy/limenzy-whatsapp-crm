/**
 * Guard against running a database suite with MIXED targets.
 *
 * The runtime and tooling connections are two halves of one design: the
 * tooling role creates fixtures, the runtime role proves row-level security
 * keeps them apart. Pointed at two different databases they prove nothing —
 * the fixtures land in one place and the assertions read another — and the
 * writes still happen. Worse, the writes can land in a hosted project while
 * the reader is local, which is how a test suite quietly creates rows in a
 * real environment.
 *
 * So the targets are compared BEFORE any fixture or write, and a mismatch is
 * a hard stop rather than a skip. Stopping a container is not a control: the
 * next person to start one re-arms the hazard.
 *
 * Only non-secret parts are read: host, port and database name. The password
 * and username are never parsed, compared, returned or printed.
 */

/**
 * The comparable, non-secret identity of a connection target.
 *
 * Returns `null` for anything unparseable, which callers treat as "unknown",
 * never as "matching".
 */
export function describeTarget(url) {
  if (typeof url !== "string" || url === "") return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host) return null;
    return {
      host,
      // Both Supabase pooler ports and local ports are explicit in practice;
      // an absent port is reported as such rather than guessed.
      port: parsed.port || "(default)",
      database: parsed.pathname.replace(/^\//, "") || "(none)",
    };
  } catch {
    return null;
  }
}

/** Is this target the loopback interface? */
export function isLoopback(target) {
  return (
    target !== null &&
    (target.host === "127.0.0.1" ||
      target.host === "localhost" ||
      target.host === "::1")
  );
}

/** Human, secret-free description, for an error message. */
export function formatTarget(target) {
  return target === null
    ? "(unreadable)"
    : `${target.host}:${target.port}/${target.database}`;
}

/**
 * Do the two targets name the same database?
 *
 * Host, port and database must all agree. A target that could not be parsed
 * never matches — "unknown" is not "the same".
 */
export function targetsMatch(runtime, tooling) {
  if (runtime === null || tooling === null) return false;
  return (
    runtime.host === tooling.host &&
    runtime.port === tooling.port &&
    runtime.database === tooling.database
  );
}

/**
 * The reason a database suite must not run, or `null` when it may.
 *
 * Separated from throwing so it can be tested offline, with no database and
 * no environment.
 */
export function describeTargetMismatch(runtimeUrl, toolingUrl) {
  const runtime = describeTarget(runtimeUrl);
  const tooling = describeTarget(toolingUrl);

  if (runtime === null || tooling === null) {
    return (
      "Database tests need both DATABASE_URL and DRIZZLE_TOOLING_DATABASE_URL, " +
      "and both must be readable connection strings. " +
      `runtime=${formatTarget(runtime)} tooling=${formatTarget(tooling)}`
    );
  }
  if (!targetsMatch(runtime, tooling)) {
    const hosted = !isLoopback(runtime) || !isLoopback(tooling);
    return (
      "Database tests are pointed at two different databases, so they would " +
      "create fixtures in one and assert against the other. " +
      `runtime=${formatTarget(runtime)} tooling=${formatTarget(tooling)}` +
      (hosted
        ? " One of these is not loopback: a run like this can write to a real environment."
        : "") +
      " Point both at the same database before running a database suite."
    );
  }
  return null;
}

/**
 * A syntactically valid connection string that cannot reach any database.
 *
 * Port 1 on loopback: nothing listens there, so a connection attempt is
 * refused by the kernel immediately — no DNS, no network, and above all no
 * database, real or local. It exists because some unit tests only need a
 * WELL-FORMED url to construct a pool from and never open it; handing them an
 * empty string turns a configuration guard into six unrelated failures.
 *
 * The role names matter only because `src/lib/env.ts` validates them.
 */
export const OFFLINE_RUNTIME_URL =
  "postgresql://limenzy_app:offline@127.0.0.1:1/postgres";
export const OFFLINE_TOOLING_URL =
  "postgresql://postgres:offline@127.0.0.1:1/postgres";

/**
 * Decide what a test runner may be given, BEFORE anything connects.
 *
 * `.env.local` is the application's configuration and its `DATABASE_URL`
 * legitimately points wherever the developer runs the app — hosted
 * development, for instance. A database suite must never follow it there: it
 * creates fixtures, asserts that row-level security keeps them apart, and
 * attempts writes that are *supposed* to be refused. `assertMatchedDatabaseTargets`
 * already refuses at the dedicated runner, but a plain `vitest` invocation
 * never reaches that check and would take the value as it stands.
 *
 * So the decision moves here, where every runner passes, and it is made from
 * the strings alone — no connection, no probe, nothing to mock.
 *
 * Refusing REPLACES both values with the unreachable sentinel above rather
 * than clearing them, so a suite that needs a well-formed string still gets
 * one while no suite can reach a database. `refusal` is non-null exactly when
 * that happened, so a caller can say so out loud instead of letting a silent
 * skip read as a pass.
 *
 * Nothing here parses or returns a password.
 */
export function resolveTestTargets({ runtime = "", tooling = "" } = {}) {
  const pass = { runtime, tooling, refusal: null };

  // Neither configured: a fresh clone or CI. The suites skip themselves and
  // `REQUIRE_DATABASE_TESTS` is what turns that into a failure where it
  // matters. There is nothing unsafe to refuse.
  if (runtime === "" && tooling === "") return pass;

  const refuse = (refusal) => ({
    runtime: OFFLINE_RUNTIME_URL,
    tooling: OFFLINE_TOOLING_URL,
    refusal,
  });

  for (const [name, url] of [
    ["DATABASE_URL", runtime],
    ["DRIZZLE_TOOLING_DATABASE_URL", tooling],
  ]) {
    if (url === "") continue;
    const target = describeTarget(url);
    if (target === null) {
      return refuse(`${name} is not a readable connection string.`);
    }
    if (!isLoopback(target)) {
      return refuse(
        `${name} points at ${formatTarget(target)}, which is not loopback. ` +
          "Database suites create and delete rows, so they may only ever run " +
          "against a local database.",
      );
    }
  }

  // Both loopback by here. They must also be the SAME loopback database, or
  // fixtures land in one and the assertions read the other.
  if (runtime !== "" && tooling !== "") {
    const problem = describeTargetMismatch(runtime, tooling);
    if (problem !== null) return refuse(problem);
  }

  return pass;
}

/**
 * Throw unless both connections name the same database.
 *
 * Called by every database-test entry point before a fixture exists.
 */
export function assertMatchedDatabaseTargets(runtimeUrl, toolingUrl) {
  const problem = describeTargetMismatch(runtimeUrl, toolingUrl);
  if (problem !== null) throw new Error(`[database targets] ${problem}`);
}
