// @vitest-environment node
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ROLE_NAME,
  buildRuntimeUrl,
  describeTarget,
  generatePassword,
  readEnvValue,
  upsertEnvValue,
  writeFileAtomic,
} from "../../scripts/db-role-local.mjs";

/**
 * Unit tests for the local runtime-role provisioning script.
 *
 * These assert the properties that keep a generated credential out of the
 * repository and out of the logs. The live half — that the ALTER ROLE actually
 * works — is covered by `src/server/db/roles.test.ts` through `npm run test:db`.
 *
 * No real password or connection string appears here; every value is a fixture.
 */

const scriptSource = async () =>
  readFile(new URL("../../scripts/db-role-local.mjs", import.meta.url), "utf8");

describe("role name", () => {
  it("is the fixed literal limenzy_app", () => {
    expect(ROLE_NAME).toBe("limenzy_app");
  });

  it("is never read from argv, the environment or a file", async () => {
    const source = await scriptSource();
    // The only assignment of ROLE_NAME is the literal.
    expect(source).toContain('export const ROLE_NAME = "limenzy_app";');
    const assignments = source.match(/ROLE_NAME\s*=/g) ?? [];
    expect(assignments).toHaveLength(1);
    // And it is not derived from any input channel.
    expect(source).not.toMatch(/ROLE_NAME\s*=\s*process\.(argv|env)/);
  });
});

describe("password generation", () => {
  it("produces a long password from a quote-free alphabet", () => {
    for (let i = 0; i < 50; i += 1) {
      const password = generatePassword();
      expect(password).toHaveLength(32);
      expect(password).toMatch(/^[A-Za-z0-9]{32}$/);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(seen.size).toBe(200);
  });
});

describe("SQL construction", () => {
  it("never concatenates SQL and never uses a parameterised DO block", async () => {
    const source = await scriptSource();
    // PostgreSQL's DO takes no parameters; the design must not pretend it does.
    expect(source).not.toMatch(/\bDO\s+\$\$/i);
    // The statement is built by the server through format(%I, %L).
    expect(source).toContain("pg_catalog.format");
    expect(source).toContain("%I");
    expect(source).toContain("%L");
    // No template-built ALTER ROLE anywhere.
    expect(source).not.toMatch(/`\s*ALTER ROLE \$\{/);
    expect(source).not.toMatch(/"ALTER ROLE " ?\+/);
  });

  it("suppresses statement logging around the change", async () => {
    const source = await scriptSource();
    expect(source).toContain("set local log_statement = 'none'");
    expect(source).toContain("set local log_min_duration_statement = -1");
  });

  it("never prints the password, the statement or a full URL", async () => {
    const source = await scriptSource();
    const printed = source
      .split("\n")
      .filter((line) => /console\.(log|error|warn)/.test(line));
    for (const line of printed) {
      expect(line).not.toMatch(/\bpassword\b(?!\s+was)/);
      expect(line).not.toMatch(/\$\{password\}/);
      expect(line).not.toMatch(/\$\{.*\bstmt\b.*\}/);
      expect(line).not.toMatch(/\$\{toolingUrl\}|\$\{runtimeUrl\}/);
    }
  });

  it("describes a target without credentials", () => {
    const target = describeTarget(
      "postgresql://someone:secret-value@127.0.0.1:54322/postgres",
    );
    expect(target).toBe("127.0.0.1:54322/postgres");
    expect(target).not.toContain("secret-value");
    expect(target).not.toContain("someone");
  });
});

describe("runtime URL construction", () => {
  it("keeps host, port and database, replacing only the credentials", () => {
    const url = buildRuntimeUrl(
      "postgresql://tooling:tooling-pw@127.0.0.1:54322/postgres",
      ROLE_NAME,
      "GeneratedPasswordFixture000000001",
    );
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.port).toBe("54322");
    expect(url.pathname).toBe("/postgres");
    expect(decodeURIComponent(url.username)).toBe("limenzy_app");
    expect(url.toString()).not.toContain("tooling-pw");
  });
});

describe(".env.local editing", () => {
  const FIXTURE = [
    "# a leading comment",
    "",
    "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
    "# an explanatory comment about the next value",
    "NEXT_PUBLIC_SITE_URL=http://localhost:3000",
    "DRIZZLE_TOOLING_DATABASE_URL=postgresql://fixture@127.0.0.1:54322/postgres",
    "",
  ].join("\n");

  it("appends the key when absent, preserving every other line", () => {
    const next = upsertEnvValue(FIXTURE, "DATABASE_URL", "postgresql://x@h/db");
    const before = FIXTURE.split("\n").filter(
      (l) => !l.startsWith("DATABASE_URL="),
    );
    const after = next
      .split("\n")
      .filter((l: string) => !l.startsWith("DATABASE_URL="));
    expect(after.join("\n").trim()).toBe(before.join("\n").trim());
    expect(readEnvValue(next, "DATABASE_URL")).toBe("postgresql://x@h/db");
  });

  it("replaces only that key on a rerun, in place", () => {
    const once = upsertEnvValue(FIXTURE, "DATABASE_URL", "postgresql://a@h/db");
    const twice = upsertEnvValue(once, "DATABASE_URL", "postgresql://b@h/db");
    expect(readEnvValue(twice, "DATABASE_URL")).toBe("postgresql://b@h/db");
    expect(
      twice.split("\n").filter((l: string) => l.startsWith("DATABASE_URL=")),
    ).toHaveLength(1);
    // Everything else identical between runs.
    const strip = (s: string) =>
      s
        .split("\n")
        .filter((l: string) => !l.startsWith("DATABASE_URL="))
        .join("\n");
    expect(strip(twice)).toBe(strip(once));
  });

  it("keeps comments that mention the key", () => {
    const withComment = `# DATABASE_URL is written by npm run db:role:local\n${FIXTURE}`;
    const next = upsertEnvValue(
      withComment,
      "DATABASE_URL",
      "postgresql://x@h/db",
    );
    expect(next).toContain(
      "# DATABASE_URL is written by npm run db:role:local",
    );
    expect(
      next.split("\n").filter((l: string) => l.startsWith("DATABASE_URL=")),
    ).toHaveLength(1);
  });
});

describe("atomic file replacement", () => {
  const scratch = async () => mkdtemp(join(tmpdir(), "limenzy-env-"));

  it("writes the replacement with mode 0600", async () => {
    const dir = await scratch();
    const target = join(dir, ".env.local");
    await writeFile(target, "EXISTING=1\n", { mode: 0o644 });
    await writeFileAtomic(
      target,
      "EXISTING=1\nDATABASE_URL=postgresql://x@h/db\n",
    );
    const info = await stat(target);
    expect(info.mode & 0o777).toBe(0o600);
  });

  it("leaves the original byte-identical when the rename fails", async () => {
    const dir = await scratch();
    const target = join(dir, ".env.local");
    const original = "# keep me\nEXISTING=1\n";
    await writeFile(target, original);

    await expect(
      writeFileAtomic(target, "REPLACED=1\n", {
        onBeforeRename: async () => {
          throw new Error("simulated pre-rename failure");
        },
      }),
    ).rejects.toThrow(/simulated pre-rename failure/);

    expect(await readFile(target, "utf8")).toBe(original);
  });

  it("removes the temporary file on failure", async () => {
    const dir = await scratch();
    const target = join(dir, ".env.local");
    await writeFile(target, "EXISTING=1\n");

    await expect(
      writeFileAtomic(target, "REPLACED=1\n", {
        onBeforeRename: async () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow();

    const left = await readdir(dir);
    expect(left).toEqual([".env.local"]);
  });
});
