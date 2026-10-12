import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  PATHNAME_HEADER,
  SIGN_IN_PATH,
  safeRedirect,
} from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side identity resolution.
 *
 * `getClaims()` is the mechanism the current Supabase guidance names for
 * protecting pages and data: it reads the access token and verifies its
 * signature, locally via WebCrypto where the project uses asymmetric keys, or
 * against the Auth server otherwise.
 *
 * What is deliberately NOT used:
 *
 *   getSession()  the docs are explicit that it "isn't guaranteed to
 *                 revalidate the Auth token", and its embedded user object is
 *                 not trustworthy when storage is shared with the client. It
 *                 must never gate access.
 *
 * Identity is resolved on the server on every request. No component receives a
 * user id from the browser and believes it.
 */

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  /** Whether the address has been confirmed. Drives the verification gate. */
  emailVerified: boolean;
  fullName: string | null;
};

type Claims = Record<string, unknown>;

function readString(claims: Claims, key: string): string | null {
  const value = claims[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readMetadataName(claims: Claims): string | null {
  const meta = claims["user_metadata"];
  if (typeof meta !== "object" || meta === null) return null;
  const record = meta as Record<string, unknown>;
  for (const key of ["full_name", "name"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Whether the address behind this token is confirmed.
 *
 * **The token itself is the evidence.** Supabase issues no access token to an
 * unconfirmed address while `enable_confirmations` is on: the token endpoint
 * answers `400 email_not_confirmed`. So a signature-verified token existing at
 * all is proof the address was confirmed, and `supabase/config.toml` keeping
 * that setting on is asserted by a contract test rather than assumed here.
 *
 * This replaces a check that read a top-level `email_verified` claim. Supabase
 * does not emit one — a real local access token carries exactly `aal, amr,
 * app_metadata, aud, email, exp, iat, is_anonymous, iss, phone, role,
 * session_id, sub, user_metadata` — so that check evaluated to `false` for
 * **every** signed-in user. Pages never noticed, because `requireUser()` gates
 * on identity alone; the Server Actions that do check it classified every
 * valid session as unauthenticated.
 *
 * If a future Supabase version (or a custom access-token hook) does emit the
 * claim, it is honoured and can still say `false`, which fails closed.
 *
 * `user_metadata.email_verified` is deliberately **not** consulted, even
 * though it is inside the signed token: `updateUser({ data })` lets a user
 * write their own metadata, so trusting it would let an unverified account
 * assert its own verification. A gate that an attacker can set is worse than
 * no gate, because it reads like protection.
 */
function readEmailVerified(claims: Claims): boolean {
  const claim = claims["email_verified"];
  if (typeof claim === "boolean") return claim;
  if (typeof claim === "string") return claim === "true";
  return true;
}

/**
 * Read the verified user, or `null` when there is no valid session.
 *
 * Never throws for "not signed in" — that is an expected state, not an error.
 * It does throw when Supabase is unconfigured, because that is a deployment
 * fault the operator must see rather than a silent "everyone is logged out".
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) return null;

  const claims = data.claims as Claims;
  const id = readString(claims, "sub");
  if (!id) return null;

  return {
    id,
    email: readString(claims, "email"),
    emailVerified: readEmailVerified(claims),
    fullName: readMetadataName(claims),
  };
}

/**
 * The path being rendered, as stamped on the request by the proxy.
 *
 * A Server Component cannot read its own URL, so this header is the only way
 * to know where the visitor was heading. It is a hint: the caller still runs
 * it through `safeRedirect` before putting it in a link.
 */
async function pathFromRequest(): Promise<string | undefined> {
  try {
    return (await headers()).get(PATHNAME_HEADER) ?? undefined;
  } catch {
    // No request context — nothing to preserve, which is not an error.
    return undefined;
  }
}

/**
 * Require a signed-in user, or redirect to sign-in.
 *
 * The current path is preserved as `next` so the user returns where they were
 * heading — but only after `safeRedirect` has confirmed it is an internal,
 * non-authentication route.
 */
export async function requireUser(
  currentPath?: string,
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (user) return user;

  const intended = currentPath ?? (await pathFromRequest());
  const next = safeRedirect(intended, "");
  redirect(
    next ? `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}` : SIGN_IN_PATH,
  );
}

/**
 * Require that nobody is signed in.
 *
 * Used by the authentication pages so a signed-in user who navigates back to
 * /sign-in is moved forward instead of being shown a form they do not need.
 */
export async function requireAnonymous(next?: string): Promise<void> {
  const user = await getAuthenticatedUser();
  if (user) redirect(safeRedirect(next));
}
