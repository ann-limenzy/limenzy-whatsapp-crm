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

/**
 * A TypeScript file with its comments removed.
 *
 * Structural assertions must read the code, not the prose. A comment that names
 * a forbidden identifier in order to explain why it is forbidden is documentation
 * working as intended, and failing the build for it would push people towards
 * writing vaguer comments. Credential scanning still reads whole files.
 */
const readSourceWithoutComments = async (path: string) =>
  (await readRepoFile(path))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const isTestFile = (path: string) =>
  /\.test\.tsx?$/.test(path) || path.startsWith("src/test/");

/**
 * The complete production tree: every file under `src/` that is not a test.
 *
 * Shared by every contract below, so a rule about "production code" always
 * means the same set of files and no directory can quietly fall out of scope.
 */
const productionSources = async (): Promise<string[]> => {
  const walk = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return walk(path);
        if (!/\.tsx?$/.test(entry.name)) return [];
        return isTestFile(path) ? [] : [path];
      }),
    );
    return nested.flat();
  };
  return walk("src");
};

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
    // A live suite that the runner does not know about would skip silently
    // under `npm test` and never be verified at all.
    expect(runner).toContain("src/server/db/identity.test.ts");
    expect(runner).toContain("src/server/auth/workspace-context.db.test.ts");
    expect(runner).toContain("src/server/db/bootstrap.test.ts");
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
      // Every policy names exactly one application role — the runtime role for
      // reads and the workspace update (Phase 2), or the bootstrap role for
      // first-tenancy creation (Phase 4C-1). Never both, and never a role a
      // browser can reach.
      const roles = [...statement.matchAll(/\bto\s+(limenzy_\w+)/g)].map(
        (m) => m[1],
      );
      expect(`${name} roles: ${roles.join(",")}`).toBe(
        `${name} roles: ${roles[0] ?? "NONE"}`,
      );
      expect(
        roles[0] === "limenzy_app" || roles[0] === "limenzy_bootstrap",
      ).toBe(true);
      for (const forbidden of [
        "anon",
        "authenticated",
        "service_role",
        "public",
      ]) {
        expect(
          `${name} reaches ${forbidden}: ${statement.includes(`to ${forbidden}`)}`,
        ).toBe(`${name} reaches ${forbidden}: false`);
      }
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

      // No seed data: a migration creates structure, never rows. The INSERTs
      // inside the Phase 4C-1 routine body are not seed data — they run only
      // when a verified user onboards — so the check is applied to the
      // statements *outside* any function body.
      const outsideBodies = sql
        .split(/\$fn\$|\$\$/)
        .filter((_, index) => index % 2 === 0)
        .join("\n");
      expect(outsideBodies).not.toMatch(/insert into public\./i);
      expect(outsideBodies).not.toMatch(/\bvalues\s*\(/i);
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

describe("the tenant gateway import boundary", () => {
  /**
   * The exact files allowed to reach a restricted import, and which ones.
   *
   * Per file AND per pattern: being on this list exempts a module from the one
   * thing it genuinely needs, never from the rest. No directory is exempt, so
   * any future repository or service under `src/server/db/` is scanned exactly
   * like anything else.
   */
  const ALLOWED: Record<string, readonly string[]> = {
    // Creates the pool: the one place the driver may be imported.
    "src/server/db/client.ts": ["the postgres driver", "a Drizzle client"],
    // The gateway: consumes the pool and the context marker.
    "src/server/db/tenant.ts": ["the runtime pool", "the context constructor"],
    // Identity-scoped resolution: consumes the pool, and nothing else.
    "src/server/db/identity.ts": ["the runtime pool"],
    // Workspace selection: the one module that may mint a tenant context,
    // because it is the one that validates the choice against memberships read
    // under row-level security. It never touches the pool.
    "src/server/auth/workspace-context.ts": ["the context constructor"],
  };

  const productionFiles = productionSources;

  /** Files that must not match a given forbidden pattern. */
  const filesRestrictedFor = async (label: string) =>
    (await productionFiles()).filter(
      (path) => !(ALLOWED[path] ?? []).includes(label),
    );

  const FORBIDDEN = [
    { label: "the postgres driver", pattern: /from\s+["']postgres["']/ },
    {
      label: "a Drizzle client",
      pattern: /from\s+["']drizzle-orm\/postgres-js["']/,
    },
    {
      label: "the runtime pool",
      pattern: /from\s+["'][^"']*\bclient["']/,
    },
    {
      label: "the context constructor",
      pattern: /from\s+["'][^"']*\btenant-context["']/,
    },
    {
      label: "the tooling connection",
      pattern: /DRIZZLE_TOOLING_DATABASE_URL/,
    },
  ];

  it("scans the whole production tree, excluding only tests", async () => {
    const files = await productionFiles();
    expect(files.length).toBeGreaterThan(10);
    // The database layer is scanned, not skipped: that is the point of the
    // exact allow-list replacing the old directory-wide exclusion.
    const dbLayer = files.filter((f) => f.startsWith("src/server/db/"));
    expect(dbLayer.length).toBeGreaterThan(0);
    expect(dbLayer).toContain("src/server/db/client.ts");
    expect(dbLayer).toContain("src/server/db/tenant.ts");
  });

  it("allows exactly four files, each only for what it needs", async () => {
    const allowed = Object.keys(ALLOWED).sort();
    expect(allowed).toEqual([
      "src/server/auth/workspace-context.ts",
      "src/server/db/client.ts",
      "src/server/db/identity.ts",
      "src/server/db/tenant.ts",
    ]);
    // Identity resolution gets the pool and nothing else: it must not be able
    // to import the driver or mint a tenant context.
    expect(ALLOWED["src/server/db/identity.ts"]).toEqual(["the runtime pool"]);
    // Workspace selection is the mirror image: the constructor, and no path to
    // the database of its own.
    expect(ALLOWED["src/server/auth/workspace-context.ts"]).toEqual([
      "the context constructor",
    ]);
    // Every exemption must name a pattern that actually exists.
    const labels = FORBIDDEN.map((entry) => entry.label);
    for (const exemptions of Object.values(ALLOWED)) {
      for (const label of exemptions) expect(labels).toContain(label);
    }
    // Every allow-listed path must actually exist, or the list is stale.
    for (const path of allowed) {
      await expect(readRepoFile(path)).resolves.toBeTruthy();
    }
  });

  it.each(FORBIDDEN)(
    "keeps $label out of every file not explicitly allowed it",
    async ({ label, pattern }) => {
      const offenders: string[] = [];
      for (const file of await filesRestrictedFor(label)) {
        const contents = await readSourceWithoutComments(file);
        if (pattern.test(contents)) offenders.push(file);
      }
      expect(offenders).toEqual([]);
    },
  );

  it("detects an unauthorized file placed inside src/server/db", async () => {
    // A fixture rather than a real file: proves the scan would catch a future
    // repository added to the database directory, without leaving one behind.
    const hypothetical =
      'import postgres from "postgres";\nexport const x = postgres;';
    const path = "src/server/db/repositories/workspaces.ts";
    expect(path in ALLOWED).toBe(false);
    expect(isTestFile(path)).toBe(false);
    const driverRule = FORBIDDEN[0];
    expect(driverRule).toBeDefined();
    expect(driverRule!.pattern.test(hypothetical)).toBe(true);
  });

  it("exposes exactly one gateway and no alternate pool entry point", async () => {
    const gateway = await readSourceWithoutComments("src/server/db/tenant.ts");
    expect(gateway).toContain("export async function withTenant");
    // There must be no second function accepting an arbitrary pool/client.
    expect(gateway).not.toContain("runWithTenantOn");
    // The exported function surface is exactly this — enumerated rather than
    // pattern-matched, so a second gateway cannot slip in under a new name.
    const exportedFunctions = [
      ...gateway.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g),
    ].map((match) => match[1]);
    expect(exportedFunctions.sort()).toEqual(["withTenant"]);
    // No exported function may take a pool or client as a parameter.
    expect(gateway).not.toMatch(/export[^\n]*\(\s*sql\s*:/i);
    expect(gateway).not.toMatch(/export[^\n]*:\s*RuntimeSql/);
    // Transaction-local, never session-global; no bypass of any kind.
    expect(gateway).toMatch(/set_config\([^)]*true\)/);
    expect(gateway).not.toMatch(/\bSET\s+app\./i);
    expect(gateway).not.toMatch(/security\s+definer/i);
    expect(gateway).not.toContain("service_role");
  });

  it("has no runWithTenantOn anywhere in production source", async () => {
    const offenders: string[] = [];
    for (const file of await productionFiles()) {
      if ((await readRepoFile(file)).includes("runWithTenantOn")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("exports no test-only pool setter from a production module", async () => {
    for (const path of Object.keys(ALLOWED)) {
      const source = await readSourceWithoutComments(path);
      expect(source).not.toMatch(/export[^\n]*\bset\w*Pool\w*\b/i);
      expect(source).not.toMatch(/export[^\n]*\bForTests?\b/);
    }
  });

  it("enforces the boundary through ESLint as well as by convention", async () => {
    const config = await readRepoFile("eslint.config.mjs");
    expect(config).toContain("no-restricted-imports");
    expect(config).toContain("no-restricted-syntax");
    for (const restricted of [
      '"postgres"',
      '"drizzle-orm/postgres-js"',
      "server/db/client",
      "server/db/tenant-context",
      "DRIZZLE_TOOLING_DATABASE_URL",
    ]) {
      expect(config).toContain(restricted);
    }
    // The directory-wide exemption must not come back — in either directory.
    expect(config).not.toContain('"src/server/db/**"');
    expect(config).not.toContain('"src/server/auth/**"');
  });

  it("keeps the runtime client server-only and off the tooling connection", async () => {
    const client = await readSourceWithoutComments("src/server/db/client.ts");
    expect(client).toContain('import "server-only"');
    expect(client).toContain("prepare: false");
    expect(client).not.toContain("DRIZZLE_TOOLING_DATABASE_URL");
    expect(client).toContain("databaseEnv");
  });
});

describe("the initial-workspace bootstrap migration", () => {
  const BOOTSTRAP =
    "supabase/migrations/20260921064437_workspace_bootstrap.sql";
  const EARLIER = [
    "supabase/migrations/20260919045005_workspace_foundation.sql",
    "supabase/migrations/20260919073002_tenant_roles.sql",
    "supabase/migrations/20260921025321_tenant_rls.sql",
  ];

  /** The migration's statements, comments stripped, lower-cased. */
  const statements = async () =>
    (await readRepoFile(BOOTSTRAP))
      .split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n")
      .toLowerCase();

  /** The body of the routine, between its $fn$ delimiters. */
  const routineBody = async () => {
    const sql = await statements();
    const body = sql.split("as $fn$")[1]?.split("$fn$;")[0];
    expect(body).toBeDefined();
    return body ?? "";
  };

  it("adds exactly one migration and edits none of the earlier three", async () => {
    const names = (await readdir("supabase/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort();
    expect(names).toHaveLength(4);
    expect(names[3]).toBe("20260921064437_workspace_bootstrap.sql");

    // The bootstrap work lives entirely in the new file: none of the earlier
    // three mentions the routine, the new policies or the new grants. (That
    // they are byte-identical is a Git fact, verified outside the suite.)
    for (const path of EARLIER) {
      const sql = (await readRepoFile(path)).toLowerCase();
      expect(sql).not.toContain("create_initial_workspace");
      expect(sql).not.toContain("_bootstrap_insert");
      expect(sql).not.toContain("_bootstrap_select");
      expect(sql).not.toMatch(/grant\s+insert/);
    }
  });

  it("declares exactly the six business parameters, and no identity", async () => {
    const sql = await statements();
    const signature = sql
      .split("create or replace function app.create_initial_workspace(")[1]
      ?.split(")")[0];
    expect(signature).toBeDefined();

    const params = (signature ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    expect(params).toEqual([
      "p_full_name      text",
      "p_workspace_name text",
      "p_business_type  text",
      "p_country        text",
      "p_currency       text",
      "p_time_zone      text",
    ]);

    // Nothing identity- or authorisation-shaped may be a parameter.
    for (const forbidden of [
      "auth",
      "uuid",
      "profile",
      "workspace_id",
      "membership",
      "role",
      "status",
    ]) {
      expect(`${forbidden}: ${(signature ?? "").includes(forbidden)}`).toBe(
        `${forbidden}: false`,
      );
    }
  });

  it("reads identity only from the verified transaction setting", async () => {
    const body = await routineBody();
    expect(body).toContain("app.current_auth_user_id()");
    // A caller could not supply it even if it wanted to.
    expect(body).not.toMatch(/p_auth|p_user|p_profile|p_role|p_status/);
    // And it refuses when the setting is absent.
    expect(body).toContain("no verified identity");
  });

  it("is the only bootstrap routine, and uses no dynamic SQL", async () => {
    const sql = await statements();
    expect(sql.match(/create or replace function/g) ?? []).toHaveLength(1);
    expect(sql).not.toMatch(/create\s+(or\s+replace\s+)?procedure/);

    const body = await routineBody();
    // No EXECUTE, no format(), no string-built statement of any kind.
    expect(body).not.toMatch(/\bexecute\b/);
    expect(body).not.toMatch(/\bformat\s*\(/);
    expect(body).not.toMatch(/quote_ident|quote_literal/);
  });

  it("schema-qualifies every object it touches", async () => {
    const body = await routineBody();
    // Tables.
    for (const table of [
      "user_profiles",
      "workspaces",
      "workspace_memberships",
    ]) {
      const occurrences = body.split(table).length - 1;
      const qualified = body.split(`public.${table}`).length - 1;
      expect(`${table}: ${qualified}/${occurrences}`).toBe(
        `${table}: ${occurrences}/${occurrences}`,
      );
    }
    // Built-ins.
    for (const fn of [
      "gen_random_uuid",
      "hashtextextended",
      "pg_advisory_xact_lock",
      "btrim",
      "count",
    ]) {
      expect(`${fn} qualified`).toBe(
        body.includes(`pg_catalog.${fn}`) ? `${fn} qualified` : `${fn} BARE`,
      );
    }
    // And the search path is pinned empty, so nothing can be shadowed.
    expect(await statements()).toContain("set search_path = ''");
  });

  it("revokes PUBLIC before granting EXECUTE, and grants it only to limenzy_app", async () => {
    const sql = await statements();
    const revoke = sql.indexOf(
      "revoke all on function app.create_initial_workspace",
    );
    const grant = sql.indexOf(
      "grant execute on function app.create_initial_workspace",
    );
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
    expect(sql).toContain("from public;");

    // Exactly one EXECUTE grant on the routine, and it names the runtime role.
    const grants = [
      ...sql.matchAll(
        /grant execute on function app\.create_initial_workspace\([^)]*\)\s*to\s+(\w+)/g,
      ),
    ].map((m) => m[1]);
    expect(grants).toEqual(["limenzy_app"]);
  });

  it("gives the runtime role no new table privilege", async () => {
    const sql = await statements();
    // Every INSERT grant in this migration goes to the bootstrap role, and
    // every one of them is column-scoped.
    const inserts = [
      ...sql.matchAll(/grant insert\s*(\([^)]*\))?[\s\S]*?to\s+(\w+)/g),
    ];
    expect(inserts.length).toBeGreaterThan(0);
    for (const match of inserts) {
      expect(match[2]).toBe("limenzy_bootstrap");
      expect(match[1]).toBeDefined(); // column list present
    }
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete)[^;]*to\s+limenzy_app/,
    );
    expect(sql).not.toMatch(
      /to\s+(anon|authenticated|service_role|public)\s*;/,
    );
  });

  it("adds five policies, all scoped to limenzy_bootstrap and none permissive-by-default", async () => {
    const sql = await statements();
    const policies = [
      ...sql.matchAll(/create policy (\w+) on ([\w.]+)\s+for (\w+) to (\w+)/g),
    ].map((m) => ({ name: m[1], table: m[2], cmd: m[3], role: m[4] }));

    expect(policies.map((p) => `${p.name}:${p.cmd}:${p.role}`).sort()).toEqual([
      "user_profiles_bootstrap_insert:insert:limenzy_bootstrap",
      "user_profiles_bootstrap_select:select:limenzy_bootstrap",
      "workspace_memberships_bootstrap_insert:insert:limenzy_bootstrap",
      "workspace_memberships_bootstrap_select:select:limenzy_bootstrap",
      "workspaces_bootstrap_insert:insert:limenzy_bootstrap",
    ]);

    // No blanket predicate anywhere in the file.
    expect(sql.replace(/\s+/g, " ")).not.toMatch(
      /using \( true \)|using \(true\)/,
    );
    expect(sql.replace(/\s+/g, " ")).not.toMatch(
      /with check \( true \)|with check \(true\)/,
    );
    // Each policy is dropped before it is recreated, matching the Phase 2 style.
    expect(sql.match(/drop policy if exists/g) ?? []).toHaveLength(5);
  });

  it("withdraws the temporary CREATE on schema app", async () => {
    const sql = await statements();
    const granted = sql.indexOf(
      "grant create on schema app to limenzy_bootstrap",
    );
    const revoked = sql.indexOf(
      "revoke create on schema app from limenzy_bootstrap",
    );
    expect(granted).toBeGreaterThan(-1);
    expect(revoked).toBeGreaterThan(granted);
    // The membership needed for the ownership transfer goes to the migration
    // executor, never to the runtime role.
    expect(sql).toContain(
      "grant limenzy_bootstrap to current_user with set option",
    );
    expect(sql).not.toMatch(/grant\s+limenzy_bootstrap\s+to\s+limenzy_app/);
  });

  it("is additive and destroys nothing", async () => {
    const sql = await statements();
    for (const forbidden of [
      "drop table",
      "drop schema",
      "drop role",
      "truncate",
      "delete from",
      "alter table public.workspaces disable",
      "no force row level security",
    ]) {
      expect(`${forbidden}: ${sql.includes(forbidden)}`).toBe(
        `${forbidden}: false`,
      );
    }

    // The routine's INSERTs are inside its body; nothing outside it writes a
    // row, so the migration seeds nothing.
    const outsideBody = sql
      .split("$fn$")
      .filter((_, i) => i % 2 === 0)
      .join("\n");
    expect(outsideBody).not.toContain("insert into public.");
    // No service-role path: the statements must not grant it anything. A
    // comment naming it in order to explain why it is excluded is
    // documentation working as intended, so this reads the statements while
    // the credential scan below reads the whole file.
    expect(sql).not.toMatch(/service_role/);

    const raw = await readRepoFile(BOOTSTRAP);
    for (const forbidden of [
      "sb_secret",
      "sb_publishable",
      "postgresql://",
      "postgres://",
    ]) {
      expect(`${forbidden}: ${raw.includes(forbidden)}`).toBe(
        `${forbidden}: false`,
      );
    }
    expect(raw).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
    // No password literal: the bootstrap path needs no credential at all.
    expect(raw).not.toMatch(/password\s*[:=]/i);
  });

  it("adds no TypeScript caller, route, component or context path in this phase", async () => {
    // Phase 4C-1 is the database only. The server operation is 4C-2 and the
    // form is 4C-3, so nothing in the production tree may reference the
    // routine yet — which also means no production test seam was introduced.
    const offenders: string[] = [];
    for (const file of await productionSources()) {
      const source = await readRepoFile(file);
      if (source.includes("create_initial_workspace")) offenders.push(file);
    }
    expect(offenders).toEqual([]);

    // And the context-constructor allow-list is unchanged: no new module may
    // mint a tenant context as part of this phase.
    const config = await readRepoFile("eslint.config.mjs");
    expect(config).toContain(
      'workspaceContext: "src/server/auth/workspace-context.ts"',
    );
    expect(config).not.toMatch(/bootstrap[^\n]*:\s*"src\//);
  });

  it("is explained where a developer will look for it", async () => {
    const guide = await readRepoFile("docs/local-development.md");
    expect(guide).toContain("app.create_initial_workspace");
    for (const phrase of [
      "limenzy_bootstrap",
      "already_onboarded",
      "access_unavailable",
      "advisory lock",
    ]) {
      expect(guide).toContain(phrase);
    }
  });
});

describe("workspace selection treats the candidate as a preference", () => {
  const MODULE = "src/server/auth/workspace-context.ts";

  const selectionSource = () => readSourceWithoutComments(MODULE);

  it("exposes one resolver whose only parameter is the candidate", async () => {
    const source = await selectionSource();
    const exportedFunctions = [
      ...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g),
    ].map((match) => match[1]);
    expect(exportedFunctions.sort()).toEqual(["resolveWorkspaceContext"]);
    // Typed `unknown` precisely because it is expected to arrive from a cookie
    // or a URL one day: nothing about it is trusted.
    expect(source).toMatch(
      /export\s+async\s+function\s+resolveWorkspaceContext\s*\(\s*candidate\?:\s*unknown,?\s*\)/,
    );
    expect(source).not.toMatch(/export\s+const\s+\w+\s*=\s*(async\s*)?\(/);
  });

  it("accepts no identity, role, pool, client or transaction", async () => {
    const source = await selectionSource();
    for (const forbidden of [
      /export[^\n]*\bauthUserId\s*[:?]/,
      /export[^\n]*\buserProfileId\s*[:?]/,
      /export[^\n]*\brole\s*[:?]\s*(string|WorkspaceRole)/,
      /export[^\n]*\(\s*sql\s*:/i,
      /export[^\n]*\(\s*tx\s*:/i,
      /export[^\n]*:\s*Runtime(Sql|Tx)/,
      /export[^\n]*:\s*TenantTx/,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });

  it("reaches the database only through Phase 4A", async () => {
    const source = await selectionSource();
    expect(source).toContain('import "server-only"');
    expect(source).toContain("resolveVerifiedIdentity");
    for (const forbidden of [
      'from "postgres"',
      "drizzle-orm/postgres-js",
      "server/db/client",
      "runtimeSql",
      "DRIZZLE_TOOLING_DATABASE_URL",
      "service_role",
      "SERVICE_ROLE",
      "set_config",
      "public.workspaces",
      "public.workspace_memberships",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("reads no request and performs no navigation", async () => {
    const source = await selectionSource();
    for (const forbidden of [
      "cookies(",
      "headers(",
      "redirect(",
      "NextRequest",
      "NextResponse",
      "next/navigation",
      "next/headers",
      "searchParams",
      "formData",
      "revalidatePath",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // Nor anything from the UI or the route tree.
    expect(source).not.toMatch(/from\s+["']@\/(app|components)\//);
  });

  it("mints the context only through the reviewed constructor", async () => {
    const source = await selectionSource();
    expect(source).toContain("createTenantContext");
    // Exactly one construction site, and it is not building the object itself.
    expect((source.match(/createTenantContext\(/g) ?? []).length).toBe(1);
    expect(source).not.toMatch(/as\s+unknown\s+as\s+TenantContext/);
    expect(source).not.toMatch(/as\s+TenantContext\b/);
    // Its three values are named fields, not a spread of caller input.
    expect(source).toMatch(/createTenantContext\(\{[\s\S]{0,400}authUserId:/);
    expect(source).not.toMatch(/createTenantContext\(\s*\.\.\./);
  });

  it("keeps no selected workspace, role or membership between requests", async () => {
    const source = await selectionSource();
    // Module-level bindings are `const` only; the frozen results are values,
    // not state.
    const moduleLevel = source
      .split("\n")
      .filter((line) => /^(let|var)\s+\w/.test(line));
    expect(moduleLevel).toEqual([]);
    for (const forbidden of [
      "unstable_cache",
      "globalThis",
      "AsyncLocalStorage",
      "new Map(",
      "WeakMap",
      "process.env",
      "ForTest",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("adds no migration to the applied history", async () => {
    const migrations = (await readdir("supabase/migrations")).filter((name) =>
      name.endsWith(".sql"),
    );
    // Phase 4B is application code over the Phase 2 policies, exactly as 4A was.
    expect(migrations.sort()).toEqual([
      "20260919045005_workspace_foundation.sql",
      "20260919073002_tenant_roles.sql",
      "20260921025321_tenant_rls.sql",
      "20260921064437_workspace_bootstrap.sql",
    ]);
  });

  it("is explained where a developer will look for it", async () => {
    const guide = await readRepoFile("docs/local-development.md");
    expect(guide).toContain("resolveWorkspaceContext");
    for (const phrase of [
      "access_unavailable",
      "workspace_selection_required",
      "a preference, never authorization",
    ]) {
      expect(guide).toContain(phrase);
    }
  });
});

describe("identity resolution takes no identity from its caller", () => {
  const MODULE = "src/server/db/identity.ts";

  const identitySource = () => readSourceWithoutComments(MODULE);

  it("exports a resolver that declares no parameters", async () => {
    const source = await identitySource();
    expect(source).toMatch(
      /export\s+async\s+function\s+resolveVerifiedIdentity\s*\(\s*\)/,
    );
  });

  it("exports nothing that accepts an identity, pool, client or transaction", async () => {
    const source = await identitySource();
    // Enumerated rather than pattern-matched, so a second entry point cannot
    // arrive under a name a regex happens not to cover.
    const exportedFunctions = [
      ...source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g),
    ].map((match) => match[1]);
    expect(exportedFunctions.sort()).toEqual(["resolveVerifiedIdentity"]);

    // Nor a const arrow function standing in for one.
    expect(source).not.toMatch(/export\s+const\s+\w+\s*=\s*(async\s*)?\(/);

    // No exported signature may take any of these.
    for (const forbidden of [
      /export[^\n]*\(\s*sql\s*:/i,
      /export[^\n]*\(\s*tx\s*:/i,
      /export[^\n]*:\s*RuntimeSql/,
      /export[^\n]*:\s*RuntimeTx/,
      /export[^\n]*:\s*TenantTx/,
      /export[^\n]*\bauthUserId\s*:\s*string\s*\)/,
      /export[^\n]*\bworkspaceId\s*:/,
    ]) {
      expect(source).not.toMatch(forbidden);
    }
  });

  it("offers no test seam, setter, environment branch or second resolver", async () => {
    const source = await identitySource();
    expect(source).not.toMatch(/export[^\n]*\bForTests?\b/);
    expect(source).not.toMatch(
      /export[^\n]*\bset\w*(Pool|User|Identity)\w*\b/i,
    );
    expect(source).not.toMatch(/\b__\w+__\b/);
    // Behaviour must not change with the environment.
    expect(source).not.toContain("process.env");
    expect(source).not.toMatch(/NODE_ENV|VERCEL|CI\b/);
    // And there is exactly one of it.
    expect((source.match(/resolveVerifiedIdentity/g) ?? []).length).toBe(1);
  });

  it("reads identity only from the verified-claims utility", async () => {
    const source = await identitySource();
    expect(source).toContain("getAuthenticatedUser");
    // Browser-controlled inputs are not consulted here at all.
    for (const forbidden of [
      "cookies(",
      "headers(",
      "searchParams",
      "NextRequest",
      "formData",
      "request",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("introduces no unverified authentication call anywhere in production", async () => {
    const offenders: string[] = [];
    for (const file of await productionSources()) {
      const source = await readSourceWithoutComments(file);
      if (/\.auth\.(getSession|getUser)\s*\(/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
    // The one supported path is still the verified one.
    const verifier = await readSourceWithoutComments(
      "src/server/auth/require-user.ts",
    );
    expect(verifier).toContain("getClaims(");
  });

  it("cannot mint a tenant context or select a workspace in this slice", async () => {
    const source = await identitySource();
    expect(source).not.toContain("createTenantContext");
    expect(source).not.toContain("withTenant");
    expect(source).not.toMatch(/from\s+["'][^"']*\btenant(-context)?["']/);
    // The workspace setting is never written, so no workspace row is readable.
    expect(source).not.toContain("app.workspace_id");
    expect(source).not.toMatch(/set_config\([^)]*workspace/i);
    // And the result type carries no workspace selection to be mistaken for one.
    expect(source).not.toMatch(
      /\b(currentWorkspace|selectedWorkspace|defaultWorkspace)\b/,
    );
  });

  it("uses only the runtime connection, with no elevation of any kind", async () => {
    const source = await identitySource();
    expect(source).toContain('import "server-only"');
    expect(source).toMatch(/from\s+["']\.\/client["']/);
    for (const forbidden of [
      "DRIZZLE_TOOLING_DATABASE_URL",
      "SERVICE_ROLE",
      "service_role",
      "limenzy_bootstrap",
      "limenzy_owner",
      "security definer",
      "SECURITY DEFINER",
      "set role",
      "auth.users",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("writes nothing and reads only the two identity tables", async () => {
    const source = await identitySource();
    // The generic form — `tx<{ id: string }[]>` — is the one that reads data,
    // so a pattern that missed it would check only the set_config calls.
    const statements = [...source.matchAll(/tx(?:<[^`]*?>)?`([\s\S]*?)`/g)].map(
      (match) => (match[1] ?? "").replace(/\s+/g, " ").trim(),
    );
    expect(statements).toHaveLength(4);
    for (const statement of statements) {
      expect(statement).toMatch(/^select\b/i);
      expect(statement).not.toMatch(
        /\b(insert|update|delete|merge|truncate|copy|alter|drop|grant)\b/i,
      );
    }
    // Only these two tables, so no business data is within reach.
    const tables = [...source.matchAll(/from\s+public\.(\w+)/g)].map(
      (match) => match[1],
    );
    expect([...new Set(tables)].sort()).toEqual([
      "user_profiles",
      "workspace_memberships",
    ]);
    // Transaction-local settings only, never a session-wide SET.
    expect(source).toMatch(/set_config\([^)]*true\)/);
    expect(source).not.toMatch(/\bSET\s+app\./i);
  });

  it("keeps no request state or cache between requests", async () => {
    const source = await identitySource();
    // No module-level mutable binding: `const` declarations only.
    const moduleLevel = source
      .split("\n")
      .filter((line) => /^(let|var)\s+\w/.test(line));
    expect(moduleLevel).toEqual([]);
    for (const forbidden of [
      "unstable_cache",
      "globalThis",
      "AsyncLocalStorage",
      "new Map(",
      "WeakMap",
      "revalidate",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("adds no migration to the applied history", async () => {
    const migrations = (await readdir("supabase/migrations")).filter((name) =>
      name.endsWith(".sql"),
    );
    // Phase 4A is application code over the Phase 2 policies: the three
    // reviewed migrations are still the whole history.
    expect(migrations.sort()).toEqual([
      "20260919045005_workspace_foundation.sql",
      "20260919073002_tenant_roles.sql",
      "20260921025321_tenant_rls.sql",
      "20260921064437_workspace_bootstrap.sql",
    ]);
  });

  it("is explained where a developer will look for it", async () => {
    const guide = await readRepoFile("docs/local-development.md");
    expect(guide).toContain("resolveVerifiedIdentity");
    for (const phrase of [
      "does not select a workspace",
      "Phase 4B",
      "Phase 4C",
    ]) {
      expect(guide).toContain(phrase);
    }
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
      const contents = await readSourceWithoutComments(file);
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
