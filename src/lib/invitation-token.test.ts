import { describe, expect, it } from "vitest";

import {
  INVITATION_LIFETIME_MS,
  createInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  isInvitationToken,
  isInvitationTokenHash,
} from "@/lib/invitation-token";

/**
 * Invitation tokens — spec §159.
 *
 * The token IS the capability, so these assert the properties that make it
 * one: it is unguessable, it survives a URL unescaped, and what the database
 * stores cannot be turned back into it.
 */

describe("createInvitationToken", () => {
  it("is 43 URL-safe characters — 256 bits, no padding", () => {
    const token = createInvitationToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // A token that needed escaping would arrive from the URL as something
    // other than what was issued.
    expect(encodeURIComponent(token)).toBe(token);
  });

  it("accepts its own output", () => {
    for (let index = 0; index < 50; index += 1) {
      expect(isInvitationToken(createInvitationToken())).toBe(true);
    }
  });

  it("does not repeat", () => {
    // Not a randomness test — a wiring test. A constant, a counter or a
    // reused buffer would collide here immediately.
    const seen = new Set<string>();
    for (let index = 0; index < 500; index += 1) {
      seen.add(createInvitationToken());
    }
    expect(seen.size).toBe(500);
  });

  it("varies in every position", () => {
    // Catches a fixed prefix or a zeroed tail, which a truncated or partly
    // filled buffer would produce.
    const tokens = Array.from({ length: 200 }, () => createInvitationToken());
    for (let position = 0; position < 43; position += 1) {
      const distinct = new Set(tokens.map((token) => token[position]));
      expect(
        distinct.size,
        `position ${position} never varies`,
      ).toBeGreaterThan(1);
    }
  });
});

describe("hashInvitationToken", () => {
  it("is SHA-256, as lower-case hex", async () => {
    // The published vector, so a change of algorithm or encoding is caught
    // here rather than by a lookup that silently stops matching.
    await expect(hashInvitationToken("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("produces what the column accepts", async () => {
    const hash = await hashInvitationToken(createInvitationToken());
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(isInvitationTokenHash(hash)).toBe(true);
  });

  it("is stable for the same token and different for another", async () => {
    const token = createInvitationToken();
    await expect(hashInvitationToken(token)).resolves.toBe(
      await hashInvitationToken(token),
    );
    await expect(hashInvitationToken(token)).resolves.not.toBe(
      await hashInvitationToken(createInvitationToken()),
    );
  });

  it("keeps a leading zero byte", async () => {
    // `toString(16)` without padding would produce 63 characters and fail the
    // column's check constraint — for one token in 256.
    const hashes = await Promise.all(
      Array.from({ length: 300 }, () =>
        hashInvitationToken(createInvitationToken()),
      ),
    );
    for (const hash of hashes) expect(hash).toHaveLength(64);
  });
});

describe("the shape checks", () => {
  it("refuses anything that is not a token", () => {
    for (const value of [
      "",
      "short",
      `${createInvitationToken()}a`, // too long
      createInvitationToken().slice(0, 42), // too short
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // padded
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+/.", // not URL-safe
      "../../etc/passwd",
      null,
      undefined,
      42,
      {},
    ]) {
      expect(isInvitationToken(value), String(value)).toBe(false);
    }
  });

  it("refuses anything that is not a digest", () => {
    for (const value of [
      "",
      "a".repeat(63),
      "a".repeat(65),
      "A".repeat(64), // upper case — not what the column stores
      `${"a".repeat(63)}g`,
      null,
      123,
    ]) {
      expect(isInvitationTokenHash(value), String(value)).toBe(false);
    }
  });
});

describe("invitationExpiry", () => {
  it("is seven days from the given moment", () => {
    const from = new Date("2026-10-15T09:00:00.000Z");
    expect(invitationExpiry(from).toISOString()).toBe(
      "2026-10-22T09:00:00.000Z",
    );
    expect(INVITATION_LIFETIME_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("defaults to now, and is always in the future", () => {
    const before = Date.now();
    const expiry = invitationExpiry().getTime();
    expect(expiry).toBeGreaterThanOrEqual(before + INVITATION_LIFETIME_MS);
    // The column's check constraint is `expires_at > created_at`.
    expect(expiry).toBeGreaterThan(Date.now());
  });

  it("does not mutate what it was given", () => {
    const from = new Date("2026-10-15T09:00:00.000Z");
    invitationExpiry(from);
    expect(from.toISOString()).toBe("2026-10-15T09:00:00.000Z");
  });
});

describe("what this module must never do", () => {
  it("logs nothing", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/lib/invitation-token.ts", "utf8");
    // A token printed once is a token that outlives its seven days, in a log
    // nobody is guarding.
    expect(source).not.toMatch(/console\./);
  });

  it("imports nothing", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("src/lib/invitation-token.ts", "utf8");
    // Pure by construction: no `node:crypto`, so it is safe in either
    // runtime, and no database, so it cannot be where a token is stored.
    expect(source).not.toMatch(/^import /m);
  });
});
