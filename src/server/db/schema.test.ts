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

/**
 * The primary keys this run created, recorded at insert time.
 *
 * Ids, never a name prefix: the local database is shared with every other
 * suite and with whatever a developer left behind, so a
 * `like 'Test Workspace%'` sweep would delete rows this run never made.
 * Recording at insert time is also what makes a row created by a test that
 * later throws still reachable for cleanup.
 */
const suiteFixtureIds: {
  workspaces: string[];
  profiles: string[];
  authUsers: string[];
} = { workspaces: [], profiles: [], authUsers: [] };

/**
 * What went wrong, without the fields that can quote data back.
 *
 * A PostgreSQL error carries the offending values in its human-readable
 * fields: `detail` spells out the key that collided
 * ("Key (workspace_id, user_profile_id)=(…) already exists"), and `message`,
 * `hint`, `where`, `internal_query` and `position` can each quote the
 * statement or its values. A connection error's message carries the host and
 * port instead (postgres.js builds it in `src/errors.js`).
 *
 * `code`, `table_name` and `constraint_name` are schema identifiers rather
 * than data, so they say what failed without repeating anything back.
 */
const reason = (error: unknown): string => {
  const e = error as {
    code?: unknown;
    table_name?: unknown;
    constraint_name?: unknown;
  };
  const parts: string[] = [
    typeof e?.code === "string" ? `sqlstate ${e.code}` : "no sqlstate",
  ];
  if (typeof e?.table_name === "string") parts.push(`table ${e.table_name}`);
  if (typeof e?.constraint_name === "string")
    parts.push(`constraint ${e.constraint_name}`);
  return parts.join(", ");
};

/**
 * One named piece of cleanup.
 *
 * A deletion resolves to nothing; a read-back resolves to the rows that
 * survived it, which is a failure however the query itself went.
 */
type CleanupStep = {
  readonly what: string;
  readonly run: () => Promise<readonly { id: string }[] | void>;
};

/**
 * Run every step, then close, and report everything that went wrong.
 *
 * Separated from the hook below so the failure path can be exercised with
 * doubles — a cleanup that has never been seen to fail is a cleanup whose
 * failure handling is a guess. Nothing here throws: the caller decides what a
 * non-empty result means.
 *
 * Deliberately does NOT swallow errors the way a `.catch(() => {})` would. A
 * cleanup that fails quietly is exactly how the previous version of this file
 * left its workspaces, profiles and memberships behind on every run while the
 * suite still reported green.
 */
const runCleanup = async (
  steps: readonly CleanupStep[],
  close: () => Promise<unknown>,
): Promise<string[]> => {
  const problems: string[] = [];

  // Every step is attempted, including after an earlier one fails: a failed
  // membership delete must not strand the profiles and workspaces behind it.
  for (const step of steps) {
    try {
      const survivors = await step.run();
      if (survivors && survivors.length > 0) {
        problems.push(
          `${step.what} still present: ${survivors.map((r) => r.id).join(", ")}`,
        );
      }
    } catch (error) {
      problems.push(`${step.what} (${reason(error)})`);
    }
  }

  // Closure is attempted whatever happened above, and a failure to close is
  // reported rather than discarded — it leaks a connection for the rest of
  // the process.
  try {
    await close();
  } catch (error) {
    problems.push(`close connection (${reason(error)})`);
  }

  return problems;
};

