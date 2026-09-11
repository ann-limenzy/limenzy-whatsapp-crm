import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  EnvConfigurationError,
  isSupabaseConfigured,
  OPTIONAL_ENV,
  publicEnv,
  REQUIRED_PUBLIC_ENV,
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
const KEY_VALUE = "sb-anon-key-value-that-must-never-be-printed";

const saved = { ...process.env };

beforeEach(() => {
  resetEnvCacheForTests();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEY_VALUE;
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
      expect(missing.join(" ")).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
      expect(missing.join(" ")).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
    }
  });

  it("never puts a value in the error", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    try {
      publicEnv();
      throw new Error("expected publicEnv to throw");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain("not-a-url");
      expect(message).not.toContain(KEY_VALUE);
    }
  });

  it("rejects a URL that is not a URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "abcdefghijklmnop.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEY_VALUE;
    expect(() => publicEnv()).toThrow(EnvConfigurationError);
  });

  it("returns the validated pair", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEY_VALUE;
    expect(publicEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: URL_VALUE,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: KEY_VALUE,
    });
  });

  it("memoises, so validation is not repeated per request", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEY_VALUE;
    const first = publicEnv();
    expect(publicEnv()).toBe(first);
  });

  it("exposes no server secret", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEY_VALUE;
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

describe("documented variable names", () => {
  it("lists what an operator must provide", () => {
    expect([...REQUIRED_PUBLIC_ENV]).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
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
});
