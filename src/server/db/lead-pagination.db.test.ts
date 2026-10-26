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
 * Lead list paging and §39 history continuation.
 *
 * Both routines used to stop at a flat `limit 200` with no way past it, which
 * meant two different silent failures: a workspace with more than 200 matching
 * Leads could not reach the oldest of them by any route, and a Lead worked
 * long enough had the permanent history §27 promises truncated at the screen's
 * edge.
 *
 * What needs a real database, and a unit test could not say:
 *
 *   * that a page is a window onto what §162.1 already allows — scope, search
 *     and record access are applied BEFORE the page is cut, so no page can
 *     show a Lead the actor may not see, and the reported total counts only
 *     what they may see;
 *   * that walking every page returns every matching Lead exactly once, with
 *     the tie-breaker doing its job on rows that share a `created_at` to the
 *     microsecond — which is the case the ordering gets wrong if `id` is left
 *     out, and which cannot be constructed without writing real rows;
 *   * that the history keyset returns each entry exactly once across pages
 *     when entries share an `occurred_at`, as a stage change and the note
 *     explaining it routinely do.
 *
 * WHAT IS NOT TESTED HERE, DELIBERATELY. Nothing below measures performance.
 * These are correctness tests about reachability and duplication; whether a
 * deep page is FAST is a question about indexes, and is reported rather than
 * asserted.
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
    '[test:db] the lead paging suite needs both connections. Run "npm run test:db:local".',
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
  listLeads: typeof import("@/server/auth/workspace-leads").listLeads;
  leadActivityPage: typeof import("@/server/auth/workspace-leads").leadActivityPage;
  LEAD_PAGE_SIZE: typeof import("@/server/auth/workspace-leads").LEAD_PAGE_SIZE;
  LEAD_ACTIVITY_PAGE_SIZE: typeof import("@/server/auth/workspace-leads").LEAD_ACTIVITY_PAGE_SIZE;
  runtimeSql: typeof import("./client").runtimeSql;
};
let g: Gateways;

const stageOf = new Map<string, string>();

/**
 * Seed a whole pipeline, because a workspace must keep exactly one Won and
 * one Lost stage. Only the open stage is kept: nothing here moves a Lead.
 */
async function seedPipeline(workspaceId: string) {
  const rows = (await admin()`
    insert into public.workspace_lead_stages
      (workspace_id, name, sort_order, kind)
    values
      (${workspaceId}, ${`New ${RUN}`}, 1, 'active'),
      (${workspaceId}, ${`Won ${RUN}`}, 90, 'won'),
      (${workspaceId}, ${`Lost ${RUN}`}, 91, 'lost')
    returning id, kind::text as kind
  `) as unknown as { id: string; kind: string }[];
  stageOf.set(workspaceId, rows.find((row) => row.kind === "active")!.id);
}

beforeAll(async () => {
  if (!reachable) return;
  ({ fixture, recorded } = await createTenantFixture(admin(), RUN));
  await seedPipeline(fixture.workspaceA);
  await seedPipeline(fixture.workspaceB);
  const [context, leads, client] = await Promise.all([
    import("./tenant-context"),
    import("@/server/auth/workspace-leads"),
    import("./client"),
  ]);
  g = {
    createTenantContext: context.createTenantContext,
    listLeads: leads.listLeads,
    leadActivityPage: leads.leadActivityPage,
    LEAD_PAGE_SIZE: leads.LEAD_PAGE_SIZE,
    LEAD_ACTIVITY_PAGE_SIZE: leads.LEAD_ACTIVITY_PAGE_SIZE,
    runtimeSql: client.runtimeSql,
  };
}, 60_000);

