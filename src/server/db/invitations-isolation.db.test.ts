import { createHash, randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertMatchedDatabaseTargets } from "../../../scripts/database-target.mjs";
import {
  cleanupTenantFixture,
  createTenantFixture,
  type TenantFixture,
} from "@/test/fixtures/tenant-fixture";

/**
 * Milestone 2C — invitations (§159 Add User).
 *
 * The acceptance routine is the only write path in the product that runs for
 * a person with NO membership and possibly no profile, so most of what
 * matters here cannot be expressed as a policy and has to be proved against a
 * real database: the identity binding, single use under concurrency, the
 * preservation of an existing active membership, and the issuer's authority
 * being re-checked at the moment of acceptance rather than when they issued.
 */

const TOOLING = process.env.DRIZZLE_TOOLING_DATABASE_URL ?? "";
const RUNTIME = process.env.DATABASE_URL ?? "";
const REQUIRED = process.env.REQUIRE_DATABASE_TESTS === "1";

const probe = async (url: string) => {
  if (!url) return undefined;
  const sql = postgres(url, { max: 3, connect_timeout: 5, onnotice: () => {} });
  try {
    await sql`select 1`;
    return sql;
  } catch {
    await sql.end({ timeout: 1 }).catch(() => {});
    return undefined;
  }
};

const tooling = await probe(TOOLING);
const runtimeProbe = await probe(RUNTIME);
await runtimeProbe?.end({ timeout: 1 }).catch(() => {});
const reachable = tooling !== undefined && runtimeProbe !== undefined;

if (reachable) assertMatchedDatabaseTargets(RUNTIME, TOOLING);
if (!reachable && REQUIRED) {
  throw new Error(
    '[test:db] invitation isolation needs both connections. Run "npm run db:start", ' +
      '"npm run db:reset" and "npm run db:role:local".',
  );
}

const admin = () => {
  if (!tooling) throw new Error("no tooling connection");
  return tooling;
};

const RUN = randomUUID().slice(0, 8);
let fixture: TenantFixture;
let recorded: Awaited<ReturnType<typeof createTenantFixture>>["recorded"];
const extraProfiles: string[] = [];
const extraAuthUsers: string[] = [];

type Gateways = {
  createTenantContext: typeof import("./tenant-context").createTenantContext;
  pendingInvitations: typeof import("@/server/auth/workspace-invitations").pendingInvitations;
  createInvitation: typeof import("@/server/auth/workspace-invitations").createInvitation;
  regenerateInvitation: typeof import("@/server/auth/workspace-invitations").regenerateInvitation;
  revokeInvitation: typeof import("@/server/auth/workspace-invitations").revokeInvitation;
  runtimeSql: typeof import("./client").runtimeSql;
};
let g: Gateways;

beforeAll(async () => {
  if (!reachable) return;
  ({ fixture, recorded } = await createTenantFixture(admin(), RUN));
  const [context, invitations, client] = await Promise.all([
    import("./tenant-context"),
    import("@/server/auth/workspace-invitations"),
    import("./client"),
  ]);
  g = {
    createTenantContext: context.createTenantContext,
    pendingInvitations: invitations.pendingInvitations,
    createInvitation: invitations.createInvitation,
    regenerateInvitation: invitations.regenerateInvitation,
    revokeInvitation: invitations.revokeInvitation,
    runtimeSql: client.runtimeSql,
  };
}, 30_000);

afterAll(async () => {
  if (reachable && recorded) {
    // Invitations reference profiles, so they go before the fixture's own
    // rows; both foreign keys restrict.
    await admin()`
      delete from public.workspace_invitations
       where workspace_id = any(${recorded.workspaces})`.catch(() => {});
    for (const id of extraProfiles) {
      await admin()`delete from public.workspace_memberships where user_profile_id = ${id}`.catch(
        () => {},
      );
      await admin()`delete from public.user_profiles where id = ${id}`.catch(
        () => {},
      );
    }
    for (const id of extraAuthUsers) {
      await admin()`delete from auth.users where id = ${id}`.catch(() => {});
    }
    const problems = await cleanupTenantFixture(admin(), recorded);
    if (problems.length > 0) {
      console.error("[invitations isolation] cleanup problems:", problems);
    }
  }
  try {
    if (g?.runtimeSql) await g.runtimeSql().end({ timeout: 5 });
  } catch {
    /* already closed */
  }
  await tooling?.end({ timeout: 5 }).catch(() => {});
}, 30_000);

const ctx = (
  user: { authUserId: string; userProfileId: string },
  workspace: string,
) =>
  g.createTenantContext({
    authUserId: user.authUserId,
    userProfileId: user.userProfileId,
    workspaceId: workspace,
  });

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const inSevenDays = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

/** A token and its hash, as the action would produce them. */
const token = () => {
  const plain = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  return { plain, hash: sha256(plain) };
};

