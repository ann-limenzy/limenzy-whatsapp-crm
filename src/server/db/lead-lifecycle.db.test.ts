import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertMatchedDatabaseTargets } from "../../../scripts/database-target.mjs";
import {
  cleanupTenantFixture,
  createTenantFixture,
  type TenantFixture,
} from "@/test/fixtures/tenant-fixture";

/**
 * Milestone 3C — editing a Lead, moving it, and its history (§37, §39, §45,
 * §48, §130.1, §162.1).
 *
 * What a real database is needed for, and a unit test could not say:
 *
 *   * the stale-edit guard, which is a `where revision = …` the database
 *     evaluates and a trigger the database owns — a caller cannot hold the
 *     revision still, because it holds no grant on the column;
 *   * §39's "permanent": no application role has UPDATE or DELETE on the
 *     history, and the insert policy pins the author to the acting profile;
 *   * the outcome representation decided for this slice — Won and Lost are
 *     the workspace's rows found by immutable `kind`, never by label;
 *   * §34's occupancy rule now that outcomes exist: a Won Lead no longer
 *     holds its old column open;
 *   * atomicity — a refused change leaves neither the Lead nor its history
 *     touched, and an accepted one writes both;
 *   * the lock order, which only shows itself when two transactions race.
 *
 * WHAT IS NOT TESTED HERE, DELIBERATELY. `outcome_missing` cannot be staged:
 * §34's shape check refuses to let a workspace lose its Won or Lost row, so
 * the branch exists for a database that has been corrupted by hand and
 * nothing below should be read as evidence that it has been exercised.
 */

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

const probe = async (url: string): Promise<postgres.Sql | undefined> => {
  if (!url) return undefined;
  const candidate = postgres(url, {
    max: 3,
    idle_timeout: 2,
    connect_timeout: 3,
    onnotice: () => {},
  });
  try {
    await candidate`select 1`;
    return candidate;
  } catch {
    await candidate.end({ timeout: 1 }).catch(() => {});
    return undefined;
  }
};

const tooling = await probe(TOOLING);
const runtimeProbe = await probe(RUNTIME);
const reachable = tooling !== undefined && runtimeProbe !== undefined;

if (reachable) assertMatchedDatabaseTargets(RUNTIME, TOOLING);
if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] the lead lifecycle suite needs both connections. Run "npm run test:db:local".',
  );
}

const admin = () => {
  if (!tooling) throw new Error("no tooling connection");
  return tooling;
};
const runtime = () => {
  if (!runtimeProbe) throw new Error("no runtime connection");
  return runtimeProbe;
};

const RUN = randomUUID().slice(0, 8);
let fixture: TenantFixture;
let recorded: Awaited<ReturnType<typeof createTenantFixture>>["recorded"];

type Gateways = {
  createTenantContext: typeof import("./tenant-context").createTenantContext;
  createLead: typeof import("@/server/auth/workspace-leads").createLead;
  leadForEdit: typeof import("@/server/auth/workspace-leads").leadForEdit;
  leadActivity: typeof import("@/server/auth/workspace-leads").leadActivity;
  editLead: typeof import("@/server/auth/workspace-leads").editLead;
  changeLeadStage: typeof import("@/server/auth/workspace-leads").changeLeadStage;
  markLeadWon: typeof import("@/server/auth/workspace-leads").markLeadWon;
  markLeadLost: typeof import("@/server/auth/workspace-leads").markLeadLost;
  reopenLead: typeof import("@/server/auth/workspace-leads").reopenLead;
  addLeadNote: typeof import("@/server/auth/workspace-leads").addLeadNote;
  setLeadStageActive: typeof import("@/server/auth/workspace-lead-pipeline").setLeadStageActive;
  deactivateMember: typeof import("@/server/auth/workspace-members").deactivateMember;
  runtimeSql: typeof import("./client").runtimeSql;
};
let g: Gateways;

const stages = new Map<
  string,
  { first: string; second: string; won: string; lost: string }
>();
const sources = new Map<string, string>();

async function seedPipeline(workspaceId: string) {
  const rows = (await admin()`
    insert into public.workspace_lead_stages
      (workspace_id, name, sort_order, kind)
    values
      (${workspaceId}, ${`New ${RUN}`}, 1, 'active'),
      (${workspaceId}, ${`Contacted ${RUN}`}, 2, 'active'),
      (${workspaceId}, ${`Won ${RUN}`}, 90, 'won'),
      (${workspaceId}, ${`Lost ${RUN}`}, 91, 'lost')
    returning id, kind::text as kind, sort_order
  `) as unknown as { id: string; kind: string; sort_order: number }[];
  stages.set(workspaceId, {
    first: rows.find((r) => r.sort_order === 1)!.id,
    second: rows.find((r) => r.sort_order === 2)!.id,
    won: rows.find((r) => r.kind === "won")!.id,
    lost: rows.find((r) => r.kind === "lost")!.id,
  });
  const [source] = (await admin()`
    insert into public.workspace_lead_sources (workspace_id, name)
    values (${workspaceId}, ${`Referral ${RUN}`}) returning id
  `) as unknown as { id: string }[];
  sources.set(workspaceId, source!.id);
}

