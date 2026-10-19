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
   */
  readonly blockedBy: string;
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
  ]);
