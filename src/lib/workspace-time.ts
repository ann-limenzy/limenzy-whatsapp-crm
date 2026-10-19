/**
 * What time it is, in the clock the business works to — spec §158.
 *
 * §158 stores an IANA time zone per workspace, and that is the only clock a
 * Lead's history should ever be read in: "10:04" means something to a team in
 * Kolkata in a way "04:34 UTC" does not, and a team with people in two
 * countries still needs ONE answer to "when did that happen", not one per
 * reader's laptop.
 *
 * **Formatted on the server, passed down as a string.** `toLocaleString()`
 * with no explicit locale and zone resolves both from whoever runs it, and a
 * component is rendered on the server before it is rendered in the browser.
 * The two disagree, React calls it a hydration mismatch and throws the tree
 * away — which is exactly how Milestone 2C lost a one-time invitation link.
 * `invitation-display.ts` solved this for a date; this does it for a moment.
 *
 * **No offset is written down here.** The offset for a zone changes with the
 * season and occasionally by legislation, so it is asked of `Intl` for the
 * instant being formatted rather than stored, derived or assumed.
 */

/** The zone used when a workspace's own setting cannot be honoured. */
export const FALLBACK_TIME_ZONE = "UTC";

/** Whether this runtime can actually format in the given zone. */
export function isUsableTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone to format in: the workspace's, or UTC when that cannot be used.
 *
 * A stored setting can outlive the ICU data that understood it, and a date
 * still has to render. Falling back is reported through `labelFor` rather
 * than hidden, so a reader is never told the wrong hour.
 */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  return timeZone && isUsableTimeZone(timeZone) ? timeZone : FALLBACK_TIME_ZONE;
}

const DATE: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
};

const TIME: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/** A day, in the workspace's zone. "19 Oct 2026". */
export function formatWorkspaceDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    ...DATE,
    timeZone: resolveTimeZone(timeZone),
  }).format(date);
}

/** A moment, in the workspace's zone. "19 Oct 2026, 10:04". */
export function formatWorkspaceMoment(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    ...DATE,
    ...TIME,
    timeZone: resolveTimeZone(timeZone),
  }).format(date);
}

/** Just the clock time, for a list where the day is already said. "10:04". */
export function formatWorkspaceTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    ...TIME,
    timeZone: resolveTimeZone(timeZone),
  }).format(date);
}

/**
 * How to name the zone on screen, for one instant.
 *
 * The short name is asked of `Intl` for that instant, so a summer reading and
 * a winter reading of the same workspace differ when the zone says they
 * should. Zones with no common abbreviation come back as an offset — accurate
 * and still not written down anywhere.
 */
export function timeZoneLabel(date: Date, timeZone: string): string {
  const zone = resolveTimeZone(timeZone);
  const short =
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "short" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? zone;
  return zone === short ? zone : `${zone} (${short})`;
}
