import { describe, expect, it } from "vitest";

import {
  isLoopbackUrl,
  projectRefFrom,
  resolveRoleSetupTarget,
} from "../../scripts/db-role-local.mjs";

/**
 * Offline proof of the target-selection guards in `scripts/db-role-local.mjs`.
 *
 * This script sets a role's password. Pointed at the wrong project it rotates
 * the credential a running environment depends on, and the damage is done
 * before anyone reads the output — so the decision is made from the strings
 * alone, and proven here with no database and no environment.
 *
 * The connection strings below are fictional. No password in this file is
 * real, and nothing here opens a socket.
 */

const DEV_REF = "devdevdevdevdevdevde";
const TEST_REF = "qploerjxeyybotjsjenz";
const OTHER_REF = "otherotherotherother";

const pooler = (ref: string) =>
  `postgresql://postgres.${ref}:Fict1t10us@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;
const direct = (ref: string) =>
  `postgresql://postgres:Fict1t10us@db.${ref}.supabase.co:5432/postgres`;
const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Narrow a refusal so its reason can be asserted; fails if it was accepted. */
const reasonOf = (
  decision: ReturnType<typeof resolveRoleSetupTarget>,
): string => {
  expect(decision.ok).toBe(false);
  return decision.ok ? "" : decision.reason;
};

describe("projectRefFrom", () => {
  it("reads the ref from a pooler username", () => {
    expect(projectRefFrom(pooler(TEST_REF))).toBe(TEST_REF);
  });

  it("reads the ref from a direct hostname", () => {
    expect(projectRefFrom(direct(TEST_REF))).toBe(TEST_REF);
  });

  it("finds no ref in a loopback URL", () => {
    expect(projectRefFrom(LOCAL)).toBeNull();
  });

  it("refuses a URL whose username and hostname disagree", () => {
    /* Contradictory evidence is not evidence. */
    const mixed = `postgresql://postgres.${OTHER_REF}:x@db.${TEST_REF}.supabase.co:5432/postgres`;
    expect(projectRefFrom(mixed)).toBeNull();
  });

  it("returns null for an unreadable string", () => {
    expect(projectRefFrom("not a url")).toBeNull();
  });
});

describe("isLoopbackUrl", () => {
  it.each([
    ["postgresql://u:p@127.0.0.1:54322/postgres", true],
    ["postgresql://u:p@localhost:54322/postgres", true],
    [
      "postgresql://u:p@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
      false,
    ],
    ["nonsense", false],
  ])("%s → %s", (url, expected) => {
    expect(isLoopbackUrl(url)).toBe(expected);
  });
});

describe("resolveRoleSetupTarget — the local default stays local", () => {
  it("accepts loopback with no flags", () => {
    const decision = resolveRoleSetupTarget({
      toolingUrl: LOCAL,
      developmentRef: DEV_REF,
    });
    expect(decision).toMatchObject({
      ok: true,
      mode: "local",
      envKey: "DATABASE_URL",
    });
  });

  it("REFUSES a hosted target in the default mode", () => {
    /*
     * The hazard this closes: pointing DRIZZLE_TOOLING_DATABASE_URL at a
     * hosted project and running the local command would have rotated that
     * project's application password.
     */
    const decision = resolveRoleSetupTarget({
      toolingUrl: pooler(TEST_REF),
      developmentRef: DEV_REF,
    });
    expect(reasonOf(decision)).toMatch(/local-only/);
  });

  it("refuses when no connection string is supplied", () => {
    expect(resolveRoleSetupTarget({ toolingUrl: "" }).ok).toBe(false);
  });

  it("refuses an unreadable connection string", () => {
    expect(resolveRoleSetupTarget({ toolingUrl: "not a url" }).ok).toBe(false);
  });
});

describe("resolveRoleSetupTarget — development is never a target", () => {
  it("refuses the development project in local mode", () => {
    const decision = resolveRoleSetupTarget({
      toolingUrl: pooler(DEV_REF),
      developmentRef: DEV_REF,
    });
    expect(reasonOf(decision)).toMatch(/DEVELOPMENT/);
  });

  it("refuses the development project in test mode, even when named", () => {
    const decision = resolveRoleSetupTarget({
      mode: "test",
      toolingUrl: pooler(DEV_REF),
      expectRef: DEV_REF,
      developmentRef: DEV_REF,
    });
    expect(reasonOf(decision)).toMatch(/DEVELOPMENT/);
  });
});

describe("resolveRoleSetupTarget — hosted test mode", () => {
  it("accepts the expected project and selects the test variable", () => {
    const decision = resolveRoleSetupTarget({
      mode: "test",
      toolingUrl: pooler(TEST_REF),
      expectRef: TEST_REF,
      developmentRef: DEV_REF,
    });
    expect(decision).toMatchObject({
      ok: true,
      mode: "test",
      envKey: "TEST_DATABASE_URL",
      ref: TEST_REF,
    });
  });

  it("requires --expect-ref", () => {
    const decision = resolveRoleSetupTarget({
      mode: "test",
      toolingUrl: pooler(TEST_REF),
      developmentRef: DEV_REF,
    });
    expect(reasonOf(decision)).toMatch(/--expect-ref/);
  });

  it("REFUSES a mismatched pair — URL names one project, flag names another", () => {
    const decision = resolveRoleSetupTarget({
      mode: "test",
      toolingUrl: pooler(OTHER_REF),
      expectRef: TEST_REF,
      developmentRef: DEV_REF,
    });
    expect(reasonOf(decision)).toMatch(/different project/);
  });

  it("refuses a URL with no identifiable project", () => {
    const decision = resolveRoleSetupTarget({
      mode: "test",
      toolingUrl:
        "postgresql://postgres:x@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
      expectRef: TEST_REF,
      developmentRef: DEV_REF,
    });
    expect(reasonOf(decision)).toMatch(/no project reference/);
  });

  it("refuses an unknown mode", () => {
    const decision = resolveRoleSetupTarget({
      mode: "staging",
      toolingUrl: pooler(TEST_REF),
      expectRef: TEST_REF,
    });
    expect(decision.ok).toBe(false);
  });

  it("never leaks a password in a refusal", () => {
    const decision = resolveRoleSetupTarget({
      mode: "test",
      toolingUrl: pooler(OTHER_REF),
      expectRef: TEST_REF,
      developmentRef: DEV_REF,
    });
    expect(reasonOf(decision)).not.toContain("Fict1t10us");
  });
});
