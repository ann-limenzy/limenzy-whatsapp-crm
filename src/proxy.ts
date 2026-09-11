import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { PATHNAME_HEADER } from "@/lib/auth/redirect";

/**
 * Session refresh.
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy` (deprecated in
 * v16.0.0). This is the current convention, not a legacy middleware file.
 *
 * Its single job is to refresh the Supabase auth token and write the rotated
 * cookies onto the response, so that Server Components — which cannot write
 * cookies during render — see a valid session.
 *
 * It is deliberately NOT the authorization boundary. The Next.js documentation
 * warns that Server Functions are handled as POST requests to the route where
 * they are used, so a matcher change or a refactor can silently remove proxy
 * coverage:
 *
 *   "Always verify authentication and authorization inside each Server
 *    Function rather than relying on Proxy alone."
 *
 * Accordingly every protected route calls `requireUser()` on the server, and
 * every Server Action re-checks. If this file were deleted tomorrow, sessions
 * would refresh less efficiently but nothing would become accessible.
 *
 * It also stamps the request path onto a request header. A Server Component
 * cannot read the URL it is rendering, so without this the sign-in redirect
 * could not offer to return the user to where they were heading. The header is
 * set on the REQUEST, never the response, so it is not observable by the
 * browser, and it is overwritten on every request — a client-supplied value
 * cannot survive.
 */
export async function proxy(request: NextRequest) {
  // Without configuration there is no session to refresh. Passing through is
  // safe because protection lives in `requireUser()`, which fails loudly.
  // Returning a 500 from here instead would break every page, including the
  // ones that explain what is missing.
  // Overwrite rather than append: a forged inbound header must not win.
  request.headers.set(PATHNAME_HEADER, request.nextUrl.pathname);

  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const env = publicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // A response that carries a rotated session cookie must never be
          // cached by a CDN or reverse proxy, or one user's token can be
          // served to another. The library supplies the exact headers.
          if (headers) {
            for (const [key, headerValue] of Object.entries(headers)) {
              response.headers.set(key, headerValue);
            }
          }
        },
      },
    },
  );

  // Must run before the response is generated: a refresh that completes after
  // the response is committed cannot write its cookies, and the next request
  // would refresh again.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  /**
   * Everything except static assets and image optimisation.
   *
   * Running on `_next/static` and `public/` would refresh a session on every
   * font and icon request for no benefit.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)",
  ],
};
