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
 * Throw unless both connections name the same database.
 *
 * Called by every database-test entry point before a fixture exists.
 */
export function assertMatchedDatabaseTargets(runtimeUrl, toolingUrl) {
  const problem = describeTargetMismatch(runtimeUrl, toolingUrl);
  if (problem !== null) throw new Error(`[database targets] ${problem}`);
}
