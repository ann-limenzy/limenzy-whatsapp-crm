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
 * **None of them exists.** There is no Leads table, no Customers table, no
 * Follow-ups, Renewals or WhatsApp conversation table — the business modules
 * are Milestones 3 and later. So today the precondition is not merely passing,
 * it is vacuous: there is no record of any kind that a person could own or be
 * assigned, so deactivating someone cannot strand anything.
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
]);

/**
 * Sources that make a person responsible for active work.
 *
 * **Empty, and correctly so.** The five §160 categories have no tables yet.
 * This is not a placeholder: the test beside it fails the moment a table
 * appears that is in neither list, so the emptiness is checked rather than
 * assumed.
 */
export const RESPONSIBILITY_SOURCES: readonly ResponsibilitySource[] =
  Object.freeze([]);

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
export function responsibilitiesBlockingDeactivation(): ResponsibilityCheck {
  if (RESPONSIBILITY_SOURCES.length === 0) return { kind: "no_sources_exist" };

  // Unreachable while the registry is empty. Left as a throw rather than a
  // permissive default so that registering a source without implementing its
  // count fails loudly on the first deactivation instead of allowing one.
  throw new Error(
    "a responsibility source is registered but no count is implemented for it",
  );
}