/** The deletions and read-backs for this run's fixtures, in dependency order. */
const cleanupSteps = (db: postgres.Sql): readonly CleanupStep[] => {
  const { workspaces, profiles, authUsers } = suiteFixtureIds;
  const steps: CleanupStep[] = [];

  // Foreign keys RESTRICT, so memberships go before what they reference.
  // Every membership this suite inserts names one of its own workspaces and
  // one of its own profiles, so scoping by those ids is exact.
  if (workspaces.length > 0) {
    steps.push({
      what: "delete memberships by workspace",
      run: async () => {
        await db`delete from public.workspace_memberships
                   where workspace_id in ${db(workspaces)}`;
      },
    });
  }
  if (profiles.length > 0) {
    steps.push({
      what: "delete memberships by profile",
      run: async () => {
        await db`delete from public.workspace_memberships
                   where user_profile_id in ${db(profiles)}`;
      },
    });
    steps.push({
      what: "delete profiles",
      run: async () => {
        await db`delete from public.user_profiles where id in ${db(profiles)}`;
      },
    });
  }
  // Milestone 3A: creating a workspace now seeds its pipeline and its lead
  // sources, and both foreign keys RESTRICT, so those rows go before the
  // workspace that owns them. The deletes run as `postgres`, which inherits
  // limenzy_owner — the runtime role has no DELETE on either table.
  if (workspaces.length > 0) {
    steps.push({
      what: "delete lead stages by workspace",
      run: async () => {
        await db`delete from public.workspace_lead_stages
                   where workspace_id in ${db(workspaces)}`;
      },
    });
    steps.push({
      what: "delete lead sources by workspace",
      run: async () => {
        await db`delete from public.workspace_lead_sources
                   where workspace_id in ${db(workspaces)}`;
      },
    });
    steps.push({
      what: "delete workspaces",
      run: async () => {
        await db`delete from public.workspaces where id in ${db(workspaces)}`;
      },
    });
  }
  // Only the accounts this run inserted. A profile merely REFERENCING an auth
  // user is never a reason to delete that user.
  if (authUsers.length > 0) {
    steps.push({
      what: "delete auth users",
      run: async () => {
        await db`delete from auth.users where id in ${db(authUsers)}`;
      },
    });
  }

  // Read back rather than trust the deletes. Memberships are checked under
  // BOTH scopes they were deleted by, so a row reached by one scope and not
  // the other cannot slip through unnoticed.
  if (workspaces.length > 0) {
    steps.push({
      what: "verify workspaces",
      run: async () =>
        db<{ id: string }[]>`select id from public.workspaces
                               where id in ${db(workspaces)}`,
    });
    steps.push({
      what: "verify memberships by workspace",
      run: async () =>
        db<{ id: string }[]>`select id from public.workspace_memberships
                               where workspace_id in ${db(workspaces)}`,
    });
    steps.push({
      what: "verify lead stages by workspace",
      run: async () =>
        db<{ id: string }[]>`select id from public.workspace_lead_stages
                               where workspace_id in ${db(workspaces)}`,
    });
    steps.push({
      what: "verify lead sources by workspace",
      run: async () =>
        db<{ id: string }[]>`select id from public.workspace_lead_sources
                               where workspace_id in ${db(workspaces)}`,
    });
  }
  if (profiles.length > 0) {
    steps.push({
      what: "verify memberships by profile",
      run: async () =>
        db<{ id: string }[]>`select id from public.workspace_memberships
                               where user_profile_id in ${db(profiles)}`,
    });
    steps.push({
      what: "verify profiles",
      run: async () =>
        db<{ id: string }[]>`select id from public.user_profiles
                               where id in ${db(profiles)}`,
    });
  }
  if (authUsers.length > 0) {
    steps.push({
      what: "verify auth users",
      run: async () =>
        db<{ id: string }[]>`select id from auth.users
                               where id in ${db(authUsers)}`,
    });
  }

  return steps;
};

/**
 * Remove this run's fixtures, close the connection, and fail the run if any
 * part of that did not work — naming the ids still present.
 */
afterAll(async () => {
  const problems = await runCleanup(sql ? cleanupSteps(sql) : [], async () =>
    sql?.end({ timeout: 2 }),
  );

  if (problems.length > 0) {
    throw new Error(
      `[schema.test] fixture cleanup failed — ${problems.join("; ")}`,
    );
  }
});

/**
 * The failure handling above, exercised with doubles.
 *
 * No database and no connection: the point is to prove what happens when
 * cleanup goes wrong, which a passing run against a healthy database can
 * never show. Runs everywhere, including on a machine with the stack stopped.
 */
