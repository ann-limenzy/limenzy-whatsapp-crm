// @vitest-environment node
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Milestone 1C-C Phase 1 — roles, ownership and privileges, against the real
 * local database.
 *
 * Phase 1 adds no policies and no data access, so these tests assert two
 * things: that the role separation exists exactly as designed, and that
 * deny-by-default is unchanged by the ownership transfer.
 *
 * They fail rather than skip when the database is unavailable under
 * `npm run test:db`, which sets REQUIRE_DATABASE_TESTS.
 */

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";

const probe = async (url: string): Promise<postgres.Sql | undefined> => {
  if (!url) return undefined;
  const candidate = postgres(url, {
    max: 1,
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
const reachable = tooling !== undefined;
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] no local database reachable. Run "npm run db:start", ' +
      '"npm run db:reset" and "npm run db:role:local".',
  );
}
if (reachable && !runtime && REQUIRED) {
  throw new Error(
    '[test:db] DATABASE_URL does not connect. Run "npm run db:role:local".',
  );
}

afterAll(async () => {
  await tooling?.end({ timeout: 2 }).catch(() => {});
  await runtime?.end({ timeout: 2 }).catch(() => {});
});

const db = () => {
  if (!tooling) throw new Error("no tooling connection");
  return tooling;
};
const app = () => {
  if (!runtime) throw new Error("no runtime connection");
  return runtime;
};

const ROLES = ["limenzy_owner", "limenzy_bootstrap", "limenzy_app"] as const;
const TABLES = [
  "workspaces",
  "user_profiles",
  "workspace_memberships",
] as const;

/** The fixed role literal the provisioning script uses. */
const ROLE_LITERAL = "limenzy_app";

const first = <T>(rows: readonly T[], what: string): T => {
  const row = rows[0];
  if (row === undefined) throw new Error(`expected a row: ${what}`);
  return row;
};

describe.skipIf(!reachable)("Phase 1 roles", () => {
  it("creates all three roles", async () => {
    const rows = await db()<{ rolname: string }[]>`
      select rolname from pg_catalog.pg_roles
      where rolname = any(${db().array([...ROLES])}) order by rolname`;
    expect(rows.map((r) => r.rolname).sort()).toEqual([...ROLES].sort());
  });

  it("gives every role the exact designed attributes", async () => {
    const rows = await db()<
      {
        rolname: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolreplication: boolean;
      }[]
    >`
      select rolname, rolsuper, rolbypassrls, rolcreatedb,
             rolcreaterole, rolreplication
        from pg_catalog.pg_roles
       where rolname = any(${db().array([...ROLES])})`;
    for (const row of rows) {
      expect(`${row.rolname}:super`).toBe(`${row.rolname}:super`);
      expect(row.rolsuper).toBe(false);
      expect(row.rolbypassrls).toBe(false);
      expect(row.rolcreatedb).toBe(false);
      expect(row.rolcreaterole).toBe(false);
      expect(row.rolreplication).toBe(false);
    }
  });

  it("keeps the owner and bootstrap roles unable to log in", async () => {
    const rows = await db()<{ rolname: string; rolcanlogin: boolean }[]>`
      select rolname, rolcanlogin from pg_catalog.pg_roles
       where rolname in ('limenzy_owner', 'limenzy_bootstrap')`;
    for (const row of rows) {
      expect(`${row.rolname}=${row.rolcanlogin}`).toBe(`${row.rolname}=false`);
    }
  });

  it("makes no application role a member of another", async () => {
    // Neither app role may reach the owner's or each other's privileges.
    for (const [member, target] of [
      ["limenzy_app", "limenzy_owner"],
      ["limenzy_app", "limenzy_bootstrap"],
      ["limenzy_bootstrap", "limenzy_owner"],
      ["limenzy_bootstrap", "limenzy_app"],
      ["limenzy_owner", "limenzy_app"],
      ["limenzy_owner", "limenzy_bootstrap"],
    ] as const) {
      const row = first(
        await db()<{ member: boolean }[]>`
          select pg_catalog.pg_has_role(${member}, ${target}, 'MEMBER') as member`,
        "role membership",
      );
      expect(`${member}->${target}=${row.member}`).toBe(
        `${member}->${target}=false`,
      );
    }
  });
});

