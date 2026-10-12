import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  EnvConfigurationError,
  OPTIONAL_ENV,
  REQUIRED_PUBLIC_ENV,
  databaseEnv,
  isSupabaseConfigured,
  publicEnv,
  resetEnvCacheForTests,
  serverEnv,
} from "@/lib/env";

/**
 * Environment validation.
 *
 * Two things matter here: an unconfigured deployment must fail with the exact
 * variable names an operator can act on, and a failure must never include the
 * value of anything — a leaked key in a log or an error page is the whole
 * problem this module exists to avoid.
 */

const URL_VALUE = "https://abcdefghijklmnop.supabase.co";
const KEY_VALUE = "sb_publishable_value_that_must_never_be_printed";

const saved = { ...process.env };

beforeEach(() => {
  resetEnvCacheForTests();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

afterEach(() => {
  process.env = { ...saved };
  resetEnvCacheForTests();
});

describe("isSupabaseConfigured", () => {
  it("is false when nothing is set", () => {
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("is false when only one of the pair is set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("is true once both are set", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = KEY_VALUE;
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("does not throw — the proxy relies on that", () => {
    expect(() => isSupabaseConfigured()).not.toThrow();
  });
});

describe("publicEnv", () => {
  it("names every missing variable", () => {
    try {
      publicEnv();
      throw new Error("expected publicEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvConfigurationError);
      const message = (error as EnvConfigurationError).message;
      for (const name of REQUIRED_PUBLIC_ENV) {
        expect(message).toContain(name);
      }
    }
  });

  it("names only the one that is missing", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    try {
      publicEnv();
      throw new Error("expected publicEnv to throw");
    } catch (error) {
      const { missing } = error as EnvConfigurationError;
      expect(missing.join(" ")).toContain(
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      );
      expect(missing.join(" ")).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
    }
  });

  it("never puts a value in the error", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "";
    try {
      publicEnv();
      throw new Error("expected publicEnv to throw");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("not-a-url");
      expect(message).not.toContain(KEY_VALUE);
    }
  });

  it("refuses a secret key in the browser-exposed variable", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_secret_abcdef123456";
    // This would otherwise be inlined into the JavaScript bundle and hand
    // every visitor a key that bypasses Row Level Security.
    expect(() => publicEnv()).toThrow(EnvConfigurationError);
  });

  it("names the variable, not the secret, when it refuses one", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_secret_abcdef123456";
    try {
      publicEnv();
      throw new Error("expected publicEnv to throw");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
      expect(message).not.toContain("abcdef123456");
    }
  });

  it("accepts a publishable key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_abc123";
    expect(publicEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(
      "sb_publishable_abc123",
    );
  });

  it("rejects a URL that is not a URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "abcdefghijklmnop.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = KEY_VALUE;
    expect(() => publicEnv()).toThrow(EnvConfigurationError);
  });

  it("returns the validated pair", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = KEY_VALUE;
    expect(publicEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: URL_VALUE,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: KEY_VALUE,
    });
  });

  it("memoises, so validation is not repeated per request", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = KEY_VALUE;
    const first = publicEnv();
    expect(publicEnv()).toBe(first);
  });

  it("exposes no server secret", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = KEY_VALUE;
    // Everything reachable from the browser bundle must carry the prefix.
    for (const key of Object.keys(publicEnv())) {
      expect(key.startsWith("NEXT_PUBLIC_")).toBe(true);
    }
  });
});

describe("serverEnv", () => {
  it("treats the site URL as optional", () => {
    expect(serverEnv().NEXT_PUBLIC_SITE_URL).toBeUndefined();
  });

  it("treats an empty string as unset rather than invalid", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "";
    expect(() => serverEnv()).not.toThrow();
  });

  it("rejects a site URL that is not absolute", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "crm.example.com";
    expect(() => serverEnv()).toThrow(EnvConfigurationError);
  });

  it("accepts a valid site URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://crm.example.com";
    expect(serverEnv().NEXT_PUBLIC_SITE_URL).toBe("https://crm.example.com");
  });
});

