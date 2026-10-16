import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Authorization and token handling for invitations — spec §159, §162.
 *
 * A Server Action is reachable by anyone who can POST to it, so these ask
 * what happens when someone calls one who should not, whether anything in the
 * payload can change who the server thinks is calling or which workspace is
 * written, and — the part unique to this slice — whether a plaintext token
 * can reach the database, a log, or a second request.
 *
 * `src/server/db/invitations-isolation.db.test.ts` asks the same questions
 * from the database's side. Neither replaces the other: this one proves
 * nothing reaches the database, that one proves the database refuses it if
 * something ever does.
 */

const requireWorkspaceContext = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/require-workspace", () => ({ requireWorkspaceContext }));

const createInvitation = vi.hoisted(() => vi.fn());
const regenerateInvitation = vi.hoisted(() => vi.fn());
const revokeInvitation = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-invitations", () => ({
  createInvitation,
  regenerateInvitation,
  revokeInvitation,
}));

const acceptInvitation = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/invitation-acceptance", () => ({
  acceptInvitation,
  pendingInvitationsForMe: vi.fn(),
}));

const workspaceMembers = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-members", () => ({ workspaceMembers }));

const emailsForAuthUsers = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/member-emails", () => ({ emailsForAuthUsers }));

const businessSettingsFor = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/workspace-business-settings", () => ({
  businessSettingsFor,
}));

const sendInvitationEmail = vi.hoisted(() => vi.fn());
vi.mock("@/server/email/invitation-email", () => ({ sendInvitationEmail }));

const cookieStore = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
const headerStore = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => headerStore,
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const serverEnv = vi.hoisted(() => vi.fn());
vi.mock("@/lib/env", () => ({ serverEnv }));

const {
  createInvitationAction,
  regenerateInvitationAction,
  revokeInvitationAction,
  acceptInvitationAction,
} = await import("./invitations");
const { INVITATION_COOKIE } = await import("@/server/auth/invitation-cookie");
const { hashInvitationToken, isInvitationToken } =
  await import("@/lib/invitation-token");

const ACTOR = "11111111-1111-4111-8111-111111111111";
const INVITATION = "33333333-3333-4333-8333-333333333333";
const CONTEXT = { workspaceId: "w", userProfileId: ACTOR };
const IDLE = { status: "idle" as const, attempt: 0 };

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    renderedWorkspaceId: "w",
    ...fields,
  })) {
    data.set(key, value);
  }
  return data;
};

const createForm = (overrides: Record<string, string> = {}) =>
  form({ email: "new@example.com", role: "staff_sales", ...overrides });

const rowForm = (overrides: Record<string, string> = {}) =>
  form({ invitationId: INVITATION, ...overrides });

const as = (role: string) =>
  requireWorkspaceContext.mockResolvedValue({
    context: CONTEXT,
    role,
    workspaceId: "w",
  });

beforeEach(() => {
  vi.clearAllMocks();
  // The gateways report the row they wrote, so a screen can place an outcome
  // against the right invitation without trusting the submission.
  const written = { ok: true, id: INVITATION, email: "new@example.com" };
  createInvitation.mockResolvedValue(written);
  regenerateInvitation.mockResolvedValue(written);
  revokeInvitation.mockResolvedValue(written);
  acceptInvitation.mockResolvedValue("joined");
  workspaceMembers.mockResolvedValue([]);
  emailsForAuthUsers.mockResolvedValue({ status: "ok", emails: new Map() });
  serverEnv.mockReturnValue({ NEXT_PUBLIC_SITE_URL: "https://crm.example" });
  cookieStore.get.mockReturnValue(undefined);
  headerStore.get.mockReturnValue(null);
  businessSettingsFor.mockResolvedValue({ name: "Acme", timeZone: "UTC" });
  sendInvitationEmail.mockResolvedValue({
    ok: true,
    accepted: ["new@example.com"],
  });
});

