import "server-only";

import { smtpAdapter, type MailAdapter, type SendOutcome } from "./smtp";

/**
 * The invitation email.
 *
 * One message, built here so the wording lives in one place and the adapter
 * stays about transport.
 *
 * **The link is the message.** It is written out in the text part as well as
 * linked in the HTML one, because plenty of mail clients show the plain-text
 * part and a link that cannot be seen cannot be copied.
 *
 * **Nothing here logs.** The body contains a live invitation link; the only
 * places it may exist are this message and the screen that minted it.
 */

export type InvitationEmail = {
  readonly to: string;
  readonly workspaceName: string;
  readonly link: string;
  /** Written out by the caller, already in a human format. */
  readonly expiresLabel: string;
  /** The optional name the inviter typed, if they typed one. */
  readonly invitedName: string | null;
};

/** Escape for inclusion in HTML text or an attribute value. */
const escape = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function buildInvitationMessage(invitation: InvitationEmail): {
  subject: string;
  text: string;
  html: string;
} {
  const greeting = invitation.invitedName
    ? `Hello ${invitation.invitedName},`
    : "Hello,";

  const subject = `You have been invited to join ${invitation.workspaceName}`;

  const text = [
    greeting,
    "",
    `You have been invited to join ${invitation.workspaceName} on Limenzy CRM.`,
    "",
    "Open this link to accept:",
    invitation.link,
    "",
    `This invitation expires on ${invitation.expiresLabel}.`,
    "",
    "If you were not expecting this, you can ignore this email.",
  ].join("\n");

  const html = [
    `<p>${escape(greeting)}</p>`,
    `<p>You have been invited to join <strong>${escape(invitation.workspaceName)}</strong> on Limenzy CRM.</p>`,
    `<p><a href="${escape(invitation.link)}">Accept your invitation</a></p>`,
    `<p>Or copy this link into your browser:<br>${escape(invitation.link)}</p>`,
    `<p>This invitation expires on ${escape(invitation.expiresLabel)}.</p>`,
    "<p>If you were not expecting this, you can ignore this email.</p>",
  ].join("\n");

  return { subject, text, html };
}

/**
 * Send one invitation.
 *
 * The adapter is a parameter so a test can supply its own without a network,
 * and so replacing SMTP with a provider's API later is one argument rather
 * than a rewrite.
 */
export async function sendInvitationEmail(
  invitation: InvitationEmail,
  adapter: MailAdapter = smtpAdapter,
): Promise<SendOutcome> {
  const message = buildInvitationMessage(invitation);
  return adapter.send({
    to: invitation.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
