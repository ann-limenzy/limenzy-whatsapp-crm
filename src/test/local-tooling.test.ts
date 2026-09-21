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
      // Two permitted shapes and no others: the pinned Supabase CLI, or a
      // repository-local Node runner. A global binary, an absolute path or npx
      // is rejected.
      const pinnedCli = /^supabase /.test(command);
      const localRunner = /^node scripts\/[a-z0-9-]+\.mjs$/.test(command);
      expect(`${name}: ${pinnedCli || localRunner}`).toBe(`${name}: true`);
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

describe("local runtime-role provisioning", () => {
  it("exposes a dedicated npm script using the pinned Node runner", async () => {
    const { scripts } = await packageJson();
    expect(scripts["db:role:local"]).toBe("node scripts/db-role-local.mjs");
  });

  it("does not chain provisioning into db:reset", async () => {
    // Kept separate and explicit: a hidden credential rotation inside a reset
    // would be surprising, and nesting npm scripts invites recursion.
    const { scripts } = await packageJson();
    expect(scripts["db:reset"]).not.toContain("db:role:local");
    expect(scripts["db:reset"]).not.toContain("npm run");
  });

  it("keeps the documented reset sequence in the developer guide", async () => {
    const guide = await readRepoFile("docs/local-development.md");
    const order = [
      "npm run db:start",
      "npm run db:reset",
      "npm run db:role:local",
      "npm run test:db",
      "npm run db:stop",
    ];
    let cursor = -1;
    for (const step of order) {
      const at = guide.indexOf(step, cursor + 1);
      expect(at, `${step} must appear, in order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("adds no MIGRATION_DATABASE_URL credential", async () => {
    const example = await readRepoFile(".env.example");
    expect(example).not.toMatch(/^MIGRATION_DATABASE_URL=/m);
    expect(example).not.toMatch(/^#\s*MIGRATION_DATABASE_URL=/m);
  });

  it("documents DATABASE_URL as an empty server-only entry", async () => {
    const example = await readRepoFile(".env.example");
    expect(example).toMatch(/^DATABASE_URL=$/m);
    expect(example).not.toMatch(/^NEXT_PUBLIC_DATABASE_URL/m);
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

describe("dedicated live-database verification", () => {
  it("exposes a database-only test command", async () => {
    const { scripts } = await packageJson();
    expect(scripts["test:db"]).toBeDefined();
    expect(scripts["test:db"]).toContain("scripts/test-db.mjs");
  });

  it("runs only the database suite", async () => {
    const runner = await readRepoFile("scripts/test-db.mjs");
    expect(runner).toContain("src/server/db/schema.test.ts");
    // It must not fall back to the whole suite, which would hide a skip.
    expect(runner).not.toMatch(/vitest[^\n]*run['"\s,\]]*$/m);
  });

  it("cannot report success when the database suite skips", async () => {
    const runner = await readRepoFile("scripts/test-db.mjs");
    // Every one of these is a documented failure mode of the command.
    expect(runner).toContain("REQUIRE_DATABASE_TESTS");
    expect(runner).toMatch(/numPendingTests/);
    expect(runner).toMatch(/total === 0/);
    expect(runner).toMatch(/pending > 0/);
    // ...and each one exits non-zero.
    expect(runner).toContain("process.exit(1)");
  });

  it("makes the suite throw rather than skip when verification is required", async () => {
    const suite = await readRepoFile("src/server/db/schema.test.ts");
    expect(suite).toContain('process.env.REQUIRE_DATABASE_TESTS === "1"');
    // The throw must happen at module load, so the file cannot collect green.
    expect(suite).toMatch(/if \(REQUIRED\) \{[\s\S]{0,400}throw new Error/);
  });

  it("never prints the connection string", async () => {
    const runner = await readRepoFile("scripts/test-db.mjs");
    // No log or error path may interpolate the value.
    for (const line of runner.split("\n")) {
      if (!/console\.(log|error|warn)|fail\(/.test(line)) continue;
      expect(line).not.toMatch(/\$\{url\}/);
      expect(line).not.toMatch(/\$\{connectionString/);
    }
    expect(runner).not.toMatch(/console\.\w+\([^)]*\burl\b/);
  });

  it("keeps the ordinary suite usable without a database", async () => {
    const { scripts } = await packageJson();
    // `npm test` stays plain vitest: no REQUIRE_DATABASE_TESTS, so the schema
    // suite skips instead of failing on a machine with no local stack.
    expect(scripts.test).toBe("vitest run");
    expect(scripts.test).not.toContain("REQUIRE_DATABASE_TESTS");
  });
});

describe("the 1C-B migration file", () => {
  const readMigrations = async () => {
    const names = (await readdir("supabase/migrations")).filter((n) =>
      n.endsWith(".sql"),
    );
    const files = await Promise.all(
      names.map(async (name) => ({
        name,
        sql: await readRepoFile(`supabase/migrations/${name}`),
      })),
    );
    return files;
  };

  /**
   * Migration SQL with `--` comments removed.
   *
   * Structural assertions must read the statements, not the prose: a comment
   * that names a forbidden pattern in order to explain why it is absent should
   * not fail the check. Credential scanning deliberately still reads the whole
   * file, comments included.
   */
  const readMigrationSql = async () =>
    (await readMigrations())
      .map((f) =>
        f.sql
          .split("\n")
          .map((line) => line.replace(/--.*$/, ""))
          .join("\n"),
      )
      .join("\n");

  it("is timestamped and descriptively named", async () => {
    const files = await readMigrations();
    expect(files.length).toBeGreaterThan(0);
    for (const { name } of files) {
      expect(name).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
  });

  it("is the only applied migration history", async () => {
    // A second history under drizzle/ would diverge silently; the directory is
    // git-ignored scratch output and must never be committed.
    const tracked = await readdir(".");
    expect(tracked).toContain("supabase");
    const gitignore = await readRepoFile(".gitignore");
    expect(gitignore).toContain("/drizzle/");
  });

  it("creates only the approved 1C-B objects", async () => {
    const sql = (await readMigrations()).map((f) => f.sql).join("\n");
    const created = [
      ...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi),
    ]
      .map((m) => m[1])
      .sort();
    expect(created).toEqual([
      "user_profiles",
      "workspace_memberships",
      "workspaces",
    ]);
  });

  it("creates no out-of-scope business table", async () => {
    const sql = (await readMigrationSql()).toLowerCase();
    for (const forbidden of [
      "sales_team",
      "lead_assignment",
      "create table public.leads",
      "create table public.customers",
      "follow_up",
      "renewal",
      "whatsapp",
      "workspace_invitations",
      "workspace_modules",
      "workspace_role_permissions",
    ]) {
      expect(sql).not.toContain(forbidden);
    }
  });

  it("enables row level security on every table it creates", async () => {
    const sql = (await readMigrations()).map((f) => f.sql).join("\n");
    for (const table of [
      "workspaces",
      "user_profiles",
      "workspace_memberships",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${table}\\s+enable row level security`,
          "i",
        ),
      );
    }
  });

  it("defines no permissive policy", async () => {
    // Phase 2 legitimately adds policies, so the invariant is not "no policy"
    // but "no policy that waves everything through": no USING (true), no
    // WITH CHECK (true), and every policy scoped to a named role.
    const sql = (await readMigrationSql()).toLowerCase();
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/);
    expect(sql).not.toMatch(/with\s+check\s*\(\s*true\s*\)/);

    const policies = [...sql.matchAll(/create policy\s+(\S+)[\s\S]*?;/g)];
    for (const [statement, name] of policies) {
      expect(
        `${name} is role-scoped: ${/\bto\s+limenzy_\w+/.test(statement)}`,
      ).toBe(`${name} is role-scoped: true`);
      // Phase 2 grants the runtime role only; bootstrap policies are Phase 3.
      expect(statement).not.toContain("to limenzy_bootstrap");
    }
  });

  it("avoids destructive statements", async () => {
    const sql = (await readMigrationSql()).toLowerCase();
    for (const destructive of [
      "drop table",
      "drop schema",
      "truncate",
      "delete from",
      "drop database",
    ]) {
      expect(sql).not.toContain(destructive);
    }
  });

  it("does not touch Supabase's own schemas", async () => {
    const sql = (await readMigrationSql()).toLowerCase();
    // Referencing auth.users with a foreign key is fine; altering it is not.
    expect(sql).not.toMatch(/create table auth\./);
    expect(sql).not.toMatch(/alter table auth\./);
    expect(sql).not.toMatch(/(create|alter|drop) schema (auth|storage)/);
  });

  it("carries no credential, environment identifier or client data", async () => {
    for (const { sql } of await readMigrations()) {
      expect(sql).not.toMatch(/sb_(secret|publishable)_[A-Za-z0-9_-]+/);
      expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
      expect(sql).not.toMatch(/postgres(ql)?:\/\/[^\s]+/);
      expect(sql.toLowerCase()).not.toContain("fincare");
      // No hard-coded row identifiers: the migration creates structure only.
      expect(sql).not.toMatch(/insert into public\./i);
    }
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
