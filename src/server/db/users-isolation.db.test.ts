import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertMatchedDatabaseTargets } from "../../../scripts/database-target.mjs";
import {
  cleanupTenantFixture,
  createTenantFixture,
  type TenantFixture,
} from "@/test/fixtures/tenant-fixture";

/**
 * Milestone 2B — isolation of the Settings → Users surface (§159, §160).
 *
 * This is the slice's evidence, and it is needed because 2B is the first
 * change that lets one person read another person's row. Everything before it
 * was self-scoped: `workspace_memberships_self_select` shows you only your own
 * memberships, and `user_profiles_self_select` only your own profile. So the
 * questions here are the ones those policies used to answer trivially — who
 * can now see whom, and from which workspace.
 *
 * What is NOT here, because it is proved elsewhere and duplicating it would
 * add a second place to keep correct: raw SQL with no tenant settings, with
 * empty settings and with a non-UUID setting (`rls.test.ts` 1–3), and
 * transaction locality (`tenant.test.ts`).
 */

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

const probe = async (url: string) => {
  if (!url) return undefined;
  const sql = postgres(url, { max: 2, connect_timeout: 5, onnotice: () => {} });
  try {
    await sql`select 1`;
    return sql;
  } catch {
    await sql.end({ timeout: 1 }).catch(() => {});
    return undefined;
  }
};

const tooling = await probe(TOOLING);
const runtimeProbe = await probe(RUNTIME);
await runtimeProbe?.end({ timeout: 1 }).catch(() => {});
const reachable = tooling !== undefined && runtimeProbe !== undefined;

if (reachable) assertMatchedDatabaseTargets(RUNTIME, TOOLING);

if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] users isolation needs both connections. Run "npm run db:start", ' +
      '"npm run db:reset" and "npm run db:role:local".',
  );
}

const admin = () => {
  if (!tooling) throw new Error("no tooling connection");
  return tooling;
};

const RUN = crypto.randomUUID().slice(0, 8);
let fixture: TenantFixture;
let recorded: Awaited<ReturnType<typeof createTenantFixture>>["recorded"];
let cleanupProblems: string[] = [];

type Gateways = {
  withTenant: typeof import("./tenant").withTenant;
  createTenantContext: typeof import("./tenant-context").createTenantContext;
  workspaceMembers: typeof import("@/server/auth/workspace-members").workspaceMembers;
  setMemberRole: typeof import("@/server/auth/workspace-members").setMemberRole;
  setMemberStatus: typeof import("@/server/auth/workspace-members").setMemberStatus;
  runtimeSql: typeof import("./client").runtimeSql;
};
let g: Gateways;

beforeAll(async () => {
  if (!reachable) return;
  ({ fixture, recorded } = await createTenantFixture(admin(), RUN));
  const [tenant, context, members, client] = await Promise.all([
    import("./tenant"),
    import("./tenant-context"),
    import("@/server/auth/workspace-members"),
    import("./client"),
  ]);
  g = {
    withTenant: tenant.withTenant,
    createTenantContext: context.createTenantContext,
    workspaceMembers: members.workspaceMembers,
    setMemberRole: members.setMemberRole,
    setMemberStatus: members.setMemberStatus,
    runtimeSql: client.runtimeSql,
  };
}, 30_000);

afterAll(async () => {
  if (reachable && recorded) {
    cleanupProblems = await cleanupTenantFixture(admin(), recorded);
    if (cleanupProblems.length > 0) {
      console.error("[users isolation] cleanup problems:", cleanupProblems);
    }
  }
  try {
    if (g?.runtimeSql) await g.runtimeSql().end({ timeout: 5 });
  } catch {
    /* already closed */
  }
  await tooling?.end({ timeout: 5 }).catch(() => {});
}, 30_000);

const ctx = (
  user: { authUserId: string; userProfileId: string },
  workspace: string,
) =>
  g.createTenantContext({
    authUserId: user.authUserId,
    userProfileId: user.userProfileId,
    workspaceId: workspace,
  });

/** Read a membership straight from the tooling side, which bypasses RLS. */
const stored = async (workspaceId: string, userProfileId: string) => {
  const [row] = (await admin()`
    select role::text as role, status::text as status
      from public.workspace_memberships
     where workspace_id = ${workspaceId} and user_profile_id = ${userProfileId}`) as unknown as {
    role: string;
    status: string;
  }[];
  return row;
};

