"use client";

import { useActionState } from "react";

import { Field, FormAlert, SubmitButton } from "@/components/auth/form-parts";
import { forgotPasswordAction, type AuthActionState } from "@/app/actions/auth";

const INITIAL: AuthActionState = {};

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, INITIAL);

  // The success message is deliberately identical whether or not an account
  // exists, so this form cannot be used to discover registered addresses.
  if (state.success) {
    return <FormAlert tone="success">{state.success}</FormAlert>;
  }

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <Field
        name="email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={state.fieldErrors?.email}
      />

      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
