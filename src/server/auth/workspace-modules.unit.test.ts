import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reading and writing a workspace's module configuration.
 *
 * Offline: the tenant gateway is replaced, so no database is contacted. What
 * is under test is the decision-making — which statement runs, what happens
 * when the column is not there, and whether a refused write is ever reported
 * as a success.
 *
 * Isolation itself is not re-proved here. Every statement goes through
 * `withTenant()`, which is what establishes the tenant settings the policies
 * read; that path is proved against a real database by `tenant.test.ts` and
 * the hosted §6.1 harness.
 */

const rows: unknown[][] = [];
const statements: string[] = [];
let contextSeen: unknown = null;

/** A fake tagged-template handle that records what it was asked to run. */
const tx = async (strings: TemplateStringsArray, ...values: unknown[]) => {
  statements.push(strings.join("?").replace(/\s+/g, " ").trim());
  void values;
  const next = rows.shift();
  // A queued Error means "this statement fails", which is how a missing column
  // actually reaches the code — not by the gateway call rejecting.
  if (next instanceof Error) throw next;
  return next ?? [];
};

const withTenant = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/tenant", () => ({ withTenant }));

const { enabledModulesFor, setModuleEnabled } =
  await import("./workspace-modules");
const { MODULE_KEYS } = await import("@/lib/modules");

const CONTEXT = { workspaceId: "w" } as never;

/**
 * The first statement in every transaction is the capability check. Catching
 * 42703 is not an option — PostgreSQL marks the transaction failed and
 * postgres.js rethrows the recorded error after the callback resolves — so the
 * code asks information_schema first and only then names the column.
 */
const columnPresent = (present: boolean) => rows.push([{ present }]);

class PgError extends Error {
  constructor(readonly code: string) {
    super("database said no");
  }
}

beforeEach(() => {
  rows.length = 0;
  statements.length = 0;
  contextSeen = null;
  withTenant.mockReset();
  withTenant.mockImplementation(
    async (context: unknown, fn: (t: unknown) => unknown) => {
      contextSeen = context;
      return fn(tx);
    },
  );
});

describe("reading the configuration", () => {
  it("goes through the tenant gateway with the caller's context", async () => {
    columnPresent(true);
    rows.push([{ enabled_modules: ["leads"] }]);
    await enabledModulesFor(CONTEXT);

    expect(withTenant).toHaveBeenCalledTimes(1);
    expect(contextSeen).toBe(CONTEXT);
  });

  it("never names a workspace in the statement — the context decides the row", async () => {
    columnPresent(true);
    rows.push([{ enabled_modules: ["leads"] }]);
    await enabledModulesFor(CONTEXT);

    // statements[0] is the capability check; the read itself is next.
    expect(statements[1]).toBe("select enabled_modules from public.workspaces");
    expect(statements[1]).not.toMatch(/where/i);
  });

  it("returns the stored set when the workspace is configured", async () => {
    columnPresent(true);
    rows.push([{ enabled_modules: ["leads", "email"] }]);
    const result = await enabledModulesFor(CONTEXT);

    expect([...result.enabled].sort()).toEqual(["email", "leads"]);
    expect(result.usingDefaults).toBe(false);
  });

  it("falls back to §8's recommended setup when never configured", async () => {
    columnPresent(true);
    rows.push([{ enabled_modules: null }]);
    const result = await enabledModulesFor(CONTEXT);

    expect([...result.enabled].sort()).toEqual([...MODULE_KEYS].sort());
    expect(result.usingDefaults).toBe(true);
  });

  it("falls back when the column does not exist yet", async () => {
    // The migration is prepared but not applied, so the capability check says
    // the column is absent and the SELECT that names it never runs.
    columnPresent(false);
    const result = await enabledModulesFor(CONTEXT);

    expect([...result.enabled].sort()).toEqual([...MODULE_KEYS].sort());
    expect(result.usingDefaults).toBe(true);
  });

  it("falls back when the policy returns no row", async () => {
    columnPresent(true);
    rows.push([]);
    expect((await enabledModulesFor(CONTEXT)).usingDefaults).toBe(true);
  });

  it("distinguishes an empty configuration from an absent one", async () => {
    columnPresent(true);
    rows.push([{ enabled_modules: [] }]);
    const result = await enabledModulesFor(CONTEXT);

    expect(result.enabled.size).toBe(0);
    expect(result.usingDefaults).toBe(false);
  });

  it("propagates a permission error instead of pretending it is a default", async () => {
    // 42501 is the database refusing, which is not 'unconfigured'. Absorbing it
    // would turn an access-control failure into a fully-enabled workspace.
    rows.push(new PgError("42501") as never);
    await expect(enabledModulesFor(CONTEXT)).rejects.toBeInstanceOf(PgError);
  });

  it("propagates a 42703 instead of reading it as 'unconfigured'", async () => {
    // Nothing is caught any more. A 42703 from anywhere — the gateway, a
    // set_config, a future statement — surfaces rather than silently enabling
    // every module on an unrelated schema fault.
    withTenant.mockRejectedValueOnce(new PgError("42703"));
    await expect(enabledModulesFor(CONTEXT)).rejects.toBeInstanceOf(PgError);
  });

  it("asks information_schema before it names the column", async () => {
    columnPresent(true);
    rows.push([{ enabled_modules: ["leads"] }]);
    await enabledModulesFor(CONTEXT);

    expect(statements[0]).toContain("information_schema.columns");
    expect(statements[0]).toContain("enabled_modules");
    expect(statements[1]).toBe("select enabled_modules from public.workspaces");
  });

  it("never names the column when the capability check says it is absent", async () => {
    columnPresent(false);
    await enabledModulesFor(CONTEXT);

    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain("information_schema.columns");
  });

  it("propagates an error that carries no code at all", async () => {
    withTenant.mockRejectedValueOnce(new Error("connection reset"));
    await expect(enabledModulesFor(CONTEXT)).rejects.toThrow();
  });
});

