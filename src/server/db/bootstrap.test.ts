// @vitest-environment node
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Milestone 1C-C Phase 4C-1 — the initial-workspace bootstrap routine.
 *
 * Every privilege assertion here runs over a **genuine `limenzy_app`
 * connection**. That is not a stylistic preference: `SET ROLE` is authorised
 * against the *session* role, so a test that impersonated the runtime role from
 * the tooling connection would report "cannot SET ROLE limenzy_bootstrap" as a
 * pass while proving nothing at all. That false positive was reproduced during
 * the Phase 4C audit, and it is the most available way to ship a green here
 * that means nothing.
 *
 * The tooling connection appears only to create fixtures, to read the
 * catalogue, and to verify from outside what the runtime role could not see. It
 * holds BYPASSRLS, so using it to "prove" access would prove nothing either.
 *
 * Fixtures are synthetic, namespaced per run, and removed in afterAll in
 * foreign-key-safe order — including the rows the routine itself creates, which
 * are found by joining back to this run's profiles, because the routine
 * deliberately never returns their identifiers.
 */

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
const runtime = await probe(RUNTIME);
const reachable = tooling !== undefined && runtime !== undefined;

if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] Phase 4C-1 bootstrap tests need both connections. Run "npm run db:start", ' +
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

/** Per-run namespace so a failed run cannot collide with the next. */
const RUN = crypto.randomUUID().slice(0, 8);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Every auth user this run created, for cleanup. */
const authUsers: string[] = [];
/** A single-connection runtime pool, so "the same backend" is a fact. */
let solo: postgres.Sql;

const FIELDS = {
  fullName: "Bootstrap Person",
  workspace: `Bootstrap WS ${RUN}`,
  businessType: "Retail",
  country: "IN",
  currency: "INR",
  timeZone: "Asia/Kolkata",
} as const;

type Overrides = Partial<Record<keyof typeof FIELDS, string | null>>;

/**
 * Call the routine over the runtime connection, exactly as Phase 4C-2 will:
 * one transaction, the verified identity set transaction-locally, then the
 * function. Nothing else is granted to this role, and nothing else is used.
 */
const bootstrap = async (
  authUserId: string | null,
  overrides: Overrides = {},
  sql: postgres.Sql = app(),
): Promise<string> => {
  const f = { ...FIELDS, ...overrides };
  return (await sql.begin(async (tx) => {
    if (authUserId !== null) {
      await tx`select set_config('app.auth_user_id', ${authUserId}, true)`;
    }
    const rows = await tx<{ outcome: string }[]>`
      select app.create_initial_workspace(
        ${f.fullName}, ${f.workspace}, ${f.businessType},
        ${f.country}, ${f.currency}, ${f.timeZone}) as outcome`;
    return first(rows, "outcome").outcome;
  })) as string;
};

