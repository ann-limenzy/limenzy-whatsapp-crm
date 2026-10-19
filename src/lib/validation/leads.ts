/**
 * Lead field validation and §130.1 normalisation.
 *
 * Pure: no database, no request, no environment. The server calls it, the
 * form calls it for the same answers, and the parser is the only place that
 * decides what a submitted Lead means.
 *
 * ## Two values per contact field, and why
 *
 * §130.1 is explicit that the entered value and the comparison value are
 * different things: "The user-entered phone number is preserved for display
 * and audit. A separate normalized comparison value is derived from it." It
 * also says "A stored contact value must never change silently because the
 * normalization logic changed later" — so the display value is whatever was
 * typed, trimmed, and nothing else.
 */

export const MAX_LEAD_NAME = 120;
export const MAX_LEAD_PHONE = 40;
export const MAX_LEAD_EMAIL = 254;
export const MAX_LEAD_NOTES = 4000;

/**
 * How long one activity note may be — §39.
 *
 * A note is a timeline entry, not a document. 2000 characters is roughly
 * four screens on a phone, which is past the point where the next note is
 * the better answer. The Lead's own `notes` field stays at 4000 for standing
 * information about the person, which is a different thing from a dated
 * remark about one conversation.
 */
export const MAX_ACTIVITY_NOTE = 2000;

/** §48's optional explanation, which §33 attaches to "Other". */
export const MAX_LOST_REASON_NOTE = 500;

/** §48, with §33's list. Fixed, not workspace-configurable. */
export const LEAD_LOST_REASONS = [
  "not_interested",
  "price",
  "chose_competitor",
  "unable_to_contact",
  "other",
] as const;

export type LeadLostReason = (typeof LEAD_LOST_REASONS)[number];

export function isLeadLostReason(value: unknown): value is LeadLostReason {
  return (
    typeof value === "string" &&
    (LEAD_LOST_REASONS as readonly string[]).includes(value)
  );
}

/** What each reason is called on screen. */
export const LEAD_LOST_REASON_LABELS: Record<LeadLostReason, string> = {
  not_interested: "Not interested",
  price: "Price or cost",
  chose_competitor: "Chose someone else",
  unable_to_contact: "Could not reach them",
  other: "Something else",
};

export type LeadField = "name" | "phone" | "email" | "notes" | "stageId";

export type LeadIssue =
  | "name_required"
  | "name_too_long"
  | "name_has_control_characters"
  | "contact_required"
  | "phone_too_long"
  | "phone_not_a_number"
  | "email_too_long"
  | "email_malformed"
  | "notes_too_long"
  | "stage_required";

export type LeadProblem = {
  readonly field: LeadField;
  readonly issue: LeadIssue;
};

/** What a valid submission becomes. Exactly the columns the gateway writes. */
export type ParsedLead = {
  readonly name: string;
  readonly phone: string | null;
  readonly phoneNormalised: string | null;
  readonly phoneNeedsReview: boolean;
  readonly email: string | null;
  readonly emailNormalised: string | null;
  readonly notes: string | null;
  readonly stageId: string;
  readonly sourceId: string | null;
};

export type LeadParseResult =
  | { readonly ok: true; readonly value: ParsedLead }
  | { readonly ok: false; readonly problems: readonly LeadProblem[] };

/** Collapse inner runs of whitespace and trim, as the other parsers do. */
export function normaliseName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * §130.1 email normalisation: trim, lowercase, validate basic structure.
 *
 * Provider-specific transformations are NOT applied. Dots are kept and a
 * `+tag` is not stripped, because those are provider conventions and treating
 * them as equivalent would merge distinct addresses.
 */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function emailIsWellFormed(value: string): boolean {
  return EMAIL.test(value);
}

/**
 * §130.1 phone normalisation, kept deliberately narrow.
 *
 * "Normalization targets E.164 where the country context and the number
 * allow it to be done reliably. The system must not invent a country code
 * when it cannot be determined safely."
 *
 * This application carries no dial-code table and no phone library, so the
 * only case where E.164 can be derived reliably is a number that is already
 * international: a leading `+`, then digits, ignoring the harmless display
 * formatting §130.1 names — spaces, hyphens and parentheses.
 *
 * Anything else — a national-format number, an extension, a number with
 * letters — returns `null`, and the caller marks the Lead for review rather
 * than guessing a country. The consequence is honest and worth stating: such
 * a Lead takes part in duplicate detection by email only.
 */
