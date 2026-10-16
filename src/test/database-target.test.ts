import { describe, expect, it } from "vitest";

import {
  OFFLINE_RUNTIME_URL,
  OFFLINE_TOOLING_URL,
  assertMatchedDatabaseTargets,
  describeTarget,
  describeTargetMismatch,
  formatTarget,
  isLoopback,
  resolveTestTargets,
  targetsMatch,
} from "../../scripts/database-target.mjs";

/**
 * The mixed-target guard, offline.
 *
 * No database is contacted and no suite is run: every case here is a pair of
 * connection strings and the decision the guard makes about them. The strings
 * are synthetic and the passwords are obvious placeholders.
 *
 * What this protects: a runtime pointed at a hosted project while tooling
 * points at the local stack. The suites would create fixtures in one database
 * and assert against the other, and the writes would still land — which is
 * how a test run quietly creates rows in a real environment.
 */

const LOCAL_TOOLING =
  "postgresql://postgres:placeholder@127.0.0.1:54322/postgres";
const LOCAL_RUNTIME =
  "postgresql://limenzy_app:placeholder@127.0.0.1:54322/postgres";
const HOSTED_RUNTIME =
  "postgresql://limenzy_app.project:placeholder@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres";

describe("a target is described by its non-secret parts only", () => {
  it("reads host, port and database", () => {
    expect(describeTarget(LOCAL_RUNTIME)).toEqual({
      host: "127.0.0.1",
      port: "54322",
      database: "postgres",
    });
  });

  it("never returns the username or the password", () => {
    const described = JSON.stringify(describeTarget(LOCAL_RUNTIME));
    expect(described).not.toContain("placeholder");
    expect(described).not.toContain("limenzy_app");
  });

  it("never prints a credential in the formatted form", () => {
    expect(formatTarget(describeTarget(HOSTED_RUNTIME))).toBe(
      "aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres",
    );
  });

  it.each([
    ["an empty string", ""],
    ["not a URL", "nonsense"],
    ["a number", 42],
  ])("returns null for %s", (_why, value) => {
    expect(describeTarget(value as string)).toBeNull();
  });
});

describe("matching", () => {
  it("accepts two connections to the same database", () => {
    expect(describeTargetMismatch(LOCAL_RUNTIME, LOCAL_TOOLING)).toBeNull();
  });

  it("rejects a hosted runtime with local tooling", () => {
    const problem = describeTargetMismatch(HOSTED_RUNTIME, LOCAL_TOOLING);
    expect(problem).not.toBeNull();
    expect(problem).toContain("two different databases");
    // The operator needs to see WHICH two, without a credential.
    expect(problem).toContain("pooler.supabase.com:6543");
    expect(problem).toContain("127.0.0.1:54322");
    expect(problem).not.toContain("placeholder");
  });

  it("warns explicitly when one side is not loopback", () => {
    expect(describeTargetMismatch(HOSTED_RUNTIME, LOCAL_TOOLING)).toContain(
      "can write to a real environment",
    );
  });

  it("rejects the same host on a different port", () => {
    expect(
      describeTargetMismatch(
        "postgresql://u:p@127.0.0.1:54322/postgres",
        "postgresql://u:p@127.0.0.1:5432/postgres",
      ),
    ).toContain("two different databases");
  });

  it("rejects the same host and port with a different database", () => {
    expect(
      describeTargetMismatch(
        "postgresql://u:p@127.0.0.1:54322/postgres",
        "postgresql://u:p@127.0.0.1:54322/other",
      ),
    ).toContain("two different databases");
  });

  it("accepts differing usernames, which is the whole point", () => {
    // The runtime and tooling roles are deliberately different people on the
    // same database; only the target has to match.
    expect(describeTargetMismatch(LOCAL_RUNTIME, LOCAL_TOOLING)).toBeNull();
  });

  it("treats an unreadable target as a mismatch, never as a match", () => {
    expect(describeTargetMismatch("", LOCAL_TOOLING)).toContain(
      "both must be readable",
    );
    expect(describeTargetMismatch(LOCAL_RUNTIME, "nonsense")).toContain(
      "both must be readable",
    );
    expect(targetsMatch(null, null)).toBe(false);
  });

  it("knows which hosts are loopback", () => {
    expect(isLoopback(describeTarget(LOCAL_RUNTIME))).toBe(true);
    expect(isLoopback(describeTarget(HOSTED_RUNTIME))).toBe(false);
    expect(isLoopback(null)).toBe(false);
  });
});

describe("the assertion used by every database-test entry point", () => {
  it("throws on a mixed pair", () => {
    expect(() =>
      assertMatchedDatabaseTargets(HOSTED_RUNTIME, LOCAL_TOOLING),
    ).toThrow(/database targets/);
  });

  it("does not throw on a matched pair", () => {
    expect(() =>
      assertMatchedDatabaseTargets(LOCAL_RUNTIME, LOCAL_TOOLING),
    ).not.toThrow();
  });

  it("puts no credential in the thrown message", () => {
    try {
      assertMatchedDatabaseTargets(HOSTED_RUNTIME, LOCAL_TOOLING);
      throw new Error("expected a throw");
    } catch (error) {
      expect((error as Error).message).not.toContain("placeholder");
    }
  });
});

