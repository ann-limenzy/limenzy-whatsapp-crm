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

import { withTenant } from "@/server/db/tenant";

/**
 * Milestone 1C-C Phase 4B — the whole chain, against a real database.
 *
 * Phase 4A resolves identity, Phase 4B validates a workspace and mints the
 * context, and `withTenant()` carries it into a transaction. The unit suite
 * proves the selection rules with Phase 4A mocked; this one proves that the
 * context those rules produce actually opens the right door in PostgreSQL —
 * and, more importantly, that it stops working the moment the database says
 * the membership no longer justifies it.
 *
 * Two test-side substitutions, both existing ones: the verified-authentication
 * utility is mocked to represent a signed-in user, and `runtimeSql()` returns a
 * pool of size ONE built by the real factory, so "the same physical backend was
 * reused" is a fact rather than an inference. Phase 4B itself is not mocked.
 */

const getAuthenticatedUser = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-user", () => ({ getAuthenticatedUser }));

const actualClient =
  await vi.importActual<typeof import("@/server/db/client")>(
    "@/server/db/client",
  );

const H = vi.hoisted(() => ({ active: null as postgres.Sql | null }));

vi.mock("@/server/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/db/client")>();
  return { ...actual, runtimeSql: () => H.active as postgres.Sql };
});

const { resolveWorkspaceContext } = await import("./workspace-context");

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
await runtime?.end({ timeout: 1 }).catch(() => {});
const reachable = tooling !== undefined && runtime !== undefined;

if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] Phase 4B chain tests need both connections. Run "npm run db:start", ' +
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

let single: postgres.Sql;

const fixture = {
  /** One active membership. */
  authSolo: "",
  profileSolo: "",
  workspaceSolo: "",
  /** Two active memberships, plus a third that is inactive. */
  authMulti: "",
  profileMulti: "",
  workspaceOne: "",
  workspaceTwo: "",
  workspaceInactive: "",
  /** Someone else's workspace entirely. */
  workspaceForeign: "",
};

const signedIn = (authUserId: string) => ({
  id: authUserId,
  email: `chain-${authUserId.slice(0, 8)}@example.com`,
  emailVerified: true,
  fullName: "Chain Fixture",
});