/** An Auth user with no profile, to stand for a brand-new invitee. */
const newcomer = async (label: string) => {
  const email = `invitee-${RUN}-${label}@example.com`;
  const [row] = (await admin()`
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
            'authenticated', 'authenticated', ${email},
            'not-a-real-password-hash', now(), now())
    returning id`) as unknown as { id: string }[];
  extraAuthUsers.push(row!.id);
  return { authUserId: row!.id, email };
};

/** Call the acceptance routine the way `acceptInvitation()` does. */
const accept = async (
  authUserId: string,
  email: string,
  hash: string,
  fullName: string | null = "Invited Person",
) => {
  const rows = await g.runtimeSql().begin(async (tx) => {
    await tx`select set_config('app.auth_user_id', ${authUserId}, true)`;
    return tx<{ outcome: string }[]>`
      select app.accept_workspace_invitation(
        ${hash}, null::uuid, ${email}, ${fullName}) as outcome`;
  });
  return rows[0]?.outcome;
};

/** A second active Owner/Admin of workspace A, for the hand-over tests. */
const extraOwnerAdmin = async (label: string) => {
  const email = `second-admin-${RUN}-${label}@example.com`;
  const [user] = (await admin()`
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
            'authenticated', 'authenticated', ${email},
            'not-a-real-password-hash', now(), now())
    returning id`) as unknown as { id: string }[];
  extraAuthUsers.push(user!.id);

  const [profile] = (await admin()`
    insert into public.user_profiles (auth_user_id, full_name)
    values (${user!.id}, ${`Second Admin ${label} ${RUN}`})
    returning id`) as unknown as { id: string }[];
  extraProfiles.push(profile!.id);

  await admin().unsafe(
    `insert into public.workspace_memberships
       (workspace_id, user_profile_id, role, status)
     values ($1, $2, 'owner_admin'::public.workspace_role,
             'active'::public.workspace_membership_status)`,
    [fixture.workspaceA, profile!.id],
  );
  return { authUserId: user!.id, userProfileId: profile!.id, email };
};

/** Exactly the lock `app.accept_workspace_invitation` takes, held open. */
const OWNER_ADMIN_LOCK = `select 1 from public.workspace_memberships
   where workspace_id = $1
     and role   = 'owner_admin'::public.workspace_role
     and status = 'active'::public.workspace_membership_status
   order by user_profile_id
     for update`;

const RESTORE_OWNER = `update public.workspace_memberships
     set role = 'owner_admin'::public.workspace_role,
         status = 'active'::public.workspace_membership_status
   where workspace_id = $1 and user_profile_id = $2`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The recovery path: redeem by invitation id, with no token at all. */
const acceptById = async (
  authUserId: string,
  email: string,
  invitationId: string,
) => {
  const rows = await g.runtimeSql().begin(async (tx) => {
    await tx`select set_config('app.auth_user_id', ${authUserId}, true)`;
    return tx<{ outcome: string }[]>`
      select app.accept_workspace_invitation(
        null, ${invitationId}::uuid, ${email}, 'Invited Person') as outcome`;
  });
  return rows[0]?.outcome;
};

const storedInvitation = async (hash: string) => {
  const [row] = (await admin()`
    select id, email, role::text as role, revoked_at, redeemed_at, redeemed_by,
           created_by, expires_at, workspace_id
      from public.workspace_invitations where token_hash = ${hash}`) as unknown as {
    id: string;
    email: string;
    role: string;
    revoked_at: Date | null;
    redeemed_at: Date | null;
    redeemed_by: string | null;
    created_by: string;
    expires_at: Date;
    workspace_id: string;
  }[];
  return row;
};

const membership = async (workspaceId: string, profileId: string) => {
  const [row] = (await admin()`
    select role::text as role, status::text as status
      from public.workspace_memberships
     where workspace_id = ${workspaceId} and user_profile_id = ${profileId}`) as unknown as {
    role: string;
    status: string;
  }[];
  return row;
};

const profileFor = async (authUserId: string) => {
  const [row] = (await admin()`
    select id, full_name from public.user_profiles
     where auth_user_id = ${authUserId}`) as unknown as {
    id: string;
    full_name: string;
  }[];
  if (row && !extraProfiles.includes(row.id)) extraProfiles.push(row.id);
  return row;
};

