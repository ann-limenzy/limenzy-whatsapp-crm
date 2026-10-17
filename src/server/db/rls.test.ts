// @vitest-environment node
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Milestone 1C-C Phase 2 — behavioural proof of the tenant policies.
 *
 * Everything here is asserted against a real local database, and every
 * runtime-access assertion runs as `limenzy_app` through DATABASE_URL. The
 * tooling connection is used only to create and remove fixtures; it holds
 * BYPASSRLS, so using it to "prove" access would prove nothing.
 *
 * Phase 2 does not yet set the context settings in application code — Phase 4's
 * `withTenant()` does that. These tests therefore set them explicitly with
 * transaction-local `set_config(..., true)`, which is exactly the mechanism the
 * policies are designed for and the one Phase 4 will use.
 *
 * Fixtures are synthetic, namespaced by a per-run suffix, and removed in
 * afterAll in foreign-key-safe order.
 */

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

const probe = async (url: string): Promise<postgres.Sql | undefined> => {
  if (!url) return undefined;
  const candidate = postgres(url, {
    max: 2,
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
const runtime = await probe(RUNTIME);
const reachable = tooling !== undefined && runtime !== undefined;

if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] Phase 2 RLS tests need both connections. Run "npm run db:start", ' +
      '"npm run db:reset" and "npm run db:role:local".',
  );
}

const admin = () => {
  if (!tooling) throw new Error("no tooling connection");
  return tooling;
};
const app = () => {
  if (!runtime) throw new Error("no runtime connection");
  return runtime;
};

const first = <T>(rows: readonly T[], what: string): T => {
  const row = rows[0];
  if (row === undefined) throw new Error(`expected a row: ${what}`);
  return row;
};

const TABLES = [
  "workspaces",
  "user_profiles",
  "workspace_memberships",
] as const;

/** Per-run namespace so a failed run cannot collide with the next. */
const RUN = crypto.randomUUID().slice(0, 8);

type Ctx = {
  auth?: string | null;
  profile?: string | null;
  workspace?: string | null;
};

/**
 * Run a callback as limenzy_app inside one transaction with the given context
 * settings applied transaction-locally. `undefined` leaves a setting unset.
 */
const asApp = async <T>(
  ctx: Ctx,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> =>
  (await app().begin(async (tx) => {
    if (ctx.auth !== undefined)
      await tx`select set_config('app.auth_user_id', ${ctx.auth}, true)`;
    if (ctx.profile !== undefined)
      await tx`select set_config('app.user_profile_id', ${ctx.profile}, true)`;
    if (ctx.workspace !== undefined)
      await tx`select set_config('app.workspace_id', ${ctx.workspace}, true)`;
    return fn(tx);
  })) as T;

const countOf = async (tx: postgres.TransactionSql, table: string) => {
  const rows = await tx.unsafe(
    `select count(*)::int as n from public.${table}`,
  );
  return first(rows as unknown as { n: number }[], `${table} count`).n;
};

const fixture = {
  authA: "",
  authB: "",
  profileA: "",
  profileB: "",
  workspaceA: "",
  workspaceB: "",
  workspaceC: "",
};

beforeAll(async () => {
  if (!reachable) return;
  const sql = admin();

  const makeAuthUser = async () => {
    const rows = await sql`
      insert into auth.users
        (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
              'authenticated', 'authenticated',
              ${`rls-${RUN}-${crypto.randomUUID().slice(0, 8)}@example.com`},
              'not-a-real-password-hash', now(), now())
      returning id`;
    return first(rows as unknown as { id: string }[], "auth user").id;
  };
  const makeProfile = async (authUserId: string, name: string) => {
    const rows = await sql`
      insert into public.user_profiles (auth_user_id, full_name)
      values (${authUserId}, ${name}) returning id`;
    return first(rows as unknown as { id: string }[], "profile").id;
  };
  const makeWorkspace = async (name: string) => {
    const rows = await sql`
      insert into public.workspaces (name, country, currency, time_zone)
      values (${name}, 'IN', 'INR', 'Asia/Kolkata') returning id`;
    return first(rows as unknown as { id: string }[], "workspace").id;
  };

  fixture.authA = await makeAuthUser();
  fixture.authB = await makeAuthUser();
  fixture.profileA = await makeProfile(fixture.authA, `RLS A ${RUN}`);
  fixture.profileB = await makeProfile(fixture.authB, `RLS B ${RUN}`);
  fixture.workspaceA = await makeWorkspace(`RLS WS A ${RUN}`);
  fixture.workspaceB = await makeWorkspace(`RLS WS B ${RUN}`);
  fixture.workspaceC = await makeWorkspace(`RLS WS C ${RUN}`);

  // A: owner_admin, active, in workspace A
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fixture.workspaceA}, ${fixture.profileA}, 'owner_admin', 'active')`;
  // A: staff_sales, active, in workspace C — can read, must not update
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fixture.workspaceC}, ${fixture.profileA}, 'staff_sales', 'active')`;
  // B: owner_admin, active, in workspace B — the "other tenant"
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fixture.workspaceB}, ${fixture.profileB}, 'owner_admin', 'active')`;
  // B: inactive membership in workspace A — must grant nothing
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fixture.workspaceA}, ${fixture.profileB}, 'manager', 'inactive')`;
});

