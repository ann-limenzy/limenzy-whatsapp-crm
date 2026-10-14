import { describe, expect, it } from "vitest";

import {
  assertMatchedDatabaseTargets,
  describeTarget,
  describeTargetMismatch,
  formatTarget,
  isLoopback,
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