describe("fixture cleanup failure handling", () => {
  const pgError = Object.assign(new Error("duplicate key value violates …"), {
    code: "23505",
    table_name: "workspace_memberships",
    constraint_name: "workspace_memberships_workspace_id_user_profile_id_key",
    detail: "Key (workspace_id, user_profile_id)=(secret-a, secret-b) exists.",
  });

  it("reports a failed step, and still runs the steps after it", async () => {
    const ran: string[] = [];
    const problems = await runCleanup(
      [
        {
          what: "delete memberships by workspace",
          run: async () => {
            ran.push("first");
            throw pgError;
          },
        },
        {
          what: "delete workspaces",
          run: async () => {
            ran.push("second");
          },
        },
      ],
      async () => {
        ran.push("close");
      },
    );

    expect(ran).toEqual(["first", "second", "close"]);
    expect(problems).toEqual([
      "delete memberships by workspace (sqlstate 23505, " +
        "table workspace_memberships, constraint " +
        "workspace_memberships_workspace_id_user_profile_id_key)",
    ]);
  });

  it("never quotes the data a driver error carries", async () => {
    const problems = await runCleanup(
      [{ what: "delete profiles", run: () => Promise.reject(pgError) }],
      async () => undefined,
    );

    const reported = problems.join(" ");
    expect(reported).not.toContain("secret-a");
    expect(reported).not.toContain("secret-b");
    expect(reported).not.toContain(pgError.message);
    expect(reported).not.toContain("Key (");
  });

  it("names the rows a read-back found still present", async () => {
    const problems = await runCleanup(
      [
        {
          what: "verify memberships by profile",
          run: async () => [{ id: "11111111-1111-4111-8111-111111111111" }],
        },
      ],
      async () => undefined,
    );

    expect(problems).toEqual([
      "verify memberships by profile still present: " +
        "11111111-1111-4111-8111-111111111111",
    ]);
  });

  it("reports a failed close alongside the rest, having attempted it", async () => {
    let attempted = false;
    const problems = await runCleanup(
      [{ what: "delete workspaces", run: () => Promise.reject(pgError) }],
      async () => {
        attempted = true;
        throw Object.assign(
          new Error("write CONNECTION_ENDED 127.0.0.1:54322"),
          {
            code: "CONNECTION_ENDED",
          },
        );
      },
    );

    expect(attempted).toBe(true);
    expect(problems).toHaveLength(2);
    expect(problems[1]).toBe("close connection (sqlstate CONNECTION_ENDED)");
    // The endpoint the driver puts in a connection error's message stays out.
    expect(problems.join(" ")).not.toContain("54322");
  });

  it("reports nothing when every step and the close succeed", async () => {
    expect(
      await runCleanup(
        [{ what: "delete workspaces", run: async () => undefined }],
        async () => undefined,
      ),
    ).toEqual([]);
  });
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

const TABLES = [
  "workspaces",
  "user_profiles",
  "workspace_memberships",
  // Milestone 2C — invitations (§159 Add User).
  "workspace_invitations",
  // Milestone 3A — Lead pipeline and Lead sources (§34, §164, §165). These
  // are CONFIGURATION: there is still no `leads` table, which the guard below
  // continues to assert.
  "workspace_lead_stages",
  "workspace_lead_sources",
  // Milestone 3B — Leads, the first BUSINESS RECORD, and the §130.1 audit of
  // every Create Anyway.
  "leads",
  "lead_duplicate_overrides",
  // Milestone 3C — the §39 activity history, append-only (§27, §39).
  "lead_activities",
];

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
  const row = first(rows, "inserted workspace");
  suiteFixtureIds.workspaces.push(String(row.id));
  return row;
};

const newProfile = async () => {
  const rows = await db()`
    insert into public.user_profiles (full_name)
    values (${`Test Person ${crypto.randomUUID().slice(0, 8)}`})
    returning *`;
  const row = first(rows, "inserted user profile");
  suiteFixtureIds.profiles.push(String(row.id));
  return row;
};

describe.skipIf(!reachable)("1C-B schema", () => {
  describe("tables", () => {
    it("creates exactly the expected tables", async () => {
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
        // `leads` is no longer forbidden: Milestone 3B created it, and it is
        // named in TABLES above. Everything still listed here belongs to a
        // milestone that has not run.
        "customers",
        "follow_ups",
        "renewals",
        "documents",
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
      /*
       * Three columns per table, less the ones deliberately absent:
       *
       *   · `lead_duplicate_overrides` has no `updated_at`, because §130.1's
       *     override record describes something that happened at a moment
       *     and is never revised. A row that could be edited would be a
       *     worse audit trail than no row.
       *   · `lead_activities` has neither `created_at` nor `updated_at`.
       *     §39's history is append-only, and the moment an entry describes
       *     is `occurred_at` — which the backfill sets to the Lead's own
       *     creation time rather than to when the migration happened to run.
       */
      const ABSENT_TIMESTAMPS = [
        "lead_duplicate_overrides.updated_at",
        "lead_activities.created_at",
        "lead_activities.updated_at",
      ];
      const present = new Set(
        rows.map((r) => `${r.table_name}.${r.column_name}`),
      );
      for (const column of ABSENT_TIMESTAMPS) {
        expect(`${column} present:${present.has(column)}`).toBe(
          `${column} present:false`,
        );
      }
      expect(rows).toHaveLength(TABLES.length * 3 - ABSENT_TIMESTAMPS.length);

      // The history's own moment, in the same type as every other timestamp.
      const [occurred] = await db()<{ data_type: string }[]>`
        select data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'lead_activities'
           and column_name = 'occurred_at'`;
      expect(occurred?.data_type).toBe("timestamp with time zone");
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
      // Every optional column, and why each one is allowed to be absent.
      expect(nullable).toEqual([
        /*
         * §39: each kind of entry carries what it means and nothing else, so
         * every payload column is optional and CHECK constraints decide
         * which kind may use which. The author is nullable only for a
         * backfilled creation entry whose creator is no longer resolvable;
         * the insert policy makes it mandatory on anything this application
         * writes.
         */
        "lead_activities.actor_user_profile_id",
        "lead_activities.changed_fields",
        "lead_activities.from_stage_id",
        "lead_activities.lost_reason",
        "lead_activities.note",
        "lead_activities.to_stage_id",
        // §130.1: an override's explanation is explicitly optional.
        "lead_duplicate_overrides.explanation",
        /*
         * §32 makes Lead Name the only required field and asks for at least
         * ONE of phone or email, which is a CHECK constraint rather than a
         * NOT NULL on either. The normalised columns are null whenever their
         * source is, and `phone_normalised` is also null when §130.1 would
         * have had to invent a country code to produce one.
         */
        "leads.email",
        "leads.email_normalised",
        /*
         * §48: a Lost reason exists only while a Lead is lost. The trigger
         * requires one when the stage's kind is `lost` and forbids one
         * otherwise, which is a rule about another table and so cannot be a
         * NOT NULL here. The note is optional except for "Something else".
         */
        "leads.lost_reason",
        "leads.lost_reason_note",
        "leads.notes",
        "leads.phone",
        "leads.phone_normalised",
        // §32 lists Lead Source among the optional fields.
        "leads.source_id",
        // A profile may exist before its auth user does.
        "user_profiles.auth_user_id",
        // §11 collects a name with an invitation; it is optional, and is used
        // only when the invitee has no profile and no name of their own.
        "workspace_invitations.invited_name",
        // The three nullable timestamps ARE an invitation's state: unset
        // means pending. A status column would be a second way to say it.
        "workspace_invitations.redeemed_at",
        "workspace_invitations.redeemed_by",
        "workspace_invitations.revoked_at",
        // §158 contact detail: collected nowhere at onboarding, so a workspace
        // that has never opened Business Settings has no value for it.
        "workspaces.address",
        "workspaces.business_email",
        "workspaces.business_phone",
        "workspaces.business_type",
        // §171/§162: NULL means "never configured", which the application
        // treats as fail-closed rather than as a default.
        "workspaces.enabled_modules",
        "workspaces.manager_record_scope",
        "workspaces.permissions_granted",
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
      // This test deletes the account itself further down — that deletion is
      // the behaviour under test. Recording it here covers the case where an
      // assertion between the two points throws and that line never runs.
      suiteFixtureIds.authUsers.push(String(authUser.id));
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
      // adds five for the bootstrap role; Milestone 2B adds three for the
      // user-management role; Milestone 2C adds three more for the runtime
      // role on its own new table and eight for the acceptance role;
      // Milestone 3A adds six for the runtime role across its two
      // configuration tables and three for the bootstrap role (two inserts
      // for seeding, plus the one select the deferred stage-shape check needs
      // while it runs as the invoking bootstrap role). Each is named with its
      // role, so a policy that appeared without a migration would fail here.
      const rows = await db()<{ policyname: string; roles: string }[]>`
        select policyname, roles::text as roles
          from pg_policies where schemaname = 'public'
         order by policyname`;
      expect(rows.map((r) => `${r.policyname} -> ${r.roles}`)).toEqual([
        // Milestone 3C — §39's history. Visible exactly where its Lead is,
        // and written only in the acting member's own name.
        "lead_activities_actor_insert -> {limenzy_app}",
        "lead_activities_record_access_select -> {limenzy_app}",
        // Milestone 3B — Leads, plus the two definer routines a Lead write
        // needs: workspace-wide duplicate matching (§130.1) and the stage row
        // lock, both owned by the NOLOGIN `limenzy_lead_support` role.
        "lead_duplicate_overrides_insert -> {limenzy_app}",
        "lead_duplicate_overrides_select -> {limenzy_app}",
        "leads_add_insert -> {limenzy_app}",
        "leads_edit_update -> {limenzy_app}",
        "leads_record_access_select -> {limenzy_app}",
        "leads_support_select -> {limenzy_lead_support}",
        "user_profiles_bootstrap_insert -> {limenzy_bootstrap}",
        "user_profiles_bootstrap_select -> {limenzy_bootstrap}",
        "user_profiles_invites_insert -> {limenzy_invites}",
        "user_profiles_invites_select -> {limenzy_invites}",
        "user_profiles_members_select -> {limenzy_members}",
        "user_profiles_self_select -> {limenzy_app}",
        "user_profiles_support_select -> {limenzy_lead_support}",
        "workspace_invitations_invites_select -> {limenzy_invites}",
        "workspace_invitations_invites_update -> {limenzy_invites}",
        "workspace_invitations_owner_admin_insert -> {limenzy_app}",
        "workspace_invitations_owner_admin_select -> {limenzy_app}",
        "workspace_invitations_owner_admin_update -> {limenzy_app}",
        "workspace_lead_sources_bootstrap_insert -> {limenzy_bootstrap}",
        "workspace_lead_sources_member_select -> {limenzy_app}",
        "workspace_lead_sources_owner_admin_insert -> {limenzy_app}",
        "workspace_lead_sources_owner_admin_update -> {limenzy_app}",
        "workspace_lead_stages_bootstrap_insert -> {limenzy_bootstrap}",
        "workspace_lead_stages_bootstrap_select -> {limenzy_bootstrap}",
        "workspace_lead_stages_member_select -> {limenzy_app}",
        "workspace_lead_stages_owner_admin_insert -> {limenzy_app}",
        "workspace_lead_stages_owner_admin_update -> {limenzy_app}",
        "workspace_lead_stages_support_lock -> {limenzy_lead_support}",
        "workspace_lead_stages_support_select -> {limenzy_lead_support}",
        "workspace_memberships_bootstrap_insert -> {limenzy_bootstrap}",
        "workspace_memberships_bootstrap_select -> {limenzy_bootstrap}",
        "workspace_memberships_invites_insert -> {limenzy_invites}",
        "workspace_memberships_invites_select -> {limenzy_invites}",
        "workspace_memberships_invites_update -> {limenzy_invites}",
        "workspace_memberships_members_select -> {limenzy_members}",
        "workspace_memberships_members_update -> {limenzy_members}",
        "workspace_memberships_self_select -> {limenzy_app}",
        "workspace_memberships_support_lock -> {limenzy_lead_support}",
        "workspace_memberships_support_select -> {limenzy_lead_support}",
        "workspaces_bootstrap_insert -> {limenzy_bootstrap}",
        "workspaces_invites_select -> {limenzy_invites}",
        "workspaces_member_select -> {limenzy_app}",
        // Two columns only, so the co-member name routine can read the
        // Manager record scope.
        "workspaces_members_select -> {limenzy_members}",
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