describe("only an Owner/Admin may invite (§162)", () => {
  it("lets an owner_admin create one", async () => {
    as("owner_admin");
    const state = await createInvitationAction(IDLE, createForm());
    expect(state.status).toBe("created");
    expect(createInvitation).toHaveBeenCalledTimes(1);
  });

  for (const role of ["manager", "staff_sales"]) {
    it(`refuses a ${role}, and reaches nothing`, async () => {
      as(role);
      const create = await createInvitationAction(IDLE, createForm());
      const regenerate = await regenerateInvitationAction(IDLE, rowForm());
      const revoke = await revokeInvitationAction(IDLE, rowForm());

      expect([create.status, regenerate.status, revoke.status]).toEqual([
        "forbidden",
        "forbidden",
        "forbidden",
      ]);
      expect(createInvitation).not.toHaveBeenCalled();
      expect(regenerateInvitation).not.toHaveBeenCalled();
      expect(revokeInvitation).not.toHaveBeenCalled();
      // And no link was minted for a refusal to accidentally carry.
      expect(create.link).toBeUndefined();
    });
  }

  it("decides the role on the server, never from the payload", async () => {
    as("staff_sales");
    const state = await createInvitationAction(
      IDLE,
      createForm({ role: "owner_admin", userRole: "owner_admin" }),
    );
    expect(state.status).toBe("forbidden");
  });

  it("never reaches the Auth Admin credential for an unauthorised caller", async () => {
    // The ordering that keeps a Manager away from the secret key entirely.
    as("manager");
    await createInvitationAction(IDLE, createForm());
    expect(workspaceMembers).not.toHaveBeenCalled();
    expect(emailsForAuthUsers).not.toHaveBeenCalled();
  });
});