/** Put workspace A back the way the fixture built it. */
const restoreFixtureRoles = async () => {
  await admin().unsafe(
    `update public.workspace_memberships
        set role = $1::public.workspace_role,
            status = $2::public.workspace_membership_status
      where workspace_id = $3 and user_profile_id = $4`,
    ["owner_admin", "active", fixture.workspaceA, fixture.owner.userProfileId],
  );
  await admin().unsafe(
    `update public.workspace_memberships
        set role = $1::public.workspace_role,
            status = $2::public.workspace_membership_status
      where workspace_id = $3 and user_profile_id = $4`,
    ["manager", "active", fixture.workspaceA, fixture.manager.userProfileId],
  );
};

describe.skipIf(!reachable)("who an Owner/Admin can see", () => {
  it("lists every membership of their own workspace, inactive included", async () => {
    const rows = await g.workspaceMembers(
      ctx(fixture.owner, fixture.workspaceA),
    );
    const ids = rows.map((r) => r.userProfileId).sort();
    expect(ids).toEqual(
      [
        fixture.owner.userProfileId,
        fixture.manager.userProfileId,
        fixture.shared.userProfileId,
        fixture.former.userProfileId,
      ].sort(),
    );
    // §159 lists Status and offers Reactivate, so a deactivated person must
    // remain visible rather than disappearing from the screen.
    const formerRow = rows.find(
      (r) => r.userProfileId === fixture.former.userProfileId,
    );
    expect(formerRow?.status).toBe("inactive");
  });

  it("marks exactly one row as the reader's own", async () => {
    const rows = await g.workspaceMembers(
      ctx(fixture.owner, fixture.workspaceA),
    );
    const selves = rows.filter((r) => r.isSelf);
    expect(selves).toHaveLength(1);
    expect(selves[0]?.userProfileId).toBe(fixture.owner.userProfileId);
  });

  it("returns the §159 columns, including the auth user id", async () => {
    const rows = await g.withTenant(
      ctx(fixture.owner, fixture.workspaceA),
      async (tx) =>
        tx<Record<string, unknown>[]>`select * from app.workspace_members()`,
    );
    expect(rows.length).toBeGreaterThan(0);
    // No email column, deliberately: auth.users is unreadable from the
    // database, so the address is resolved server-side through the Auth
    // Admin API using the auth_user_id this routine returns.
    expect(Object.keys(rows[0]!).sort()).toEqual([
      "auth_user_id",
      "full_name",
      "is_self",
      "member_role",
      "member_status",
      "user_profile_id",
    ]);
  });

  it("returns each member's real auth user id", async () => {
    const rows = await g.workspaceMembers(
      ctx(fixture.owner, fixture.workspaceA),
    );
    for (const person of ["owner", "manager", "shared", "former"] as const) {
      const member = rows.find(
        (r) => r.userProfileId === fixture[person].userProfileId,
      );
      expect(member?.authUserId).toBe(fixture[person].authUserId);
    }
  });

  it("returns a null auth user id rather than dropping the member", async () => {
    // user_profiles.auth_user_id is ON DELETE SET NULL: the profile survives a
    // deleted Auth account so history keeps the person's name. They stay in
    // the list, with no address to look up.
    const [profile] = (await admin()`
      insert into public.user_profiles (auth_user_id, full_name)
      values (null, ${`Orphan ${RUN}`}) returning id`) as unknown as {
      id: string;
    }[];
    const [membership] = (await admin().unsafe(
      `insert into public.workspace_memberships
         (workspace_id, user_profile_id, role, status)
       values ($1, $2, 'staff_sales'::public.workspace_role,
               'active'::public.workspace_membership_status)
       returning id`,
      [fixture.workspaceA, profile!.id],
    )) as unknown as { id: string }[];

    try {
      const rows = await g.workspaceMembers(
        ctx(fixture.owner, fixture.workspaceA),
      );
      const orphan = rows.find((r) => r.userProfileId === profile!.id);
      expect(orphan).toBeDefined();
      expect(orphan?.authUserId).toBeNull();
      expect(orphan?.fullName).toBe(`Orphan ${RUN}`);
    } finally {
      await admin()`delete from public.workspace_memberships where id = ${membership!.id}`;
      await admin()`delete from public.user_profiles where id = ${profile!.id}`;
    }
  });

  it("returns auth user ids of this workspace only", async () => {
    // These ids are what the server hands to a project-wide Auth credential,
    // so the workspace scoping of THIS result is what keeps that credential
    // from being pointed at another tenant's people.
    const inB = await g.workspaceMembers(
      ctx(fixture.shared, fixture.workspaceB),
    );
    expect(inB.map((r) => r.authUserId)).toEqual([fixture.shared.authUserId]);
    for (const person of ["owner", "manager", "former"] as const) {
      expect(inB.some((r) => r.authUserId === fixture[person].authUserId)).toBe(
        false,
      );
    }
  });

  it("grants EXECUTE on the recreated routine to limenzy_app alone", async () => {
    // The routine was dropped and recreated, which discards its ACL — and
    // PostgreSQL grants EXECUTE on a new function to PUBLIC by default. This
    // asserts the restore was complete.
    const [row] = (await admin()`
      select has_function_privilege('limenzy_app','app.workspace_members()','EXECUTE') as app,
             has_function_privilege('public','app.workspace_members()','EXECUTE') as pub,
             has_function_privilege('anon','app.workspace_members()','EXECUTE') as anon,
             has_function_privilege('authenticated','app.workspace_members()','EXECUTE') as authed,
             has_function_privilege('service_role','app.workspace_members()','EXECUTE') as svc,
             pg_get_userbyid(p.proowner) as owner,
             p.prosecdef as secdef
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' and p.proname = 'workspace_members'`) as unknown as {
      app: boolean;
      pub: boolean;
      anon: boolean;
      authed: boolean;
      svc: boolean;
      owner: string;
      secdef: boolean;
    }[];
    expect(row).toEqual({
      app: true,
      pub: false,
      anon: false,
      authed: false,
      svc: false,
      owner: "limenzy_members",
      secdef: true,
    });
  });

  it("left no role with a reach into auth after the recreate", async () => {
    const [row] = (await admin()`
      select has_schema_privilege('limenzy_app','auth','USAGE') as app,
             has_schema_privilege('limenzy_members','auth','USAGE') as members,
             has_schema_privilege('limenzy_owner','auth','USAGE') as owner`) as unknown as {
      app: boolean;
      members: boolean;
      owner: boolean;
    }[];
    // The database route to auth.users stays closed; addresses come from the
    // Auth Admin API on the server instead.
    expect(row).toEqual({ app: false, members: false, owner: false });
  });
});

