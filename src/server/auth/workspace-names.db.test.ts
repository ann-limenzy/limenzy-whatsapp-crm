// @vitest-environment node
import postgres from "postgres";
import { assertMatchedDatabaseTargets } from "../../../scripts/database-target.mjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Milestone 1C-C Phase 4D — chooser names, against a real database.
 *
 * The unit suite proves the shape of this code with the gateway doubled. This
 * one proves the part that only PostgreSQL can answer: that the per-workspace
 * contexts minted from a user's own memberships actually open
 * `public.workspaces` for exactly those rows and nothing else, under the
 * policies as applied — no tooling connection, no secret key, no definer
 * function anywhere in the path.
 *
 * Substitutions are the existing ones: the verified-authentication utility is
 * doubled to represent a signed-in user, and `runtimeSql()` returns a pool the
 * real factory built. The resolver, the gateway and the policies are real.
 *
 * Fixtures are synthetic, namespaced per run and removed in `afterAll` in
 * foreign-key-safe order, with the removal verified rather than assumed.
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

const { resolveNamedWorkspaceChoices } = await import("./workspace-names");

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
const runtimeProbe = await probe(RUNTIME);
await runtimeProbe?.end({ timeout: 1 }).catch(() => {});
const reachable = tooling !== undefined && runtimeProbe !== undefined;

/**
 * Mixed targets are a hard stop, not a skip.
 *
 * If both connections answer but name different databases, this suite would
 * create fixtures in one and assert against the other — and the writes would
 * still happen, possibly in a hosted project. Checked before the first fixture
 * exists, and deliberately not dependent on a container being stopped.
 */
if (reachable) assertMatchedDatabaseTargets(RUNTIME, TOOLING);

if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] Phase 4D chooser-name tests need both connections. Run "npm run db:start", ' +
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

let pool: postgres.Sql;

const fixture = {
  authUserId: "",
  profileId: "",
  /** Two active memberships, one inactive, and one that is not theirs. */
  workspaceOne: "",
  workspaceTwo: "",
  workspaceInactive: "",
  workspaceForeign: "",
};

const NAME_ONE = `Names One ${RUN}`;
const NAME_TWO = `Names Two ${RUN}`;
const NAME_INACTIVE = `Names Inactive ${RUN}`;
const NAME_FOREIGN = `Names Foreign ${RUN}`;

beforeAll(async () => {
  if (!reachable) return;
  pool = actualClient.createRuntimePool({ max: 2 });
  H.active = pool;
  const sql = admin();

  const rows = await sql`
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
            'authenticated', 'authenticated',
            ${`names-${RUN}@example.com`},
            'not-a-real-password-hash', now(), now())
    returning id`;
  fixture.authUserId = first(
    rows as unknown as { id: string }[],
    "auth user",
  ).id;

  const profile = await sql`
    insert into public.user_profiles (auth_user_id, full_name)
    values (${fixture.authUserId}, ${`Names Person ${RUN}`}) returning id`;
  fixture.profileId = first(
    profile as unknown as { id: string }[],
    "profile",
  ).id;

  const makeWorkspace = async (name: string) => {
    const created = await sql`
      insert into public.workspaces (name, country, currency, time_zone)
      values (${name}, 'IN', 'INR', 'Asia/Kolkata') returning id`;
    return first(created as unknown as { id: string }[], "workspace").id;
  };

  fixture.workspaceOne = await makeWorkspace(NAME_ONE);
  fixture.workspaceTwo = await makeWorkspace(NAME_TWO);
  fixture.workspaceInactive = await makeWorkspace(NAME_INACTIVE);
  fixture.workspaceForeign = await makeWorkspace(NAME_FOREIGN);

  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fixture.workspaceOne}, ${fixture.profileId}, 'owner_admin', 'active')`;
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fixture.workspaceTwo}, ${fixture.profileId}, 'staff_sales', 'active')`;
  await sql`insert into public.workspace_memberships
              (workspace_id, user_profile_id, role, status)
            values (${fixture.workspaceInactive}, ${fixture.profileId}, 'manager', 'inactive')`;
  // workspaceForeign deliberately has no membership for this user.
});

