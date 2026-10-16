import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import { isEmailConfigured, smtpEnv } from "@/lib/env";

/**
 * The outbound mail adapter — SMTP, and nothing provider-specific.
 *
 * ## What this is, and is not
 *
 * It is the application's own mailer. Supabase Auth sends its confirmation
 * and password-reset messages itself, with its own mailer; nothing here
 * touches those. This exists because an invitation is ours: we hold the
 * token, the workspace and the role, and Auth has no idea any of them exist.
 *
 * Plain SMTP is deliberate. Every provider speaks it, so choosing one later
 * is a matter of configuration rather than code, and the production decision
 * stays open. The interface below is the seam a different adapter would
 * implement if an HTTP API ever replaced SMTP.
 *
 * ## Accepted is not delivered
 *
 * `sendMail` resolves when the SMTP server has ACCEPTED the message — a 250
 * on the wire. It says nothing about what happens next: the message may still
 * bounce, be greylisted, be filed as spam, or be dropped silently. So the
 * result below says "accepted", every caller surfaces it as such, and the
 * copyable link stays on screen as the thing that definitely works.
 */

/** What a mail adapter must do. One operation, deliberately. */
export type MailAdapter = {
  readonly send: (message: OutboundMessage) => Promise<SendOutcome>;
};

export type OutboundMessage = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
};

export type SendOutcome =
  /**
   * The server accepted the message for the listed recipients. NOT a promise
   * of delivery — see above.
   */
  | { readonly ok: true; readonly accepted: readonly string[] }
  /** No mail is configured. Expected, and never an error. */
  | { readonly ok: false; readonly reason: "not_configured" }
  /** Configured, but the attempt failed. The caller offers a way to recover. */
  | { readonly ok: false; readonly reason: "failed" };

let transport: Transporter | null = null;

/**
 * One transport per process, built on first use.
 *
 * `pool: false` because invitations are occasional and a pooled connection
 * held open against a provider is a connection to be dropped at the least
 * convenient moment. The timeouts are short for the same reason a request
 * should not hang: an Owner/Admin waiting on a settings form would rather be
 * told it failed.
 */
function mailer(): Transporter {
  if (transport) return transport;
  const env = smtpEnv();
  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
    pool: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    /*
     * Nodemailer's own logging is off. A debug log of an SMTP session
     * contains the whole message body, and an invitation body contains a live
     * link — the one thing this feature must never write to a log.
     */
    logger: false,
    debug: false,
  });
  return transport;
}

/** Test seam: forget the memoised transport when the environment changes. */
export function resetMailerForTests(): void {
  transport = null;
}

/**
 * The fields of a transport error that are safe to write down.
 *
 * `code` is nodemailer's category (EAUTH, ECONNECTION, ETIMEDOUT, EENVELOPE),
 * `responseCode` the SMTP reply (535 for a rejected login, 550 for a refused
 * sender), and `command` the step it died on (AUTH PLAIN, MAIL FROM, RCPT
 * TO). Between them they identify every failure this adapter can have without
 * naming a person, a credential or a link.
 */
function safeFailure(error: unknown): Record<string, unknown> {
  const e = error as Record<string, unknown> | null;
  const picked: Record<string, unknown> = {};
  for (const key of ["code", "responseCode", "command", "errno", "syscall"]) {
    const value = e?.[key];
    if (value !== undefined && value !== null) picked[key] = value;
  }
  return picked;
}

export const smtpAdapter: MailAdapter = {
  async send(message) {
    if (!isEmailConfigured()) return { ok: false, reason: "not_configured" };

    try {
      const info = await mailer().sendMail({
        from: smtpEnv().EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      /*
       * A server can accept a message and still reject some recipients. One
       * recipient here, so "accepted none" is a failure however the
       * transport chose to phrase it.
       */
      const accepted = (info.accepted ?? []).map(String);
      if (accepted.length === 0) return { ok: false, reason: "failed" };
      return { ok: true, accepted };
    } catch (error) {
      /*
       * Never re-thrown: the error carries the message envelope, and the body
       * holds a live invitation link, so letting it propagate would put that
       * in whatever logs the request. The caller gets a word, and the person
       * gets a link they can copy.
       *
       * But swallowing it WHOLE was a mistake. A misconfigured mailer then
       * failed with nothing recorded anywhere, and the only way to find out
       * why was to rebuild the transport by hand outside the application. So
       * the three fields that cannot carry a secret, a body or a link are
       * logged, and nothing else is.
       *
       * Deliberately excluded: `response` and `responseText`, which are the
       * server's own words and on some servers quote the username back; and
       * the error object itself, which carries `envelope`.
       */
      console.warn("[email] send failed:", JSON.stringify(safeFailure(error)));
      return { ok: false, reason: "failed" };
    }
  },
};
