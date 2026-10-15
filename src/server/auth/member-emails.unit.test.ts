import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The restricted Auth Admin boundary — spec §159.
 *
 * This module is the only holder of a project-wide privileged credential, so
 * what it does NOT do matters as much as what it does. These tests pin both:
 * the states it reports, the concurrency and cancellation it promises, and the
 * operations it must never perform.
 */

const getUserById = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn());
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const URL_VALUE = "https://project-ref.supabase.co";
const SECRET = "sb_secret_localtestvalue";

const { emailsForAuthUsers } = await import("./member-emails");
const { resetEnvCacheForTests } = await import("@/lib/env");

const ID = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;

/** A file's source with comments removed, so prose cannot trip a scan. */
async function codeOf(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(path, "utf8");
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** The captured `global.fetch` the module hands to the client, if any. */
let capturedFetch: typeof fetch | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  resetEnvCacheForTests();
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_VALUE;
  process.env.SUPABASE_SECRET_KEY = SECRET;
  capturedFetch = undefined;
  createClient.mockImplementation((_url, _key, options) => {
    capturedFetch = options?.global?.fetch;
    return { auth: { admin: { getUserById } } };
  });
  getUserById.mockImplementation(async (id: string) => ({
    data: { user: { id, email: `${id}@example.com` } },
    error: null,
  }));
});

afterEach(() => {
  delete process.env.SUPABASE_SECRET_KEY;
  resetEnvCacheForTests();
});

describe("resolving addresses", () => {
  it("returns one address per id", async () => {
    const result = await emailsForAuthUsers([ID(1), ID(2)]);
    expect(result.status).toBe("ok");
    expect(result.emails.get(ID(1))).toBe(`${ID(1)}@example.com`);
    expect(result.emails.get(ID(2))).toBe(`${ID(2)}@example.com`);
  });

  it("asks for each id exactly once, even when one repeats", async () => {
    await emailsForAuthUsers([ID(1), ID(1), ID(2)]);
    expect(getUserById).toHaveBeenCalledTimes(2);
  });

  it("does nothing at all for an empty list", async () => {
    const result = await emailsForAuthUsers([]);
    expect(result).toEqual({ status: "ok", emails: new Map() });
    expect(createClient).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
  });

  it("records an account with no address as null, not as a failure", async () => {
    getUserById.mockResolvedValue({
      data: { user: { email: null } },
      error: null,
    });
    const result = await emailsForAuthUsers([ID(1)]);
    expect(result.status).toBe("ok");
    expect(result.emails.get(ID(1))).toBeNull();
  });
});

describe("the states it reports", () => {
  it("reports not_configured when no secret key is set", async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    resetEnvCacheForTests();
    const result = await emailsForAuthUsers([ID(1)]);
    expect(result).toEqual({ status: "not_configured", emails: new Map() });
    // The decisive assertion: it did not try, so no request left the server.
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reports not_configured for a legacy service_role JWT", async () => {
    process.env.SUPABASE_SECRET_KEY =
      "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoieCJ9.sig";
    resetEnvCacheForTests();
    expect((await emailsForAuthUsers([ID(1)])).status).toBe("not_configured");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reports unavailable when nothing resolves", async () => {
    getUserById.mockResolvedValue({ data: null, error: { message: "boom" } });
    const result = await emailsForAuthUsers([ID(1), ID(2)]);
    expect(result.status).toBe("unavailable");
    expect(result.emails.size).toBe(0);
  });

  it("reports partial when some resolve and some do not", async () => {
    getUserById.mockImplementation(async (id: string) =>
      id === ID(1)
        ? { data: { user: { email: "one@example.com" } }, error: null }
        : { data: null, error: { message: "boom" } },
    );
    const result = await emailsForAuthUsers([ID(1), ID(2)]);
    expect(result.status).toBe("partial");
    expect(result.emails.get(ID(1))).toBe("one@example.com");
    expect(result.emails.has(ID(2))).toBe(false);
  });

  it("never throws, whatever the client does", async () => {
    getUserById.mockRejectedValue(new Error("socket hang up"));
    // A missing address must not take the Users screen down with it.
    await expect(emailsForAuthUsers([ID(1)])).resolves.toEqual({
      status: "unavailable",
      emails: new Map(),
    });
  });
});