describe.skipIf(!reachable)("the workspace boundary", () => {
  it("shows nothing of workspace A to a context naming workspace B", async () => {
    // The shared user is owner_admin in B. Their list there must contain only
    // B's single membership — their own — and none of A's four.
    const rows = await g.workspaceMembers(
      ctx(fixture.shared, fixture.workspaceB),
    );
    expect(rows.map((r) => r.userProfileId)).toEqual([
      fixture.shared.userProfileId,
    ]);
  });

  it("shows nothing for a workspace the reader does not belong to", async () => {
    const stranger = crypto.randomUUID();
    const rows = await g.workspaceMembers(ctx(fixture.owner, stranger));
    expect(rows).toHaveLength(0);
  });

  it("refuses to read when the profile setting names another person", async () => {
    const mismatched = g.createTenantContext({
      authUserId: fixture.owner.authUserId,
      userProfileId: fixture.manager.userProfileId,
      workspaceId: fixture.workspaceA,
    });
    const rows = await g.workspaceMembers(mismatched);
    expect(rows).toHaveLength(0);
  });
});

describe.skipIf(!reachable)("who may not read the list at all", () => {
  it.each([
    ["a manager", "manager"],
    ["a staff_sales member", "shared"],
    ["an inactive membership", "former"],
  ] as const)("returns nothing to %s", async (_label, who) => {
    const rows = await g.workspaceMembers(
      ctx(fixture[who], fixture.workspaceA),
    );
    expect(rows).toHaveLength(0);
  });
});

describe.skipIf(!reachable)(
  "email stays with the authentication service",
  () => {
    it("gives the runtime role no way to reach auth.users", async () => {
      let code = "";
      try {
        await g.runtimeSql()`select email from auth.users limit 1`;
      } catch (error) {
        code = String((error as { code?: string })?.code ?? "");
      }
      // 42501 insufficient_privilege, or 3F000 for the schema being unreachable.
      expect(["42501", "3F000"]).toContain(code);
    });

    it("gives the routine's owner no way to reach it either", async () => {
      const [row] = (await admin()`
      select has_schema_privilege('limenzy_members', 'auth', 'USAGE') as usage`) as unknown as {
        usage: boolean;
      }[];
      expect(row?.usage).toBe(false);
    });
  },
);

