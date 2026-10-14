// @vitest-environment node
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  TenantContextConflict,
  TenantContextUntrusted,
  withTenant,
} from "./tenant";
import {
  TenantContextError,
  createTenantContext,
  type TenantContext,
} from "./tenant-context";

/**
 * Test-only pool injection.
 *
 * The production module exports no pool setter and no alternate gateway: there
 * is exactly one `withTenant()`, and these tests call it. What varies is which
 * pool `runtimeSql()` hands back, replaced here through module mocking so the
 * substitution lives entirely in test infrastructure.
 *
 * The default is a pool of ONE connection, so "the same backend was reused" is
 * a physical fact rather than an inference. One test needs genuine concurrency
 * and swaps in a two-connection pool for its duration.
 */
const actualClient =
  await vi.importActual<typeof import("./client")>("./client");

const H = vi.hoisted(() => ({
  single: null as postgres.Sql | null,
  active: null as postgres.Sql | null,
}));

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  H.single ??= actual.createRuntimePool({ max: 1 });
  H.active ??= H.single;
  return { ...actual, runtimeSql: () => H.active as postgres.Sql };
});

/**
 * The genuine pool factory, reached through the unmocked module.
 *
 * `vi.mock` above replaces only `runtimeSql`; everything else is the real
 * implementation, so this is the same reviewed configuration production uses,
 * with a different size.
 */
const createRuntimePoolFromActual = (overrides?: { max?: number }) => {
  const { createRuntimePool } = actualClient;
  return createRuntimePool(overrides);
};

/** Run `fn` with a temporarily different pool. Restored unconditionally. */
const withPool = async <T>(pool: postgres.Sql, fn: () => Promise<T>) => {
  const previous = H.active;
  H.active = pool;
  try {
    return await fn();
  } finally {
    H.active = previous;
  }
};

/**
 * Milestone 1C-C Phase 3 — the runtime gateway, against a real database.
 *
 * Nothing here is mocked. Every claim about transactions, pooling,
 * transaction-local settings or row-level security is made by executing it.
 *
 * Fixtures are created and removed with the tooling connection, which bypasses
 * RLS; every assertion about what the application can *see* runs through
 * `withTenant()` on the `limenzy_app` runtime connection.
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
const reachable = tooling !== undefined && RUNTIME !== "";

if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] the gateway suite needs both connections. Run "npm run db:start", ' +
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

const fx = {
  authA: "",
  authB: "",
  profileA: "",
  profileB: "",
  workspaceA: "",
  workspaceB: "",
};
let ctxA: TenantContext;
let ctxB: TenantContext;

beforeAll(async () => {
  if (!reachable) return;
  const sql = admin();

  const authUser = async () => {
    const rows = await sql`
      insert into auth.users
        (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
              'authenticated', 'authenticated',
              ${`gw-${RUN}-${crypto.randomUUID().slice(0, 8)}@example.com`},
              'not-a-real-password-hash', now(), now())
      returning id`;
    return first(rows as unknown as { id: string }[], "auth user").id;
  };
  const profile = async (authUserId: string, name: string) => {
    const rows = await sql`
      insert into public.user_profiles (auth_user_id, full_name)
      values (${authUserId}, ${name}) returning id`;
    return first(rows as unknown as { id: string }[], "profile").id;
  };
  const workspace = async (name: string) => {
    const rows = await sql`
      insert into public.workspaces (name, country, currency, time_zone)
      values (${name}, 'IN', 'INR', 'Asia/Kolkata') returning id`;
    return first(rows as unknown as { id: string }[], "workspace").id;
  };

  fx.authA = await authUser();
  fx.authB = await authUser();
  fx.profileA = await profile(fx.authA, `GW A ${RUN}`);
  fx.profileB = await profile(fx.authB, `GW B ${RUN}`);
  fx.workspaceA = await workspace(`GW WS A ${RUN}`);
  fx.workspaceB = await workspace(`GW WS B ${RUN}`);

  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fx.workspaceA}, ${fx.profileA}, 'owner_admin', 'active')`;
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fx.workspaceB}, ${fx.profileB}, 'staff_sales', 'active')`;

  ctxA = createTenantContext({
    authUserId: fx.authA,
    userProfileId: fx.profileA,
    workspaceId: fx.workspaceA,
  });
  ctxB = createTenantContext({
    authUserId: fx.authB,
    userProfileId: fx.profileB,
    workspaceId: fx.workspaceB,
  });
});

afterAll(async () => {
  if (reachable) {
    const sql = admin();
    await sql`delete from public.workspace_memberships
               where user_profile_id in (${fx.profileA}, ${fx.profileB})`.catch(
      () => {},
    );
    await sql`delete from public.user_profiles
               where id in (${fx.profileA}, ${fx.profileB})`.catch(() => {});
    await sql`delete from public.workspaces
               where id in (${fx.workspaceA}, ${fx.workspaceB})`.catch(
      () => {},
    );
    await sql`delete from auth.users where id in (${fx.authA}, ${fx.authB})`.catch(
      () => {},
    );
  }
  await H.single?.end({ timeout: 2 }).catch(() => {});
  await tooling?.end({ timeout: 2 }).catch(() => {});
});

/** The injected single-connection pool, for bare (no-context) queries. */
const pool1 = () => {
  if (!H.single) throw new Error("no single-connection pool");
  return H.single;
};

