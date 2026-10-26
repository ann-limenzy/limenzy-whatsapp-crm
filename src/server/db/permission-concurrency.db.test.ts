import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertMatchedDatabaseTargets } from "../../../scripts/database-target.mjs";
import { CONFIGURABLE_PERMISSIONS } from "@/lib/permissions";
import {
  cleanupTenantFixture,
  createTenantFixture,
  type TenantFixture,
} from "@/test/fixtures/tenant-fixture";

/**
 * Concurrent §162 permission edits.
 *
 * `setPermissionGranted` stores the whole grant set in one array column, so
 * changing one cell means reading the array, changing one entry and writing
 * the array back. That is a read-modify-write, and without a lock two
 * administrators toggling two DIFFERENT cells at the same moment both read
 * the same array and the second write silently erases the first. The screen
 * then shows a cell that was just switched on as off again, with nothing to
 * say why — a permission change that appears to have been accepted and was
 * not is the worst shape this fault can take.
 *
 * Only a real database can show it. The window is between two statements in
 * one transaction, and whether the second transaction sees the first one's
 * row depends on isolation level, on row locks and on PostgreSQL's
 * READ COMMITTED re-check — none of which a mocked client has.
 *
 * The race is made DETERMINISTIC rather than hoped for. A third transaction
 * holds the workspace row, both edits are started and allowed to reach their
 * first blocking point, and only then is the row released. Without the lock
 * on the read, both edits sail past a held row lock on their SELECT (an
 * ordinary SELECT never blocks) and collide on the UPDATE; with it, they
 * queue, and the second re-reads what the first committed.
 *
 * WHAT IS NOT TESTED HERE, DELIBERATELY. Who may configure a workspace is
 * settled in `settings-isolation.db.test.ts` and is not restated. The tests
 * below assume an authorised actor and ask only whether two of them can
 * destroy each other's work.
 */

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