describe.skipIf(!reachable)("who may change a membership", () => {
  it.each([
    ["a manager", "manager"],
    ["a staff_sales member", "shared"],
    ["an inactive membership", "former"],
  ] as const)("refuses %s changing a role", async (_label, who) => {
    const result = await g.setMemberRole(
      ctx(fixture[who], fixture.workspaceA),
      fixture.manager.userProfileId,
      "owner_admin",
    );
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
    expect(
      (await stored(fixture.workspaceA, fixture.manager.userProfileId))?.role,
    ).toBe("manager");
  });

  it.each([
    ["a manager", "manager"],
    ["a staff_sales member", "shared"],
  ] as const)("refuses %s changing a status", async (_label, who) => {
    const result = await g.setMemberStatus(
      ctx(fixture[who], fixture.workspaceA),
      fixture.manager.userProfileId,
      "inactive",
    );
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
    expect(
      (await stored(fixture.workspaceA, fixture.manager.userProfileId))?.status,
    ).toBe("active");
  });

  it("refuses an owner_admin of another workspace", async () => {
    // The shared user is owner_admin in B. That confers nothing in A.
    const result = await g.setMemberRole(
      ctx(fixture.shared, fixture.workspaceA),
      fixture.owner.userProfileId,
      "staff_sales",
    );
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
  });

  it("cannot reach a member of another workspace by naming their profile", async () => {
    // owner is an owner_admin of A only. Asking about B's membership from A's
    // context must find nothing rather than reaching across.
    const result = await g.setMemberRole(
      ctx(fixture.shared, fixture.workspaceB),
      fixture.owner.userProfileId,
      "staff_sales",
    );
    expect(result).toEqual({ ok: false, reason: "unknown_member" });
    expect(
      (await stored(fixture.workspaceA, fixture.owner.userProfileId))?.role,
    ).toBe("owner_admin");
  });

  it("gives the runtime role no direct write on memberships", async () => {
    // Refused by the GRANT, not by a policy: limenzy_app holds no UPDATE on
    // this table at all, so the statement never reaches row-level security.
    // That is the stronger of the two refusals — there is no predicate to get
    // wrong — so the SQLSTATE is asserted exactly rather than accepting "no
    // rows changed", which a broken policy could also produce.
    let code = "";
    try {
      await g.runtimeSql()`
        update public.workspace_memberships set role = 'owner_admin'`;
    } catch (error) {
      code = String((error as { code?: string })?.code ?? "");
    }
    expect(code).toBe("42501");
  });
});

describe.skipIf(!reachable)(
  "an Owner/Admin changing their own workspace",
  () => {
    afterAll(restoreFixtureRoles);

    it("changes a role, and the change is really stored", async () => {
      const result = await g.setMemberRole(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.manager.userProfileId,
        "staff_sales",
      );
      expect(result).toEqual({ ok: true });
      expect(
        (await stored(fixture.workspaceA, fixture.manager.userProfileId))?.role,
      ).toBe("staff_sales");
    });

    it("deactivates and reactivates, touching nothing else", async () => {
      const off = await g.setMemberStatus(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.manager.userProfileId,
        "inactive",
      );
      expect(off).toEqual({ ok: true });
      expect(
        (await stored(fixture.workspaceA, fixture.manager.userProfileId))
          ?.status,
      ).toBe("inactive");

      const on = await g.setMemberStatus(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.manager.userProfileId,
        "active",
      );
      expect(on).toEqual({ ok: true });
      expect(
        (await stored(fixture.workspaceA, fixture.manager.userProfileId))
          ?.status,
      ).toBe("active");
    });

    it("affects this workspace's membership only, not the person elsewhere", async () => {
      // The shared user is staff_sales in A and owner_admin in B. Deactivating
      // them in A must leave B alone — §160 is about one membership, not an
      // account.
      const result = await g.setMemberStatus(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.shared.userProfileId,
        "inactive",
      );
      expect(result).toEqual({ ok: true });

      expect(
        (await stored(fixture.workspaceA, fixture.shared.userProfileId))
          ?.status,
      ).toBe("inactive");
      const inB = await stored(
        fixture.workspaceB,
        fixture.shared.userProfileId,
      );
      expect(inB?.status).toBe("active");
      expect(inB?.role).toBe("owner_admin");

      // …and they can still use workspace B.
      const rows = await g.workspaceMembers(
        ctx(fixture.shared, fixture.workspaceB),
      );
      expect(rows).toHaveLength(1);

      await g.setMemberStatus(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.shared.userProfileId,
        "active",
      );
    });

    it("keeps the person and their membership rows, never deleting them", async () => {
      const [counts] = (await admin()`
      select (select count(*)::int from public.user_profiles
               where id = ${fixture.manager.userProfileId}) as profiles,
             (select count(*)::int from public.workspace_memberships
               where workspace_id = ${fixture.workspaceA}) as memberships`) as unknown as {
        profiles: number;
        memberships: number;
      }[];
      expect(counts?.profiles).toBe(1);
      expect(counts?.memberships).toBe(4);
    });

    it("refuses a role the product does not define", async () => {
      const result = await g.setMemberRole(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.manager.userProfileId,
        "team_lead" as never,
      );
      // §161: Team Lead is a responsibility, not a fourth role.
      expect(result).toEqual({ ok: false, reason: "invalid" });
    });
  },
);

