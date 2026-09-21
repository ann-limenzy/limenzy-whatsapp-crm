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

/**
 * Milestone 1C-C Phase 4A — identity resolution, against a real database.
 *
 * Every claim here is made by executing it as `limenzy_app` through
 * `DATABASE_URL`. The tooling connection appears only to create and remove
 * fixtures and to observe the database from outside; it holds BYPASSRLS, so
 * using it to "prove" visibility would prove nothing.
 *
 * Two test-side substitutions, and no production seam:
 *
 *   1. `@/server/auth/require-user` is mocked, which is how a test represents
 *      "this verified user is signed in". It is the resolver's only identity
 *      source precisely because it cannot be passed one.
 *   2. `runtimeSql()` is mocked to return a pool of a known size, so "the same
 *      backend was reused" is a physical fact rather than an inference. The
 *      pool itself is built by the real `createRuntimePool`.
 *
 * The pool is additionally wrapped in a *tracing* proxy that, before each
 * statement the resolver issues, records the statement text and the three
 * context settings as the backend then sees them. That is how the mid-
 * transaction ordering requirements below are observed without the production
 * module exposing anything.
 */

const getAuthenticatedUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-user", () => ({ getAuthenticatedUser }));

const actualClient =
  await vi.importActual<typeof import("./client")>("./client");

const H = vi.hoisted(() => ({ active: null as postgres.Sql | null }));

vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return { ...actual, runtimeSql: () => H.active as postgres.Sql };
});

const { IdentityResolutionError, resolveVerifiedIdentity } =
  await import("./identity");

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
// The runtime connection is opened for real by `createRuntimePool` below; this
// only establishes that `limenzy_app` can reach the database at all.
const runtime = await probe(RUNTIME);
await runtime?.end({ timeout: 1 }).catch(() => {});
const reachable = tooling !== undefined && runtime !== undefined;

if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] Phase 4A identity tests need both connections. Run "npm run db:start", ' +
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

/** The three settings plus the backend, as the database currently sees them. */
type Settings = {
  auth: string;
  profile: string;
  workspace: string;
  backend: string;
  /**
   * The transaction's own ID, or "" while none has been assigned.
   *
   * PostgreSQL assigns one lazily, on the first write of any kind. A
   * transaction that only reads never acquires one, so an empty value here is
   * proof that nothing was written — to any table, by any statement, including
   * ones these tests did not anticipate.
   */
  xid: string;
};

const readSettings = async (
  sql: postgres.Sql | postgres.TransactionSql,
): Promise<Settings> =>
  first(
    (await sql`
      select coalesce(current_setting('app.auth_user_id', true), '')    as auth,
             coalesce(current_setting('app.user_profile_id', true), '') as profile,
             coalesce(current_setting('app.workspace_id', true), '')    as workspace,
             pg_backend_pid()::text                                     as backend,
             coalesce(pg_current_xact_id_if_assigned()::text, '')        as xid`) as unknown as Settings[],
    "settings",
  );

/**
 * One observation of the transaction: either a statement the resolver issued,
 * with the context in force just before it, or the state the transaction was
 * about to commit with.
 */
type Step = Settings & { sql: string; issued: boolean };

const statementText = (args: readonly unknown[]) =>
  Array.isArray(args[0])
    ? (args[0] as readonly string[]).join(" ? ").replace(/\s+/g, " ").trim()
    : String(args[0]);

/**
 * Wrap a transaction so each statement is recorded, and optionally fail one.
 *
 * `failOn` simulates the database dropping mid-transaction, which is the only
 * way to reach the rollback path: `user_profiles.auth_user_id` is unique, so
 * no fixture can produce the ambiguous-profile failure.
 */
