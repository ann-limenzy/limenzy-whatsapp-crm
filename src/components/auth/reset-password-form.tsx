"use client";

import { useActionState, useId, useState } from "react";

import {
  FormAlert,
  PasswordField,
  PasswordRequirements,
  SubmitButton,
} from "@/components/auth/form-parts";
import { updatePasswordAction, type AuthActionState } from "@/app/actions/auth";

const INITIAL: AuthActionState = {};

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(updatePasswordAction, INITIAL);
  const [password, setPassword] = useState("");
  const requirementsId = useId();

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <div className="grid gap-2">
        <PasswordField
          name="password"
          label="New password"
          autoComplete="new-password"
          error={state.fieldErrors?.password}
          onValueChange={setPassword}
          describedById={requirementsId}
        />
        <PasswordRequirements value={password} id={requirementsId} />
      </div>

      <PasswordField
        name="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
      />

      <SubmitButton pendingLabel="Updating…">Update password</SubmitButton>
    </form>
  );
}