beforeAll(async () => {
  if (!reachable) return;
  ({ fixture, recorded } = await createTenantFixture(admin(), RUN));
  await seedPipeline(fixture.workspaceA);
  await seedPipeline(fixture.workspaceB);
  const [context, leads, pipeline, client, members] = await Promise.all([
    import("./tenant-context"),
    import("@/server/auth/workspace-leads"),
    import("@/server/auth/workspace-lead-pipeline"),
    import("./client"),
    import("@/server/auth/workspace-members"),
  ]);
  g = {
    createTenantContext: context.createTenantContext,
    runtimeSql: client.runtimeSql,
    setLeadStageActive: pipeline.setLeadStageActive,
    deactivateMember: members.deactivateMember,
    createLead: leads.createLead,
    leadForEdit: leads.leadForEdit,
    leadActivity: leads.leadActivity,
    editLead: leads.editLead,
    changeLeadStage: leads.changeLeadStage,
    markLeadWon: leads.markLeadWon,
    markLeadLost: leads.markLeadLost,
    reopenLead: leads.reopenLead,
    addLeadNote: leads.addLeadNote,
  };
}, 30_000);

afterAll(async () => {
  if (reachable && recorded) {
    for (const workspace of recorded.workspaces) {
      for (const statement of [
        admin()`delete from public.lead_activities where workspace_id = ${workspace}`,
        admin()`delete from public.lead_duplicate_overrides where workspace_id = ${workspace}`,
      ]) {
        await statement.catch((error: unknown) => {
          console.error("[lead lifecycle] cleanup:", error);
        });
      }
      await admin()`delete from public.leads where workspace_id = ${workspace}`.catch(
        (error: unknown) => console.error("[lead lifecycle] cleanup:", error),
      );
      await admin()`delete from public.workspace_lead_stages where workspace_id = ${workspace}`.catch(
        (error: unknown) => console.error("[lead lifecycle] cleanup:", error),
      );
      await admin()`delete from public.workspace_lead_sources where workspace_id = ${workspace}`.catch(
        (error: unknown) => console.error("[lead lifecycle] cleanup:", error),
      );
    }
    const problems = await cleanupTenantFixture(admin(), recorded);
    if (problems.length > 0) {
      console.error("[lead lifecycle] cleanup problems:", problems);
    }
  }
  try {
    if (g?.runtimeSql) await g.runtimeSql().end({ timeout: 5 });
  } catch {
    /* already closed */
  }
  await tooling?.end({ timeout: 5 }).catch(() => {});
  await runtimeProbe?.end({ timeout: 5 }).catch(() => {});
}, 30_000);

const ctx = (
  user: { authUserId: string; userProfileId: string },
  workspaceId: string,
) =>
  g.createTenantContext({
    authUserId: user.authUserId,
    userProfileId: user.userProfileId,
    workspaceId,
  });

const ownerA = () => ctx(fixture.owner, fixture.workspaceA);
const staffA = () => ctx(fixture.shared, fixture.workspaceA);

type Parsed = Parameters<Gateways["editLead"]>[3];

/*
 * Every fixture Lead gets its own number: `leads_contact_required` means a
 * Lead must have one, and §130.1 would refuse a second Lead that shared it.
 */
let phoneCounter = 0;
const freshPhone = () => `+9180${String(++phoneCounter).padStart(8, "0")}`;

/** A parsed Lead, as the validation layer would hand one over. */
const parsed = (overrides: Partial<Parsed> = {}): Parsed => {
  const phone = freshPhone();
  return {
    name: `Lead ${randomUUID().slice(0, 8)}`,
    phone,
    phoneNormalised: phone,
    phoneNeedsReview: false,
    email: null,
    emailNormalised: null,
    notes: null,
    stageId: stages.get(fixture.workspaceA)!.first,
    sourceId: null,
    ...overrides,
  } as Parsed;
};

/** Create a Lead through the gateway, so it has its §39 creation entry. */
async function newLead(
  owner: { authUserId: string; userProfileId: string } = fixture.owner,
  overrides: Partial<Parsed> = {},
): Promise<string> {
  const result = await g.createLead(
    ctx(owner, fixture.workspaceA),
    parsed(overrides),
  );
  if (!result.ok) throw new Error(`fixture lead refused: ${result.reason}`);
  return result.leadId;
}

/**
 * The payload an edit form would submit: the Lead as it stands, with the
 * fields the test is changing. Read through the admin connection so a test
 * can also build one for a Lead the acting user cannot see.
 */
async function payload(
  leadId: string,
  overrides: Partial<Parsed> = {},
): Promise<Parsed> {
  const row = await raw(leadId);
  return {
    name: row.name,
    phone: row.phone,
    phoneNormalised: row.phone,
    phoneNeedsReview: false,
    email: row.email,
    emailNormalised: row.email,
    notes: row.notes,
    stageId: row.stage_id,
    sourceId: row.source_id,
    ...overrides,
  } as Parsed;
}

const revisionOf = async (leadId: string): Promise<number> => {
  const lead = await g.leadForEdit(ownerA(), leadId);
  if (!lead) throw new Error("lead not readable");
  return lead.revision;
};

const raw = async (leadId: string) => {
  const [row] = (await admin()`
    select name, phone, email, notes, stage_id, source_id, revision,
           lost_reason::text as lost_reason, lost_reason_note
      from public.leads where id = ${leadId}`) as unknown as {
    name: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
    stage_id: string;
    source_id: string | null;
    revision: number;
    lost_reason: string | null;
    lost_reason_note: string | null;
  }[];
  return row!;
};

const kinds = async (leadId: string): Promise<string[]> =>
  (await g.leadActivity(ownerA(), leadId)).map((entry) => entry.kind);

