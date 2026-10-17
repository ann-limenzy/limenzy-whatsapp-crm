import type { Sql } from "postgres";

/**
 * A reusable two-workspace, multi-role tenancy — Milestone 1D.
 *
 * The build plan asks for "a two-workspace, multi-role test fixture, including
 * a user who is a member of both workspaces". That last part is the point: a
 * user present in exactly one workspace cannot demonstrate that switching
 * workspaces changes what they see, and most isolation bugs hide there rather
 * than in the obvious cross-tenant case.
 *
 * Shape:
 *
 *   workspace A                       workspace B
 *   ├── owner    owner_admin  active  │
 *   ├── manager  manager      active  │
 *   ├── shared   staff_sales  active  ├── shared   owner_admin  active
 *   └── former   manager      INACTIVE│
 *
 * `shared` is deliberately a different role in each workspace, so a test can
 * tell "the context changed" apart from "the role is remembered". `former`
 * exists because an inactive membership must behave as no membership at all,
 * which is a different thing from having no row.
 *
 * Every identifier is recorded as it is created, so `cleanup()` can remove
 * exactly what this run made — never by name, prefix or date — and verify each
 * one is gone. Nothing here resets a database or touches a row it did not
 * create.
 *
 * It is written for a TOOLING connection, which bypasses row-level security.
 * That is what lets it build a tenancy the runtime role could never build, and
 * it is why a fixture is never evidence that access control works: the proof
 * comes from reading the result back through the runtime role.
 */

export type TenantFixture = {
  readonly run: string;
  readonly workspaceA: string;
  readonly workspaceB: string;
  /** owner_admin of workspace A. */
  readonly owner: FixtureUser;
  /** manager of workspace A. */
  readonly manager: FixtureUser;
  /** staff_sales in A and owner_admin in B — active in both. */
  readonly shared: FixtureUser;
  /** manager of workspace A whose membership is inactive. */
  readonly former: FixtureUser;
  readonly membershipIds: readonly string[];
};

export type FixtureUser = {
  readonly authUserId: string;
  readonly userProfileId: string;
  readonly email: string;
};

type Recorded = {
  authUsers: string[];
  profiles: string[];
  workspaces: string[];
  memberships: string[];
};

/** Build the tenancy. The caller must call `cleanupTenantFixture` in a finally. */
export async function createTenantFixture(
  sql: Sql,
  run: string,
): Promise<{ fixture: TenantFixture; recorded: Recorded }> {
  const recorded: Recorded = {
    authUsers: [],
    profiles: [],
    workspaces: [],
    memberships: [],
  };

  const makeUser = async (label: string): Promise<FixtureUser> => {
    const email = `fixture-${run}-${label}@example.com`;
    const [authRow] = (await sql`
      insert into auth.users
        (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
              'authenticated', 'authenticated', ${email},
              'not-a-real-password-hash', now(), now())
      returning id`) as unknown as { id: string }[];
    recorded.authUsers.push(authRow!.id);

    const [profileRow] = (await sql`
      insert into public.user_profiles (auth_user_id, full_name)
      values (${authRow!.id}, ${`Fixture ${label} ${run}`})
      returning id`) as unknown as { id: string }[];
    recorded.profiles.push(profileRow!.id);

    return { authUserId: authRow!.id, userProfileId: profileRow!.id, email };
  };

  const makeWorkspace = async (label: string): Promise<string> => {
    const [row] = (await sql`
      insert into public.workspaces (name, country, currency, time_zone)
      values (${`Fixture ${label} ${run}`}, 'IN', 'INR', 'Asia/Kolkata')
      returning id`) as unknown as { id: string }[];
    recorded.workspaces.push(row!.id);
    return row!.id;
  };

  const makeMembership = async (
    workspaceId: string,
    userProfileId: string,
    role: "owner_admin" | "manager" | "staff_sales",
    status: "active" | "inactive",
  ): Promise<string> => {
    const [row] = (await sql.unsafe(
      `insert into public.workspace_memberships
         (workspace_id, user_profile_id, role, status)
       values ($1, $2, $3::public.workspace_role,
               $4::public.workspace_membership_status)
       returning id`,
      [workspaceId, userProfileId, role, status],
    )) as unknown as { id: string }[];
    recorded.memberships.push(row!.id);
    return row!.id;
  };

  const workspaceA = await makeWorkspace("WS A");
  const workspaceB = await makeWorkspace("WS B");

  const owner = await makeUser("owner");
  const manager = await makeUser("manager");
  const shared = await makeUser("shared");
  const former = await makeUser("former");

  await makeMembership(
    workspaceA,
    owner.userProfileId,
    "owner_admin",
    "active",
  );
  await makeMembership(workspaceA, manager.userProfileId, "manager", "active");
  // The shared user: active in BOTH, with a different role in each.
  await makeMembership(
    workspaceA,
    shared.userProfileId,
    "staff_sales",
    "active",
  );
  await makeMembership(
    workspaceB,
    shared.userProfileId,
    "owner_admin",
    "active",
  );
  await makeMembership(workspaceA, former.userProfileId, "manager", "inactive");

  return {
    fixture: {
      run,
      workspaceA,
      workspaceB,
      owner,
      manager,
      shared,
      former,
      membershipIds: [...recorded.memberships],
    },
    recorded,
  };
}

