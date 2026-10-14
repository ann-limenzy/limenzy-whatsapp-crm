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

/**
 * A legacy Supabase `anon` / `service_role` key is a JWT: three
 * base64url segments separated by dots, starting with the `{"alg":` header.
 * Matched structurally rather than decoded — the point is to refuse it, not
 * to read it.
 */
const LEGACY_JWT = /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .min(1, "must be set")
    .url("must be a valid URL, for example https://<project-ref>.supabase.co"),
  /**
   * Publishable key (`sb_publishable_…`) from Project Settings → API Keys.
   *
   * This is the current Supabase key model and the only one this application
   * supports; the legacy `anon` JWT is not accepted under a second name.
   *
   * The refusal below is the important part. A publishable key is meant to be
   * public, but a SECRET key pasted into this browser-exposed variable would
   * bypass Row Level Security for every visitor — and would be inlined into
   * the JavaScript bundle, so the mistake is unrecoverable once shipped.
   * Failing the build is cheap; the alternative is not.
   */
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "must be set")
    .refine((value) => !value.startsWith("sb_secret_"), {
      message:
        "looks like a SECRET key — that must never be exposed to the browser; " +
        "use the publishable key (sb_publishable_...)",
    })
    /**
     * Reject the legacy `anon` JWT outright.
     *
     * The legacy key model is not supported under any variable name. A JWT
     * accepted here would appear to work while carrying a different trust
     * model from the one the rest of the application assumes, and the local
     * Supabase stack still prints legacy keys alongside the current ones —
     * so this is a mistake that is genuinely easy to make by copy-and-paste.
     */
    .refine((value) => !LEGACY_JWT.test(value), {
      message:
        "looks like a legacy anon/service_role JWT — that key model is not " +
        "supported; use the current publishable key (sb_publishable_...)",
    })
    .refine((value) => value.startsWith("sb_publishable_"), {
      message:
        "must be a current Supabase publishable key beginning with " +
        "'sb_publishable_'",
    }),
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

/**
 * The application's runtime database connection (Milestone 1C-C).
 *
 * Deliberately NOT part of `serverEnv()`: it is validated only when database
 * functionality is actually invoked, so `next build`, lint, typecheck and the
 * ordinary unit suite keep working on a machine with no local database.
 *
 * There is no fallback: this reads `DATABASE_URL` and nothing else. The local
 * tooling connection is a superuser that bypasses row-level security, so using
 * it at runtime would silently delete the database half of tenant isolation.
 *
 * Production code deliberately does not even read the tooling variable's name —
 * comparing against it here would be ineffective anyway, since that variable
 * does not exist in production. Instead the refinement below rejects a
 * superuser/owner account outright, and the live suite asserts that the two
 * connection strings resolve to genuinely different authorities.
 */
/**
 * The one role the application is permitted to connect as, and the only
 * protocols this project uses.
 *
 * An allow-list, not a deny-list: there is exactly one approved runtime role,
 * so enumerating forbidden ones would be both longer and weaker — a role added
 * later would pass by default.
 */
const RUNTIME_ROLE = "limenzy_app";
const RUNTIME_PROTOCOLS = new Set(["postgres:", "postgresql:"]);

/**
 * The project-reference half of a Supabase shared-pooler username.
 *
 * Supabase documents the pooler username as `[ROLE].[PROJECT-REF]` — a direct
 * or dedicated-pooler connection uses the plain role name, and only the shared
 * pooler carries the suffix. What the docs do **not** specify anywhere is the
 * project reference's own grammar: the published examples are twenty lowercase
 * alphanumerics, but that is an example, not a stated rule.
 *
 * **This pattern is therefore this application's accepted syntax, not a
 * Supabase guarantee.** It is modelled on those observed examples: lowercase
 * ASCII letters and digits, at least one character, no second separator. The
 * length is deliberately not pinned, because turning an example into a
 * twenty-character rule would reject a legitimate project if a reference of
 * another length were ever issued. If Supabase publishes a grammar, this is
 * the single place to tighten.
 *
 * `(?![\s\S])` rather than a bare `$`: it asserts that **nothing at all**
 * follows, under any flags. A plain `$` is correct here today — in JavaScript,
 * without the `m` flag, it already matches only the true end of input, unlike
 * the Perl and Python dialects where it also matches before a final newline —
 * but that correctness depends on a flag nobody has added yet. The explicit
 * form keeps the guarantee local to the pattern, so adding `m` later cannot
 * quietly let a trailing `\n`, `\r`, `\r\n`, U+2028 or U+2029 through.
 */
const POOLER_PROJECT_REF = /^[a-z0-9]+(?![\s\S])/;

