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
/** The 20-character project ref, read from wherever it is actually stated. */
export function projectRefOf(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const user = decodeURIComponent(parsed.username || "");
  /* A pooler hostname is shared by every project in its region and proves
     nothing; the ref is in the username. A direct connection states it in the
     hostname instead. */
  const fromUser = user.includes(".")
    ? user.slice(user.indexOf(".") + 1)
    : null;
  const fromHost =
    (parsed.hostname
      .toLowerCase()
      .match(/^db\.([a-z0-9]{20})\.supabase\.co$/) ?? [])[1] ?? null;
  /* Contradictory evidence is not evidence. */
  if (fromUser && fromHost && fromUser !== fromHost) return null;
  return fromUser ?? fromHost;
}

/** The role a connection string will authenticate as, tenant suffix removed. */
export function roleOf(url) {
  try {
    const user = decodeURIComponent(new URL(url).username || "");
    return user.includes(".") ? user.slice(0, user.indexOf(".")) : user || null;
  } catch {
    return null;
  }
}

/**
 * Decide whether a HOSTED pair may be used, and refuse everything else.
 *
 * Hosted is never a default and never a fallback. It is reached only by an
 * explicit mode, with the approved project named, and it uses the dedicated
 * TEST variables — the application's own `DATABASE_URL` is not consulted,
 * because a suite that silently followed it would create and delete rows in
 * whatever environment the developer happened to be running.
 *
 * The role check is the part worth keeping: the two connections are only a
 * two-connection design if they really are two roles. A pair that authenticates
 * as `postgres` twice would pass every policy assertion in the suites by
 * bypassing row-level security, and would look exactly like a green run.
 */
/**
 * @param {{
 *   runtime?: string,
 *   tooling?: string,
 *   approvedRef?: string | null,
 *   developmentRef?: string | null,
 *   runtimeRole?: string,
 *   toolingRole?: string,
 * }} [options]
 */
export function resolveHostedTestTargets({
  runtime = "",
  tooling = "",
  approvedRef = null,
  developmentRef = null,
  runtimeRole = "limenzy_app",
  toolingRole = "postgres",
} = {}) {
  const refuse = (refusal) => ({
    runtime: OFFLINE_RUNTIME_URL,
    tooling: OFFLINE_TOOLING_URL,
    refusal,
  });

  if (!approvedRef) {
    return refuse("hosted database tests require the approved project ref.");
  }
  if (developmentRef && approvedRef === developmentRef) {
    return refuse(
      "the approved test project is the DEVELOPMENT project. Refusing: " +
        "database suites create and delete rows.",
    );
  }
  if (runtime === "" || tooling === "") {
    return refuse(
      "hosted database tests need both TEST_DATABASE_URL and " +
        "TEST_DRIZZLE_TOOLING_DATABASE_URL. Neither falls back to the " +
        "application's own configuration.",
    );
  }

  for (const [name, url, expectedRole] of [
    ["TEST_DATABASE_URL", runtime, runtimeRole],
    ["TEST_DRIZZLE_TOOLING_DATABASE_URL", tooling, toolingRole],
  ]) {
    const target = describeTarget(url);
    if (target === null) {
      return refuse(`${name} is not a readable connection string.`);
    }
    const ref = projectRefOf(url);
    if (ref === null) {
      return refuse(
        `${name} does not state a project reference, or states two that ` +
          "disagree. A pooler URI needs the `role.<ref>` username form.",
      );
    }
    if (ref !== approvedRef) {
      return refuse(`${name} names a project other than the approved one.`);
    }
    if (developmentRef && ref === developmentRef) {
      return refuse(`${name} names the DEVELOPMENT project.`);
    }
    const role = roleOf(url);
    if (role !== expectedRole) {
      return refuse(
        `${name} authenticates as "${role ?? "(none)"}", but hosted database ` +
          `tests require "${expectedRole}". The two connections must be two ` +
          "different roles, or row-level security proves nothing.",
      );
    }
  }

  const problem = describeTargetMismatch(runtime, tooling);
  if (problem !== null) return refuse(problem);

  return { runtime, tooling, refusal: null };
}

/**
 * @param {{
 *   runtime?: string,
 *   tooling?: string,
 *   mode?: string,
 *   approvedRef?: string | null,
 *   developmentRef?: string | null,
 * }} [options]
 */
export function resolveTestTargets({
  runtime = "",
  tooling = "",
  mode = "local",
  approvedRef = null,
  developmentRef = null,
} = {}) {
  if (mode === "hosted") {
    return resolveHostedTestTargets({
      runtime,
      tooling,
      approvedRef,
      developmentRef,
    });
  }

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
