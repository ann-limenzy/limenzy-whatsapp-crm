import { describe, expect, it } from "vitest";

import {
  matchedFields,
  normaliseEmail,
  normalisePhone,
  normaliseSearch,
  parseLead,
  MAX_LEAD_NAME,
} from "@/lib/validation/leads";

const valid = {
  name: "Rajesh Menon",
  phone: "+91 98765 43210",
  email: "",
  notes: "",
  stageId: "11111111-1111-4111-8111-111111111111",
  sourceId: "",
};

const issues = (input: Partial<typeof valid>) => {
  const result = parseLead({ ...valid, ...input });
  return result.ok ? [] : result.problems.map((p) => `${p.field}:${p.issue}`);
};

describe("§32 required fields", () => {
  it("requires a name", () => {
    expect(issues({ name: "   " })).toEqual(["name:name_required"]);
  });

  it("collapses inner whitespace in the name", () => {
    const result = parseLead({ ...valid, name: "  Rajesh   Menon  " });
    expect(result.ok && result.value.name).toBe("Rajesh Menon");
  });

  it("refuses a name longer than the column allows", () => {
    expect(issues({ name: "x".repeat(MAX_LEAD_NAME + 1) })).toEqual([
      "name:name_too_long",
    ]);
  });

  it("requires at least one contact method", () => {
    expect(issues({ phone: "", email: "" })).toEqual([
      "phone:contact_required",
    ]);
  });

  it("accepts an email alone", () => {
    const result = parseLead({ ...valid, phone: "", email: "a@b.co" });
    expect(result.ok).toBe(true);
  });

  it("accepts a phone alone", () => {
    expect(parseLead({ ...valid, email: "" }).ok).toBe(true);
  });

  it("does not report contact_required on top of a malformed email", () => {
    // One problem per thing wrong with it. Saying "give us a contact" when a
    // contact was given, badly, sends the person looking in the wrong place.
    expect(issues({ phone: "", email: "not-an-email" })).toEqual([
      "email:email_malformed",
    ]);
  });

  it("requires a stage", () => {
    expect(issues({ stageId: "" })).toEqual(["stageId:stage_required"]);
  });

  it("reports every problem at once", () => {
    expect(
      issues({ name: "", phone: "", email: "", stageId: "" }).sort(),
    ).toEqual([
      "name:name_required",
      "phone:contact_required",
      "stageId:stage_required",
    ]);
  });
});

describe("§130.1 phone normalisation", () => {
  it("normalises an international number, ignoring display formatting", () => {
    for (const written of [
      "+919876543210",
      "+91 98765 43210",
      "+91-98765-43210",
      "+91 (98765) 43210",
    ]) {
      expect(normalisePhone(written)).toBe("+919876543210");
    }
  });

  it("refuses to invent a country code", () => {
    // §130.1: "The system must not invent a country code when it cannot be
    // determined safely." A national-format number has no country context
    // here, so it normalises to nothing rather than to a guess.
    expect(normalisePhone("98765 43210")).toBeNull();
    expect(normalisePhone("09876543210")).toBeNull();
  });

  it("refuses a country code that cannot exist", () => {
    expect(normalisePhone("+0123456789")).toBeNull();
  });

  it("refuses numbers outside E.164's length", () => {
    expect(normalisePhone("+12345")).toBeNull();
    expect(normalisePhone(`+1${"2".repeat(15)}`)).toBeNull();
  });

  it("flags for review rather than rewriting, and keeps what was typed", () => {
    const result = parseLead({ ...valid, phone: "98765 43210" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.phone).toBe("98765 43210");
    expect(result.value.phoneNormalised).toBeNull();
    expect(result.value.phoneNeedsReview).toBe(true);
  });

  it("does not flag a number it could normalise", () => {
    const result = parseLead({ ...valid, phone: "+91 98765 43210" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.phone).toBe("+91 98765 43210");
    expect(result.value.phoneNormalised).toBe("+919876543210");
    expect(result.value.phoneNeedsReview).toBe(false);
  });

  it("rejects something that is not a phone number at all", () => {
    expect(issues({ phone: "call me" })).toEqual(["phone:phone_not_a_number"]);
  });
});

describe("§130.1 email normalisation", () => {
  it("trims and lowercases for comparison, keeping what was typed", () => {
    const result = parseLead({ ...valid, email: "  Rajesh@Example.COM " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe("Rajesh@Example.COM");
    expect(result.value.emailNormalised).toBe("rajesh@example.com");
  });

  it("applies no provider-specific transformation", () => {
    // §130.1 is explicit: dots are not removed and a +tag is not stripped,
    // "because those are provider-specific conventions and treating them as
    // equivalent would merge distinct addresses".
    expect(normaliseEmail("First.Last+crm@Example.com")).toBe(
      "first.last+crm@example.com",
    );
  });

  it("rejects an address with no structure", () => {
    expect(issues({ email: "rajesh@" })).toEqual(["email:email_malformed"]);
  });
});

describe("§130.1 matching strength", () => {
  const candidate = {
    phoneNormalised: "+919876543210",
    emailNormalised: "a@b.co",
  };

  it("reports a phone match", () => {
    expect(
      matchedFields(candidate, {
        phoneNormalised: "+919876543210",
        emailNormalised: null,
      }),
    ).toEqual(["phone"]);
  });

  it("reports both when both match", () => {
    expect(matchedFields(candidate, candidate)).toEqual(["phone", "email"]);
  });

  it("never matches on a value that was not given", () => {
    // Two leads with no email must not be "the same" because both are null.
    expect(
      matchedFields(
        { phoneNormalised: null, emailNormalised: null },
        { phoneNormalised: null, emailNormalised: null },
      ),
    ).toEqual([]);
  });
});

describe("the §31 search term", () => {
  it("collapses whitespace and caps the length", () => {
    expect(normaliseSearch("  rajesh   menon ")).toBe("rajesh menon");
    expect(normaliseSearch("x".repeat(500))).toHaveLength(100);
  });
});

describe("optional fields", () => {
  it("stores an empty source and empty notes as null, not as ''", () => {
    const result = parseLead({ ...valid, notes: "   ", sourceId: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.notes).toBeNull();
    expect(result.value.sourceId).toBeNull();
  });
});
