"use client";

import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import { createWorkspaceAction } from "@/app/(account)/setup/actions";
import {
  SETUP_INITIAL_STATE,
  TERMINAL_SETUP_STATUSES,
  type SetupFieldName,
} from "@/app/(account)/setup/setup-state";
import {
  CURRENCY_OPTIONS,
  TIME_ZONE_GROUPS,
  currencyForCountry,
  type CountryOption,
} from "@/lib/workspace-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SIGN_IN_PATH } from "@/lib/auth/redirect";
import { cn } from "@/lib/utils";
import {
  parseWorkspaceSetup,
  TIME_ZONES,
} from "@/lib/validation/workspace-setup";

/**
 * Onboarding Screen 1 (spec 7) - create the business workspace.
 *
 * Every default here is a suggestion the person can overwrite, and none of
 * them is ever authorisation: the server re-validates the submission with the
 * same shared parser and the database decides what may be created. Detection
 * is deliberately timid - a guess is used only when it lands exactly on a
 * value the validator already accepts, and never once a field has been
 * touched.
 */

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

const TIME_ZONE_SET = new Set(TIME_ZONES);

/** The browser's zone, but only when the validator already accepts it. */
function detectTimeZone(): string | null {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === "string" && TIME_ZONE_SET.has(zone) ? zone : null;
  } catch {
    return null;
  }
}

/** The locale's region, but only when it is an approved country code. */
function detectCountry(allowed: ReadonlySet<string>): string | null {
  try {
    const languages =
      typeof navigator === "undefined"
        ? []
        : [navigator.language, ...(navigator.languages ?? [])];
    for (const tag of languages) {
      if (!tag) continue;
      const region = new Intl.Locale(tag).region;
      if (region && allowed.has(region)) return region;
    }
  } catch {
    // An unsupported locale is simply not a signal.
  }
  return null;
}

/** Field wrapper: label, optional help, inline error, and the wiring between. */
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
    <div className={cn("grid min-w-0 gap-2", className)}>
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

const selectClassName = cn(
  "h-9 w-full min-w-0 truncate rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  "md:text-sm dark:bg-input/30",
);

/** Submit button bound to the enclosing form's pending state. */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="w-full sm:w-auto sm:min-w-52"
    >
      {pending ? "Creating your CRM area…" : "Create my CRM area"}
    </Button>
  );
}

