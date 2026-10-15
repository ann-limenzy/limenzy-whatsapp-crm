"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import {
  saveBusinessSettingsAction,
  type BusinessSettingsState,
} from "@/app/actions/business-settings";
import {
  CURRENCY_OPTIONS,
  TIME_ZONE_GROUPS,
  type CountryOption,
} from "@/lib/workspace-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  parseBusinessSettings,
  type BusinessSettingsField,
  type BusinessSettingsInput,
} from "@/lib/validation/business-settings";

/**
 * Settings → Business Settings — spec §158.
 *
 * The eight fields an Owner/Admin may manage, saved as one submission. §158
 * presents them as a single form, and a partial write would let two concurrent
 * saves interleave into a state neither person submitted, so there is one
 * Save for the whole section rather than one per field.
 *
 * The inline validation here uses the same parser the Server Action runs, so
 * the two can never disagree about what is acceptable. It is a convenience
 * only — it never decides whether the submission proceeds, and the server
 * re-parses everything regardless.
 *
 * Country, currency and time-zone options are reused from the onboarding
 * screen rather than duplicated. They are presentation data: the server
 * validates the submitted code against its own frozen list, so an option
 * missing here is a usability bug, never an authorisation one.
 */

const INITIAL: BusinessSettingsState = { status: "idle", attempt: 0 };

/** Fields with an input of their own; `form` has no field to sit beside. */
type FieldName = Exclude<BusinessSettingsField, "form">;

const BUSINESS_TYPES = [
  "Financial / Insurance",
  "Automotive",
  "Service Business",
  "Agency",
  "Education",
  "Healthcare/Wellness",
  "Retail",
  "Other",
] as const;

const controlClassName = cn(
  "w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  "md:text-sm dark:bg-input/30",
);

const selectClassName = cn(controlClassName, "h-9 truncate");