describe("concurrency and cancellation", () => {
  it("keeps at most six lookups in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    getUserById.mockImplementation(async (id: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { data: { user: { email: `${id}@example.com` } }, error: null };
    });

    const ids = Array.from({ length: 20 }, (_, i) => ID(i % 9));
    await emailsForAuthUsers([...new Set(ids)]);
    expect(peak).toBeLessThanOrEqual(6);
    expect(peak).toBeGreaterThan(1);
  });

  it("binds an abort signal to the client's own fetch", async () => {
    await emailsForAuthUsers([ID(1)]);
    expect(typeof capturedFetch).toBe("function");

    // The point of binding it here rather than passing it to getUserById —
    // which takes no options — is that an abort cancels the real request
    // instead of abandoning a promise with the socket still open.
    const realFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));
    await capturedFetch!("https://example.test/x");
    const init = realFetch.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    realFetch.mockRestore();
  });

  it("turns off session persistence on the admin client", async () => {
    await emailsForAuthUsers([ID(1)]);
    const options = createClient.mock.calls[0]?.[2];
    expect(options?.auth).toMatchObject({
      persistSession: false,
      autoRefreshToken: false,
    });
  });
});

describe("what it must never do", () => {
  it("builds a fresh client per batch rather than caching one", async () => {
    await emailsForAuthUsers([ID(1)]);
    await emailsForAuthUsers([ID(2)]);
    // A client closes over one request's abort signal, so reusing it across
    // requests would carry a dead signal into the next one.
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("caches no address across calls", async () => {
    await emailsForAuthUsers([ID(1)]);
    getUserById.mockResolvedValue({
      data: { user: { email: "changed@example.com" } },
      error: null,
    });
    const again = await emailsForAuthUsers([ID(1)]);
    // Privileged results must not outlive the authorisation that justified
    // them, so the second call asks again and sees the new value.
    expect(again.emails.get(ID(1))).toBe("changed@example.com");
    expect(getUserById).toHaveBeenCalledTimes(2);
  });

  it("uses no project-wide listing and no data access", async () => {
    // Read the CODE, not the comments. The module explains which operations
    // it excludes and why, and documentation saying "no listUsers" must not
    // read as a use of it.
    const source = await codeOf("src/server/auth/member-emails.ts");

    // A project-wide listing would return every user in the project, across
    // every workspace. The Data API accessors would bypass row-level security
    // with this key — exactly what the database separation prevents on every
    // other path. The write operations are the rest of what the key can do.
    for (const forbidden of [
      /\blistUsers\s*\(/,
      // `Array.from(` is unrelated to Supabase's query builder.
      /(?<!Array)\.from\s*\(/,
      /\.rpc\s*\(/,
      /\.storage\b/,
      /\bdeleteUser\s*\(/,
      /\bupdateUserById\s*\(/,
      /\bcreateUser\s*\(/,
      /\bgenerateLink\s*\(/,
      /\binviteUserByEmail\s*\(/,
    ]) {
      expect(`${forbidden.source}: ${forbidden.test(source)}`).toBe(
        `${forbidden.source}: false`,
      );
    }

    // …and it does use the one operation it is for.
    expect(source).toMatch(/\bgetUserById\s*\(/);
  });

  it("is server-only and reads the key from one place", async () => {
    const source = await codeOf("src/server/auth/member-emails.ts");
    expect(source).toContain('import "server-only"');
    expect(source).toContain("authAdminEnv");
    // No literal key, and no second route to one: the validated accessor is
    // the only way in, so a malformed or legacy key cannot slip past.
    expect(source).not.toMatch(/sb_secret_[A-Za-z0-9_-]+/);
    expect(source).not.toMatch(/process\.env\.SUPABASE_SECRET_KEY/);
  });

  it("is imported by exactly one module", async () => {
    const { readdir, readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const found: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) await walk(path);
        else if (
          /\.tsx?$/.test(entry.name) &&
          !/\.test\.tsx?$/.test(entry.name)
        ) {
          const source = await readFile(path, "utf8");
          if (source.includes("@/server/auth/member-emails")) {
            found.push(path.replace(/\\/g, "/"));
          }
        }
      }
    };
    await walk("src");
    // One consumer, and it is the page that authorises first. A second one
    // would mean a second place to get the ordering wrong.
    expect(found).toEqual(["src/app/(app)/settings/page.tsx"]);
  });
});
