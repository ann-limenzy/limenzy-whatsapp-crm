import { describe, expect, it } from "vitest";

import {
  NO_RESPONSIBILITY_TABLES,
  RESPONSIBILITY_SOURCES,
  SECTION_160_CATEGORIES,
  responsibilitiesBlockingDeactivation,
} from "@/server/auth/deactivation-responsibilities";

/**
 * The guard that keeps §160 honest as business modules arrive.
 *
 * §160 requires that a user's active responsibilities be reassigned before
 * they are deactivated. None of the five kinds it names exists yet, so the
 * check is vacuous — and "vacuous" and "checked and clear" look identical
 * from outside. This suite is what makes the difference visible:
 *
 *   * every table the schema defines must be classified, so adding one forces
 *     a decision instead of being silently ignored;
 *   * the registry must report "no sources exist" rather than "nothing found",
 *     so no caller can mistake one for the other.
 *
 * Read the module's header for what this does NOT cover. In short: it sees
 * tables, not columns; it cannot judge meaning; and it reads the declared
 * schema, not a live database.
 */

/** Every table the application's own schema declares. */
async function declaredTables(): Promise<string[]> {
  const schema = await import("@/server/db/schema/index");
  const { getTableConfig } = await import("drizzle-orm/pg-core");
  const { isTable } = await import("drizzle-orm");

  return (
    Object.values(schema)
      .filter((value) => isTable(value))
      .map((table) => getTableConfig(table as never))
      // The auth.users stub is Supabase's table, not ours, and nothing in it is
      // a CRM responsibility.
      .filter((config) => config.schema === undefined)
      .map((config) => config.name)
      .sort()
  );
}

describe("every table is classified for §160", () => {
  it("finds the tables, so the assertions below are not vacuous", async () => {
    const tables = await declaredTables();
    expect(tables.length).toBeGreaterThanOrEqual(3);
  });

  it("leaves no table unclassified", async () => {
    const tables = await declaredTables();
    const classified = new Set([
      ...NO_RESPONSIBILITY_TABLES,
      ...RESPONSIBILITY_SOURCES.map((source) => source.table),
    ]);
    const unclassified = tables.filter((table) => !classified.has(table));

    // THIS IS THE GUARD. A new table — Leads, Customers, follow_ups, anything
    // — fails here until somebody decides whether its rows make a person
    // responsible for active work under §160. Do not "fix" it by adding the
    // name to NO_RESPONSIBILITY_TABLES without making that decision.
    expect(unclassified).toEqual([]);
  });

  it("has no stale classification", async () => {
    const tables = new Set(await declaredTables());
    const stale = [
      ...NO_RESPONSIBILITY_TABLES,
      ...RESPONSIBILITY_SOURCES.map((source) => source.table),
    ].filter((table) => !tables.has(table));
    expect(stale).toEqual([]);
  });

  it("classifies a table exactly once", async () => {
    const both = NO_RESPONSIBILITY_TABLES.filter((table) =>
      RESPONSIBILITY_SOURCES.some((source) => source.table === table),
    );
    expect(both).toEqual([]);
  });
});

describe("the registry reports an empty check as empty, not as clear", () => {
  it("has no responsibility source yet", () => {
    // Not an assertion that this must stay true — it becomes false the moment
    // Leads ship. It records what today's answer rests on.
    expect(RESPONSIBILITY_SOURCES).toEqual([]);
  });

  it("answers no_sources_exist rather than a bare 'nothing found'", () => {
    const check = responsibilitiesBlockingDeactivation();
    expect(check.kind).toBe("no_sources_exist");
    // A boolean here would let a caller print "checked, all clear" about a
    // check that never ran. The distinct outcome is the whole point.
    expect(check).not.toHaveProperty("blocking");
  });

  it("names all five §160 categories, none of them implemented", () => {
    expect(
      SECTION_160_CATEGORIES.map((entry) => entry.category).sort(),
    ).toEqual([
      "customers",
      "follow_ups",
      "leads",
      "renewals",
      "whatsapp_conversations",
    ]);
    // Each names the milestone that will bring it, so the gap has an owner.
    for (const entry of SECTION_160_CATEGORIES) {
      expect(entry.milestone).toMatch(/^Milestone \d+$/);
      expect(
        RESPONSIBILITY_SOURCES.some((s) => s.category === entry.category),
      ).toBe(false);
    }
  });
});

describe("the module states its own limits", () => {
  it("records what the guard cannot see", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(
      "src/server/auth/deactivation-responsibilities.ts",
      "utf8",
    );
    // Checked as text so the limitations cannot be quietly deleted while the
    // guard keeps passing and looking complete.
    expect(source).toMatch(/detects tables, not columns/i);
    expect(source).toMatch(/cannot judge meaning/i);
    expect(source).toMatch(/declared schema, not a database/i);
    expect(source).toMatch(/not the reassignment workflow/i);
  });
});
