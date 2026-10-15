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

    /**
     * Business Phone, Business Email and Address (§158).
     *
     * All optional, and none is collected at onboarding — the bootstrap
     * routine inserts the five fields above and nothing else — so a workspace
     * that has never opened Business Settings holds NULL for all three.
     * "Cleared" is always NULL, never an empty string; a check constraint
     * enforces that so the column cannot hold two spellings of "not provided".
     *
     * `businessEmail` is a contact detail. It is not an identity, is never
     * used to authenticate, and has no relationship to `auth.users.email`.
     */
    businessPhone: text("business_phone"),
    businessEmail: text("business_email"),
    address: text("address"),

    /**
     * Workspace configuration added in Milestone 1D.
     *
     * NULL means never configured, which the application reads as the
     * specification's own defaults: §8's recommended module setup, and —
     * for the two permission columns — fail-closed, because §162 and §162.1
     * name no default.
     */
    enabledModules: text("enabled_modules").array(),
    permissionsGranted: text("permissions_granted").array(),
    managerRecordScope: text("manager_record_scope"),

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
    // Optional contact fields: absent is NULL, never an empty string.
    check(
      "workspaces_business_phone_not_blank",
      sql`${table.businessPhone} is null or btrim(${table.businessPhone}) <> ''`,
    ),
    check(
      "workspaces_business_email_not_blank",
      sql`${table.businessEmail} is null or btrim(${table.businessEmail}) <> ''`,
    ),
    check(
      "workspaces_address_not_blank",
      sql`${table.address} is null or btrim(${table.address}) <> ''`,
    ),
    check(
      "workspaces_business_email_shape",
      sql`${table.businessEmail} is null or (${table.businessEmail} like '%_@_%._%' and ${table.businessEmail} not like '% %')`,
    ),

    /*
     * The Milestone 1D closed sets.
     *
     * Declared here for the same reason every other check on this table is:
     * this file is meant to describe the live table, and a column restored
     * without its constraints describes something more permissive than what
     * the database actually enforces. The `permissions_granted` list is kept
     * in step with `CONFIGURABLE_PERMISSIONS` by a test in
     * `workspace-permissions.unit.test.ts`, which now checks this file too.
     */
    check(
      "workspaces_enabled_modules_known",
      sql`${table.enabledModules} is null or ${table.enabledModules} <@ array['leads', 'customer_followups', 'products_services', 'renewals_reminders', 'whatsapp', 'email']::text[]`,
    ),
    check(
      "workspaces_enabled_modules_dependencies",
      sql`${table.enabledModules} is null or not ('renewals_reminders' = any (${table.enabledModules})) or ('products_services' = any (${table.enabledModules}))`,
    ),
    check(
      "workspaces_permissions_granted_known",
      sql`${table.permissionsGranted} is null or ${table.permissionsGranted} <@ array['view_all_leads_customers', 'add_leads_customers', 'change_record_owner', 'reassign_follow_ups_renewals', 'assign_whatsapp_conversations', 'send_bulk_whatsapp_messages', 'import_export', 'send_manual_email_reminders', 'send_controlled_bulk_email_reminders', 'manually_assign_leads_within_team', 'view_assigned_whatsapp_conversation', 'archive_or_restore_lead', 'archive_or_restore_customer', 'grant_or_revoke_explicit_record_share', 'manually_resolve_lead_in_assignment_required', 'retry_automatic_assignment_for_waiting_lead', 'bulk_reprocess_leads_in_assignment_required', 'clear_undeliverable_email_address', 'resolve_ambiguous_whatsapp_conversation_identity']::text[]`,
    ),
    check(
      "workspaces_manager_record_scope_known",
      sql`${table.managerRecordScope} is null or ${table.managerRecordScope} in ('all_records', 'own_assigned_shared')`,
    ),
  ],
);