/** The three settings as the database currently sees them. */
const readSettings = async (tx: postgres.TransactionSql | postgres.Sql) =>
  first(
    (await tx`
      select coalesce(current_setting('app.auth_user_id', true), '')     as auth,
             coalesce(current_setting('app.user_profile_id', true), '')  as profile,
             coalesce(current_setting('app.workspace_id', true), '')     as workspace,
             pg_backend_pid()::text                                      as backend`) as unknown as {
      auth: string;
      profile: string;
      workspace: string;
      backend: string;
    }[],
    "settings",
  );

describe.skipIf(!reachable)("the runtime connection", () => {
  it("1. connects as limenzy_app", async () => {
    const row = await withTenant(ctxA, async (tx) =>
      first(
        (await tx`select current_user as u`) as unknown as { u: string }[],
        "user",
      ),
    );
    expect(row.u).toBe("limenzy_app");
  });

  it("2. is non-owner, non-superuser and NOBYPASSRLS", async () => {
    const row = await withTenant(ctxA, async (tx) =>
      first(
        (await tx`
          select r.rolsuper as super, r.rolbypassrls as bypass,
                 (select count(*)::int from pg_catalog.pg_class c
                    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                   where n.nspname = 'public'
                     and pg_catalog.pg_get_userbyid(c.relowner) = current_user
                 ) as owned
            from pg_catalog.pg_roles r where r.rolname = current_user`) as unknown as {
          super: boolean;
          bypass: boolean;
          owned: number;
        }[],
        "role attributes",
      ),
    );
    expect(row.super).toBe(false);
    expect(row.bypass).toBe(false);
    expect(row.owned).toBe(0);
  });

  it("23. hands the callback a transaction, never the pool", async () => {
    await withTenant(ctxA, async (tx) => {
      const handle = tx as unknown as Record<string, unknown>;
      // The driver's transaction handle lacks the pool surface entirely.
      for (const poolOnly of [
        "end",
        "END",
        "CLOSE",
        "options",
        "listen",
        "reserve",
      ]) {
        expect(`${poolOnly}: ${typeof handle[poolOnly]}`).toBe(
          `${poolOnly}: undefined`,
        );
      }
    });
  });

  it("24. sees nothing when queried outside withTenant()", async () => {
    // Fail closed: permitted by grant, denied by policy, because no context.
    for (const table of [
      "workspaces",
      "user_profiles",
      "workspace_memberships",
    ]) {
      const rows = await pool1().unsafe(
        `select count(*)::int as n from public.${table}`,
      );
      expect(
        `${table}=${first(rows as unknown as { n: number }[], table).n}`,
      ).toBe(`${table}=0`);
    }
  });
});

