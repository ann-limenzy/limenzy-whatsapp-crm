import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The mail adapter, offline.
 *
 * No SMTP server is contacted: nodemailer is replaced, so every outcome —
 * acceptance, rejection, a thrown connection error, absent configuration —
 * can be produced exactly and the behaviour pinned.
 *
 * The property that matters most here is the one the wording in the UI rests
 * on: "the server accepted it" and "it was delivered" are different claims,
 * and this layer may only ever make the first.
 */

const sendMail = vi.hoisted(() => vi.fn());
const createTransport = vi.hoisted(() => vi.fn(() => ({ sendMail })));
vi.mock("nodemailer", () => ({
  default: { createTransport },
  createTransport,
}));

const { smtpAdapter, resetMailerForTests } = await import("./smtp");
const { buildInvitationMessage, sendInvitationEmail } =
  await import("./invitation-email");
const { resetEnvCacheForTests } = await import("@/lib/env");

const CONFIG = {
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "54325",
  EMAIL_FROM: "Limenzy <no-reply@example.test>",
};

const configure = (values: Record<string, string | undefined> = CONFIG) => {
  for (const key of [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_SECURE",
    "EMAIL_FROM",
  ]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  resetEnvCacheForTests();
  resetMailerForTests();
};

const MESSAGE = {
  to: "invitee@example.test",
  subject: "s",
  text: "t",
  html: "<p>h</p>",
};

beforeEach(() => {
  vi.clearAllMocks();
  sendMail.mockResolvedValue({
    accepted: ["invitee@example.test"],
    rejected: [],
  });
  configure();
});

describe("what the adapter will and will not claim", () => {
  it("reports acceptance, which is all a 250 means", async () => {
    await expect(smtpAdapter.send(MESSAGE)).resolves.toEqual({
      ok: true,
      accepted: ["invitee@example.test"],
    });
  });

  it("treats a message accepted for nobody as a failure", async () => {
    // A server can take the message and still reject the only recipient.
    sendMail.mockResolvedValue({
      accepted: [],
      rejected: ["invitee@example.test"],
    });
    await expect(smtpAdapter.send(MESSAGE)).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("turns a connection error into a word, never an exception", async () => {
    // The thrown error carries the envelope, and the body holds a live
    // invitation link. Re-throwing it would put that in the request log.
    sendMail.mockRejectedValue(
      Object.assign(new Error("connect ECONNREFUSED"), {
        envelope: { to: ["invitee@example.test"] },
      }),
    );
    await expect(smtpAdapter.send(MESSAGE)).resolves.toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("says so when nothing is configured, and contacts nothing", async () => {
    configure({});
    await expect(smtpAdapter.send(MESSAGE)).resolves.toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("refuses half-configured settings rather than guessing", async () => {
    // A host with no sender address would send from whatever the transport
    // defaults to, which is nobody's intention.
    configure({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "54325" });
    await expect(smtpAdapter.send(MESSAGE)).resolves.toEqual({
      ok: false,
      reason: "not_configured",
    });
  });
});

describe("what a failure records", () => {
  /*
   * A misconfigured mailer once failed with nothing written down anywhere,
   * which made the cause invisible until the transport was rebuilt by hand
   * outside the application. These pin what may and may not be logged.
   */
  const failure = () =>
    Object.assign(new Error("Invalid login: 535 5.7.0 Invalid login"), {
      code: "EAUTH",
      responseCode: 535,
      command: "AUTH PLAIN",
      response: "535 5.7.0 Invalid login for secret-user",
      envelope: { from: "no-reply@example.test", to: ["invitee@example.test"] },
    });

  it("writes down the code, the SMTP reply and the failed command", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sendMail.mockRejectedValue(failure());

    await smtpAdapter.send(MESSAGE);

    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0]!.join(" ");
    expect(line).toContain("EAUTH");
    expect(line).toContain("535");
    expect(line).toContain("AUTH PLAIN");
    warn.mockRestore();
  });

  it("and nothing that could carry a secret, a recipient or a link", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    sendMail.mockRejectedValue(failure());

    await smtpAdapter.send(MESSAGE);

    const line = warn.mock.calls[0]!.join(" ");
    // The server's own words can quote the username back, and the envelope
    // names the recipient.
    expect(line).not.toContain("secret-user");
    expect(line).not.toContain("invitee@example.test");
    expect(line).not.toContain("no-reply@example.test");
    expect(line).not.toContain("Invalid login");
    warn.mockRestore();
  });

  it("says nothing at all when there is nothing configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    configure({});
    await smtpAdapter.send(MESSAGE);
    // Absent configuration is an expected state, not a failure to report.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("how the transport is built", () => {
  it("keeps nodemailer's own logging off", async () => {
    await smtpAdapter.send(MESSAGE);
    const [options] = createTransport.mock.calls[0]! as unknown as [
      Record<string, unknown>,
    ];
    // A debug log of an SMTP session contains the whole body, and the body
    // contains a live link.
    expect(options.logger).toBe(false);
    expect(options.debug).toBe(false);
  });

  it("omits auth entirely when no credentials are given", async () => {
    // A local test mailbox accepts mail with none, and sending `undefined`
    // credentials is not the same as sending none.
    await smtpAdapter.send(MESSAGE);
    const [options] = createTransport.mock.calls[0]! as unknown as [
      Record<string, unknown>,
    ];
    expect(options.auth).toBeUndefined();
    expect(options.host).toBe("127.0.0.1");
    expect(options.port).toBe(54325);
  });

  it("passes credentials when both are given", async () => {
    configure({ ...CONFIG, SMTP_USER: "u", SMTP_PASSWORD: "p" });
    await smtpAdapter.send(MESSAGE);
    const [options] = createTransport.mock.calls[0]! as unknown as [
      Record<string, unknown>,
    ];
    expect(options.auth).toEqual({ user: "u", pass: "p" });
  });

  it("sends from the configured address", async () => {
    await smtpAdapter.send(MESSAGE);
    expect(sendMail.mock.calls[0]![0].from).toBe(
      "Limenzy <no-reply@example.test>",
    );
  });
});

describe("the invitation message", () => {
  const invitation = {
    to: "invitee@example.test",
    workspaceName: "Acme Motors",
    link: "https://crm.example.test/invitations/abc",
    expiresLabel: "22 Oct 2026",
    invitedName: "Sam",
  };

  it("carries the link in the plain-text part too", () => {
    // Plenty of clients show text only, and a link that cannot be seen
    // cannot be copied.
    const message = buildInvitationMessage(invitation);
    expect(message.text).toContain(invitation.link);
    expect(message.html).toContain(invitation.link);
    expect(message.subject).toContain("Acme Motors");
  });

  it("greets by name when there is one, and plainly when there is not", () => {
    expect(buildInvitationMessage(invitation).text).toContain("Hello Sam,");
    expect(
      buildInvitationMessage({ ...invitation, invitedName: null }).text,
    ).toContain("Hello,");
  });

  it("escapes anything that would otherwise be markup", () => {
    const message = buildInvitationMessage({
      ...invitation,
      workspaceName: '<script>alert("x")</script>',
      invitedName: "a<b>c",
    });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).toContain("a&lt;b&gt;c");
  });

  it("goes through whichever adapter it is handed", async () => {
    const adapter = {
      send: vi.fn().mockResolvedValue({ ok: true, accepted: [] }),
    };
    await sendInvitationEmail(invitation, adapter);
    expect(adapter.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: invitation.to }),
    );
    // Nothing reached the real transport.
    expect(sendMail).not.toHaveBeenCalled();
  });
});
