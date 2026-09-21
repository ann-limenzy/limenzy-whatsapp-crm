// @vitest-environment node
import postgres from "postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { resolveVerifiedIdentity } from "@/server/db/identity";
import { isIssuedTenantContext } from "@/server/db/tenant-context";
import { withTenant } from "@/server/db/tenant";
import { resolveWorkspaceContext } from "@/server/auth/workspace-context";

/**
 * Milestone 1C-C Phase 4C-2 - the operation against the real database.
 *
 * The unit suite proves the validation and mapping rules with the pool faked.
 * This one proves the part that only a real database can: that the operation
 * drives the Phase 4C-1 routine correctly over a genuine `limenzy_app`
 * connection, and that afterwards the **normal** resolution path - Phase 4A
 * then Phase 4B - finds the new tenancy and is the only thing that hands out a
 * `TenantContext`.
 *
 * Two test-side substitutions, both of existing modules and both permitted:
 * the verified-auth utility (how a test represents a signed-in user, and what
 * lets 4A re-resolve as the same person) and the runtime pool boundary, so
 * pool size is known and every statement can be observed. No production seam.
 */

const getAuthenticatedUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-user", () => ({ getAuthenticatedUser }));

const H = vi.hoisted(() => ({
  active: null as postgres.Sql | null,
  statements: [] as { sql: string; values: unknown[] }[],
  failOn: null as RegExp | null,
  opened: 0,
}));

vi.mock("@/server/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/db/client")>();
  return { ...actual, runtimeSql: () => H.active as postgres.Sql };
});

const { BootstrapError, createInitialWorkspace } =
  await import("./create-initial-workspace");

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

const open = (url: string, max = 1) =>
  postgres(url, {
    max,
    idle_timeout: 4,
    connect_timeout: 5,
    onnotice: () => {},
  });

const probe = async (url: string): Promise<postgres.Sql | undefined> => {
  if (!url) return undefined;
  const candidate = open(url, 2);
  try {
    await candidate`select 1`;
    return candidate;
  } catch {
    await candidate.end({ timeout: 1 }).catch(() => {});
    return undefined;
  }
};

const tooling = await probe(TOOLING);
const runtimeReachable = await probe(RUNTIME);
await runtimeReachable?.end({ timeout: 1 }).catch(() => {});
const reachable = tooling !== undefined && runtimeReachable !== undefined;

if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] Phase 4C-2 tests need both connections. Run "npm run db:start", ' +
      '"npm run db:reset" and "npm run db:role:local".',
  );
}

const admin = () => {
  if (!tooling) throw new Error("no tooling connection");
  return tooling;
};

const first = <T>(rows: readonly T[], what: string): T => {
  const row = rows[0];
  if (row === undefined) throw new Error(`expected a row: ${what}`);
  return row;
};

const RUN = crypto.randomUUID().slice(0, 8);
const authUsers: string[] = [];