/**
 * Remove exactly what this run created, and prove it is gone.
 *
 * Foreign keys RESTRICT, so the order matters. Each identifier is read back
 * individually afterwards — one statement per row, so a read-back cannot fail
 * for a reason unrelated to whether the row is actually absent.
 *
 * Returns the problems rather than throwing, so a caller can report them
 * alongside the test results instead of losing them to a failing teardown.
 */
export async function cleanupTenantFixture(
  sql: Sql,
  recorded: Recorded,
): Promise<string[]> {
  const problems: string[] = [];

  const remove = async (label: string, run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      problems.push(
        `delete ${label}: ${(error as { code?: string })?.code ?? "error"}`,
      );
    }
  };

  for (const id of recorded.memberships) {
    await remove(
      `membership ${id}`,
      () => sql`delete from public.workspace_memberships where id = ${id}`,
    );
  }
  // Memberships the fixture did not create itself — an accepted invitation
  // writes one — are reached by workspace. Without this a suite that accepted
  // an invitation left its workspace and the inviter's profile behind.
  for (const id of recorded.workspaces) {
    await remove(
      `memberships of ${id}`,
      () =>
        sql`delete from public.workspace_memberships where workspace_id = ${id}`,
    );
  }
  // Invitations reference BOTH the workspace and the profile that issued
  // them, so a suite that issued one could delete neither. Scoped by
  // workspace: the rows are the fixture's own, whoever created them.
  for (const id of recorded.workspaces) {
    await remove(
      `invitations of ${id}`,
      () =>
        sql`delete from public.workspace_invitations where workspace_id = ${id}`,
    );
  }
  for (const id of recorded.profiles) {
    await remove(
      `profile ${id}`,
      () => sql`delete from public.user_profiles where id = ${id}`,
    );
  }
  // Milestone 3A: creating a workspace seeds its pipeline and its sources,
  // and both foreign keys RESTRICT, so those rows go before the workspace.
  // They are scoped by workspace rather than by recorded id because the
  // bootstrap routine, not the fixture, generated them.
  for (const id of recorded.workspaces) {
    await remove(
      `lead stages of ${id}`,
      () =>
        sql`delete from public.workspace_lead_stages where workspace_id = ${id}`,
    );
    await remove(
      `lead sources of ${id}`,
      () =>
        sql`delete from public.workspace_lead_sources where workspace_id = ${id}`,
    );
  }
  for (const id of recorded.workspaces) {
    await remove(
      `workspace ${id}`,
      () => sql`delete from public.workspaces where id = ${id}`,
    );
  }
  for (const id of recorded.authUsers) {
    await remove(
      `auth user ${id}`,
      () => sql`delete from auth.users where id = ${id}`,
    );
  }

  const absent = async (
    schema: string,
    table: string,
    ids: readonly string[],
  ) => {
    for (const id of ids) {
      try {
        const rows = (await sql.unsafe(
          `select 1 as present from ${schema}.${table} where id = $1`,
          [id],
        )) as unknown as unknown[];
        if (rows.length > 0)
          problems.push(`${schema}.${table} still holds ${id}`);
      } catch (error) {
        problems.push(
          `read-back ${schema}.${table} ${id}: ${(error as { code?: string })?.code ?? "error"}`,
        );
      }
    }
  };
  await absent("public", "workspace_memberships", recorded.memberships);
  await absent("public", "user_profiles", recorded.profiles);
  await absent("public", "workspaces", recorded.workspaces);
  await absent("auth", "users", recorded.authUsers);

  return problems;
}