describe("the legacy key model is not supported", () => {
  it("ignores NEXT_PUBLIC_SUPABASE_ANON_KEY entirely", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEY_VALUE;
    // Setting only the old name must not satisfy configuration: supporting
    // two names for one value is how a project ends up shipping the wrong key.
    expect(isSupabaseConfigured()).toBe(false);
    expect(() => publicEnv()).toThrow(EnvConfigurationError);
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  // The local Supabase stack prints legacy anon/service_role JWTs alongside
  // the current keys, so pasting the wrong one is an easy mistake. A JWT here
  // must fail loudly rather than appear to work under a different trust model.
  // Structurally shaped fake — not a real token from anywhere.
  const FAKE_LEGACY_JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ZmFrZS1wYXlsb2FkLW5vdC1hLXJlYWwta2V5.ZmFrZS1zaWduYXR1cmU";

  it("rejects a legacy JWT in the publishable-key variable", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = FAKE_LEGACY_JWT;
    expect(isSupabaseConfigured()).toBe(false);
    expect(() => publicEnv()).toThrow(EnvConfigurationError);
  });

  it("names the variable and explains why, without echoing the value", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = FAKE_LEGACY_JWT;
    try {
      publicEnv();
      expect.unreachable("publicEnv should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
      expect(message).toContain("legacy");
      expect(message).not.toContain(FAKE_LEGACY_JWT);
    }
  });

  it("rejects a malformed value that is neither form", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "not-a-supabase-key";
    expect(isSupabaseConfigured()).toBe(false);
    expect(() => publicEnv()).toThrow(EnvConfigurationError);
  });

  it("accepts the current publishable form", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = KEY_VALUE;
    expect(isSupabaseConfigured()).toBe(true);
    expect(() => publicEnv()).not.toThrow();
  });
});

describe("documented variable names", () => {
  it("lists what an operator must provide", () => {
    expect([...REQUIRED_PUBLIC_ENV]).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]);
    expect([...OPTIONAL_ENV]).toEqual(["NEXT_PUBLIC_SITE_URL"]);
  });

  it("matches what .env.example documents", async () => {
    const { readFile } = await import("node:fs/promises");
    const example = await readFile(".env.example", "utf8");
    for (const name of [...REQUIRED_PUBLIC_ENV, ...OPTIONAL_ENV]) {
      expect(example).toContain(name);
    }
  });

  it("leaves no legacy key name in .env.example", async () => {
    const { readFile } = await import("node:fs/promises");
    const example = await readFile(".env.example", "utf8");
    expect(example).not.toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(example).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(example).toContain("SUPABASE_SECRET_KEY");
  });

  it("documents the server-only secret without giving it a value", async () => {
    const { readFile } = await import("node:fs/promises");
    const example = await readFile(".env.example", "utf8");
    // Commented out: it is not needed until Milestone 1C, and an uncommented
    // empty secret invites someone to fill it in on the browser-safe side.
    expect(example).toMatch(/#\s*SUPABASE_SECRET_KEY=/);
    expect(example).not.toMatch(/^SUPABASE_SECRET_KEY=.+$/m);
  });
});