afterAll(async () => {
  if (reachable && recorded) {
    for (const workspace of recorded.workspaces) {
      await admin()`
        delete from public.lead_activities where workspace_id = ${workspace}`.catch(
        () => {},
      );
      await admin()`
        delete from public.leads where workspace_id = ${workspace}`.catch(
        () => {},
      );
      await admin()`
        delete from public.workspace_lead_stages where workspace_id = ${workspace}`.catch(
        () => {},
      );
    }
    const problems = await cleanupTenantFixture(admin(), recorded);
    if (problems.length > 0) {
      console.error("[lead paging] cleanup problems:", problems);
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
const ownerB = () => ctx(fixture.shared, fixture.workspaceB);

/**
 * Seed `count` Leads in one statement, ALL SHARING ONE `created_at`.
 *
 * The shared timestamp is the point. `created_at` defaults to `now()`, which
 * inside a single statement is the same value for every row anyway — and that
 * is exactly the condition under which an order on `created_at` alone is
 * undefined. Seeding them this way means the suite is testing the tie-breaker
 * on every assertion rather than on a case someone has to remember to
 * construct.
 */
async function seedLeads(
  workspaceId: string,
  ownerProfileId: string,
  count: number,
  label: string,
): Promise<readonly string[]> {
  const stage = stageOf.get(workspaceId)!;
  const rows = (await admin()`
    insert into public.leads
      (workspace_id, name, phone, phone_normalised, stage_id,
       record_owner_user_profile_id, created_by_user_profile_id)
    select ${workspaceId},
           ${label} || ' ' || lpad(n::text, 4, '0'),
           '+9190000' || lpad(n::text, 5, '0'),
           '+9190000' || lpad(n::text, 5, '0'),
           ${stage}, ${ownerProfileId}, ${ownerProfileId}
      from generate_series(1, ${count}) as n
    returning id
  `) as unknown as { id: string }[];
  return rows.map((row) => row.id);
}

type Walked = {
  ids: string[];
  keys: { createdAt: number; id: string }[];
  total: number;
  pageCount: number;
};

/** Walk every page, newest first, and return what was seen, in order. */
async function walkLeads(
  context: Awaited<ReturnType<typeof ctx>>,
  options: { scope: "all" | "mine"; search?: string },
): Promise<Walked> {
  const first = await g.listLeads(context, { ...options, page: 1 });
  const items = [...first.items];
  for (let page = 2; page <= first.pageCount; page += 1) {
    const next = await g.listLeads(context, { ...options, page });
    items.push(...next.items);
  }
  return {
    ids: items.map((item) => item.id),
    keys: items.map((item) => ({
      createdAt: item.createdAt.getTime(),
      id: item.id,
    })),
    total: first.total,
    pageCount: first.pageCount,
  };
}

/**
 * Assert the sort key is a TOTAL order, strictly descending.
 *
 * This is the property OFFSET paging actually rests on. If two rows can
 * compare equal under the ORDER BY, their relative position is undefined,
 * and the row that happens to sit at the page boundary can be served twice
 * or never. Asserting it directly catches a tie-breaker that is missing,
 * pointed the wrong way, or not unique — none of which is reliably visible
 * from the page contents alone, because a given plan may happen to be
 * consistent on a given run.
 */
function assertTotallyOrdered(keys: Walked["keys"]) {
  for (let i = 1; i < keys.length; i += 1) {
    const previous = keys[i - 1]!;
    const current = keys[i]!;
    const descends =
      previous.createdAt > current.createdAt ||
      (previous.createdAt === current.createdAt && previous.id > current.id);
    expect(
      descends,
      `position ${i} does not descend: ${JSON.stringify(previous)} then ${JSON.stringify(current)}`,
    ).toBe(true);
  }
}

describe.skipIf(!reachable)("Lead list paging", () => {
  it("reaches every matching lead, exactly once, across pages", async () => {
    /*
     * Two and a half pages, so the last page is deliberately a PARTIAL one.
     * An off-by-one in the offset shows up at a page boundary, and a full
     * final page hides the end-of-list case entirely.
     */
    const wanted = g.LEAD_PAGE_SIZE * 2 + Math.floor(g.LEAD_PAGE_SIZE / 2);
    const seeded = await seedLeads(
      fixture.workspaceA,
      fixture.owner.userProfileId,
      wanted,
      `Walk ${RUN}`,
    );

    const { ids, keys, total, pageCount } = await walkLeads(ownerA(), {
      scope: "all",
      search: `Walk ${RUN}`,
    });

    assertTotallyOrdered(keys);
    expect(total).toBe(wanted);
    expect(pageCount).toBe(3);
    // Every seeded lead reached...
    expect(new Set(ids)).toEqual(new Set(seeded));
    // ...and none of them twice, which is what the tie-breaker is for.
    expect(ids).toHaveLength(wanted);
    expect(new Set(ids).size).toBe(wanted);
  });

  it("orders stably enough that page two never repeats page one", async () => {
    const search = `Stable ${RUN}`;
    await seedLeads(
      fixture.workspaceA,
      fixture.owner.userProfileId,
      g.LEAD_PAGE_SIZE + 5,
      search,
    );

    /*
     * Asked for twice, in the opposite order, through separate round trips.
     * All these rows share one `created_at`, so without `id` as a second key
     * PostgreSQL is free to return them in a different order each time — and
     * then an offset of 50 lands somewhere else, repeating rows from page one
     * and losing rows that are never shown on any page.
     */
    const two = await g.listLeads(ownerA(), { scope: "all", search, page: 2 });
    const one = await g.listLeads(ownerA(), { scope: "all", search, page: 1 });
    const oneAgain = await g.listLeads(ownerA(), {
      scope: "all",
      search,
      page: 1,
    });

    expect(one.items.map((i) => i.id)).toEqual(oneAgain.items.map((i) => i.id));
    const firstPage = new Set(one.items.map((i) => i.id));
    for (const item of two.items) {
      expect(firstPage.has(item.id)).toBe(false);
    }
  });

  it("still reaches every lead when rows are touched mid-walk", async () => {
    /*
     * The case the tie-breaker is actually FOR, and it needs a nudge to be
     * reproducible. All these rows share one `created_at`, so ordering by
     * that alone leaves PostgreSQL free to return ties in whatever order the
     * scan produced them — and an UPDATE rewrites a row at the end of the
     * heap, changing exactly that. Between two page reads, the rows that sort
     * into positions 50 and 51 can therefore swap, which on an OFFSET page
     * means one lead is served twice and another is never served at all.
     *
     * Touching rows between page reads is not contrived: a list is paged by
     * a person while their colleagues are editing the same leads.
     */
    const search = `Churn ${RUN}`;
    const seeded = await seedLeads(
      fixture.workspaceA,
      fixture.owner.userProfileId,
      g.LEAD_PAGE_SIZE * 2 + 10,
      search,
    );

    const ids: string[] = [];
    const first = await g.listLeads(ownerA(), {
      scope: "all",
      search,
      page: 1,
    });
    ids.push(...first.items.map((item) => item.id));

    for (let page = 2; page <= first.pageCount; page += 1) {
      /*
       * Rewrite a handful of rows the reader has already passed. Only
       * `updated_at` changes, so nothing about which leads match or how they
       * sort by `created_at` is altered — only their physical order.
       */
      await admin()`
        update public.leads set updated_at = now()
         where id = any(${ids.slice(0, 8)}::uuid[])`;

      const next = await g.listLeads(ownerA(), { scope: "all", search, page });
      ids.push(...next.items.map((item) => item.id));
    }

    expect(new Set(ids).size).toBe(seeded.length);
    expect(ids).toHaveLength(seeded.length);
    expect(new Set(ids)).toEqual(new Set(seeded));
  });

  it("counts only what this actor may see, not the workspace", async () => {
    const search = `Scoped ${RUN}`;
    await seedLeads(
      fixture.workspaceA,
      fixture.owner.userProfileId,
      30,
      search,
    );
    await seedLeads(
      fixture.workspaceA,
      fixture.shared.userProfileId,
      12,
      search,
    );

    // §162.1: a Staff/Sales user sees the leads they own and no others.
    const staff = await g.listLeads(staffA(), { scope: "all", search });
    expect(staff.total).toBe(12);
    expect(staff.items).toHaveLength(12);
    for (const item of staff.items) expect(item.isOwnedByActor).toBe(true);

    // The Owner/Admin sees both sets, and the total says so.
    const owner = await g.listLeads(ownerA(), { scope: "all", search });
    expect(owner.total).toBe(42);
  });

  it("counts the My Leads filter, not the whole list", async () => {
    const search = `Mine ${RUN}`;
    await seedLeads(fixture.workspaceA, fixture.owner.userProfileId, 9, search);
    await seedLeads(
      fixture.workspaceA,
      fixture.shared.userProfileId,
      4,
      search,
    );

    const all = await g.listLeads(ownerA(), { scope: "all", search });
    const mine = await g.listLeads(ownerA(), { scope: "mine", search });
    expect(all.total).toBe(13);
    expect(mine.total).toBe(9);
    expect(mine.items).toHaveLength(9);
  });

  it("never pages into another workspace", async () => {
    const search = `Tenant ${RUN}`;
    await seedLeads(
      fixture.workspaceB,
      fixture.shared.userProfileId,
      g.LEAD_PAGE_SIZE + 3,
      search,
    );

    /*
     * Workspace A holds nothing matching. If the page were cut before the
     * tenant predicate — or if the total came from a query that forgot it —
     * this is where B's rows would leak, and the count would be the giveaway
     * even when the items happened to be empty.
     */
    const fromA = await g.listLeads(ownerA(), { scope: "all", search });
    expect(fromA.total).toBe(0);
    expect(fromA.items).toHaveLength(0);
    expect(fromA.pageCount).toBe(1);

    const fromB = await walkLeads(ownerB(), { scope: "all", search });
    assertTotallyOrdered(fromB.keys);
    expect(fromB.total).toBe(g.LEAD_PAGE_SIZE + 3);
    expect(fromB.ids).toHaveLength(g.LEAD_PAGE_SIZE + 3);
  });

  it("serves the last page when the requested one is past the end", async () => {
    const search = `Past ${RUN}`;
    await seedLeads(fixture.workspaceA, fixture.owner.userProfileId, 7, search);

    /*
     * A page number arrives from a pasted link or a stale bookmark as readily
     * as from the pager. Returning nothing for it shows an empty list that
     * reads as "no matches" while seven leads match — so the last real page
     * is served instead, and the reported page number matches the rows that
     * came with it.
     */
    const far = await g.listLeads(ownerA(), { scope: "all", search, page: 99 });
    expect(far.total).toBe(7);
    expect(far.pageCount).toBe(1);
    expect(far.page).toBe(1);
    expect(far.items).toHaveLength(7);

    const onPageOne = await g.listLeads(ownerA(), {
      scope: "all",
      search,
      page: 1,
    });
    expect(far.items.map((i) => i.id)).toEqual(
      onPageOne.items.map((i) => i.id),
    );
  });

  it("lands on the last page of a longer list, not an empty one", async () => {
    const search = `Deep ${RUN}`;
    const seeded = await seedLeads(
      fixture.workspaceA,
      fixture.owner.userProfileId,
      g.LEAD_PAGE_SIZE + 5,
      search,
    );

    const far = await g.listLeads(ownerA(), { scope: "all", search, page: 40 });
    expect(far.total).toBe(seeded.length);
    expect(far.pageCount).toBe(2);
    // Page 2, with page 2's five rows — not page 40 with none.
    expect(far.page).toBe(2);
    expect(far.items).toHaveLength(5);

    const real = await g.listLeads(ownerA(), { scope: "all", search, page: 2 });
    expect(far.items.map((i) => i.id)).toEqual(real.items.map((i) => i.id));
  });

  it("reports an honest empty result when nothing matches at all", async () => {
    const far = await g.listLeads(ownerA(), {
      scope: "all",
      search: `Nothing ${RUN}`,
      page: 7,
    });
    expect(far.items).toHaveLength(0);
    expect(far.total).toBe(0);
    expect(far.pageCount).toBe(1);
    expect(far.page).toBe(1);
  });

  it("treats a nonsensical page as the first one", async () => {
    const search = `Guard ${RUN}`;
    await seedLeads(fixture.workspaceA, fixture.owner.userProfileId, 3, search);

    for (const page of [0, -5, 1.5, Number.NaN]) {
      const result = await g.listLeads(ownerA(), {
        scope: "all",
        search,
        page,
      });
      expect(result.page).toBe(1);
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
    }
  });
});

describe.skipIf(!reachable)("§39 history continuation", () => {
  /**
   * A lead whose history holds exactly `total` entries, all at one
   * `occurred_at`.
   *
   * Creating a Lead writes its own §39 `record_created` entry, so the notes
   * seeded here are one fewer than the total asked for. Writing the number
   * down twice is what makes the off-by-one tests below mean anything: a
   * history of exactly one page has to report no more pages, and the entry
   * the database wrote is as real as the ones this fixture did.
   */
  async function seedHistory(total: number): Promise<string> {
    const count = total - 1;
    const [lead] = (await admin()`
      insert into public.leads
        (workspace_id, name, phone, phone_normalised, stage_id,
         record_owner_user_profile_id, created_by_user_profile_id)
      values (${fixture.workspaceA}, ${`History ${RUN}`}, '+919111111111',
              '+919111111111', ${stageOf.get(fixture.workspaceA)!},
              ${fixture.owner.userProfileId}, ${fixture.owner.userProfileId})
      returning id
    `) as unknown as { id: string }[];

    /*
     * One statement, so `occurred_at` is identical on every row. §27's
     * history is written this way in real use too — a stage change and the
     * note explaining it land in the same write and share a timestamp to the
     * microsecond. A cursor on the timestamp alone either skips the rest of
     * that instant or repeats all of it.
     */
    await admin()`
      insert into public.lead_activities
        (workspace_id, lead_id, kind, actor_user_profile_id, note)
      select ${fixture.workspaceA}, ${lead!.id}, 'note_added',
             ${fixture.owner.userProfileId},
             'Entry ' || lpad(n::text, 4, '0')
        from generate_series(1, ${count}) as n
    `;

    const [check] = (await admin()`
      select count(*)::int as n from public.lead_activities
       where lead_id = ${lead!.id}`) as unknown as { n: number }[];
    if (check!.n !== total) {
      throw new Error(
        `[lead paging] seeded ${check!.n} history entries, wanted ${total}`,
      );
    }
    return lead!.id;
  }

  it("walks the whole history, with no entry seen twice or missed", async () => {
    const size = g.LEAD_ACTIVITY_PAGE_SIZE;
    const total = size * 2 + 7;
    const lead = await seedHistory(total);

    const seen: string[] = [];
    let page = await g.leadActivityPage(ownerA(), lead);
    seen.push(...page.entries.map((entry) => entry.id));
    let guard = 0;
    while (page.nextCursor && guard < 20) {
      guard += 1;
      page = await g.leadActivityPage(ownerA(), lead, {
        before: page.nextCursor,
      });
      seen.push(...page.entries.map((entry) => entry.id));
    }

    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
  });

  it("stops cleanly when the history fits in one page", async () => {
    const lead = await seedHistory(3);
    const page = await g.leadActivityPage(ownerA(), lead);
    expect(page.entries).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("keeps a page exactly full without claiming more exists", async () => {
    /*
     * The boundary the `limit + 1` probe is there for: with exactly one page
     * of entries, `hasMore` must be false. Off by one here and the screen
     * offers "Show older activity" on a history that has none, and the next
     * request comes back empty.
     */
    const lead = await seedHistory(g.LEAD_ACTIVITY_PAGE_SIZE);
    const page = await g.leadActivityPage(ownerA(), lead);
    expect(page.entries).toHaveLength(g.LEAD_ACTIVITY_PAGE_SIZE);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("returns entries newest first, and keeps that order across pages", async () => {
    const lead = await seedHistory(g.LEAD_ACTIVITY_PAGE_SIZE + 10);
    const first = await g.leadActivityPage(ownerA(), lead);
    const second = await g.leadActivityPage(ownerA(), lead, {
      before: first.nextCursor!,
    });

    const all = [...first.entries, ...second.entries];
    for (let i = 1; i < all.length; i += 1) {
      const previous = all[i - 1]!;
      const current = all[i]!;
      const sameMoment =
        previous.occurredAt.getTime() === current.occurredAt.getTime();
      expect(
        sameMoment ||
          previous.occurredAt.getTime() > current.occurredAt.getTime(),
      ).toBe(true);
      // The tie-breaker runs descending too, so equal moments still advance.
      if (sameMoment) expect(previous.id > current.id).toBe(true);
    }
  });

  it("gives a reader nothing for a lead §162.1 withholds, cursor or not", async () => {
    const lead = await seedHistory(g.LEAD_ACTIVITY_PAGE_SIZE + 5);
    const asOwner = await g.leadActivityPage(ownerA(), lead);
    expect(asOwner.entries.length).toBeGreaterThan(0);
    expect(asOwner.nextCursor).not.toBeNull();

    /*
     * A cursor is a POSITION, not a capability. The Staff/Sales user does not
     * own this lead, so §162.1 shows them nothing — and handing them the
     * Owner's own cursor, which names a real entry in a real workspace, must
     * not move that window one row.
     */
    const asStaff = await g.leadActivityPage(staffA(), lead);
    expect(asStaff.entries).toHaveLength(0);
    expect(asStaff.hasMore).toBe(false);

    const withStolenCursor = await g.leadActivityPage(staffA(), lead, {
      before: asOwner.nextCursor!,
    });
    expect(withStolenCursor.entries).toHaveLength(0);
    expect(withStolenCursor.hasMore).toBe(false);

    // And from another workspace entirely, by id, the same answer.
    const fromB = await g.leadActivityPage(ownerB(), lead, {
      before: asOwner.nextCursor!,
    });
    expect(fromB.entries).toHaveLength(0);
  });

  it("is not disturbed by an entry written while the reader is paging", async () => {
    const lead = await seedHistory(g.LEAD_ACTIVITY_PAGE_SIZE + 6);
    const first = await g.leadActivityPage(ownerA(), lead);
    const firstIds = first.entries.map((entry) => entry.id);

    /*
     * The exact case an OFFSET gets wrong. A new entry at the top shifts
     * every later row down by one, so `offset 50` would re-serve the last
     * row of page one and skip nothing-shows-it row 51. A keyset asks for
     * "older than this entry", which the new row is not.
     */
    await admin()`
      insert into public.lead_activities
        (workspace_id, lead_id, kind, actor_user_profile_id, note)
      values (${fixture.workspaceA}, ${lead}, 'note_added',
              ${fixture.owner.userProfileId}, ${`Interleaved ${RUN}`})
    `;

    const second = await g.leadActivityPage(ownerA(), lead, {
      before: first.nextCursor!,
    });
    const secondIds = second.entries.map((entry) => entry.id);

    for (const id of secondIds) expect(firstIds).not.toContain(id);
    expect(new Set([...firstIds, ...secondIds]).size).toBe(
      firstIds.length + secondIds.length,
    );
    // The newcomer belongs above page one, so it is in neither page here.
    const combined = new Set([...firstIds, ...secondIds]);
    expect(combined.size).toBe(g.LEAD_ACTIVITY_PAGE_SIZE + 6);
  });
});
