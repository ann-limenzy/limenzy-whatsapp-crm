import { z } from "zod";

/**
 * Environment configuration.
 *
 * Two deliberate design choices:
 *
 * 1. **Split browser / server.** `publicEnv()` holds only values that are safe
 *    to ship to the browser and must carry the `NEXT_PUBLIC_` prefix. Anything
 *    secret lives in `serverEnv()`, which is additionally guarded by
 *    `server-only` in the modules that consume it. A secret can therefore never
 *    reach a client bundle by accident — it becomes a build error.
 *
 * 2. **Validated on use, not on import.** Eager module-scope validation would
 *    make `next build` fail on a machine that has no credentials, and would
 *    make every unrelated test import blow up. Validating inside a memoised
 *    function keeps the failure where it belongs: at the moment something
 *    actually tries to talk to Supabase.
 *
 * Errors list the missing variable NAMES only. Values are never logged,
 * echoed, or included in an error message.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .min(1, "must be set")
    .url("must be a valid URL, for example https://<project-ref>.supabase.co"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "must be set"),
});

const serverSchema = z.object({
  /**
   * Absolute origin used to build email callback links, for example
   * `https://crm.example.com`. Optional: when unset the request's own origin
   * is used, which is correct for local development and preview deployments.
   */
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url("must be a valid absolute URL")
    .optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

export class EnvConfigurationError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      "Supabase is not configured. Missing or invalid environment " +
        `variable(s): ${missing.join(", ")}. ` +
        "Copy .env.example to .env.local and provide the values from your " +
        "Supabase project (Project Settings → API). Restart the dev server " +
        "afterwards; NEXT_PUBLIC_* values are inlined at build time.",
    );
    this.name = "EnvConfigurationError";
    this.missing = missing;
  }
}

function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const name = issue.path.join(".") || "(root)";
    return `${name} (${issue.message})`;
  });
}

/**
 * Read `NEXT_PUBLIC_*` values.
 *
 * Referenced explicitly rather than through a dynamic lookup, because Next.js
 * inlines these at build time by literal textual match. `process.env[name]`
 * would silently produce `undefined` in the browser bundle.
 */
function readPublic(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

let publicCache: PublicEnv | null = null;

export function publicEnv(): PublicEnv {
  if (publicCache) return publicCache;
  const parsed = publicSchema.safeParse(readPublic());
  if (!parsed.success)
    throw new EnvConfigurationError(describeIssues(parsed.error));
  publicCache = parsed.data;
  return publicCache;
}

let serverCache: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (serverCache) return serverCache;
  const parsed = serverSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  });
  if (!parsed.success)
    throw new EnvConfigurationError(describeIssues(parsed.error));
  serverCache = parsed.data;
  return serverCache;
}

/**
 * Non-throwing check.
 *
 * Used by the proxy, which must not turn an unconfigured environment into a
 * 500 on every request. Route protection does not depend on this: protected
 * routes call `requireUser()`, which throws loudly when Supabase is missing.
 */
export function isSupabaseConfigured(): boolean {
  return publicSchema.safeParse(readPublic()).success;
}

/** Names of the variables this application needs, for diagnostics and docs. */
export const REQUIRED_PUBLIC_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export const OPTIONAL_ENV = ["NEXT_PUBLIC_SITE_URL"] as const;

/** Test seam: clears memoised values so a test can vary the environment. */
export function resetEnvCacheForTests(): void {
  publicCache = null;
  serverCache = null;
}
