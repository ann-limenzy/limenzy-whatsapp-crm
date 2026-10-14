import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { safeRedirect } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Email confirmation callback.
 *
 * Handles the link Supabase emails for signup confirmation, password recovery,
 * email change and magic links. The link carries `token_hash` and `type`;
 * exchanging them establishes the session and writes the auth cookies.
 *
 * Security properties:
 *
 *   - `type` is checked against an allow-list. An arbitrary string is not
 *     forwarded to Supabase.
 *   - `token_hash` must be present and non-trivial; a missing or malformed
 *     value is rejected before any exchange is attempted.
 *   - `next` passes through `safeRedirect`, so a crafted confirmation link
 *     cannot bounce the user to an external site after signing them in. That
 *     is the open-redirect risk specific to this route: the attacker controls
 *     the whole URL in a phishing email.
 *   - Failures land on a page that explains the problem. No Supabase error
 *     text is echoed.
 *   - The failure URL carries at most a `reason` and a `flow`, both drawn from
 *     fixed sets. No email address, token or identifier is ever placed in it:
 *     an error URL is pasted into support tickets and logged by proxies.
 */

const ALLOWED_TYPES: readonly EmailOtpType[] = [
  "signup",
  "recovery",
  "invite",
  "email_change",
  "magiclink",
  "email",
];

function isAllowedType(value: string | null): value is EmailOtpType {
  return value !== null && (ALLOWED_TYPES as readonly string[]).includes(value);
}

/**
 * Which recovery the error page should offer, derived from the link's `type`.
 *
 * Signup and password recovery fail the same way but need opposite remedies:
 * a new confirmation email, or a new reset link. Carrying the intent forward
 * keeps them apart, so a failed signup never walks someone into a password
 * reset for an account they have not confirmed yet.
 *
 * Only the two types with an unambiguous remedy are mapped. `invite`,
 * `magiclink` and `email_change` are left unmapped on purpose: guessing which
 * screen they belong on would be worse than letting the page offer both.
 */
function flowFor(type: string | null): "signup" | "recovery" | null {
  if (type === "recovery") return "recovery";
  if (type === "signup" || type === "email") return "signup";
  return null;
}

/** `reason`, plus `flow` only when it is actually known. */
function errorUrl(
  reason: "invalid_link" | "expired_link",
  type: string | null,
): string {
  const flow = flowFor(type);
  return `/auth/auth-error?reason=${reason}${flow ? `&flow=${flow}` : ""}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeRedirect(searchParams.get("next"), "/setup");

  if (!tokenHash || tokenHash.length < 16 || !isAllowedType(type)) {
    // `type` may still be recognisable even when the token is not, so the user
    // is offered the right remedy wherever the link says what it was for.
    redirect(errorUrl("invalid_link", type));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    redirect(errorUrl("expired_link", type));
  }

  // A recovery link must land on the set-new-password screen, never on the
  // application: the user has a session but has not chosen a password yet.
  redirect(type === "recovery" ? "/reset-password" : next);
}
