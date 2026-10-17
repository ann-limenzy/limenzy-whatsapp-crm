/**
 * Lead pipeline and source input — spec §34, §164, §165.
 *
 * Pure: the same rules the columns enforce, so a value this accepts the
 * database also accepts, and a value it refuses the database would refuse
 * too. A disagreement either way is a confusing failure deep in a
 * transaction or a silent inconsistency.
 */

export const MAX_STAGE_NAME = 60;
export const MAX_SOURCE_NAME = 60;

/** The three kinds a stage may be. `won` and `lost` are created once, with the workspace. */
export type LeadStageKind = "active" | "won" | "lost";

export type LeadPipelineIssue =
  | "name_required"
  | "name_too_long"
  | "name_has_control_characters"
  | "name_taken";

const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/u;

export type NameParseResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly issue: LeadPipelineIssue };

/**
 * Normalise a stage or source name the way the column stores it.
 *
 * Inner whitespace is collapsed as well as trimmed: "New  Lead" and "New Lead"
 * are the same name to a reader, and the active-name uniqueness index would
 * not catch the difference.
 */
export function normaliseName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function parseName(input: unknown, max: number): NameParseResult {
  const raw = typeof input === "string" ? input : "";
  const value = normaliseName(raw);
  if (value === "") return { ok: false, issue: "name_required" };
  if (value.length > max) return { ok: false, issue: "name_too_long" };
  if (CONTROL_CHARACTERS.test(value)) {
    return { ok: false, issue: "name_has_control_characters" };
  }
  return { ok: true, value };
}

/** Is this name already used by an ACTIVE row? Case-insensitive, as the index is. */
export function nameIsTaken(
  name: string,
  existing: readonly { readonly name: string; readonly isActive: boolean }[],
  options: { readonly ignore?: string } = {},
): boolean {
  const target = name.toLowerCase();
  return existing.some(
    (row) =>
      row.isActive &&
      row.name.toLowerCase() === target &&
      row.name.toLowerCase() !== options.ignore?.toLowerCase(),
  );
}

/**
 * The complete ordering a pipeline should have.
 *
 * Ordinary columns are numbered from 1 in the given order, then Won, then
 * Lost. Returning EVERY row rather than only the ones that moved is what
 * keeps §34's "Won is the final pipeline column" true after an insert: adding
 * a fourth column has to push Won and Lost down, and a function that returned
 * only the new row would leave the pipeline with Won in the middle.
 *
 * It also repairs drift — a gap left by an older write comes back contiguous.
 */
export function pipelineOrdering(
  ordinaryInOrder: readonly string[],
  outcomes: readonly { readonly id: string; readonly kind: LeadStageKind }[],
): readonly { readonly id: string; readonly sortOrder: number }[] {
  const ordering = ordinaryInOrder.map((id, index) => ({
    id,
    sortOrder: index + 1,
  }));
  let next = ordinaryInOrder.length + 1;
  for (const kind of ["won", "lost"] as const) {
    const outcome = outcomes.find((stage) => stage.kind === kind);
    if (outcome) ordering.push({ id: outcome.id, sortOrder: next++ });
  }
  return ordering;
}

/**
 * The ordering after moving one ordinary stage up or down, or `null` when the
 * move is impossible — at either end, or an attempt to move an outcome. Won is
 * the last column by definition and Lost is not a column at all, so neither
 * ever moves.
 */
export function reorderStages(
  stages: readonly {
    readonly id: string;
    readonly kind: LeadStageKind;
    readonly sortOrder: number;
  }[],
  stageId: string,
  direction: "up" | "down",
): readonly { readonly id: string; readonly sortOrder: number }[] | null {
  const ordinary = [...stages]
    .filter((stage) => stage.kind === "active")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const index = ordinary.findIndex((stage) => stage.id === stageId);
  if (index === -1) return null;

  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= ordinary.length) return null;

  const moved = [...ordinary];
  const a = moved[index]!;
  const b = moved[swapWith]!;
  moved[index] = b;
  moved[swapWith] = a;

  return pipelineOrdering(
    moved.map((stage) => stage.id),
    stages.filter((stage) => stage.kind !== "active"),
  );
}

/**
 * The ordering after appending a new ordinary stage, which goes last among
 * the columns and therefore immediately before Won.
 */
export function orderingWithNewStage(
  stages: readonly {
    readonly id: string;
    readonly kind: LeadStageKind;
    readonly sortOrder: number;
  }[],
  newStageId: string,
): readonly { readonly id: string; readonly sortOrder: number }[] {
  const ordinary = [...stages]
    .filter((stage) => stage.kind === "active")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((stage) => stage.id);

  return pipelineOrdering(
    [...ordinary, newStageId],
    stages.filter((stage) => stage.kind !== "active"),
  );
}
