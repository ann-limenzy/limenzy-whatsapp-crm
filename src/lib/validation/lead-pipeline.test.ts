import { describe, expect, it } from "vitest";

import {
  MAX_STAGE_NAME,
  nameIsTaken,
  normaliseName,
  orderingWithNewStage,
  parseName,
  pipelineOrdering,
  reorderStages,
} from "@/lib/validation/lead-pipeline";

/**
 * Pipeline and source names and ordering — spec §34, §164, §165.
 *
 * The ordering functions are where §34's "Won is the final pipeline column"
 * actually lives on the application side; the database has a deferred trigger
 * saying the same thing, and these make sure the two never disagree.
 */

const stage = (
  id: string,
  kind: "active" | "won" | "lost",
  sortOrder: number,
) => ({
  id,
  kind,
  sortOrder,
});

const DEFAULTS = [
  stage("new", "active", 1),
  stage("contacted", "active", 2),
  stage("interested", "active", 3),
  stage("won", "won", 4),
  stage("lost", "lost", 5),
];

describe("names", () => {
  it("collapses inner whitespace as well as trimming", () => {
    // "New  Lead" and "New Lead" read identically, and the active-name index
    // would not catch the difference.
    expect(normaliseName("  New   Lead  ")).toBe("New Lead");
  });

  it("refuses an empty name however it was spelled", () => {
    for (const value of ["", "   ", "\t\n", null, undefined, 7]) {
      const parsed = parseName(value, MAX_STAGE_NAME);
      expect(parsed.ok, String(value)).toBe(false);
      if (!parsed.ok) expect(parsed.issue).toBe("name_required");
    }
  });

  it("refuses one longer than the column holds", () => {
    const parsed = parseName("a".repeat(MAX_STAGE_NAME + 1), MAX_STAGE_NAME);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issue).toBe("name_too_long");
  });

  it("accepts one of exactly the maximum", () => {
    expect(parseName("a".repeat(MAX_STAGE_NAME), MAX_STAGE_NAME).ok).toBe(true);
  });

  it("refuses hidden characters", () => {
    // A zero-width character makes two stages look identical in a list, which
    // is the whole reason for inserting one.
    const parsed = parseName("New​Lead", MAX_STAGE_NAME);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issue).toBe("name_has_control_characters");
  });

  it("treats a name as taken only among ACTIVE rows, ignoring case", () => {
    const existing = [
      { name: "Won", isActive: true },
      { name: "Expo", isActive: false },
    ];
    expect(nameIsTaken("won", existing)).toBe(true);
    expect(nameIsTaken("WON", existing)).toBe(true);
    // §164 keeps the deactivated row for history, and frees the name.
    expect(nameIsTaken("Expo", existing)).toBe(false);
  });
});

describe("ordering", () => {
  it("puts Won after every column and Lost after Won", () => {
    const ordering = pipelineOrdering(
      ["a", "b"],
      [stage("won", "won", 9), stage("lost", "lost", 1)],
    );
    expect(ordering).toEqual([
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
      { id: "won", sortOrder: 3 },
      { id: "lost", sortOrder: 4 },
    ]);
  });

  it("renumbers from 1, repairing any gap an earlier write left", () => {
    const drifted = [
      stage("new", "active", 4),
      stage("contacted", "active", 9),
      stage("won", "won", 20),
      stage("lost", "lost", 21),
    ];
    expect(
      reorderStages(drifted, "contacted", "up")!.map((r) => r.sortOrder),
    ).toEqual([1, 2, 3, 4]);
  });

  it("adds a new column immediately before Won", () => {
    const ordering = orderingWithNewStage(DEFAULTS, "quoted");
    expect(ordering.map((r) => r.id)).toEqual([
      "new",
      "contacted",
      "interested",
      "quoted",
      "won",
      "lost",
    ]);
    expect(ordering.map((r) => r.sortOrder)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("swaps two columns and leaves the outcomes last", () => {
    const ordering = reorderStages(DEFAULTS, "contacted", "up")!;
    expect(ordering.map((r) => r.id)).toEqual([
      "contacted",
      "new",
      "interested",
      "won",
      "lost",
    ]);
  });

  it("refuses a move off either end", () => {
    expect(reorderStages(DEFAULTS, "new", "up")).toBeNull();
    expect(reorderStages(DEFAULTS, "interested", "down")).toBeNull();
  });

  it("refuses to move an outcome", () => {
    // Won is the last column by definition and Lost is not a column at all.
    expect(reorderStages(DEFAULTS, "won", "up")).toBeNull();
    expect(reorderStages(DEFAULTS, "lost", "up")).toBeNull();
  });

  it("refuses a stage it does not know", () => {
    expect(reorderStages(DEFAULTS, "nonexistent", "up")).toBeNull();
  });
});