/**
 * Empty a pipeline column of the Leads earlier tests left in it.
 *
 * The Leads are REMOVED rather than moved: a stage change with no history
 * entry is exactly what the completeness check refuses, and housekeeping
 * that had to work around that check would be housekeeping that disproves
 * it. History goes first, because the foreign key is RESTRICT.
 */
async function clearStage(stageId: string): Promise<void> {
  await admin()`
    delete from public.lead_activities a
     using public.leads l
     where a.workspace_id = l.workspace_id and a.lead_id = l.id
       and l.workspace_id = ${fixture.workspaceA} and l.stage_id = ${stageId}`;
  await admin()`
    delete from public.leads
     where workspace_id = ${fixture.workspaceA} and stage_id = ${stageId}`;
}

describe.skipIf(!reachable)("§37 editing, under §162.1", () => {
  it("writes the change and one history entry naming what changed", async () => {
    const id = await newLead();
    const before = await revisionOf(id);

    const result = await g.editLead(
      ownerA(),
      id,
      before,
      await payload(id, { name: `Renamed ${RUN}`, notes: "Called back" }),
    );
    expect(result).toEqual({ ok: true });

    const after = await raw(id);
    expect(after.name).toBe(`Renamed ${RUN}`);
    expect(after.notes).toBe("Called back");
    // The database owns the token: it moved, and the caller never set it.
    expect(after.revision).toBe(before + 1);

    const entries = await g.leadActivity(ownerA(), id);
    expect(entries.map((e) => e.kind)).toEqual([
      "details_edited",
      "record_created",
    ]);
    expect(entries[0]!.changedFields?.slice().sort()).toEqual([
      "name",
      "notes",
    ]);
    expect(entries[0]!.actorUserProfileId).toBe(fixture.owner.userProfileId);
  });

  it("records nothing for a save that changes nothing", async () => {
    const id = await newLead();
    const lead = (await g.leadForEdit(ownerA(), id))!;
    const result = await g.editLead(
      ownerA(),
      id,
      lead.revision,
      await payload(id),
    );
    expect(result).toEqual({ ok: true });
    expect(await kinds(id)).toEqual(["record_created"]);
    expect((await raw(id)).revision).toBe(lead.revision);
  });

  it("refuses a Lead §162.1 does not show the actor, and changes nothing", async () => {
    const id = await newLead();
    expect(await g.leadForEdit(staffA(), id)).toBeNull();

    const result = await g.editLead(
      staffA(),
      id,
      await revisionOf(id),
      await payload(id, { name: `Stolen ${RUN}` }),
    );
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
    expect((await raw(id)).name).not.toBe(`Stolen ${RUN}`);
    expect(await kinds(id)).toEqual(["record_created"]);
  });

  it("refuses a Lead in another workspace, even with its id", async () => {
    const inB = freshPhone();
    const [row] = (await admin()`
      insert into public.leads
        (workspace_id, name, phone, phone_normalised, stage_id,
         record_owner_user_profile_id, created_by_user_profile_id)
      values (${fixture.workspaceB}, ${`In B ${RUN}`},
              ${inB}, ${inB},
              ${stages.get(fixture.workspaceB)!.first},
              ${fixture.shared.userProfileId},
              ${fixture.shared.userProfileId})
      returning id, revision`) as unknown as {
      id: string;
      revision: number;
    }[];

    const result = await g.editLead(
      ownerA(),
      row!.id,
      row!.revision,
      await payload(row!.id, { name: `Reached across ${RUN}` }),
    );
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
    expect((await raw(row!.id)).name).toBe(`In B ${RUN}`);
  });
});

describe.skipIf(!reachable)("the stale-edit guard", () => {
  it("lets the first save through and tells the second", async () => {
    const id = await newLead();
    const opened = await revisionOf(id);

    // Two people opened the same form; both hold revision `opened`.
    const first = await g.editLead(
      ownerA(),
      id,
      opened,
      await payload(id, { name: `First ${RUN}` }),
    );
    const second = await g.editLead(
      ownerA(),
      id,
      opened,
      await payload(id, { name: `Second ${RUN}` }),
    );

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: false, reason: "stale" });

    const after = await raw(id);
    expect(after.name).toBe(`First ${RUN}`);
    // Atomicity: the refused save wrote no history either.
    expect(await kinds(id)).toEqual(["details_edited", "record_created"]);
  });

  it("gives the application no grant to hold the revision still", async () => {
    const [row] = (await admin()`
      select has_column_privilege('limenzy_app', 'public.leads',
        'revision', 'UPDATE') as may`) as unknown as { may: boolean }[];
    expect(row!.may).toBe(false);
  });

  it("guards a stage change with the same token", async () => {
    const id = await newLead();
    const opened = await revisionOf(id);
    expect(
      await g.changeLeadStage(
        ownerA(),
        id,
        opened,
        stages.get(fixture.workspaceA)!.second,
      ),
    ).toEqual({ ok: true });
    expect(await g.markLeadWon(ownerA(), id, opened)).toEqual({
      ok: false,
      reason: "stale",
    });
  });
});