afterAll(async () => {
  const problems: string[] = [];

  if (reachable && fixture.profileId) {
    const sql = admin();
    const workspaces = [
      fixture.workspaceOne,
      fixture.workspaceTwo,
      fixture.workspaceInactive,
      fixture.workspaceForeign,
    ].filter(Boolean);

    try {
      // Foreign keys RESTRICT, so memberships go first.
      await sql`delete from public.workspace_memberships
                 where user_profile_id = ${fixture.profileId}`;
      await sql`delete from public.user_profiles where id = ${fixture.profileId}`;
      if (workspaces.length > 0) {
        await sql`delete from public.workspaces where id in ${sql(workspaces)}`;
      }
      await sql`delete from auth.users where id = ${fixture.authUserId}`;
    } catch (error) {
      problems.push(
        `delete failed (sqlstate ${(error as { code?: string }).code ?? "none"})`,
      );
    }

    // Verified, not assumed.
    try {
      const left = await sql<{ id: string }[]>`
        select id from public.workspaces where id in ${sql(workspaces)}`;
      if (left.length > 0) {
        problems.push(
          `workspaces still present: ${left.map((r) => r.id).join(", ")}`,
        );
      }
    } catch (error) {
      problems.push(
        `verify failed (sqlstate ${(error as { code?: string }).code ?? "none"})`,
      );
    }
  }

  await pool?.end({ timeout: 2 }).catch(() => {});
  await tooling?.end({ timeout: 2 }).catch(() => {});

  if (problems.length > 0) {
    throw new Error(
      `[workspace-names.db] fixture cleanup failed — ${problems.join("; ")}`,
    );
  }
});

const signedIn = () => {
  getAuthenticatedUser.mockResolvedValue({
    id: fixture.authUserId,
    email: `names-${RUN}@example.com`,
    emailVerified: true,
    fullName: `Names Person ${RUN}`,
  });
};

describe.skipIf(!reachable)("chooser names under row-level security", () => {
  it("returns a name for every active membership, and only those", async () => {
    signedIn();

    const result = await resolveNamedWorkspaceChoices();

    expect(result.kind).toBe("choices");
    if (result.kind !== "choices") return;

    const names = result.choices.map((c) => c.name).sort();
    expect(names).toEqual([NAME_ONE, NAME_TWO].sort());

    // The inactive membership and the workspace that is not theirs are both
    // absent — the policy requires an ACTIVE membership for the selected row.
    expect(names).not.toContain(NAME_INACTIVE);
    expect(names).not.toContain(NAME_FOREIGN);
  });

  it("carries the role from the membership row", async () => {
    signedIn();
    const result = await resolveNamedWorkspaceChoices();
    if (result.kind !== "choices") throw new Error("expected choices");

    const byName = new Map(result.choices.map((c) => [c.name, c.role]));
    expect(byName.get(NAME_ONE)).toBe("owner_admin");
    expect(byName.get(NAME_TWO)).toBe("staff_sales");
  });

  it("drops a workspace the moment its membership is deactivated", async () => {
    signedIn();
    const sql = admin();

    await sql`update public.workspace_memberships set status = 'inactive'
               where user_profile_id = ${fixture.profileId}
                 and workspace_id = ${fixture.workspaceTwo}`;
    try {
      const result = await resolveNamedWorkspaceChoices();
      if (result.kind !== "choices") throw new Error("expected choices");
      expect(result.choices.map((c) => c.name)).toEqual([NAME_ONE]);
    } finally {
      await sql`update public.workspace_memberships set status = 'active'
                 where user_profile_id = ${fixture.profileId}
                   and workspace_id = ${fixture.workspaceTwo}`;
    }
  });

  it("returns access_unavailable when every membership is deactivated", async () => {
    signedIn();
    const sql = admin();

    await sql`update public.workspace_memberships set status = 'inactive'
               where user_profile_id = ${fixture.profileId}`;
    try {
      // Not an empty list of choices, and emphatically not onboarding.
      expect((await resolveNamedWorkspaceChoices()).kind).toBe(
        "access_unavailable",
      );
    } finally {
      await sql`update public.workspace_memberships set status = 'active'
                 where user_profile_id = ${fixture.profileId}
                   and workspace_id in (${fixture.workspaceOne}, ${fixture.workspaceTwo})`;
    }
  });

  it("reads nothing at all for an unverified session", async () => {
    getAuthenticatedUser.mockResolvedValue(null);
    expect((await resolveNamedWorkspaceChoices()).kind).toBe("unauthenticated");
  });
});