describe("the workspace the form was rendered for", () => {
  it("refuses a submission for a different workspace", async () => {
    as("owner_admin");
    const state = await createInvitationAction(
      IDLE,
      createForm({ renderedWorkspaceId: "other" }),
    );
    expect(state.status).toBe("stale");
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("fails closed when the field is absent", async () => {
    as("owner_admin");
    const data = createForm();
    data.delete("renderedWorkspaceId");
    expect((await createInvitationAction(IDLE, data)).status).toBe("stale");
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("writes to the resolved workspace, never a submitted one", async () => {
    as("owner_admin");
    await createInvitationAction(
      IDLE,
      createForm({ workspaceId: "elsewhere" }),
    );
    expect(createInvitation).toHaveBeenCalledWith(
      CONTEXT,
      expect.objectContaining({ email: "new@example.com" }),
    );
  });
});

describe("what the database is given", () => {
  it("is a digest, never the token", async () => {
    as("owner_admin");
    const state = await createInvitationAction(IDLE, createForm());
    const [, input] = createInvitation.mock.calls[0]!;

    expect(input.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const token = state.link!.split("/").pop()!;
    expect(isInvitationToken(token)).toBe(true);
    // The hash stored is this token's, and the token itself appears nowhere
    // in what was handed to the database.
    expect(input.tokenHash).toBe(await hashInvitationToken(token));
    expect(JSON.stringify(input)).not.toContain(token);
  });

  it("gives every invitation its own token", async () => {
    as("owner_admin");
    const first = await createInvitationAction(IDLE, createForm());
    const second = await createInvitationAction(IDLE, createForm());
    expect(first.link).not.toBe(second.link);
  });

  it("restarts the seven days on regeneration, with a new digest", async () => {
    as("owner_admin");
    const created = await createInvitationAction(IDLE, createForm());
    const regenerated = await regenerateInvitationAction(IDLE, rowForm());

    const [, createInput] = createInvitation.mock.calls[0]!;
    const [, id, hash, expiresAt] = regenerateInvitation.mock.calls[0]!;
    expect(id).toBe(INVITATION);
    expect(hash).not.toBe(createInput.tokenHash);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(regenerated.link).not.toBe(created.link);
  });

  it("normalises the address before storing it", async () => {
    as("owner_admin");
    await createInvitationAction(
      IDLE,
      createForm({ email: " New@Example.COM " }),
    );
    expect(createInvitation.mock.calls[0]![1].email).toBe("new@example.com");
  });

  it("refuses an invitation id that is not one", async () => {
    as("owner_admin");
    for (const invitationId of ["", "nope", "' or 1=1 --", "../../etc"]) {
      const regenerate = await regenerateInvitationAction(
        IDLE,
        rowForm({ invitationId }),
      );
      const revoke = await revokeInvitationAction(
        IDLE,
        rowForm({ invitationId }),
      );
      expect([regenerate.status, revoke.status]).toEqual([
        "invalid",
        "invalid",
      ]);
    }
    expect(regenerateInvitation).not.toHaveBeenCalled();
    expect(revokeInvitation).not.toHaveBeenCalled();
  });
});

describe("inviting somebody who is already here", () => {
  const active = (email: string) => {
    workspaceMembers.mockResolvedValue([
      { authUserId: "auth-1", status: "active" },
    ]);
    emailsForAuthUsers.mockResolvedValue({
      status: "ok",
      emails: new Map([["auth-1", email]]),
    });
  };

  it("refuses an active member, before minting a token", async () => {
    as("owner_admin");
    active("New@Example.com");
    const state = await createInvitationAction(IDLE, createForm());
    expect(state.status).toBe("already_member");
    expect(state.link).toBeUndefined();
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("permits an INACTIVE member — acceptance reactivates them", async () => {
    as("owner_admin");
    workspaceMembers.mockResolvedValue([
      { authUserId: "auth-1", status: "inactive" },
    ]);
    emailsForAuthUsers.mockResolvedValue({
      status: "ok",
      emails: new Map([["auth-1", "new@example.com"]]),
    });
    expect((await createInvitationAction(IDLE, createForm())).status).toBe(
      "created",
    );
  });

  it("only ever asks about active members' addresses", async () => {
    as("owner_admin");
    workspaceMembers.mockResolvedValue([
      { authUserId: "auth-1", status: "active" },
      { authUserId: "auth-2", status: "inactive" },
      { authUserId: null, status: "active" },
    ]);
    await createInvitationAction(IDLE, createForm());
    expect(emailsForAuthUsers).toHaveBeenCalledWith(["auth-1"]);
  });

  for (const status of ["not_configured", "unavailable"]) {
    it(`refuses rather than guessing when the lookup is ${status}`, async () => {
      // Treating an unreadable directory as "not a member" would quietly
      // invite somebody who already works here.
      as("owner_admin");
      workspaceMembers.mockResolvedValue([
        { authUserId: "auth-1", status: "active" },
      ]);
      emailsForAuthUsers.mockResolvedValue({ status, emails: new Map() });
      const state = await createInvitationAction(IDLE, createForm());
      expect(state.status).toBe("eligibility_unknown");
      expect(state.link).toBeUndefined();
      expect(createInvitation).not.toHaveBeenCalled();
    });
  }

  it("refuses when only some addresses resolved and none matched", async () => {
    as("owner_admin");
    workspaceMembers.mockResolvedValue([
      { authUserId: "auth-1", status: "active" },
      { authUserId: "auth-2", status: "active" },
    ]);
    emailsForAuthUsers.mockResolvedValue({
      status: "partial",
      emails: new Map([["auth-1", "someone@example.com"]]),
    });
    expect((await createInvitationAction(IDLE, createForm())).status).toBe(
      "eligibility_unknown",
    );
  });

  it("still refuses a match found among a partial answer", async () => {
    // A positive match settles the question whether or not the rest answered.
    as("owner_admin");
    workspaceMembers.mockResolvedValue([
      { authUserId: "auth-1", status: "active" },
      { authUserId: "auth-2", status: "active" },
    ]);
    emailsForAuthUsers.mockResolvedValue({
      status: "partial",
      emails: new Map([["auth-1", "new@example.com"]]),
    });
    expect((await createInvitationAction(IDLE, createForm())).status).toBe(
      "already_member",
    );
  });

  it("does not ask at all when no active member has an Auth account", async () => {
    // `auth_user_id` is NULL once the account is deleted, so that profile can
    // never be matched by acceptance and cannot be the invitee.
    as("owner_admin");
    workspaceMembers.mockResolvedValue([
      { authUserId: null, status: "active" },
      { authUserId: "auth-2", status: "inactive" },
    ]);
    const state = await createInvitationAction(IDLE, createForm());
    expect(state.status).toBe("created");
    expect(emailsForAuthUsers).not.toHaveBeenCalled();
  });

  it("reports a duplicate invitation separately from a duplicate member", async () => {
    as("owner_admin");
    createInvitation.mockResolvedValue({
      ok: false,
      reason: "already_invited",
    });
    expect((await createInvitationAction(IDLE, createForm())).status).toBe(
      "already_invited",
    );
  });
});

describe("the link", () => {
  it("uses the configured site address when there is one", async () => {
    as("owner_admin");
    const state = await createInvitationAction(IDLE, createForm());
    expect(state.link).toMatch(
      /^https:\/\/crm\.example\/invitations\/[\w-]{43}$/,
    );
  });

  it("falls back to the request's own origin", async () => {
    as("owner_admin");
    serverEnv.mockReturnValue({ NEXT_PUBLIC_SITE_URL: undefined });
    headerStore.get.mockImplementation((name: string) =>
      name === "host" ? "localhost:3000" : null,
    );
    const state = await createInvitationAction(IDLE, createForm());
    expect(state.link).toMatch(/^http:\/\/localhost:3000\/invitations\//);
  });

  it("is not returned when the write was refused", async () => {
    as("owner_admin");
    createInvitation.mockResolvedValue({ ok: false, reason: "not_permitted" });
    const state = await createInvitationAction(IDLE, createForm());
    expect(state.status).toBe("forbidden");
    expect(state.link).toBeUndefined();
  });
});

describe("accepting", () => {
  const withCookie = (token: string) =>
    cookieStore.get.mockImplementation((name: string) =>
      name === INVITATION_COOKIE ? { value: token } : undefined,
    );

  const TOKEN = "A".repeat(43);

  it("reads the token from the cookie, not the form", async () => {
    withCookie(TOKEN);
    const data = new FormData();
    // A token posted back would sit in a request body. If one ever is, it
    // must be ignored in favour of the cookie.
    data.set("token", "B".repeat(43));
    await acceptInvitationAction({ status: "idle", attempt: 0 }, data);
    expect(acceptInvitation).toHaveBeenCalledWith({
      tokenHash: await hashInvitationToken(TOKEN),
    });
  });

  it("needs no membership context at all", async () => {
    withCookie(TOKEN);
    await acceptInvitationAction(
      { status: "idle", attempt: 0 },
      new FormData(),
    );
    // The invitee has none yet — requiring one is the bug this guards.
    expect(requireWorkspaceContext).not.toHaveBeenCalled();
  });

  it("uses the recovery list's invitation id when there is no cookie", async () => {
    const data = new FormData();
    data.set("invitationId", INVITATION);
    await acceptInvitationAction({ status: "idle", attempt: 0 }, data);
    expect(acceptInvitation).toHaveBeenCalledWith({ invitationId: INVITATION });
  });

  it("prefers the offered invitation over a leftover cookie", async () => {
    // The cookie outlives the link that set it. Open a link, have it
    // regenerated, then accept from the recovery list: a cookie-first rule
    // would redeem the dead token and call a valid acceptance invalid.
    withCookie(TOKEN);
    const data = new FormData();
    data.set("invitationId", INVITATION);
    await acceptInvitationAction({ status: "idle", attempt: 0 }, data);
    expect(acceptInvitation).toHaveBeenCalledWith({ invitationId: INVITATION });
  });

  it("ignores a malformed cookie rather than hashing it", async () => {
    withCookie("not-a-token");
    const data = new FormData();
    data.set("invitationId", INVITATION);
    await acceptInvitationAction({ status: "idle", attempt: 0 }, data);
    expect(acceptInvitation).toHaveBeenCalledWith({ invitationId: INVITATION });
  });

  it("refuses when there is neither", async () => {
    const state = await acceptInvitationAction(
      { status: "idle", attempt: 0 },
      new FormData(),
    );
    expect(state.status).toBe("invalid");
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  for (const outcome of [
    "joined",
    "reactivated",
    "already_member",
    "invalid",
  ]) {
    it(`clears the cookie after "${outcome}"`, async () => {
      withCookie(TOKEN);
      acceptInvitation.mockResolvedValue(outcome);
      await acceptInvitationAction(
        { status: "idle", attempt: 0 },
        new FormData(),
      );
      expect(cookieStore.set).toHaveBeenCalledWith(
        INVITATION_COOKIE,
        "",
        expect.objectContaining({ maxAge: 0 }),
      );
    });
  }

  for (const outcome of ["email_mismatch", "unauthenticated"]) {
    it(`keeps the cookie after "${outcome}" — it is worth retrying`, async () => {
      withCookie(TOKEN);
      acceptInvitation.mockResolvedValue(outcome);
      const state = await acceptInvitationAction(
        { status: "idle", attempt: 0 },
        new FormData(),
      );
      expect(state.status).toBe(outcome);
      expect(cookieStore.set).not.toHaveBeenCalled();
    });
  }

  it("reports the outcome rather than flattening it", async () => {
    withCookie(TOKEN);
    for (const outcome of [
      "joined",
      "reactivated",
      "already_member",
      "invalid",
      "email_mismatch",
      "inviter_not_permitted",
      "unauthenticated",
    ]) {
      acceptInvitation.mockResolvedValue(outcome);
      const state = await acceptInvitationAction(
        { status: "idle", attempt: 0 },
        new FormData(),
      );
      expect(state.status).toBe(outcome);
    }
  });
});

describe("sending the invitation", () => {
  it("emails it, and reports that the server accepted the message", async () => {
    as("owner_admin");
    const state = await createInvitationAction(IDLE, createForm());
    expect(state.status).toBe("created");
    expect(state.delivery).toBe("accepted");

    const [message] = sendInvitationEmail.mock.calls[0]!;
    expect(message.to).toBe("new@example.com");
    expect(message.workspaceName).toBe("Acme");
    expect(message.link).toBe(state.link);
  });

  it("sends only AFTER the invitation exists", async () => {
    // A message pointing at an invitation that was never stored is the one
    // ordering that cannot be recovered from.
    as("owner_admin");
    createInvitation.mockResolvedValue({ ok: false, reason: "unavailable" });
    await createInvitationAction(IDLE, createForm());
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("keeps the invitation when the email fails, and says so", async () => {
    as("owner_admin");
    sendInvitationEmail.mockResolvedValue({ ok: false, reason: "failed" });
    const state = await createInvitationAction(IDLE, createForm());

    // Created, not rolled back: the link still works and can be copied.
    expect(state.status).toBe("created");
    expect(state.delivery).toBe("failed");
    expect(state.link).toBeTruthy();
    expect(state.invitationId).toBe(INVITATION);
  });

  it("reports absent configuration as its own thing, not a failure", async () => {
    as("owner_admin");
    sendInvitationEmail.mockResolvedValue({
      ok: false,
      reason: "not_configured",
    });
    const state = await createInvitationAction(IDLE, createForm());
    expect(state.status).toBe("created");
    expect(state.delivery).toBe("not_configured");
    expect(state.link).toBeTruthy();
  });

  it("emails the replacement when an invitation is re-issued", async () => {
    as("owner_admin");
    const state = await regenerateInvitationAction(IDLE, rowForm());
    expect(state.status).toBe("regenerated");
    expect(state.delivery).toBe("accepted");
    expect(sendInvitationEmail.mock.calls[0]![0].link).toBe(state.link);
  });

  it("sends a link that carries the new token, never a stored one", async () => {
    /*
     * Only a digest is stored, so a re-send is impossible by construction —
     * each attempt mints a fresh token on the same invitation row. The
     * message must carry that token, not anything read back.
     */
    as("owner_admin");
    const first = await regenerateInvitationAction(IDLE, rowForm());
    const second = await regenerateInvitationAction(first, rowForm());
    expect(first.link).not.toBe(second.link);
    expect(sendInvitationEmail.mock.calls[0]![0].link).toBe(first.link);
    expect(sendInvitationEmail.mock.calls[1]![0].link).toBe(second.link);
    // One invitation throughout — retrying never creates a second.
    expect(createInvitation).not.toHaveBeenCalled();
    expect(regenerateInvitation).toHaveBeenCalledTimes(2);
  });

  it("never reaches the mailer for an unauthorised caller", async () => {
    as("manager");
    await createInvitationAction(IDLE, createForm());
    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });
});

describe("what the screen is told about", () => {
  it("names the invitation and address each outcome concerns", async () => {
    as("owner_admin");
    for (const [label, run] of [
      ["created", () => createInvitationAction(IDLE, createForm())],
      ["regenerated", () => regenerateInvitationAction(IDLE, rowForm())],
      ["revoked", () => revokeInvitationAction(IDLE, rowForm())],
    ] as const) {
      const state = await run();
      expect(state.invitationId, label).toBe(INVITATION);
      expect(state.email, label).toBe("new@example.com");
    }
  });

  it("takes them from the database, not from the submission", async () => {
    // The form could carry anything; what is shown comes back from the row.
    as("owner_admin");
    revokeInvitation.mockResolvedValue({
      ok: true,
      id: INVITATION,
      email: "stored@example.com",
    });
    const data = rowForm({ email: "attacker@example.com" });
    const state = await revokeInvitationAction(IDLE, data);
    expect(state.email).toBe("stored@example.com");
  });
});

describe("every attempt is distinguishable", () => {
  it("advances the counter whatever the outcome", async () => {
    as("manager");
    const first = await createInvitationAction(IDLE, createForm());
    const second = await createInvitationAction(first, createForm());
    expect([first.attempt, second.attempt]).toEqual([1, 2]);
  });
});

describe("what this module must never do", () => {
  it("logs nothing", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/app/actions/invitations.ts", "utf8");
    // One `console.log` here would put a live token in a server log.
    expect(source).not.toMatch(/console\./);
  });
});