const probe = async (url: string): Promise<postgres.Sql | undefined> => {
  if (!url) return undefined;
  const candidate = postgres(url, {
    max: 4,
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
    '[test:db] the permission concurrency suite needs both connections. Run "npm run test:db:local".',
  );
}

const admin = () => {
  if (!tooling) throw new Error("no tooling connection");
  return tooling;
};

const RUN = randomUUID().slice(0, 8);
let fixture: TenantFixture;
let recorded: Awaited<ReturnType<typeof createTenantFixture>>["recorded"];

type Gateways = {
  createTenantContext: typeof import("./tenant-context").createTenantContext;
  setPermissionGranted: typeof import("@/server/auth/workspace-permissions").setPermissionGranted;
  workspacePermissionSettings: typeof import("@/server/auth/workspace-permissions").workspacePermissionSettings;
  runtimeSql: typeof import("./client").runtimeSql;
};
let g: Gateways;

/*
 * Two different configurable cells, taken from the matrix rather than written
 * down here. If §162 changes which cells a workspace may configure, this
 * suite follows it instead of testing a cell that no longer exists.
 */
const [FIRST, SECOND] = (() => {
  const actions = [
    ...new Set(CONFIGURABLE_PERMISSIONS.map((entry) => entry.action)),
  ];
  if (actions.length < 2) {
    throw new Error("the §162 matrix needs two configurable cells to race");
  }
  return actions;
})() as [string, string];

beforeAll(async () => {
  if (!reachable) return;
  ({ fixture, recorded } = await createTenantFixture(admin(), RUN));
  const [context, permissions, client] = await Promise.all([
    import("./tenant-context"),
    import("@/server/auth/workspace-permissions"),
    import("./client"),
  ]);
  g = {
    createTenantContext: context.createTenantContext,
    setPermissionGranted: permissions.setPermissionGranted,
    workspacePermissionSettings: permissions.workspacePermissionSettings,
    runtimeSql: client.runtimeSql,
  };
}, 30_000);

afterAll(async () => {
  if (reachable && recorded) {
    const problems = await cleanupTenantFixture(admin(), recorded);
    if (problems.length > 0) {
      console.error("[permission concurrency] cleanup problems:", problems);
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

const ownerA = () =>
  g.createTenantContext({
    authUserId: fixture.owner.authUserId,
    userProfileId: fixture.owner.userProfileId,
    workspaceId: fixture.workspaceA,
  });

/** Put the column back to a known starting point. */
async function startFrom(value: string[] | null) {
  await admin()`
    update public.workspaces set permissions_granted = ${value as never}
     where id = ${fixture.workspaceA}`;
}

/** Read the stored column directly, past the gateway's own interpretation. */
async function stored(): Promise<string[] | null> {
  const [row] = (await admin()`
    select permissions_granted from public.workspaces
     where id = ${fixture.workspaceA}`) as unknown as {
    permissions_granted: string[] | null;
  }[];
  return row?.permissions_granted ?? null;
}

/** How many sessions are waiting on a lock to touch this column. */
async function waitingOnPermissions(): Promise<number> {
  const [row] = (await admin()`
    select count(*)::int as n from pg_stat_activity
     where wait_event_type = 'Lock' and state = 'active'
       and query ilike '%permissions_granted%'`) as unknown as { n: number }[];
  return row?.n ?? 0;
}

/**
 * Run two edits with both of them demonstrably in flight at once.
 *
 * The workspace row is held by a third transaction until both callers have
 * reached their first blocking statement, so the overlap is guaranteed rather
 * than a matter of timing. What they block ON is the point of the test: the
 * locking read blocks immediately, an unlocked read does not and the caller
 * blocks later, on its UPDATE — and in that second case it has already read a
 * stale array.
 */
async function race(
  a: () => Promise<unknown>,
  b: () => Promise<unknown>,
): Promise<{ both: boolean; results: [unknown, unknown] }> {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });

  const holder = admin()
    .begin(async (tx) => {
      await tx`
        select permissions_granted from public.workspaces
         where id = ${fixture.workspaceA}
           for update`;
      await released;
    })
    .catch(() => {});

  const first = a();
  const second = b();

  let both = false;
  for (let i = 0; i < 100; i += 1) {
    if ((await waitingOnPermissions()) >= 2) {
      both = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  release();
  await holder;
  return { both, results: [await first, await second] };
}

describe.skipIf(!reachable)("concurrent §162 permission edits", () => {
  it("keeps both grants when two different cells are switched on at once", async () => {
    await startFrom([]);

    const { both, results } = await race(
      () => g.setPermissionGranted(ownerA(), FIRST, true),
      () => g.setPermissionGranted(ownerA(), SECOND, true),
    );

    expect(both).toBe(true);
    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toMatchObject({ ok: true });

    /*
     * The assertion the fix exists for. Lock-free, whichever call commits
     * second writes an array computed before the first one's change existed,
     * and exactly one of these two is missing.
     */
    const after = await stored();
    expect(after).toContain(FIRST);
    expect(after).toContain(SECOND);
  });

  it("keeps a grant and a revoke of different cells, in either order", async () => {
    /*
     * The asymmetric case. A lost update here does not merely drop a grant —
     * it can RESURRECT a permission an administrator just revoked, which is
     * the §162 failure that actually matters.
     */
    await startFrom([SECOND]);

    const { both, results } = await race(
      () => g.setPermissionGranted(ownerA(), FIRST, true),
      () => g.setPermissionGranted(ownerA(), SECOND, false),
    );

    expect(both).toBe(true);
    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toMatchObject({ ok: true });

    const after = await stored();
    expect(after).toContain(FIRST);
    expect(after).not.toContain(SECOND);
  });

  it("survives the same pair started in the opposite order", async () => {
    await startFrom([FIRST]);

    const { both } = await race(
      () => g.setPermissionGranted(ownerA(), SECOND, false),
      () => g.setPermissionGranted(ownerA(), FIRST, false),
    );

    expect(both).toBe(true);
    const after = await stored();
    expect(after).not.toContain(FIRST);
    expect(after).not.toContain(SECOND);
  });

  it("agrees with itself when the same cell is toggled twice at once", async () => {
    /*
     * Not a lost update — one of these two legitimately wins. What must not
     * happen is a result that matches NEITHER call, or a return value that
     * disagrees with what was stored.
     */
    await startFrom([]);

    const { results } = await race(
      () => g.setPermissionGranted(ownerA(), FIRST, true),
      () => g.setPermissionGranted(ownerA(), FIRST, false),
    );

    for (const result of results) expect(result).toMatchObject({ ok: true });
    const after = await stored();
    expect(after).toEqual(expect.any(Array));
    expect(
      (after ?? []).filter((entry) => entry === FIRST).length,
    ).toBeLessThanOrEqual(1);
  });

  it("starts from NULL without inventing a grant", async () => {
    /*
     * An unconfigured workspace stores NULL, which is NOT the same as an
     * empty array: §162.1 reads "no choice has been made" from it. Granting
     * one cell has to turn that into exactly one grant — not into every
     * default the matrix would otherwise supply.
     */
    await startFrom(null);
    expect(await stored()).toBeNull();

    const result = await g.setPermissionGranted(ownerA(), FIRST, true);
    expect(result).toMatchObject({ ok: true, granted: [FIRST] });
    expect(await stored()).toEqual([FIRST]);
  });

  it("revoking the last grant stores an empty array, not NULL", async () => {
    await startFrom([FIRST]);
    const result = await g.setPermissionGranted(ownerA(), FIRST, false);
    expect(result).toMatchObject({ ok: true, granted: [] });
    // An explicit "nothing is granted" — a made choice, not an unmade one.
    expect(await stored()).toEqual([]);
  });

  it("races from NULL without either edit losing the other", async () => {
    await startFrom(null);

    const { both } = await race(
      () => g.setPermissionGranted(ownerA(), FIRST, true),
      () => g.setPermissionGranted(ownerA(), SECOND, true),
    );

    expect(both).toBe(true);
    const after = await stored();
    expect(after).toContain(FIRST);
    expect(after).toContain(SECOND);
  });

  it("leaves another workspace's configuration alone throughout", async () => {
    await admin()`
      update public.workspaces set permissions_granted = ${[SECOND] as never}
       where id = ${fixture.workspaceB}`;

    await startFrom([]);
    await race(
      () => g.setPermissionGranted(ownerA(), FIRST, true),
      () => g.setPermissionGranted(ownerA(), SECOND, true),
    );

    const [row] = (await admin()`
      select permissions_granted from public.workspaces
       where id = ${fixture.workspaceB}`) as unknown as {
      permissions_granted: string[] | null;
    }[];
    expect(row?.permissions_granted).toEqual([SECOND]);
  });
});