describe.skipIf(!reachable)("who may administer invitations", () => {
  it("lets an Owner/Admin create one", async () => {
    const t = token();
    const result = await g.createInvitation(
      ctx(fixture.owner, fixture.workspaceA),
      {
        email: `create-${RUN}@example.com`,
        role: "manager",
        invitedName: "Created",
        tokenHash: t.hash,
        expiresAt: inSevenDays(),
      },
    );
    expect(result).toMatchObject({
      ok: true,
      id: expect.any(String),
      email: expect.any(String),
    });
    const stored = await storedInvitation(t.hash);
    expect(stored?.workspace_id).toBe(fixture.workspaceA);
    expect(stored?.role).toBe("manager");
  });

  it.each([
    ["a manager", "manager"],
    ["a staff_sales member", "shared"],
    ["an inactive membership", "former"],
  ] as const)("refuses %s", async (_label, who) => {
    const t = token();
    const result = await g.createInvitation(
      ctx(fixture[who], fixture.workspaceA),
      {
        email: `refused-${RUN}-${who}@example.com`,
        role: "staff_sales",
        invitedName: null,
        tokenHash: t.hash,
        expiresAt: inSevenDays(),
      },
    );
    expect(result).toEqual({ ok: false, reason: "not_permitted" });
    expect(await storedInvitation(t.hash)).toBeUndefined();
  });

  it("stores no plaintext token anywhere in the row", async () => {
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: `hash-${RUN}@example.com`,
      role: "staff_sales",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });
    const [row] = (await admin()`
      select to_jsonb(i) as row from public.workspace_invitations i
       where token_hash = ${t.hash}`) as unknown as { row: unknown }[];
    expect(JSON.stringify(row?.row)).not.toContain(t.plain);
  });

  it("shows an Owner/Admin only their own workspace's invitations", async () => {
    const t = token();
    await g.createInvitation(ctx(fixture.shared, fixture.workspaceB), {
      email: `b-only-${RUN}@example.com`,
      role: "manager",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });

    const inA = await g.pendingInvitations(
      ctx(fixture.owner, fixture.workspaceA),
    );
    const inB = await g.pendingInvitations(
      ctx(fixture.shared, fixture.workspaceB),
    );
    expect(inA.some((i) => i.email === `b-only-${RUN}@example.com`)).toBe(
      false,
    );
    expect(inB.map((i) => i.email)).toEqual([`b-only-${RUN}@example.com`]);
  });

  it.each([
    ["a manager", "manager"],
    ["a staff_sales member", "shared"],
  ] as const)("shows %s nothing at all", async (_label, who) => {
    expect(
      await g.pendingInvitations(ctx(fixture[who], fixture.workspaceA)),
    ).toHaveLength(0);
  });

  it("refuses a second live invitation for the same address", async () => {
    const email = `dup-${RUN}@example.com`;
    const first = await g.createInvitation(
      ctx(fixture.owner, fixture.workspaceA),
      {
        email,
        role: "manager",
        invitedName: null,
        tokenHash: token().hash,
        expiresAt: inSevenDays(),
      },
    );
    expect(first).toMatchObject({
      ok: true,
      id: expect.any(String),
      email: expect.any(String),
    });

    const second = await g.createInvitation(
      ctx(fixture.owner, fixture.workspaceA),
      {
        email,
        role: "staff_sales",
        invitedName: null,
        tokenHash: token().hash,
        expiresAt: inSevenDays(),
      },
    );
    expect(second).toEqual({ ok: false, reason: "already_invited" });
  });

  it("lets an EXPIRED invitation be replaced by a fresh one", async () => {
    const email = `expired-${RUN}@example.com`;
    const old = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email,
      role: "manager",
      invitedName: null,
      tokenHash: old.hash,
      expiresAt: inSevenDays(),
    });
    // Age the whole row, not just its expiry: the check constraint requires
    // expires_at > created_at, so an invitation cannot be born expired.
    await admin()`
      update public.workspace_invitations
         set created_at = now() - interval '8 days',
             expires_at = now() - interval '1 day'
       where token_hash = ${old.hash}`;

    const fresh = token();
    const result = await g.createInvitation(
      ctx(fixture.owner, fixture.workspaceA),
      {
        email,
        role: "staff_sales",
        invitedName: null,
        tokenHash: fresh.hash,
        expiresAt: inSevenDays(),
      },
    );
    // The expired one must not stand in the way, and it is superseded rather
    // than deleted so the record of who invited whom survives.
    expect(result).toMatchObject({
      ok: true,
      id: expect.any(String),
      email: expect.any(String),
    });
    expect((await storedInvitation(old.hash))?.revoked_at).not.toBeNull();
    expect((await storedInvitation(fresh.hash))?.revoked_at).toBeNull();
  });

  it("regenerating replaces the token and restarts the clock", async () => {
    const email = `regen-${RUN}@example.com`;
    const first = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email,
      role: "manager",
      invitedName: null,
      tokenHash: first.hash,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const before = await storedInvitation(first.hash);

    const second = token();
    const later = inSevenDays();
    const result = await g.regenerateInvitation(
      ctx(fixture.owner, fixture.workspaceA),
      before!.id,
      second.hash,
      later,
    );
    expect(result).toMatchObject({
      ok: true,
      id: expect.any(String),
      email: expect.any(String),
    });

    // One row, a new hash, a later expiry — and the previous token is gone.
    expect(await storedInvitation(first.hash)).toBeUndefined();
    const after = await storedInvitation(second.hash);
    expect(after?.id).toBe(before!.id);
    expect(after!.expires_at.getTime()).toBeGreaterThan(
      before!.expires_at.getTime(),
    );
  });

  it("refuses a manager regenerating or revoking", async () => {
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: `guard-${RUN}@example.com`,
      role: "manager",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });
    const stored = await storedInvitation(t.hash);

    expect(
      await g.regenerateInvitation(
        ctx(fixture.manager, fixture.workspaceA),
        stored!.id,
        token().hash,
        inSevenDays(),
      ),
    ).toEqual({ ok: false, reason: "not_permitted" });
    expect(
      await g.revokeInvitation(
        ctx(fixture.manager, fixture.workspaceA),
        stored!.id,
      ),
    ).toEqual({ ok: false, reason: "not_permitted" });
    // Untouched.
    expect((await storedInvitation(t.hash))?.revoked_at).toBeNull();
  });

  it("refuses an Owner/Admin of another workspace", async () => {
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: `cross-${RUN}@example.com`,
      role: "manager",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });
    const stored = await storedInvitation(t.hash);

    // The shared user is owner_admin of B. That confers nothing in A.
    expect(
      await g.revokeInvitation(
        ctx(fixture.shared, fixture.workspaceB),
        stored!.id,
      ),
    ).toEqual({ ok: false, reason: "not_permitted" });
    expect((await storedInvitation(t.hash))?.revoked_at).toBeNull();
  });

  it("grants the runtime role exactly the invitation columns it needs", async () => {
    /*
     * Pinned by column, because `created_by` was added to this list on
     * purpose — regeneration re-issues an invitation in the caller's name —
     * and the next widening should be a decision rather than a diff nobody
     * reads. `redeemed_at` and `redeemed_by` are deliberately absent: only
     * the acceptance routine closes an invitation.
     */
    const rows = (await admin()`
      select privilege_type, column_name
        from information_schema.column_privileges
       where grantee = 'limenzy_app'
         and table_schema = 'public'
         and table_name = 'workspace_invitations'
       order by privilege_type, column_name`) as unknown as {
      privilege_type: string;
      column_name: string;
    }[];

    const byPrivilege = new Map<string, string[]>();
    for (const row of rows) {
      byPrivilege.set(row.privilege_type, [
        ...(byPrivilege.get(row.privilege_type) ?? []),
        row.column_name,
      ]);
    }

    expect(byPrivilege.get("INSERT")).toEqual([
      "created_by",
      "email",
      "expires_at",
      "id",
      "invited_name",
      "role",
      "token_hash",
      "workspace_id",
    ]);
    expect(byPrivilege.get("UPDATE")).toEqual([
      "created_by",
      "expires_at",
      "invited_name",
      "revoked_at",
      "role",
      "token_hash",
    ]);
    expect(byPrivilege.get("DELETE")).toBeUndefined();
  });

  it("gives the runtime role no DELETE on invitations", async () => {
    let code = "";
    try {
      await g.runtimeSql()`delete from public.workspace_invitations`;
    } catch (error) {
      code = String((error as { code?: string })?.code ?? "");
    }
    // §177: an invitation is revoked, never removed.
    expect(code).toBe("42501");
  });
});

