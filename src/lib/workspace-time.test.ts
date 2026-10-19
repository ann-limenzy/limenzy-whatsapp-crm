import { describe, expect, it } from "vitest";

import {
  FALLBACK_TIME_ZONE,
  formatWorkspaceDate,
  formatWorkspaceMoment,
  formatWorkspaceTime,
  isUsableTimeZone,
  resolveTimeZone,
  timeZoneLabel,
} from "@/lib/workspace-time";

/**
 * Lead timestamps are read in the workspace's clock — spec §158.
 *
 * The defect these cover was reported from the hosted walkthrough: an entry
 * written at 10:04 in Kolkata was displayed as "04:34 UTC". The hour was
 * right and the clock was wrong, which is the worst of both — a reader has
 * no way to tell a timezone problem from a timestamp problem.
 *
 * The instant below is deliberately one that lands on a different DAY in
 * some zones, so a formatter that only shifted the hour would be caught.
 */

/** 19 October 2026, 04:34 UTC — the moment from the report. */
const MOMENT = new Date("2026-10-19T04:34:00.000Z");

describe("the workspace's own clock", () => {
  it("renders the reported moment as the hour the team actually saw", () => {
    // 04:34 UTC is 10:04 in Kolkata. This is the whole bug, in one line.
    expect(formatWorkspaceMoment(MOMENT, "Asia/Kolkata")).toBe(
      "19 Oct 2026, 10:04",
    );
    expect(formatWorkspaceTime(MOMENT, "Asia/Kolkata")).toBe("10:04");
  });

  it("honours a half-hour offset rather than rounding it to a whole one", () => {
    // +05:30 is exactly the kind of zone a hardcoded offset gets wrong.
    expect(formatWorkspaceTime(MOMENT, "Asia/Kolkata")).not.toBe("09:34");
    expect(formatWorkspaceTime(MOMENT, "Asia/Kathmandu")).toBe("10:19");
  });

  it("crosses the date line where the zone says it should", () => {
    // Same instant, previous day in New York; a formatter that shifted only
    // the clock would print 19 October here.
    expect(formatWorkspaceMoment(MOMENT, "America/New_York")).toBe(
      "19 Oct 2026, 00:34",
    );
    expect(formatWorkspaceMoment(MOMENT, "Pacific/Auckland")).toBe(
      "19 Oct 2026, 17:34",
    );
    const lateUtc = new Date("2026-10-19T23:30:00.000Z");
    expect(formatWorkspaceDate(lateUtc, "Pacific/Auckland")).toBe(
      "20 Oct 2026",
    );
    expect(formatWorkspaceDate(lateUtc, "America/New_York")).toBe(
      "19 Oct 2026",
    );
  });

  it("follows daylight saving instead of a stored offset", () => {
    // London is BST in July and GMT in January. The same zone, two answers.
    const july = new Date("2026-07-15T12:00:00.000Z");
    const january = new Date("2026-01-15T12:00:00.000Z");
    expect(formatWorkspaceTime(july, "Europe/London")).toBe("13:00");
    expect(formatWorkspaceTime(january, "Europe/London")).toBe("12:00");
  });
});

describe("naming the zone on screen", () => {
  it("names the zone, and its short form when there is one", () => {
    expect(timeZoneLabel(MOMENT, "Asia/Kolkata")).toBe(
      "Asia/Kolkata (GMT+5:30)",
    );
    const july = new Date("2026-07-15T12:00:00.000Z");
    expect(timeZoneLabel(july, "Europe/London")).toBe("Europe/London (BST)");
    // In winter the same workspace is told something different, correctly.
    const january = new Date("2026-01-15T12:00:00.000Z");
    expect(timeZoneLabel(january, "Europe/London")).toBe("Europe/London (GMT)");
  });

  it("does not repeat itself when the short name is the zone", () => {
    expect(timeZoneLabel(MOMENT, "UTC")).toBe("UTC");
  });
});

describe("a zone this runtime cannot use", () => {
  it("is detected rather than thrown", () => {
    expect(isUsableTimeZone("Asia/Kolkata")).toBe(true);
    expect(isUsableTimeZone("Middle/Earth")).toBe(false);
    expect(isUsableTimeZone("")).toBe(false);
  });

  it("falls back to UTC, and says UTC", () => {
    // A stored setting can outlive the data that understood it. The date
    // still has to render, and the reader still has to be told which clock
    // they are being shown — never a wrong hour under the right label.
    expect(resolveTimeZone("Middle/Earth")).toBe(FALLBACK_TIME_ZONE);
    expect(resolveTimeZone(null)).toBe(FALLBACK_TIME_ZONE);
    expect(resolveTimeZone(undefined)).toBe(FALLBACK_TIME_ZONE);
    expect(formatWorkspaceMoment(MOMENT, "Middle/Earth")).toBe(
      "19 Oct 2026, 04:34",
    );
    expect(timeZoneLabel(MOMENT, "Middle/Earth")).toBe("UTC");
  });

  it("keeps a real zone a real zone", () => {
    expect(resolveTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });
});

describe("the same string on the server and in the browser", () => {
  it("does not consult the ambient locale or zone", () => {
    /*
     * The hydration rule, asserted rather than trusted. A component rendered
     * on the server and again in the browser must produce the same markup;
     * `toLocaleString()` with no explicit locale resolves one from whoever
     * is running it, and the two disagree. Changing the process's own TZ
     * must change nothing here.
     */
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      const west = formatWorkspaceMoment(MOMENT, "Asia/Kolkata");
      process.env.TZ = "Asia/Tokyo";
      const east = formatWorkspaceMoment(MOMENT, "Asia/Kolkata");
      expect(west).toBe("19 Oct 2026, 10:04");
      expect(east).toBe(west);
    } finally {
      process.env.TZ = original;
    }
  });
});
