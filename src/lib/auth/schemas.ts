import { z } from "zod";

/**
 * Authentication validation schemas.
 *
 * Shared deliberately: the client uses these for inline feedback and the
 * Server Action re-parses the same schema before touching Supabase. The rule
 * from the architecture decisions is that the browser is never trusted, so
 * client-side validation is a convenience and the server parse is the control.
 *
 * Only rules that genuinely apply in both places live here. Anything the
 * server alone can know — whether an address is already registered, whether a
 * reset link is still valid — stays server-side.
 */

/** Minimum password length. Shown to the user before they submit. */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * Password policy, stated positively so the requirements can be rendered as a
 * checklist rather than discovered through rejection.
 */
export const PASSWORD_REQUIREMENTS = [
  { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters` },
  { id: "lower", label: "One lowercase letter" },
  { id: "upper", label: "One uppercase letter" },
  { id: "number", label: "One number" },
] as const;

export type PasswordRequirementId =
  (typeof PASSWORD_REQUIREMENTS)[number]["id"];

/** Evaluate the policy for live feedback. Pure, so it is directly testable. */
export function checkPassword(
  value: string,
): Record<PasswordRequirementId, boolean> {
  return {
    length: value.length >= PASSWORD_MIN_LENGTH,
    lower: /[a-z]/.test(value),
    upper: /[A-Z]/.test(value),
    number: /[0-9]/.test(value),
  };
}

/**
 * Email.
 *
 * Trimmed and lower-cased so `  Ann@Example.com ` and `ann@example.com` are
 * the same account rather than two.
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address")
  .max(254, "That email address is too long")
  .toLowerCase()
  .email("Enter a valid email address");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(72, "Use 72 characters or fewer")
  .refine((v) => /[a-z]/.test(v), "Include a lowercase letter")
  .refine((v) => /[A-Z]/.test(v), "Include an uppercase letter")
  .refine((v) => /[0-9]/.test(v), "Include a number");

export const fullNameSchema = z
  .string()
  .trim()
  .min(2, "Enter your full name")
  .max(120, "That name is too long");

export const signUpSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Re-enter your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;

/**
 * Sign-in deliberately does NOT apply the password policy.
 *
 * An existing account may predate a policy change, and telling an unauthorised
 * visitor that their guess "needs an uppercase letter" leaks the shape of the
 * stored password. Presence is all that is checked here; correctness is
 * Supabase's job.
 */
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Re-enter your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const resendVerificationSchema = z.object({
  email: emailSchema,
});