describe.skipIf(!reachable)(
  "at least one active Owner/Admin must remain",
  () => {
    afterAll(restoreFixtureRoles);

    it("refuses to demote the only active Owner/Admin", async () => {
      const result = await g.setMemberRole(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.owner.userProfileId,
        "manager",
      );
      expect(result).toEqual({ ok: false, reason: "last_owner_admin" });
      expect(
        (await stored(fixture.workspaceA, fixture.owner.userProfileId))?.role,
      ).toBe("owner_admin");
    });

    it("refuses to deactivate the only active Owner/Admin", async () => {
      const result = await g.setMemberStatus(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.owner.userProfileId,
        "inactive",
      );
      expect(result).toEqual({ ok: false, reason: "last_owner_admin" });
      expect(
        (await stored(fixture.workspaceA, fixture.owner.userProfileId))?.status,
      ).toBe("active");
    });

    it("allows self-demotion once a second Owner/Admin exists", async () => {
      const promote = await g.setMemberRole(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.manager.userProfileId,
        "owner_admin",
      );
      expect(promote).toEqual({ ok: true });

      const demote = await g.setMemberRole(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.owner.userProfileId,
        "manager",
      );
      expect(demote).toEqual({ ok: true });
      expect(
        (await stored(fixture.workspaceA, fixture.owner.userProfileId))?.role,
      ).toBe("manager");

      // And the demoted person can no longer read the list.
      const rows = await g.workspaceMembers(
        ctx(fixture.owner, fixture.workspaceA),
      );
      expect(rows).toHaveLength(0);
    });

    it("does not count an INACTIVE Owner/Admin as the one that must remain", async () => {
      await restoreFixtureRoles();
      // Make manager an inactive owner_admin, leaving owner as the only ACTIVE one.
      await admin().unsafe(
        `update public.workspace_memberships
          set role = 'owner_admin'::public.workspace_role,
              status = 'inactive'::public.workspace_membership_status
        where workspace_id = $1 and user_profile_id = $2`,
        [fixture.workspaceA, fixture.manager.userProfileId],
      );

      const result = await g.setMemberRole(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.owner.userProfileId,
        "manager",
      );
      expect(result).toEqual({ ok: false, reason: "last_owner_admin" });
    });

    it("protects the rule against two concurrent demotions", async () => {
      await restoreFixtureRoles();
      // Two active Owner/Admins, each about to demote the other at the same
      // moment. Without the row lock both would see "another one remains".
      await g.setMemberRole(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.manager.userProfileId,
        "owner_admin",
      );

      const [a, b] = await Promise.all([
        g.setMemberRole(
          ctx(fixture.owner, fixture.workspaceA),
          fixture.owner.userProfileId,
          "staff_sales",
        ),
        g.setMemberRole(
          ctx(fixture.manager, fixture.workspaceA),
          fixture.manager.userProfileId,
          "staff_sales",
        ),
      ]);

      const outcomes = [a, b];
      expect(outcomes.filter((r) => r.ok)).toHaveLength(1);
      expect(
        outcomes.filter((r) => !r.ok && r.reason === "last_owner_admin"),
      ).toHaveLength(1);

      // The decisive assertion: the workspace still has an Owner/Admin.
      const [left] = (await admin()`
      select count(*)::int as n from public.workspace_memberships
       where workspace_id = ${fixture.workspaceA}
         and role = 'owner_admin' and status = 'active'`) as unknown as {
        n: number;
      }[];
      expect(left?.n).toBe(1);
    });

    it("protects it against a concurrent demotion and deactivation", async () => {
      await restoreFixtureRoles();
      await g.setMemberRole(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.manager.userProfileId,
        "owner_admin",
      );

      const [a, b] = await Promise.all([
        g.setMemberRole(
          ctx(fixture.owner, fixture.workspaceA),
          fixture.owner.userProfileId,
          "staff_sales",
        ),
        g.setMemberStatus(
          ctx(fixture.manager, fixture.workspaceA),
          fixture.manager.userProfileId,
          "inactive",
        ),
      ]);

      expect([a, b].filter((r) => r.ok)).toHaveLength(1);
      const [left] = (await admin()`
      select count(*)::int as n from public.workspace_memberships
       where workspace_id = ${fixture.workspaceA}
         and role = 'owner_admin' and status = 'active'`) as unknown as {
        n: number;
      }[];
      expect(left?.n).toBe(1);
    });
  },
);