describe("every database-test entry point actually calls it", () => {
  it.each([
    "src/server/auth/create-initial-workspace.db.test.ts",
    "src/server/auth/workspace-context.db.test.ts",
    "src/server/auth/workspace-names.db.test.ts",
  ])("%s", async (path) => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(path, "utf8");
    expect(source).toContain("assertMatchedDatabaseTargets(RUNTIME, TOOLING)");
  });

  it("the npm run test:db runner checks before it probes", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("scripts/test-db.mjs", "utf8");
    expect(source).toContain("describeTargetMismatch");
    // Before the reachability probe, so a mixed pair is refused without
    // opening either connection.
    expect(source.indexOf("describeTargetMismatch(")).toBeLessThan(
      source.indexOf("await probe`select 1`"),
    );
  });
});

/**
 * What a test runner is allowed to be handed — the decision `vitest.config.mts`
 * makes before any suite loads.
 *
 * Still offline: these are strings in, a verdict out. Nothing here connects,
 * and nothing needs mocking to keep it that way.
 */
describe("resolveTestTargets", () => {
  const HOSTED_TOOLING =
    "postgresql://postgres.project:placeholder@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres";

  it("passes a matched loopback pair through untouched", () => {
    expect(
      resolveTestTargets({ runtime: LOCAL_RUNTIME, tooling: LOCAL_TOOLING }),
    ).toEqual({
      runtime: LOCAL_RUNTIME,
      tooling: LOCAL_TOOLING,
      refusal: null,
    });
  });

  it("leaves an unconfigured machine alone", () => {
    // A fresh clone or CI: nothing to refuse, and the suites skip themselves.
    expect(resolveTestTargets({ runtime: "", tooling: "" })).toEqual({
      runtime: "",
      tooling: "",
      refusal: null,
    });
    expect(resolveTestTargets()).toEqual({
      runtime: "",
      tooling: "",
      refusal: null,
    });
  });

  it("refuses a hosted runtime, naming the variable and the target", () => {
    // The exact configuration that let a plain `vitest` run point the live
    // suites at hosted development.
    const decided = resolveTestTargets({
      runtime: HOSTED_RUNTIME,
      tooling: LOCAL_TOOLING,
    });
    expect(decided.refusal).toContain("DATABASE_URL");
    expect(decided.refusal).toContain(
      "aws-0-ap-northeast-2.pooler.supabase.com",
    );
    expect(decided.refusal).toContain("not loopback");
  });

  it("refuses a hosted tooling connection just as readily", () => {
    const decided = resolveTestTargets({
      runtime: LOCAL_RUNTIME,
      tooling: HOSTED_TOOLING,
    });
    expect(decided.refusal).toContain("DRIZZLE_TOOLING_DATABASE_URL");
    expect(decided.refusal).toContain("not loopback");
  });

  it("refuses two DIFFERENT loopback databases", () => {
    // Both local, so the loopback rule alone would pass them — and fixtures
    // would still land in one database while the assertions read the other.
    for (const tooling of [
      "postgresql://postgres:placeholder@127.0.0.1:5432/postgres",
      "postgresql://postgres:placeholder@127.0.0.1:54322/other",
    ]) {
      const decided = resolveTestTargets({ runtime: LOCAL_RUNTIME, tooling });
      expect(decided.refusal, tooling).toContain("two different databases");
    }
  });

  it("refuses a string it cannot read", () => {
    expect(
      resolveTestTargets({ runtime: "nonsense", tooling: LOCAL_TOOLING })
        .refusal,
    ).toContain("not a readable connection string");
  });

  it("hands back something unreachable rather than something empty", () => {
    /*
     * Both at once: a suite that only needs a WELL-FORMED url to construct a
     * pool from still gets one, and no suite can reach a database. Clearing
     * them instead turned one configuration problem into six unrelated
     * failures in tests that never open a connection.
     */
    const decided = resolveTestTargets({
      runtime: HOSTED_RUNTIME,
      tooling: LOCAL_TOOLING,
    });
    expect(decided.runtime).toBe(OFFLINE_RUNTIME_URL);
    expect(decided.tooling).toBe(OFFLINE_TOOLING_URL);

    for (const url of [OFFLINE_RUNTIME_URL, OFFLINE_TOOLING_URL]) {
      const target = describeTarget(url);
      expect(target, url).not.toBeNull();
      expect(isLoopback(target), url).toBe(true);
      // Port 1: nothing listens, so a connection is refused instantly — and
      // it is emphatically not the local stack's 54322.
      expect(target!.port, url).toBe("1");
    }
  });

  it("never puts a password in the refusal", () => {
    const secret = "sup3r-s3cret-value";
    const decided = resolveTestTargets({
      runtime: `postgresql://limenzy_app:${secret}@db.example.com:5432/postgres`,
      tooling: `postgresql://postgres:${secret}@127.0.0.1:54322/postgres`,
    });
    expect(decided.refusal).not.toBeNull();
    expect(decided.refusal).not.toContain(secret);
    expect(JSON.stringify(decided)).not.toContain(secret);
  });

  it("checks a single configured half on its own", () => {
    // Only one set: there is no pair to mismatch, but it still may not be
    // hosted.
    expect(
      resolveTestTargets({ runtime: LOCAL_RUNTIME, tooling: "" }).refusal,
    ).toBeNull();
    expect(
      resolveTestTargets({ runtime: HOSTED_RUNTIME, tooling: "" }).refusal,
    ).toContain("not loopback");
  });
});