/**
 * Whether a connection username names the approved runtime role.
 *
 * Parsed structurally, never by `startsWith` or `includes`: the role is
 * compared as a whole segment, so `limenzy_app2`, `limenzy_app_admin` and
 * `xlimenzy_app.ref` are all refused. Exactly two forms are accepted —
 * `limenzy_app`, and `limenzy_app.<project-ref>` for the shared pooler.
 *
 * A worked example of what the suffix is NOT: `limenzy_app.limenzy_owner` is
 * refused because `limenzy_owner` contains an underscore and so fails the
 * project-reference syntax — not because the suffix could have selected
 * another role. It could not: the pooler reads the role from the half before
 * the dot, and the half after it names a project.
 *
 * Syntax only. That a URL names this role proves nothing about which role the
 * database actually authenticates, which privileges it holds, or which project
 * it belongs to; the live suite asserts those against a real connection.
 */
function isApprovedRuntimeUsername(username: string): boolean {
  if (username === RUNTIME_ROLE) return true;

  const separator = username.indexOf(".");
  if (separator === -1) return false;
  if (username.slice(0, separator) !== RUNTIME_ROLE) return false;

  // Anything after the first dot must be one project reference and nothing
  // else, so a second dot fails here rather than being quietly accepted.
  return POOLER_PROJECT_REF.test(username.slice(separator + 1));
}

/** Parse without ever surfacing the value. Returns null when unparseable. */
function parseConnectionUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const databaseSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "must be set")
    .refine((value) => parseConnectionUrl(value) !== null, {
      message: "must be a valid connection URL",
    })
    .refine(
      (value) => {
        const url = parseConnectionUrl(value);
        return url !== null && RUNTIME_PROTOCOLS.has(url.protocol);
      },
      {
        message: "must use the postgres:// or postgresql:// scheme",
      },
    )
    .refine(
      (value) => {
        const url = parseConnectionUrl(value);
        if (url === null) return false;
        let username: string;
        try {
          username = decodeURIComponent(url.username);
        } catch {
          // Malformed percent-encoding is refused, and the value it could not
          // decode is never surfaced.
          return false;
        }
        return isApprovedRuntimeUsername(username);
      },
      {
        message:
          `must connect as the ${RUNTIME_ROLE} runtime role — not a ` +
          "superuser, the schema owner, or any other account. Use " +
          `\`${RUNTIME_ROLE}\` for a direct connection, or ` +
          `\`${RUNTIME_ROLE}.<project-ref>\` for the Supabase shared pooler. ` +
          "Locally, run `npm run db:role:local` to provision it.",
      },
    ),

  /**
   * PEM text of the certificate authority that signs the database server's
   * certificate. Server-only: it must never carry a `NEXT_PUBLIC_` prefix.
   *
   * Optional **here**, and required in practice for every host that is not an
   * explicit loopback literal. That rule is enforced where the connection is
   * actually built, in `server/db/tls.ts`, because it depends on the host —
   * and so is the authoritative parse, which uses `node:crypto`'s
   * X509Certificate. This module is imported by browser code for
   * `publicEnv()`, so it stays free of Node built-ins; the check below is
   * only "present means non-empty".
   *
   * It is a PUBLIC certificate, not a secret: no private key, no password.
   */
  DATABASE_CA_CERT: z.string().min(1, "must not be empty when set").optional(),
});

export type DatabaseEnv = z.infer<typeof databaseSchema>;

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

export class EnvConfigurationError extends Error {
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      "Supabase is not configured. Missing or invalid environment " +
        `variable(s): ${missing.join(", ")}. ` +
        "Copy .env.example to .env.local and provide the values from your " +
        "Supabase project (Project Settings → API Keys). Restart the dev " +
        "server afterwards; NEXT_PUBLIC_* values are inlined at build time.",
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
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
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

let databaseCache: DatabaseEnv | null = null;

/**
 * Read the runtime database configuration.
 *
 * Called only by the server-side database client, so nothing that does not
 * touch the database ever requires it to be set.
 */
export function databaseEnv(): DatabaseEnv {
  if (databaseCache) return databaseCache;
  const parsed = databaseSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    // An empty string is "not configured", not "configured as empty" — the
    // same treatment NEXT_PUBLIC_SITE_URL already gets.
    DATABASE_CA_CERT: process.env.DATABASE_CA_CERT || undefined,
  });
  if (!parsed.success) {
    throw new EnvConfigurationError(describeIssues(parsed.error));
  }
  databaseCache = parsed.data;
  return databaseCache;
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
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
] as const;

export const OPTIONAL_ENV = ["NEXT_PUBLIC_SITE_URL"] as const;

/** Test seam: clears memoised values so a test can vary the environment. */
export function resetEnvCacheForTests(): void {
  publicCache = null;
  serverCache = null;
  databaseCache = null;
}
