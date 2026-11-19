/**
 * Setup delays in concurrency tests, scaled to the environment.
 *
 * ## What these delays are, and what they are not
 *
 * A race test starts transaction A, waits for it to reach a known point, then
 * starts transaction B and asserts how the two resolve. The wait is SETUP: it
 * establishes the precondition the assertion is about. It is not a retry, not
 * a tolerance, and not part of any guarantee.
 *
 * The suites express that wait as a fixed sleep — 250ms, typically. Against
 * the local stack a statement round trip is sub-millisecond, so 250ms is
 * thousands of round trips and the precondition always holds. Against a
 * hosted project each round trip is a few hundred milliseconds, and the
 * handful of trips A needs to open its transaction, set its context and call
 * its routine can exceed 250ms. B then starts first and the test observes the
 * opposite ordering — which is exactly what was measured: five tests failed
 * by getting the *other* order's correct outcome, with no timeout and no
 * assertion about locking disproved.
 *
 * So the number is scaled with the environment, and nothing else changes.
 * Every assertion, every expected outcome and the lock order under test stay
 * as they were. Scaling a setup delay is not the same as retrying until a
 * flaky test passes: if the lock order were actually wrong, a longer wait
 * would make the failure MORE reliable, not less.
 *
 * ## The better fix, not taken here
 *
 * A sleep is a guess about how long something takes. A barrier — A signals
 * once it holds its locks, B starts on that signal — removes the guess and
 * would be deterministic in both environments. That is a change to nineteen
 * call sites across six suites, and is recorded as follow-up rather than
 * attempted alongside the runner work.
 */

/** How much longer a hosted round trip takes than a loopback one. */
const HOSTED_FACTOR = 8;

/**
 * Scale a setup delay for the current environment.
 *
 * `scaled(250)` stays 250ms locally and becomes 2s against a hosted project.
 *
 * Named `scaled`, not `settle`: one suite already defines a local `settle`
 * that returns a sleep Promise, and a shadowed import there silently turned a
 * timeout argument into a Promise.
 */
export function scaled(milliseconds: number): number {
  return process.env.LIMENZY_TEST_MODE === "hosted"
    ? milliseconds * HOSTED_FACTOR
    : milliseconds;
}
