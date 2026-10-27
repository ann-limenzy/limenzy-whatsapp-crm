import "server-only";

/**
 * What the Lead lifecycle owes other milestones, declared rather than left
 * in a comment — spec §45, §46, §48.
 *
 * ## Why this file exists
 *
 * §45 says that marking a Lead Won offers to convert it into a Customer, and
 * §48 says that marking one Lost cancels its incomplete Follow-ups. Neither
 * can happen: there is no `customers` table and no `follow_ups` table. The
 * honest options were to show a button that does nothing, or to leave the
 * behaviour out and say so — and "say so" has to be checkable, or it decays
 * into a comment nobody reads.
 *
 * So this follows the convention `deactivation-responsibilities.ts`
 * established for §160: the gap is DECLARED, and
 * `src/test/lead-lifecycle-dependencies.test.ts` compares the declaration
 * against the tables the schema actually defines. The day `customers`
 * appears, that test fails until someone decides what Won should now do —
 * which is the point. A `TODO` would have kept passing.
 *
 * The prose version, for whoever is deciding rather than compiling, is
 * `docs/dependencies.md`. It also states the rule these entries follow: the
 * product UI never names a milestone, never explains what has not been built
 * and never draws a control that cannot run.
 *
 * Nothing here implements a workflow or a general dependency framework. It
 * records that a decision was deferred, and makes the deferral expire.
 */

/** A behaviour the specification asks for that cannot be built yet. */
export type LifecycleDependency = {
  /** The §-numbered rule that is not yet satisfied. */
  readonly rule: string;
  /** What the specification says should happen. */
  readonly required: string;
  /**
   * The table whose absence blocks it. The guard test asserts this table is
   * still missing: once it exists, the dependency is no longer an excuse.
   *
   * `null` when nothing is waiting on a TABLE. Milestone 4 built the Sales
   * Team tables, which retired that excuse for three rules at once — but two
   * of them were never really waiting on a table. They wait on a §163.18
   * client decision, and `blockedByDecision` is where that is now said, so
   * the guard keeps its teeth instead of being satisfied by a table that
   * arrived without the capability.
   */
  readonly blockedBy: string | null;
  /**
   * The unresolved §163.18 decision that denies it, where there is one.
   * §163.18: "Until a decision is approved and configured for the workspace,
   * the capability it describes is denied in production."
   */
  readonly blockedByDecision?: string;
  /** What the application does instead, today. */
  readonly behaviourToday: string;
};

export const LIFECYCLE_DEPENDENCIES: readonly LifecycleDependency[] =
  Object.freeze([
    {
      rule: "§45, §46",
      required:
        "Marking a Lead Won offers to convert it into a Customer, and the " +
        "Convert action stays available on the Lead afterwards.",
      blockedBy: "customers",
      behaviourToday:
        "Won is recorded and the Lead says so. No Convert control is drawn, " +
        "no choice is offered, and the screen says nothing about conversion " +
        "— a control that cannot run is worse than its absence, and a " +
        "sentence about when it will arrive is worse than both.",
    },
    {
      rule: "§48",
      required:
        "Marking a Lead Lost cancels its incomplete Follow-ups with the " +
        "reason 'Lead Marked Lost' and keeps them in history.",
      blockedBy: "follow_ups",
      behaviourToday:
        "Lost is recorded with its reason. Nothing is cancelled, because " +
        "there is nothing to cancel.",
    },
    {
      rule: "§163.10, §163.18 decision 5",
      required:
        "A Manager may reassign only within their permitted records AND " +
        "teams, and cross-team manual assignment is Owner/Admin only " +
        "unless a later decision grants a narrower capability.",
      blockedBy: null,
      blockedByDecision: "§163.18 decision 5",
      behaviourToday:
        "Teams exist as of Milestone 4, so the table is no longer the " +
        "blocker — the decision is. Reassignment is still scoped by §162.1 " +
        "record access alone, every Manager Sales Team cell in §162 answers " +
        "`decision_required`, and no team boundary is consulted. NOT " +
        "implemented, and not to be described as satisfied.",
    },
    {
      rule: "§163.18 decision 4",
      required:
        "Whether a Team Lead may manually reassign Leads within their own " +
        "team. Denied in production until approved and configured.",
      blockedBy: null,
      blockedByDecision: "§163.18 decision 4",
      behaviourToday:
        "A Team Lead now exists as a responsibility (§163.3), which is " +
        "precisely why the table is no longer the blocker. The " +
        "responsibility confers NO reassignment capability beyond the " +
        "holder's workspace role, which is what §163.10 requires while the " +
        "decision is open.",
    },
    {
      rule: "§163.13",
      required:
        "An assignment history entry carries the Sales Team, the " +
        "assignment rule, the method (Round Robin or Manual), the trigger " +
        "source and a sequence identifier.",
      /*
       * Still a TABLE, and still a different one: the entry needs the rule
       * and the rotation that chose the recipient, and §163.7's rule table
       * is Milestone 5. Teams arriving changed nothing here.
       */
      blockedBy: "lead_assignment_rules",
      behaviourToday:
        "The §39 entry carries the previous owner, the new owner, the " +
        "acting user and the time. The team, rule, method and sequence " +
        "fields are absent rather than nullable placeholders nothing " +
        "writes, because every one of them describes machinery this " +
        "milestone does not have.",
    },
  ]);