export function SetupForm({
  defaultFullName,
  countries,
}: {
  /** Display name from signup metadata. Editable, and never identity. */
  defaultFullName: string;
  countries: readonly CountryOption[];
}) {
  const [state, formAction] = useActionState(
    createWorkspaceAction,
    SETUP_INITIAL_STATE,
  );

  const baseId = useId();
  const fieldId = (name: string) => `${baseId}-${name}`;
  const summaryRef = useRef<HTMLDivElement>(null);
  const handledAttempt = useRef(0);

  const [fullName, setFullName] = useState(defaultFullName);
  const [workspaceName, setWorkspaceName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("");
  const [timeZone, setTimeZone] = useState("");

  /**
   * What the form last *suggested* for the currency.
   *
   * The override rule is derived from this rather than from a flag set in the
   * change handler, and that matters: a change event is not proof of intent.
   * Browser autofill fires one, and so does any event that echoes the value
   * the form just set — either would latch "the person chose this" and stop
   * the currency following the country ever again. Comparing against the last
   * suggestion cannot be fooled that way: the currency is the person's only
   * when it differs from what was suggested.
   */
  const suggestedCurrency = useRef("");

  const [clientErrors, setClientErrors] = useState<
    Partial<Record<SetupFieldName, string>>
  >({});

  /**
   * The three pickers hold close to a thousand options between them. Built
   * inline they would be re-created on every keystroke in the name field,
   * which is measurable jank on a phone; memoised, React reuses the same
   * elements and skips them entirely.
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

  const terminal = TERMINAL_SETUP_STATUSES.includes(state.status);

  /*
   * Detect defaults once, on the client, after hydration. Every setter below
   * only fills an empty field, so nothing typed before hydration finished can
   * be overwritten.
   *
   * eslint-disable-next-line is not enough here, so the rule is scoped to this
   * effect. This is the "synchronise from an external system" case the rule's
   * own guidance allows: the visitor's time zone and locale exist only in the
   * browser, so there is no way to compute them during server rendering, and
   * doing it in a state initialiser instead would make the server HTML and the
   * first client render disagree — a hydration mismatch traded for one extra
   * render on mount, which is the worse bargain.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const zone = detectTimeZone();
    if (zone) setTimeZone((current) => current || zone);

    const allowed = new Set(countries.map((option) => option.code));
    const region = detectCountry(allowed);
    if (!region) return;

    setCountry((current) => current || region);

    const suggestion = currencyForCountry(region);
    if (suggestion) {
      // Recorded as a suggestion, so a later country change still updates it.
      suggestedCurrency.current = suggestion;
      setCurrency((current) => current || suggestion);
    }
  }, [countries]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Move focus to the summary once per failed attempt, so the reason is read
  // out rather than left further down the page.
  useEffect(() => {
    if (state.attempt === handledAttempt.current) return;
    handledAttempt.current = state.attempt;
    if (state.status === "invalid" || state.status === "error") {
      summaryRef.current?.focus();
    }
  }, [state.attempt, state.status]);

  const onCountryChange = (next: string) => {
    setCountry(next);

    // A currency that differs from the last suggestion is the person's own
    // choice; nothing below may touch it.
    const chosenByPerson =
      currency !== "" && currency !== suggestedCurrency.current;
    if (chosenByPerson) return;

    // Otherwise the currency is only ever a suggestion about the *current*
    // country. When the new country has no obvious one, clearing is the
    // honest outcome: leaving the previous country's guess in place would
    // quietly attribute it to a country it was never derived from.
    const suggestion = currencyForCountry(next) ?? "";
    suggestedCurrency.current = suggestion;
    setCurrency(suggestion);
  };

  /**
   * Inline feedback from the same parser the server uses. Convenience only:
   * it never decides whether the submission proceeds.
   */
  const validateField = (field: SetupFieldName) => {
    const parsed = parseWorkspaceSetup({
      fullName,
      workspaceName,
      businessType,
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
  };

  const errorFor = (field: SetupFieldName) =>
    state.fieldErrors?.[field] ?? clientErrors[field];

  if (terminal) {
    const success = state.status === "created";
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "grid min-w-0 gap-3 rounded-xl border p-4 sm:p-5",
          // Same tone treatment the authentication screens already use, so a
          // success here reads identically to a success there.
          success
            ? "border-success/30 bg-success-subtle text-success-on-subtle"
            : "border-border bg-muted/40 text-foreground",
        )}
      >
        <p className="flex items-start gap-2 text-base font-semibold">
          {success ? (
            <CircleCheck
              className="mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0">
            {success
              ? "Your CRM area is ready"
              : state.status === "already_onboarded"
                ? "Setup is already complete"
                : "No CRM access right now"}
          </span>
        </p>
        <p className={cn("text-sm", success ? "" : "text-muted-foreground")}>
          {state.message}
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      noValidate
      className="grid min-w-0 gap-5 sm:gap-6"
    >
      {state.status === "invalid" || state.status === "error" ? (
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
          <span className="min-w-0">{state.message}</span>
        </div>
      ) : null}

      {state.status === "unauthenticated" ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="grid gap-2 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-on-subtle outline-none"
        >
          <span>{state.message}</span>
          <Link
            href={SIGN_IN_PATH}
            className="w-fit font-medium underline underline-offset-4"
          >
            Go to sign in
          </Link>
        </div>
      ) : null}

      <FieldShell
        id={fieldId("fullName")}
        label="Your name"
        hint="Shown beside the work you do in the CRM."
        error={errorFor("fullName")}
      >
        {({ describedBy, invalid }) => (
          <Input
            id={fieldId("fullName")}
            name="fullName"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            onBlur={() => validateField("fullName")}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
        )}
      </FieldShell>

      <FieldShell
        id={fieldId("workspaceName")}
        label="Business name"
        hint="This creates your company's private CRM area. Everyone you invite works inside it."
        error={errorFor("workspaceName")}
      >
        {({ describedBy, invalid }) => (
          <Input
            id={fieldId("workspaceName")}
            name="workspaceName"
            autoComplete="organization"
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            onBlur={() => validateField("workspaceName")}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
          />
        )}
      </FieldShell>

      <FieldShell
        id={fieldId("businessType")}
        label="Business type"
        optional
        hint="Helps us suggest a starting setup. It never limits what the CRM can do, and you can type anything."
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
              onChange={(event) => onCountryChange(event.target.value)}
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
          hint="Suggested from your country. Change it if your business bills in another."
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
        <SubmitButton />
      </div>
    </form>
  );
}
