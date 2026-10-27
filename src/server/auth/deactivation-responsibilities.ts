import "server-only";

/**
 * The §160 deactivation precondition, and an honest account of its coverage.
 *
 * §160 says that before a user is deactivated, their active responsibilities
 * must be reassigned to an active user. It names five kinds:
 *
 *     Leads · Customers · incomplete Follow-ups · Renewal actions ·
 *     open WhatsApp conversations
 *
 * **One of them exists.** Milestone 3B shipped Leads, so Leads are registered
 * below and counted for real: a person who is the Record Owner of any Lead
 * cannot be deactivated. The other four tables do not exist yet, so nobody
 * can be responsible for them and the check for those is not merely passing,
 * it is vacuous.
 *
 * **What this does NOT yet give anyone: a way out.** §160 asks for
 * responsibilities to be REASSIGNED first, and reassigning a Lead's Record
 * Owner is §162's `change_record_owner` with §26's eligibility rules, which
 * Milestone 3B deliberately did not implement. So today the answer to "this
 * person owns leads" is a refusal with no offered remedy. That is the order
 * this file has always described — refuse first, build the workflow next —
 * and it is a limitation to state, not a gap to paper over.
 *
 * ## Why this file exists at all
 *
 * Because "vacuously true" and "checked and fine" look identical from the
 * outside, and the first one quietly becomes wrong the day Leads ship. A
 * `return true` with a TODO beside it would keep returning true, and the
 * §160 rule would be bypassed by omission rather than by decision.
 *
 * So the sources are declared, not inferred, and
 * `src/test/deactivation-responsibilities.test.ts` compares this declaration
 * against the tables the schema actually defines. A new table that is neither
 * registered as a responsibility source nor explicitly recorded as carrying
 * none fails that test, which fails the build.
 *
 * ## What the guard does NOT cover — read this before relying on it
 *
 *   * **It detects tables, not columns.** Adding `assigned_to` to an existing
 *     registered table creates a responsibility the guard will not notice.
 *   * **It cannot judge meaning.** It knows a table appeared; whether its rows
 *     are "active work" under §160 is a human decision, which is exactly what
 *     the failure asks for.
 *   * **It reads the declared schema, not a database.** A table created
 *     outside `supabase/migrations/` and absent from the Drizzle schema is
 *     invisible to it.
 *   * **It is not the reassignment workflow.** Offering a target user and
 *     moving the work is Milestone 3 and later. This only answers "is there
 *     anything to reassign?".
 *
 * Nothing here implements a business module or a general workflow framework.
 */

/** A table whose rows can make a person responsible for active work (§160). */
export type ResponsibilitySource = {
  /** The table as the Drizzle schema names it. */
  readonly table: string;
  /** Which §160 category it carries. */
  readonly category: ResponsibilityCategory;
  /**
   * How a count is obtained for one profile. Declared as a description rather
   * than a query, because the query belongs with the module that owns the
   * table — this registry records that the decision was made.
   */
  readonly countsActiveWorkFor: string;
};

/** The five kinds of active work §160 names. */
export type ResponsibilityCategory =
  "leads" | "customers" | "follow_ups" | "renewals" | "whatsapp_conversations";

/**
 * Tables that exist and are known NOT to carry §160 responsibility.
 *
 * Every table in the schema must appear here or in `RESPONSIBILITY_SOURCES`.
 * The point is that adding a table forces a choice; it is not a list anyone
 * should extend without making one.
 */