describe.skipIf(!reachable)("§39 history is append-only and scoped", () => {
  it("gives no application role UPDATE or DELETE on it", async () => {
    const [row] = (await admin()`
      select has_table_privilege('limenzy_app', 'public.lead_activities',
               'UPDATE') as may_update,
             has_table_privilege('limenzy_app', 'public.lead_activities',
               'DELETE') as may_delete,
             has_table_privilege('limenzy_app', 'public.lead_activities',
               'SELECT') as may_select`) as unknown as {
      may_update: boolean;
      may_delete: boolean;
      may_select: boolean;
    }[];
    expect(row).toEqual({
      may_update: false,
      may_delete: false,
      may_select: true,
    });
  });

  it("refuses an entry written in somebody else's name", async () => {
    const id = await newLead();
    await expect(
      runtime().begin(async (tx) => {
        await tx`select set_config('app.auth_user_id', ${fixture.owner.authUserId}, true)`;
        await tx`select set_config('app.user_profile_id', ${fixture.owner.userProfileId}, true)`;
        await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
        await tx`
          insert into public.lead_activities
            (workspace_id, lead_id, kind, actor_user_profile_id, note)
          values (${fixture.workspaceA}, ${id}, 'note_added',
                  ${fixture.shared.userProfileId}, ${`Forged ${RUN}`})`;
      }),
    ).rejects.toThrow();
    expect(await kinds(id)).toEqual(["record_created"]);
  });

  it("refuses an entry about a Lead in another workspace", async () => {
    const target = freshPhone();
    const [row] = (await admin()`
      insert into public.leads
        (workspace_id, name, phone, phone_normalised, stage_id,
         record_owner_user_profile_id, created_by_user_profile_id)
      values (${fixture.workspaceB}, ${`Target ${RUN}`},
              ${target}, ${target},
              ${stages.get(fixture.workspaceB)!.first},
              ${fixture.shared.userProfileId},
              ${fixture.shared.userProfileId})
      returning id`) as unknown as { id: string }[];

    await expect(
      runtime().begin(async (tx) => {
        await tx`select set_config('app.auth_user_id', ${fixture.owner.authUserId}, true)`;
        await tx`select set_config('app.user_profile_id', ${fixture.owner.userProfileId}, true)`;
        await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
        await tx`
          insert into public.lead_activities
            (workspace_id, lead_id, kind, actor_user_profile_id, note)
          values (${fixture.workspaceA}, ${row!.id}, 'note_added',
                  ${fixture.owner.userProfileId}, ${`Across ${RUN}`})`;
      }),
    ).rejects.toThrow();
  });

  it("shows history exactly where the Lead itself is visible", async () => {
    // §162: a Staff/Sales user may only add a Lead where the workspace says so.
    await admin()`
      update public.workspaces
         set permissions_granted = array['add_leads_customers']
       where id = ${fixture.workspaceA}`;
    const mine = await newLead(fixture.shared);
    const theirs = await newLead(fixture.owner);
    await admin()`
      update public.workspaces set permissions_granted = array[]::text[]
       where id = ${fixture.workspaceA}`;

    expect(await g.leadActivity(staffA(), mine)).toHaveLength(1);
    // The Lead is invisible to them, and so is everything it ever did.
    expect(await g.leadActivity(staffA(), theirs)).toEqual([]);
  });

  it("leaves no Lead anywhere without a creation entry", async () => {
    /*
     * Not "every Lead the gateway made" — every Lead in the table, including
     * the ones this suite inserts through the admin connection and the ones
     * the backfill found. The trigger is what makes that sayable.
     */
    const [missing] = (await admin()`
      select count(*)::int as n
        from public.leads l
       where not exists (
         select 1 from public.lead_activities a
          where a.workspace_id = l.workspace_id and a.lead_id = l.id
            and a.kind = 'record_created')`) as unknown as { n: number }[];
    const [total] = (await admin()`
      select count(*)::int as n from public.leads`) as unknown as {
      n: number;
    }[];
    expect(total!.n).toBeGreaterThan(0);
    expect(missing!.n).toBe(0);
  });
});

describe.skipIf(!reachable)(
  "§45 and §48 outcomes, by kind and not by label",
  () => {
    it("marks Won against the workspace's Won row after it is renamed", async () => {
      const id = await newLead();
      const won = stages.get(fixture.workspaceA)!.won;
      // §34 lets a workspace rename Won. A lookup by label would break here.
      await admin()`
      update public.workspace_lead_stages set name = ${`Closed – signed ${RUN}`}
       where id = ${won}`;

      expect(await g.markLeadWon(ownerA(), id, await revisionOf(id))).toEqual({
        ok: true,
      });
      expect((await raw(id)).stage_id).toBe(won);

      const [entry] = await g.leadActivity(ownerA(), id);
      expect(entry!.kind).toBe("marked_won");
      expect(entry!.fromStageName).toBe(`New ${RUN}`);
      expect(entry!.toStageName).toBe(`Closed – signed ${RUN}`);

      await admin()`
      update public.workspace_lead_stages set name = ${`Won ${RUN}`}
       where id = ${won}`;
    });

    it("marks Lost with its reason, and keeps the reason in history on reopen", async () => {
      const id = await newLead();
      expect(
        await g.markLeadLost(ownerA(), id, await revisionOf(id), {
          reason: "chose_competitor",
          note: "Went with the incumbent",
        }),
      ).toEqual({ ok: true });

      const lost = await raw(id);
      expect(lost.stage_id).toBe(stages.get(fixture.workspaceA)!.lost);
      expect(lost.lost_reason).toBe("chose_competitor");
      expect(lost.lost_reason_note).toBe("Went with the incumbent");

      expect(
        await g.reopenLead(
          ownerA(),
          id,
          await revisionOf(id),
          stages.get(fixture.workspaceA)!.second,
        ),
      ).toEqual({ ok: true });

      const reopened = await raw(id);
      expect(reopened.stage_id).toBe(stages.get(fixture.workspaceA)!.second);
      // Cleared from the Lead — it is not lost any more.
      expect(reopened.lost_reason).toBeNull();
      expect(reopened.lost_reason_note).toBeNull();

      // Kept in the history — that it once was, and why, is permanent.
      const entries = await g.leadActivity(ownerA(), id);
      expect(entries.map((e) => e.kind)).toEqual([
        "reopened",
        "marked_lost",
        "record_created",
      ]);
      expect(entries[1]!.lostReason).toBe("chose_competitor");
      expect(entries[1]!.note).toBe("Went with the incumbent");
      expect(entries[0]!.toStageName).toBe(`Contacted ${RUN}`);
    });

    it("refuses to reach an outcome through the ordinary stage picker", async () => {
      const id = await newLead();
      for (const target of [
        stages.get(fixture.workspaceA)!.won,
        stages.get(fixture.workspaceA)!.lost,
      ]) {
        expect(
          await g.changeLeadStage(ownerA(), id, await revisionOf(id), target),
        ).toEqual({ ok: false, reason: "stage_unavailable" });
      }
      expect((await raw(id)).stage_id).toBe(
        stages.get(fixture.workspaceA)!.first,
      );
      expect(await kinds(id)).toEqual(["record_created"]);
    });

    it("refuses to reopen into an outcome or a closed column", async () => {
      const id = await newLead();
      await g.markLeadLost(ownerA(), id, await revisionOf(id), {
        reason: "price",
        note: null,
      });
      expect(
        await g.reopenLead(
          ownerA(),
          id,
          await revisionOf(id),
          stages.get(fixture.workspaceA)!.won,
        ),
      ).toEqual({ ok: false, reason: "stage_unavailable" });
      expect((await raw(id)).lost_reason).toBe("price");
    });

    it("refuses a Lost Lead with no reason, at the database", async () => {
      const id = await newLead();
      await expect(
        admin()`
        update public.leads set stage_id = ${stages.get(fixture.workspaceA)!.lost}
         where id = ${id}`,
      ).rejects.toThrow(/lost lead must record why/i);
    });
  },
);

