"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";

/**
 * Browser Supabase client.
 *
 * Used only for operations that must run in the browser and that Supabase
 * itself scopes to the signed-in user — currently none of the authentication
 * lifecycle, which all runs through Server Actions. It exists so that future
 * client-side auth state subscriptions have a single, correct entry point.
 *
 * Created inside a function rather than at module scope so that importing this
 * module never requires configuration. That keeps `next build` working on a
 * machine without credentials and keeps unrelated tests importable.
 *
 * Only the publishable key reaches this file. The secret key must never appear
 * in a module that can be bundled for the browser.
 */
export function createClient() {
  const env = publicEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