const traceTx = (
  tx: postgres.TransactionSql,
  steps: Step[],
  failOn?: RegExp,
): postgres.TransactionSql =>
  new Proxy(tx, {
    apply(target, _thisArg, args) {
      const sql = statementText(args);
      return (async () => {
        steps.push({ sql, issued: true, ...(await readSettings(target)) });
        if (failOn?.test(sql)) {
          // Shaped like a driver failure — a connection string and the
          // failing statement — so the assertions below have something real to
          // prove is discarded. Every value in it is invented.
          throw new Error(
            "connection terminated: postgresql://not-a-real-user:not-a-real-password@db.invalid:5432/postgres" +
              ' while executing "select id from public.user_profiles"',
          );
        }
        return Reflect.apply(
          target as unknown as (...a: unknown[]) => unknown,
          target,
          args,
        );
      })();
    },
    get(target, property) {
      const value = Reflect.get(target, property) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as postgres.TransactionSql;

const tracingPool = (
  pool: postgres.Sql,
  steps: Step[],
  failOn?: RegExp,
): postgres.Sql =>
  new Proxy(pool, {
    get(target, property) {
      if (property === "begin") {
        return <T>(fn: (tx: postgres.TransactionSql) => Promise<T>) =>
          target.begin(async (tx) => {
            const value = await fn(traceTx(tx, steps, failOn));
            // The state the transaction is about to commit with — after the
            // resolver's last statement, before COMMIT.
            steps.push({
              sql: "<before commit>",
              issued: false,
              ...(await readSettings(tx)),
            });
            return value;
          });
      }
      const value = Reflect.get(target, property) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
    apply(target, _thisArg, args) {
      return Reflect.apply(
        target as unknown as (...a: unknown[]) => unknown,
        target,
        args,
      );
    },
  }) as postgres.Sql;

type User = {
  id: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
};

const signedIn = (authUserId: string, overrides: Partial<User> = {}): User => ({
  id: authUserId,
  email: `identity-${authUserId.slice(0, 8)}@example.com`,
  emailVerified: true,
  fullName: "Fixture Person",
  ...overrides,
});

/** Resolve as `user`, recording every statement the resolver issued. */
const resolveAs = async (user: User | null, failOn?: RegExp) => {
  const steps: Step[] = [];
  getAuthenticatedUser.mockResolvedValue(user);
  H.active = tracingPool(single, steps, failOn);
  try {
    return { steps, result: await resolveVerifiedIdentity() };
  } finally {
    H.active = single;
  }
};

/** Per-run namespace so a failed run cannot collide with the next. */
const RUN = crypto.randomUUID().slice(0, 8);

let single: postgres.Sql;
let pair: postgres.Sql | undefined;

const fixture = {
  /** Two active memberships, one inactive. */
  authA: "",
  profileA: "",
  /** Exactly one active membership — the "other tenant". */
  authB: "",
  profileB: "",
  /** A profile with no memberships at all. */
  authC: "",
  profileC: "",
  /** A verified authentication account with no profile row. */
  authD: "",
  workspace1: "",
  workspace2: "",
  workspace3: "",
  workspace4: "",
};

/**
 * How many profiles point at one authentication account.
 *
 * Scoped deliberately. A whole-table count would be read while the other
 * database suites are creating and removing fixtures of their own, and would
 * report their work as this resolver's.
 */
const profilesFor = async (authUserId: string) => {
  const rows = await admin()`
    select count(*)::int as n from public.user_profiles
     where auth_user_id = ${authUserId}`;
  return first(rows as unknown as { n: number }[], "profile count").n;
};

/**
 * A digest of every column of every fixture row this run owns.
 *
 * Stronger than a row count: an UPDATE that changed a role, or a
 * delete-plus-insert, would leave the count identical and this value different.
 *
 * Scoped to this run's rows because the other database suites run alongside
 * this one and create and delete fixtures of their own; a whole-table digest
 * would report their activity as this resolver's.
 */
const digest = async () => {
  const sql = admin();
  const profiles = [fixture.profileA, fixture.profileB, fixture.profileC];
  const workspaces = [
    fixture.workspace1,
    fixture.workspace2,
    fixture.workspace3,
    fixture.workspace4,
  ];
  const md5 = (rows: unknown) =>
    first(rows as unknown as { d: string }[], "digest").d;

  return {
    workspaces: md5(
      await sql`select coalesce(md5(string_agg(row::text, '|' order by row::text)), '') as d
                  from (select t from public.workspaces t
                         where t.id in ${sql(workspaces)}) as s(row)`,
    ),
    user_profiles: md5(
      await sql`select coalesce(md5(string_agg(row::text, '|' order by row::text)), '') as d
                  from (select t from public.user_profiles t
                         where t.id in ${sql(profiles)}
                            or t.auth_user_id = ${fixture.authD}) as s(row)`,
    ),
    workspace_memberships: md5(
      await sql`select coalesce(md5(string_agg(row::text, '|' order by row::text)), '') as d
                  from (select t from public.workspace_memberships t
                         where t.user_profile_id in ${sql(profiles)}) as s(row)`,
    ),
  };
};

beforeAll(async () => {
  if (!reachable) return;
  single = actualClient.createRuntimePool({ max: 1 });
  const sql = admin();

  const makeAuthUser = async () => {
    const rows = await sql`
      insert into auth.users
        (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
              'authenticated', 'authenticated',
              ${`identity-${RUN}-${crypto.randomUUID().slice(0, 8)}@example.com`},
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
  fixture.authC = await makeAuthUser();
  fixture.authD = await makeAuthUser();
  fixture.profileA = await makeProfile(fixture.authA, `Identity A ${RUN}`);
  fixture.profileB = await makeProfile(fixture.authB, `Identity B ${RUN}`);
  fixture.profileC = await makeProfile(fixture.authC, `Identity C ${RUN}`);
  fixture.workspace1 = await makeWorkspace(`Identity WS 1 ${RUN}`);
  fixture.workspace2 = await makeWorkspace(`Identity WS 2 ${RUN}`);
  fixture.workspace3 = await makeWorkspace(`Identity WS 3 ${RUN}`);
  fixture.workspace4 = await makeWorkspace(`Identity WS 4 ${RUN}`);

  // A — two active memberships with different roles, created in a known order,
  // plus one inactive membership that must never appear.
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status, created_at)
            values (${fixture.workspace1}, ${fixture.profileA}, 'owner_admin', 'active', now() - interval '2 hours')`;
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status, created_at)
            values (${fixture.workspace2}, ${fixture.profileA}, 'staff_sales', 'active', now() - interval '1 hour')`;
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fixture.workspace3}, ${fixture.profileA}, 'manager', 'inactive')`;
  // B — a single active membership in a workspace A is not a member of.
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fixture.workspace4}, ${fixture.profileB}, 'manager', 'active')`;
  // C — deliberately none.
});

afterEach(() => {
  getAuthenticatedUser.mockReset();
  if (reachable) H.active = single;
});

afterAll(async () => {
  if (reachable) {
    const sql = admin();
    // Foreign keys RESTRICT, so order matters.
    await sql`delete from public.workspace_memberships
               where user_profile_id in (${fixture.profileA}, ${fixture.profileB}, ${fixture.profileC})`.catch(
      () => {},
    );
    await sql`delete from public.user_profiles
               where id in (${fixture.profileA}, ${fixture.profileB}, ${fixture.profileC})`.catch(
      () => {},
    );
    await sql`delete from public.workspaces
               where id in (${fixture.workspace1}, ${fixture.workspace2}, ${fixture.workspace3}, ${fixture.workspace4})`.catch(
      () => {},
    );
    await sql`delete from auth.users
               where id in (${fixture.authA}, ${fixture.authB}, ${fixture.authC}, ${fixture.authD})`.catch(
      () => {},
    );
  }
  await tooling?.end({ timeout: 2 }).catch(() => {});
  await single?.end({ timeout: 2 }).catch(() => {});
  await pair?.end({ timeout: 2 }).catch(() => {});
});

describe.skipIf(!reachable)("Phase 4A — what the resolver returns", () => {
  it("1. returns the no-profile result for a verified user without a profile", async () => {
    const { result } = await resolveAs(signedIn(fixture.authD));
    expect(result).toEqual({
      kind: "onboarding_required",
      authUserId: fixture.authD,
    });
  });

  it("2. resolves the caller's own profile and never a peer's", async () => {
    const a = await resolveAs(signedIn(fixture.authA));
    const b = await resolveAs(signedIn(fixture.authB));

    expect(a.result).toMatchObject({
      kind: "resolved",
      userProfileId: fixture.profileA,
    });
    expect(b.result).toMatchObject({
      kind: "resolved",
      userProfileId: fixture.profileB,
    });

    // The profile SELECT carries no WHERE clause: row-level security alone
    // narrowed it. Were the policy dropped, every profile would return and the
    // resolver would fail closed instead of resolving the wrong person.
    const select = a.steps.find((step) =>
      /from public\.user_profiles/.test(step.sql),
    );
    expect(select?.sql).not.toMatch(/where/i);
  });

  it("3. resolves a profile with no memberships as an empty list", async () => {
    const { result } = await resolveAs(signedIn(fixture.authC));
    expect(result).toEqual({
      kind: "resolved",
      authUserId: fixture.authC,
      userProfileId: fixture.profileC,
      memberships: [],
    });
  });

  it("4. excludes inactive memberships", async () => {
    const { result } = await resolveAs(signedIn(fixture.authA));
    const workspaces =
      result.kind === "resolved"
        ? result.memberships.map((m) => m.workspaceId)
        : [];
    expect(workspaces).not.toContain(fixture.workspace3);

    // The row genuinely exists; it is the status that excluded it.
    const rows = await admin()`
      select status::text from public.workspace_memberships
       where user_profile_id = ${fixture.profileA}
         and workspace_id = ${fixture.workspace3}`;
    expect(
      first(rows as unknown as { status: string }[], "inactive row").status,
    ).toBe("inactive");
  });

  it("5. returns a single membership as a one-element list", async () => {
    const { result } = await resolveAs(signedIn(fixture.authB));
    expect(result).toEqual({
      kind: "resolved",
      authUserId: fixture.authB,
      userProfileId: fixture.profileB,
      memberships: [{ workspaceId: fixture.workspace4, role: "manager" }],
    });
  });

  it("6. returns multiple memberships without selecting one", async () => {
    const { result } = await resolveAs(signedIn(fixture.authA));
    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;

    expect(result.memberships).toHaveLength(2);
    expect(result.memberships.map((m) => m.workspaceId)).toEqual([
      fixture.workspace1,
      fixture.workspace2,
    ]);
    // No current, default, active or selected workspace anywhere in the result.
    expect(Object.keys(result).sort()).toEqual([
      "authUserId",
      "kind",
      "memberships",
      "userProfileId",
    ]);
    expect(JSON.stringify(result)).not.toMatch(
      /current|default|selected|active/i,
    );
  });

  it("7. reports each role exactly as the database stores it", async () => {
    const { result } = await resolveAs(signedIn(fixture.authA));
    const stored = await admin()`
      select workspace_id, role::text as role
        from public.workspace_memberships
       where user_profile_id = ${fixture.profileA} and status = 'active'`;
    const expected = new Map(
      (stored as unknown as { workspace_id: string; role: string }[]).map(
        (row) => [row.workspace_id, row.role],
      ),
    );

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;
    for (const membership of result.memberships) {
      expect(membership.role).toBe(expected.get(membership.workspaceId));
    }
    // Roles differ between the two, so this is not a single-value coincidence.
    expect(new Set(result.memberships.map((m) => m.role)).size).toBe(2);
  });

  it("8. takes the profile ID from the database, not from the claim", async () => {
    const { result } = await resolveAs(signedIn(fixture.authA));
    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") return;

    expect(result.userProfileId).toBe(fixture.profileA);
    expect(result.userProfileId).not.toBe(fixture.authA);
    expect(result.authUserId).toBe(fixture.authA);
  });
});

describe.skipIf(!reachable)("Phase 4A — the transaction context", () => {
  it("9. has app.auth_user_id in force when the profile is read", async () => {
    const { steps } = await resolveAs(signedIn(fixture.authA));
    const select = steps.find((step) =>
      /from public\.user_profiles/.test(step.sql),
    );
    expect(select).toBeDefined();
    expect(select?.auth).toBe(fixture.authA);
  });

  it("10. sets app.user_profile_id only after the profile is resolved", async () => {
    const { steps } = await resolveAs(signedIn(fixture.authA));
    const profileSelect = steps.findIndex((step) =>
      /from public\.user_profiles/.test(step.sql),
    );
    const membershipSelect = steps.findIndex((step) =>
      /from public\.workspace_memberships/.test(step.sql),
    );
    expect(profileSelect).toBeGreaterThanOrEqual(0);
    expect(membershipSelect).toBeGreaterThan(profileSelect);

    // Unset for every statement up to and including the profile read...
    for (const step of steps.slice(0, profileSelect + 1)) {
      expect(`${step.sql} -> ${step.profile}`).toBe(`${step.sql} -> `);
    }
    // ...and set to the stored ID by the time memberships are read.
    expect(steps[membershipSelect]?.profile).toBe(fixture.profileA);
  });

  it("11. never sets app.workspace_id", async () => {
    const runs = [
      await resolveAs(signedIn(fixture.authA)),
      await resolveAs(signedIn(fixture.authB)),
      await resolveAs(signedIn(fixture.authC)),
      await resolveAs(signedIn(fixture.authD)),
    ];
    for (const { steps } of runs) {
      for (const step of steps) {
        expect(`${step.sql} -> ${step.workspace}`).toBe(`${step.sql} -> `);
      }
      // Not even mentioned in the statements it issues.
      expect(
        steps
          .filter((step) => step.issued)
          .map((step) => step.sql)
          .join("\n"),
      ).not.toMatch(/app\.workspace_id/);
    }
  });

  it("12. leaves no context behind on the same backend after commit", async () => {
    const { steps } = await resolveAs(signedIn(fixture.authA));
    const inside = steps.at(-1);
    expect(inside?.auth).toBe(fixture.authA);

    const after = await readSettings(single);
    expect(after.backend).toBe(inside?.backend);
    expect({
      auth: after.auth,
      profile: after.profile,
      workspace: after.workspace,
    }).toEqual({ auth: "", profile: "", workspace: "" });
  });

  it("13. leaves no context behind after a rolled-back transaction", async () => {
    const steps: Step[] = [];
    getAuthenticatedUser.mockResolvedValue(signedIn(fixture.authA));
    H.active = tracingPool(single, steps, /workspace_memberships/);

    await expect(resolveVerifiedIdentity()).rejects.toBeInstanceOf(
      IdentityResolutionError,
    );
    H.active = single;

    // It got far enough to have set both settings before failing.
    const inside = steps.at(-1);
    expect(inside?.auth).toBe(fixture.authA);
    expect(inside?.profile).toBe(fixture.profileA);

    const after = await readSettings(single);
    expect(after.backend).toBe(inside?.backend);
    expect({
      auth: after.auth,
      profile: after.profile,
      workspace: after.workspace,
    }).toEqual({ auth: "", profile: "", workspace: "" });
  });

  it("14. isolates sequential users sharing one pooled connection", async () => {
    const a = await resolveAs(signedIn(fixture.authA));
    const b = await resolveAs(signedIn(fixture.authB));

    // Physically the same backend, so no reset is being masked by a new one.
    expect(b.steps[0]?.backend).toBe(a.steps[0]?.backend);
    // B's transaction started with nothing left over from A's.
    expect(b.steps[0]).toMatchObject({ auth: "", profile: "", workspace: "" });

    expect(a.result).toMatchObject({ userProfileId: fixture.profileA });
    expect(b.result).toMatchObject({ userProfileId: fixture.profileB });
    const bWorkspaces =
      b.result.kind === "resolved"
        ? b.result.memberships.map((m) => m.workspaceId)
        : [];
    expect(bWorkspaces).toEqual([fixture.workspace4]);
  });

  it("15. isolates two users resolving concurrently", async () => {
    pair ??= actualClient.createRuntimePool({ max: 2 });
    const stepsA: Step[] = [];
    const stepsB: Step[] = [];

    // Both calls are started in order, and each reads its user as its very
    // first action, so the queued values land in the intended calls.
    getAuthenticatedUser
      .mockResolvedValueOnce(signedIn(fixture.authA))
      .mockResolvedValueOnce(signedIn(fixture.authB));

    const poolA = tracingPool(pair, stepsA);
    const poolB = tracingPool(pair, stepsB);
    let call = 0;
    H.active = new Proxy(pair, {
      get(target, property) {
        if (property === "begin")
          return (fn: never) =>
            (call++ === 0 ? poolA : poolB).begin(fn as never);
        const value = Reflect.get(target, property) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as postgres.Sql;

    const [a, b] = await Promise.all([
      resolveVerifiedIdentity(),
      resolveVerifiedIdentity(),
    ]);
    H.active = single;

    expect(a).toMatchObject({
      authUserId: fixture.authA,
      userProfileId: fixture.profileA,
    });
    expect(b).toMatchObject({
      authUserId: fixture.authB,
      userProfileId: fixture.profileB,
    });
    // Genuinely two backends, overlapping in time.
    expect(stepsB[0]?.backend).not.toBe(stepsA[0]?.backend);
    // Neither saw the other's context.
    for (const step of stepsA) expect(step.profile).not.toBe(fixture.profileB);
    for (const step of stepsB) expect(step.profile).not.toBe(fixture.profileA);

    const aWorkspaces =
      a.kind === "resolved" ? a.memberships.map((m) => m.workspaceId) : [];
    const bWorkspaces =
      b.kind === "resolved" ? b.memberships.map((m) => m.workspaceId) : [];
    expect(aWorkspaces).toEqual([fixture.workspace1, fixture.workspace2]);
    expect(bWorkspaces).toEqual([fixture.workspace4]);
  });
});

describe.skipIf(!reachable)("Phase 4A — failure and side effects", () => {
  it("16. turns a database failure into an error that leaks nothing", async () => {
    const steps: Step[] = [];
    getAuthenticatedUser.mockResolvedValue(signedIn(fixture.authA));
    H.active = tracingPool(single, steps, /user_profiles/);

    const error = await resolveVerifiedIdentity().then(
      () => undefined,
      (caught: unknown) => caught,
    );
    H.active = single;

    expect(error).toBeInstanceOf(IdentityResolutionError);
    const thrown = error as InstanceType<typeof IdentityResolutionError>;
    expect(thrown.reason).toBe("database_unavailable");
    // The injected driver error carried a connection string and SQL. Neither
    // survives into what a caller could render.
    const surface = `${thrown.name} ${thrown.message} ${String(thrown.cause ?? "")}`;
    expect(surface).not.toMatch(/postgres(ql)?:\/\//);
    expect(surface).not.toMatch(
      /not-a-real-password|db\.invalid|not-a-real-user/,
    );
    // Nor any connection detail of its own.
    expect(surface).not.toMatch(/limenzy_app|54322|127\.0\.0\.1/);
    expect(surface).not.toMatch(/select|insert|from public/i);
    expect(surface).not.toContain(fixture.profileA);
    expect(surface).not.toContain(fixture.authA);
  });

  it("17. creates no profile for a verified user who has none", async () => {
    const before = await digest();
    const { result } = await resolveAs(signedIn(fixture.authD));
    expect(result.kind).toBe("onboarding_required");

    // Still no profile for that account, and none was created under a
    // different identifier either: the fixture digest includes any row
    // pointing at this authentication account.
    expect(await profilesFor(fixture.authD)).toBe(0);
    expect(await digest()).toEqual(before);

    // Resolving again is still the same answer, not a second attempt at one.
    const again = await resolveAs(signedIn(fixture.authD));
    expect(again.result).toEqual(result);
    expect(await profilesFor(fixture.authD)).toBe(0);
    expect(await digest()).toEqual(before);
  });

  it("18. performs no INSERT, UPDATE or DELETE", async () => {
    const before = await digest();

    const runs = [
      await resolveAs(signedIn(fixture.authA)),
      await resolveAs(signedIn(fixture.authB)),
      await resolveAs(signedIn(fixture.authC)),
      await resolveAs(signedIn(fixture.authD)),
    ];

    for (const { steps } of runs) {
      const issued = steps.filter((step) => step.issued);
      expect(issued.length).toBeGreaterThan(0);
      for (const step of issued) {
        expect(step.sql).toMatch(/^select\b/i);
        expect(step.sql).not.toMatch(
          /\b(insert|update|delete|merge|truncate|copy|create|alter|drop|grant)\b/i,
        );
      }
      // Stronger than reading the statements: no transaction ID was ever
      // assigned, right up to the moment of commit, so nothing was written
      // anywhere by anything the resolver did.
      for (const step of steps) {
        expect(`${step.sql} -> ${step.xid}`).toBe(`${step.sql} -> `);
      }
    }

    // Every column of every fixture row is byte-identical, so none was
    // inserted, changed or removed.
    expect(await digest()).toEqual(before);
  });
});