afterAll(async () => {
  if (reachable) {
    const sql = admin();
    // Foreign keys RESTRICT, so order matters.
    await sql`delete from public.workspace_memberships
               where user_profile_id in (${fixture.profileA}, ${fixture.profileB})`.catch(
      () => {},
    );
    await sql`delete from public.user_profiles
               where id in (${fixture.profileA}, ${fixture.profileB})`.catch(
      () => {},
    );
    await sql`delete from public.workspaces
               where id in (${fixture.workspaceA}, ${fixture.workspaceB}, ${fixture.workspaceC})`.catch(
      () => {},
    );
    await sql`delete from auth.users
               where id in (${fixture.authA}, ${fixture.authB})`.catch(
      () => {},
    );
  }
  await tooling?.end({ timeout: 2 }).catch(() => {});
  await runtime?.end({ timeout: 2 }).catch(() => {});
});

describe.skipIf(!reachable)("Phase 2 — context absent or malformed", () => {
  it("1. shows zero rows from every table when no context is set", async () => {
    for (const table of TABLES) {
      const n = await asApp({}, (tx) => countOf(tx, table));
      expect(`${table}=${n}`).toBe(`${table}=0`);
    }
  });

  it("2. fails closed when the settings are empty strings", async () => {
    for (const table of TABLES) {
      const n = await asApp({ auth: "", profile: "", workspace: "" }, (tx) =>
        countOf(tx, table),
      );
      expect(`${table}=${n}`).toBe(`${table}=0`);
    }
  });

  it("3. raises rather than degrading when a setting is not a uuid", async () => {
    await expect(
      asApp({ auth: "definitely-not-a-uuid" }, (tx) =>
        countOf(tx, "user_profiles"),
      ),
    ).rejects.toThrow(/invalid input syntax for type uuid/i);
  });
});

describe.skipIf(!reachable)("Phase 2 — identity resolution", () => {
  it("4. shows only the caller's own profile from the auth setting alone", async () => {
    const rows = await asApp(
      { auth: fixture.authA },
      async (tx) => tx`select id, auth_user_id from public.user_profiles`,
    );
    expect(rows).toHaveLength(1);
    expect(first(rows as unknown as { id: string }[], "profile").id).toBe(
      fixture.profileA,
    );
  });

  it("17. cannot enumerate a peer profile", async () => {
    const rows = await asApp(
      { auth: fixture.authA },
      async (tx) =>
        tx`select id from public.user_profiles where id = ${fixture.profileB}`,
    );
    expect(rows).toHaveLength(0);
  });

  it("5. shows only the caller's memberships when auth and profile agree", async () => {
    const rows = await asApp(
      { auth: fixture.authA, profile: fixture.profileA },
      async (tx) =>
        tx`select workspace_id, role from public.workspace_memberships`,
    );
    expect(rows).toHaveLength(2); // workspace A (owner_admin) + C (staff_sales)
    const ids = (rows as unknown as { workspace_id: string }[])
      .map((r) => r.workspace_id)
      .sort();
    expect(ids).toEqual([fixture.workspaceA, fixture.workspaceC].sort());
  });

  it("6. shows nothing when the profile setting names another user", async () => {
    const n = await asApp(
      { auth: fixture.authA, profile: fixture.profileB },
      (tx) => countOf(tx, "workspace_memberships"),
    );
    expect(n).toBe(0);
  });

  it("7. shows nothing when a profile is presented without its auth identity", async () => {
    const n = await asApp({ profile: fixture.profileA }, (tx) =>
      countOf(tx, "workspace_memberships"),
    );
    expect(n).toBe(0);
  });

  it("18. cannot enumerate the workspace roster", async () => {
    // Workspace A has two membership rows (A active, B inactive); A sees only
    // its own, never the roster.
    const rows = await asApp(
      {
        auth: fixture.authA,
        profile: fixture.profileA,
        workspace: fixture.workspaceA,
      },
      async (tx) =>
        tx`select user_profile_id from public.workspace_memberships
            where workspace_id = ${fixture.workspaceA}`,
    );
    expect(rows).toHaveLength(1);
    expect(
      first(rows as unknown as { user_profile_id: string }[], "roster")
        .user_profile_id,
    ).toBe(fixture.profileA);
  });
});

