import { describe, expect, it } from "vitest";

import { MEMBERS_PER_PAGE, pageOf, parsePageParam } from "./member-list";

/**
 * Paging for Settings → Users — spec §159.
 *
 * It exists because each address on screen costs one Auth Admin request, so
 * the cost of a render has to be bounded by what is displayed. The property
 * that matters most is below: no member is ever unreachable.
 */

const people = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("reading the page from the query string", () => {
  it.each([
    ["absent", undefined],
    ["empty", ""],
    ["zero", "0"],
    ["negative", "-3"],
    ["fractional", "2.5"],
    ["text", "abc"],
    ["a huge value", "999999999999999999999999"],
    ["an injection attempt", "1; drop table"],
    ["a number", 2],
    ["an object", { page: 2 }],
  ])("treats %s as page 1", (_why, value) => {
    expect(parsePageParam(value)).toBe(1);
  });

  it("reads a positive integer", () => {
    expect(parsePageParam("1")).toBe(1);
    expect(parsePageParam("7")).toBe(7);
  });

  it("takes the first of a repeated parameter", () => {
    expect(parsePageParam(["3", "9"])).toBe(3);
  });
});

describe("taking a page", () => {
  it("returns the first page by default", () => {
    const page = pageOf(people(60), 1, 25);
    expect(page.items).toHaveLength(25);
    expect(page.items[0]).toBe("p1");
    expect(page).toMatchObject({
      page: 1,
      pageCount: 3,
      total: 60,
      hasPrevious: false,
      hasNext: true,
    });
  });

  it("returns a middle page", () => {
    const page = pageOf(people(60), 2, 25);
    expect(page.items[0]).toBe("p26");
    expect(page).toMatchObject({ hasPrevious: true, hasNext: true });
  });

  it("returns a short last page", () => {
    const page = pageOf(people(60), 3, 25);
    expect(page.items).toHaveLength(10);
    expect(page.items.at(-1)).toBe("p60");
    expect(page).toMatchObject({ hasPrevious: true, hasNext: false });
  });

  it("clamps a page beyond the end to the last page", () => {
    // A stale link, or a member removed since the page was rendered, should
    // land somewhere useful rather than on an empty screen.
    const page = pageOf(people(60), 99, 25);
    expect(page.page).toBe(3);
    expect(page.items).toHaveLength(10);
  });

  it("handles an empty list without pretending there are no pages", () => {
    const page = pageOf([], 1, 25);
    expect(page).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
      hasPrevious: false,
      hasNext: false,
    });
  });

  it("fits a single short page on one page", () => {
    const page = pageOf(people(3), 1, 25);
    expect(page.pageCount).toBe(1);
    expect(page.hasNext).toBe(false);
  });

  it("reaches every member across pages, with none lost or repeated", () => {
    // THE property. There is no member-count cutoff: a large workspace is
    // paged, never truncated.
    const all = people(237);
    const seen: string[] = [];
    const pageCount = pageOf(all, 1, MEMBERS_PER_PAGE).pageCount;
    for (let page = 1; page <= pageCount; page += 1) {
      seen.push(...pageOf(all, page, MEMBERS_PER_PAGE).items);
    }
    expect(seen).toEqual(all);
    expect(new Set(seen).size).toBe(all.length);
  });

  it("keeps the page size modest, because each row costs a lookup", () => {
    expect(MEMBERS_PER_PAGE).toBeGreaterThan(0);
    expect(MEMBERS_PER_PAGE).toBeLessThanOrEqual(50);
  });
});
