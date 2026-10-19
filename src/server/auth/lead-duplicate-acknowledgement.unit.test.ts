import { beforeAll, describe, expect, it } from "vitest";

import type { ParsedLead } from "@/lib/validation/leads";

/**
 * §32's warning, made into something the server can check — §130.1.
 *
 * The question these answer is not "is the code correct" but "can a client
 * skip the warning". Before this existed, posting `override=true` was taken
 * as approval; the permission was checked, but nothing established that a
 * warning had ever been shown.
 */

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ACTOR = "33333333-3333-4333-8333-333333333333";
const LEAD_ID = "88888888-8888-4888-8888-888888888888";
const OTHER_LEAD_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_ACTOR = "44444444-4444-4444-8444-444444444444";

const LEAD: ParsedLead = {
  name: "Rajesh Menon",
  phone: "+91 98765 43210",
  phoneNormalised: "+919876543210",
  phoneNeedsReview: false,
  email: null,
  emailNormalised: null,
  notes: null,
  stageId: "55555555-5555-4555-8555-555555555555",
  sourceId: null,
};

let issue: typeof import("./lead-duplicate-acknowledgement").issueDuplicateAcknowledgement;
let valid: typeof import("./lead-duplicate-acknowledgement").acknowledgementIsValid;

beforeAll(async () => {
  // The key is derived from DATABASE_URL, the one secret the application
  // cannot run without. Any value will do here; what matters is that it is
  // the same one for both halves.
  process.env.DATABASE_URL ||=
    "postgresql://app:secret@127.0.0.1:5432/postgres";
  const loaded = await import("./lead-duplicate-acknowledgement");
  issue = loaded.issueDuplicateAcknowledgement;
  valid = loaded.acknowledgementIsValid;
});

describe("an acknowledgement the server issued", () => {
  it("verifies for the same actor, workspace and submission", () => {
    const token = issue(WORKSPACE, ACTOR, null, LEAD);
    expect(valid(WORKSPACE, ACTOR, null, LEAD, token)).toBe(true);
  });

  it("carries nothing about the candidates it was shown for", () => {
    // It is a code over the SUBMISSION. Nothing about a record the actor may
    // not access can travel in it, because none of it goes in.
    const token = issue(WORKSPACE, ACTOR, null, LEAD);
    expect(token).toMatch(/^\d+\.[0-9a-f]{64}$/);
  });
});

describe("what it refuses", () => {
  it("refuses one issued to a different actor", () => {
    const token = issue(WORKSPACE, OTHER_ACTOR, null, LEAD);
    expect(valid(WORKSPACE, ACTOR, null, LEAD, token)).toBe(false);
  });

  it("refuses one issued while editing a different Lead", () => {
    const token = issue(WORKSPACE, ACTOR, OTHER_LEAD_ID, LEAD);
    expect(valid(WORKSPACE, ACTOR, LEAD_ID, LEAD, token)).toBe(false);
  });

  it("refuses a creation acknowledgement replayed against a Lead", () => {
    // The same submission, warned about while CREATING. Replaying it on an
    // edit would skip the warning the edit is entitled to.
    const token = issue(WORKSPACE, ACTOR, null, LEAD);
    expect(valid(WORKSPACE, ACTOR, LEAD_ID, LEAD, token)).toBe(false);
  });

  it("refuses an edit acknowledgement replayed against a creation", () => {
    const token = issue(WORKSPACE, ACTOR, LEAD_ID, LEAD);
    expect(valid(WORKSPACE, ACTOR, null, LEAD, token)).toBe(false);
  });

  it("accepts one issued for the same Lead", () => {
    const token = issue(WORKSPACE, ACTOR, LEAD_ID, LEAD);
    expect(valid(WORKSPACE, ACTOR, LEAD_ID, LEAD, token)).toBe(true);
  });

  it("refuses one issued in a different workspace", () => {
    const token = issue(OTHER_WORKSPACE, ACTOR, null, LEAD);
    expect(valid(WORKSPACE, ACTOR, null, LEAD, token)).toBe(false);
  });

  it.each([
    ["the name", { name: "R. Menon" }],
    ["the phone as entered", { phone: "+91 98765 43211" }],
    ["the normalised phone", { phoneNormalised: "+919876543211" }],
    [
      "the email",
      { email: "raj@example.com", emailNormalised: "raj@example.com" },
    ],
    ["the notes", { notes: "Called twice" }],
    ["the stage", { stageId: "66666666-6666-4666-8666-666666666666" }],
    ["the source", { sourceId: "77777777-7777-4777-8777-777777777777" }],
  ])("refuses it once %s changes", (_what, change) => {
    // "Changed data requires another warning" — the fingerprint covers every
    // value that would be written, so any edit invalidates the proof.
    const token = issue(WORKSPACE, ACTOR, null, LEAD);
    expect(valid(WORKSPACE, ACTOR, null, { ...LEAD, ...change }, token)).toBe(
      false,
    );
  });

  it("refuses a missing or malformed token", () => {
    for (const token of ["", "nonsense", ".", "123.", "abc.deadbeef", "0"]) {
      expect(valid(WORKSPACE, ACTOR, null, LEAD, token)).toBe(false);
    }
  });

  it("refuses a forged code against a real timestamp", () => {
    const token = issue(WORKSPACE, ACTOR, null, LEAD);
    const issuedAt = token.slice(0, token.indexOf("."));
    expect(
      valid(WORKSPACE, ACTOR, null, LEAD, `${issuedAt}.${"0".repeat(64)}`),
    ).toBe(false);
  });

  it("refuses one that has expired", () => {
    const token = issue(WORKSPACE, ACTOR, null, LEAD);
    const sixteenMinutes = 16 * 60 * 1000;
    expect(
      valid(WORKSPACE, ACTOR, null, LEAD, token, Date.now() + sixteenMinutes),
    ).toBe(false);
    // Still answerable a minute after it was issued.
    expect(
      valid(WORKSPACE, ACTOR, null, LEAD, token, Date.now() + 60_000),
    ).toBe(true);
  });

  it("refuses one stamped in the future", () => {
    const token = issue(WORKSPACE, ACTOR, null, LEAD);
    expect(
      valid(WORKSPACE, ACTOR, null, LEAD, token, Date.now() - 60_000),
    ).toBe(false);
  });
});