export function normalisePhone(value: string): string | null {
  const compact = value.replace(/[\s\-()]/g, "");
  if (!/^\+[0-9]+$/.test(compact)) return null;
  const digits = compact.slice(1);
  if (digits.length < 7 || digits.length > 15) return null;
  if (digits.startsWith("0")) return null; // no valid country code starts at 0
  return `+${digits}`;
}

/** Whether a string could be a phone number at all, before normalising. */
function looksLikeAPhoneNumber(value: string): boolean {
  // At least five digits, and nothing beyond digits and the usual punctuation.
  if (!/^[+0-9\s\-()]+$/.test(value)) return false;
  return (value.match(/[0-9]/g) ?? []).length >= 5;
}

const text = (input: Record<string, unknown>, key: string): string =>
  typeof input[key] === "string" ? (input[key] as string) : "";

/**
 * Parse a submitted Lead.
 *
 * Every problem is collected rather than the first one thrown, so a person
 * fixing a form sees everything wrong with it at once.
 */
export function parseLead(input: {
  name: unknown;
  phone: unknown;
  email: unknown;
  notes: unknown;
  stageId: unknown;
  sourceId: unknown;
}): LeadParseResult {
  const raw = input as Record<string, unknown>;
  const problems: LeadProblem[] = [];

  const name = normaliseName(text(raw, "name"));
  if (name.length === 0)
    problems.push({ field: "name", issue: "name_required" });
  else if (name.length > MAX_LEAD_NAME)
    problems.push({ field: "name", issue: "name_too_long" });
  else if (CONTROL_CHARACTERS.test(name))
    problems.push({ field: "name", issue: "name_has_control_characters" });

  const phoneRaw = text(raw, "phone").trim();
  const emailRaw = text(raw, "email").trim();

  let phone: string | null = null;
  let phoneNormalised: string | null = null;
  let phoneNeedsReview = false;
  if (phoneRaw.length > 0) {
    if (phoneRaw.length > MAX_LEAD_PHONE)
      problems.push({ field: "phone", issue: "phone_too_long" });
    else if (!looksLikeAPhoneNumber(phoneRaw))
      problems.push({ field: "phone", issue: "phone_not_a_number" });
    else {
      phone = phoneRaw;
      phoneNormalised = normalisePhone(phoneRaw);
      phoneNeedsReview = phoneNormalised === null;
    }
  }

  let email: string | null = null;
  let emailNormalised: string | null = null;
  if (emailRaw.length > 0) {
    if (emailRaw.length > MAX_LEAD_EMAIL)
      problems.push({ field: "email", issue: "email_too_long" });
    else {
      const candidate = normaliseEmail(emailRaw);
      if (!emailIsWellFormed(candidate))
        problems.push({ field: "email", issue: "email_malformed" });
      else {
        email = emailRaw;
        emailNormalised = candidate;
      }
    }
  }

  /*
   * §32: "At least one contact method — Phone Number or Email — must be
   * provided." Reported against `phone` so the message has somewhere to sit,
   * and only when neither field produced a usable value — a malformed email
   * has already said what is wrong with it.
   */
  if (
    phone === null &&
    email === null &&
    !problems.some((p) => p.field === "phone" || p.field === "email")
  ) {
    problems.push({ field: "phone", issue: "contact_required" });
  }

  const notesRaw = text(raw, "notes").trim();
  if (notesRaw.length > MAX_LEAD_NOTES)
    problems.push({ field: "notes", issue: "notes_too_long" });
  const notes = notesRaw.length > 0 ? notesRaw : null;

  const stageId = text(raw, "stageId").trim();
  if (stageId.length === 0)
    problems.push({ field: "stageId", issue: "stage_required" });

  const sourceIdRaw = text(raw, "sourceId").trim();
  const sourceId = sourceIdRaw.length > 0 ? sourceIdRaw : null;

  if (problems.length > 0)
    return { ok: false, problems: Object.freeze(problems) };
  return {
    ok: true,
    value: {
      name,
      phone,
      phoneNormalised,
      phoneNeedsReview,
      email,
      emailNormalised,
      notes,
      stageId,
      sourceId,
    },
  };
}

