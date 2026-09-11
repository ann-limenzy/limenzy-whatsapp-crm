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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeRedirect(searchParams.get("next"), "/setup");

  if (!tokenHash || tokenHash.length < 16 || !isAllowedType(type)) {
    redirect("/auth/auth-error?reason=invalid_link");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    redirect("/auth/auth-error?reason=expired_link");
  }

  // A recovery link must land on the set-new-password screen, never on the
  // application: the user has a session but has not chosen a password yet.
  redirect(type === "recovery" ? "/reset-password" : next);
}