/** What actually exists for an auth user, read with the tooling connection. */
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
           (select string_agg(role::text || '/' || status::text, ',' order by role::text)
              from m)                                        as roles`,
    "tenancy",
  );

const makeAuthUser = async () => {
  const rows = await admin()<{ id: string }[]>`
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
            'authenticated', 'authenticated',
            ${`bootstrap-${RUN}-${crypto.randomUUID().slice(0, 8)}@example.com`},
            'not-a-real-password-hash', now(), now())
    returning id`;
  const id = first(rows, "auth user").id;
  authUsers.push(id);
  return id;
};

const makeProfile = async (authUserId: string) =>
  first(
    await admin()<{ id: string }[]>`
      insert into public.user_profiles (auth_user_id, full_name)
      values (${authUserId}, ${`Existing ${RUN}`}) returning id`,
    "profile",
  ).id;

const makeWorkspace = async (label: string) =>
  first(
    await admin()<{ id: string }[]>`
      insert into public.workspaces (name, country, currency, time_zone)
      values (${`Bootstrap ${label} ${RUN}`}, 'IN', 'INR', 'Asia/Kolkata')
      returning id`,
    "workspace",
  ).id;

const makeMembership = async (
  workspaceId: string,
  profileId: string,
  role: string,
  status: string,
) => {
  await admin()`
    insert into public.workspace_memberships (workspace_id, user_profile_id, role, status)
    values (${workspaceId}, ${profileId}, ${role}::public.workspace_role,
            ${status}::public.workspace_membership_status)`;
};

/** The whole message surface of a thrown error, for leak assertions. */
const surfaceOf = (error: unknown) => {
  const e = error as Error & { cause?: unknown; query?: string };
  return [
    e?.name,
    e?.message,
    String(e?.cause ?? ""),
    String(e?.query ?? ""),
  ].join(" ");
};

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );

beforeAll(() => {
  if (!reachable) return;
  solo = open(RUNTIME, 1);
});

afterAll(async () => {
  if (reachable && authUsers.length > 0) {
    const sql = admin();
    // Foreign keys RESTRICT, so order matters. Workspaces the routine created
    // are found by joining back to this run's profiles.
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
    // Belt and braces: anything this run named that the join could not reach.
    await sql`delete from public.workspaces
               where name like ${`Bootstrap%${RUN}%`}`.catch(() => {});
    await sql`delete from auth.users where id in ${sql(authUsers)}`.catch(
      () => {},
    );
  }
  await tooling?.end({ timeout: 2 }).catch(() => {});
  await runtime?.end({ timeout: 2 }).catch(() => {});
  await solo?.end({ timeout: 2 }).catch(() => {});
});

describe.skipIf(!reachable)("Phase 4C-1 — creating the first tenancy", () => {
  it("1-6. creates exactly one profile, workspace and active Owner/Admin membership", async () => {
    const auth = await makeAuthUser();
    expect(await bootstrap(auth)).toBe("created");

    const tenancy = await tenancyOf(auth);
    expect(tenancy.profiles).toBe(1);
    expect(tenancy.workspaces).toBe(1);
    expect(tenancy.memberships).toBe(1);
    expect(tenancy.roles).toBe("owner_admin/active");

    // Every identifier was generated by the database, not derived from the
    // caller and not from the Auth UUID.
    const ids = first(
      await admin()<
        { profile: string; workspace: string; membership: string }[]
      >`
        select p.id as profile, m.workspace_id as workspace, m.id as membership
          from public.user_profiles p
          join public.workspace_memberships m on m.user_profile_id = p.id
         where p.auth_user_id = ${auth}`,
      "ids",
    );
    for (const id of [ids.profile, ids.workspace, ids.membership]) {
      expect(id).toMatch(UUID);
      expect(id).not.toBe(auth);
    }
    expect(new Set([ids.profile, ids.workspace, ids.membership]).size).toBe(3);

    const ws = first(
      await admin()<{ name: string; business_type: string }[]>`
        select w.name, w.business_type
          from public.workspaces w where w.id = ${ids.workspace}`,
      "workspace",
    );
    expect(ws.name).toBe(FIELDS.workspace);
    expect(ws.business_type).toBe("Retail");
  });

  /** Everything that was actually stored for an auth user. */
  const storedFor = async (authUserId: string) =>
    first(
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
         where p.auth_user_id = ${authUserId}`,
      "stored row",
    );

  it("6b. trims surrounding spaces from every one of the six fields", async () => {
    const auth = await makeAuthUser();
    expect(
      await bootstrap(auth, {
        fullName: "  Padded Person  ",
        workspace: `  Bootstrap Trimmed ${RUN}  `,
        businessType: "  Retail  ",
        country: "  IN ",
        currency: " INR  ",
        timeZone: "  Asia/Kolkata  ",
      }),
    ).toBe("created");

    // Stored values are the trimmed ones — including the time zone, which the
    // IANA trigger would otherwise have rejected with its padding intact.
    expect(await storedFor(auth)).toEqual({
      full_name: "Padded Person",
      name: `Bootstrap Trimmed ${RUN}`,
      business_type: "Retail",
      country: "IN",
      currency: "INR",
      time_zone: "Asia/Kolkata",
    });
  });

  it("6b-ii. rejects tab- or newline-padded values rather than trimming them", async () => {
    // A deliberate boundary, and the reason it is asserted rather than
    // assumed: `btrim(text)` removes SPACES only. A tab or newline therefore
    // survives trimming and is then caught by the control-character check, so
    // such a value is refused rather than silently repaired. Refusing is the
    // safer of the two: whitespace that is not a space almost always means the
    // value came from somewhere it should not have.
    const auth = await makeAuthUser();
    for (const padded of [
      `\t${`Bootstrap Tabbed ${RUN}`}`,
      `${`Bootstrap Tabbed ${RUN}`}\t`,
      `\n${`Bootstrap Tabbed ${RUN}`}`,
    ]) {
      const error = await failureOf(bootstrap(auth, { workspace: padded }));
      expect(surfaceOf(error)).toMatch(/control characters/i);
    }
    expect(await tenancyOf(auth)).toMatchObject({
      profiles: 0,
      workspaces: 0,
      memberships: 0,
    });
  });

  it("6c. stores a null or whitespace-only business type as null, and keeps a real one", async () => {
    // Genuinely absent: §7 makes Business Type optional.
    const absent = await makeAuthUser();
    expect(
      await bootstrap(absent, {
        workspace: `Bootstrap NullType ${RUN}`,
        businessType: null,
      }),
    ).toBe("created");
    expect((await storedFor(absent)).business_type).toBeNull();

    // Whitespace-only is the same thing, not an empty string in the column.
    const blank = await makeAuthUser();
    expect(
      await bootstrap(blank, {
        workspace: `Bootstrap BlankType ${RUN}`,
        businessType: "   ",
      }),
    ).toBe("created");
    expect((await storedFor(blank)).business_type).toBeNull();

    // And a real value survives untouched, so "optional" never means "dropped".
    const given = await makeAuthUser();
    expect(
      await bootstrap(given, {
        workspace: `Bootstrap RealType ${RUN}`,
        businessType: "Financial / Insurance",
      }),
    ).toBe("created");
    expect((await storedFor(given)).business_type).toBe(
      "Financial / Insurance",
    );
  });

  it("7. creates nothing on a sequential duplicate submission", async () => {
    const auth = await makeAuthUser();
    expect(await bootstrap(auth)).toBe("created");
    const after = await tenancyOf(auth);

    expect(
      await bootstrap(auth, { workspace: `Bootstrap Second ${RUN}` }),
    ).toBe("already_onboarded");
    expect(await bootstrap(auth)).toBe("already_onboarded");
    expect(await tenancyOf(auth)).toEqual(after);

    // The second workspace name never reached the table.
    const rows = await admin()`
      select 1 from public.workspaces where name = ${`Bootstrap Second ${RUN}`}`;
    expect(rows).toHaveLength(0);
  });

  it("8. creates exactly one tenancy from two concurrent connections", async () => {
    const auth = await makeAuthUser();
    // Two separate single-connection pools, so these are genuinely two
    // backends racing rather than two statements on one.
    const a = open(RUNTIME, 1);
    const b = open(RUNTIME, 1);
    try {
      const results = await Promise.all([
        bootstrap(auth, { workspace: `Bootstrap Race A ${RUN}` }, a),
        bootstrap(auth, { workspace: `Bootstrap Race B ${RUN}` }, b),
      ]);
      expect(results.filter((r) => r === "created")).toHaveLength(1);
      expect(results.filter((r) => r === "already_onboarded")).toHaveLength(1);
    } finally {
      await a.end({ timeout: 2 }).catch(() => {});
      await b.end({ timeout: 2 }).catch(() => {});
    }

    expect(await tenancyOf(auth)).toMatchObject({
      profiles: 1,
      workspaces: 1,
      memberships: 1,
      roles: "owner_admin/active",
    });
  });
});