/** Records every statement, and can make one fail like a driver would. */
const tracingPool = (pool: postgres.Sql): postgres.Sql =>
  new Proxy(pool, {
    get(target, property) {
      if (property === "begin") {
        return <T>(fn: (tx: postgres.TransactionSql) => Promise<T>) => {
          H.opened += 1;
          return target.begin((tx) =>
            fn(
              new Proxy(tx, {
                apply(inner, _thisArg, args) {
                  const sql = String((args[0] as string[]).join("?"))
                    .replace(/\s+/g, " ")
                    .trim();
                  H.statements.push({ sql, values: args.slice(1) });
                  if (H.failOn?.test(sql)) {
                    const error = new Error(
                      "connection terminated: postgresql://not-a-real-user:" +
                        "not-a-real-password@db.invalid:5432/postgres while " +
                        'executing "select app.create_initial_workspace($1)"',
                    ) as Error & { code?: string };
                    error.code = "08006";
                    throw error;
                  }
                  return Reflect.apply(
                    inner as unknown as (...a: unknown[]) => unknown,
                    inner,
                    args,
                  );
                },
                get(inner, key) {
                  const value = Reflect.get(inner, key) as unknown;
                  return typeof value === "function"
                    ? value.bind(inner)
                    : value;
                },
              }) as postgres.TransactionSql,
            ),
          );
        };
      }
      const value = Reflect.get(target, property) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as postgres.Sql;

let solo: postgres.Sql;
let pair: postgres.Sql | undefined;

const signedIn = (
  authUserId: string,
  overrides: Record<string, unknown> = {},
) => ({
  id: authUserId,
  email: `c2-${authUserId.slice(0, 8)}@example.com`,
  emailVerified: true,
  fullName: "Metadata Name",
  ...overrides,
});

const VALID = {
  fullName: "  Ann Sebastian  ",
  workspaceName: `  Bootstrap C2 ${RUN}  `,
  businessType: "  Retail  ",
  country: "in",
  currency: "inr",
  timeZone: "Asia/Kolkata",
};

const as = (
  authUserId: string | null,
  overrides: Record<string, unknown> = {},
) =>
  getAuthenticatedUser.mockResolvedValue(
    authUserId === null ? null : signedIn(authUserId, overrides),
  );

const makeAuthUser = async () => {
  const rows = await admin()<{ id: string }[]>`
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
            'authenticated', 'authenticated',
            ${`c2-${RUN}-${crypto.randomUUID().slice(0, 8)}@example.com`},
            'not-a-real-password-hash', now(), now())
    returning id`;
  const id = first(rows, "auth user").id;
  authUsers.push(id);
  return id;
};

const tenancyOf = async (authUserId: string) =>
  first(
    await admin()<
      {
        profiles: number;
        memberships: number;
        workspaces: number;
        roles: string | null;
      }[]
    >`
    with p as (select id from public.user_profiles where auth_user_id = ${authUserId}),
         m as (select * from public.workspace_memberships
                where user_profile_id in (select id from p))
    select (select count(*)::int from p)                     as profiles,
           (select count(*)::int from m)                     as memberships,
           (select count(distinct workspace_id)::int from m) as workspaces,
           (select string_agg(role::text || '/' || status::text, ',') from m) as roles`,
    "tenancy",
  );

const surfaceOf = (error: unknown) => {
  const e = error as Error & { cause?: unknown; query?: string };
  return [
    e?.name,
    e?.message,
    String(e?.cause ?? ""),
    String(e?.query ?? ""),
  ].join(" ");
};

beforeAll(() => {
  if (!reachable) return;
  solo = open(RUNTIME, 1);
  H.active = tracingPool(solo);
});

afterEach(() => {
  getAuthenticatedUser.mockReset();
  H.statements = [];
  H.failOn = null;
  H.opened = 0;
  if (reachable) H.active = tracingPool(solo);
});

afterAll(async () => {
  if (reachable && authUsers.length > 0) {
    const sql = admin();
    const workspaces = (
      await sql<{ workspace_id: string }[]>`
        select distinct m.workspace_id
          from public.workspace_memberships m
          join public.user_profiles p on p.id = m.user_profile_id
         where p.auth_user_id in ${sql(authUsers)}`
    ).map((r) => r.workspace_id);

    await sql`delete from public.workspace_memberships
               where user_profile_id in (
                 select id from public.user_profiles
                  where auth_user_id in ${sql(authUsers)})`.catch(() => {});
    await sql`delete from public.user_profiles
               where auth_user_id in ${sql(authUsers)}`.catch(() => {});
    if (workspaces.length > 0) {
      await sql`delete from public.workspaces
                 where id in ${sql(workspaces)}`.catch(() => {});
    }
    await sql`delete from public.workspaces
               where name like ${`Bootstrap C2%${RUN}%`}`.catch(() => {});
    await sql`delete from auth.users where id in ${sql(authUsers)}`.catch(
      () => {},
    );
  }
  await tooling?.end({ timeout: 2 }).catch(() => {});
  await solo?.end({ timeout: 2 }).catch(() => {});
  await pair?.end({ timeout: 2 }).catch(() => {});
});

describe.skipIf(!reachable)("Phase 4C-2 - creating the first tenancy", () => {
  it("1/2/3/4. creates one tenancy, stores the normalized values, returns no identifier", async () => {
    const auth = await makeAuthUser();
    as(auth);

    const result = await createInitialWorkspace(VALID);
    expect(result).toEqual({ kind: "created" });
    // The result is a word, not a record: no id, no role, no input echoed.
    expect(Object.keys(result)).toEqual(["kind"]);
    const surface = JSON.stringify(result);
    for (const secret of [
      auth,
      "owner_admin",
      "Ann Sebastian",
      "Asia/Kolkata",
    ]) {
      expect(surface).not.toContain(secret);
    }

    expect(await tenancyOf(auth)).toMatchObject({
      profiles: 1,
      workspaces: 1,
      memberships: 1,
      roles: "owner_admin/active",
    });

    // Stored values are the normalized ones: trimmed, upper-cased codes.
    const stored = first(
      await admin()<
        {
          full_name: string;
          name: string;
          business_type: string | null;
          country: string;
          currency: string;
          time_zone: string;
        }[]
      >`
        select p.full_name, w.name, w.business_type, w.country, w.currency, w.time_zone
          from public.user_profiles p
          join public.workspace_memberships m on m.user_profile_id = p.id
          join public.workspaces w on w.id = m.workspace_id
         where p.auth_user_id = ${auth}`,
      "stored row",
    );
    expect(stored).toEqual({
      full_name: "Ann Sebastian",
      name: `Bootstrap C2 ${RUN}`,
      business_type: "Retail",
      country: "IN",
      currency: "INR",
      time_zone: "Asia/Kolkata",
    });
  });

  it("5/6. returns already_onboarded on a second call and creates nothing", async () => {
    const auth = await makeAuthUser();
    as(auth);
    expect(await createInitialWorkspace(VALID)).toEqual({ kind: "created" });
    const after = await tenancyOf(auth);

    expect(
      await createInitialWorkspace({
        ...VALID,
        workspaceName: `Bootstrap C2 Second ${RUN}`,
      }),
    ).toEqual({ kind: "already_onboarded" });

    expect(await tenancyOf(auth)).toEqual(after);
    const second = await admin()`
      select 1 from public.workspaces
       where name = ${`Bootstrap C2 Second ${RUN}`}`;
    expect(second).toHaveLength(0);
  });

  it("18. issues only the context setting and the routine call", async () => {
    const auth = await makeAuthUser();
    as(auth);
    await createInitialWorkspace(VALID);

    expect(H.statements).toHaveLength(2);
    // The setting NAME is a bound value, not text spliced into the statement —
    // so the assertion reads the binding, which is the thing that matters.
    expect(H.statements[0]?.sql).toMatch(/set_config\(\?, \?, true\)/);
    expect(H.statements[0]?.values[0]).toBe("app.auth_user_id");
    expect(H.statements[1]?.sql).toContain("app.create_initial_workspace");
    // Six business values, and no seventh.
    expect(H.statements[1]?.values).toHaveLength(6);

    const all = H.statements.map((s) => s.sql).join(" ");
    expect(all).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/i);
    expect(all).not.toMatch(/from public\./i);
    const bound = H.statements.flatMap((s) => s.values.map(String)).join(" ");
    for (const setting of ["app.user_profile_id", "app.workspace_id"]) {
      expect(
        `${setting}: ${all.includes(setting) || bound.includes(setting)}`,
      ).toBe(`${setting}: false`);
    }
  });
});

describe.skipIf(!reachable)(
  "Phase 4C-2 - resolution happens afterwards, not here",
  () => {
    it("7/8/9/10. Phase 4A then 4B find the new tenancy and mint the only context", async () => {
      const auth = await makeAuthUser();
      as(auth);

      const created = await createInitialWorkspace(VALID);
      expect(created).toEqual({ kind: "created" });
      // Nothing context-shaped came back from bootstrap.
      expect(created).not.toHaveProperty("context");
      expect(created).not.toHaveProperty("role");

      // Phase 4A: the profile and membership are readable under RLS as this user.
      const identity = await resolveVerifiedIdentity();
      expect(identity.kind).toBe("resolved");
      if (identity.kind !== "resolved") return;
      expect(identity.authUserId).toBe(auth);
      expect(identity.memberships).toHaveLength(1);
      expect(identity.memberships[0]?.role).toBe("owner_admin");

      // Phase 4B: exactly one active membership, so it is selected automatically.
      const resolution = await resolveWorkspaceContext();
      expect(resolution.kind).toBe("ok");
      if (resolution.kind !== "ok") return;
      expect(resolution.role).toBe("owner_admin");
      expect(resolution.context.authUserId).toBe(auth);
      expect(resolution.context.workspaceId).toBe(
        identity.memberships[0]?.workspaceId,
      );

      // The context is genuine, and it came from 4B - bootstrap minted none.
      expect(isIssuedTenantContext(resolution.context)).toBe(true);

      // And it works: the new workspace is visible through the gateway.
      const visible = await withTenant(resolution.context, async (tx) => {
        const rows = await tx<{ name: string }[]>`
        select name from public.workspaces`;
        return rows.map((r) => r.name);
      });
      expect(visible).toEqual([`Bootstrap C2 ${RUN}`]);
    });
  },
);

describe.skipIf(!reachable)("Phase 4C-2 - refusals and failures", () => {
  it("11. creates nothing and opens no connection for invalid input", async () => {
    const auth = await makeAuthUser();
    as(auth);

    for (const bad of [
      { ...VALID, country: "ZZ" },
      { ...VALID, currency: "ZZZ" },
      { ...VALID, timeZone: "Mars/Olympus" },
      { ...VALID, timeZone: "+05:30" },
      { ...VALID, timeZone: "asia/kolkata" },
      { ...VALID, workspaceName: " " },
      { ...VALID, authUserId: auth },
      null,
    ]) {
      const result = await createInitialWorkspace(bad);
      expect(result.kind).toBe("invalid_input");
    }
    expect(H.opened).toBe(0);
    expect(H.statements).toEqual([]);
    expect(await tenancyOf(auth)).toMatchObject({ profiles: 0 });
  });

  it("12. creates nothing and opens no connection without a verified identity", async () => {
    const auth = await makeAuthUser();

    as(null);
    expect(await createInitialWorkspace(VALID)).toEqual({
      kind: "unauthenticated",
    });

    as(auth, { emailVerified: false });
    expect(await createInitialWorkspace(VALID)).toEqual({
      kind: "unauthenticated",
    });

    as(auth, { id: auth.toUpperCase() });
    expect(await createInitialWorkspace(VALID)).toEqual({
      kind: "unauthenticated",
    });

    expect(H.opened).toBe(0);
    expect(H.statements).toEqual([]);
    expect(await tenancyOf(auth)).toMatchObject({ profiles: 0 });
  });

  it("13. turns a driver-shaped failure into a sanitized BootstrapError", async () => {
    const auth = await makeAuthUser();
    as(auth);
    H.failOn = /create_initial_workspace/;

    const error = await createInitialWorkspace(VALID).then(
      () => undefined,
      (caught: unknown) => caught as InstanceType<typeof BootstrapError>,
    );
    expect(error).toBeInstanceOf(BootstrapError);
    expect(error?.cause).toBeUndefined();

    const surface = surfaceOf(error);
    for (const secret of [
      "postgresql://",
      "not-a-real-password",
      "db.invalid",
      "select app.create_initial_workspace",
      auth,
    ]) {
      expect(`${secret}: ${surface.includes(secret)}`).toBe(`${secret}: false`);
    }
    // The transaction rolled back, so nothing was created.
    expect(await tenancyOf(auth)).toMatchObject({ profiles: 0 });
  });
});

describe.skipIf(!reachable)(
  "Phase 4C-2 - the pooled connection carries nothing over",
  () => {
    const settings = async () =>
      first(
        await solo<
          {
            auth: string;
            profile: string;
            workspace: string;
            backend: string;
          }[]
        >`
        select coalesce(current_setting('app.auth_user_id', true), '')    as auth,
               coalesce(current_setting('app.user_profile_id', true), '') as profile,
               coalesce(current_setting('app.workspace_id', true), '')    as workspace,
               pg_backend_pid()::text                                     as backend`,
        "settings",
      );

    it("14/15. leaves no setting after commit or after rollback", async () => {
      const before = await settings();

      const committed = await makeAuthUser();
      as(committed);
      expect(await createInitialWorkspace(VALID)).toEqual({ kind: "created" });
      const afterCommit = await settings();
      expect(afterCommit.backend).toBe(before.backend);
      expect({
        auth: afterCommit.auth,
        profile: afterCommit.profile,
        workspace: afterCommit.workspace,
      }).toEqual({ auth: "", profile: "", workspace: "" });

      const rolled = await makeAuthUser();
      as(rolled);
      H.failOn = /create_initial_workspace/;
      await createInitialWorkspace({
        ...VALID,
        workspaceName: `Bootstrap C2 Rollback ${RUN}`,
      }).catch(() => {});
      const afterRollback = await settings();
      expect(afterRollback.backend).toBe(before.backend);
      expect({
        auth: afterRollback.auth,
        profile: afterRollback.profile,
        workspace: afterRollback.workspace,
      }).toEqual({ auth: "", profile: "", workspace: "" });
    });

    it("16. keeps sequential users apart on one pooled connection", async () => {
      const one = await makeAuthUser();
      const two = await makeAuthUser();

      as(one);
      expect(
        await createInitialWorkspace({
          ...VALID,
          workspaceName: `Bootstrap C2 Seq One ${RUN}`,
        }),
      ).toEqual({ kind: "created" });

      as(two);
      expect(
        await createInitialWorkspace({
          ...VALID,
          workspaceName: `Bootstrap C2 Seq Two ${RUN}`,
        }),
      ).toEqual({ kind: "created" });

      // Two separate tenancies, on the same physical backend.
      for (const auth of [one, two]) {
        expect(await tenancyOf(auth)).toMatchObject({
          profiles: 1,
          workspaces: 1,
          memberships: 1,
        });
      }
      const names = await admin()<{ name: string }[]>`
      select w.name from public.workspaces w
        join public.workspace_memberships m on m.workspace_id = w.id
        join public.user_profiles p on p.id = m.user_profile_id
       where p.auth_user_id = ${one}`;
      expect(names.map((n) => n.name)).toEqual([`Bootstrap C2 Seq One ${RUN}`]);
    });

    it("17. keeps concurrent users apart on a two-connection pool", async () => {
      pair ??= open(RUNTIME, 2);
      const one = await makeAuthUser();
      const two = await makeAuthUser();

      // Each call reads its user first, so the queued values land in order.
      getAuthenticatedUser
        .mockResolvedValueOnce(signedIn(one))
        .mockResolvedValueOnce(signedIn(two));
      H.active = tracingPool(pair);

      const results = await Promise.all([
        createInitialWorkspace({
          ...VALID,
          workspaceName: `Bootstrap C2 Con One ${RUN}`,
        }),
        createInitialWorkspace({
          ...VALID,
          workspaceName: `Bootstrap C2 Con Two ${RUN}`,
        }),
      ]);
      expect(results).toEqual([{ kind: "created" }, { kind: "created" }]);

      for (const auth of [one, two]) {
        expect(await tenancyOf(auth)).toMatchObject({
          profiles: 1,
          workspaces: 1,
          memberships: 1,
          roles: "owner_admin/active",
        });
      }
      // Neither ended up owning the other's workspace.
      const owned = async (auth: string) =>
        (
          await admin()<{ name: string }[]>`
          select w.name from public.workspaces w
            join public.workspace_memberships m on m.workspace_id = w.id
            join public.user_profiles p on p.id = m.user_profile_id
           where p.auth_user_id = ${auth}`
        ).map((r) => r.name);
      expect(await owned(one)).toEqual([`Bootstrap C2 Con One ${RUN}`]);
      expect(await owned(two)).toEqual([`Bootstrap C2 Con Two ${RUN}`]);
    });
  },
);

describe.skipIf(!reachable)(
  "Phase 4C-2 - the time-zone list agrees with the database",
  () => {
    it("accepts only identifiers PostgreSQL also knows", async () => {
      const { TIME_ZONES } = await import("@/lib/validation/workspace-setup");
      const sql = admin();
      const known = new Set(
        (await sql<{ name: string }[]>`select name from pg_timezone_names`).map(
          (r) => r.name,
        ),
      );
      const unknown = TIME_ZONES.filter((zone) => !known.has(zone));
      // If this fails, the allow-list has drifted from the table the 1C-B
      // trigger consults, and a user could pass validation only to hit a
      // database error.
      expect(unknown).toEqual([]);
      expect(TIME_ZONES.length).toBeGreaterThan(500);
      expect(TIME_ZONES).toContain("Asia/Kolkata");
    });
  },
);
