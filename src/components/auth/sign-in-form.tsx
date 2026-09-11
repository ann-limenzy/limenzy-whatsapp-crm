"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  Field,
  FormAlert,
  PasswordField,
  SubmitButton,
} from "@/components/auth/form-parts";
import { signInAction, type AuthActionState } from "@/app/actions/auth";

const INITIAL: AuthActionState = {};

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(signInAction, INITIAL);

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      {/* Carried through so the user returns to where they were heading. The
          server re-validates it with safeRedirect; this value is never
          trusted as submitted. */}
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <FormAlert tone="error">
          {state.error}
          {state.code === "email_not_confirmed" ? (
            <>
              {" "}
              <Link
                href="/verify-email"
                className="font-medium underline underline-offset-4"
              >
                Resend the link
              </Link>
              .
            </>
          ) : null}
        </FormAlert>
      ) : null}

      <Field
        name="email"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        error={state.fieldErrors?.email}
      />

      <div className="grid gap-2">
        <PasswordField
          name="password"
          label="Password"
          autoComplete="current-password"
          error={state.fieldErrors?.password}
        />
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>

      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>

      {/* The session is kept in secure, server-managed cookies. There is no
          "remember me" toggle because there is no alternative, weaker mode. */}
      <p className="text-xs text-muted-foreground">
        You will stay signed in on this device until you sign out.
      </p>
    </form>
  );
}