export const NO_RESPONSIBILITY_TABLES: readonly string[] = Object.freeze([
  // Tenancy, not work: a workspace is not assigned to anybody.
  "workspaces",
  // The person themselves. A profile is who the work would be reassigned
  // FROM, never a piece of work in its own right.
  "user_profiles",
  // The membership being deactivated. Checking it here would be circular.
  "workspace_memberships",
  /*
   * An invitation is an offer, not work. Nobody is "responsible" for one in
   * the §160 sense: it confers no record ownership and no assignment. A
   * pending invitation left behind by someone who has since been demoted or
   * deactivated stops working anyway — the acceptance routine re-checks the
   * issuer's authority before granting membership.
   */
  "workspace_invitations",
  /*
   * Pipeline stages and Lead sources are workspace VOCABULARY, not work.
   * Nobody is responsible for a stage in the §160 sense: the rows carry no
   * owner and no assignee, and deactivating a person changes nothing about
   * them. When Leads arrive, responsibility attaches to the LEAD — its Record
   * Owner — not to the stage it happens to sit in.
   */
  "workspace_lead_stages",
  "workspace_lead_sources",
  /*
   * An override record is an audit entry about something that already
   * happened. Nobody is responsible for one in the §160 sense, and
   * deactivating the person who made it changes nothing about it — least of
   * all whether the override was recorded.
   */
  "lead_duplicate_overrides",
  /*
   * §39's timeline is history: an append-only record of what already
   * happened, attributed to whoever did it. Nobody is responsible for a
   * past event, and the entries deliberately survive their author's
   * deactivation — removing or reassigning them would falsify the record
   * §29 says must be kept.
   */
  "lead_activities",
  /*
   * A Sales Team is a GROUP, not work. Nobody is responsible for a team in
   * the §160 sense: a team carries no record ownership and no assignment, and
   * §163.2 is explicit that "team membership does not grant access to records
   * owned by other team members". Deactivating a person leaves every team
   * standing.
   */
  "sales_teams",
  /*
   * A membership period is neither work nor a reason to keep someone active.
   * It is the thing §160 ENDS when a user is deactivated — `app.set_member_status`
   * closes the active period and keeps it as history — so counting it as
   * blocking work would make deactivation impossible for anyone in a team.
   *
   * The genuine precondition that lives nearby is a different one, and is not
   * a count: §163.3 refuses to deactivate the active Team Lead of an ACTIVE
   * team until a replacement is designated or the team is deactivated. That
   * is enforced inside the routine, where it holds for any caller, rather
   * than here, where it would be a quantity rather than a condition.
   */
  "sales_team_memberships",
  /*
   * A leadership period is the record of a responsibility, not the
   * responsibility itself, and an ended one is history. The live case is
   * covered by the routine's refusal described above.
   */
  "sales_team_lead_periods",
  /*
   * Append-only administrative history, for the same reason `lead_activities`
   * is here: nobody is responsible for a past event, and the entries survive
   * their author's deactivation on purpose.
   */
  "sales_team_activities",
]);

/**
 * Sources that make a person responsible for active work.
 *
 * Registering a source here is a commitment, not a label: the check below
 * refuses to answer at all unless a count was supplied for every registered
 * category, so a source cannot be registered and then left unenforced.
 */
export const RESPONSIBILITY_SOURCES: readonly ResponsibilitySource[] =
  Object.freeze([
    {
      table: "leads",
      category: "leads",
      /*
       * §26: a Lead's responsible person is its RECORD OWNER. Not its
       * creator, who may have been someone else and is only history, and not
       * anyone it is "assigned" to — §162.1 is explicit that operational
       * assignment is never record responsibility.
       *
       * Every Lead counts, because no Lead can be archived yet (§50 is a
       * later milestone). When archive arrives this narrows to active Leads.
       */
      countsActiveWorkFor:
        "leads where record_owner_user_profile_id = the profile",
    },
  ]);

/** The five categories §160 names, and whether each can be checked today. */
export const SECTION_160_CATEGORIES: readonly {
  readonly category: ResponsibilityCategory;
  readonly label: string;
  readonly milestone: string;
}[] = Object.freeze([
  { category: "leads", label: "Leads", milestone: "Milestone 3" },
  { category: "customers", label: "Customers", milestone: "Milestone 6" },
  {
    category: "follow_ups",
    label: "Incomplete follow-ups",
    milestone: "Milestone 7",
  },
  { category: "renewals", label: "Renewal actions", milestone: "Milestone 8" },
  {
    category: "whatsapp_conversations",
    label: "Open WhatsApp conversations",
    milestone: "Milestone 9",
  },
]);

export type ResponsibilityCheck =
  /** Nothing can be owned yet, because no source exists. Not "nothing found". */
  | { readonly kind: "no_sources_exist" }
  /** Sources exist and were counted. */
  | {
      readonly kind: "counted";
      readonly blocking: readonly {
        readonly category: ResponsibilityCategory;
        readonly count: number;
      }[];
    };

/**
 * Whether deactivating a person is blocked by §160 responsibilities.
 *
 * Returns `no_sources_exist` while the registry is empty — deliberately a
 * distinct answer from "counted, and the total was zero". A caller that
 * cannot tell those apart would report "checked and clear" about a check that
 * never happened, which is the whole thing this file exists to prevent.
 *
 * It takes no database handle today because there is nothing to query. When
 * the first source is registered this gains the context parameter and the
 * callers change with it — a compile error at every call site, which is the
 * intended way to find them.
 */
export function responsibilitiesBlockingDeactivation(
  counts: Partial<Record<ResponsibilityCategory, number>> = {},
): ResponsibilityCheck {
  if (RESPONSIBILITY_SOURCES.length === 0) return { kind: "no_sources_exist" };

  /*
   * Every registered category must have been counted. A missing count throws
   * rather than defaulting to zero, so registering a source without wiring
   * its count fails loudly on the first deactivation instead of silently
   * allowing one — which is the whole reason this registry exists.
   */
  const blocking: { category: ResponsibilityCategory; count: number }[] = [];
  for (const source of RESPONSIBILITY_SOURCES) {
    const count = counts[source.category];
    if (count === undefined) {
      throw new Error(
        `a responsibility source is registered but no count was supplied for ${source.category}`,
      );
    }
    if (count > 0) blocking.push({ category: source.category, count });
  }
  return { kind: "counted", blocking: Object.freeze(blocking) };
}
