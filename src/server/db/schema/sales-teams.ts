import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { userProfiles } from "./user-profiles";
import { workspaceMemberships } from "./workspace-memberships";
import { workspaces } from "./workspaces";

/**
 * Sales Teams and membership — spec §163.1–§163.4, §163.12, §163.14, §163.15.
 *
 * Structure and administration only. There is no eligibility column and no
 * rotation state: §163.5–§163.9 are Milestone 5, and a column nothing writes
 * would imply coverage that does not exist.
 *
 * ## Two things here are deliberately not what they first look like
 *
 * **A membership row is a PERIOD, not a person-in-a-team.** §163.2: "An ended
 * membership is permanent history and must never be reopened. A user who
 * rejoins a team receives a new membership period." So the key is `id`, a
 * fresh one each time, and a person may have many ended rows for the same
 * team. Keying on (team, user) would make the second spell unrepresentable
 * and would invite exactly the reopening the specification forbids.
 *
 * **Team Lead is a table of periods, not a flag.** Leadership can change hands
 * twice inside one unbroken membership, and §163.15 requires that former
 * responsibility "remains visible historically". A boolean on the membership
 * row can say who leads now; it cannot say that anyone ever did.
 *
 * ## What the database enforces that this file cannot show
 *
 * The partial unique indexes below carry "at most one active membership per
 * person" and "at most one open lead period per team". The other half —
 * every ACTIVE team has at least one, and an active membership belongs to an
 * active workspace member — is a DEFERRED CONSTRAINT TRIGGER in
 * `20261026090000_sales_teams.sql`, because creation writes a team, a
 * membership and a lead period in one transaction and no ordering of those
 * three is valid at every intermediate step.
 *
 * No application role may write these tables directly. `limenzy_app` holds
 * SELECT and nothing else; every change goes through a routine that takes the
 * established lock order and re-checks authority once the locks are held.
 */

export const salesTeamStatus = pgEnum("sales_team_status", [
  "active",
  "inactive",
]);

export const salesTeamMembershipStatus = pgEnum(
  "sales_team_membership_status",
  ["active", "ended"],
);

/** Only the kinds this slice can emit. Assignment kinds arrive with §163.13. */
export const salesTeamActivityKind = pgEnum("sales_team_activity_kind", [
  "team_created",
  "team_renamed",
  "team_deactivated",
  "team_reactivated",
  "member_added",
  "member_removed",
  "member_transferred",
  "team_lead_designated",
  "team_lead_ended",
]);

export const salesTeams = pgTable(
  "sales_teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),

    name: text("name").notNull(),
    description: text("description"),

    status: salesTeamStatus("status").notNull().default("active"),

    createdByUserProfileId: uuid("created_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "restrict" },
    ),
    updatedByUserProfileId: uuid("updated_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "restrict" },
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "sales_teams_name_not_blank",
      sql`${table.name} = btrim(${table.name}) and btrim(${table.name}) <> ''`,
    ),
    check("sales_teams_name_length", sql`char_length(${table.name}) <= 60`),
    check(
      "sales_teams_description_length",
      sql`${table.description} is null or char_length(${table.description}) <= 500`,
    ),
    /** The foreign-key target, so a membership cannot cross workspaces. */
    unique("sales_teams_workspace_id_key").on(table.workspaceId, table.id),
    /**
     * §163.1, unconditional rather than active-only: a team is never deleted
     * and its name stays attached to its history, so reusing it for a
     * different team would make two teams indistinguishable in an audit.
     */
    uniqueIndex("sales_teams_name_key").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
  ],
);

