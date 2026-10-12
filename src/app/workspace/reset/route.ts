import { NextResponse, type NextRequest } from "next/server";

import {
  SELECT_WORKSPACE_PATH,
  safeWorkspaceReturn,
} from "@/server/auth/require-workspace";
import {
  readWorkspacePreference,
  WORKSPACE_COOKIE,
  workspaceCookieOptions,
} from "@/server/auth/workspace-selection";

/**
 * Clear the saved workspace preference.
 *
 * A Route Handler because the platform permits cookie mutation here and
 * forbids it during rendering, and this is the one recovery path the workspace
 * gate can send a stale preference to.
 *
 * **It clears one cookie.** The Supabase auth cookies are untouched: a stale
 * workspace is not a reason to end a perfectly good session, and signing out
 * is `signOutAction`, not a cookie deletion.
 *
 * **It grants nothing.** Clearing a preference cannot create access, and the
 * destination it sends the visitor to re-resolves identity and membership from
 * the database like every other request. There is deliberately no
 * authentication check here for that reason — an anonymous visitor who calls
 * it simply has a preference cookie removed and is then sent somewhere that
 * will ask them to sign in.
 *
 * WHY NO `ws_reset=1` MARKER. An earlier design proposed one, so the gate
 * could ignore the cookie for one pass if deletion failed. It is not used,
 * because the gate runs in layouts, which cannot read a query string — a
 * marker it cannot enforce would be a lie in the URL. The loop is closed
 * structurally instead: when a preference was present, this handler sends the
 * visitor to the chooser, which consults no preference and runs no workspace
 * gate. So even if the deletion were ineffective — the platform documents
 * domain and protocol mismatches as a failure mode — the visitor lands
 * somewhere stable that can rewrite the cookie through the normal action,
 * rather than being bounced back into the gate that sent them here.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requested = request.nextUrl.searchParams.get("next");
  // Validated and stripped of account surfaces, so the onward journey cannot
  // return to this handler or to the screens that exist to escape it.
  const next = safeWorkspaceReturn(requested);

  const had = (await readWorkspacePreference()) !== undefined;

  /**
   * With a preference cleared, the chooser is the honest destination: the
   * visitor has just lost the thing that decided where they were going, and
   * the chooser re-resolves from the database. `next` rides along so a
   * selection can return them to where they were heading.
   *
   * With nothing to clear, this was a direct visit, and the validated
   * destination (or the root route) is correct.
   */
  const destination = had
    ? next
      ? `${SELECT_WORKSPACE_PATH}?next=${encodeURIComponent(next)}`
      : SELECT_WORKSPACE_PATH
    : next || "/";

  /**
   * A ROOT-RELATIVE `Location`, deliberately not an absolute URL.
   *
   * `NextResponse.redirect()` needs an absolute URL, and the only origin
   * available to build one is `request.nextUrl`, whose host the framework
   * normalises: a request to `http://127.0.0.1:3100` was answered with
   * `Location: http://localhost:3100/…`. That is a different origin to the
   * browser, so the session cookie — host-scoped to the host actually typed —
   * was not sent to the destination, and recovering from a stale preference
   * looked exactly like being signed out.
   *
   * A relative reference is resolved by the browser against the URL it
   * requested, so scheme, host and port survive whatever the framework thinks
   * they are. The alternative — reading `Host` or `X-Forwarded-Host` — would
   * mean trusting a header a client can set, which is how open redirects and
   * cache-poisoning start. Nothing here rewrites `localhost` to `127.0.0.1` or
   * the reverse; the origin is simply never named.
   *
   * `destination` is already a validated internal path, but it is the value
   * going into a `Location` header, so it is checked once more: anything that
   * is not a single-slash path becomes the root route. A protocol-relative
   * `//host` would otherwise be an open redirect.
   */
  const location =
    destination.startsWith("/") && !destination.startsWith("//")
      ? destination
      : "/";

  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: location },
  });

  /**
   * Expired on the response itself rather than through `cookies()`, so the
   * `Set-Cookie` header is attached to exactly this redirect and cannot be
   * lost by constructing the response separately.
   *
   * Same name, path and (absent) domain as the write, which is what the
   * platform requires for a deletion to match. Attempted unconditionally: a
   * cookie the reader could not see is still worth expiring.
   */
  response.cookies.set(WORKSPACE_COOKIE, "", {
    ...workspaceCookieOptions(),
    maxAge: 0,
  });

  // A redirect that carries Set-Cookie must never be stored: a cached copy
  // would expire the next visitor's preference, or revive this one's.
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