beforeAll(async () => {
  if (!reachable) return;
  single = actualClient.createRuntimePool({ max: 1 });
  H.active = single;
  const sql = admin();

  const makeAuthUser = async () => {
    const rows = await sql`
      insert into auth.users
        (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
              'authenticated', 'authenticated',
              ${`chain-${RUN}-${crypto.randomUUID().slice(0, 8)}@example.com`},
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

  fixture.authSolo = await makeAuthUser();
  fixture.authMulti = await makeAuthUser();
  fixture.profileSolo = await makeProfile(
    fixture.authSolo,
    `Chain Solo ${RUN}`,
  );
  fixture.profileMulti = await makeProfile(
    fixture.authMulti,
    `Chain Multi ${RUN}`,
  );
  fixture.workspaceSolo = await makeWorkspace(`Chain Solo WS ${RUN}`);
  fixture.workspaceOne = await makeWorkspace(`Chain One ${RUN}`);
  fixture.workspaceTwo = await makeWorkspace(`Chain Two ${RUN}`);
  fixture.workspaceInactive = await makeWorkspace(`Chain Inactive ${RUN}`);
  fixture.workspaceForeign = await makeWorkspace(`Chain Foreign ${RUN}`);

  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fixture.workspaceSolo}, ${fixture.profileSolo}, 'owner_admin', 'active')`;
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fixture.workspaceOne}, ${fixture.profileMulti}, 'owner_admin', 'active')`;
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fixture.workspaceTwo}, ${fixture.profileMulti}, 'staff_sales', 'active')`;
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fixture.workspaceInactive}, ${fixture.profileMulti}, 'manager', 'inactive')`;
  // workspaceForeign deliberately has no membership for either fixture user.
});

/** Restore the fixture rows any test may have changed. */
const restoreMemberships = async () => {
  const sql = admin();
  await sql`update public.workspace_memberships
               set status = 'active', role = 'owner_admin'
             where user_profile_id = ${fixture.profileSolo}`;
  await sql`update public.workspace_memberships
               set status = 'active', role = 'owner_admin'
             where user_profile_id = ${fixture.profileMulti}
               and workspace_id = ${fixture.workspaceOne}`;
};

afterEach(async () => {
  getAuthenticatedUser.mockReset();
  if (reachable) {
    H.active = single;
    await restoreMemberships();
  }
});

afterAll(async () => {
  if (reachable) {
    const sql = admin();
    const profiles = [fixture.profileSolo, fixture.profileMulti];
    const workspaces = [
      fixture.workspaceSolo,
      fixture.workspaceOne,
      fixture.workspaceTwo,
      fixture.workspaceInactive,
      fixture.workspaceForeign,
    ];
    await sql`delete from public.workspace_memberships
               where user_profile_id in ${sql(profiles)}`.catch(() => {});
    await sql`delete from public.user_profiles
               where id in ${sql(profiles)}`.catch(() => {});
    await sql`delete from public.workspaces
               where id in ${sql(workspaces)}`.catch(() => {});
    await sql`delete from auth.users
               where id in ${sql([fixture.authSolo, fixture.authMulti])}`.catch(
      () => {},
    );
  }
  await tooling?.end({ timeout: 2 }).catch(() => {});
  await single?.end({ timeout: 2 }).catch(() => {});
});

/** Resolve as `authUserId`, optionally naming a workspace. */
const resolveAs = async (authUserId: string, candidate?: unknown) => {
  getAuthenticatedUser.mockResolvedValue(signedIn(authUserId));
  return candidate === undefined
    ? resolveWorkspaceContext()
    : resolveWorkspaceContext(candidate);
};

const visibleWorkspaces = (tx: postgres.TransactionSql) =>
  tx`select id from public.workspaces` as unknown as Promise<{ id: string }[]>;

describe.skipIf(!reachable)("Phase 4B — the resolved context in use", () => {
  it("1. resolves a single membership automatically", async () => {
    const result = await resolveAs(fixture.authSolo);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.context.workspaceId).toBe(fixture.workspaceSolo);
    expect(result.context.userProfileId).toBe(fixture.profileSolo);
    expect(result.context.authUserId).toBe(fixture.authSolo);
    expect(result.role).toBe("owner_admin");
  });

  it("2/3. hands the tenant gateway a context it accepts, and 4. sees only that workspace", async () => {
    const result = await resolveAs(fixture.authSolo);
    if (result.kind !== "ok") throw new Error("expected ok");

    const visible = await withTenant(result.context, async (tx) =>
      (await visibleWorkspaces(tx)).map((row) => row.id),
    );
    // Exactly the selected workspace — not "the selected one first".
    expect(visible).toEqual([fixture.workspaceSolo]);
    expect(visible).not.toContain(fixture.workspaceForeign);
  });

  it("5. selects only the requested workspace when several are available", async () => {
    const one = await resolveAs(fixture.authMulti, fixture.workspaceOne);
    const two = await resolveAs(fixture.authMulti, fixture.workspaceTwo);
    if (one.kind !== "ok" || two.kind !== "ok") throw new Error("expected ok");

    expect(one.role).toBe("owner_admin");
    expect(two.role).toBe("staff_sales");

    const seenOne = await withTenant(one.context, async (tx) =>
      (await visibleWorkspaces(tx)).map((row) => row.id),
    );
    const seenTwo = await withTenant(two.context, async (tx) =>
      (await visibleWorkspaces(tx)).map((row) => row.id),
    );
    expect(seenOne).toEqual([fixture.workspaceOne]);
    expect(seenTwo).toEqual([fixture.workspaceTwo]);
  });

  it("6. never produces a context for a refused candidate", async () => {
    const refused = [
      fixture.workspaceForeign,
      fixture.workspaceInactive,
      crypto.randomUUID(),
      fixture.workspaceOne.toUpperCase(),
      ` ${fixture.workspaceOne}`,
      "",
      null,
      42,
    ];
    for (const candidate of refused) {
      const result = await resolveAs(fixture.authMulti, candidate);
      expect(`${String(candidate)} -> ${result.kind}`).toBe(
        `${String(candidate)} -> forbidden`,
      );
      expect(result).not.toHaveProperty("context");
    }
    // And with no candidate at all, it asks rather than picking.
    const asking = await resolveAs(fixture.authMulti);
    expect(asking.kind).toBe("workspace_selection_required");
  });
});

describe.skipIf(!reachable)(
  "Phase 4B — the database stays authoritative",
  () => {
    it("7. denies access when the membership is deactivated after resolution", async () => {
      const result = await resolveAs(fixture.authSolo);
      if (result.kind !== "ok") throw new Error("expected ok");

      // The context is already minted and still perfectly genuine.
      await admin()`update public.workspace_memberships
                     set status = 'inactive'
                   where user_profile_id = ${fixture.profileSolo}`;

      const visible = await withTenant(result.context, async (tx) =>
        (await visibleWorkspaces(tx)).map((row) => row.id),
      );
      // RLS re-checks the membership on the statement, not at mint time.
      expect(visible).toEqual([]);
    });

    it("8. does not let a stale role snapshot bypass the policy", async () => {
      const result = await resolveAs(fixture.authSolo);
      if (result.kind !== "ok") throw new Error("expected ok");
      // The application would render owner_admin controls from this snapshot.
      expect(result.role).toBe("owner_admin");

      await admin()`update public.workspace_memberships
                     set role = 'staff_sales'
                   where user_profile_id = ${fixture.profileSolo}`;

      const updated = await withTenant(result.context, async (tx) => {
        const rows = await tx`update public.workspaces
                               set name = ${`Renamed ${RUN}`}
                             where id = ${fixture.workspaceSolo}
                         returning id`;
        return rows.length;
      });
      // The owner_admin-only UPDATE policy refuses: zero rows, not an exception,
      // because the row is simply not visible to the write.
      expect(updated).toBe(0);

      const stored = await admin()`select name from public.workspaces
                                  where id = ${fixture.workspaceSolo}`;
      expect(first(stored as unknown as { name: string }[], "name").name).toBe(
        `Chain Solo WS ${RUN}`,
      );
    });

    it("9. leaves no context on the reused physical backend", async () => {
      const result = await resolveAs(fixture.authSolo);
      if (result.kind !== "ok") throw new Error("expected ok");

      const inside = await withTenant(result.context, async (tx) =>
        first(
          (await tx`select current_setting('app.workspace_id', true) as workspace,
                         pg_backend_pid()::text                    as backend`) as unknown as {
            workspace: string;
            backend: string;
          }[],
          "inside",
        ),
      );
      expect(inside.workspace).toBe(fixture.workspaceSolo);

      const after = first(
        (await single`
        select coalesce(current_setting('app.auth_user_id', true), '')    as auth,
               coalesce(current_setting('app.user_profile_id', true), '') as profile,
               coalesce(current_setting('app.workspace_id', true), '')    as workspace,
               pg_backend_pid()::text                                     as backend`) as unknown as {
          auth: string;
          profile: string;
          workspace: string;
          backend: string;
        }[],
        "after",
      );
      // A pool of one, so this is the same connection the transaction used.
      expect(after.backend).toBe(inside.backend);
      expect({
        auth: after.auth,
        profile: after.profile,
        workspace: after.workspace,
      }).toEqual({ auth: "", profile: "", workspace: "" });
    });

    it("10. surfaces a real database refusal without leaking credentials", async () => {
      const result = await resolveAs(fixture.authSolo);
      if (result.kind !== "ok") throw new Error("expected ok");

      // limenzy_app holds no INSERT grant on workspaces — this is the genuine
      // privilege error, not a simulated one.
      const error = await withTenant(result.context, async (tx) => {
        await tx`insert into public.workspaces (name, country, currency, time_zone)
               values (${`Nope ${RUN}`}, 'IN', 'INR', 'Asia/Kolkata')`;
        return undefined;
      }).then(
        () => undefined,
        (caught: unknown) => caught as Error,
      );

      expect(error).toBeInstanceOf(Error);
      const surface = `${error?.name} ${error?.message} ${String(error?.cause ?? "")}`;
      expect(surface).toMatch(/permission denied/i);
      for (const pattern of [
        /postgres(ql)?:\/\//,
        /password/i,
        /:\d{4,5}\//,
        /127\.0\.0\.1/,
      ]) {
        expect(surface).not.toMatch(pattern);
      }
    });
  },
);
