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

  it("allows exactly three files, each only for what it needs", async () => {
    const allowed = Object.keys(ALLOWED).sort();
    expect(allowed).toEqual([
      "src/server/db/client.ts",
      "src/server/db/identity.ts",
      "src/server/db/tenant.ts",
    ]);
    // Identity resolution gets the pool and nothing else: it must not be able
    // to import the driver or mint a tenant context.
    expect(ALLOWED["src/server/db/identity.ts"]).toEqual(["the runtime pool"]);
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
    // The directory-wide exemption must not come back.
    expect(config).not.toContain('"src/server/db/**"');
  });

  it("keeps the runtime client server-only and off the tooling connection", async () => {
    const client = await readSourceWithoutComments("src/server/db/client.ts");
    expect(client).toContain('import "server-only"');
    expect(client).toContain("prepare: false");
    expect(client).not.toContain("DRIZZLE_TOOLING_DATABASE_URL");
    expect(client).toContain("databaseEnv");
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