describe.skipIf(!reachable)("accepting an invitation", () => {
  it("creates a profile and a membership for a brand-new account", async () => {
    const person = await newcomer("fresh");
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: person.email,
      role: "manager",
      invitedName: "Suggested Name",
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });

    expect(
      await accept(person.authUserId, person.email, t.hash, "Their Own Name"),
    ).toBe("joined");

    const profile = await profileFor(person.authUserId);
    expect(profile).toBeDefined();
    // Their own name wins over the invitation's suggestion.
    expect(profile?.full_name).toBe("Their Own Name");
    expect(await membership(fixture.workspaceA, profile!.id)).toEqual({
      role: "manager",
      status: "active",
    });
    // Single use.
    expect((await storedInvitation(t.hash))?.redeemed_at).not.toBeNull();
  });

  it("falls back to the invitation's name only when there is none of their own", async () => {
    const person = await newcomer("noname");
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: person.email,
      role: "staff_sales",
      invitedName: "Invitation Name",
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });
    expect(await accept(person.authUserId, person.email, t.hash, null)).toBe(
      "joined",
    );
    expect((await profileFor(person.authUserId))?.full_name).toBe(
      "Invitation Name",
    );
  });

  it("never overwrites an existing profile's name", async () => {
    const t = token();
    const email = `existing-${RUN}@example.com`;
    await admin()`
      update auth.users set email = ${email} where id = ${fixture.former.authUserId}`;
    await g
      .createInvitation(ctx(fixture.owner, fixture.workspaceB), {
        email,
        role: "manager",
        invitedName: "Should Not Appear",
        tokenHash: t.hash,
        expiresAt: inSevenDays(),
      })
      .catch(() => undefined);
    // The owner is not an Owner/Admin of B, so create the row from tooling.
    await admin().unsafe(
      `insert into public.workspace_invitations
         (workspace_id, email, role, invited_name, token_hash, expires_at, created_by)
       values ($1, $2, 'manager'::public.workspace_role, 'Should Not Appear', $3,
               now() + interval '7 days', $4)
       on conflict do nothing`,
      [fixture.workspaceB, email, t.hash, fixture.shared.userProfileId],
    );

    const before = (await admin()`
      select full_name from public.user_profiles
       where id = ${fixture.former.userProfileId}`) as unknown as {
      full_name: string;
    }[];
    expect(
      await accept(fixture.former.authUserId, email, t.hash, "Ignored Too"),
    ).toBe("joined");
    const after = (await admin()`
      select full_name from public.user_profiles
       where id = ${fixture.former.userProfileId}`) as unknown as {
      full_name: string;
    }[];
    expect(after[0]?.full_name).toBe(before[0]?.full_name);
  });

  it("refuses when the verified address is not the invited one", async () => {
    const person = await newcomer("mismatch");
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: person.email,
      role: "manager",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });

    expect(
      await accept(
        person.authUserId,
        `someone-else-${RUN}@example.com`,
        t.hash,
      ),
    ).toBe("email_mismatch");
    expect(await profileFor(person.authUserId)).toBeUndefined();
    expect((await storedInvitation(t.hash))?.redeemed_at).toBeNull();
  });

  it.each([
    ["an unknown token", "unknown"],
    ["a revoked invitation", "revoked"],
    ["an expired invitation", "expired"],
    ["one already redeemed", "redeemed"],
  ] as const)("reports %s as simply invalid", async (_label, kind) => {
    const person = await newcomer(`invalid-${kind}`);
    const t = token();

    if (kind !== "unknown") {
      await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
        email: person.email,
        role: "manager",
        invitedName: null,
        tokenHash: t.hash,
        expiresAt: inSevenDays(),
      });
      if (kind === "revoked") {
        await admin()`
          update public.workspace_invitations set revoked_at = now()
           where token_hash = ${t.hash}`;
      } else if (kind === "expired") {
        await admin()`
          update public.workspace_invitations
             set created_at = now() - interval '8 days',
                 expires_at = now() - interval '1 hour'
           where token_hash = ${t.hash}`;
      } else {
        await accept(person.authUserId, person.email, t.hash);
      }
    }

    const outcome = await accept(person.authUserId, person.email, t.hash);
    // One word for all four: the caller learns nothing about which workspace
    // exists, or whether a token was ever real.
    expect(outcome).toBe("invalid");
  });

  it("accepts by invitation id when the continuation was lost", async () => {
    const person = await newcomer("by-id");
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: person.email,
      role: "manager",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });
    const stored = await storedInvitation(t.hash);

    expect(await acceptById(person.authUserId, person.email, stored!.id)).toBe(
      "joined",
    );
    const profile = await profileFor(person.authUserId);
    expect((await membership(fixture.workspaceA, profile!.id))?.role).toBe(
      "manager",
    );
  });

  it("tells the id path nothing when the address does not match", async () => {
    /*
     * An invitation id is not a secret, so answering 'email_mismatch' here
     * would confirm that a live invitation exists for an id somebody simply
     * supplied. The token path still says 'email_mismatch', because holding
     * the token already proves that much and the message is what helps.
     */
    const person = await newcomer("by-id-mismatch");
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: person.email,
      role: "manager",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });
    const stored = await storedInvitation(t.hash);
    const wrong = `someone-else-${RUN}@example.com`;

    expect(await acceptById(person.authUserId, wrong, stored!.id)).toBe(
      "invalid",
    );
    expect(await accept(person.authUserId, wrong, t.hash)).toBe(
      "email_mismatch",
    );
    expect((await storedInvitation(t.hash))?.redeemed_at).toBeNull();
  });

  it("survives two first-time acceptances racing to create one profile", async () => {
    /*
     * `user_profiles.auth_user_id` is UNIQUE. Two invitations to the same new
     * person, in two workspaces, accepted at the same moment: both find no
     * profile and both insert. Without ON CONFLICT the loser raises 23505 out
     * of a SECURITY DEFINER routine — an unexplained failure rather than one
     * of this routine's words.
     */
    const person = await newcomer("profile-race");
    const a = token();
    const b = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: person.email,
      role: "manager",
      invitedName: null,
      tokenHash: a.hash,
      expiresAt: inSevenDays(),
    });
    await g.createInvitation(ctx(fixture.shared, fixture.workspaceB), {
      email: person.email,
      role: "staff_sales",
      invitedName: null,
      tokenHash: b.hash,
      expiresAt: inSevenDays(),
    });

    const outcomes = await Promise.all([
      accept(person.authUserId, person.email, a.hash),
      accept(person.authUserId, person.email, b.hash),
    ]);

    expect(outcomes.every((outcome) => outcome === "joined")).toBe(true);

    // Exactly one profile, and a membership in each workspace.
    const counted = (await admin()`
      select count(*)::int as n from public.user_profiles
       where auth_user_id = ${person.authUserId}`) as unknown as {
      n: number;
    }[];
    expect(counted[0]?.n).toBe(1);

    const profile = await profileFor(person.authUserId);
    expect((await membership(fixture.workspaceA, profile!.id))?.role).toBe(
      "manager",
    );
    expect((await membership(fixture.workspaceB, profile!.id))?.role).toBe(
      "staff_sales",
    );
  });

  it("refuses when the issuer is no longer an Owner/Admin", async () => {
    const person = await newcomer("inviter-demoted");
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: person.email,
      role: "manager",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });

    await admin().unsafe(
      `update public.workspace_memberships
          set role = 'manager'::public.workspace_role
        where workspace_id = $1 and user_profile_id = $2`,
      [fixture.workspaceA, fixture.owner.userProfileId],
    );
    try {
      expect(await accept(person.authUserId, person.email, t.hash)).toBe(
        "inviter_not_permitted",
      );
      // Deliberately NOT redeemed: somebody who does hold the authority can
      // still revoke or re-issue it.
      expect((await storedInvitation(t.hash))?.redeemed_at).toBeNull();
      expect(await profileFor(person.authUserId)).toBeUndefined();
    } finally {
      await admin().unsafe(
        `update public.workspace_memberships
            set role = 'owner_admin'::public.workspace_role
          where workspace_id = $1 and user_profile_id = $2`,
        [fixture.workspaceA, fixture.owner.userProfileId],
      );
    }
  });

  /*
   * The race the Owner/Admin lock exists for.
   *
   * Each of these holds EXACTLY the lock the routine takes, starts an
   * acceptance, proves it is WAITING rather than proceeding on a stale
   * reading, then removes the issuer's authority and commits. The acceptance
   * must come back refused, having written nothing.
   *
   * Deterministic by construction: the ordering is enforced by the lock, not
   * by sleeping and hoping. The delay only proves the wait — without the
   * lock the acceptance resolves immediately and the assertion fails.
   */
  it.each([
    [
      "demoted",
      `update public.workspace_memberships
          set role = 'manager'::public.workspace_role
        where workspace_id = $1 and user_profile_id = $2`,
    ],
    [
      "deactivated",
      `update public.workspace_memberships
          set status = 'inactive'::public.workspace_membership_status
        where workspace_id = $1 and user_profile_id = $2`,
    ],
  ] as const)(
    "refuses an acceptance in flight when the issuer is %s",
    async (label, removeAuthority) => {
      const person = await newcomer(`race-${label}`);
      const t = token();
      await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
        email: person.email,
        role: "manager",
        invitedName: null,
        tokenHash: t.hash,
        expiresAt: inSevenDays(),
      });

      let settled = false;
      let accepting: Promise<string | undefined> | undefined;
      try {
        await admin().begin(async (hold) => {
          await hold.unsafe(OWNER_ADMIN_LOCK, [fixture.workspaceA]);

          // Starts, and must then WAIT on the lock this transaction holds.
          accepting = accept(person.authUserId, person.email, t.hash).then(
            (outcome) => {
              settled = true;
              return outcome;
            },
          );
          accepting.catch(() => {
            /* asserted below */
          });

          await delay(500);
          expect(
            settled,
            "acceptance did not wait for the Owner/Admin lock — it read the " +
              "issuer's authority from a stale snapshot",
          ).toBe(false);

          // The authority disappears, and this transaction commits as the
          // callback returns.
          await hold.unsafe(removeAuthority, [
            fixture.workspaceA,
            fixture.owner.userProfileId,
          ]);
        });

        expect(await accepting).toBe("inviter_not_permitted");

        // Nothing was written: no profile, no membership, and the invitation
        // is still pending so somebody with authority can rescue it.
        expect(await profileFor(person.authUserId)).toBeUndefined();
        expect((await storedInvitation(t.hash))?.redeemed_at).toBeNull();
        expect((await storedInvitation(t.hash))?.revoked_at).toBeNull();
      } finally {
        await admin().unsafe(RESTORE_OWNER, [
          fixture.workspaceA,
          fixture.owner.userProfileId,
        ]);
      }
    },
  );

  it("does not reactivate a lapsed membership when the issuer loses authority mid-flight", async () => {
    // A refusal must leave an INACTIVE membership inactive, not restore it.
    const email = `race-lapsed-${RUN}@example.com`;
    await admin()`
      update auth.users set email = ${email}
       where id = ${fixture.former.authUserId}`;
    await admin().unsafe(
      `update public.workspace_memberships
          set role = 'staff_sales'::public.workspace_role,
              status = 'inactive'::public.workspace_membership_status
        where workspace_id = $1 and user_profile_id = $2`,
      [fixture.workspaceA, fixture.former.userProfileId],
    );

    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email,
      role: "manager",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });

    let accepting: Promise<string | undefined> | undefined;
    try {
      await admin().begin(async (hold) => {
        await hold.unsafe(OWNER_ADMIN_LOCK, [fixture.workspaceA]);
        accepting = accept(fixture.former.authUserId, email, t.hash);
        accepting.catch(() => {});
        await delay(400);
        await hold.unsafe(
          `update public.workspace_memberships
              set status = 'inactive'::public.workspace_membership_status
            where workspace_id = $1 and user_profile_id = $2`,
          [fixture.workspaceA, fixture.owner.userProfileId],
        );
      });

      expect(await accepting).toBe("inviter_not_permitted");

      const after = await membership(
        fixture.workspaceA,
        fixture.former.userProfileId,
      );
      expect(after?.status).toBe("inactive");
      expect(after?.role).toBe("staff_sales");
      expect((await storedInvitation(t.hash))?.redeemed_at).toBeNull();
    } finally {
      await admin().unsafe(RESTORE_OWNER, [
        fixture.workspaceA,
        fixture.owner.userProfileId,
      ]);
    }
  });

  it("lets another Owner/Admin re-issue an invitation whose issuer lost authority", async () => {
    /*
     * Without re-attribution this invitation is permanently dead while
     * looking live: acceptance re-checks the ISSUER, so a fresh link from a
     * demoted issuer would fail exactly as the old one did.
     */
    const second = await extraOwnerAdmin("reissue");
    const person = await newcomer("reissue");
    const first = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: person.email,
      role: "manager",
      invitedName: null,
      tokenHash: first.hash,
      expiresAt: inSevenDays(),
    });
    const invitationId = (await storedInvitation(first.hash))!.id;

    try {
      await admin().unsafe(
        `update public.workspace_memberships
            set role = 'manager'::public.workspace_role
          where workspace_id = $1 and user_profile_id = $2`,
        [fixture.workspaceA, fixture.owner.userProfileId],
      );

      // Dead, as designed.
      expect(await accept(person.authUserId, person.email, first.hash)).toBe(
        "inviter_not_permitted",
      );

      // The second administrator takes it over.
      const reissuedToken = token();
      expect(
        await g.regenerateInvitation(
          ctx(second, fixture.workspaceA),
          invitationId,
          reissuedToken.hash,
          inSevenDays(),
        ),
      ).toMatchObject({
        ok: true,
        id: expect.any(String),
        email: expect.any(String),
      });

      expect((await storedInvitation(reissuedToken.hash))?.created_by).toBe(
        second.userProfileId,
      );

      // And now it works.
      expect(
        await accept(person.authUserId, person.email, reissuedToken.hash),
      ).toBe("joined");
    } finally {
      await admin().unsafe(RESTORE_OWNER, [
        fixture.workspaceA,
        fixture.owner.userProfileId,
      ]);
    }
  });

  it("refuses to attribute an invitation to anybody but the caller", async () => {
    // The guard a row-level WITH CHECK cannot express: it sees only the new
    // row, so it cannot tell a change from a value left alone.
    const person = await newcomer("attribution");
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: person.email,
      role: "manager",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });
    const invitationId = (await storedInvitation(t.hash))!.id;

    await expect(
      admin().begin(async (tx) => {
        await tx`set local role limenzy_app`;
        await tx`select set_config('app.auth_user_id', ${fixture.owner.authUserId}, true)`;
        await tx`select set_config('app.user_profile_id', ${fixture.owner.userProfileId}, true)`;
        await tx`select set_config('app.workspace_id', ${fixture.workspaceA}, true)`;
        return tx.unsafe(
          `update public.workspace_invitations set created_by = $2 where id = $1`,
          [invitationId, fixture.manager.userProfileId],
        );
      }),
    ).rejects.toMatchObject({ code: "42501" });

    expect((await storedInvitation(t.hash))?.created_by).toBe(
      fixture.owner.userProfileId,
    );
  });

  it("still lets an invitation from a demoted issuer be revoked", async () => {
    // Revoking is NOT re-attributed: the record of who invited whom survives
    // (§177), and withdrawal must stay available to anyone with authority.
    const second = await extraOwnerAdmin("revoke");
    const person = await newcomer("revoke-demoted");
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: person.email,
      role: "manager",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });
    const invitationId = (await storedInvitation(t.hash))!.id;

    try {
      await admin().unsafe(
        `update public.workspace_memberships
            set role = 'manager'::public.workspace_role
          where workspace_id = $1 and user_profile_id = $2`,
        [fixture.workspaceA, fixture.owner.userProfileId],
      );

      expect(
        await g.revokeInvitation(ctx(second, fixture.workspaceA), invitationId),
      ).toMatchObject({
        ok: true,
        id: expect.any(String),
        email: expect.any(String),
      });

      const row = await storedInvitation(t.hash);
      expect(row?.revoked_at).not.toBeNull();
      // Unchanged: the original issuer is still on the record.
      expect(row?.created_by).toBe(fixture.owner.userProfileId);
    } finally {
      await admin().unsafe(RESTORE_OWNER, [
        fixture.workspaceA,
        fixture.owner.userProfileId,
      ]);
    }
  });

  it("reactivates an INACTIVE membership at the invited role", async () => {
    const email = `reactivate-${RUN}@example.com`;
    await admin()`
      update auth.users set email = ${email} where id = ${fixture.former.authUserId}`;
    await admin().unsafe(
      `update public.workspace_memberships
          set status = 'inactive'::public.workspace_membership_status,
              role = 'manager'::public.workspace_role
        where workspace_id = $1 and user_profile_id = $2`,
      [fixture.workspaceA, fixture.former.userProfileId],
    );

    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email,
      role: "staff_sales",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });

    expect(await accept(fixture.former.authUserId, email, t.hash)).toBe(
      "reactivated",
    );
    expect(
      await membership(fixture.workspaceA, fixture.former.userProfileId),
    ).toEqual({ role: "staff_sales", status: "active" });
  });

  it("leaves an ACTIVE membership exactly as it was", async () => {
    // The rule that matters most: an old invitation must never rewrite a role
    // somebody holds now.
    const email = `active-${RUN}@example.com`;
    await admin()`
      update auth.users set email = ${email} where id = ${fixture.manager.authUserId}`;
    const before = await membership(
      fixture.workspaceA,
      fixture.manager.userProfileId,
    );

    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email,
      role: "staff_sales",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });

    expect(await accept(fixture.manager.authUserId, email, t.hash)).toBe(
      "already_member",
    );
    expect(
      await membership(fixture.workspaceA, fixture.manager.userProfileId),
    ).toEqual(before);
    // The invitation is still used up, so the link cannot be replayed.
    expect((await storedInvitation(t.hash))?.redeemed_at).not.toBeNull();
  });

  it("is single-use under two simultaneous acceptances", async () => {
    const person = await newcomer("race");
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: person.email,
      role: "manager",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });

    const [a, b] = await Promise.all([
      accept(person.authUserId, person.email, t.hash),
      accept(person.authUserId, person.email, t.hash),
    ]);

    // Exactly one succeeds; the other finds a redeemed row behind the lock.
    expect([a, b].filter((o) => o === "joined")).toHaveLength(1);
    expect([a, b].filter((o) => o === "invalid")).toHaveLength(1);

    const [count] = (await admin()`
      select count(*)::int as n from public.workspace_memberships m
       join public.user_profiles p on p.id = m.user_profile_id
      where p.auth_user_id = ${person.authUserId}`) as unknown as {
      n: number;
    }[];
    expect(count?.n).toBe(1);
    await profileFor(person.authUserId);
  });

  it("refuses with no verified identity in the transaction", async () => {
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: `noident-${RUN}@example.com`,
      role: "manager",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });
    const rows = await g.runtimeSql()<{ outcome: string }[]>`
      select app.accept_workspace_invitation(
        ${t.hash}, null::uuid, ${`noident-${RUN}@example.com`}, 'Nobody') as outcome`;
    expect(rows[0]?.outcome).toBe("unauthenticated");
  });
});

