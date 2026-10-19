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
 * under row-level security. Two notes exempt an entry from needing database
 * evidence, and both are recorded so the inventory stays complete rather than
 * to claim evidence that does not exist:
 *
 *   * "policy only" — the function performs no database access itself;
 *   * "no tenant data" — the file matched discovery only because it NAMES a
 *     gateway in prose. Discovery is deliberately a text search, so a comment
 *     explaining that a module does not touch tenant data is enough to list
 *     it. Registering it is the honest resolution; editing the comment to
 *     dodge the search would not be.
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
  /*
   * The §158 time zone, read by every screen that renders a timestamp —
   * which is every role on every record, not just the Settings screen. Same
   * table and same policy as the full settings read, so the same evidence
   * covers it.
   */
  "src/server/auth/workspace-business-settings.ts#workspaceTimeZone": {
    evidence: "src/server/db/settings-isolation.db.test.ts",
  },
  "src/server/auth/workspace-business-settings.ts#updateBusinessSettings": {
    evidence: "src/server/db/settings-isolation.db.test.ts",
  },
  "src/server/auth/member-emails.ts#emailsForAuthUsers": {
    evidence: "src/server/auth/member-emails.unit.test.ts",
    note:
      "no tenant data — reaches Supabase's Auth Admin API over HTTPS and no " +
      "database at all. It is given auth user ids that app.workspace_members() " +
      "already scoped to the caller's workspace.",
  },
  "src/server/auth/invitation-acceptance.ts#acceptInvitation": {
    evidence: "src/server/db/invitations-isolation.db.test.ts",
  },
  "src/server/auth/invitation-acceptance.ts#pendingInvitationsForMe": {
    evidence: "src/server/db/invitations-isolation.db.test.ts",
  },
  "src/server/auth/workspace-lead-pipeline.ts#leadStages": {
    evidence: "src/server/db/lead-pipeline-isolation.db.test.ts",
  },
  /*
   * Milestone 3B — the first BUSINESS RECORD repository. Every one of these
   * is evidenced against a real database under row-level security, because
   * what they are isolating is no longer workspace vocabulary but records
   * that belong to one person inside a workspace (§162.1).
   */
  "src/server/auth/workspace-leads.ts#listLeads": {
    evidence: "src/server/db/leads-isolation.db.test.ts",
  },
  "src/server/auth/workspace-leads.ts#leadDetail": {
    evidence: "src/server/db/leads-isolation.db.test.ts",
  },
  "src/server/auth/workspace-leads.ts#createLead": {
    evidence: "src/server/db/leads-isolation.db.test.ts",
  },
  "src/server/auth/workspace-leads.ts#findDuplicateCandidates": {
    evidence: "src/server/db/leads-isolation.db.test.ts",
  },
  "src/server/auth/workspace-leads.ts#recordOwnerNames": {
    evidence: "src/server/db/leads-isolation.db.test.ts",
  },
  "src/server/auth/workspace-leads.ts#countLeadsOwnedBy": {
    evidence: "src/server/db/leads-isolation.db.test.ts",
  },
  /*
   * Milestone 3C — editing a record, moving it, and its history. Each one
   * mutates a business record or reads its timeline under §162.1, so each is
   * evidenced against a real database rather than argued about here.
   */
  "src/server/auth/workspace-leads.ts#leadForEdit": {
    evidence: "src/server/db/lead-lifecycle.db.test.ts",
  },
  "src/server/auth/workspace-leads.ts#leadActivity": {
    evidence: "src/server/db/lead-lifecycle.db.test.ts",
  },
  "src/server/auth/workspace-leads.ts#editLead": {
    evidence: "src/server/db/lead-lifecycle.db.test.ts",
  },
  "src/server/auth/workspace-leads.ts#changeLeadStage": {
    evidence: "src/server/db/lead-lifecycle.db.test.ts",
  },
  "src/server/auth/workspace-leads.ts#markLeadWon": {
    evidence: "src/server/db/lead-lifecycle.db.test.ts",
  },
  "src/server/auth/workspace-leads.ts#markLeadLost": {
    evidence: "src/server/db/lead-lifecycle.db.test.ts",
  },
  "src/server/auth/workspace-leads.ts#reopenLead": {
    evidence: "src/server/db/lead-lifecycle.db.test.ts",
  },
  "src/server/auth/workspace-leads.ts#addLeadNote": {
    evidence: "src/server/db/lead-lifecycle.db.test.ts",
  },
  /*
   * Milestone 3D — manual Record Owner reassignment. Both go through a
   * SECURITY DEFINER routine the runtime role cannot bypass, so the
   * evidence has to be a real database under row-level security.
   */
  "src/server/auth/workspace-leads.ts#reassignLead": {
    evidence: "src/server/db/lead-reassignment.db.test.ts",
  },
  "src/server/auth/workspace-leads.ts#assignableMembers": {
    evidence: "src/server/db/lead-reassignment.db.test.ts",
  },
  /*
   * Pure: it reduces candidates the server already has to what §162.1 lets
   * the actor learn, and reaches no database at all. It appears here because
   * discovery is a text search over files that NAME a gateway, and listing it
   * is the honest resolution.
   */
  "src/server/auth/workspace-leads.ts#describeForActor": {
    evidence: "src/app/actions/leads.test.ts",
    note: "policy only — reduces candidates already read, opens no transaction",
  },
  "src/server/auth/workspace-lead-pipeline.ts#leadSources": {
    evidence: "src/server/db/lead-pipeline-isolation.db.test.ts",
  },
  "src/server/auth/workspace-lead-pipeline.ts#addLeadStage": {
    evidence: "src/server/db/lead-pipeline-isolation.db.test.ts",
  },
  "src/server/auth/workspace-lead-pipeline.ts#renameLeadStage": {
    evidence: "src/server/db/lead-pipeline-isolation.db.test.ts",
  },
  "src/server/auth/workspace-lead-pipeline.ts#moveLeadStage": {
    evidence: "src/server/db/lead-pipeline-isolation.db.test.ts",
  },
  "src/server/auth/workspace-lead-pipeline.ts#setLeadStageActive": {
    evidence: "src/server/db/lead-pipeline-isolation.db.test.ts",
  },
  "src/server/auth/workspace-lead-pipeline.ts#addLeadSource": {
    evidence: "src/server/db/lead-pipeline-isolation.db.test.ts",
  },
  "src/server/auth/workspace-lead-pipeline.ts#renameLeadSource": {
    evidence: "src/server/db/lead-pipeline-isolation.db.test.ts",
  },
  "src/server/auth/workspace-lead-pipeline.ts#setLeadSourceActive": {
    evidence: "src/server/db/lead-pipeline-isolation.db.test.ts",
  },
  "src/server/auth/workspace-invitations.ts#pendingInvitations": {
    evidence: "src/server/db/invitations-isolation.db.test.ts",
  },
  "src/server/auth/workspace-invitations.ts#createInvitation": {
    evidence: "src/server/db/invitations-isolation.db.test.ts",
  },
  "src/server/auth/workspace-invitations.ts#regenerateInvitation": {
    evidence: "src/server/db/invitations-isolation.db.test.ts",
  },
  "src/server/auth/workspace-invitations.ts#revokeInvitation": {
    evidence: "src/server/db/invitations-isolation.db.test.ts",
  },
  "src/server/auth/workspace-members.ts#workspaceMembers": {
    evidence: "src/server/db/users-isolation.db.test.ts",
  },
  "src/server/auth/workspace-members.ts#setMemberRole": {
    evidence: "src/server/db/users-isolation.db.test.ts",
  },
  /*
   * Milestone 3B: deactivation now checks §160 inside the SAME transaction
   * as the status change, so that a Lead created at that moment cannot slip
   * between the two. Its evidence is the race test, which drives real
   * concurrent transactions.
   */
  "src/server/auth/workspace-members.ts#deactivateMember": {
    evidence: "src/server/db/leads-isolation.db.test.ts",
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
      if (
        entry.note?.startsWith("policy only") ||
        entry.note?.startsWith("no tenant data")
      ) {
        continue;
      }
      expect(
        entry.evidence.includes(".db.test.ts") ||
          entry.evidence.includes("identity.test.ts"),
        `${key} is evidenced by ${entry.evidence}, which is not a database suite`,
      ).toBe(true);
    }
  });
});