describe("databaseEnv", () => {
  // Fixtures only. No real password or host appears in this file.
  const url = (user: string, scheme = "postgresql") =>
    `${scheme}://${user}:FixturePasswordNotReal@127.0.0.1:54322/postgres`;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.DRIZZLE_TOOLING_DATABASE_URL;
  });

  it("is not required by the rest of the configuration", () => {
    // Lazy on purpose: build, lint, typecheck and the ordinary unit suite must
    // work on a machine with no database and no .env.local.
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = KEY_VALUE;
    expect(isSupabaseConfigured()).toBe(true);
    expect(() => publicEnv()).not.toThrow();
    expect(() => serverEnv()).not.toThrow();
  });

  it("throws only when the database is actually used", () => {
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);
  });

  it.each(["postgres", "postgresql"])("accepts the %s:// scheme", (scheme) => {
    process.env.DATABASE_URL = url("limenzy_app", scheme);
    expect(databaseEnv().DATABASE_URL).toBe(url("limenzy_app", scheme));
  });

  it.each(["mysql", "http", "https", "postgres+ssh", "file"])(
    "rejects the %s:// scheme",
    (scheme) => {
      process.env.DATABASE_URL = url("limenzy_app", scheme);
      expect(() => databaseEnv()).toThrow(EnvConfigurationError);
    },
  );

  it.each([
    "postgres",
    "supabase_admin",
    "limenzy_owner",
    "limenzy_bootstrap",
    "service_role",
    "authenticated",
    "anon",
    "limenzy_app2",
    "LIMENZY_APP",
  ])("rejects the %s role", (user) => {
    process.env.DATABASE_URL = url(user);
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);
  });

  /**
   * Supabase documents the shared-pooler username as `[ROLE].[PROJECT-REF]`;
   * direct and dedicated-pooler connections use the plain role name. These
   * cases pin both forms, and — more importantly — the near-misses that must
   * not pass as a result.
   *
   * Syntax only: none of this proves which role the database authenticates.
   */
  const pooled = (user: string) =>
    `postgresql://${user}:FixturePasswordNotReal@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

  it.each([
    "abcdefghijklmnopqrst",
    "xvljpkujuwroxcuvossw",
    "abc123def456ghi789jk",
    "a",
  ])("accepts the shared-pooler form for project ref %s", (ref) => {
    process.env.DATABASE_URL = pooled(`limenzy_app.${ref}`);
    expect(databaseEnv().DATABASE_URL).toBe(pooled(`limenzy_app.${ref}`));
  });

  it("still accepts the plain role on a direct connection", () => {
    process.env.DATABASE_URL = url("limenzy_app");
    expect(() => databaseEnv()).not.toThrow();
  });

  it.each([
    // A privileged or arbitrary role does not become acceptable by acquiring
    // a project-ref suffix.
    "postgres.abcdefghijklmnopqrst",
    "supabase_admin.abcdefghijklmnopqrst",
    "limenzy_owner.abcdefghijklmnopqrst",
    "limenzy_bootstrap.abcdefghijklmnopqrst",
    "service_role.abcdefghijklmnopqrst",
    "anon.abcdefghijklmnopqrst",
  ])("rejects the suffixed %s role", (user) => {
    process.env.DATABASE_URL = pooled(user);
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);
  });

  it.each([
    // Empty, repeated or malformed suffixes.
    "limenzy_app.",
    "limenzy_app..abcdefghijklmnopqrst",
    "limenzy_app.abcdefghijklmnopqrst.extra",
    "limenzy_app.ABCDEFGHIJKLMNOPQRST",
    "limenzy_app.abc-def",
    "limenzy_app.abc_def",
    "limenzy_app.abc def",
    "limenzy_app. abcdefghijklmnopqrst",
    // Deceptive near-matches on the role half.
    ".limenzy_app",
    "limenzy_app2.abcdefghijklmnopqrst",
    "xlimenzy_app.abcdefghijklmnopqrst",
    "limenzy_app_admin.abcdefghijklmnopqrst",
    "LIMENZY_APP.abcdefghijklmnopqrst",
    "limenzy_app.limenzy_owner",
  ])("rejects the malformed or deceptive username %s", (user) => {
    process.env.DATABASE_URL = pooled(user);
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);
  });

  it("reads the suffix as a project reference, never as a second role", () => {
    /**
     * `limenzy_app.postgres` is accepted, and that is correct rather than a
     * gap: in `[ROLE].[PROJECT-REF]` the authority is decided by the half
     * BEFORE the dot, which is the approved runtime role. The suffix names a
     * project, so a project reference that happens to read like a role name
     * grants nothing. `postgres.<ref>` — the role half actually being
     * `postgres` — is refused above.
     */
    process.env.DATABASE_URL = pooled("limenzy_app.postgres");
    expect(() => databaseEnv()).not.toThrow();

    // The first call memoises, so the cache is cleared before asserting the
    // mirror image — otherwise the second expectation would read the first
    // result and pass for the wrong reason.
    resetEnvCacheForTests();
    process.env.DATABASE_URL = pooled("postgres.limenzy_app");
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);
  });

  it("accepts a percent-encoded pooler username", () => {
    // `limenzy_app.abcdefghijklmnopqrst` with the underscore encoded.
    process.env.DATABASE_URL = pooled("limenzy%5Fapp.abcdefghijklmnopqrst");
    expect(() => databaseEnv()).not.toThrow();
  });

  /**
   * Line terminators smuggled in through percent-encoding.
   *
   * A RAW newline never survives: WHATWG URL parsing strips tab, LF and CR
   * from the input, so `limenzy_app.abc\ndef` arrives as `limenzy_app.abcdef`.
   * The encoded forms do survive parsing and only become terminators after
   * `decodeURIComponent`, which is exactly where the project-reference syntax
   * has to hold. U+2028 and U+2029 are included because they are line
   * terminators to a JavaScript regex engine even though the URL parser leaves
   * them alone.
   */
  it.each([
    ["LF", "%0A"],
    ["CR", "%0D"],
    ["CRLF", "%0D%0A"],
    ["U+2028", "%E2%80%A8"],
    ["U+2029", "%E2%80%A9"],
  ])(
    "rejects a trailing encoded %s in the project reference",
    (_name, tail) => {
      const value = pooled(`limenzy_app.abcdefghijklmnopqrst${tail}`);
      process.env.DATABASE_URL = value;

      try {
        databaseEnv();
        expect.unreachable("databaseEnv should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(EnvConfigurationError);
        const message = (error as Error).message;
        expect(message).toContain("DATABASE_URL");
        // Sanitized: neither the smuggled sequence nor anything else from the URL.
        expect(message).not.toContain(tail);
        expect(message).not.toContain(value);
        expect(message).not.toContain("FixturePasswordNotReal");
        expect(message).not.toContain("pooler.supabase.com");
        expect(/[\u000A\u000D\u2028\u2029]/.test(message)).toBe(false);
      }
    },
  );

  it.each([
    ["LF", "%0A"],
    ["CR", "%0D"],
    ["U+2028", "%E2%80%A8"],
    ["U+2029", "%E2%80%A9"],
  ])("rejects a leading or embedded encoded %s too", (_name, mid) => {
    process.env.DATABASE_URL = pooled(`limenzy_app.${mid}abcdefghijklmnopqrst`);
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);

    resetEnvCacheForTests();
    process.env.DATABASE_URL = pooled(`limenzy_app.abcdef${mid}ghijklmnop`);
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);
  });

  it("rejects an encoded separator that would smuggle a second dot", () => {
    // `%2E` decodes to ".", so this is `limenzy_app..ref` once decoded.
    process.env.DATABASE_URL = pooled("limenzy_app%2E.abcdefghijklmnopqrst");
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);
  });

  it("rejects malformed percent-encoding without echoing it", () => {
    const malformed = pooled("limenzy_app%ZZ.abcdefghijklmnopqrst");
    process.env.DATABASE_URL = malformed;
    try {
      databaseEnv();
      expect.unreachable("databaseEnv should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).not.toContain("%ZZ");
      expect(message).not.toContain("FixturePasswordNotReal");
      expect(message).not.toContain("pooler.supabase.com");
    }
  });

  it("adds no query-parameter or option bypass", () => {
    process.env.DATABASE_URL = `${pooled("postgres.abcdefghijklmnopqrst")}?options=-c%20role%3Dlimenzy_app`;
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);
  });

  it("keeps the pooler form subject to every other rule", () => {
    // Scheme is still checked.
    process.env.DATABASE_URL = pooled(
      "limenzy_app.abcdefghijklmnopqrst",
    ).replace("postgresql://", "mysql://");
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);
  });

  it("rejects an empty username", () => {
    process.env.DATABASE_URL =
      "postgresql://:FixturePasswordNotReal@127.0.0.1:54322/postgres";
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);
    process.env.DATABASE_URL = "postgresql://127.0.0.1:54322/postgres";
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);
  });

  it("accepts a percent-encoded form of the approved role", () => {
    process.env.DATABASE_URL =
      "postgresql://limenzy%5Fapp:FixturePasswordNotReal@127.0.0.1:54322/postgres";
    expect(() => databaseEnv()).not.toThrow();
  });

  it("rejects a value that is not a URL at all", () => {
    process.env.DATABASE_URL = "not a connection string";
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);
  });

  it("never falls back to the tooling connection", () => {
    process.env.DRIZZLE_TOOLING_DATABASE_URL = url("postgres");
    // Tooling set, runtime absent: must still fail rather than borrow it.
    expect(() => databaseEnv()).toThrow(EnvConfigurationError);
  });

  it("names the variable in errors without echoing its value", () => {
    const secretish = url("postgres");
    process.env.DATABASE_URL = secretish;
    try {
      databaseEnv();
      expect.unreachable("databaseEnv should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("DATABASE_URL");
      expect(message).not.toContain(secretish);
      expect(message).not.toContain("FixturePasswordNotReal");
      expect(message).not.toContain("127.0.0.1");
    }
  });
});