describe("changing one module", () => {
  it("refuses an unknown module without touching the database", async () => {
    const result = await setModuleEnabled(CONTEXT, "not_a_module", true);

    expect(result).toEqual({ ok: false, reason: "unknown_module" });
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("reads and writes inside ONE transaction", async () => {
    columnPresent(true);
    rows.push([{ enabled_modules: ["products_services"] }]); // the read
    rows.push([{ enabled_modules: ["leads", "products_services"] }]); // the write
    await setModuleEnabled(CONTEXT, "leads", true);

    // One gateway call: the dependency decision is made against the state the
    // write applies to, not a stale snapshot from an earlier transaction.
    expect(withTenant).toHaveBeenCalledTimes(1);
    // capability check, read, write.
    expect(statements).toHaveLength(3);
    expect(statements[2]).toMatch(/^update public\.workspaces/);
  });

  it("applies §172 against the workspace's current configuration", async () => {
    columnPresent(true);
    rows.push([{ enabled_modules: [...MODULE_KEYS] }]);
    const result = await setModuleEnabled(CONTEXT, "products_services", false);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("refused");
    // Refused before any write: capability check and read only.
    expect(statements).toHaveLength(2);
  });

  it("reports a row-level-security refusal rather than claiming success", async () => {
    columnPresent(true);
    rows.push([{ enabled_modules: ["leads"] }]);
    rows.push([]); // UPDATE matched nothing: not an owner_admin of this workspace
    const result = await setModuleEnabled(CONTEXT, "email", true);

    expect(result).toEqual({ ok: false, reason: "not_configurable" });
  });

  it("reports an unapplied migration as not configurable", async () => {
    columnPresent(false);
    expect(await setModuleEnabled(CONTEXT, "email", true)).toEqual({
      ok: false,
      reason: "not_configurable",
    });
  });

  it("propagates a permission error rather than reporting it as a refusal", async () => {
    withTenant.mockRejectedValueOnce(new PgError("42501"));
    await expect(
      setModuleEnabled(CONTEXT, "email", true),
    ).rejects.toBeInstanceOf(PgError);
  });

  it("treats an unconfigured workspace as the default before changing it", async () => {
    columnPresent(true);
    rows.push([{ enabled_modules: null }]); // the read: never configured
    rows.push([{ enabled_modules: [] }]); // the write
    const result = await setModuleEnabled(CONTEXT, "whatsapp", false);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Started from all six, so turning one off leaves the other five.
    expect(result.enabled).toHaveLength(MODULE_KEYS.length - 1);
    expect(result.enabled).not.toContain("whatsapp");
  });
});
