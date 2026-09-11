"use client";

import { useActionState, useId, useState } from "react";

import {
  Field,
  FormAlert,
  PasswordField,
  PasswordRequirements,
  SubmitButton,
} from "@/components/auth/form-parts";
import { signUpAction, type AuthActionState } from "@/app/actions/auth";

const INITIAL: AuthActionState = {};

export function SignUpForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signUpAction, INITIAL);
  const [password, setPassword] = useState("");
  const requirementsId = useId();

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <Field
        name="fullName"
        label="Full name"
        autoComplete="name"
        error={state.fieldErrors?.fullName}
      />

      <Field
        name="email"
        label="Work email"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={state.fieldErrors?.email}
      />

      <div className="grid gap-2">
        <PasswordField
          name="password"
          label="Password"
          autoComplete="new-password"
          error={state.fieldErrors?.password}
          onValueChange={setPassword}
          describedById={requirementsId}
        />
        {/* Requirements are visible before submission, not discovered by
            rejection. */}
        <PasswordRequirements value={password} id={requirementsId} />
      </div>

      <PasswordField
        name="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />

      <SubmitButton pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