describe.skipIf(!reachable)(
  "§34 occupancy counts active ordinary stages",
  () => {
    it("frees the column a Lead leaves when it is marked Won", async () => {
      const second = stages.get(fixture.workspaceA)!.second;
      // Earlier tests leave Leads here; the claim below is about THIS Lead.
      await clearStage(second);
      const id = await newLead();
      expect(
        await g.changeLeadStage(ownerA(), id, await revisionOf(id), second),
      ).toEqual({ ok: true });

      // Occupied: the stage cannot be switched off while a Lead sits in it.
      expect(await g.setLeadStageActive(ownerA(), second, false)).toEqual({
        ok: false,
        reason: "stage_occupied",
      });

      expect(await g.markLeadWon(ownerA(), id, await revisionOf(id))).toEqual({
        ok: true,
      });

      // The Lead's stage_id is now the Won row, so the column is free.
      expect(await g.setLeadStageActive(ownerA(), second, false)).toEqual({
        ok: true,
      });
      expect(await g.setLeadStageActive(ownerA(), second, true)).toEqual({
        ok: true,
      });
    });
  },
);

describe.skipIf(!reachable)("§130.1 duplicates on an edit", () => {
  it("warns when a contact value starts matching another Lead", async () => {
    const PHONE = freshPhone();
    const other = await newLead(fixture.owner, {
      name: `Existing ${RUN}`,
      phone: PHONE,
      phoneNormalised: PHONE,
    });
    const id = await newLead(fixture.owner, { name: `Editing ${RUN}` });

    const result = await g.editLead(
      ownerA(),
      id,
      await revisionOf(id),
      await payload(id, { phone: PHONE, phoneNormalised: PHONE }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe("duplicate");
    expect(
      result.ok === false && result.reason === "duplicate"
        ? result.candidates.map((c) => c.id)
        : [],
    ).toEqual([other]);

    // Nothing written: not the Lead, not its history.
    expect((await raw(id)).phone).not.toBe(PHONE);
    expect(await kinds(id)).toEqual(["record_created"]);
  });

  it("never reports the Lead being edited as its own duplicate", async () => {
    const PHONE = freshPhone();
    const id = await newLead(fixture.owner, {
      name: `Self ${RUN}`,
      phone: PHONE,
      phoneNormalised: PHONE,
    });

    // The email changes, so the check runs; the phone is unchanged and is
    // this Lead's own, which must not match itself.
    const result = await g.editLead(
      ownerA(),
      id,
      await revisionOf(id),
      await payload(id, {
        email: `self.${RUN}@example.test`,
        emailNormalised: `self.${RUN}@example.test`,
      }),
    );
    expect(result).toEqual({ ok: true });
    expect((await raw(id)).email).toBe(`self.${RUN}@example.test`);
  });

  it("applies the change, the audit record and the history together on override", async () => {
    const PHONE = freshPhone();
    await newLead(fixture.owner, {
      name: `Existing ${RUN}`,
      phone: PHONE,
      phoneNormalised: PHONE,
    });
    const id = await newLead(fixture.owner, { name: `Overriding ${RUN}` });

    const result = await g.editLead(
      ownerA(),
      id,
      await revisionOf(id),
      await payload(id, { phone: PHONE, phoneNormalised: PHONE }),
      { override: true, overrideExplanation: "Same family, different person" },
    );
    expect(result).toEqual({ ok: true });
    expect((await raw(id)).phone).toBe(PHONE);
    expect(await kinds(id)).toEqual(["details_edited", "record_created"]);

    const overrides = (await admin()`
      select explanation, matched_fields from public.lead_duplicate_overrides
       where lead_id = ${id}`) as unknown as {
      explanation: string | null;
      matched_fields: string[];
    }[];
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.explanation).toBe("Same family, different person");
    expect(overrides[0]!.matched_fields).toEqual(["phone"]);
  });
});

describe.skipIf(!reachable)("§39 notes", () => {
  it("adds a note without touching the Lead or its revision", async () => {
    const id = await newLead();
    const before = await raw(id);
    expect(await g.addLeadNote(ownerA(), id, `Spoke today ${RUN}`)).toEqual({
      ok: true,
    });

    const after = await raw(id);
    expect(after.revision).toBe(before.revision);
    const [entry] = await g.leadActivity(ownerA(), id);
    expect(entry!.kind).toBe("note_added");
    expect(entry!.note).toBe(`Spoke today ${RUN}`);
  });

  it("refuses a note past the documented limit, at the database", async () => {
    // The validation layer stops this first; the CHECK is the backstop, so
    // a note cannot grow without limit through any other path.
    const id = await newLead();
    const result = await g.addLeadNote(ownerA(), id, "x".repeat(2001));
    expect(result).toEqual({ ok: false, reason: "refused" });
    expect(await kinds(id)).toEqual(["record_created"]);
  });

  it("refuses a note on a Lead §162.1 does not show the actor", async () => {
    const id = await newLead(fixture.owner);
    expect(await g.addLeadNote(staffA(), id, `Peeking ${RUN}`)).toEqual({
      ok: false,
      reason: "not_permitted",
    });
    expect(await kinds(id)).toEqual(["record_created"]);
  });
});

describe.skipIf(!reachable)(
  "authority is rechecked, and the locks order",
  () => {
    it("refuses an edit by a member who has since been deactivated", async () => {
      const target = fixture.manager;
      await admin()`
      update public.workspace_memberships set status = 'active'
       where workspace_id = ${fixture.workspaceA}
         and user_profile_id = ${target.userProfileId}`;
      await admin()`
      update public.workspaces set manager_record_scope = 'all_records'
       where id = ${fixture.workspaceA}`;

      const id = await newLead();
      const opened = await revisionOf(id);
      await admin()`
      update public.workspace_memberships set status = 'inactive'
       where workspace_id = ${fixture.workspaceA}
         and user_profile_id = ${target.userProfileId}`;

      const result = await g.editLead(
        ctx(target, fixture.workspaceA),
        id,
        opened,
        await payload(id, { name: `By a former member ${RUN}` }),
      );
      expect(result).toEqual({ ok: false, reason: "not_permitted" });
      expect(await kinds(id)).toEqual(["record_created"]);

      await admin()`
      update public.workspace_memberships set status = 'active'
       where workspace_id = ${fixture.workspaceA}
         and user_profile_id = ${target.userProfileId}`;
      await admin()`
      update public.workspaces set manager_record_scope = null
       where id = ${fixture.workspaceA}`;
    });

    /**
     * The race the stage lock exists for.
     *
     * A Lead is being moved into a column while that column is being switched
     * off. The move takes the stage lock first and then reads `is_active`, so
     * it either happens before the deactivation (which then finds the Lead and
     * is refused) or after it (and is refused itself). It can never land a
     * Lead in a closed column.
     */
    it("never lands a Lead in a column that was being switched off", async () => {
      const target = stages.get(fixture.workspaceA)!.second;
      await admin()`
      update public.workspace_lead_stages set is_active = true
       where id = ${target}`;
      await clearStage(target);

      const id = await newLead();
      const opened = await revisionOf(id);

      let release: (() => void) | undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });

      // The deactivation: stage lock, write, then hold the transaction open.
      const deactivating = runtime()
        .begin(async (tx) => {
          await tx`select set_config('app.auth_user_id', ${fixture.owner.authUserId}, true)`;
          await tx`select set_config('app.user_profile_id', ${fixture.owner.userProfileId}, true)`;
          await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
          await tx`select stage_id from app.lock_lead_stage(${target}::uuid)`;
          await tx`
          update public.workspace_lead_stages set is_active = false
           where id = ${target}`;
          await held;
        })
        .then(
          () => "deactivated" as const,
          (error: { message?: string }) => `refused:${error.message ?? "?"}`,
        );

      await new Promise((resolve) => setTimeout(resolve, 250));
      const moving = g.changeLeadStage(ownerA(), id, opened, target);
      await new Promise((resolve) => setTimeout(resolve, 250));
      release?.();

      expect(await deactivating).toBe("deactivated");
      // It waited on the stage lock, then read the committed `is_active`.
      expect(await moving).toEqual({ ok: false, reason: "stage_unavailable" });

      const [closed] = (await admin()`
      select count(*)::int as n from public.leads l
        join public.workspace_lead_stages s
          on s.workspace_id = l.workspace_id and s.id = l.stage_id
       where l.workspace_id = ${fixture.workspaceA} and s.is_active = false`) as unknown as {
        n: number;
      }[];
      // The invariant, stated directly: no Lead sits in a closed column.
      expect(closed!.n).toBe(0);

      await admin()`
      update public.workspace_lead_stages set is_active = true
       where id = ${target}`;
    }, 20_000);

    /**
     * The other pair: a stage move and the deactivation of the person making
     * it. The move takes the stage lock and then the member's row; the
     * deactivation takes only the member's row. Same order, so no cycle — and
     * the mover's authority is rechecked after the wait.
     */
    it("leaves no stage move credited to a member deactivated meanwhile", async () => {
      const target = fixture.manager;
      await admin()`
      update public.workspace_memberships set status = 'active'
       where workspace_id = ${fixture.workspaceA}
         and user_profile_id = ${target.userProfileId}`;
      await admin()`
      update public.workspaces set manager_record_scope = 'all_records'
       where id = ${fixture.workspaceA}`;
      await admin()`
      delete from public.lead_activities
       where workspace_id = ${fixture.workspaceA}
         and actor_user_profile_id = ${target.userProfileId}`;
      await admin()`
      delete from public.leads
       where workspace_id = ${fixture.workspaceA}
         and record_owner_user_profile_id = ${target.userProfileId}`;

      const id = await newLead();
      const opened = await revisionOf(id);

      let release: (() => void) | undefined;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });

      // The deactivation holds the member row open.
      const deactivating = runtime()
        .begin(async (tx) => {
          await tx`select set_config('app.auth_user_id', ${fixture.owner.authUserId}, true)`;
          await tx`select set_config('app.user_profile_id', ${fixture.owner.userProfileId}, true)`;
          await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
          await tx`
          select app.set_member_status(${target.userProfileId}::uuid, 'inactive')`;
          await held;
        })
        .then(
          () => "deactivated" as const,
          (error: { message?: string }) => `refused:${error.message ?? "?"}`,
        );

      await new Promise((resolve) => setTimeout(resolve, 250));
      const moving = g.changeLeadStage(
        ctx(target, fixture.workspaceA),
        id,
        opened,
        stages.get(fixture.workspaceA)!.second,
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
      release?.();

      expect(await deactivating).toBe("deactivated");
      // Rechecked after the wait, against the committed status.
      expect(await moving).toEqual({ ok: false, reason: "not_permitted" });
      expect(await kinds(id)).toEqual(["record_created"]);

      await admin()`
      update public.workspace_memberships set status = 'active'
       where workspace_id = ${fixture.workspaceA}
         and user_profile_id = ${target.userProfileId}`;
      await admin()`
      update public.workspaces set manager_record_scope = null
       where id = ${fixture.workspaceA}`;
    }, 20_000);
  },
);

