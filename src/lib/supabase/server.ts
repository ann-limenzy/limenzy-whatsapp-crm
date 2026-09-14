import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env";

/**
 * Server-side Supabase client.
 *
 * `server-only` makes importing this from a Client Component a build error, so
 * server credentials and cookie access cannot leak into a browser bundle.
 *
 * Cookie handling follows the current `@supabase/ssr` contract: `getAll` reads
 * the request cookies, `setAll` receives the cookies to write *and* a `headers`
 * object carrying `Cache-Control` / `Expires` / `Pragma`. Those headers matter:
 * without them a CDN or reverse proxy can cache a response that carries a
 * Set-Cookie and serve one user's session to another.
 *
 * Server Components cannot write cookies. Next.js throws when `cookies().set()`
 * is called during render, so `setAll` swallows that specific case — the proxy
 * has already refreshed the token and written the cookies for this request.
 * In a Server Action or Route Handler the write succeeds normally.
 */
export async function createClient() {
  // `cookies()` first, deliberately. Reading it is what opts the route out of
  // static prerendering. If env validation ran first it would throw during
  // `next build` before Next had a chance to mark the route dynamic.
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render, where cookies are
            // read-only. The proxy refreshed the session for this request, so
            // there is nothing to recover here.
          }
        },
      },
    },
  );
}
