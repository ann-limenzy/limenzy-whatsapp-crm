import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

/**
 * Guardrails for the Milestone 1C-A local development tooling.
 *
 * These assert the *rules* that keep local development safe and reproducible —
 * one migration history, the repository-pinned CLI, and no credential ever
 * reaching a committed file. They read repository files relative to the
 * process working directory (the repo root, where vitest runs), never an
 * absolute path on one developer's machine.
 *
 * No test here contains, asserts on, or prints a real key.
 */

const readRepoFile = (path: string) => readFile(path, "utf8");

const packageJson = async () =>
  JSON.parse(await readRepoFile("package.json")) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

describe("database package scripts", () => {
  it("provides the documented local lifecycle commands", async () => {
    const { scripts } = await packageJson();
    for (const name of ["db:start", "db:stop", "db:status", "db:reset"]) {
      expect(scripts[name]).toBeDefined();
    }
  });

  it("invokes the repository-pinned CLI, never a global one", async () => {
    const { scripts, devDependencies } = await packageJson();
    // `supabase` is a devDependency, so npm resolves it from node_modules/.bin.
    expect(devDependencies.supabase).toBeDefined();
    for (const [name, command] of Object.entries(scripts)) {
      if (!name.startsWith("db:")) continue;
      expect(command).toMatch(/^supabase /);
      // An absolute path would tie the script to one machine; npx --no-install
      // would bypass the pinned resolution this repository relies on.
      expect(command).not.toMatch(/^\//);
      expect(command).not.toContain("npx");
    }
  });

  it("pins the database toolchain to exact versions", async () => {
    const { dependencies, devDependencies } = await packageJson();
    const exact = /^\d+\.\d+\.\d+$/;
    expect(dependencies["drizzle-orm"]).toMatch(exact);
    expect(dependencies.postgres).toMatch(exact);
    expect(devDependencies["drizzle-kit"]).toMatch(exact);
    expect(devDependencies.supabase).toMatch(exact);
  });

  it("never targets a hosted project from a script", async () => {
    const { scripts } = await packageJson();
    for (const [name, command] of Object.entries(scripts)) {
      if (!name.startsWith("db:")) continue;
      expect(command).not.toContain("--linked");
      expect(command).not.toContain("--project-ref");
      expect(command).not.toContain("link");
    }
  });

  it("names the destructive command for what it does", async () => {
    const { scripts } = await packageJson();
    // Explicitly local, so it can never be pointed at a shared database.
    expect(scripts["db:reset"]).toContain("--local");
    expect(scripts["db:reset"]).toContain("reset");
  });

  it("has no drizzle-kit push script", async () => {
    // push mutates a database with no reviewable, replayable migration file.
    const { scripts } = await packageJson();
    for (const command of Object.values(scripts)) {
      expect(command).not.toContain("drizzle-kit push");
      expect(command).not.toContain("drizzle-kit migrate");
    }
  });

  it("offers no standalone seed command, because reset seeds", async () => {
    const { scripts } = await packageJson();
    expect(scripts["db:seed"]).toBeUndefined();
  });
});

describe("one applied migration history", () => {
  it("keeps supabase/migrations as the single source of truth", async () => {
    const config = await readRepoFile("supabase/config.toml");
    expect(config).toContain("[db.migrations]");
    // Drizzle's output directory must not be the applied history itself.
    // Only the `out:` value matters here -- the file's comments deliberately
    // discuss supabase/migrations.
    const drizzleConfig = await readRepoFile("drizzle.config.ts");
    const out = /^\s*out:\s*"([^"]+)"/m.exec(drizzleConfig)?.[1];
    expect(out).toBe("./drizzle");
    expect(out).not.toContain("supabase");
  });

  it("git-ignores Drizzle candidate output but not reviewed sources", async () => {
    // Compare against the actual ignore RULES; comment lines in .gitignore
    // legitimately name the paths that must stay tracked.
    const rules = (await readRepoFile(".gitignore"))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));

    expect(rules).toContain("/drizzle/");
    // Reviewed SQL must stay tracked: no rule may cover these.
    expect(rules).not.toContain("*.sql");
    for (const protectedPath of [
      "supabase/migrations/",
      "supabase/migrations",
      "supabase/seed.sql",
      "supabase/config.toml",
      "supabase/",
    ]) {
      expect(rules).not.toContain(protectedPath);
    }
  });

  it("documents the rule where a developer will look for it", async () => {
    const guide = await readRepoFile("docs/local-development.md");
    expect(guide).toContain("supabase/migrations/");
    expect(guide).toContain("drizzle-kit push");
  });
});