describe.skipIf(!reachable)(
  "§39: history is complete, not merely remembered",
  () => {
    /**
     * What this is about, and why it is not a theoretical concern.
     *
     * Measured before the triggers existed, `limenzy_app` — the application's
     * own runtime role, not privileged tooling — could insert a Lead with no
     * creation entry and update any column it holds a grant on with no entry
     * at all. The gateway wrote history correctly; nothing made it. A new
     * code path that forgot would have produced a quietly incomplete §39
     * timeline, which is worse than no timeline because it reads as one.
     *
     * These drive the table DIRECTLY, bypassing the gateway entirely, which
     * is the only way to ask whether the guarantee lives in the database.
     */

    /** A statement run as the runtime role, with a tenant context. */
    const asApp = (
      fn: (tx: postgres.TransactionSql) => Promise<void>,
      who = fixture.owner,
    ) =>
      runtime().begin(async (tx) => {
        await tx`select set_config('app.auth_user_id', ${who.authUserId}, true)`;
        await tx`select set_config('app.user_profile_id', ${who.userProfileId}, true)`;
        await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
        await fn(tx);
      });

    /** Write the entry a change owes, the way the gateway would. */
    const entryFor = (
      tx: postgres.TransactionSql,
      leadId: string,
      kind: string,
      extra: { from?: string; to?: string } = {},
    ) =>
      tx`
        insert into public.lead_activities
          (workspace_id, lead_id, kind, actor_user_profile_id,
           from_stage_id, to_stage_id, changed_fields)
        values (${fixture.workspaceA}, ${leadId}::uuid,
                ${kind}::public.lead_activity_kind,
                ${fixture.owner.userProfileId},
                ${extra.from ?? null}, ${extra.to ?? null},
                ${kind === "details_edited" ? ["name"] : null})`;

    it("writes the creation entry for a Lead the runtime role inserts directly", async () => {
      let id = "";
      await asApp(async (tx) => {
        const [row] = await tx<{ id: string }[]>`
          insert into public.leads
            (workspace_id, name, phone, phone_normalised, stage_id,
             record_owner_user_profile_id, created_by_user_profile_id)
          values (${fixture.workspaceA}, ${`Direct ${RUN}`}, ${freshPhone()},
                  ${freshPhone()}, ${stages.get(fixture.workspaceA)!.first}::uuid,
                  ${fixture.owner.userProfileId},
                  ${fixture.owner.userProfileId})
          returning id`;
        id = row!.id;
      });

      const entries = await g.leadActivity(ownerA(), id);
      expect(entries.map((e) => e.kind)).toEqual(["record_created"]);
      expect(entries[0]!.actorUserProfileId).toBe(fixture.owner.userProfileId);
    });

    it("writes one for a Lead seeded by privileged tooling too", async () => {
      // The distinction the report has to make: tooling bypasses row-level
      // security, but it does not bypass a trigger. A Lead inserted by the
      // migration role gets its entry, attributed to its recorded creator.
      const phone = freshPhone();
      const [row] = (await admin()`
        insert into public.leads
          (workspace_id, name, phone, phone_normalised, stage_id,
           record_owner_user_profile_id, created_by_user_profile_id)
        values (${fixture.workspaceA}, ${`Tooling ${RUN}`}, ${phone},
                ${phone}, ${stages.get(fixture.workspaceA)!.first},
                ${fixture.shared.userProfileId},
                ${fixture.shared.userProfileId})
        returning id`) as unknown as { id: string }[];

      const [entry] = (await admin()`
        select kind::text as kind, actor_user_profile_id, lead_revision
          from public.lead_activities where lead_id = ${row!.id}`) as unknown as {
        kind: string;
        actor_user_profile_id: string;
        lead_revision: number;
      }[];
      expect(entry).toEqual({
        kind: "record_created",
        actor_user_profile_id: fixture.shared.userProfileId,
        lead_revision: 1,
      });
    });

    it("refuses a detail change that leaves no entry, and keeps the old value", async () => {
      const id = await newLead();
      const before = await raw(id);

      await expect(
        asApp(async (tx) => {
          await tx`
            update public.leads set name = ${`Unrecorded ${RUN}`}
             where id = ${id}::uuid`;
        }),
      ).rejects.toThrow(/no history entry for revision/i);

      // The whole transaction went, so the Lead did not change either.
      const after = await raw(id);
      expect(after.name).toBe(before.name);
      expect(after.revision).toBe(before.revision);
      expect(await kinds(id)).toEqual(["record_created"]);
    });

    it("refuses a stage change that leaves no entry", async () => {
      const id = await newLead();
      await expect(
        asApp(async (tx) => {
          await tx`
            update public.leads
               set stage_id = ${stages.get(fixture.workspaceA)!.second}::uuid
             where id = ${id}::uuid`;
        }),
      ).rejects.toThrow(/no history entry for revision/i);
      expect((await raw(id)).stage_id).toBe(
        stages.get(fixture.workspaceA)!.first,
      );
    });

    it("accepts the same change when its entry comes with it", async () => {
      const id = await newLead();
      await asApp(async (tx) => {
        await tx`
          update public.leads set name = ${`Recorded ${RUN}`}
           where id = ${id}::uuid`;
        await entryFor(tx, id, "details_edited");
      });
      expect((await raw(id)).name).toBe(`Recorded ${RUN}`);
      expect(await kinds(id)).toEqual(["details_edited", "record_created"]);
    });

    it("refuses an entry written BEFORE the change it claims to describe", async () => {
      // The stamp is read from the Lead row, so an entry written first
      // carries the old revision and satisfies nothing. This is why the
      // gateway writes the entry after the update, and why that ordering is
      // a rule rather than a style.
      const id = await newLead();
      await expect(
        asApp(async (tx) => {
          await entryFor(tx, id, "details_edited");
          await tx`
            update public.leads set name = ${`Out of order ${RUN}`}
             where id = ${id}::uuid`;
        }),
      ).rejects.toThrow(/no history entry for revision/i);
    });

    it("does not let a note stand in for the entry a change owes", async () => {
      const id = await newLead();
      await expect(
        asApp(async (tx) => {
          await tx`
            update public.leads set name = ${`Noted ${RUN}`}
             where id = ${id}::uuid`;
          await tx`
            insert into public.lead_activities
              (workspace_id, lead_id, kind, actor_user_profile_id, note)
            values (${fixture.workspaceA}, ${id}::uuid, 'note_added',
                    ${fixture.owner.userProfileId}, ${`Covering ${RUN}`})`;
        }),
      ).rejects.toThrow(/no history entry for revision/i);
    });

    it("demands an entry for each change when a transaction makes two", async () => {
      const id = await newLead();
      await expect(
        asApp(async (tx) => {
          await tx`
            update public.leads set name = ${`First ${RUN}`}
             where id = ${id}::uuid`;
          await entryFor(tx, id, "details_edited");
          // The second change moves the revision again, and owes its own.
          await tx`
            update public.leads set notes = ${`Second ${RUN}`}
             where id = ${id}::uuid`;
        }),
      ).rejects.toThrow(/no history entry for revision/i);
    });

    it("asks nothing of an update that changes nothing material", async () => {
      const id = await newLead();
      const before = await raw(id);
      await asApp(async (tx) => {
        await tx`
          update public.leads set name = ${before.name}
           where id = ${id}::uuid`;
      });
      expect(await kinds(id)).toEqual(["record_created"]);
    });

    it("gives no role a grant to stamp an entry itself", async () => {
      const [row] = (await admin()`
        select has_column_privilege('limenzy_app', 'public.lead_activities',
                 'lead_revision', 'INSERT') as ins,
               has_column_privilege('limenzy_app', 'public.lead_activities',
                 'lead_revision', 'UPDATE') as upd`) as unknown as {
        ins: boolean;
        upd: boolean;
      }[];
      expect(row).toEqual({ ins: false, upd: false });
    });

    it("stamps every gateway entry with the revision it describes", async () => {
      const id = await newLead();
      await g.editLead(
        ownerA(),
        id,
        await revisionOf(id),
        await payload(id, { name: `Stamped ${RUN}` }),
      );
      await g.changeLeadStage(
        ownerA(),
        id,
        await revisionOf(id),
        stages.get(fixture.workspaceA)!.second,
      );

      const rows = (await admin()`
        select kind::text as kind, lead_revision from public.lead_activities
         where lead_id = ${id} order by lead_revision`) as unknown as {
        kind: string;
        lead_revision: number;
      }[];
      expect(rows).toEqual([
        { kind: "record_created", lead_revision: 1 },
        { kind: "details_edited", lead_revision: 2 },
        { kind: "stage_changed", lead_revision: 3 },
      ]);
      // And the Lead agrees: the last stamp is where the token now stands.
      expect((await raw(id)).revision).toBe(3);
    });
  },
);
