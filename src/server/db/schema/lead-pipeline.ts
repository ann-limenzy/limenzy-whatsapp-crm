import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { workspaces } from "./workspaces";

/**
 * Lead pipeline stages and Lead sources — spec §34, §164, §165.
 *
 * Workspace configuration, not Lead data. There is no `leads` table yet; these
 * are the two tables a Lead will point at.
 *
 * **Won is the final pipeline column and Lost is an outcome outside it.** Both
 * are permanent: `kind` cannot change, neither can be deactivated, and there
 * is exactly one of each per workspace.
 *
 * **Rows are deactivated, never deleted** (§29, §34, §165), so a Lead's
 * history keeps the stage and source it referred to.
 *
 * ## The composite keys exist for a table that does not yet exist
 *
 * `unique (workspace_id, id)` on both tables is not a uniqueness requirement —
 * `id` is already the primary key. It is a foreign-key TARGET, so the future
 * `leads` table can declare
 *
 *   foreign key (workspace_id, stage_id)
 *     references workspace_lead_stages (workspace_id, id)
 *
 * and a Lead in one workspace referring to another workspace's stage becomes
 * unrepresentable rather than merely forbidden by a policy.
 *
 * ## What the Lead slice still owes
 *
 * §34 and §165 require that a stage holding active Leads cannot be
 * deactivated. That is **not enforced here and cannot be**, because no Leads
 * exist; the migration says so in its header and no test claims otherwise.
 * When `leads` arrives it must add that check to a BEFORE UPDATE trigger on
 * `workspace_lead_stages`, which runs with the row lock the UPDATE has already
 * taken — and any write of `leads.stage_id` must first take
 * `select … for update` on the stage row, so a deactivation cannot slip
 * between the check and the write.
 */

export const leadStageKind = pgEnum("lead_stage_kind", [
  /** An ordinary pipeline column. */
  "active",
  /** The final pipeline column, and an outcome. Exactly one per workspace. */
  "won",
  /** An outcome that is NOT a pipeline column (§34). Exactly one. */
  "lost",
]);

export const workspaceLeadStages = pgTable(
  "workspace_lead_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),

    name: text("name").notNull(),

    /**
     * Pipeline order. Named `sort_order` because PostgreSQL reads `position`
     * as the `position()` function in a `RETURNS TABLE` list, which made the
     * defaults function unparseable.
     */
    sortOrder: integer("sort_order").notNull(),

    kind: leadStageKind("kind").notNull().default("active"),

    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "workspace_lead_stages_name_not_blank",
      sql`${table.name} = btrim(${table.name}) and btrim(${table.name}) <> ''`,
    ),
    check(
      "workspace_lead_stages_name_length",
      sql`char_length(${table.name}) <= 60`,
    ),
    check(
      "workspace_lead_stages_sort_order_positive",
      sql`${table.sortOrder} > 0`,
    ),
    check(
      "workspace_lead_stages_outcome_always_active",
      sql`${table.kind} = 'active' or ${table.isActive}`,
    ),
    /** The foreign-key target described above. */
    unique("workspace_lead_stages_workspace_id_key").on(
      table.workspaceId,
      table.id,
    ),
    /**
     * Deferred: reordering renumbers several rows in one statement, and any
     * swap collides with itself halfway through unless the check waits for
     * COMMIT.
     */
    unique("workspace_lead_stages_sort_order_key")
      .on(table.workspaceId, table.sortOrder)
      .nullsNotDistinct(),
    /** Case-insensitive, and only among ACTIVE rows, so a name may be reused. */
    uniqueIndex("workspace_lead_stages_active_name_key")
      .on(table.workspaceId, sql`lower(${table.name})`)
      .where(sql`${table.isActive}`),
    uniqueIndex("workspace_lead_stages_won_key")
      .on(table.workspaceId)
      .where(sql`${table.kind} = 'won'`),
    uniqueIndex("workspace_lead_stages_lost_key")
      .on(table.workspaceId)
      .where(sql`${table.kind} = 'lost'`),
  ],
);

export const workspaceLeadSources = pgTable(
  "workspace_lead_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),

    name: text("name").notNull(),

    isActive: boolean("is_active").notNull().default(true),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "workspace_lead_sources_name_not_blank",
      sql`${table.name} = btrim(${table.name}) and btrim(${table.name}) <> ''`,
    ),
    check(
      "workspace_lead_sources_name_length",
      sql`char_length(${table.name}) <= 60`,
    ),
    unique("workspace_lead_sources_workspace_id_key").on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex("workspace_lead_sources_active_name_key")
      .on(table.workspaceId, sql`lower(${table.name})`)
      .where(sql`${table.isActive}`),
  ],
);