/**
 * Which fields a candidate matched on — §130.1's "matching strength".
 *
 * V1 classifies an exact normalised phone match, an exact normalised email
 * match, or both. Weaker evidence (name with product context) is not
 * classified here: §130.1 says "A name alone must never block creation", and
 * there is no product context in this slice to combine it with.
 */
export type DuplicateMatchField = "phone" | "email";

export function matchedFields(
  candidate: {
    readonly phoneNormalised: string | null;
    readonly emailNormalised: string | null;
  },
  submitted: {
    readonly phoneNormalised: string | null;
    readonly emailNormalised: string | null;
  },
): readonly DuplicateMatchField[] {
  const fields: DuplicateMatchField[] = [];
  if (
    submitted.phoneNormalised !== null &&
    candidate.phoneNormalised === submitted.phoneNormalised
  ) {
    fields.push("phone");
  }
  if (
    submitted.emailNormalised !== null &&
    candidate.emailNormalised === submitted.emailNormalised
  ) {
    fields.push("email");
  }
  return Object.freeze(fields);
}

/**
 * A stable fingerprint of exactly what would be written.
 *
 * Used to bind a duplicate-warning acknowledgement to one submission: if any
 * of these values changes, the fingerprint changes and the warning has to be
 * shown again. Field order is fixed here rather than taken from object key
 * order, so the same submission always fingerprints the same way.
 */
export function fingerprintLead(lead: ParsedLead): string {
  return JSON.stringify([
    lead.name,
    lead.phone,
    lead.phoneNormalised,
    lead.phoneNeedsReview,
    lead.email,
    lead.emailNormalised,
    lead.notes,
    lead.stageId,
    lead.sourceId,
  ]);
}

/** The §31 search term, reduced to what the query will use. */
export function normaliseSearch(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 100);
}

/** One activity note — §39. */
export type NoteParseResult =
  | { readonly ok: true; readonly note: string }
  | { readonly ok: false; readonly issue: "note_required" | "note_too_long" };

export function parseActivityNote(value: unknown): NoteParseResult {
  const note = typeof value === "string" ? value.trim() : "";
  if (note.length === 0) return { ok: false, issue: "note_required" };
  if (note.length > MAX_ACTIVITY_NOTE) {
    return { ok: false, issue: "note_too_long" };
  }
  return { ok: true, note };
}

/** §48: a reason, and the short note §33 attaches to "Other". */
export type LostParseResult =
  | {
      readonly ok: true;
      readonly reason: LeadLostReason;
      readonly note: string | null;
    }
  | {
      readonly ok: false;
      readonly issue:
        "reason_required" | "explanation_required" | "explanation_too_long";
    };

export function parseLostOutcome(input: {
  reason: unknown;
  note: unknown;
}): LostParseResult {
  if (!isLeadLostReason(input.reason)) {
    return { ok: false, issue: "reason_required" };
  }
  const note = typeof input.note === "string" ? input.note.trim() : "";
  /* §33: "If Other is selected, allow a short note." Allow, and require —
     "something else" with no explanation records nothing worth keeping. */
  if (input.reason === "other" && note.length === 0) {
    return { ok: false, issue: "explanation_required" };
  }
  if (note.length > MAX_LOST_REASON_NOTE) {
    return { ok: false, issue: "explanation_too_long" };
  }
  return {
    ok: true,
    reason: input.reason,
    note: note.length > 0 ? note : null,
  };
}

/**
 * Which of a Lead's fields an edit actually changes.
 *
 * Names only — never the old values. The activity feed is visible to
 * everyone who can see the Lead, and a previous phone number is contact
 * data rather than history anyone needs on screen.
 */
export const EDITABLE_LEAD_FIELDS = [
  "name",
  "phone",
  "email",
  "notes",
  "source",
] as const;

export type EditableLeadField = (typeof EDITABLE_LEAD_FIELDS)[number];

export function changedLeadFields(
  before: {
    readonly name: string;
    readonly phone: string | null;
    readonly email: string | null;
    readonly notes: string | null;
    readonly sourceId: string | null;
  },
  after: ParsedLead,
): readonly EditableLeadField[] {
  const changed: EditableLeadField[] = [];
  if (before.name !== after.name) changed.push("name");
  if (before.phone !== after.phone) changed.push("phone");
  if (before.email !== after.email) changed.push("email");
  if (before.notes !== after.notes) changed.push("notes");
  if (before.sourceId !== after.sourceId) changed.push("source");
  return Object.freeze(changed);
}
