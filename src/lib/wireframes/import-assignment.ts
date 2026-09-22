/**
 * Lead assignment choice for the Bulk Import wireframe (screen A3).
 *
 * Data and presentation state only. Nothing here assigns a Lead, advances a
 * rotation position or reaches a database — it DESCRIBES the four choices an
 * administrator has, so the screen and its summary panel read one model.
 *
 * A fifth choice, "use the CRM assignment rules", is deliberately ABSENT:
 * the automatic routing condition is not confirmed with A&S Fincare yet
 * (§163.18 decision 1), so the demo does not offer a behaviour nobody has
 * agreed. `parse` below treats its stored value as invalid, so a browser left
 * over from an earlier session comes back with nothing selected.
 *
 * Teams and people are read from `sales-teams.ts` rather than typed again, so
 * the import screen can never show a roster the Sales Team wireframes
 * contradict during the same presentation.
 */

import {
  SALES_TEAMS,
  activeMemberships,
  activeTeamOf,
  rotationPool,
  userById,
  type SalesTeam,
} from "@/lib/wireframes/sales-teams";
import { COLUMN_MAPPINGS } from "@/lib/wireframes/mock-data";

/* ---------------------------------------------------------------- methods */

export type AssignmentMethod = "team" | "person" | "spreadsheet" | "review";

/** Every method the screen offers, and the only values `parse` accepts. */
export const ASSIGNMENT_METHODS: readonly AssignmentMethod[] = [
  "team",
  "person",
  "spreadsheet",
  "review",
];

export function isAssignmentMethod(value: unknown): value is AssignmentMethod {
  return (ASSIGNMENT_METHODS as readonly unknown[]).includes(value);
}

export type AssignmentChoice = {
  /**
   * `null` until the admin chooses. Nothing is preselected: with the rules
   * option withheld there is no method that is right by default, and a
   * silent default would be a decision the screen made on someone's behalf.
   */
  readonly method: AssignmentMethod | null;
  /** Team id, when `method` is `team`. Empty until one is chosen. */
  readonly teamId: string;
  /** SETTINGS_USERS id, when `method` is `person`. Empty until chosen. */
  readonly userId: string;
};

export const DEFAULT_CHOICE: AssignmentChoice = {
  method: null,
  teamId: "",
  userId: "",
};

/* ------------------------------------------------------------------- data */

export type TeamOption = {
  readonly id: string;
  readonly name: string;
  /** Names in this team's rotation order, eligible ones only. */
  readonly eligible: readonly string[];
};

/**
 * The teams offered, each with the members round robin could actually reach.
 *
 * `rotationPool` is the same helper the Sales Team screens use, so a member
 * paused there is absent here without anyone restating the rule.
 */
export const TEAM_OPTIONS: readonly TeamOption[] = SALES_TEAMS.filter(
  (t) => t.status === "Active",
).map((team: SalesTeam) => ({
  id: team.id,
  name: team.name,
  eligible: rotationPool(team).map((id) => userById(id).name),
}));

export type PersonOption = {
  readonly id: string;
  readonly name: string;
  /** The one team this person belongs to, or null. */
  readonly teamName: string | null;
};

/**
 * Everyone who can be named as a Record Owner by hand.
 *
 * Active members of an active team — the people a demo audience has already
 * seen on the Sales Team screens. A manual choice is not a rotation, so a
 * paused member is still offered: pausing withholds someone from automatic
 * assignment, not from an administrator naming them (§163.5).
 */
export const PERSON_OPTIONS: readonly PersonOption[] = SALES_TEAMS.filter(
  (t) => t.status === "Active",
).flatMap((team) =>
  activeMemberships(team)
    .filter((m) => userById(m.userId).status === "Active")
    .map((m) => ({
      id: m.userId,
      name: userById(m.userId).name,
      teamName: activeTeamOf(m.userId)?.name ?? null,
    })),
);

/* --------------------------------------------------- mapped column lookup */

/** CRM fields that decide who owns an imported Lead. */
const ASSIGNMENT_FIELDS = ["Record Owner", "Sales Team"] as const;

/**
 * The spreadsheet column currently mapped to an assignment field, if any.
 *
 * Derived from the mapping mock rather than asserted, so option 4 tells the
 * truth about whatever the Map columns screen is showing.
 */
export const MAPPED_ASSIGNMENT_COLUMN: string | null =
  COLUMN_MAPPINGS.find((m) =>
    (ASSIGNMENT_FIELDS as readonly string[]).includes(m.crmField),
  )?.uploadedColumn ?? null;

/** The CRM field that column is mapped to, for naming it precisely. */
export const MAPPED_ASSIGNMENT_FIELD: string | null =
  COLUMN_MAPPINGS.find((m) =>
    (ASSIGNMENT_FIELDS as readonly string[]).includes(m.crmField),
  )?.crmField ?? null;

