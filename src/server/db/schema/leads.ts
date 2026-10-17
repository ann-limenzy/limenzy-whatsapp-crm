import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { workspaceLeadSources, workspaceLeadStages } from "./lead-pipeline";
import { workspaceMemberships } from "./workspace-memberships";
import { workspaces } from "./workspaces";

/**
 * Leads — spec §26, §30–§32, §35–§37, §130.1, §162.1.
 *
 * The first business record in this application. Everything before it was
 * tenancy or workspace configuration; a Lead belongs to a person inside a
 * workspace, and who may see it is decided by §162.1 rather than by
 * membership alone.
 *
 * ## Every reference carries the workspace
 *
 * The stage, the source, the Record Owner and the creator are all COMPOSITE
 * foreign keys including `workspace_id`. A Lead pointing at another
 * workspace's stage, or owned by someone who is not a member of its
 * workspace, is unrepresentable rather than merely refused by a policy.
 * The owner and creator key to `workspace_memberships (workspace_id,
 * user_profile_id)` for exactly that reason: membership is the thing being
 * asserted, not the existence of a profile somewhere.
 *
 * ## Contact values are stored twice, on purpose
 *
 * §130.1 keeps what the person typed apart from what the system compares.
 * `phone`/`email` are preserved for display and audit and are never rewritten
 * because normalisation rules changed; `phone_normalised`/`email_normalised`
 * are the comparison values. A phone number that cannot be reduced to E.164
 * safely sets `phone_needs_review` instead of being guessed at — this
 * application has no dial-code table, so only an already-international number
 * normalises.
 *
 * ## What is deliberately absent
 *
 *   * `interested_in` — §32's "Product / Service Interested In" references
 *     Products & Services (§166). A text column would be a different field
 *     wearing its name.
 *   * assignment, Sales Team, Assignment Required — §32 defers the Record
 *     Owner default to §163, which depends on unresolved client decision 1
 *     (§163.18). Here the Record Owner is the creator, and there is no UPDATE
 *     grant on that column at all.
 *   * archive, conversion, follow-ups, custom fields and an activity table.
 *     The one §27 "record created" entry the detail screen shows is DERIVED
 *     from `created_at` and `created_by_user_profile_id`.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),

    /** §32: the one required field. */
    name: text("name").notNull(),

    /** As entered, preserved for display and audit (§130.1). */
    phone: text("phone"),
    /** E.164, only where it could be derived safely (§130.1). */
    phoneNormalised: text("phone_normalised"),
    /** §130.1: flagged for review rather than silently rewritten. */
    phoneNeedsReview: boolean("phone_needs_review").notNull().default(false),
    email: text("email"),
    /** Trimmed and lowercased; no provider-specific transformation (§130.1). */
    emailNormalised: text("email_normalised"),

    notes: text("notes"),

    stageId: uuid("stage_id").notNull(),
    sourceId: uuid("source_id"),

    /** §26: Lead and Customer records use Record Owner, never "assigned to". */
    recordOwnerUserProfileId: uuid("record_owner_user_profile_id").notNull(),
    createdByUserProfileId: uuid("created_by_user_profile_id").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("leads_workspace_id_key").on(table.workspaceId, table.id),

    foreignKey({
      name: "leads_stage_fkey",
      columns: [table.workspaceId, table.stageId],
      foreignColumns: [workspaceLeadStages.workspaceId, workspaceLeadStages.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "leads_source_fkey",
      columns: [table.workspaceId, table.sourceId],
      foreignColumns: [
        workspaceLeadSources.workspaceId,
        workspaceLeadSources.id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "leads_record_owner_fkey",
      columns: [table.workspaceId, table.recordOwnerUserProfileId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.userProfileId,
      ],
    }).onDelete("restrict"),
    foreignKey({
      name: "leads_created_by_fkey",
      columns: [table.workspaceId, table.createdByUserProfileId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.userProfileId,
      ],
    }).onDelete("restrict"),

    check(
      "leads_name_not_blank",
      sql`${table.name} = btrim(${table.name}) and btrim(${table.name}) <> ''`,
    ),
    check("leads_name_length", sql`char_length(${table.name}) <= 120`),
    /** §32: at least one contact method. */
    check(
      "leads_contact_required",
      sql`${table.phone} is not null or ${table.email} is not null`,
    ),
    check(
      "leads_phone_not_blank",
      sql`${table.phone} is null or (${table.phone} = btrim(${table.phone}) and btrim(${table.phone}) <> '')`,
    ),
    check(
      "leads_phone_length",
      sql`${table.phone} is null or char_length(${table.phone}) <= 40`,
    ),
    check(
      "leads_phone_normalised_shape",
      sql`${table.phoneNormalised} is null or ${table.phoneNormalised} ~ '^\\+[1-9][0-9]{6,14}$'`,
    ),
    check(
      "leads_phone_normalised_requires_phone",
      sql`${table.phoneNormalised} is null or ${table.phone} is not null`,
    ),
    check(
      "leads_phone_review_requires_phone",
      sql`not ${table.phoneNeedsReview} or ${table.phone} is not null`,
    ),
    check(
      "leads_phone_review_excludes_normalised",
      sql`not ${table.phoneNeedsReview} or ${table.phoneNormalised} is null`,
    ),
    check(
      "leads_email_not_blank",
      sql`${table.email} is null or (${table.email} = btrim(${table.email}) and btrim(${table.email}) <> '')`,
    ),
    check(
      "leads_email_length",
      sql`${table.email} is null or char_length(${table.email}) <= 254`,
    ),
    check(
      "leads_email_normalised_shape",
      sql`${table.emailNormalised} is null or (${table.emailNormalised} = lower(btrim(${table.emailNormalised})) and ${table.emailNormalised} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$')`,
    ),
    check(
      "leads_email_normalised_requires_email",
      sql`${table.emailNormalised} is null or ${table.email} is not null`,
    ),
    check(
      "leads_notes_length",
      sql`${table.notes} is null or char_length(${table.notes}) <= 4000`,
    ),

    /**
     * None of these is unique. §130.1 warns about duplicates and never
     * prevents them — a genuinely shared number may be retained after
     * authorized review.
     */
    index("leads_phone_normalised_idx")
      .on(table.workspaceId, table.phoneNormalised)
      .where(sql`${table.phoneNormalised} is not null`),
    index("leads_email_normalised_idx")
      .on(table.workspaceId, table.emailNormalised)
      .where(sql`${table.emailNormalised} is not null`),
    index("leads_name_search_idx").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
    index("leads_record_owner_idx").on(
      table.workspaceId,
      table.recordOwnerUserProfileId,
    ),
    index("leads_stage_idx").on(table.workspaceId, table.stageId),
  ],
);

