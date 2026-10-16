"use client";

import { useActionState } from "react";

import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import {
  resendVerificationAction,
  type AuthActionState,
} from "@/app/actions/auth";

const INITIAL: AuthActionState = {};

export function ResendVerificationForm({
  email,
  next,
}: {
  email?: string;
  /**
   * Where confirming should land, so a resent link continues the same
   * journey as the first one. Server-validated on the way in and again in
   * the action; it is a destination, never a permission.
   */
  next?: string;
}) {
  const [state, formAction] = useActionState(resendVerificationAction, INITIAL);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.success ? (
        <FormAlert tone="success">{state.success}</FormAlert>
      ) : null}

      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        name="email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        defaultValue={email}
        error={state.fieldErrors?.email}
      />

      {/* Supabase enforces the send interval and returns 429; the mapped
          message asks the user to wait rather than exposing the limit. */}
      <SubmitButton pendingLabel="Sending…">
        Resend verification email
      </SubmitButton>
    </form>
  );
}
