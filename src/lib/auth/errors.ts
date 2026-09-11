/**
 * Safe authentication error mapping.
 *
 * Supabase error messages and codes are diagnostic, not user-facing. Passing
 * them straight through would leak implementation detail and, worse, would let
 * a visitor distinguish "no such account" from "wrong password" and enumerate
 * registered addresses.
 *
 * So: map a known set of codes to deliberate copy, and collapse everything
 * else to one generic message. Nothing from the raw error reaches the browser.
 */

export type AuthErrorShape = {
  /** Message rendered to the user. */
  message: string;
  /**
   * Present only when the UI needs to branch — for example, offering to resend
   * a verification email when the account exists but is unverified.
   */
  code?: "email_not_confirmed" | "rate_limited" | "invalid_credentials";
};

const GENERIC = "Something went wrong. Please try again.";

/**
 * One message for both "unknown email" and "wrong password".
 *
 * This is intentional and must not be "improved" into two distinct messages:
 * the pair is what makes account enumeration possible.
 */
export const INVALID_CREDENTIALS =
  "That email address or password is not correct.";

type SupabaseLikeError = {
  code?: string | null;
  status?: number | null;
  message?: string | null;
};

function readCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const e = error as SupabaseLikeError;
  if (typeof e.code === "string" && e.code) return e.code;
  // Older releases put the identifier only in the message.
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";
  if (message.includes("invalid login credentials"))
    return "invalid_credentials";
  if (message.includes("email not confirmed")) return "email_not_confirmed";
  if (message.includes("user already registered")) return "user_already_exists";
  if (message.includes("rate limit") || message.includes("too many"))
    return "over_request_rate_limit";
  if (message.includes("same password")) return "same_password";
  if (message.includes("weak password")) return "weak_password";
  return "";
}

function readStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const s = (error as SupabaseLikeError).status;
  return typeof s === "number" ? s : null;
}

/** Map a sign-in failure. */
export function mapSignInError(error: unknown): AuthErrorShape {
  const code = readCode(error);
  if (code === "email_not_confirmed") {
    return {
      code: "email_not_confirmed",
      message:
        "Confirm your email address before signing in. Check your inbox for the verification link.",
    };
  }
  if (code === "over_request_rate_limit" || readStatus(error) === 429) {
    return {
      code: "rate_limited",
      message: "Too many attempts. Wait a few minutes and try again.",
    };
  }
  // Everything else — including an unknown address — is the same message.
  return { code: "invalid_credentials", message: INVALID_CREDENTIALS };
}

/** Map a sign-up failure. */
export function mapSignUpError(error: unknown): AuthErrorShape {
  const code = readCode(error);
  if (code === "over_request_rate_limit" || readStatus(error) === 429) {
    return {
      code: "rate_limited",
      message: "Too many attempts. Wait a few minutes and try again.",
    };
  }
  if (code === "weak_password") {
    return { message: "Choose a stronger password." };
  }
  /**
   * "Already registered" is NOT surfaced.
   *
   * Supabase already returns a success-shaped response for an existing address
   * when email confirmation is on, precisely to prevent enumeration. Echoing
   * the error here would undo that.
   */
  if (code === "user_already_exists") {
    return { message: GENERIC };
  }
  return { message: GENERIC };
}

/** Map a password-update failure. */
export function mapUpdatePasswordError(error: unknown): AuthErrorShape {
  const code = readCode(error);
  if (code === "same_password") {
    return { message: "Choose a password you have not used before." };
  }
  if (code === "weak_password") {
    return { message: "Choose a stronger password." };
  }
  if (code === "over_request_rate_limit" || readStatus(error) === 429) {
    return {
      code: "rate_limited",
      message: "Too many attempts. Wait a few minutes and try again.",
    };
  }
  return {
    message:
      "That password reset link is no longer valid. Request a new one and try again.",
  };
}

/** Map a resend-verification failure. */
export function mapResendError(error: unknown): AuthErrorShape {
  if (
    readCode(error) === "over_request_rate_limit" ||
    readStatus(error) === 429
  ) {
    return {
      code: "rate_limited",
      message:
        "A verification email was sent recently. Wait a minute before requesting another.",
    };
  }
  return { message: GENERIC };
}

export { GENERIC as GENERIC_AUTH_ERROR };
