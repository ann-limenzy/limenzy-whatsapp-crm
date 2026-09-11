"use client";

import {
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  LoaderCircle,
} from "lucide-react";
import { useId, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  checkPassword,
  PASSWORD_REQUIREMENTS,
  type PasswordRequirementId,
} from "@/lib/auth/schemas";
import { cn } from "@/lib/utils";

/**
 * Shared pieces for the authentication forms.
 *
 * Accessibility is the point of factoring these out: label association,
 * `aria-invalid`, `aria-describedby`, `role="alert"` and `aria-live` are done
 * once here rather than re-derived (and forgotten) on five screens.
 */

/** Form-level message. Announced to assistive technology when it appears. */
export function FormAlert({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  const Icon = tone === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role="alert"
      className={cn(
        "mb-4 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
        tone === "error"
          ? "border-danger/30 bg-danger-subtle text-danger-on-subtle"
          : "border-success/30 bg-success-subtle text-success-on-subtle",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** Labelled text field with inline error wiring. */
export function Field({
  name,
  label,
  type = "text",
  autoComplete,
  error,
  description,
  required = true,
  inputMode,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  error?: string;
  description?: string;
  required?: boolean;
  inputMode?: "email" | "text";
  defaultValue?: string;
  placeholder?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const descId = `${id}-description`;
  const describedBy =
    [description ? descId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {description ? (
        <p id={descId} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-danger-on-subtle">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Password field with a show/hide toggle. */
export function PasswordField({
  name,
  label,
  autoComplete,
  error,
  onValueChange,
  describedById,
}: {
  name: string;
  label: string;
  autoComplete: string;
  error?: string;
  onValueChange?: (value: string) => void;
  /** Id of an external requirements list to announce with the field. */
  describedById?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const [visible, setVisible] = useState(false);
  const describedBy =
    [describedById, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          className="pe-11"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={
            onValueChange ? (e) => onValueChange(e.target.value) : undefined
          }
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 end-0 grid w-11 place-items-center rounded-e-md text-muted-foreground transition-colors hover:text-foreground"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {error ? (
        <p id={errorId} className="text-sm text-danger-on-subtle">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Live password-policy checklist.
 *
 * Requirements are shown up-front rather than revealed by rejection, and each
 * item carries a tick or a dot so the state is not conveyed by colour alone.
 */
export function PasswordRequirements({
  value,
  id,
}: {
  value: string;
  id: string;
}) {
  const state = checkPassword(value);
  return (
    <ul id={id} className="grid gap-1" aria-label="Password requirements">
      {PASSWORD_REQUIREMENTS.map((req) => {
        const met = state[req.id as PasswordRequirementId];
        return (
          <li
            key={req.id}
            className={cn(
              "flex items-center gap-2 text-xs",
              met ? "text-success-on-subtle" : "text-muted-foreground",
            )}
          >
            {met ? (
              <CircleCheck className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <span
                aria-hidden="true"
                className="grid size-3.5 shrink-0 place-items-center"
              >
                <span className="size-1.5 rounded-full bg-current opacity-60" />
              </span>
            )}
            <span>{req.label}</span>
            <span className="sr-only">{met ? " — met" : " — not yet met"}</span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Submit button bound to the enclosing form's pending state.
 *
 * `useFormStatus` disables it while the action runs, which is what prevents a
 * double submission creating two sign-up attempts.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn("w-full", className)}
    >
      {pending ? (
        <>
          <LoaderCircle
            className="size-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
