// @vitest-environment node
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Milestone 1C-B schema verification against a **real local database**.
 *
 * These tests assert behaviour, not SQL text: they create rows, violate
 * constraints on purpose and switch roles to confirm that deny-by-default
 * really denies. A grep over the migration file could not tell us any of that.
 *
 * They need the local stack (`npm run db:start`) and the
 * `DRIZZLE_TOOLING_DATABASE_URL` that `.env.local` provides. With no database
 * reachable they skip rather than fail, so the suite stays green on a machine
 * with the stack stopped — the static contract tests in
 * `src/test/local-tooling.test.ts` still run there.
 *
 * Everything inserted here is synthetic and rolled back or cleaned up.
 */

const CONNECTION = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";

/**
 * Probe the database at module load, not in `beforeAll`: whether these suites
 * are registered at all has to be known during collection.
 */
const probe = async (): Promise<postgres.Sql | undefined> => {
  if (!CONNECTION) return undefined;
  const candidate = postgres(CONNECTION, {
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

const sql = await probe();
const reachable = sql !== undefined;

/**
 * `npm run test:db` sets this. It turns an unreachable database from a quiet
 * skip into a loud failure, so a verification run can never pass by silently
 * testing nothing. `npm test` leaves it unset, which keeps the suite usable on
 * a machine that has never started the local stack.
 */
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

if (!reachable) {
  const detail = CONNECTION
    ? "the connection string is set, but PostgreSQL did not answer"
    : "DRIZZLE_TOOLING_DATABASE_URL is not set (expected in .env.local)";
  const message =
    `no local database reachable — ${detail}. ` +
    `Start it with "npm run db:start" and reset it with "npm run db:reset".`;

  if (REQUIRED) {
    // Thrown at module load: the file fails to collect, so the run cannot be
    // reported as green. The URL itself is never included in the message.
    throw new Error(`[test:db] ${message}`);
  }
  console.warn(`[schema.test] skipped: ${message}`);
}

afterAll(async () => {
  await sql?.end({ timeout: 2 }).catch(() => {});
});

/** The first row of a result that must have produced one. */
const first = <T>(rows: readonly T[], what: string): T => {
  const row = rows[0];
  if (row === undefined) throw new Error(`expected a row: ${what}`);
  return row;
};

const db = () => {
  if (!sql) throw new Error("no database connection");
  return sql;
};

const TABLES = ["workspaces", "user_profiles", "workspace_memberships"];

// A workspace row that satisfies every constraint, with synthetic values.
const newWorkspace = async (overrides: Record<string, string> = {}) => {
  const values = {
    name: `Test Workspace ${crypto.randomUUID().slice(0, 8)}`,
    country: "IN",
    currency: "INR",
    time_zone: "Asia/Kolkata",
    ...overrides,
  };
  const rows = await db()`
    insert into public.workspaces ${db()(values)} returning *`;
  return first(rows, "inserted workspace");
};

const newProfile = async () => {
  const rows = await db()`
    insert into public.user_profiles (full_name)
    values (${`Test Person ${crypto.randomUUID().slice(0, 8)}`})
    returning *`;
  return first(rows, "inserted user profile");
};

describe.skipIf(!reachable)("1C-B schema", () => {
  describe("tables", () => {
    it("creates exactly the three foundation tables", async () => {
      const rows = await db()<{ tablename: string }[]>`
        select tablename from pg_tables where schemaname = 'public'`;
      const names = rows.map((r) => r.tablename).sort();
      expect(names).toEqual([...TABLES].sort());
    });

    it("creates no business-module table in this pass", async () => {
      const rows = await db()<{ tablename: string }[]>`
        select tablename from pg_tables where schemaname = 'public'`;
      const names = rows.map((r) => r.tablename);
      for (const forbidden of [
        "sales_teams",
        "sales_team_memberships",
        "lead_assignment_rules",
        "leads",
        "customers",
        "follow_ups",
        "renewals",
        "documents",
        "workspace_invitations",
        "workspace_modules",
        "workspace_role_permissions",
      ]) {
        expect(names).not.toContain(forbidden);
      }
    });

    it("leaves Supabase's own schemas intact", async () => {
      const rows = await db()<{ nspname: string }[]>`
        select nspname from pg_namespace
        where nspname in ('auth', 'storage', 'extensions')`;
      expect(rows.map((r) => r.nspname).sort()).toEqual([
        "auth",
        "extensions",
        "storage",
      ]);
      const users = first(
        await db()<{ count: string }[]>`
          select count(*)::text from auth.users`,
        "auth.users count",
      );
      expect(Number(users.count)).toBeGreaterThanOrEqual(0);
    });
  });

  describe("columns", () => {
    it("uses uuid primary keys and timestamptz timestamps", async () => {
      const rows = await db()<
        { table_name: string; column_name: string; data_type: string }[]
      >`
        select table_name, column_name, data_type
        from information_schema.columns
        where table_schema = 'public'
          and column_name in ('id', 'created_at', 'updated_at')`;
      for (const row of rows) {
        const expected =
          row.column_name === "id" ? "uuid" : "timestamp with time zone";
        expect(`${row.table_name}.${row.column_name}=${row.data_type}`).toBe(
          `${row.table_name}.${row.column_name}=${expected}`,
        );
      }
      expect(rows).toHaveLength(TABLES.length * 3);
    });

    it("matches the intended nullability", async () => {
      const rows = await db()<
        { table_name: string; column_name: string; is_nullable: string }[]
      >`
        select table_name, column_name, is_nullable
        from information_schema.columns
        where table_schema = 'public'`;
      const nullable = rows
        .filter((r) => r.is_nullable === "YES")
        .map((r) => `${r.table_name}.${r.column_name}`)
        .sort();
      // Only two columns are optional, and both deliberately so.
      expect(nullable).toEqual([
        "user_profiles.auth_user_id",
        "workspaces.business_type",
      ]);
    });
  });

  describe("constrained value sets", () => {
    it("offers exactly the three specification roles", async () => {
      const rows = await db()<{ enumlabel: string }[]>`
        select e.enumlabel from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        where t.typname = 'workspace_role'
        order by e.enumsortorder`;
      expect(rows.map((r) => r.enumlabel)).toEqual([
        "owner_admin",
        "manager",
        "staff_sales",
      ]);
    });

    it("has no Team Lead role, because Team Lead is not a role", async () => {
      const rows = await db()<{ enumlabel: string }[]>`
        select e.enumlabel from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        where t.typname = 'workspace_role'`;
      expect(rows.map((r) => r.enumlabel)).not.toContain("team_lead");
    });

    it("offers exactly the two specification statuses", async () => {
      const rows = await db()<{ enumlabel: string }[]>`
        select e.enumlabel from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        where t.typname = 'workspace_membership_status'
        order by e.enumsortorder`;
      expect(rows.map((r) => r.enumlabel)).toEqual(["active", "inactive"]);
    });

    it("rejects a role outside the set", async () => {
      const workspace = await newWorkspace();
      const profile = await newProfile();
      await expect(
        db()`insert into public.workspace_memberships
               (workspace_id, user_profile_id, role)
             values (${workspace.id}, ${profile.id}, 'team_lead')`,
      ).rejects.toThrow(/invalid input value for enum workspace_role/i);
    });

    it("rejects a status outside the set", async () => {
      const workspace = await newWorkspace();
      const profile = await newProfile();
      await expect(
        db()`insert into public.workspace_memberships
               (workspace_id, user_profile_id, role, status)
             values (${workspace.id}, ${profile.id}, 'manager', 'invited')`,
      ).rejects.toThrow(
        /invalid input value for enum workspace_membership_status/i,
      );
    });
  });

  describe("workspace invariants", () => {
    it("rejects a time zone that is not a known IANA identifier", async () => {
      await expect(newWorkspace({ time_zone: "Mars/Olympus" })).rejects.toThrow(
        /invalid IANA time zone/i,
      );
    });

    it("accepts a real IANA identifier", async () => {
      const row = await newWorkspace({ time_zone: "Europe/London" });
      expect(row.time_zone).toBe("Europe/London");
    });

    it("rejects blank required text", async () => {
      await expect(newWorkspace({ name: "   " })).rejects.toThrow(
        /workspaces_name_not_blank/i,
      );
    });

    it("does not force business names to be unique", async () => {
      const shared = `Shared Name ${crypto.randomUUID().slice(0, 8)}`;
      await newWorkspace({ name: shared });
      await expect(newWorkspace({ name: shared })).resolves.toBeDefined();
    });

    it("advances updated_at on write", async () => {
      const row = await newWorkspace();
      const updated = first(
        await db()`
          update public.workspaces set name = ${`${row.name} (renamed)`}
          where id = ${row.id} returning updated_at`,
        "updated workspace",
      );
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
        new Date(row.updated_at).getTime(),
      );
    });
  });

  describe("membership lifecycle", () => {
    it("prevents a duplicate membership in the same workspace", async () => {
      const workspace = await newWorkspace();
      const profile = await newProfile();
      await db()`insert into public.workspace_memberships
                   (workspace_id, user_profile_id, role)
                 values (${workspace.id}, ${profile.id}, 'owner_admin')`;
      await expect(
        db()`insert into public.workspace_memberships
               (workspace_id, user_profile_id, role)
             values (${workspace.id}, ${profile.id}, 'manager')`,
      ).rejects.toThrow(/duplicate key value/i);
    });

    it("lets one person belong to several workspaces (D1)", async () => {
      const profile = await newProfile();
      const first = await newWorkspace();
      const second = await newWorkspace();
      await db()`insert into public.workspace_memberships
                   (workspace_id, user_profile_id, role)
                 values (${first.id}, ${profile.id}, 'owner_admin')`;
      await db()`insert into public.workspace_memberships
                   (workspace_id, user_profile_id, role)
                 values (${second.id}, ${profile.id}, 'staff_sales')`;
      const rows = await db()`
        select role from public.workspace_memberships
        where user_profile_id = ${profile.id} order by role`;
      expect(rows).toHaveLength(2);
    });

    it("defaults a new membership to active", async () => {
      const workspace = await newWorkspace();
      const profile = await newProfile();
      const row = first(
        await db()`
          insert into public.workspace_memberships
            (workspace_id, user_profile_id, role)
          values (${workspace.id}, ${profile.id}, 'manager') returning status`,
        "created membership",
      );
      expect(row.status).toBe("active");
    });

    it("deactivates by flipping status, keeping the row", async () => {
      const workspace = await newWorkspace();
      const profile = await newProfile();
      const created = first(
        await db()`
          insert into public.workspace_memberships
            (workspace_id, user_profile_id, role)
          values (${workspace.id}, ${profile.id}, 'staff_sales') returning id`,
        "created membership",
      );
      await db()`update public.workspace_memberships
                 set status = 'inactive' where id = ${created.id}`;
      const rows = await db()`
        select status from public.workspace_memberships where id = ${created.id}`;
      expect(rows).toHaveLength(1);
      expect(first(rows, "membership after deactivation").status).toBe(
        "inactive",
      );
    });
  });

  describe("deletion behaviour preserves history", () => {
    it("refuses to delete a workspace that has memberships", async () => {
      const workspace = await newWorkspace();
      const profile = await newProfile();
      await db()`insert into public.workspace_memberships
                   (workspace_id, user_profile_id, role)
                 values (${workspace.id}, ${profile.id}, 'owner_admin')`;
      await expect(
        db()`delete from public.workspaces where id = ${workspace.id}`,
      ).rejects.toThrow(/violates foreign key constraint/i);
    });

    it("refuses to delete a profile that has memberships", async () => {
      const workspace = await newWorkspace();
      const profile = await newProfile();
      await db()`insert into public.workspace_memberships
                   (workspace_id, user_profile_id, role)
                 values (${workspace.id}, ${profile.id}, 'manager')`;
      await expect(
        db()`delete from public.user_profiles where id = ${profile.id}`,
      ).rejects.toThrow(/violates foreign key constraint/i);
    });

    it("keeps the profile and its history when the auth account is deleted", async () => {
      const profile = await newProfile();
      const workspace = await newWorkspace();
      const authUser = first(
        await db()`
        insert into auth.users
          (instance_id, id, aud, role, email, encrypted_password,
           created_at, updated_at)
        values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
                'authenticated', 'authenticated',
                ${`probe-${crypto.randomUUID().slice(0, 8)}@example.com`},
                'not-a-real-password-hash', now(), now())
        returning id`,
        "inserted auth user",
      );
      await db()`update public.user_profiles
                 set auth_user_id = ${authUser.id} where id = ${profile.id}`;
      await db()`insert into public.workspace_memberships
                   (workspace_id, user_profile_id, role)
                 values (${workspace.id}, ${profile.id}, 'staff_sales')`;

      await db()`delete from auth.users where id = ${authUser.id}`;

      const kept = first(
        await db()`
          select full_name, auth_user_id from public.user_profiles
          where id = ${profile.id}`,
        "profile after auth deletion",
      );
      expect(kept.full_name).toBe(profile.full_name);
      expect(kept.auth_user_id).toBeNull();

      const memberships = await db()`
        select id from public.workspace_memberships
        where user_profile_id = ${profile.id}`;
      expect(memberships).toHaveLength(1);
    });
  });

  describe("keys and indexes", () => {
    it("has the expected primary, unique and foreign keys", async () => {
      const rows = await db()<{ conname: string; def: string }[]>`
        select conname, pg_get_constraintdef(oid) as def
        from pg_constraint
        where connamespace = 'public'::regnamespace
          and contype in ('p', 'u', 'f')
        order by conname`;
      const byName = Object.fromEntries(rows.map((r) => [r.conname, r.def]));
      expect(byName["workspaces_pkey"]).toBe("PRIMARY KEY (id)");
      expect(byName["user_profiles_pkey"]).toBe("PRIMARY KEY (id)");
      expect(byName["workspace_memberships_pkey"]).toBe("PRIMARY KEY (id)");
      expect(byName["user_profiles_auth_user_id_key"]).toBe(
        "UNIQUE (auth_user_id)",
      );
      expect(
        byName["workspace_memberships_workspace_id_user_profile_id_key"],
      ).toBe("UNIQUE (workspace_id, user_profile_id)");
    });

    it("uses the documented delete actions, and never cascades", async () => {
      const rows = await db()<{ conname: string; def: string }[]>`
        select conname, pg_get_constraintdef(oid) as def
        from pg_constraint
        where connamespace = 'public'::regnamespace and contype = 'f'`;
      const byName = Object.fromEntries(rows.map((r) => [r.conname, r.def]));
      expect(byName["user_profiles_auth_user_id_fkey"]).toContain(
        "ON DELETE SET NULL",
      );
      expect(byName["workspace_memberships_workspace_id_fkey"]).toContain(
        "ON DELETE RESTRICT",
      );
      expect(byName["workspace_memberships_user_profile_id_fkey"]).toContain(
        "ON DELETE RESTRICT",
      );
      for (const def of Object.values(byName)) {
        expect(def).not.toContain("ON DELETE CASCADE");
      }
    });

    it("indexes membership lookup by signed-in person", async () => {
      const rows = await db()<{ indexname: string }[]>`
        select indexname from pg_indexes
        where schemaname = 'public' and tablename = 'workspace_memberships'`;
      expect(rows.map((r) => r.indexname)).toContain(
        "workspace_memberships_user_profile_id_idx",
      );
    });
  });

  describe("row level security", () => {
    it("is enabled on every new public table", async () => {
      const rows = await db()<{ tablename: string; rowsecurity: boolean }[]>`
        select tablename, rowsecurity from pg_tables
        where schemaname = 'public'`;
      expect(rows).toHaveLength(TABLES.length);
      for (const row of rows) {
        expect(`${row.tablename}:${row.rowsecurity}`).toBe(
          `${row.tablename}:true`,
        );
      }
    });

    it("carries exactly the policies 1C-C introduced, and no others", async () => {
      // 1C-B created none. Phase 2 adds four for the runtime role; Phase 4C-1
      // adds five for the bootstrap role. Each is named with its role, so a
      // policy that appeared without a migration would fail here.
      const rows = await db()<{ policyname: string; roles: string }[]>`
        select policyname, roles::text as roles
          from pg_policies where schemaname = 'public'
         order by policyname`;
      expect(rows.map((r) => `${r.policyname} -> ${r.roles}`)).toEqual([
        "user_profiles_bootstrap_insert -> {limenzy_bootstrap}",
        "user_profiles_bootstrap_select -> {limenzy_bootstrap}",
        "user_profiles_self_select -> {limenzy_app}",
        "workspace_memberships_bootstrap_insert -> {limenzy_bootstrap}",
        "workspace_memberships_bootstrap_select -> {limenzy_bootstrap}",
        "workspace_memberships_self_select -> {limenzy_app}",
        "workspaces_bootstrap_insert -> {limenzy_bootstrap}",
        "workspaces_member_select -> {limenzy_app}",
        "workspaces_owner_admin_update -> {limenzy_app}",
      ]);
    });

    it("grants the Data API roles nothing", async () => {
      const rows = await db()`
        select grantee, table_name, privilege_type
        from information_schema.role_table_grants
        where table_schema = 'public'
          and grantee in ('anon', 'authenticated')`;
      expect(rows).toHaveLength(0);
    });

    it.each(TABLES)("denies anon every operation on %s", async (table) => {
      await newWorkspace();
      for (const statement of [
        `select count(*) from public.${table}`,
        `delete from public.${table}`,
      ]) {
        await expect(
          db().begin(async (tx) => {
            await tx`set local role anon`;
            await tx.unsafe(statement);
          }),
        ).rejects.toThrow(/permission denied/i);
      }
    });

    it.each(TABLES)(
      "denies authenticated every operation on %s",
      async (table) => {
        for (const statement of [
          `select count(*) from public.${table}`,
          `delete from public.${table}`,
        ]) {
          await expect(
            db().begin(async (tx) => {
              await tx`set local role authenticated`;
              await tx.unsafe(statement);
            }),
          ).rejects.toThrow(/permission denied/i);
        }
      },
    );

    // The strongest form of the check: even if a future change granted the
    // table to authenticated, RLS with no policy must still deny. Proved
    // inside a transaction that is rolled back, so the grant never persists.
    it.each(TABLES)(
      "denies reads on %s even when grants are present",
      async (table) => {
        const visible = await db().begin(async (tx) => {
          await tx.unsafe(`grant select on public.${table} to authenticated`);
          await tx`set local role authenticated`;
          const rows = await tx.unsafe(
            `select count(*)::int as count from public.${table}`,
          );
          await tx`reset role`;
          await tx.unsafe(
            `revoke select on public.${table} from authenticated`,
          );
          return first(rows, "row count").count as number;
        });
        expect(visible).toBe(0);
      },
    );

    it("rejects an insert by authenticated even when granted", async () => {
      await expect(
        db().begin(async (tx) => {
          await tx`grant insert on public.workspaces to authenticated`;
          await tx`set local role authenticated`;
          await tx`insert into public.workspaces (name, country, currency, time_zone)
                   values ('should not exist', 'IN', 'INR', 'Asia/Kolkata')`;
        }),
      ).rejects.toThrow(/row-level security policy/i);

      const blocked = first(
        await db()<{ count: string }[]>`
          select count(*)::text from public.workspaces
          where name = 'should not exist'`,
        "blocked-insert count",
      );
      expect(Number(blocked.count)).toBe(0);
    });
  });

  describe("Drizzle definitions match the applied database", () => {
    it("describes the same tables and columns", async () => {
      const schema = await import("./schema/index");
      const { getTableConfig } = await import("drizzle-orm/pg-core");
      const { isTable } = await import("drizzle-orm");

      const drizzleTables = Object.values(schema)
        .filter((value) => isTable(value))
        .map((table) => getTableConfig(table as never))
        // The auth.users stub is Supabase's table, not ours to manage.
        .filter((config) => config.schema === undefined);

      expect(drizzleTables.map((t) => t.name).sort()).toEqual(
        [...TABLES].sort(),
      );

      const live = await db()<{ table_name: string; column_name: string }[]>`
        select table_name, column_name from information_schema.columns
        where table_schema = 'public'`;

      for (const config of drizzleTables) {
        const declared = config.columns.map((c) => c.name).sort();
        const actual = live
          .filter((c) => c.table_name === config.name)
          .map((c) => c.column_name)
          .sort();
        expect(`${config.name}:${declared.join(",")}`).toBe(
          `${config.name}:${actual.join(",")}`,
        );
      }
    });
  });
});
