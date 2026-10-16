import "server-only";

import { isSecureEnvironment } from "@/server/auth/workspace-selection";

/**
 * The short-lived cookie that carries an invitation token.
 *
 * ## Why a cookie and not the URL
 *
 * A token in a path or a query string leaks: into the `Referer` header of
 * every resource the page loads, into proxy and server access logs, into
 * browser history, and into anything that records a redirect chain. The link
 * has to arrive as a URL — that is the whole point of a copyable link — so
 * the first thing the product does with it is move it somewhere narrower.
 *
 * The entry point is a Route Handler that stores the token here and redirects
 * to a token-free address. Everything afterwards reads the cookie, so the
 * token appears in exactly one request and never in a rendered page.
 *
 * It doubles as the continuation. A cookie survives sign-in, sign-up and
 * email confirmation without anything being threaded through `next`, so the
 * token is never appended to an auth callback URL either.
 *
 * `HttpOnly` keeps it away from page scripts; `SameSite=Lax` still sends it
 * on the top-level navigation that returns from the auth flow; and the
 * lifetime is deliberately short — long enough to sign up and confirm an
 * address, not long enough to sit in a shared browser.
 */

export const INVITATION_COOKIE = "limenzy_invite";

/** Thirty minutes: enough to create an account and confirm an address. */
export const INVITATION_COOKIE_MAX_AGE = 30 * 60;

export function invitationCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureEnvironment(),
    path: "/",
    maxAge: INVITATION_COOKIE_MAX_AGE,
  };
}