describe.skipIf(!reachable)(
  "context settings inside and outside the transaction",
  () => {
    it("3. exposes all three readers with the expected values", async () => {
      const row = await withTenant(ctxA, async (tx) =>
        first(
          (await tx`
          select app.current_auth_user_id()::text    as auth,
                 app.current_user_profile_id()::text as profile,
                 app.current_workspace_id()::text    as workspace`) as unknown as {
            auth: string;
            profile: string;
            workspace: string;
          }[],
          "context readers",
        ),
      );
      expect(row.auth).toBe(fx.authA);
      expect(row.profile).toBe(fx.profileA);
      expect(row.workspace).toBe(fx.workspaceA);
    });

    it("4. returns NULL from the readers outside a transaction", async () => {
      const row = first(
        (await pool1()`
        select app.current_auth_user_id()    as auth,
               app.current_user_profile_id() as profile,
               app.current_workspace_id()    as workspace`) as unknown as {
          auth: string | null;
          profile: string | null;
          workspace: string | null;
        }[],
        "readers outside",
      );
      expect(row.auth).toBeNull();
      expect(row.profile).toBeNull();
      expect(row.workspace).toBeNull();
    });
  },
);

describe.skipIf(!reachable)("tenant scoping through the gateway", () => {
  const visibleWorkspaces = async (ctx: TenantContext) =>
    withTenant(ctx, async (tx) => {
      const rows = await tx`select id from public.workspaces`;
      return (rows as unknown as { id: string }[]).map((r) => r.id);
    });

  it("5. context A sees only workspace A", async () => {
    expect(await visibleWorkspaces(ctxA)).toEqual([fx.workspaceA]);
  });

  it("6/7. neither context can see the other's workspace", async () => {
    expect(await visibleWorkspaces(ctxA)).not.toContain(fx.workspaceB);
    expect(await visibleWorkspaces(ctxB)).toEqual([fx.workspaceB]);
    expect(await visibleWorkspaces(ctxB)).not.toContain(fx.workspaceA);
  });

  it("26. cannot INSERT or DELETE tenant-foundation rows", async () => {
    for (const statement of [
      `insert into public.workspaces (name, country, currency, time_zone)
         values ('x', 'IN', 'INR', 'Asia/Kolkata')`,
      `delete from public.workspaces`,
      `delete from public.workspace_memberships`,
      `delete from public.user_profiles`,
    ]) {
      await expect(
        withTenant(ctxA, async (tx) => {
          await tx.unsafe(statement);
        }),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it("27. still obeys the Phase-2 owner_admin policy and column grants", async () => {
    // A is owner_admin of workspace A: an approved column succeeds.
    const updated = await withTenant(ctxA, async (tx) => {
      const rows =
        await tx`update public.workspaces set name = ${`GW renamed ${RUN}`}
                             where id = ${fx.workspaceA} returning id`;
      return rows.length;
    });
    expect(updated).toBe(1);

    // B is staff_sales of workspace B: the same statement changes nothing.
    const denied = await withTenant(ctxB, async (tx) => {
      const rows =
        await tx`update public.workspaces set name = ${`GW hijack ${RUN}`}
                             where id = ${fx.workspaceB} returning id`;
      return rows.length;
    });
    expect(denied).toBe(0);

    // An unapproved column is refused at the privilege layer for either role.
    await expect(
      withTenant(ctxA, async (tx) => {
        await tx`update public.workspaces set updated_at = now()
                  where id = ${fx.workspaceA}`;
      }),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe.skipIf(!reachable)("pool-size-1 leakage proof", () => {
  const bare = async () => readSettings(pool1());

  it("8/10. A then no-context on the same backend leaks nothing", async () => {
    const inside = await withTenant(ctxA, (tx) => readSettings(tx));
    expect(inside.workspace).toBe(fx.workspaceA);

    const after = await bare();
    // Same physical backend, so reuse is demonstrated, not assumed.
    expect(after.backend).toBe(inside.backend);
    expect([after.auth, after.profile, after.workspace]).toEqual(["", "", ""]);

    const rows =
      await pool1()`select count(*)::int as n from public.workspaces`;
    expect(first(rows as unknown as { n: number }[], "rows").n).toBe(0);
  });

  it("9. B then A then no-context leaks nothing in either direction", async () => {
    const b = await withTenant(ctxB, (tx) => readSettings(tx));
    expect(b.workspace).toBe(fx.workspaceB);
    const a = await withTenant(ctxA, (tx) => readSettings(tx));
    expect(a.workspace).toBe(fx.workspaceA);
    expect(a.backend).toBe(b.backend);

    const after = await bare();
    expect(after.backend).toBe(a.backend);
    expect([after.auth, after.profile, after.workspace]).toEqual(["", "", ""]);
  });

  it("11/12. a thrown callback rolls back and leaks no setting", async () => {
    const before = first(
      (await admin()`select name from public.workspaces where id = ${fx.workspaceA}`) as unknown as {
        name: string;
      }[],
      "before",
    );

    await expect(
      withTenant(ctxA, async (tx) => {
        await tx`update public.workspaces set name = ${`GW rollback ${RUN}`}
                  where id = ${fx.workspaceA}`;
        throw new Error("deliberate failure");
      }),
    ).rejects.toThrow(/deliberate failure/);

    const after = first(
      (await admin()`select name from public.workspaces where id = ${fx.workspaceA}`) as unknown as {
        name: string;
      }[],
      "after",
    );
    expect(after.name).toBe(before.name); // rolled back

    const settings = await bare();
    expect([settings.auth, settings.profile, settings.workspace]).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("13. a committed transaction leaks no setting", async () => {
    const inside = await withTenant(ctxB, (tx) => readSettings(tx));
    expect(inside.workspace).toBe(fx.workspaceB);
    const after = await bare();
    expect(after.backend).toBe(inside.backend);
    expect([after.auth, after.profile, after.workspace]).toEqual(["", "", ""]);
  });

  it("14. concurrent A and B transactions do not observe each other", async () => {
    // Genuine parallelism needs two connections, so this test — and only this
    // test — swaps the injected pool. It still calls the public withTenant().
    const both = createRuntimePoolFromActual({ max: 2 });
    try {
      const [a, b] = await withPool(both, () =>
        Promise.all([
          withTenant(ctxA, async (tx) => {
            await tx`select pg_sleep(0.05)`;
            return readSettings(tx);
          }),
          withTenant(ctxB, async (tx) => {
            await tx`select pg_sleep(0.05)`;
            return readSettings(tx);
          }),
        ]),
      );
      expect(a.workspace).toBe(fx.workspaceA);
      expect(b.workspace).toBe(fx.workspaceB);
      expect(a.backend).not.toBe(b.backend);
    } finally {
      await both.end({ timeout: 2 }).catch(() => {});
    }
  });
});

describe.skipIf(!reachable)("context authenticity and validation", () => {
  it("15. rejects malformed values before opening a transaction", async () => {
    for (const bad of [
      {
        authUserId: "",
        userProfileId: fx.profileA,
        workspaceId: fx.workspaceA,
      },
      {
        authUserId: "not-a-uuid",
        userProfileId: fx.profileA,
        workspaceId: fx.workspaceA,
      },
      { authUserId: fx.authA, userProfileId: "  ", workspaceId: fx.workspaceA },
      { authUserId: fx.authA, userProfileId: fx.profileA, workspaceId: "123" },
    ]) {
      expect(() => createTenantContext(bad)).toThrow(TenantContextError);
    }
  });

  it("15b. names the field but never the value in the error", () => {
    try {
      createTenantContext({
        authUserId: "11111111-2222-3333-4444-555555555555-SECRET",
        userProfileId: fx.profileA,
        workspaceId: fx.workspaceA,
      });
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("authUserId");
      expect(message).not.toContain("SECRET");
      expect(message).not.toContain(fx.profileA);
    }
  });

  it("16. rejects a hand-made object even with valid UUIDs", async () => {
    const forged = {
      authUserId: fx.authA,
      userProfileId: fx.profileA,
      workspaceId: fx.workspaceA,
    } as unknown as TenantContext;

    await expect(
      withTenant(forged, async () => "should not run"),
    ).rejects.toThrow(TenantContextUntrusted);

    // A shallow copy of a genuine context is equally rejected.
    await expect(
      withTenant({ ...ctxA } as TenantContext, async () => "nope"),
    ).rejects.toThrow(TenantContextUntrusted);
  });

  it("16b. issues frozen contexts", () => {
    expect(Object.isFrozen(ctxA)).toBe(true);
  });
});

describe.skipIf(!reachable)("nested calls", () => {
  it("17/18. a same-context nested call reuses the outer transaction", async () => {
    const result = await withTenant(ctxA, async (outerTx) => {
      const outer = await readSettings(outerTx);
      const nested = await withTenant(ctxA, async (innerTx) => {
        expect(innerTx).toBe(outerTx); // the very same handle
        return readSettings(innerTx);
      });
      return { outer, nested };
    });

    // Same backend and identical settings: no second transaction, no re-SET.
    expect(result.nested.backend).toBe(result.outer.backend);
    expect(result.nested.workspace).toBe(fx.workspaceA);
  });

  it("18b. a nested call opens no second transaction", async () => {
    // A nested BEGIN would increment the transaction nesting depth; reuse keeps
    // the same virtual transaction id throughout.
    const { outer, inner } = await withTenant(ctxA, async (outerTx) => {
      const o = first(
        (await outerTx`select txid_current()::text as t`) as unknown as {
          t: string;
        }[],
        "outer txid",
      ).t;
      const i = await withTenant(
        ctxA,
        async (innerTx) =>
          first(
            (await innerTx`select txid_current()::text as t`) as unknown as {
              t: string;
            }[],
            "inner txid",
          ).t,
      );
      return { outer: o, inner: i };
    });
    expect(inner).toBe(outer);
  });

  it.each(["workspaceId", "userProfileId", "authUserId"] as const)(
    "19/20/21. rejects a nested call with a different %s",
    async (field) => {
      const conflicting = createTenantContext({
        authUserId: field === "authUserId" ? fx.authB : fx.authA,
        userProfileId: field === "userProfileId" ? fx.profileB : fx.profileA,
        workspaceId: field === "workspaceId" ? fx.workspaceB : fx.workspaceA,
      });

      let innerRan = false;
      await expect(
        withTenant(ctxA, async () => {
          await withTenant(conflicting, async () => {
            innerRan = true; // 22: must never happen
            return null;
          });
        }),
      ).rejects.toThrow(TenantContextConflict);
      expect(innerRan).toBe(false);
    },
  );

  it("22. the conflicting nested callback executes no protected query", async () => {
    const before = await withTenant(ctxA, async (tx) => {
      const rows = await tx`select count(*)::int as n from public.workspaces`;
      return first(rows as unknown as { n: number }[], "before").n;
    });

    await expect(
      withTenant(ctxA, async () => {
        await withTenant(ctxB, async (tx) => {
          // Unreachable: the conflict is raised before the callback runs.
          await tx`select 1 from public.workspaces`;
        });
      }),
    ).rejects.toThrow(TenantContextConflict);

    const after = await withTenant(ctxA, async (tx) => {
      const rows = await tx`select count(*)::int as n from public.workspaces`;
      return first(rows as unknown as { n: number }[], "after").n;
    });
    expect(after).toBe(before);
  });

  it("21b. reports which field conflicted, without the values", async () => {
    try {
      await withTenant(ctxA, async () => {
        await withTenant(ctxB, async () => null);
      });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TenantContextConflict);
      const message = (error as Error).message;
      expect(message).toContain("authUserId");
      expect(message).not.toContain(fx.authA);
      expect(message).not.toContain(fx.workspaceB);
    }
  });
});

describe.skipIf(!reachable)("error and log hygiene", () => {
  it("25. keeps identifiers and connection details out of thrown errors", async () => {
    const secrets = [
      RUNTIME,
      fx.authA,
      fx.profileA,
      fx.workspaceA,
      "limenzy_app",
    ].filter(Boolean);

    const messages: string[] = [];

    // A policy-denied write.
    await withTenant(ctxA, async (tx) => {
      await tx`update public.workspaces set name = 'x' where id = ${fx.workspaceB}`;
    });

    // A privilege-denied write.
    await withTenant(ctxA, async (tx) => {
      await tx`insert into public.user_profiles (full_name) values ('x')`;
    }).catch((error: Error) => messages.push(error.message));

    // A conflict.
    await withTenant(ctxA, async () => {
      await withTenant(ctxB, async () => null);
    }).catch((error: Error) => messages.push(error.message));

    // An untrusted context.
    await withTenant({} as TenantContext, async () => null).catch(
      (error: Error) => messages.push(error.message),
    );

    expect(messages.length).toBeGreaterThanOrEqual(3);
    for (const message of messages) {
      for (const secret of secrets) {
        if (secret === "limenzy_app") continue; // a role name, not a credential
        expect(`${message.includes(secret)}`).toBe("false");
      }
      expect(message).not.toMatch(/postgres(ql)?:\/\//);
      expect(message).not.toMatch(/password/i);
    }
  });
});
