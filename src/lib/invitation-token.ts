/**
 * Invitation tokens — spec §159.
 *
 * The token is the capability: possessing it is what lets someone reach an
 * invitation at all. So it is generated from a cryptographic source, stored
 * only as a digest, and shown exactly once.
 *
 * This module is pure. It holds no secret, touches no database and does no
 * I/O, which is why it can be unit-tested directly and why nothing here needs
 * `server-only` — though in practice only server code calls it.
 */

/** Seven days, the approved default. Not specified by §159 or §11. */
export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** 32 bytes — 256 bits — expressed as 43 URL-safe base64 characters. */
const TOKEN_BYTES = 32;

/** A SHA-256 digest as lower-case hex, which is what the column accepts. */
const HASH_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Shape check for a token arriving from a URL or a cookie.
 *
 * Not a security control — the hash lookup is — but it means an obviously
 * malformed value is refused before it becomes a query parameter, and it
 * keeps anything that is not a token out of the hashing path.
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isInvitationToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function isInvitationTokenHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

/**
 * A fresh token.
 *
 * `crypto.getRandomValues` is the Web Crypto source, available in both the
 * Node and Edge runtimes, so there is no `node:crypto` import to keep this
 * module out of a browser bundle.
 */
export function createInvitationToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** The digest stored in the database. Never reversible, never logged. */
export async function hashInvitationToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** When a token issued now stops working. */
export function invitationExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITATION_LIFETIME_MS);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