/* ------------------------------------------------------------- validation */

export function teamOption(id: string): TeamOption | undefined {
  return TEAM_OPTIONS.find((t) => t.id === id);
}

export function personOption(id: string): PersonOption | undefined {
  return PERSON_OPTIONS.find((p) => p.id === id);
}

/**
 * Whether the choice is complete enough to continue.
 *
 * A team with nobody eligible is a COMPLETE choice, not an invalid one: the
 * screen warns that those Leads land in Assignment Required, and the admin may
 * still mean it.
 */
export function isChoiceComplete(choice: AssignmentChoice): boolean {
  switch (choice.method) {
    case null:
      return false;
    case "team":
      return teamOption(choice.teamId) !== undefined;
    case "person":
      return personOption(choice.userId) !== undefined;
    case "spreadsheet":
      return MAPPED_ASSIGNMENT_COLUMN !== null;
    case "review":
      return true;
  }
}

/** One sentence describing what the current choice will do. */
export function choiceSummary(choice: AssignmentChoice): string {
  switch (choice.method) {
    case null:
      return "Choose an assignment method to continue.";
    case "team": {
      const team = teamOption(choice.teamId);
      if (!team) return "Choose a Sales Team to continue.";
      if (team.eligible.length === 0) {
        return `${team.name} has no eligible members, so every imported Lead will enter Assignment Required rather than receiving a Record Owner.`;
      }
      return `Imported Leads will rotate between ${formatNames(team.eligible)} using ${team.name}'s round-robin rule. The team is not the Record Owner — round robin selects one of these people for each Lead.`;
    }
    case "person": {
      const person = personOption(choice.userId);
      if (!person) return "Choose a salesperson to continue.";
      return `Every imported Lead will receive ${person.name} as Record Owner. This manual assignment does not move any team's round-robin position.`;
    }
    case "spreadsheet":
      return MAPPED_ASSIGNMENT_COLUMN
        ? `Each row's own "${MAPPED_ASSIGNMENT_COLUMN}" value decides its Record Owner. Values that are invalid, inactive or unknown are reported during validation, never guessed.`
        : "No Team or Record Owner column is mapped, so there is nothing to read an assignment from.";
    case "review":
      return "Every imported Lead enters Assignment Required. Nothing appears in an individual salesperson's work queue until someone assigns it.";
  }
}

/** "A and B", "A, B and C" — never a trailing comma before "and". */
export function formatNames(names: readonly string[]): string {
  if (names.length === 0) return "nobody";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]!}`;
}

/* ------------------------------------------------------------------ store */

/**
 * The choice survives a move to Validation and back.
 *
 * sessionStorage and a module store, exactly as `presentation-mode.tsx` does
 * it: the server snapshot is the default, so `useSyncExternalStore` reconciles
 * at hydration without a state write in an effect and without a flash. It is
 * presentation state for one demo, so it is deliberately not durable.
 */
const STORAGE_KEY = "limenzy-crm:wireframe-import-assignment:v1";

const listeners = new Set<() => void>();

/**
 * Cached so the snapshot is referentially stable. `useSyncExternalStore` calls
 * this on every render and compares by identity, so parsing afresh each time
 * would loop forever.
 */
let cachedRaw: string | null = null;
let cached: AssignmentChoice = DEFAULT_CHOICE;

function parse(raw: string | null): AssignmentChoice {
  if (!raw) return DEFAULT_CHOICE;
  try {
    const value = JSON.parse(raw) as Partial<AssignmentChoice>;
    const method = value.method;
    // Anything that is not one of the four current methods — `null`, a typo,
    // or the withdrawn "rules" value from an earlier session — comes back
    // unselected rather than selected-but-invisible.
    if (!isAssignmentMethod(method)) return DEFAULT_CHOICE;
    return {
      method,
      teamId: typeof value.teamId === "string" ? value.teamId : "",
      userId: typeof value.userId === "string" ? value.userId : "",
    };
  } catch {
    return DEFAULT_CHOICE;
  }
}

export function subscribeToAssignmentChoice(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function getAssignmentChoice(): AssignmentChoice {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Blocked storage — the default is correct and the screen still works.
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

/** The server cannot know the choice, and must not guess. */
export function getAssignmentServerChoice(): AssignmentChoice {
  return DEFAULT_CHOICE;
}

export function setAssignmentChoice(choice: AssignmentChoice): void {
  cachedRaw = JSON.stringify(choice);
  cached = choice;
  try {
    sessionStorage.setItem(STORAGE_KEY, cachedRaw);
  } catch {
    // Non-fatal: the choice simply will not survive a move to Validation.
  }
  for (const listener of listeners) listener();
}
