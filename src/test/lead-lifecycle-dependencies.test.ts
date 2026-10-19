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
  it("declares the two behaviours 3C could not build", () => {
    expect(LIFECYCLE_DEPENDENCIES.map((d) => d.blockedBy).sort()).toEqual([
      "customers",
      "follow_ups",
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

  it("still has every blocking table absent", async () => {
    const tables = await declaredTables();
    const arrived = LIFECYCLE_DEPENDENCIES.filter((dependency) =>
      tables.has(dependency.blockedBy),
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