describe("the business-record inventory, named rather than filtered", () => {
  it("names every Lead-related function, configuration and record alike", async () => {
    const found = await discover();
    const business = found.filter((key) =>
      BUSINESS_ENTITIES.some((entity) => key.toLowerCase().includes(entity)),
    );

    /*
     * Milestone 3A added Lead CONFIGURATION — the pipeline stages and the
     * Lead sources a Lead chooses from. Milestone 3B added LEADS, which is
     * the first business record in this application.
     *
     * Everything is listed by name rather than filtered out by keyword,
     * because the filter is the guard: a new Lead-shaped function must be
     * registered above with real database evidence, and widening the keyword
     * list would hide exactly that.
     */
    expect(business).toEqual([
      "src/server/auth/workspace-lead-pipeline.ts#addLeadSource",
      "src/server/auth/workspace-lead-pipeline.ts#addLeadStage",
      "src/server/auth/workspace-lead-pipeline.ts#leadSources",
      "src/server/auth/workspace-lead-pipeline.ts#leadStages",
      "src/server/auth/workspace-lead-pipeline.ts#moveLeadStage",
      "src/server/auth/workspace-lead-pipeline.ts#renameLeadSource",
      "src/server/auth/workspace-lead-pipeline.ts#renameLeadStage",
      "src/server/auth/workspace-lead-pipeline.ts#setLeadSourceActive",
      "src/server/auth/workspace-lead-pipeline.ts#setLeadStageActive",
      "src/server/auth/workspace-leads.ts#addLeadNote",
      "src/server/auth/workspace-leads.ts#assignableMembers",
      "src/server/auth/workspace-leads.ts#changeLeadStage",
      "src/server/auth/workspace-leads.ts#countLeadsOwnedBy",
      "src/server/auth/workspace-leads.ts#createLead",
      "src/server/auth/workspace-leads.ts#describeForActor",
      "src/server/auth/workspace-leads.ts#editLead",
      "src/server/auth/workspace-leads.ts#findDuplicateCandidates",
      "src/server/auth/workspace-leads.ts#leadActivity",
      "src/server/auth/workspace-leads.ts#leadDetail",
      "src/server/auth/workspace-leads.ts#leadForEdit",
      "src/server/auth/workspace-leads.ts#listLeads",
      "src/server/auth/workspace-leads.ts#markLeadLost",
      "src/server/auth/workspace-leads.ts#markLeadWon",
      "src/server/auth/workspace-leads.ts#reassignLead",
      "src/server/auth/workspace-leads.ts#recordOwnerNames",
      "src/server/auth/workspace-leads.ts#reopenLead",
    ]);
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
