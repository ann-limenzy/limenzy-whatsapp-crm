import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * A workspace is the tenant. Spec §177: "Every stored business entity belongs
 * to exactly one workspace, and every read and write is scoped to the acting
 * user's workspace."
 *
 * Columns are the fields spec §7 Screen 1 collects when the workspace is
 * created. The further Business Settings fields in §158 — business phone,
 * business email and address — are deliberately **not** here: they are edited
 * in Settings, which is Milestone 2, and adding them now would be speculative.
 *
 * No slug and no workspace status column: the specification defines neither,
 * and inventing either would be a schema decision the product has not made.
 * There is likewise no workspace deletion behaviour in V1, which is why nothing
 * cascades from this table.
 */
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Business Name (§7, §158). Required, and deliberately **not** globally
     * unique — two unrelated businesses may legitimately share a name.
     */
    name: text("name").notNull(),

    /** Business Type / Industry (§7). Optional, and must never lock the CRM
     * into an industry — it only helps with setup and templates. */
    businessType: text("business_type"),

    /** Country (§7, §158). Required. The specification does not name a code
     * standard, so no format is invented here beyond "not blank". */
    country: text("country").notNull(),

    /** Currency (§7, §158). Required, defaulted from country in the UI. The
     * specification does not name a code standard. */
    currency: text("currency").notNull(),

    /**
     * Workspace time zone (§158). Stored as an **IANA identifier** such as
     * `Asia/Kolkata`, never a fixed offset, because offsets change across
     * daylight-saving transitions. §158 requires the server to reject an
     * unknown identifier; the migration adds a trigger so the database
     * guarantees it too.
     */
    timeZone: text("time_zone").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Maintained by the `set_updated_at` trigger, so it cannot drift. */
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("workspaces_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("workspaces_country_not_blank", sql`btrim(${table.country}) <> ''`),
    check("workspaces_currency_not_blank", sql`btrim(${table.currency}) <> ''`),
    check(
      "workspaces_time_zone_not_blank",
      sql`btrim(${table.timeZone}) <> ''`,
    ),
  ],
);
