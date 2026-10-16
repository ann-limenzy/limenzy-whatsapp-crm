import { NextResponse, type NextRequest } from "next/server";

import { isInvitationToken } from "@/lib/invitation-token";
import {
  INVITATION_COOKIE,
  invitationCookieOptions,
} from "@/server/auth/invitation-cookie";

/**
 * The address on an invitation link.
 *
 * **It redeems nothing.** It touches no database, resolves no identity and
 * decides nothing; it moves the token out of the URL into a short-lived
 * HttpOnly cookie and sends the visitor to a token-free page, where joining
 * is an explicit action. Opening a link — by clicking it, by a mail client
 * prefetching it, by a chat app generating a preview — therefore has no
 * effect beyond setting that cookie.
 *
 * **It is why the token stops here.** From this response onward the token is
 * never in a URL, so it cannot reach a `Referer` header, a rendered page, the
 * browser's history list, or an auth callback's `next` parameter. The
 * response is marked `no-store` and `no-referrer` so this one request is not
 * cached and sends nothing onward either.
 *
 * **There is no authentication check**, deliberately. Storing a token grants
 * nothing: the page it redirects to requires a verified, signed-in identity
 * whose address matches the invitation, and the routine behind it re-derives
 * all of that from the database.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  /**
   * A ROOT-RELATIVE `Location`, for the reason `/workspace/reset` records:
   * `NextResponse.redirect()` needs an absolute URL, and the only origin
   * available to build one is `request.nextUrl`, whose host the framework
   * normalises — a request to `http://127.0.0.1:3461` was answered with
   * `Location: http://localhost:3461/…`. That is a different origin to the
   * browser, so the host-scoped session cookie was not sent to the
   * destination and the invitee was asked to sign in again having just
   * signed in. Here that is worse than cosmetic: the sign-in they are bounced
   * into is the continuation this cookie exists to protect.
   *
   * A relative reference is resolved against the URL the browser actually
   * requested, so scheme, host and port survive. The constant below is a
   * fixed internal path — nothing from the request reaches it.
   *
   * 303, so the browser issues a fresh GET and the token-bearing URL is
   * replaced rather than repeated.
   */
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/invitations" },
  });

  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");

  // A malformed value is simply not stored. The page then shows the ordinary
  // "no invitation" state rather than revealing that a shape check exists.
  if (isInvitationToken(token)) {
    response.cookies.set(INVITATION_COOKIE, token, invitationCookieOptions());
  }

  return response;
}
