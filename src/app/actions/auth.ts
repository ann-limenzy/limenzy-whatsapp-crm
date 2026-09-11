"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  mapResendError,
  mapSignInError,
  mapSignUpError,
  mapUpdatePasswordError,
} from "@/lib/auth/errors";
import {
  buildCallbackUrl,
  DEFAULT_AUTHENTICATED_REDIRECT,
  SIGN_IN_PATH,
  safeRedirect,
} from "@/lib/auth/redirect";
import {
  forgotPasswordSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/auth/schemas";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Authentication Server Actions.
 *
 * Every action re-parses its input with the shared Zod schema before touching
 * Supabase. Client-side validation is a convenience for the person filling in
 * the form; this parse is the actual control. Nothing here trusts a value
 * because the browser sent it.
 *
 * Nothing in this file logs an email address, a password, a token or a cookie.
 */

export type AuthActionState = {
  /** Message to show in the form-level alert. */
  error?: string;
  /** Lets the UI branch, e.g. offer "resend verification". */
  code?: string;
  /** Field-level messages keyed by form field name. */
  fieldErrors?: Record<string, string>;
  /** Non-error confirmation, e.g. "password updated". */
  success?: string;
};

/** Flatten a Zod error into the field map the forms render. */
function fieldErrorsFrom(
  issues: { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Absolute origin for email callback links.
 *
 * Server-derived only — the configured site URL, else the request's own host.
 * A form field can never influence where a verification email points.
 */
async function resolveOrigin(): Promise<string> {
  const configured = serverEnv().NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto =
    headerList.get("x-forwarded-proto") ??
    (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
      ? "http"
      : "https");
  if (!host) throw new Error("Unable to determine the request origin.");
  return `${proto}://${host}`;
}

/* ------------------------------------------------------------------ sign up */

export async function signUpAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const { fullName, email, password } = parsed.data;
  const next = safeRedirect(formData.get("next"), "");

  const supabase = await createClient();
  const origin = await resolveOrigin();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Server-built. Supabase additionally requires this to be on the
      // project's redirect allow-list, so a rogue value cannot be used.
      emailRedirectTo: buildCallbackUrl(origin, "/auth/confirm", next),
      data: { full_name: fullName },
    },
  });

  if (error) {
    const mapped = mapSignUpError(error);
    return { error: mapped.message, code: mapped.code };
  }

  // Supabase returns a success-shaped response for an already-registered
  // address when confirmation is enabled, so this path is identical either
  // way — which is what prevents account enumeration.
  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

/* ------------------------------------------------------------------ sign in */

export async function signInAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    const mapped = mapSignInError(error);
    return { error: mapped.message, code: mapped.code };
  }

  redirect(safeRedirect(formData.get("next"), DEFAULT_AUTHENTICATED_REDIRECT));
}

/* ------------------------------------------------- resend verification mail */

export async function resendVerificationAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resendVerificationSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createClient();
  const origin = await resolveOrigin();

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: buildCallbackUrl(origin, "/auth/confirm") },
  });

  // Throttling is enforced by Supabase, which returns 429. The mapped message
  // tells the user to wait rather than exposing the limit.
  if (error) {
    const mapped = mapResendError(error);
    return { error: mapped.message, code: mapped.code };
  }

  return { success: "Verification email sent. Check your inbox." };
}

/* ---------------------------------------------------------- forgot password */

export async function forgotPasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createClient();
  const origin = await resolveOrigin();

  // No `next` here: the confirm route routes `type=recovery` to the reset
  // screen itself. Passing /reset-password would be dropped anyway, because
  // safeRedirect treats the auth screens as non-destinations.
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: buildCallbackUrl(origin, "/auth/confirm") },
  );

  /**
   * The response is identical whether or not the address is registered.
   *
   * Only a genuine rate limit is surfaced, because that is about the caller's
   * behaviour rather than about whether an account exists.
   */
  if (error) {
    const mapped = mapResendError(error);
    if (mapped.code === "rate_limited") {
      return { error: mapped.message, code: mapped.code };
    }
  }

  return {
    success:
      "If an account exists for that address, a password reset link is on its way.",
  };
}

/* ----------------------------------------------------------- reset password */

export async function updatePasswordAction(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createClient();

  // The recovery link established a session. Without it there is nothing to
  // update, and Supabase rejects the call — which is the desired outcome for
  // an expired or replayed link.
  const { data, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !data?.claims) {
    return {
      error:
        "That password reset link is no longer valid. Request a new one and try again.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    const mapped = mapUpdatePasswordError(error);
    return { error: mapped.message, code: mapped.code };
  }

  redirect("/reset-password/done");
}

/* ----------------------------------------------------------------- sign out */

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  // Clears the session server-side and expires the auth cookies through the
  // SSR cookie adapter, so protected routes stop resolving a user immediately.
  await supabase.auth.signOut();
  redirect(SIGN_IN_PATH);
}
