import "server-only";

import { cookies } from "next/headers";

import { serverEnv } from "@/lib/env";

/**
 * The saved workspace preference.
 *
 * **A preference, never authorization.** The cookie holds one workspace UUID
 * and nothing else — no role, no profile id, no context, no expiry of its own
 * that anything trusts. Every request hands the value to
 * `resolveWorkspaceContext()` as an untrusted candidate, which checks it
 * against memberships read under row-level security. A forged, stale, foreign
 * or deactivated value therefore grants exactly nothing; it is refused like
 * any other wrong answer.
 *
 * That is also why it is neither signed nor encrypted. A signature would say
 * "this value is trustworthy", which is the one thing it must never be, and it
 * would invite a later change to skip the membership check because the cookie
 * "verified". Unsigned keeps the authority where it belongs: in the database.
 *
 * **Reading is separate from writing on purpose.** Next.js only permits
 * `set`/`delete` in a Server Action or Route Handler — setting a cookie during
 * Server Component or layout rendering is not supported, because the response
 * headers are already streaming. So the reader below is safe to call from a
 * layout or page, and the two mutators are not: they are called from
 * `selectWorkspaceAction`, `signOutAction` and `GET /workspace/reset`, and
 * nowhere else.
 */

/** Cookie name. Short, unmistakable, and not reused for anything else. */
export const WORKSPACE_COOKIE = "limenzy_ws";

/** 30 days. Long enough to survive a browser restart, short enough to lapse. */
export const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Whether to mark the cookie `Secure`.
 *
 * Derived from **server** configuration only — the configured site URL, else
 * the build mode. Deliberately not from `X-Forwarded-Proto`, the `Host`
 * header or the request origin: those are supplied by whatever is in front of
 * the application and, in the worst case, by the client. A request arriving
 * over plain HTTP must never be able to talk the server into dropping
 * `Secure` from a cookie it would otherwise protect.
 */
export function isSecureEnvironment(): boolean {
  const siteUrl = serverEnv().NEXT_PUBLIC_SITE_URL;
  if (siteUrl) return siteUrl.startsWith("https://");
  return process.env.NODE_ENV === "production";
}

/**
 * The attributes used for both writing and clearing.
 *
 * `path` and the absence of `domain` are what make the clear match the write:
 * a cookie set at `/` with no domain is only removed by a deletion with the
 * same scope. Everything here is fixed; nothing is assembled from input.
 */
export function workspaceCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  secure: boolean;
  maxAge: number;
} {
  return {
    // Not readable from JavaScript: it is a server-side routing preference,
    // and no client code has a reason to see it.
    httpOnly: true,
    // `lax` still sends the cookie on a top-level navigation back from the
    // email confirmation link, while keeping it off cross-site sub-requests.
    sameSite: "lax",
    path: "/",
    secure: isSecureEnvironment(),
    maxAge: WORKSPACE_COOKIE_MAX_AGE,
  };
}

/**
 * The saved preference, exactly as the browser sent it.
 *
 * Returns `undefined` when absent so the resolver can tell "nothing was
 * chosen" from "something was chosen and is wrong" — the two have different
 * outcomes. The value is NOT validated here: shape-checking belongs to the
 * resolver, which is the only place that can also check membership, and
 * splitting the two would create a second, weaker notion of "valid".
 *
 * Safe to call during rendering. It only reads.
 */
export async function readWorkspacePreference(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(WORKSPACE_COOKIE)?.value ?? undefined;
}

/**
 * Save a workspace preference.
 *
 * **Server Actions and Route Handlers only.** The caller must already have
 * resolved this workspace to `ok` for the signed-in user; this function does
 * no checking of its own and is not a place to add any, because a caller that
 * reached here without resolving has a bug that a second check would hide.
 */
export async function writeWorkspacePreference(
  workspaceId: string,
): Promise<void> {
  const store = await cookies();
  store.set(WORKSPACE_COOKIE, workspaceId, workspaceCookieOptions());
}

/**
 * Remove the workspace preference, and only that.
 *
 * Auth cookies are Supabase's and are never touched here: signing a user out
 * is `supabase.auth.signOut()`, not a cookie deletion, and clearing a stale
 * workspace must not disturb a perfectly good session.
 *
 * Cleared with the same name, path and (absent) domain it was written with,
 * which is what the platform requires for the deletion to match.
 */
export async function clearWorkspacePreference(): Promise<void> {
  const store = await cookies();
  store.set(WORKSPACE_COOKIE, "", {
    ...workspaceCookieOptions(),
    maxAge: 0,
  });
}