describe.skipIf(!reachable)(
  "an actor demoted while their mutation waits for locks",
  () => {
    afterAll(restoreFixtureRoles);

    /**
     * The window these cover.
     *
     * Each routine checks `app.current_user_is_owner_admin()`, then takes its
     * locks, then writes. Every statement inside a VOLATILE function takes a
     * fresh snapshot under READ COMMITTED, so a concurrent transaction can
     * demote the caller in between — and when it does, the caller's row drops
     * out of the lock set, so the caller never blocks and the stale decision
     * stays in force. Reproduced with an injected delay before the fix; the
     * routines now re-check after acquiring the locks.
     *
     * Made deterministic here WITHOUT touching the routines: a separate
     * transaction takes exactly the locks they want, changes the actor's
     * membership while holding them, and only then commits. The actor's call
     * is therefore guaranteed to be waiting at its lock when its authority
     * disappears, which is the ordering the race needs.
     */
    const blockedOnLock = async () => {
      for (let i = 0; i < 100; i += 1) {
        const [row] = (await admin()`
          select count(*)::int as n from pg_stat_activity
           where wait_event_type = 'Lock' and state = 'active'
             and query ilike '%app.set_member_%'`) as unknown as {
          n: number;
        }[];
        if ((row?.n ?? 0) > 0) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    };

    /**
     * Hold the routines' lock set, change the actor's own membership, and
     * release only once their call is demonstrably waiting.
     */
    const stealAuthorityMidFlight = async (
      change: "demote" | "deactivate",
      mutation: () => Promise<unknown>,
    ) => {
      let release = () => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });

      const holder = admin()
        .begin(async (tx) => {
          await tx`
            select 1 from public.workspace_memberships
             where workspace_id = ${fixture.workspaceA}
               and role = 'owner_admin'::public.workspace_role
               and status = 'active'::public.workspace_membership_status
             order by user_profile_id
               for update`;
          await tx.unsafe(
            change === "demote"
              ? `update public.workspace_memberships
                    set role = 'manager'::public.workspace_role
                  where workspace_id = $1 and user_profile_id = $2`
              : `update public.workspace_memberships
                    set status = 'inactive'::public.workspace_membership_status
                  where workspace_id = $1 and user_profile_id = $2`,
            [fixture.workspaceA, fixture.owner.userProfileId],
          );
          await released;
        })
        .catch(() => {});

      const pending = mutation();
      const waited = await blockedOnLock();
      release();
      await holder;
      return { result: await pending, waited };
    };

    const twoOwners = async () => {
      await restoreFixtureRoles();
      const promote = await g.setMemberRole(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.manager.userProfileId,
        "owner_admin",
      );
      expect(promote).toEqual({ ok: true });
    };

    it("refuses a role change once the actor has been demoted", async () => {
      await twoOwners();
      const { result, waited } = await stealAuthorityMidFlight("demote", () =>
        g.setMemberRole(
          ctx(fixture.owner, fixture.workspaceA),
          fixture.shared.userProfileId,
          "manager",
        ),
      );

      // The test is only meaningful if the call really queued at the lock.
      expect(waited).toBe(true);
      expect(result).toEqual({ ok: false, reason: "not_permitted" });
      expect(
        (await stored(fixture.workspaceA, fixture.shared.userProfileId))?.role,
      ).toBe("staff_sales");
      // …and the actor really had lost their authority.
      expect(
        (await stored(fixture.workspaceA, fixture.owner.userProfileId))?.role,
      ).toBe("manager");
    });

    it("refuses a status change once the actor has been demoted", async () => {
      await twoOwners();
      const { result, waited } = await stealAuthorityMidFlight("demote", () =>
        g.setMemberStatus(
          ctx(fixture.owner, fixture.workspaceA),
          fixture.shared.userProfileId,
          "inactive",
        ),
      );

      expect(waited).toBe(true);
      expect(result).toEqual({ ok: false, reason: "not_permitted" });
      expect(
        (await stored(fixture.workspaceA, fixture.shared.userProfileId))
          ?.status,
      ).toBe("active");
    });

    it("refuses once the actor has been deactivated rather than demoted", async () => {
      // §160 deactivation removes authority just as §159 demotion does, and
      // the routines must treat the two the same.
      await twoOwners();
      const { result, waited } = await stealAuthorityMidFlight(
        "deactivate",
        () =>
          g.setMemberRole(
            ctx(fixture.owner, fixture.workspaceA),
            fixture.shared.userProfileId,
            "manager",
          ),
      );

      expect(waited).toBe(true);
      expect(result).toEqual({ ok: false, reason: "not_permitted" });
      expect(
        (await stored(fixture.workspaceA, fixture.shared.userProfileId))?.role,
      ).toBe("staff_sales");
      expect(
        (await stored(fixture.workspaceA, fixture.owner.userProfileId))?.status,
      ).toBe("inactive");
    });

    it("still allows the mutation when the actor keeps their authority", async () => {
      // The control. Without it, a routine that refused everything after a
      // lock wait would pass all three tests above.
      await twoOwners();
      let release = () => {};
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      const holder = admin()
        .begin(async (tx) => {
          await tx`
            select 1 from public.workspace_memberships
             where workspace_id = ${fixture.workspaceA}
               and role = 'owner_admin'::public.workspace_role
               and status = 'active'::public.workspace_membership_status
             order by user_profile_id
               for update`;
          await released;
        })
        .catch(() => {});

      const pending = g.setMemberRole(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.shared.userProfileId,
        "manager",
      );
      expect(await blockedOnLock()).toBe(true);
      release();
      await holder;

      expect(await pending).toEqual({ ok: true });
      expect(
        (await stored(fixture.workspaceA, fixture.shared.userProfileId))?.role,
      ).toBe("manager");

      await g.setMemberRole(
        ctx(fixture.owner, fixture.workspaceA),
        fixture.shared.userProfileId,
        "staff_sales",
      );
    });
  },
);