describe.skipIf(!reachable)(
  "Phase 4C-1 — an existing profile is never re-onboarded",
  () => {
    it("9/10. returns already_onboarded for one and for several active memberships", async () => {
      const auth = await makeAuthUser();
      const profile = await makeProfile(auth);
      const one = await makeWorkspace("Existing One");
      await makeMembership(one, profile, "staff_sales", "active");
      expect(await bootstrap(auth)).toBe("already_onboarded");

      const two = await makeWorkspace("Existing Two");
      await makeMembership(two, profile, "manager", "active");
      expect(await bootstrap(auth)).toBe("already_onboarded");

      const tenancy = await tenancyOf(auth);
      expect(tenancy.profiles).toBe(1);
      expect(tenancy.workspaces).toBe(2);
      // Neither call added an owner_admin membership anywhere.
      expect(tenancy.roles).toBe("manager/active,staff_sales/active");
    });

    it("11. returns access_unavailable for a profile with no memberships", async () => {
      const auth = await makeAuthUser();
      await makeProfile(auth);
      expect(await bootstrap(auth)).toBe("access_unavailable");
      expect(await tenancyOf(auth)).toMatchObject({
        profiles: 1,
        memberships: 0,
        workspaces: 0,
      });
    });

    it("12. returns access_unavailable when every membership is inactive", async () => {
      const auth = await makeAuthUser();
      const profile = await makeProfile(auth);
      const ws = await makeWorkspace("Inactive");
      await makeMembership(ws, profile, "owner_admin", "inactive");

      expect(await bootstrap(auth)).toBe("access_unavailable");

      const tenancy = await tenancyOf(auth);
      // Deliberately not onboarding: this is someone removed from every
      // workspace, and a fresh workspace would be a silent privilege grant.
      expect(tenancy).toMatchObject({
        profiles: 1,
        memberships: 1,
        workspaces: 1,
      });
      expect(tenancy.roles).toBe("owner_admin/inactive");
    });
  },
);

