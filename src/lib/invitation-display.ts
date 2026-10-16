/**
 * How an invitation's expiry is written — spec §158, §159.
 *
 * Formatted **on the server**, once, and passed down as a string.
 *
 * `toLocaleDateString()` without an explicit locale and time zone resolves
 * them from whoever is running it, and a client component is rendered on the
 * server first: the two disagree, React reports a hydration mismatch, and the
 * tree it was rendering is discarded — which in this screen's case threw away
 * the one-time link the person had just been shown. So neither is left to the
 * environment.
 *
 * The time zone is the workspace's §158 setting, because that is the clock
 * the business works to; `UTC` is the fallback for the acceptance screen,
 * where the visitor has no workspace yet by definition.
 */

const OPTIONS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

export function formatInvitationExpiry(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { ...OPTIONS, timeZone }).format(
      date,
    );
  } catch {
    // An unknown zone throws rather than falling back, and a stored setting
    // can outlive the database it came from. The date still has to render.
    return new Intl.DateTimeFormat("en-GB", {
      ...OPTIONS,
      timeZone: "UTC",
    }).format(date);
  }
}
