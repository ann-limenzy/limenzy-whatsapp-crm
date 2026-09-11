import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

import { safeRedirect } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * PKCE code-exchange callback.
 *
 * Supabase projects configured for the PKCE flow send `?code=` rather than
 * `token_hash`. Both entry points exist so the application works regardless of
 * project configuration, and both apply the same validation.
 *
 * `next` is validated with `safeRedirect` for the same reason as in
 * /auth/confirm: the whole URL is attacker-controllable in a phishing email.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRedirect(searchParams.get("next"), "/setup");

  if (!code || code.length < 16) {
    redirect("/auth/auth-error?reason=invalid_link");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    redirect("/auth/auth-error?reason=expired_link");
  }

  redirect(next);
}
