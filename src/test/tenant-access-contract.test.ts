import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Milestone 1D — the tenant-isolation contract.
 *
 * The build plan asks for "a tenant-isolation contract test enumerating every
 * repository function". This is the structure that makes that enumeration
 * impossible to forget: it discovers every server function that can reach
 * tenant data, and fails unless each one is registered below with the evidence
 * that its isolation is proved.
 *
 * ## An empty business inventory is not proof
 *
 * **There are no business repositories yet.** No Leads, Customers, Follow-ups,
 * Renewals or WhatsApp data access exists, so none of it is covered here, and
 * nothing in this file should be read as evidence that business records are
 * isolated. The functions below are the tenancy foundation — identity,
 * workspace selection, names and settings. When the first business repository
 * is written, this test fails until it is registered, which is the whole
 * point.
 *
 * ## What counts as reaching tenant data
 *
 * Any exported function in a file that mentions the tenant gateways or the
 * runtime pool. That is deliberately wider than "repository": a function that
 * opens its own transaction is exactly the kind that can forget the context.
 */

const PRODUCTION_ROOTS = ["src/server", "src/app"];

/** Files allowed to mention the pool because they ARE the mechanism. */
const GATEWAY_MODULES = new Set([
  "src/server/db/client.ts",
  "src/server/db/tenant.ts",
  "src/server/db/tenant-db.ts",
  "src/server/db/tenant-scope.ts",
  "src/server/db/tenant-context.ts",
]);

/**
 * Every tenant-data-access function, and where its isolation is demonstrated.
 *
 * `evidence` names a suite that exercises the function against a real database
 * under row-level security. "policy only" means the function performs no
 * database access itself and is covered by offline tests — it is recorded so
 * the inventory stays complete, not to claim database evidence for it.
 */
const REGISTRY: Record<string, { evidence: string; note?: string }> = {
  "src/server/db/identity.ts#resolveVerifiedIdentity": {
    evidence: "src/server/db/identity.test.ts",
  },
  "src/server/auth/workspace-context.ts#resolveWorkspaceContext": {
    evidence: "src/server/auth/workspace-context.db.test.ts",
  },
  "src/server/auth/workspace-context.ts#resolveWorkspaceChoices": {
    evidence: "src/server/auth/workspace-context.db.test.ts",
  },
  "src/server/auth/workspace-names.ts#workspaceNameFor": {
    evidence: "src/server/auth/workspace-names.db.test.ts",
  },
  "src/server/auth/workspace-names.ts#resolveNamedWorkspaceChoices": {
    evidence: "src/server/auth/workspace-names.db.test.ts",
  },
  "src/server/auth/create-initial-workspace.ts#createInitialWorkspace": {
    evidence: "src/server/auth/create-initial-workspace.db.test.ts",
  },
  "src/server/auth/workspace-business-settings.ts#businessSettingsFor": {
    evidence: "src/server/db/settings-isolation.db.test.ts",
  },
  "src/server/auth/workspace-business-settings.ts#updateBusinessSettings": {
    evidence: "src/server/db/settings-isolation.db.test.ts",
  },
  "src/server/auth/workspace-members.ts#workspaceMembers": {
    evidence: "src/server/db/users-isolation.db.test.ts",
  },
  "src/server/auth/workspace-members.ts#setMemberRole": {
    evidence: "src/server/db/users-isolation.db.test.ts",
  },
  "src/server/auth/workspace-members.ts#setMemberStatus": {
    evidence: "src/server/db/users-isolation.db.test.ts",
  },
  "src/server/auth/workspace-modules.ts#enabledModulesFor": {
    evidence: "src/server/db/settings-isolation.db.test.ts",
  },
  "src/server/auth/workspace-modules.ts#setModuleEnabled": {
    evidence: "src/server/db/settings-isolation.db.test.ts",
  },
  "src/server/auth/workspace-permissions.ts#workspacePermissionSettings": {
    evidence: "src/server/db/settings-isolation.db.test.ts",
  },
  "src/server/auth/workspace-permissions.ts#setPermissionGranted": {
    evidence: "src/server/db/settings-isolation.db.test.ts",
  },
  "src/server/auth/workspace-permissions.ts#setManagerRecordScope": {
    evidence: "src/server/db/settings-isolation.db.test.ts",
  },
  "src/server/auth/workspace-permissions.ts#permissionFor": {
    evidence: "src/server/auth/workspace-permissions.unit.test.ts",
    note: "policy only — evaluates settings already read, opens no transaction",
  },
  "src/server/auth/workspace-permissions.ts#recordAccess": {
    evidence: "src/server/auth/workspace-permissions.unit.test.ts",
    note: "policy only — evaluates settings already read, opens no transaction",
  },
};