describe.skipIf(!reachable)("existing self-access is unchanged", () => {
  it("still shows a person their own memberships in every workspace", async () => {
    // workspace_memberships_self_select is person-scoped by design, and this
    // slice must not have altered it.
    for (const workspace of [fixture.workspaceA, fixture.workspaceB]) {
      const rows = await g.withTenant(
        ctx(fixture.shared, workspace),
        async (tx) =>
          tx<{ workspace_id: string }[]>`
            select workspace_id from public.workspace_memberships`,
      );
      expect(rows.map((r) => r.workspace_id).sort()).toEqual(
        [fixture.workspaceA, fixture.workspaceB].sort(),
      );
    }
  });

  it("still shows a person only their own profile through the direct read", async () => {
    const rows = await g.withTenant(
      ctx(fixture.owner, fixture.workspaceA),
      async (tx) => tx<{ id: string }[]>`select id from public.user_profiles`,
    );
    expect(rows.map((r) => r.id)).toEqual([fixture.owner.userProfileId]);
  });
});

describe.skipIf(!reachable)("the fixture cleans up after itself", () => {
  it("records every identifier it created", () => {
    expect(recorded.workspaces).toHaveLength(2);
    expect(recorded.profiles).toHaveLength(4);
    expect(recorded.authUsers).toHaveLength(4);
    expect(recorded.memberships).toHaveLength(5);
  });
});