/**
 * One row per Create Anyway — §130.1.
 *
 * "Each override records the acting user, the timestamp, the candidate
 * records shown, the fields that matched, any explanation given and the
 * resulting new record." All six, and nothing more: this is an audit record,
 * not a workflow.
 */
export const leadDuplicateOverrides = pgTable(
  "lead_duplicate_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),

    /** The resulting new record. */
    leadId: uuid("lead_id").notNull(),
    /** The acting user. */
    overriddenByUserProfileId: uuid("overridden_by_user_profile_id").notNull(),
    /** The candidate records shown, as they were shown. */
    candidateLeadIds: uuid("candidate_lead_ids").array().notNull(),
    /** Which fields matched: 'phone', 'email', or both. */
    matchedFields: text("matched_fields").array().notNull(),
    /** Optional, per §130.1. */
    explanation: text("explanation"),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "lead_duplicate_overrides_lead_fkey",
      columns: [table.workspaceId, table.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "lead_duplicate_overrides_actor_fkey",
      columns: [table.workspaceId, table.overriddenByUserProfileId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.userProfileId,
      ],
    }).onDelete("restrict"),
    check(
      "lead_duplicate_overrides_candidates_present",
      sql`array_length(${table.candidateLeadIds}, 1) >= 1`,
    ),
    check(
      "lead_duplicate_overrides_fields_known",
      sql`${table.matchedFields} <@ array['phone', 'email'] and array_length(${table.matchedFields}, 1) >= 1`,
    ),
    check(
      "lead_duplicate_overrides_explanation_length",
      sql`${table.explanation} is null or char_length(${table.explanation}) <= 1000`,
    ),
    index("lead_duplicate_overrides_lead_idx").on(
      table.workspaceId,
      table.leadId,
    ),
  ],
);