describe.skipIf(!reachable)("Phase 2 — workspace scoping", () => {
  const ctxA = () => ({
    auth: fixture.authA,
    profile: fixture.profileA,
    workspace: fixture.workspaceA,
  });

  it("8. shows only the selected workspace", async () => {
    const rows = await asApp(
      ctxA(),
      async (tx) => tx`select id from public.workspaces`,
    );
    expect(rows).toHaveLength(1);
    expect(first(rows as unknown as { id: string }[], "workspace").id).toBe(
      fixture.workspaceA,
    );
  });

  it("9. shows nothing when the selected workspace is not the caller's", async () => {
    const n = await asApp(
      {
        auth: fixture.authA,
        profile: fixture.profileA,
        workspace: fixture.workspaceB,
      },
      (tx) => countOf(tx, "workspaces"),
    );
    expect(n).toBe(0);
  });

  it("10. treats an inactive membership as no membership", async () => {
    const n = await asApp(
      {
        auth: fixture.authB,
        profile: fixture.profileB,
        workspace: fixture.workspaceA,
      },
      (tx) => countOf(tx, "workspaces"),
    );
    expect(n).toBe(0);
  });

  it("19. cannot reach another tenant by presenting that tenant's profile id", async () => {
    // Keeping its own auth identity, the caller claims B's profile and B's
    // workspace. The membership policy requires the profile to belong to the
    // authenticated user, so nothing matches.
    const n = await asApp(
      {
        auth: fixture.authA,
        profile: fixture.profileB,
        workspace: fixture.workspaceB,
      },
      (tx) => countOf(tx, "workspaces"),
    );
    expect(n).toBe(0);
  });
});

