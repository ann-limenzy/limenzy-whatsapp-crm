import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { databaseEnv } from "@/lib/env";
import { fingerprintLead, type ParsedLead } from "@/lib/validation/leads";

/**
 * Proof that the server showed this person this duplicate warning — §32,
 * §130.1.
 *
 * ## Why a posted flag was not enough
 *
 * Create Anyway used to be honoured whenever an authorised actor posted
 * `override=true`. That treats a browser's claim as the approval itself: a
 * client that always sends the flag never shows anyone the warning, and
 * §130.1's "the system warns about duplicates rather than silently creating
 * them" becomes untrue while every other check still passes. The permission
 * check was sound; what was missing was evidence that the warning happened.
 *
 * ## What the acknowledgement binds
 *
 * A message authentication code over the WORKSPACE, the ACTOR and a
 * fingerprint of the NORMALISED SUBMISSION — the exact values that would be
 * written. Any of the three differing produces a different code, so:
 *
 *   * an acknowledgement issued to someone else does not work;
 *   * one issued in another workspace does not work;
 *   * **changed data requires another warning**, because changing the name,
 *     either contact value, the notes, the stage or the source changes the
 *     fingerprint and the old code no longer verifies.
 *
 * It is not a session, a nonce table or a general capability system. It is a
 * signed statement about one submission, and nothing stores it.
 *
 * ## The key
 *
 * Derived from `DATABASE_URL`, which is the one secret this application
 * cannot run without — so an acknowledgement can never be unavailable while
 * the feature it guards is usable, which `SUPABASE_SECRET_KEY` could not
 * promise (it is optional and degradable). The derivation is one-way and
 * purpose-labelled, so the code reveals nothing about the connection string,
 * and rotating the password merely means an in-flight warning has to be seen
 * again.
 *
 * ## What it is NOT
 *
 * Not a substitute for the §162 permission, which is checked separately, and
 * not a substitute for §130.1's fourth checkpoint: the create transaction
 * still re-runs duplicate detection and still writes the audit row. An
 * acknowledgement says the warning was shown, nothing more.
 */

/** How long a warning stays answerable. Long enough to read, short enough not to keep. */
const LIFETIME_MS = 15 * 60 * 1000;

const PURPOSE = "limenzy:lead-duplicate-acknowledgement:v1";

let derivedKey: Buffer | undefined;

function key(): Buffer {
  if (derivedKey) return derivedKey;
  // One-way, and labelled, so this value is usable for nothing else.
  derivedKey = createHmac("sha256", databaseEnv().DATABASE_URL)
    .update(PURPOSE)
    .digest();
  return derivedKey;
}

function sign(
  workspaceId: string,
  actorUserProfileId: string,
  issuedAt: number,
  lead: ParsedLead,
): string {
  const message = [
    PURPOSE,
    workspaceId,
    actorUserProfileId,
    String(issuedAt),
    fingerprintLead(lead),
  ].join("\u0000");
  return createHmac("sha256", key()).update(message).digest("hex");
}

/** Issue an acknowledgement for a warning being shown now. */
export function issueDuplicateAcknowledgement(
  workspaceId: string,
  actorUserProfileId: string,
  lead: ParsedLead,
): string {
  const issuedAt = Date.now();
  return `${issuedAt}.${sign(workspaceId, actorUserProfileId, issuedAt, lead)}`;
}

/**
 * Whether this acknowledgement was issued by this server, to this actor, in
 * this workspace, for exactly this submission, recently.
 *
 * Returns false for anything it cannot verify — a missing token, a malformed
 * one, an expired one, one issued in the future, or one whose code does not
 * match. The caller then shows the warning again rather than refusing
 * outright, which is the behaviour someone who simply took too long deserves.
 */
export function acknowledgementIsValid(
  workspaceId: string,
  actorUserProfileId: string,
  lead: ParsedLead,
  token: string,
  now: number = Date.now(),
): boolean {
  const separator = token.indexOf(".");
  if (separator <= 0) return false;
  const issuedAt = Number(token.slice(0, separator));
  const presented = token.slice(separator + 1);
  if (!Number.isSafeInteger(issuedAt)) return false;
  // Not issued in the future, and not older than one lifetime.
  if (issuedAt > now || now - issuedAt > LIFETIME_MS) return false;

  const expected = sign(workspaceId, actorUserProfileId, issuedAt, lead);
  const a = Buffer.from(expected, "hex");
  let b: Buffer;
  try {
    b = Buffer.from(presented, "hex");
  } catch {
    return false;
  }
  // Length first: timingSafeEqual throws on a mismatch rather than answering.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