export const salesTeamMemberships = pgTable(
  "sales_team_memberships",
  {
    /** One membership PERIOD. See the module note above. */
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),

    salesTeamId: uuid("sales_team_id").notNull(),
    userProfileId: uuid("user_profile_id").notNull(),

    status: salesTeamMembershipStatus("status").notNull().default("active"),

    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),

    joinedByUserProfileId: uuid("joined_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "restrict" },
    ),
    endedByUserProfileId: uuid("ended_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "restrict" },
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.salesTeamId],
      foreignColumns: [salesTeams.workspaceId, salesTeams.id],
      name: "sales_team_memberships_team_fkey",
    }).onDelete("restrict"),
    /**
     * Keyed to the MEMBERSHIP, so a team membership for someone who is not in
     * this workspace is unrepresentable. The "active workspace member" half is
     * a state and is enforced by the deferred constraint in the migration.
     */
    foreignKey({
      columns: [table.workspaceId, table.userProfileId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.userProfileId,
      ],
      name: "sales_team_memberships_member_fkey",
    }).onDelete("restrict"),

    unique("sales_team_memberships_workspace_id_key").on(
      table.workspaceId,
      table.id,
    ),
    check(
      "sales_team_memberships_ended_consistently",
      sql`(${table.status} = 'active' and ${table.endedAt} is null)
          or (${table.status} = 'ended' and ${table.endedAt} is not null)`,
    ),
    check(
      "sales_team_memberships_ended_after_joined",
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.joinedAt}`,
    ),
    /**
     * §163.2's cardinality rule — one active membership per person per
     * workspace, not per team. Also the backstop two concurrent requests hit:
     * both may read "no active membership", only one can insert.
     */
    uniqueIndex("sales_team_memberships_one_active_key")
      .on(table.workspaceId, table.userProfileId)
      .where(sql`status = 'active'`),
    index("sales_team_memberships_team_idx").on(
      table.workspaceId,
      table.salesTeamId,
      table.status,
    ),
  ],
);

export const salesTeamLeadPeriods = pgTable(
  "sales_team_lead_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),

    salesTeamId: uuid("sales_team_id").notNull(),
    /**
     * The PERIOD, not the person: leadership belongs to a spell of
     * membership, so it can never outlive the membership that carried it.
     */
    membershipId: uuid("membership_id").notNull(),

    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),

    startedByUserProfileId: uuid("started_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "restrict" },
    ),
    endedByUserProfileId: uuid("ended_by_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "restrict" },
    ),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.salesTeamId],
      foreignColumns: [salesTeams.workspaceId, salesTeams.id],
      name: "sales_team_lead_periods_team_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.membershipId],
      foreignColumns: [
        salesTeamMemberships.workspaceId,
        salesTeamMemberships.id,
      ],
      name: "sales_team_lead_periods_membership_fkey",
    }).onDelete("restrict"),
    check(
      "sales_team_lead_periods_ended_after_started",
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`,
    ),
    /** At most one OPEN period per team; "at least one" is the deferred check. */
    uniqueIndex("sales_team_lead_periods_one_open_key")
      .on(table.salesTeamId)
      .where(sql`ended_at is null`),
    index("sales_team_lead_periods_membership_idx").on(
      table.workspaceId,
      table.membershipId,
    ),
  ],
);

export const salesTeamActivities = pgTable(
  "sales_team_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),

    salesTeamId: uuid("sales_team_id").notNull(),

    kind: salesTeamActivityKind("kind").notNull(),

    actorUserProfileId: uuid("actor_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "restrict" },
    ),
    subjectUserProfileId: uuid("subject_user_profile_id").references(
      () => userProfiles.id,
      { onDelete: "restrict" },
    ),

    /** §163.4 item 10: a transfer records the former team and the destination. */
    fromSalesTeamId: uuid("from_sales_team_id"),
    toSalesTeamId: uuid("to_sales_team_id"),

    /** The name as it stood, for a rename — history keeps the old wording. */
    detail: text("detail"),

    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.workspaceId, table.salesTeamId],
      foreignColumns: [salesTeams.workspaceId, salesTeams.id],
      name: "sales_team_activities_team_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.fromSalesTeamId],
      foreignColumns: [salesTeams.workspaceId, salesTeams.id],
      name: "sales_team_activities_from_team_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.workspaceId, table.toSalesTeamId],
      foreignColumns: [salesTeams.workspaceId, salesTeams.id],
      name: "sales_team_activities_to_team_fkey",
    }).onDelete("restrict"),
    check(
      "sales_team_activities_detail_length",
      sql`${table.detail} is null or char_length(${table.detail}) <= 500`,
    ),
    index("sales_team_activities_team_idx").on(
      table.workspaceId,
      table.salesTeamId,
      table.occurredAt.desc(),
      table.id.desc(),
    ),
  ],
);