describe.skipIf(!reachable)("Phase 2 — update authority", () => {
  const ownerCtx = () => ({
    auth: fixture.authA,
    profile: fixture.profileA,
    workspace: fixture.workspaceA,
  });
  const staffCtx = () => ({
    auth: fixture.authA,
    profile: fixture.profileA,
    workspace: fixture.workspaceC,
  });

  it("11. lets staff_sales read its workspace but not update it", async () => {
    const visible = await asApp(staffCtx(), (tx) => countOf(tx, "workspaces"));
    expect(visible).toBe(1);

    const updated = await asApp(staffCtx(), async (tx) => {
      const rows = await tx`update public.workspaces
                              set name = ${`hijacked ${RUN}`}
                            where id = ${fixture.workspaceC} returning id`;
      return rows.length;
    });
    expect(updated).toBe(0);
  });

  it("12. lets owner_admin update the approved settings columns", async () => {
    const name = `Renamed ${RUN}`;
    const updated = await asApp(ownerCtx(), async (tx) => {
      const rows = await tx`update public.workspaces
                              set name = ${name}, country = 'GB', currency = 'GBP',
                                  business_type = 'Agency', time_zone = 'Europe/London'
                            where id = ${fixture.workspaceA} returning id`;
      return rows.length;
    });
    expect(updated).toBe(1);

    const row = first(
      await admin()<{ name: string; country: string }[]>`
        select name, country from public.workspaces where id = ${fixture.workspaceA}`,
      "updated workspace",
    );
    expect(row.name).toBe(name);
    expect(row.country).toBe("GB");
  });

  it("26. lets the trigger advance updated_at without a direct grant", async () => {
    const before = first(
      await admin()<{ updated_at: string }[]>`
        select updated_at from public.workspaces where id = ${fixture.workspaceA}`,
      "before",
    );
    await asApp(ownerCtx(), async (tx) => {
      await tx`update public.workspaces set name = ${`Trigger probe ${RUN}`}
                where id = ${fixture.workspaceA}`;
    });
    const after = first(
      await admin()<{ updated_at: string }[]>`
        select updated_at from public.workspaces where id = ${fixture.workspaceA}`,
      "after",
    );
    expect(new Date(after.updated_at).getTime()).toBeGreaterThan(
      new Date(before.updated_at).getTime(),
    );
  });

  it("13. refuses a direct write to updated_at", async () => {
    await expect(
      asApp(ownerCtx(), async (tx) => {
        await tx`update public.workspaces set updated_at = now()
                  where id = ${fixture.workspaceA}`;
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it("14. refuses a write to id or created_at", async () => {
    for (const statement of [
      `update public.workspaces set id = gen_random_uuid()`,
      `update public.workspaces set created_at = now()`,
    ]) {
      await expect(
        asApp(ownerCtx(), async (tx) => {
          await tx.unsafe(statement);
        }),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it("20. refuses an update with no workspace context", async () => {
    const updated = await asApp(
      { auth: fixture.authA, profile: fixture.profileA },
      async (tx) => {
        const rows =
          await tx`update public.workspaces set name = ${`nope ${RUN}`}
                               where id = ${fixture.workspaceA} returning id`;
        return rows.length;
      },
    );
    expect(updated).toBe(0);
  });

  it("21. refuses an update aimed at a workspace outside the context", async () => {
    const updated = await asApp(
      {
        auth: fixture.authA,
        profile: fixture.profileA,
        workspace: fixture.workspaceA,
      },
      async (tx) => {
        const rows =
          await tx`update public.workspaces set name = ${`nope ${RUN}`}
                               where id = ${fixture.workspaceB} returning id`;
        return rows.length;
      },
    );
    expect(updated).toBe(0);
  });
});

describe.skipIf(!reachable)(
  "Phase 2 — operations that remain unavailable",
  () => {
    const ctx = () => ({
      auth: fixture.authA,
      profile: fixture.profileA,
      workspace: fixture.workspaceA,
    });

    it("15. cannot INSERT into any foundation table", async () => {
      const statements = [
        `insert into public.workspaces (name, country, currency, time_zone)
         values ('x', 'IN', 'INR', 'Asia/Kolkata')`,
        `insert into public.user_profiles (full_name) values ('x')`,
        `insert into public.workspace_memberships (workspace_id, user_profile_id, role)
         values (gen_random_uuid(), gen_random_uuid(), 'owner_admin')`,
      ];
      for (const statement of statements) {
        await expect(
          asApp(ctx(), async (tx) => {
            await tx.unsafe(statement);
          }),
        ).rejects.toThrow(/permission denied/i);
      }
    });

    it("15b. cannot DELETE from any foundation table", async () => {
      for (const table of TABLES) {
        await expect(
          asApp(ctx(), async (tx) => {
            await tx.unsafe(`delete from public.${table}`);
          }),
        ).rejects.toThrow(/permission denied/i);
      }
    });

    it("16. cannot UPDATE profiles or memberships", async () => {
      await expect(
        asApp(ctx(), async (tx) => {
          await tx`update public.user_profiles set full_name = 'x'`;
        }),
      ).rejects.toThrow(/permission denied/i);

      await expect(
        asApp(ctx(), async (tx) => {
          await tx`update public.workspace_memberships set role = 'owner_admin'`;
        }),
      ).rejects.toThrow(/permission denied/i);
    });

    it("27. keeps every other privilege denied", async () => {
      // No TRUNCATE, no REFERENCES, no TRIGGER, and no CREATE in either schema.
      for (const check of [
        "has_table_privilege('limenzy_app', 'public.workspaces', 'TRUNCATE')",
        "has_table_privilege('limenzy_app', 'public.workspaces', 'REFERENCES')",
        "has_table_privilege('limenzy_app', 'public.workspaces', 'TRIGGER')",
        "has_schema_privilege('limenzy_app', 'app', 'CREATE')",
        "has_schema_privilege('limenzy_app', 'public', 'CREATE')",
      ]) {
        const row = first(
          (await admin().unsafe(`select ${check} as allowed`)) as {
            allowed: boolean;
          }[],
          check,
        );
        expect(`${check}=${row.allowed}`).toBe(`${check}=false`);
      }
    });
  },
);

describe.skipIf(!reachable)("Phase 2 — role boundaries", () => {
  it("22. denies anon and authenticated at the privilege layer", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      for (const table of TABLES) {
        await expect(
          admin().begin(async (tx) => {
            await tx.unsafe(`set local role ${role}`);
            await tx.unsafe(`select count(*) from public.${table}`);
          }),
        ).rejects.toThrow(/permission denied/i);
      }
    }
  });

  it("24. constrains the table owner too, because FORCE is enabled", async () => {
    // limenzy_owner is NOLOGIN, so it is reached with SET ROLE from tooling.
    // It has no policy of its own, so FORCE leaves it with zero rows.
    for (const table of TABLES) {
      const n = await admin().begin(async (tx) => {
        await tx`set local role limenzy_owner`;
        const rows = await tx.unsafe(
          `select count(*)::int as n from public.${table}`,
        );
        return first(rows as unknown as { n: number }[], "owner count").n;
      });
      expect(`${table}=${n}`).toBe(`${table}=0`);
    }
  });

  it("23. loses access on the next transaction when membership is revoked", async () => {
    const ctx = {
      auth: fixture.authA,
      profile: fixture.profileA,
      workspace: fixture.workspaceC,
    };
    expect(await asApp(ctx, (tx) => countOf(tx, "workspaces"))).toBe(1);

    await admin()`update public.workspace_memberships set status = 'inactive'
                   where workspace_id = ${fixture.workspaceC}
                     and user_profile_id = ${fixture.profileA}`;
    try {
      expect(await asApp(ctx, (tx) => countOf(tx, "workspaces"))).toBe(0);
    } finally {
      await admin()`update public.workspace_memberships set status = 'active'
                     where workspace_id = ${fixture.workspaceC}
                       and user_profile_id = ${fixture.profileA}`;
    }
  });
});

describe.skipIf(!reachable)("Phase 2 — function contract", () => {
  it("25. defines the readers exactly as designed", async () => {
    const rows = await admin()<
      {
        proname: string;
        owner: string;
        secdef: boolean;
        volatility: string;
        nargs: number;
        rettype: string;
        config: string[] | null;
        acl: string;
      }[]
    >`
      select p.proname,
             pg_catalog.pg_get_userbyid(p.proowner) as owner,
             p.prosecdef as secdef,
             p.provolatile::text as volatility,
             p.pronargs as nargs,
             pg_catalog.pg_get_function_result(p.oid) as rettype,
             p.proconfig as config,
             coalesce(pg_catalog.array_to_string(p.proacl, ','), '') as acl
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app' order by p.proname`;

    // Schema `app` holds the three context readers, the Phase 4C-1 bootstrap
    // routine, since Milestone 2B the three Settings → Users routines plus the
    // authorisation predicate they share, and since Milestone 3A the two
    // IMMUTABLE default-vocabulary functions the bootstrap routine and the
    // backfill both read, so the two cannot drift apart. Naming all of them
    // means a new function — especially another SECURITY DEFINER one — cannot
    // appear without failing here.
    expect(rows.map((r) => r.proname)).toEqual([
      "accept_workspace_invitation",
      "create_initial_workspace",
      "current_auth_user_id",
      "current_user_is_owner_admin",
      "current_user_profile_id",
      "current_workspace_id",
      "lead_source_defaults",
      "lead_stage_defaults",
      "pending_invitations_for",
      "set_member_role",
      "set_member_status",
      "workspace_members",
    ]);

    // Every SECURITY DEFINER function, and the role it runs as. A definer
    // routine is a privilege boundary, so each is named with its owner rather
    // than merely counted — and none is owned by limenzy_owner, which owns
    // the tables.
    const definers = rows
      .filter((r) => r.secdef)
      .map((r) => `${r.proname}:${r.owner}`)
      .sort();
    expect(definers).toEqual([
      "accept_workspace_invitation:limenzy_invites",
      "create_initial_workspace:limenzy_bootstrap",
      "pending_invitations_for:limenzy_invites",
      "set_member_role:limenzy_members",
      "set_member_status:limenzy_members",
      "workspace_members:limenzy_members",
    ]);

    // The predicate the Users routines share is deliberately NOT a definer: it
    // carries no privilege of its own and is only ever evaluated inside one.
    const predicate = rows.find(
      (r) => r.proname === "current_user_is_owner_admin",
    );
    expect(
      `${predicate?.proname} secdef:${predicate?.secdef} owner:${predicate?.owner}`,
    ).toBe("current_user_is_owner_admin secdef:false owner:limenzy_owner");

    // Every function in the schema pins an empty search_path, so no schema
    // shadowing can change what its body resolves to.
    for (const row of rows) {
      // PostgreSQL records the empty search_path as `search_path=` for SQL
      // bodies and `search_path=""` for plpgsql ones. Both mean "empty"; what
      // matters is that one is pinned and that it resolves to nothing.
      const pinned = (row.config ?? []).some((entry) =>
        /^search_path=("")?$/.test(entry),
      );
      expect(`${row.proname} empty search_path: ${pinned}`).toBe(
        `${row.proname} empty search_path: true`,
      );
    }

    // The three context readers, held to the contract that makes policy
    // evaluation terminate. The routines that reach tables are excluded; they
    // have their own assertions above and in the graph test below.
    const readers = rows.filter((r) =>
      [
        "current_auth_user_id",
        "current_user_profile_id",
        "current_workspace_id",
      ].includes(r.proname),
    );
    expect(readers).toHaveLength(3);
    for (const row of readers) {
      expect(`${row.proname}:owner`).toBe(`${row.proname}:owner`);
      expect(row.owner).toBe("limenzy_owner");
      expect(row.secdef).toBe(false); // SECURITY INVOKER
      expect(row.volatility).toBe("s"); // STABLE, never IMMUTABLE
      expect(row.nargs).toBe(0);
      expect(row.rettype).toBe("uuid");
      expect(row.config).toContain('search_path=""');
      // Only the owner and the runtime role may execute; PUBLIC is revoked.
      expect(row.acl).toContain("limenzy_app=X/limenzy_owner");
      expect(row.acl).not.toMatch(/(^|,)=X/); // no PUBLIC entry
      expect(row.acl).not.toContain("anon=");
      expect(row.acl).not.toContain("authenticated=");
    }
  });

  it("25b. keeps the trigger functions unreachable from browser roles", async () => {
    for (const fn of [
      "public.set_updated_at()",
      "public.assert_valid_iana_time_zone()",
    ]) {
      for (const role of ["anon", "authenticated", "public"] as const) {
        const row = first(
          (await admin().unsafe(
            `select has_function_privilege('${role}', '${fn}', 'EXECUTE') as allowed`,
          )) as unknown as { allowed: boolean }[],
          fn,
        );
        expect(`${fn}/${role}=${row.allowed}`).toBe(`${fn}/${role}=false`);
      }
    }
  });
});

describe.skipIf(!reachable)("Phase 2 — policy dependency graph", () => {
  const APPROVED_TABLES = new Set([
    "workspaces",
    "user_profiles",
    "workspace_memberships",
    "workspace_invitations",
    // Milestone 3A's two configuration tables.
    "workspace_lead_stages",
    "workspace_lead_sources",
  ]);
  const APPROVED_FUNCTIONS = new Set([
    "current_auth_user_id",
    "current_user_profile_id",
    "current_workspace_id",
    // Milestone 2C: the invitation policies re-derive Owner/Admin through the
    // same predicate the Users routines use. It reads tables, so the graph
    // test accounts for it explicitly rather than treating it as a leaf.
    "current_user_is_owner_admin",
  ]);

  /** Relation and function dependencies as PostgreSQL itself records them. */
  const catalogueEdges = async () =>
    admin()<{ policy: string; on_table: string; kind: string; ref: string }[]>`
      select pol.polname as policy,
             polrel.relname as on_table,
             d.refclassid::regclass::text as kind,
             case d.refclassid
               when 'pg_class'::regclass then
                 (select c.relname from pg_catalog.pg_class c where c.oid = d.refobjid)
               when 'pg_proc'::regclass then
                 (select p.proname from pg_catalog.pg_proc p where p.oid = d.refobjid)
               else null
             end as ref
        from pg_catalog.pg_depend d
        join pg_catalog.pg_policy pol
          on pol.oid = d.objid and d.classid = 'pg_policy'::regclass
        join pg_catalog.pg_class polrel on polrel.oid = pol.polrelid
       where d.deptype = 'n'
         and d.refclassid in ('pg_class'::regclass, 'pg_proc'::regclass)`;

  /** PostgreSQL's own normalised rendering of each policy expression. */
  const expressions = async () =>
    admin()<{ policy: string; on_table: string; expr: string; role: string }[]>`
      select pol.polname as policy,
             polrel.relname as on_table,
             coalesce(pg_catalog.pg_get_expr(pol.polqual, pol.polrelid), '')
               || ' ' ||
             coalesce(pg_catalog.pg_get_expr(pol.polwithcheck, pol.polrelid), '')
               as expr,
             coalesce(
               (select pg_catalog.string_agg(r.rolname, ',' order by r.rolname)
                  from pg_catalog.pg_roles r
                 where r.oid = any (pol.polroles)),
               'PUBLIC'
             ) as role
        from pg_catalog.pg_policy pol
        join pg_catalog.pg_class polrel on polrel.oid = pol.polrelid`;

  /**
   * Tables named in the FROM clause of a policy expression, including the
   * further arms of a join.
   *
   * PostgreSQL renders a join tree parenthesised — `FROM (a x JOIN b y ON …)`
   * — so matching only the word after FROM would see neither table and
   * silently understate the graph. Milestone 3A's bootstrap SELECT policy is
   * the first policy here with a join, which is what exposed it.
   */
  const NOT_A_TABLE = new Set(["select", "lateral", "values", "only", "rows"]);
  const fromTables = (expr: string): string[] =>
    [...expr.matchAll(/\b(?:FROM|JOIN)\s+\(*\s*([a-z_][a-z0-9_]*)/gi)]
      .map((m) => m[1])
      .filter((name): name is string => name !== undefined)
      .filter((name) => !NOT_A_TABLE.has(name.toLowerCase()));

  it("references only approved tables and functions", async () => {
    const edges = await catalogueEdges();
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      if (!edge.ref) continue;
      const approved =
        edge.kind === "pg_class"
          ? APPROVED_TABLES.has(edge.ref)
          : APPROVED_FUNCTIONS.has(edge.ref);
      expect(
        `${edge.policy} -> ${edge.kind}:${edge.ref} approved=${approved}`,
      ).toBe(`${edge.policy} -> ${edge.kind}:${edge.ref} approved=true`);
    }
  });

  it("contains no direct self-reference", async () => {
    // A policy may depend on its own relation through ordinary column
    // references; that is not recursion. A self-reference means the expression
    // SELECTs from the very table the policy guards.
    for (const row of await expressions()) {
      const selfJoins = fromTables(row.expr).filter((t) => t === row.on_table);
      expect(`${row.policy} self-references: ${selfJoins.length}`).toBe(
        `${row.policy} self-references: 0`,
      );
    }
  });

  it("agrees between catalogue dependencies and expression text", async () => {
    // Two independent sources must describe the same graph. A mismatch would
    // mean one of the checks is looking at the wrong thing.
    const edges = await catalogueEdges();
    const byPolicy = new Map<string, Set<string>>();
    for (const e of edges) {
      if (e.kind !== "pg_class" || !e.ref) continue;
      if (!byPolicy.has(e.policy)) byPolicy.set(e.policy, new Set());
      byPolicy.get(e.policy)!.add(e.ref);
    }
    for (const row of await expressions()) {
      const fromCatalogue = byPolicy.get(row.policy) ?? new Set<string>();
      const selected = fromTables(row.expr);
      // Every table the expression SELECTs from must be recorded as a
      // dependency...
      for (const table of selected) {
        expect(`${row.policy} selects ${table}, recorded`).toBe(
          `${row.policy} selects ${table}, ${fromCatalogue.has(table) ? "recorded" : "MISSING"}`,
        );
      }
      // ...and the catalogue must record nothing the text never mentions.
      // The guarded table itself may or may not appear: PostgreSQL records it
      // only when the expression references one of its columns, so a predicate
      // built purely from a function call (workspaces_bootstrap_insert) has no
      // dependency at all. That is a property of the catalogue, not a gap.
      const allowed = new Set([...selected, row.on_table]);
      for (const table of fromCatalogue) {
        expect(`${row.policy} depends on ${table}, mentioned`).toBe(
          `${row.policy} depends on ${table}, ${allowed.has(table) ? "mentioned" : "UNMENTIONED"}`,
        );
      }
    }
  });

  it("forms an acyclic graph with the expected shape", async () => {
    /*
     * The graph is built PER ROLE, and that granularity is the whole point.
     *
     * A policy applies only to the roles it is scoped to, so when a policy
     * expression subqueries another table, the policies re-applied there are
     * the ones for the SAME role. Collapsing every role into one graph would
     * therefore invent edges that no single evaluation ever follows.
     *
     * It matters from Milestone 2B onward. limenzy_app reads
     * workspace_memberships through a policy that subqueries user_profiles;
     * limenzy_members reads user_profiles through a policy that subqueries
     * workspace_memberships. Collapsed, those two look like a cycle between
     * the tables. Per role, each is a straight line of length one, and neither
     * evaluation can reach the other's policy at all.
     */
    const rows = await expressions();
    const byRole = new Map<string, Map<string, Set<string>>>();
    for (const row of rows) {
      const graph =
        byRole.get(row.role) ??
        new Map<string, Set<string>>(
          [...APPROVED_TABLES].map((table) => [table, new Set<string>()]),
        );
      byRole.set(row.role, graph);
      for (const target of fromTables(row.expr)) {
        if (target === row.on_table) continue; // column refs, not an edge
        graph.get(row.on_table)!.add(target);
      }
      /*
       * A policy that CALLS a table-reading function reaches those tables
       * just as surely as an inline subquery does, and the regex above cannot
       * see it. Milestone 2C's invitation policies re-derive Owner/Admin
       * through app.current_user_is_owner_admin(), so its reads are added
       * here — otherwise this graph would understate what evaluation touches
       * and the acyclicity claim below would be weaker than it looks.
       */
      if (/\bcurrent_user_is_owner_admin\s*\(/.test(row.expr)) {
        for (const target of ["workspace_memberships", "user_profiles"]) {
          if (target === row.on_table) continue;
          graph.get(row.on_table)!.add(target);
        }
      }
    }

    // Exactly the roles that hold policies, and no other.
    expect([...byRole.keys()].sort()).toEqual([
      "limenzy_app",
      "limenzy_bootstrap",
      "limenzy_invites",
      "limenzy_members",
    ]);

    const shape = (role: string, table: string) =>
      [...(byRole.get(role)?.get(table) ?? [])].sort();

    // The runtime role: workspaces -> memberships -> profiles -> (functions).
    expect(shape("limenzy_app", "workspaces")).toEqual([
      "workspace_memberships",
    ]);
    expect(shape("limenzy_app", "workspace_memberships")).toEqual([
      "user_profiles",
    ]);
    expect(shape("limenzy_app", "user_profiles")).toEqual([]);
    // Milestone 2C. The invitations table is a LEAF in the other direction:
    // it reads memberships and profiles, and nothing reads it. That is what
    // makes administration expressible as policies here when the equivalent
    // for memberships was not.
    expect(shape("limenzy_app", "workspace_invitations")).toEqual([
      "user_profiles",
      "workspace_memberships",
    ]);
    // Milestone 3A. Both configuration tables are leaves in the same
    // direction: reading them is a plain workspace-scope test, and only the
    // write policies reach anything, through the shared Owner/Admin
    // predicate. Nothing reads them back.
    expect(shape("limenzy_app", "workspace_lead_stages")).toEqual([
      "user_profiles",
      "workspace_memberships",
    ]);
    expect(shape("limenzy_app", "workspace_lead_sources")).toEqual([
      "user_profiles",
      "workspace_memberships",
    ]);

    // The bootstrap role: memberships -> profiles, and nothing from workspaces.
    expect(shape("limenzy_bootstrap", "workspaces")).toEqual([]);
    expect(shape("limenzy_bootstrap", "workspace_memberships")).toEqual([
      "user_profiles",
    ]);
    expect(shape("limenzy_bootstrap", "user_profiles")).toEqual([]);
    expect(shape("limenzy_bootstrap", "workspace_invitations")).toEqual([]);
    // Milestone 3A: the one SELECT this role holds on the stage table, which
    // the deferred shape check needs, is scoped through the membership it
    // has just written. Sources stay insert-only, so that node has no edge.
    expect(shape("limenzy_bootstrap", "workspace_lead_stages")).toEqual([
      "user_profiles",
      "workspace_memberships",
    ]);
    expect(shape("limenzy_bootstrap", "workspace_lead_sources")).toEqual([]);

    // The user-management role: profiles -> memberships, which terminates
    // because its membership policies reference no table at all. This is the
    // direction that would recurse if it were written for limenzy_app.
    expect(shape("limenzy_members", "user_profiles")).toEqual([
      "workspace_memberships",
    ]);
    expect(shape("limenzy_members", "workspace_memberships")).toEqual([]);
    expect(shape("limenzy_members", "workspaces")).toEqual([]);
    expect(shape("limenzy_members", "workspace_lead_stages")).toEqual([]);
    expect(shape("limenzy_members", "workspace_lead_sources")).toEqual([]);

    /*
     * The invitation-acceptance role: profiles and memberships both reach
     * user_profiles, and nothing reaches back. It never reads the
     * invitations table through a policy predicate — the routine finds the
     * row by token hash — so that node has no outgoing edge for this role.
     */
    expect(shape("limenzy_invites", "user_profiles")).toEqual([]);
    expect(shape("limenzy_invites", "workspace_memberships")).toEqual([
      "user_profiles",
    ]);
    expect(shape("limenzy_invites", "workspace_invitations")).toEqual([]);
    expect(shape("limenzy_invites", "workspaces")).toEqual([]);
    expect(shape("limenzy_invites", "workspace_lead_stages")).toEqual([]);
    expect(shape("limenzy_invites", "workspace_lead_sources")).toEqual([]);

    // Cycle detection by depth-first search with an explicit recursion stack.
    const permanent = new Set<string>();
    const stack = new Set<string>();
    const longest = new Map<string, number>();
    let current = new Map<string, Set<string>>();
    const visit = (node: string, path: string[]): number => {
      if (stack.has(node)) {
        throw new Error(
          `policy dependency cycle: ${[...path, node].join(" -> ")}`,
        );
      }
      if (permanent.has(node)) return longest.get(node) ?? 0;
      stack.add(node);
      let deepest = 0;
      for (const next of current.get(node) ?? []) {
        deepest = Math.max(deepest, 1 + visit(next, [...path, node]));
      }
      stack.delete(node);
      permanent.add(node);
      longest.set(node, deepest);
      return deepest;
    };

    for (const [role, graph] of byRole) {
      permanent.clear();
      stack.clear();
      longest.clear();
      current = graph;
      for (const node of graph.keys()) {
        expect(() => visit(node, [`${role}:`])).not.toThrow();
      }
      // No evaluation for any role may be deeper than the three-table chain.
      for (const [table, depth] of longest) {
        expect(`${role} ${table} depth<=2: ${depth <= 2}`).toBe(
          `${role} ${table} depth<=2: true`,
        );
      }
    }

    // The runtime role's chain, stated exactly: it is the one every request
    // evaluates, and its depth is the cost of a tenant read.
    current = byRole.get("limenzy_app")!;
    permanent.clear();
    stack.clear();
    longest.clear();
    for (const node of current.keys()) visit(node, []);
    expect(longest.get("workspaces")).toBe(2);
    expect(longest.get("workspace_memberships")).toBe(1);
    expect(longest.get("user_profiles")).toBe(0);
  });

  it("terminates because the context readers touch no table", async () => {
    const rows = await admin()<{ proname: string; refs: number }[]>`
      select p.proname,
             (select count(*)::int
                from pg_catalog.pg_depend d
               where d.classid = 'pg_proc'::regclass
                 and d.objid = p.oid
                 and d.refclassid = 'pg_class'::regclass) as refs
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'app'`;

    // The three readers are what policy expressions call, and they must reach
    // no table — that is what makes evaluation terminate. The routines that do
    // touch tables, deliberately, are excluded here because no policy
    // expression calls any of them; that none is reachable from a policy is
    // asserted immediately below.
    const TOUCHES_TABLES = new Set([
      "accept_workspace_invitation",
      "create_initial_workspace",
      "current_user_is_owner_admin",
      "pending_invitations_for",
      "set_member_role",
      "set_member_status",
      "workspace_members",
    ]);
    // Milestone 3A's two default-vocabulary functions reach no table either —
    // they are constant VALUES lists — but they are not context readers and no
    // policy calls them, so they are named here rather than silently swelling
    // the reader list below.
    const NOT_A_READER = new Set([
      "lead_stage_defaults",
      "lead_source_defaults",
    ]);
    const readers = rows.filter(
      (r) => !TOUCHES_TABLES.has(r.proname) && !NOT_A_READER.has(r.proname),
    );
    expect(readers.map((r) => r.proname).sort()).toEqual([
      "current_auth_user_id",
      "current_user_profile_id",
      "current_workspace_id",
    ]);
    for (const row of readers) {
      expect(`${row.proname} table refs: ${row.refs}`).toBe(
        `${row.proname} table refs: 0`,
      );
    }

    // No policy expression may call a routine that reaches a table. A
    // SECURITY DEFINER function inside a policy would evaluate with the
    // definer's privileges every time a row is checked, and a table-reading
    // one would reopen the recursion the per-role graph rules out.
    for (const row of await expressions()) {
      for (const routine of [
        "accept_workspace_invitation",
        "create_initial_workspace",
        "pending_invitations_for",
        "set_member_role",
        "set_member_status",
        "workspace_members",
      ]) {
        // A CALL, not a mention: `workspace_members` is a prefix of
        // `workspace_memberships`, so a substring test would flag every
        // policy that merely names the table.
        const called = new RegExp(`\\b${routine}\\s*\\(`).test(row.expr);
        expect(`${row.policy} calls ${routine}: false`).toBe(
          `${row.policy} calls ${routine}: ${called}`,
        );
      }
    }
  });
});