describe("local secrets stay out of the repository", () => {
  it("ignores environment and Supabase local state files", async () => {
    const gitignore = await readRepoFile(".gitignore");
    for (const rule of [
      ".env",
      ".env.local",
      "supabase/.env",
      "supabase/.temp/",
    ]) {
      expect(gitignore).toContain(rule);
    }
    // .env.example is the single deliberate exception.
    expect(gitignore).toContain("!.env.example");
  });

  it("keeps .env.example free of credential-shaped values", async () => {
    const example = await readRepoFile(".env.example");
    // Required names present...
    expect(example).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(example).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    // ...with no value assigned to any active variable.
    for (const line of example.split("\n")) {
      if (line.trimStart().startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator === -1) continue;
      expect(line.slice(separator + 1).trim()).toBe("");
    }
    // And no real key material of any shape.
    expect(example).not.toMatch(/sb_secret_[A-Za-z0-9_-]+/);
    expect(example).not.toMatch(/sb_publishable_[A-Za-z0-9_-]+/);
    expect(example).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
    expect(example).not.toMatch(/postgres(ql)?:\/\/[^\s]+/);
  });

  it("documents the tooling-only connection as tooling-only", async () => {
    const example = await readRepoFile(".env.example");
    expect(example).toMatch(/#\s*DRIZZLE_TOOLING_DATABASE_URL=/);
    expect(example).toContain("TOOLING ONLY");
  });
});

describe("production code does not use tooling credentials", () => {
  const TOOLING_ONLY = [
    "DRIZZLE_TOOLING_DATABASE_URL",
    "MIGRATION_DATABASE_URL",
  ];

  const collect = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return collect(path);
        // Test files name these variables deliberately; production code is
        // what must never read them.
        const isTest = /\.test\.tsx?$/.test(entry.name);
        return /\.tsx?$/.test(entry.name) && !isTest ? [path] : [];
      }),
    );
    return files.flat();
  };

  it("references them only in configuration, never in src/", async () => {
    const files = await collect("src");
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const contents = await readRepoFile(file);
      for (const name of TOOLING_ONLY) {
        expect(contents, `${file} must not read ${name}`).not.toContain(name);
      }
    }
  });

  it("keeps the schema barrel free of tables until 1C-B", async () => {
    const barrel = await readRepoFile("src/server/db/schema/index.ts");
    expect(barrel).not.toContain("pgTable");
  });
});

describe("safe seed data", () => {
  it("creates no rows and carries no identifying values", async () => {
    const seed = await readRepoFile("supabase/seed.sql");
    const statements = seed
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    expect(statements).not.toMatch(/\binsert\s+into\b/i);
    expect(statements).not.toMatch(/\bcreate\s+table\b/i);
    // No credential or contact material anywhere in the file, comments included.
    expect(seed).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
    expect(seed).not.toMatch(/sb_(secret|publishable)_[A-Za-z0-9_-]+/);
    expect(seed).not.toMatch(/postgres(ql)?:\/\/[^\s]+/);
  });
});

describe("local Supabase configuration", () => {
  it("uses the ports this project documents", async () => {
    const config = await readRepoFile("supabase/config.toml");
    expect(config).toMatch(/^project_id = "limenzy-crm"$/m);
    expect(config).toContain("port = 54321");
    expect(config).toContain("port = 54322");
    expect(config).toContain("port = 54323");
    expect(config).toContain("port = 54324");
  });

  it("matches the application's auth flow and routes", async () => {
    const config = await readRepoFile("supabase/config.toml");
    expect(config).toContain('site_url = "http://localhost:3000"');
    expect(config).toContain("http://localhost:3000/auth/confirm");
    expect(config).toContain("http://localhost:3000/auth/callback");
    // Email confirmation mirrors production; anonymous sign-in stays off.
    const auth = config.slice(config.indexOf("[auth.email]"));
    expect(auth).toMatch(/enable_confirmations = true/);
    expect(config).toMatch(/enable_anonymous_sign_ins = false/);
  });

  it("holds no remote project reference or credential", async () => {
    const config = await readRepoFile("supabase/config.toml");
    expect(config).not.toMatch(/project_ref\s*=/);
    expect(config).not.toMatch(/sb_(secret|publishable)_[A-Za-z0-9_-]+/);
    expect(config).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
  });
});
