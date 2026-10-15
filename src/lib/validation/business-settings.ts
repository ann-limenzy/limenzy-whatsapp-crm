import { z } from "zod";

import {
  COUNTRY_CODES,
  CURRENCY_CODES,
  isSupportedTimeZone,
} from "./workspace-setup";

/**
 * Business Settings — spec §158.
 *
 * The eight fields an Owner/Admin may manage. Five already exist on the
 * workspace and are collected at onboarding; three — phone, email and address
 * — are new and are collected nowhere else.
 *
 * ## Required and optional
 *
 * §158 lists the fields without saying which are required, so this follows
 * what the product already enforces rather than inventing a rule:
 *
 *   * **Name, country, currency and time zone are required.** All four are
 *     `NOT NULL` with not-blank checks in the Phase-1 migration, and all four
 *     are collected at onboarding, so every workspace already has them.
 *   * **Business type, phone, email and address are optional.** None is
 *     collected anywhere today, so requiring one would make every existing
 *     workspace invalid the moment this screen appeared.
 *
 * ## Clearing a value
 *
 * An optional field submitted empty, or as whitespace, becomes `null` — never
 * an empty string. That is the convention `business_type` already follows, and
 * a check constraint enforces it, so a column never holds two different
 * spellings of "not provided". A required field submitted empty is an error,
 * not a clear.
 *
 * The country, currency and time-zone lists are reused from
 * `./workspace-setup`; duplicating them would create a second place for them
 * to drift from the database's own time-zone trigger.
 */

const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/u;

const noControlCharacters = <T extends z.ZodType<string>>(
  schema: T,
  field: string,
) =>
  schema.refine((value) => !CONTROL_CHARACTERS.test(value), {
    message: `Remove the special characters from the ${field}`,
  });

/** Multi-line is legitimate for an address, so newlines survive. */
const noControlCharactersAllowingNewlines = <T extends z.ZodType<string>>(
  schema: T,
  field: string,
) =>
  schema.refine(
    (value) => !CONTROL_CHARACTERS.test(value.replace(/[\n\r]/g, "")),
    { message: `Remove the special characters from the ${field}` },
  );

const COUNTRY_SET: ReadonlySet<string> = new Set(COUNTRY_CODES);
const CURRENCY_SET: ReadonlySet<string> = new Set(CURRENCY_CODES);

/**
 * An optional field: empty, whitespace or absent all mean "cleared".
 *
 * The blank check runs BEFORE the field's own rules, not inside them. The
 * alternative — letting each rule carry its own "…or empty" escape clause —
 * works until someone adds a field and writes the rule without one, and then a
 * blank submission is a validation error instead of a clear.
 */
const optionalText = <T extends z.ZodType<string, string>>(schema: T) =>
  z
    .string({ message: "That value is not valid" })
    .nullish()
    .transform((value) => {
      const trimmed = (value ?? "").trim();
      return trimmed === "" ? null : trimmed;
    })
    .pipe(schema.nullable());

export type BusinessSettingsField =
  | "name"
  | "businessType"
  | "businessPhone"
  | "businessEmail"
  | "address"
  | "country"
  | "currency"
  | "timeZone"
  | "form";

export type BusinessSettingsIssue = {
  readonly field: BusinessSettingsField;
  readonly message: string;
};

export const businessSettingsSchema = z.strictObject({
  name: noControlCharacters(
    z
      .string({ message: "Enter your business name" })
      .trim()
      .min(2, "Enter your business name")
      .max(160, "That business name is too long"),
    "business name",
  ),

  businessType: optionalText(
    noControlCharacters(
      z
        .string({ message: "That business type is not valid" })
        .trim()
        .max(120, "That business type is too long"),
      "business type",
    ),
  ),

  /**
   * Free text, not a parsed number. §158 names no format, businesses legitimately
   * record extensions, country codes and second lines, and a stricter rule would
   * reject valid entries for no gain — this is a contact detail nobody dials
   * programmatically yet.
   */
  businessPhone: optionalText(
    noControlCharacters(
      z
        .string({ message: "That phone number is not valid" })
        .trim()
        .max(40, "That phone number is too long"),
      "phone number",
    ),
  ),

  /**
   * A contact address for the business, not an identity: it never
   * authenticates anyone and is unrelated to the account's sign-in email.
   */
  businessEmail: optionalText(
    noControlCharacters(
      z
        .string({ message: "That email address is not valid" })
        .max(254, "That email address is too long")
        // Not lower-cased, unlike the sign-in address. That one is an identity,
        // where two spellings must be one account; this is a contact detail,
        // and the capitals someone typed are theirs to keep.
        .email("Enter a valid email address"),
      "email address",
    ),
  ),

  address: optionalText(
    noControlCharactersAllowingNewlines(
      z
        .string({ message: "That address is not valid" })
        /*
         * Line endings are normalised before anything else looks at them.
         *
         * A browser submits a textarea with CRLF, per the HTML form-payload
         * rules, while anything else — an import, an API client, a test —
         * sends LF. Without this the same visible address would be stored two
         * different ways depending on what sent it, and every later reader
         * (an export, a message template, a PDF) would carry the stray
         * carriage returns. It is the same "one representation per value"
         * rule that makes a cleared field NULL rather than an empty string.
         *
         * Normalising first also makes the length limit mean one thing: a
         * line break counts as one character however it arrived.
         */
        .transform((value) => value.replace(/\r\n?/g, "\n"))
        .pipe(z.string().max(500, "That address is too long")),
      "address",
    ),
  ),

  country: z
    .string({ message: "Select a country" })
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => COUNTRY_SET.has(value), {
      message: "Select a country from the list",
    }),

  currency: z
    .string({ message: "Select a currency" })
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => CURRENCY_SET.has(value), {
      message: "Select a currency from the list",
    }),

  timeZone: z
    .string({ message: "Select a time zone" })
    .trim()
    .max(100, "That time zone is too long")
    .refine(isSupportedTimeZone, {
      message: "Select a time zone from the list",
    }),
});

export type BusinessSettingsInput = z.output<typeof businessSettingsSchema>;

export type BusinessSettingsResult =
  | { readonly ok: true; readonly value: BusinessSettingsInput }
  | { readonly ok: false; readonly issues: readonly BusinessSettingsIssue[] };

const FIELDS: ReadonlySet<string> = new Set<BusinessSettingsField>([
  "name",
  "businessType",
  "businessPhone",
  "businessEmail",
  "address",
  "country",
  "currency",
  "timeZone",
]);

/**
 * Parse a submission into normalised values, or into field-addressed errors.
 *
 * An issue whose path is not one of the known fields — which `strictObject`
 * produces for an unexpected key — is reported against `form` rather than
 * silently dropped, so a payload carrying something it should not is visible
 * instead of being ignored.
 */
export function parseBusinessSettings(input: unknown): BusinessSettingsResult {
  const parsed = businessSettingsSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };

  const issues = parsed.error.issues.map((issue) => {
    const key = issue.path[0];
    const field: BusinessSettingsField =
      typeof key === "string" && FIELDS.has(key)
        ? (key as BusinessSettingsField)
        : "form";
    return { field, message: issue.message };
  });

  return { ok: false, issues };
}
