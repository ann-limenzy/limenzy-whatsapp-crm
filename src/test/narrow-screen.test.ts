import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards against narrow-screen horizontal overflow at the source level.
 *
 * jsdom performs no layout, so it cannot measure `scrollWidth`. What it CAN do
 * is stop the change that reliably causes overflow: a fixed pixel width or a
 * minimum width applied unconditionally to something the phone header or the
 * bottom bar renders. Every such value in the shell must be behind a
 * breakpoint prefix, so it can only take effect once there is room for it.
 *
 * The live browser measurements are recorded in the milestone report; this
 * test is the regression net between those runs.
 */

const SHELL_DIR = "src/components/app-shell";

function shellFiles(): string[] {
  return readdirSync(SHELL_DIR)
    .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
    .map((f) => join(SHELL_DIR, f));
}

/**
 * Widths wide enough to overflow a 320px viewport if they were unconditional.
 *
 * Deliberately narrow in scope: `min-w-0`, small decorative widths and
 * intrinsically shrinkable values are not problems, and flagging them would
 * make this guard noise that someone eventually deletes. What actually causes
 * horizontal overflow is a LARGE fixed or minimum width that applies at every
 * breakpoint.
 */
const OVERFLOW_THRESHOLD_PX = 160;

function findRiskyWidths(source: string): string[] {
  const risky: string[] = [];

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("//") || line.startsWith("*")) continue;

    // A width inside a surface that only renders from `lg` up is safe — the
    // desktop sidebar and the desktop search field never reach a phone.
    if (/lg:(?:flex|inline-flex|block)\b/.test(line)) continue;
    if (line.includes("var(--sidebar-w)")) continue;

    // Capturing the leading boundary rather than using a lookbehind keeps this
    // within the project's ES2017 target. The boundary is what excludes
    // `max-w-[...]`: a MAXIMUM width still shrinks, so it cannot overflow.
    const pattern =
      /(^|[\s"'`])((?:xs|sm|md|lg|xl|2xl):)?(min-w|w)-\[(\d+(?:\.\d+)?)(px|rem)\]/g;

    for (const match of line.matchAll(pattern)) {
      const prefix = match[2];
      if (prefix) continue; // conditional widths are fine
      const value = Number(match[4]);
      const px = match[5] === "rem" ? value * 16 : value;
      if (px >= OVERFLOW_THRESHOLD_PX) risky.push(line);
    }
  }

  return risky;
}

describe("narrow-screen safety", () => {
  it("applies no unconditional wide fixed width in the always-on shell", () => {
    const offenders: string[] = [];
    for (const file of shellFiles()) {
      for (const line of findRiskyWidths(readFileSync(file, "utf8"))) {
        offenders.push(`${file}: ${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("detects a regression if one is introduced", () => {
    // Proves the guard above can actually fail, rather than passing vacuously.
    expect(findRiskyWidths('<div className="min-w-[320px]" />')).toHaveLength(
      1,
    );
    expect(findRiskyWidths('<div className="w-[400px]" />')).toHaveLength(1);
    // …and that legitimate patterns stay clear of it.
    expect(findRiskyWidths('<div className="min-w-0 w-8" />')).toHaveLength(0);
    expect(findRiskyWidths('<div className="max-w-[1400px]" />')).toHaveLength(
      0,
    );
    expect(
      findRiskyWidths('<div className="sm:min-w-[320px]" />'),
    ).toHaveLength(0);
  });

  it("sizes the mobile bar from a token the content padding also reads", () => {
    // One source for the bar height means the main padding can never fall out
    // of step and let content hide behind the fixed bar.
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/--mobile-nav-h:/);

    const shell = readFileSync(join(SHELL_DIR, "app-shell.tsx"), "utf8");
    const nav = readFileSync(join(SHELL_DIR, "mobile-nav.tsx"), "utf8");
    expect(shell).toContain("var(--mobile-nav-h)");
    expect(nav).toContain("var(--mobile-nav-h)");
  });

  it("accounts for the safe-area inset in both the bar and the content padding", () => {
    const shell = readFileSync(join(SHELL_DIR, "app-shell.tsx"), "utf8");
    const nav = readFileSync(join(SHELL_DIR, "mobile-nav.tsx"), "utf8");
    expect(nav).toContain("env(safe-area-inset-bottom)");
    expect(shell).toContain("env(safe-area-inset-bottom)");
  });

  it("keeps the bottom-bar tracks shrinkable", () => {
    const nav = readFileSync(join(SHELL_DIR, "mobile-nav.tsx"), "utf8");
    // minmax(0, 1fr) tracks + min-w-0 items are what allow five items to fit
    // 320px instead of forcing the bar wider than the viewport.
    expect(nav).toContain("minmax(0, 1fr)");
    expect(nav).toContain("min-w-0");
  });

  it("drives the desktop sidebar and the content offset from one variable", () => {
    const sidebar = readFileSync(
      join(SHELL_DIR, "desktop-sidebar.tsx"),
      "utf8",
    );
    const shell = readFileSync(join(SHELL_DIR, "app-shell.tsx"), "utf8");
    expect(sidebar).toContain("w-[var(--sidebar-w)]");
    expect(shell).toContain("lg:ps-[var(--sidebar-w)]");
  });

  it("confines the collapse rules to desktop widths", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const block = css.slice(css.indexOf("Desktop sidebar collapse"));
    const mediaAt = block.indexOf("@media (min-width: 64rem)");
    const firstRule = block.indexOf('[data-sidebar="collapsed"]');
    // Every collapse rule sits inside the lg media query, so a stored
    // `collapsed` cannot reach the tablet drawer or the mobile bottom bar.
    expect(mediaAt).toBeGreaterThan(-1);
    expect(mediaAt).toBeLessThan(firstRule);
  });

  it("statSync sanity: every shell file inspected", () => {
    const files = shellFiles();
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) expect(statSync(f).isFile()).toBe(true);
  });
});