/** Label, optional help, inline error, and the wiring between them. */
function FieldShell({
  id,
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (ids: {
    describedBy?: string;
    invalid: boolean;
  }) => React.ReactNode;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    /*
     * `content-start` keeps the rows packed at the top. Two fields side by
     * side are stretched to the taller of the pair, and without this the extra
     * height is shared out between label, control and hint — so the two inputs
     * sit a few pixels apart whenever one hint wraps and the other does not.
     */
    <div className={cn("grid min-w-0 content-start gap-2", className)}>
      <Label htmlFor={id} className="flex-wrap">
        <span>{label}</span>
        <span className="text-xs font-normal text-muted-foreground">
          {optional ? "(optional)" : "(required)"}
        </span>
      </Label>
      {children({ describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-sm text-danger-on-subtle"
        >
          <TriangleAlert
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span className="min-w-0">{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Submit button bound to the enclosing form's pending state.
 *
 * `useFormStatus` rather than the flag from `useActionState`, because this
 * reports the submission of *this* form specifically, and it keeps the saving
 * state local to the button that caused it.
 */
function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="w-full sm:w-auto sm:min-w-40"
    >
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

/** A stored value for display: NULL and "not provided" are the same thing. */
const shown = (value: string | null): string => value ?? "";

export function BusinessSettingsForm({
  settings,
  workspaceId,
  countries,
}: {
  /** The workspace's stored settings, read on the server. */
  settings: BusinessSettingsInput;
  /**
   * The workspace this form was rendered for, echoed back so the action can
   * detect a page that predates a workspace switch in another tab. It never
   * selects where the write goes — see the action for why that distinction is
   * the whole point.
   */
  workspaceId: string;
  countries: readonly CountryOption[];
}) {
  const [state, formAction] = useActionState(
    saveBusinessSettingsAction,
    INITIAL,
  );

  const baseId = useId();
  const fieldId = (name: string) => `${baseId}-${name}`;
  const summaryRef = useRef<HTMLDivElement>(null);
  const handledAttempt = useRef(0);

  const [name, setName] = useState(settings.name);
  const [businessType, setBusinessType] = useState(
    shown(settings.businessType),
  );
  const [businessPhone, setBusinessPhone] = useState(
    shown(settings.businessPhone),
  );
  const [businessEmail, setBusinessEmail] = useState(
    shown(settings.businessEmail),
  );
  const [address, setAddress] = useState(shown(settings.address));
  const [country, setCountry] = useState(settings.country);
  const [currency, setCurrency] = useState(settings.currency);
  const [timeZone, setTimeZone] = useState(settings.timeZone);

  const [clientErrors, setClientErrors] = useState<
    Partial<Record<FieldName, string>>
  >({});

  /**
   * Fields re-checked since the last answer from the server.
   *
   * Without this, correcting a field the server rejected leaves the server's
   * message sitting under an input that is now valid, until the next submit —
   * so the form says "fix this" about something already fixed. A field in here
   * shows the client's verdict instead, because it is the newer one.
   */
  const [revalidated, setRevalidated] = useState<ReadonlySet<FieldName>>(
    () => new Set(),
  );

  /**
   * The three pickers hold close to a thousand options between them. Built
   * inline they would be re-created on every keystroke in a text field, which
   * is measurable jank on a phone; memoised, React reuses the same elements.
   */
  const countryOptionElements = useMemo(
    () =>
      countries.map((option) => (
        <option key={option.code} value={option.code}>
          {option.name} ({option.code})
        </option>
      )),
    [countries],
  );

  const currencyOptionElements = useMemo(
    () =>
      CURRENCY_OPTIONS.map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      )),
    [],
  );

  const timeZoneOptionElements = useMemo(
    () =>
      TIME_ZONE_GROUPS.map((group) => (
        <optgroup key={group.region} label={group.region}>
          {group.zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </optgroup>
      )),
    [],
  );

  /*
   * Each completed attempt is handled exactly once.
   *
   * A successful save replaces the typed values with what the database
   * actually stored: the parser trims and upper-cases, so leaving the raw
   * input on screen would show something subtly different from the truth and
   * make the next save look like a change when it is not. A failed attempt
   * moves focus to the summary instead, so the reason is announced rather than
   * left further up the page.
   *
   * The rule's "synchronise from an external system" case: the stored values
   * arrive from the server as the result of this submission, and there is no
   * render in which they could have been computed.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (state.attempt === handledAttempt.current) return;
    handledAttempt.current = state.attempt;

    // A new answer from the server supersedes every client verdict.
    setRevalidated(new Set());

    if (state.status === "saved" && state.settings) {
      const saved = state.settings;
      setName(saved.name);
      setBusinessType(shown(saved.businessType));
      setBusinessPhone(shown(saved.businessPhone));
      setBusinessEmail(shown(saved.businessEmail));
      setAddress(shown(saved.address));
      setCountry(saved.country);
      setCurrency(saved.currency);
      setTimeZone(saved.timeZone);
      setClientErrors({});
      return;
    }

    summaryRef.current?.focus();
  }, [state]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /** Inline feedback from the same parser the server uses. */
  const validateField = (field: FieldName) => {
    const parsed = parseBusinessSettings({
      name,
      businessType,
      businessPhone,
      businessEmail,
      address,
      country,
      currency,
      timeZone,
    });
    setClientErrors((previous) => {
      const next = { ...previous };
      delete next[field];
      if (!parsed.ok) {
        const issue = parsed.issues.find(
          (candidate) => candidate.field === field,
        );
        if (issue) next[field] = issue.message;
      }
      return next;
    });
    setRevalidated((previous) => new Set(previous).add(field));
  };

  /**
   * The newer verdict wins. That is the server's until the field is re-checked
   * on the client, and the client's from then until the next submission.
   */
  const errorFor = (field: FieldName) =>
    revalidated.has(field)
      ? clientErrors[field]
      : (state.fieldErrors?.[field] ?? clientErrors[field]);

  const failed = state.status !== "idle" && state.status !== "saved";

  return (
    <form
      action={formAction}
      noValidate
      className="grid min-w-0 gap-5 sm:gap-6"
    >
      {/* Detection, never selection: the action compares this against the
          workspace it resolved for the request and refuses on a mismatch. */}
      <input type="hidden" name="renderedWorkspaceId" value={workspaceId} />

      {state.status === "saved" ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-2.5 rounded-lg border border-success/30 bg-success-subtle px-3 py-2.5 text-sm text-success-on-subtle"
        >
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">Business settings saved.</span>
        </div>
      ) : null}

      {failed ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-on-subtle outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="min-w-0">
            {state.status === "invalid"
              ? "Some details need fixing before this can be saved. Nothing was changed."
              : state.status === "forbidden"
                ? "Only an Owner/Admin can change business settings. Nothing was changed."
                : state.status === "stale"
                  ? "You switched workspace in another tab, so this form is out of date. Reload the page before saving. Nothing was changed."
                  : "These settings could not be saved. Nothing was changed."}
          </span>
        </div>
      ) : null}

      {state.fieldErrors?.form ? (
        <p role="alert" className="text-sm text-danger-on-subtle">
          {state.fieldErrors.form}
        </p>
      ) : null}

      <FieldShell
        id={fieldId("name")}
        label="Business name"
        hint="Shown across the CRM and to everyone you invite."
        error={errorFor("name")}
      >
        {({ describedBy, invalid }) => (
          <Input
            id={fieldId("name")}
            name="name"
            autoComplete="organization"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => validateField("name")}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
        )}
      </FieldShell>

      <FieldShell
        id={fieldId("businessType")}
        label="Business type"
        optional
        hint="Your industry. It never limits what the CRM can do, and you can type anything."
        error={errorFor("businessType")}
      >
        {({ describedBy, invalid }) => (
          <>
            <Input
              id={fieldId("businessType")}
              name="businessType"
              list={`${baseId}-business-types`}
              autoComplete="off"
              value={businessType}
              onChange={(event) => setBusinessType(event.target.value)}
              onBlur={() => validateField("businessType")}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
            <datalist id={`${baseId}-business-types`}>
              {BUSINESS_TYPES.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </>
        )}
      </FieldShell>

      <div className="grid min-w-0 gap-5 sm:gap-6 lg:grid-cols-2">
        <FieldShell
          id={fieldId("businessPhone")}
          label="Business phone"
          optional
          hint="A contact number for your business. Any format is accepted."
          error={errorFor("businessPhone")}
        >
          {({ describedBy, invalid }) => (
            <Input
              id={fieldId("businessPhone")}
              name="businessPhone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={businessPhone}
              onChange={(event) => setBusinessPhone(event.target.value)}
              onBlur={() => validateField("businessPhone")}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
          )}
        </FieldShell>

        <FieldShell
          id={fieldId("businessEmail")}
          label="Business email"
          optional
          hint="A contact address for your business. It is not a sign-in address and changing it does not affect anyone's account."
          error={errorFor("businessEmail")}
        >
          {({ describedBy, invalid }) => (
            <Input
              id={fieldId("businessEmail")}
              name="businessEmail"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={businessEmail}
              onChange={(event) => setBusinessEmail(event.target.value)}
              onBlur={() => validateField("businessEmail")}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            />
          )}
        </FieldShell>
      </div>

      <FieldShell
        id={fieldId("address")}
        label="Address"
        optional
        hint="Your business address. More than one line is fine."
        error={errorFor("address")}
      >
        {({ describedBy, invalid }) => (
          <textarea
            id={fieldId("address")}
            name="address"
            rows={3}
            autoComplete="street-address"
            className={cn(controlClassName, "field-sizing-content py-2")}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onBlur={() => validateField("address")}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
        )}
      </FieldShell>

      <div className="grid min-w-0 gap-5 sm:gap-6 lg:grid-cols-2">
        <FieldShell
          id={fieldId("country")}
          label="Country"
          error={errorFor("country")}
        >
          {({ describedBy, invalid }) => (
            <select
              id={fieldId("country")}
              name="country"
              className={selectClassName}
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              onBlur={() => validateField("country")}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            >
              <option value="">Select a country</option>
              {countryOptionElements}
            </select>
          )}
        </FieldShell>

        <FieldShell
          id={fieldId("currency")}
          label="Currency"
          hint="Used wherever the CRM shows an amount."
          error={errorFor("currency")}
        >
          {({ describedBy, invalid }) => (
            <select
              id={fieldId("currency")}
              name="currency"
              className={selectClassName}
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              onBlur={() => validateField("currency")}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            >
              <option value="">Select a currency</option>
              {currencyOptionElements}
            </select>
          )}
        </FieldShell>

        <FieldShell
          id={fieldId("timeZone")}
          label="Time zone"
          className="lg:col-span-2"
          hint="Used for follow-up times and reminders."
          error={errorFor("timeZone")}
        >
          {({ describedBy, invalid }) => (
            <select
              id={fieldId("timeZone")}
              name="timeZone"
              className={selectClassName}
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              onBlur={() => validateField("timeZone")}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
            >
              <option value="">Select a time zone</option>
              {timeZoneOptionElements}
            </select>
          )}
        </FieldShell>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <SaveButton />
      </div>
    </form>
  );
}