/** Modules whose data access belongs to a business entity, once they exist. */
const BUSINESS_ENTITIES = [
  "leads",
  "customers",
  "follow-ups",
  "renewals",
  "whatsapp",
  "products",
  "sales-teams",
  "shares",
];

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      yield path;
    }
  }
}

/** Every exported function in a file that can reach tenant data. */
async function discover(): Promise<string[]> {
  const found: string[] = [];
  for (const root of PRODUCTION_ROOTS) {
    for await (const path of walk(root)) {
      const normalised = path.replace(/\\/g, "/");
      if (GATEWAY_MODULES.has(normalised)) continue;
      const source = await readFile(path, "utf8");
      const reachesTenantData =
        /\bwithTenant\b|\bwithTenantDb\b|\bruntimeSql\b|\bruntimeDb\b/.test(
          source,
        );
      if (!reachesTenantData) continue;
      for (const match of source.matchAll(
        /^export (?:async )?function ([a-zA-Z0-9_]+)/gm,
      )) {
        found.push(`${normalised}#${match[1]}`);
      }
    }
  }
  return found.sort();
}

describe("every tenant-data-access function is registered", () => {
  it("discovers at least the foundation functions", async () => {
    const found = await discover();
    // A discovery that finds nothing would make every assertion below vacuous.
    expect(found.length).toBeGreaterThanOrEqual(10);
  });

  it("has no unregistered function", async () => {
    const found = await discover();
    const unregistered = found.filter((key) => !(key in REGISTRY));
    // A new data-access function must name the suite that proves its
    // isolation. Adding it here without evidence is the failure this catches.
    expect(unregistered).toEqual([]);
  });

  it("has no stale registry entry", async () => {
    const found = new Set(await discover());
    const stale = Object.keys(REGISTRY).filter((key) => !found.has(key));
    expect(stale).toEqual([]);
  });

  it("names a suite that exists, for every entry", async () => {
    for (const [key, entry] of Object.entries(REGISTRY)) {
      await expect(
        readFile(entry.evidence, "utf8"),
        `${key} names a suite that does not exist`,
      ).resolves.toBeTruthy();
    }
  });

  it("gives database evidence for every function that opens a transaction", async () => {
    for (const [key, entry] of Object.entries(REGISTRY)) {
      if (entry.note?.startsWith("policy only")) continue;
      expect(
        entry.evidence.includes(".db.test.ts") ||
          entry.evidence.includes("identity.test.ts"),
        `${key} is evidenced by ${entry.evidence}, which is not a database suite`,
      ).toBe(true);
    }
  });
});

describe("the business-record inventory is empty, and that proves nothing", () => {
  it("finds no business repository yet", async () => {
    const found = await discover();
    const business = found.filter((key) =>
      BUSINESS_ENTITIES.some((entity) => key.toLowerCase().includes(entity)),
    );
    // If this ever fails, a business repository has appeared and must be
    // registered above with real database evidence before the failure is
    // "fixed" by widening the filter.
    expect(business).toEqual([]);
  });

  it("states plainly that this is not evidence of business-record isolation", async () => {
    // The claim lives in the file's own header so it cannot be lost when the
    // registry changes. Asserted so it cannot quietly be deleted either.
    const source = await readFile(
      "src/test/tenant-access-contract.test.ts",
      "utf8",
    );
    expect(source).toContain("An empty business inventory is not proof");
    expect(source).toContain("There are no business repositories yet");
  });
});