describe.skipIf(!reachable)("Phase 1 ownership", () => {
  it("gives limenzy_owner the three tables", async () => {
    const rows = await db()<{ relname: string; owner: string }[]>`
      select c.relname, pg_catalog.pg_get_userbyid(c.relowner) as owner
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`;
    expect(rows).toHaveLength(TABLES.length);
    for (const row of rows) {
      expect(`${row.relname}:${row.owner}`).toBe(
        `${row.relname}:limenzy_owner`,
      );
    }
  });

  it("gives limenzy_owner both enum types and the CRM functions", async () => {
    const types = await db()<{ typname: string; owner: string }[]>`
      select t.typname, pg_catalog.pg_get_userbyid(t.typowner) as owner
        from pg_catalog.pg_type t
        join pg_catalog.pg_namespace n on n.oid = t.typnamespace
       where n.nspname = 'public' and t.typtype = 'e'`;
    expect(types).toHaveLength(2);
    for (const row of types) {
      expect(`${row.typname}:${row.owner}`).toBe(
        `${row.typname}:limenzy_owner`,
      );
    }

    const functions = await db()<{ proname: string; owner: string }[]>`
      select p.proname, pg_catalog.pg_get_userbyid(p.proowner) as owner
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'`;
    expect(functions.length).toBeGreaterThanOrEqual(2);
    for (const row of functions) {
      expect(`${row.proname}:${row.owner}`).toBe(
        `${row.proname}:limenzy_owner`,
      );
    }
  });

  it("gives limenzy_owner the app schema and leaves public alone", async () => {
    const rows = await db()<{ nspname: string; owner: string }[]>`
      select nspname, pg_catalog.pg_get_userbyid(nspowner) as owner
        from pg_catalog.pg_namespace where nspname in ('app', 'public')`;
    const owners = Object.fromEntries(rows.map((r) => [r.nspname, r.owner]));
    expect(owners["app"]).toBe("limenzy_owner");
    // Supabase's own schema ownership must not have been altered.
    expect(owners["public"]).not.toBe("limenzy_owner");
  });

  it("leaves Supabase's schemas untouched", async () => {
    const rows = await db()<{ nspname: string; owner: string }[]>`
      select nspname, pg_catalog.pg_get_userbyid(nspowner) as owner
        from pg_catalog.pg_namespace where nspname in ('auth', 'storage')`;
    for (const row of rows) {
      expect(`${row.nspname}:${row.owner}`).not.toContain("limenzy");
    }
  });

  it("leaves limenzy_app and limenzy_bootstrap owning nothing", async () => {
    for (const role of ["limenzy_app", "limenzy_bootstrap"] as const) {
      const owned = first(
        await db()<{ n: number }[]>`
          select (
            (select count(*) from pg_catalog.pg_class c
               where pg_catalog.pg_get_userbyid(c.relowner) = ${role}) +
            (select count(*) from pg_catalog.pg_type t
               where pg_catalog.pg_get_userbyid(t.typowner) = ${role}) +
            (select count(*) from pg_catalog.pg_proc p
               where pg_catalog.pg_get_userbyid(p.proowner) = ${role}) +
            (select count(*) from pg_catalog.pg_namespace ns
               where pg_catalog.pg_get_userbyid(ns.nspowner) = ${role})
          )::int as n`,
        "owned object count",
      );
      expect(`${role} owns ${owned.n}`).toBe(`${role} owns 0`);
    }
  });
});

