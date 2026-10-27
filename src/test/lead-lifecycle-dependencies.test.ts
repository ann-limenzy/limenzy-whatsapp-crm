import { describe, expect, it } from "vitest";

import { LIFECYCLE_DEPENDENCIES } from "@/server/auth/lead-lifecycle-dependencies";

/**
 * The guard that makes 3C's deferrals expire — spec §45, §46, §48.
 *
 * Marking a Lead Won should offer conversion to a Customer, and marking one
 * Lost should cancel its incomplete Follow-ups. Neither table exists, so
 * neither behaviour is built. This suite asserts the ONLY defensible reason
 * for that — the table really is absent — and fails the day it appears, so
 * somebody has to decide what the outcome actions now do.
 *
 * It follows the convention `deactivation-responsibilities.test.ts`
 * established for §160, and shares its limits: it sees tables, not columns,
 * and reads the declared schema rather than a live database.
 */

/** Every table the application's own schema declares. */
async function declaredTables(): Promise<Set<string>> {
  const schema = await import("@/server/db/schema/index");
  const { getTableConfig } = await import("drizzle-orm/pg-core");
  const { isTable } = await import("drizzle-orm");

  return new Set(
    Object.values(schema)
      .filter((value) => isTable(value))
      .map((table) => getTableConfig(table as never))
      .filter((config) => config.schema === undefined)
      .map((config) => config.name),
  );
}

describe("the lifecycle dependency registry", () => {
  it("declares every behaviour the Lead lifecycle cannot build yet", () => {
    /*
     * Two from 3C, three from 3D. The three §163 entries are the ones most
     * at risk of being described as done, and Milestone 4 is exactly when
     * that risk arrives: teams now EXIST, so "no table" stops being the
     * reason and each one has to say what is really missing. Two wait on a
     * §163.18 client decision and hold `null` here; the third waits on
     * §163.7's rule table, which is Milestone 5.
     */
    expect(
      LIFECYCLE_DEPENDENCIES.map(
        (d) => d.blockedBy ?? d.blockedByDecision,
      ).sort(),
    ).toEqual([
      "customers",
      "follow_ups",
      "lead_assignment_rules",
      "§163.18 decision 4",
      "§163.18 decision 5",
    ]);
    for (const dependency of LIFECYCLE_DEPENDENCIES) {
      expect(dependency.rule).toMatch(/§\d+/);
      expect(dependency.required.length).toBeGreaterThan(20);
      expect(dependency.behaviourToday.length).toBeGreaterThan(20);
    }
  });

  it("finds the tables, so the assertion below is not vacuous", async () => {
    const tables = await declaredTables();
    expect(tables.has("leads")).toBe(true);
    expect(tables.has("lead_activities")).toBe(true);
  });

  it("says plainly that a vacuous rule is not an implemented one", async () => {
    /*
     * Milestone 4 built the Sales Team tables, which retired "no table" as
     * the excuse for three rules at once. Two were never really waiting on a
     * table — they wait on a §163.18 client decision — and the third now
     * waits on §163.7's rule table, which is Milestone 5. The grouping below
     * is by what is ACTUALLY missing, so the guard keeps its teeth.
     */
    const teamRules = LIFECYCLE_DEPENDENCIES.filter(
      (d) =>
        d.blockedByDecision !== undefined ||
        d.blockedBy === "lead_assignment_rules",
    );
    expect(teamRules).toHaveLength(3);
    // Each says what happens today in terms that cannot be read as "done".
    for (const rule of teamRules) {
      expect(rule.behaviourToday).toMatch(
        /NOT implemented|no reassignment capability|absent rather than/i,
      );
    }
  });

  it("denies every decision-blocked capability, as §163.18 requires", async () => {
    const pending = LIFECYCLE_DEPENDENCIES.filter(
      (d) => d.blockedByDecision !== undefined,
    );
    expect(pending.length).toBeGreaterThan(0);
    for (const rule of pending) {
      // A decision-blocked rule has no table to wait for, and says which
      // decision denies it — §163.18 numbers all five.
      expect(rule.blockedBy).toBeNull();
      expect(rule.blockedByDecision).toMatch(/§163\.18 decision [1-5]/);
    }
  });

  it("still has every blocking table absent", async () => {
    const tables = await declaredTables();
    const arrived = LIFECYCLE_DEPENDENCIES.filter(
      (dependency) =>
        dependency.blockedBy !== null && tables.has(dependency.blockedBy),
    ).map((dependency) => `${dependency.rule} → ${dependency.blockedBy}`);

    // THIS IS THE GUARD. When `customers` or `follow_ups` is added, this
    // fails until somebody implements the behaviour or records a new
    // decision. Do not "fix" it by deleting the dependency.
    expect(arrived).toEqual([]);
  });
});

describe("the application offers nothing it cannot honour", () => {
  it("draws no Convert control while conversion is blocked", async () => {
    const { readFile } = await import("node:fs/promises");
    const panel = await readFile(
      "src/components/leads/lead-lifecycle-panel.tsx",
      "utf8",
    );
    // §45 offers conversion. Until `customers` exists, a Convert button
    // could only fail, so there must not be one — see D-note in the
    // dependency registry.
    expect(panel).not.toMatch(/<Button[^>]*>\s*Convert/i);
    expect(panel).not.toMatch(/convertLead/i);
  });
});