describe.skipIf(!reachable)(
  "Phase 4C-1 — failures leave nothing behind",
  () => {
    it("13. rolls the profile back when the time zone is rejected", async () => {
      const auth = await makeAuthUser();
      // A name unique to this test, so "no workspace survived" is a statement
      // about this rollback and not about workspaces other tests legitimately
      // created with the shared default name.
      const name = `Bootstrap Rollback ${RUN}`;

      // A genuine production-path failure, not an injected one: the profile
      // inserts, then the 1C-B trigger on workspaces rejects the zone one
      // statement later. No test hook exists, and none is needed.
      const error = await failureOf(
        bootstrap(auth, { workspace: name, timeZone: "Mars/Olympus" }),
      );
      expect(error).toBeDefined();
      expect(surfaceOf(error)).toMatch(/invalid IANA time zone/i);

      // The profile was inserted first and is gone with the rest: all three
      // statements share the caller's transaction.
      expect(await tenancyOf(auth)).toMatchObject({
        profiles: 0,
        memberships: 0,
        workspaces: 0,
      });
      const orphans = await admin()`
      select 1 from public.workspaces where name = ${name}`;
      expect(orphans).toHaveLength(0);
    });

    it("14. refuses blank and control-character input without creating anything", async () => {
      const auth = await makeAuthUser();
      const NUL = "\u0000";
      const CR = "\r";
      const ESC = "\u001b";
      const DEL = "\u007f";

      const cases: Overrides[] = [
        // Blank or missing required values. Business Type is absent here on
        // purpose: it is the one optional field.
        { fullName: " " },
        { fullName: "" },
        { fullName: null },
        { workspace: "   " },
        { workspace: null },
        { country: "" },
        { country: "   " },
        { currency: "  " },
        { currency: null },
        { timeZone: "" },
        { timeZone: "   " },

        // A control character in each of the six fields, including the
        // optional one when it is present.
        { fullName: `Person${NUL}` },
        { fullName: ["Line", "Break"].join("\n") },
        { workspace: `Bootstrap${NUL} ${RUN}` },
        { workspace: `Bootstrap${CR} ${RUN}` },
        { businessType: ["Re", "tail"].join("\t") },
        { businessType: `Retail${ESC}` },
        { country: `I${NUL}N` },
        { currency: `IN${DEL}R` },
        { timeZone: `Asia/${NUL}Kolkata` },
        { timeZone: ["Asia", "Kolkata"].join("\n") },
      ];
      for (const override of cases) {
        const error = await failureOf(bootstrap(auth, override));
        expect(`${JSON.stringify(override)} -> ${error !== undefined}`).toBe(
          `${JSON.stringify(override)} -> true`,
        );
      }
      expect(await tenancyOf(auth)).toMatchObject({
        profiles: 0,
        memberships: 0,
        workspaces: 0,
      });
    });

    it("14b. introduces no new column, table, enum or uniqueness", async () => {
      // The product decisions these would pre-empt belong to later phases, and
      // the specification defines none of them.
      const columns = await admin()<{ name: string }[]>`
      select table_name || '.' || column_name as name
        from information_schema.columns
       where table_schema = 'public'
         and (column_name in ('status', 'slug', 'is_active', 'deleted_at')
              or column_name like '%default%'
              or column_name like '%primary%')
       order by name`;
      // The one status column in the schema is the membership status from 1C-B.
      expect(columns.map((c) => c.name)).toEqual([
        "workspace_memberships.status",
      ]);

      // No lookup tables were smuggled in.
      const tables = await admin()<{ table_name: string }[]>`
      select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`;
      expect(tables.map((t) => t.table_name)).toEqual([
        "user_profiles",
        "workspace_memberships",
        "workspaces",
      ]);

      // Workspace names stay non-unique: two businesses may share one.
      const unique = await admin()`
      select 1 from pg_catalog.pg_constraint
       where conrelid = 'public.workspaces'::regclass
         and contype in ('u', 'p')
         and conname <> 'workspaces_pkey'`;
      expect(unique).toHaveLength(0);

      // And Business Type is still free text, never an enum.
      const enums = await admin()<{ typname: string; labels: string }[]>`
      select t.typname,
             pg_catalog.string_agg(e.enumlabel, ',' order by e.enumsortorder) as labels
        from pg_catalog.pg_type t
        join pg_catalog.pg_enum e on e.enumtypid = t.oid
       where t.typnamespace = 'public'::regnamespace
       group by t.typname order by t.typname`;
      expect(enums.map((e) => `${e.typname}=${e.labels}`)).toEqual([
        "workspace_membership_status=active,inactive",
        "workspace_role=owner_admin,manager,staff_sales",
      ]);
      const businessType = first(
        await admin()<{ data_type: string; is_nullable: string }[]>`
        select data_type, is_nullable from information_schema.columns
         where table_schema = 'public' and table_name = 'workspaces'
           and column_name = 'business_type'`,
        "business_type column",
      );
      expect(businessType).toEqual({ data_type: "text", is_nullable: "YES" });
    });

    it("15. creates nothing when no verified identity is set", async () => {
      // Scoped to this run's own identities. Anything wider races with the
      // other database suites: a whole-table count moves as they create
      // fixtures, and "auth_user_id is null" moves as they delete their auth
      // users, because the foreign key is ON DELETE SET NULL.
      const countProfiles = async () => {
        const sql = admin();
        return first(
          await sql<{ n: number }[]>`
            select count(*)::int as n from public.user_profiles
             where auth_user_id in ${sql(authUsers)}`,
          "count",
        ).n;
      };
      const before = await countProfiles();

      const named = { workspace: `Bootstrap NoIdentity ${RUN}` };

      const missing = await failureOf(bootstrap(null, named));
      expect(missing).toBeDefined();
      expect(surfaceOf(missing)).toMatch(/no verified identity/i);

      // An empty setting is the same as an absent one.
      expect(await failureOf(bootstrap("", named))).toBeDefined();

      // A malformed setting raises on the cast rather than degrading into
      // some other identity.
      const malformed = await failureOf(bootstrap("not-a-uuid", named));
      expect(surfaceOf(malformed)).toMatch(
        /invalid input syntax for type uuid/i,
      );

      expect(await countProfiles()).toBe(before);

      // And no workspace was created either: a call with no verified identity
      // never reaches an INSERT at all. Named uniquely, so this is about these
      // calls and not about workspaces other tests legitimately created.
      const workspaces = await admin()`
        select 1 from public.workspaces where name = ${`Bootstrap NoIdentity ${RUN}`}`;
      expect(workspaces).toHaveLength(0);
    });

    it("16. cannot create a profile for an Auth UUID that does not exist", async () => {
      const invented = crypto.randomUUID();
      const error = await failureOf(bootstrap(invented));
      expect(error).toBeDefined();
      // The foreign key to auth.users is the database's own proof that the
      // asserted identity belongs to a real account.
      expect(surfaceOf(error)).toMatch(
        /user_profiles_auth_user_id_fkey|foreign key/i,
      );

      const rows = await admin()`
      select 1 from public.user_profiles where auth_user_id = ${invented}`;
      expect(rows).toHaveLength(0);
    });

    it("31. reveals no connection string, credential, SQL body or foreign identifier", async () => {
      const auth = await makeAuthUser();
      const stranger = await makeAuthUser();
      const strangerProfile = await makeProfile(stranger);

      const surfaces = await Promise.all(
        [
          bootstrap(auth, { timeZone: "Mars/Olympus" }),
          bootstrap(auth, { workspace: "  " }),
          bootstrap(null),
          bootstrap(crypto.randomUUID()),
        ].map((p) =>
          p.then(
            () => "",
            (caught: unknown) => surfaceOf(caught),
          ),
        ),
      );
      for (const surface of surfaces) {
        expect(surface).not.toMatch(/postgres(ql)?:\/\//);
        expect(surface).not.toMatch(/password|54322|127\.0\.0\.1|limenzy_app/i);
        // No other user's identifiers are ever named.
        expect(surface).not.toContain(stranger);
        expect(surface).not.toContain(strangerProfile);
      }
    });
  },
);

describe.skipIf(!reachable)(
  "Phase 4C-1 — the runtime role gains nothing else",
  () => {
    it("17. is still denied a direct INSERT on all three tables", async () => {
      const auth = await makeAuthUser();
      const attempts: [string, () => Promise<unknown>][] = [
        [
          "user_profiles",
          () =>
            app()`insert into public.user_profiles (auth_user_id, full_name)
                values (${auth}, ${"Direct"})`,
        ],
        [
          "workspaces",
          () =>
            app()`insert into public.workspaces (name, country, currency, time_zone)
                values (${`Bootstrap Direct ${RUN}`}, 'IN', 'INR', 'Asia/Kolkata')`,
        ],
        [
          "workspace_memberships",
          () =>
            app()`insert into public.workspace_memberships
                  (workspace_id, user_profile_id, role, status)
                values (gen_random_uuid(), gen_random_uuid(), 'owner_admin', 'active')`,
        ],
      ];
      for (const [table, run] of attempts) {
        const error = (await failureOf(run())) as Error | undefined;
        expect(`${table}: ${error?.message ?? "SUCCEEDED"}`).toBe(
          `${table}: permission denied for table ${table}`,
        );
      }
      expect(await tenancyOf(auth)).toMatchObject({ profiles: 0 });
    });

    it("18. cannot become the bootstrap role, or any other", async () => {
      for (const role of ["limenzy_bootstrap", "limenzy_owner", "postgres"]) {
        const error = (await failureOf(app().unsafe(`set role ${role}`))) as
          Error | undefined;
        expect(`${role}: ${error?.message ?? "SUCCEEDED"}`).toBe(
          `${role}: permission denied to set role "${role}"`,
        );
      }
      // Nor does it hold membership in anything at all, which is the fact the
      // SET ROLE attempts above depend on.
      const rows = await app()<{ n: number }[]>`
      select count(*)::int as n
        from pg_catalog.pg_auth_members am
        join pg_catalog.pg_roles m on m.oid = am.member
       where m.rolname = 'limenzy_app'`;
      expect(first(rows, "memberships").n).toBe(0);
    });

    it("29/30. leaves no context on a reused backend, after commit or rollback", async () => {
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

      const before = await settings();

      const committed = await makeAuthUser();
      expect(await bootstrap(committed, {}, solo)).toBe("created");
      const afterCommit = await settings();
      // A pool of one, so this is physically the same connection.
      expect(afterCommit.backend).toBe(before.backend);
      expect({
        auth: afterCommit.auth,
        profile: afterCommit.profile,
        workspace: afterCommit.workspace,
      }).toEqual({ auth: "", profile: "", workspace: "" });

      const rolled = await makeAuthUser();
      await failureOf(bootstrap(rolled, { timeZone: "Mars/Olympus" }, solo));
      const afterRollback = await settings();
      expect(afterRollback.backend).toBe(before.backend);
      expect({
        auth: afterRollback.auth,
        profile: afterRollback.profile,
        workspace: afterRollback.workspace,
      }).toEqual({ auth: "", profile: "", workspace: "" });
    });
  },
);

describe.skipIf(!reachable)(
  "Phase 4C-1 — the catalogue matches the migration",
  () => {
    it("19/20. keeps limenzy_bootstrap unable to log in and without BYPASSRLS", async () => {
      const row = first(
        await admin()<
          {
            rolcanlogin: boolean;
            rolsuper: boolean;
            rolbypassrls: boolean;
            rolcreatedb: boolean;
            rolcreaterole: boolean;
            rolreplication: boolean;
          }[]
        >`
        select rolcanlogin, rolsuper, rolbypassrls,
               rolcreatedb, rolcreaterole, rolreplication
          from pg_catalog.pg_roles where rolname = 'limenzy_bootstrap'`,
        "bootstrap role",
      );
      expect(row).toEqual({
        rolcanlogin: false,
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
      });
    });

    it("21. keeps RLS enabled and forced on all three tables", async () => {
      const rows = await admin()<
        { relname: string; rls: boolean; force: boolean }[]
      >`
      select relname, relrowsecurity as rls, relforcerowsecurity as force
        from pg_catalog.pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'
       order by relname`;
      expect(rows).toEqual([
        { relname: "user_profiles", rls: true, force: true },
        { relname: "workspace_memberships", rls: true, force: true },
        { relname: "workspaces", rls: true, force: true },
      ]);
    });

    it("22/23/24. defines one routine with the exact security shape", async () => {
      const rows = await admin()<
        {
          signature: string;
          owner: string;
          secdef: boolean;
          volatility: string;
          parallel: string;
          config: string | null;
          acl: string | null;
        }[]
      >`
      select p.oid::regprocedure::text                   as signature,
             pg_catalog.pg_get_userbyid(p.proowner)      as owner,
             p.prosecdef                                 as secdef,
             p.provolatile::text                         as volatility,
             p.proparallel::text                         as parallel,
             pg_catalog.array_to_string(p.proconfig, ',') as config,
             pg_catalog.array_to_string(p.proacl, ' ; ')  as acl
        from pg_catalog.pg_proc p
       where p.pronamespace = 'app'::regnamespace
         and p.proname like '%initial_workspace%'`;

      // Exactly one bootstrap routine: no second, broader entry point.
      expect(rows).toHaveLength(1);
      const fn = first(rows, "routine");
      expect(fn.signature).toBe(
        "app.create_initial_workspace(text,text,text,text,text,text)",
      );
      expect(fn.owner).toBe("limenzy_bootstrap");
      expect(fn.secdef).toBe(true);
      expect(fn.volatility).toBe("v");
      expect(fn.parallel).toBe("u");
      expect(fn.config).toBe('search_path=""');
      // EXECUTE for the owner and the runtime role, and nobody else.
      expect(fn.acl).toBe(
        "limenzy_bootstrap=X/limenzy_bootstrap ; limenzy_app=X/limenzy_bootstrap",
      );
    });

    it("25. denies execution to PUBLIC and to every Supabase role", async () => {
      const rows = await admin()<
        { role: string; execute: boolean; usage: boolean }[]
      >`
      select r.rolname as role,
             pg_catalog.has_function_privilege(
               r.rolname,
               'app.create_initial_workspace(text,text,text,text,text,text)',
               'EXECUTE') as execute,
             pg_catalog.has_schema_privilege(r.rolname, 'app', 'USAGE') as usage
        from pg_catalog.pg_roles r
       where r.rolname in ('anon', 'authenticated', 'service_role', 'limenzy_owner')
       order by r.rolname`;
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        expect(`${row.role}:execute=${row.execute}`).toBe(
          `${row.role}:execute=false`,
        );
      }
      // The browser-reachable roles cannot even resolve the schema, so a
      // mistaken EXECUTE grant alone would still not reach the function.
      for (const row of rows.filter((r) => r.role !== "limenzy_owner")) {
        expect(`${row.role}:usage=${row.usage}`).toBe(
          `${row.role}:usage=false`,
        );
      }
      // PUBLIC holds nothing: an ACL entry with an empty grantee would be one.
      const acl = first(
        await admin()<{ acl: string }[]>`
        select pg_catalog.array_to_string(proacl, ' ; ') as acl
          from pg_catalog.pg_proc
         where pronamespace = 'app'::regnamespace
           and proname = 'create_initial_workspace'`,
        "acl",
      );
      expect(acl.acl).not.toMatch(/(^|;)\s*=X/);
    });

    it("26. leaves limenzy_bootstrap USAGE but not CREATE on schema app", async () => {
      const row = first(
        await admin()<{ usage: boolean; may_create: boolean }[]>`
        select pg_catalog.has_schema_privilege('limenzy_bootstrap', 'app', 'USAGE')  as usage,
               pg_catalog.has_schema_privilege('limenzy_bootstrap', 'app', 'CREATE') as may_create`,
        "schema privileges",
      );
      // CREATE was needed only to own the function, and was withdrawn.
      expect(row).toEqual({ usage: true, may_create: false });
    });

    it("27/28. grants limenzy_bootstrap exactly the allow-list and nothing more", async () => {
      const columns = await admin()<
        { table_name: string; column_name: string; privilege_type: string }[]
      >`
      select table_name, column_name, privilege_type
        from information_schema.column_privileges
       where table_schema = 'public' and grantee = 'limenzy_bootstrap'
       order by table_name, privilege_type, column_name`;

      const inserts = columns
        .filter((c) => c.privilege_type === "INSERT")
        .map((c) => `${c.table_name}.${c.column_name}`)
        .sort();
      expect(inserts).toEqual([
        "user_profiles.auth_user_id",
        "user_profiles.full_name",
        "user_profiles.id",
        "workspace_memberships.id",
        "workspace_memberships.role",
        "workspace_memberships.status",
        "workspace_memberships.user_profile_id",
        "workspace_memberships.workspace_id",
        "workspaces.business_type",
        "workspaces.country",
        "workspaces.currency",
        "workspaces.id",
        "workspaces.name",
        "workspaces.time_zone",
      ]);
      // created_at and updated_at belong to the database.
      expect(inserts.filter((c) => /_at$/.test(c))).toEqual([]);

      // No UPDATE, DELETE, TRUNCATE or REFERENCES anywhere.
      const other = [
        ...new Set(
          columns
            .filter((c) => !["INSERT", "SELECT"].includes(c.privilege_type))
            .map((c) => c.privilege_type),
        ),
      ];
      expect(other).toEqual([]);

      // SELECT on the two tables it must read, and none on workspaces.
      const tables = await admin()<
        { table_name: string; privilege_type: string }[]
      >`
      select table_name, privilege_type
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'limenzy_bootstrap'
       order by table_name, privilege_type`;
      expect(tables.map((t) => `${t.table_name}:${t.privilege_type}`)).toEqual([
        "user_profiles:SELECT",
        "workspace_memberships:SELECT",
      ]);
      expect(
        columns.some(
          (c) => c.table_name === "workspaces" && c.privilege_type === "SELECT",
        ),
      ).toBe(false);
    });

    it("defines exactly five bootstrap policies, all scoped to limenzy_bootstrap", async () => {
      const rows = await admin()<
        {
          policyname: string;
          cmd: string;
          roles: string;
          qual: string | null;
          check: string | null;
        }[]
      >`
      select policyname, cmd, roles::text as roles, qual, with_check as check
        from pg_policies
       where schemaname = 'public' and policyname like '%bootstrap%'
       order by policyname`;

      expect(rows.map((r) => `${r.policyname}:${r.cmd}`)).toEqual([
        "user_profiles_bootstrap_insert:INSERT",
        "user_profiles_bootstrap_select:SELECT",
        "workspace_memberships_bootstrap_insert:INSERT",
        "workspace_memberships_bootstrap_select:SELECT",
        "workspaces_bootstrap_insert:INSERT",
      ]);
      for (const row of rows) {
        expect(`${row.policyname}:${row.roles}`).toBe(
          `${row.policyname}:{limenzy_bootstrap}`,
        );
        // Every predicate is keyed on the verified identity; none is a blanket.
        const predicate = `${row.qual ?? ""} ${row.check ?? ""}`;
        expect(predicate).toMatch(/current_auth_user_id/);
        expect(predicate.replace(/\s+/g, " ")).not.toMatch(/\(\s*true\s*\)/);
      }
      // The membership insert pins role and status in the policy as well as in
      // the routine, so neither alone is the only control.
      const membership = rows.find(
        (r) => r.policyname === "workspace_memberships_bootstrap_insert",
      );
      expect(membership?.check).toMatch(/owner_admin/);
      expect(membership?.check).toMatch(/active/);
    });

    it("leaves the four Phase-2 application policies untouched", async () => {
      const rows = await admin()<{ policyname: string; roles: string }[]>`
      select policyname, roles::text as roles
        from pg_policies
       where schemaname = 'public' and policyname not like '%bootstrap%'
       order by policyname`;
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
      // And the runtime role still holds no write grant of any kind.
      const writes = await admin()`
      select 1 from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'limenzy_app'
         and privilege_type in ('INSERT', 'DELETE', 'TRUNCATE')`;
      expect(writes).toHaveLength(0);
    });
  },
);