describe.skipIf(!reachable)("deny-by-default survives Phase 1", () => {
  it("keeps RLS enabled on all three tables", async () => {
    const rows = await db()<{ relname: string; rls: boolean }[]>`
      select c.relname, c.relrowsecurity as rls
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`;
    expect(rows).toHaveLength(TABLES.length);
    for (const row of rows)
      expect(`${row.relname}:${row.rls}`).toBe(`${row.relname}:true`);
  });

  it("enables FORCE ROW LEVEL SECURITY (Phase 2)", async () => {
    // Phase 1 deliberately left this off; Phase 2 turns it on so the table
    // owner is constrained too. Asserted as `true`, not merely "absent".
    const rows = await db()<{ relname: string; force: boolean }[]>`
      select c.relname, c.relforcerowsecurity as force
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`;
    expect(rows).toHaveLength(TABLES.length);
    for (const row of rows)
      expect(`${row.relname}:${row.force}`).toBe(`${row.relname}:true`);
  });

  it("defines exactly the four approved Phase-2 policies", async () => {
    // Phase 1 had none. Phase 2 adds precisely these and nothing else, each
    // scoped to the runtime role only.
    const rows = await db()<{ policyname: string; roles: string }[]>`
      select policyname, roles::text as roles
        from pg_policies where schemaname = 'public' order by policyname`;
    expect(rows.map((r) => r.policyname)).toEqual([
      "user_profiles_self_select",
      "workspace_memberships_self_select",
      "workspaces_member_select",
      "workspaces_owner_admin_update",
    ]);
    for (const row of rows) {
      expect(`${row.policyname}:${row.roles}`).toBe(
        `${row.policyname}:{limenzy_app}`,
      );
    }
    expect(rows.some((r) => r.roles.includes("limenzy_bootstrap"))).toBe(false);
  });

  it("grants anon and authenticated nothing", async () => {
    const rows = await db()`
      select grantee, table_name, privilege_type
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee in ('anon', 'authenticated')`;
    expect(rows).toHaveLength(0);
  });

  it("grants limenzy_bootstrap nothing, and limenzy_app only SELECT", async () => {
    const rows = await db()<
      { grantee: string; table_name: string; privilege_type: string }[]
    >`
      select grantee, table_name, privilege_type
        from information_schema.role_table_grants
       where table_schema = 'public'
         and grantee in ('limenzy_app', 'limenzy_bootstrap')
       order by grantee, table_name, privilege_type`;

    // Phase 3 owns the bootstrap routine; it receives nothing here.
    expect(rows.filter((r) => r.grantee === "limenzy_bootstrap")).toHaveLength(
      0,
    );

    // The runtime role reads all three tables and holds no table-wide write.
    const runtimeGrants = rows.filter((r) => r.grantee === "limenzy_app");
    expect(
      runtimeGrants.map((r) => `${r.table_name}:${r.privilege_type}`).sort(),
    ).toEqual([
      "user_profiles:SELECT",
      "workspace_memberships:SELECT",
      "workspaces:SELECT",
    ]);
    for (const forbidden of [
      "INSERT",
      "DELETE",
      "TRUNCATE",
      "REFERENCES",
      "TRIGGER",
    ]) {
      expect(runtimeGrants.some((r) => r.privilege_type === forbidden)).toBe(
        false,
      );
    }
  });

  it("grants column UPDATE only on the approved workspace settings", async () => {
    const rows = await db()<{ column_name: string }[]>`
      select column_name from information_schema.column_privileges
       where table_schema = 'public' and table_name = 'workspaces'
         and grantee = 'limenzy_app' and privilege_type = 'UPDATE'
       order by column_name`;
    expect(rows.map((r) => r.column_name)).toEqual([
      "business_type",
      "country",
      "currency",
      "name",
      "time_zone",
    ]);
  });

  it("grants no UPDATE on updated_at to any application role", async () => {
    // The trigger owns this column; nothing may write it directly.
    const rows = await db()`
      select grantee, table_name
        from information_schema.column_privileges
       where table_schema = 'public' and column_name = 'updated_at'
         and privilege_type = 'UPDATE'
         and grantee in ('limenzy_app', 'limenzy_bootstrap', 'anon', 'authenticated')`;
    expect(rows).toHaveLength(0);
  });

  it("keeps the app schema closed to browser roles and to bootstrap", async () => {
    for (const role of [
      "anon",
      "authenticated",
      "limenzy_bootstrap",
    ] as const) {
      const row = first(
        await db()<{ usage: boolean }[]>`
          select pg_catalog.has_schema_privilege(${role}, 'app', 'USAGE') as usage`,
        "schema privilege",
      );
      expect(`${role}:${row.usage}`).toBe(`${role}:false`);
    }
  });

  it("gives limenzy_app USAGE on app but never CREATE", async () => {
    const row = first(
      await db()<
        { usage: boolean; create_app: boolean; create_public: boolean }[]
      >`
        select pg_catalog.has_schema_privilege('limenzy_app', 'app', 'USAGE') as usage,
               pg_catalog.has_schema_privilege('limenzy_app', 'app', 'CREATE') as create_app,
               pg_catalog.has_schema_privilege('limenzy_app', 'public', 'CREATE') as create_public`,
      "app schema privileges",
    );
    expect(row.usage).toBe(true);
    expect(row.create_app).toBe(false);
    expect(row.create_public).toBe(false);
  });

  it("defines default privileges with valid separate statements", async () => {
    // `ALTER DEFAULT PRIVILEGES ... ON TABLES, FUNCTIONS` is a syntax error, so
    // the presence of an entry per object type proves separate statements ran.
    const rows = await db()<{ objtype: string; n: number }[]>`
      select d.defaclobjtype::text as objtype, count(*)::int as n
        from pg_catalog.pg_default_acl d
        join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
       where n.nspname in ('public', 'app')
         and pg_catalog.pg_get_userbyid(d.defaclrole) = current_user
       group by d.defaclobjtype`;
    const byType = Object.fromEntries(rows.map((r) => [r.objtype, r.n]));
    // r = relations (tables), f = functions, S = sequences
    for (const objtype of ["r", "f", "S"]) {
      expect(`${objtype}:${(byType[objtype] ?? 0) > 0}`).toBe(
        `${objtype}:true`,
      );
    }
  });

  it("keeps future objects away from the Data API roles", async () => {
    // The property those statements exist for: anything the migration executor
    // creates later in `public` must NOT be granted to anon or authenticated by
    // default. Supabase's own defaults, created by other roles, are untouched.
    const rows = await db()<{ objtype: string; acl: string }[]>`
      select d.defaclobjtype::text as objtype,
             coalesce(pg_catalog.array_to_string(d.defaclacl, ','), '') as acl
        from pg_catalog.pg_default_acl d
        join pg_catalog.pg_namespace n on n.oid = d.defaclnamespace
       where n.nspname = 'public'
         and pg_catalog.pg_get_userbyid(d.defaclrole) = current_user`;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(`${row.objtype} grants anon: ${row.acl.includes("anon=")}`).toBe(
        `${row.objtype} grants anon: false`,
      );
      expect(
        `${row.objtype} grants authenticated: ${row.acl.includes("authenticated=")}`,
      ).toBe(`${row.objtype} grants authenticated: false`);
    }
  });
});