describe.skipIf(!reachable)("the recovery lookup", () => {
  it("lists only live invitations for the verified address, and no token", async () => {
    const person = await newcomer("recovery");
    const t = token();
    await g.createInvitation(ctx(fixture.owner, fixture.workspaceA), {
      email: person.email,
      role: "manager",
      invitedName: null,
      tokenHash: t.hash,
      expiresAt: inSevenDays(),
    });

    const rows = await g.runtimeSql().begin(async (tx) => {
      await tx`select set_config('app.auth_user_id', ${person.authUserId}, true)`;
      return tx<Record<string, unknown>[]>`
        select * from app.pending_invitations_for(${person.email})`;
    });
    expect(rows).toHaveLength(1);
    const columns = Object.keys(rows[0]!);
    expect(columns.sort()).toEqual([
      "expires_at",
      "invitation_id",
      "member_role",
      "workspace_name",
    ]);
    // Nothing redeemable comes back.
    expect(JSON.stringify(rows)).not.toContain(t.plain);
    expect(JSON.stringify(rows)).not.toContain(t.hash);
  });

  it("returns nothing for another person's address", async () => {
    const person = await newcomer("recovery-other");
    const rows = await g.runtimeSql().begin(async (tx) => {
      await tx`select set_config('app.auth_user_id', ${person.authUserId}, true)`;
      return tx`select * from app.pending_invitations_for(${`someone-${RUN}@example.com`})`;
    });
    expect(rows).toHaveLength(0);
  });
});

describe.skipIf(!reachable)("the runtime role's reach", () => {
  it("cannot write a profile or a membership directly", async () => {
    for (const statement of [
      `insert into public.user_profiles (auth_user_id, full_name) values (null, 'x')`,
      `insert into public.workspace_memberships (workspace_id, user_profile_id, role, status)
         values ('${fixture.workspaceA}', '${fixture.owner.userProfileId}', 'owner_admin', 'active')`,
      `update public.user_profiles set full_name = 'x'`,
    ]) {
      let code = "";
      try {
        await g.runtimeSql().unsafe(statement);
      } catch (error) {
        code = String((error as { code?: string })?.code ?? "");
      }
      // The property Milestone 2C must not weaken: the runtime role's new
      // INSERT is on the invitations table and nowhere else.
      expect(`${statement.slice(0, 28)} -> ${code}`).toBe(
        `${statement.slice(0, 28)} -> 42501`,
      );
    }
  });
});