describe.skipIf(!reachable)("password statement construction", () => {
  // Proven against the live server, not by reading the script: this is the
  // mechanism that replaced the (impossible) parameterised DO block.
  const HOSTILE = `a'b"c\\d; DROP ROLE limenzy_app; --\nSELECT 1`;

  it("quotes a hostile value into a single literal", async () => {
    const row = first(
      await db()<{ stmt: string }[]>`
        select pg_catalog.format(
          $fmt$ALTER ROLE %I LOGIN PASSWORD %L$fmt$,
          ${ROLE_LITERAL}::text, ${HOSTILE}::text) as stmt`,
      "generated statement",
    );
    // One statement, correct shape, role name quoted as an identifier.
    expect(row.stmt.startsWith("ALTER ROLE limenzy_app LOGIN PASSWORD ")).toBe(
      true,
    );
    expect(row.stmt.match(/ALTER ROLE/g) ?? []).toHaveLength(1);
    // No statement separator escapes the literal: everything after PASSWORD is
    // one quoted string, so the injected DROP cannot execute.
    const literal = row.stmt.slice(
      row.stmt.indexOf("PASSWORD ") + "PASSWORD ".length,
    );
    expect(literal).toMatch(/^E?'/);
    expect(literal.trimEnd()).toMatch(/'$/);
    expect(row.stmt).not.toMatch(/';\s*DROP ROLE/i);
  });

  it("is refused if the identifier were ever attacker-controlled", async () => {
    // %I quotes an identifier; a hostile "role name" becomes a quoted name,
    // never new syntax. (The script always passes the fixed literal.)
    const row = first(
      await db()<{ stmt: string }[]>`
        select pg_catalog.format(
          $fmt$ALTER ROLE %I LOGIN PASSWORD %L$fmt$,
          ${'evil"; DROP ROLE limenzy_app; --'}::text, ${"pw"}::text) as stmt`,
      "generated statement",
    );
    expect(row.stmt.match(/ALTER ROLE/g) ?? []).toHaveLength(1);
    expect(row.stmt).toContain('"evil""; DROP ROLE limenzy_app; --"');
  });
});

describe.skipIf(!reachable || !runtime)("the runtime connection", () => {
  it("connects as limenzy_app", async () => {
    const row = first(
      await app()<{ u: string }[]>`select current_user as u`,
      "current_user",
    );
    expect(row.u).toBe("limenzy_app");
  });

  it("is not superuser, has no BYPASSRLS, and owns nothing", async () => {
    const row = first(
      await app()<{ super: boolean; bypass: boolean; owned: number }[]>`
        select r.rolsuper as super, r.rolbypassrls as bypass,
               (select count(*) from pg_catalog.pg_class c
                  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public'
                   and pg_catalog.pg_get_userbyid(c.relowner) = current_user
               )::int as owned
          from pg_catalog.pg_roles r where r.rolname = current_user`,
      "runtime role attributes",
    );
    expect(row.super).toBe(false);
    expect(row.bypass).toBe(false);
    expect(row.owned).toBe(0);
  });

  it("may read the foundation tables but sees nothing without context", async () => {
    // Phase 2 replaces the privilege-layer denial with a policy-layer one: the
    // SELECT is now permitted and returns zero rows because no context is set.
    for (const table of TABLES) {
      const rows = await app().unsafe(
        `select count(*)::int as n from public.${table}`,
      );
      const row = first(rows as unknown as { n: number }[], `${table} count`);
      expect(`${table}=${row.n}`).toBe(`${table}=0`);
    }
  });

  it("still cannot write to any foundation table", async () => {
    for (const table of TABLES) {
      await expect(app().unsafe(`delete from public.${table}`)).rejects.toThrow(
        /permission denied/i,
      );
    }
  });

  it("can resolve the app schema but cannot create in it", async () => {
    // USAGE was granted for the context readers; CREATE was not, so a missing
    // object reports "does not exist" rather than leaking a permission error.
    await expect(app().unsafe("select 1 from app.nothing")).rejects.toThrow(
      /relation "app.nothing" does not exist/i,
    );
    await expect(
      app().unsafe("create table app.should_not_exist(id int)"),
    ).rejects.toThrow(/permission denied/i);
  });

  it("is a different authority from the tooling connection", async () => {
    expect(RUNTIME).not.toBe(TOOLING);
    const toolingUser = first(
      await db()<{ u: string }[]>`select current_user as u`,
      "tooling user",
    );
    const runtimeUser = first(
      await app()<{ u: string }[]>`select current_user as u`,
      "runtime user",
    );
    expect(runtimeUser.u).not.toBe(toolingUser.u);
    // The tooling role bypasses RLS; the runtime role must not.
    const toolingBypass = first(
      await db()<{ b: boolean }[]>`
        select rolbypassrls as b from pg_catalog.pg_roles where rolname = current_user`,
      "tooling bypass",
    );
    const runtimeBypass = first(
      await app()<{ b: boolean }[]>`
        select rolbypassrls as b from pg_catalog.pg_roles where rolname = current_user`,
      "runtime bypass",
    );
    expect(toolingBypass.b).toBe(true);
    expect(runtimeBypass.b).toBe(false);
  });
});
