import { describe, expect, it } from "vitest";

import { parseBusinessSettings } from "./business-settings";

/**
 * Business Settings validation — spec §158.
 *
 * The parser is shared: the form uses it for inline feedback and the Server
 * Action re-runs it on the submission. These tests are therefore about the
 * contract both sides rely on, not about either one of them.
 *
 * No test here asserts that a rejected value is echoed back in a message.
 * That is deliberate — a rejected phone number or address is the submitter's
 * data, and naming the field is enough to fix it.
 */

const VALID = {
  name: "Limenzy Fincare",
  businessType: "Financial / Insurance",
  businessPhone: "+91 80 4000 1234",
  businessEmail: "hello@example.com",
  address: "12 Example Road\nBengaluru 560001",
  country: "IN",
  currency: "INR",
  timeZone: "Asia/Kolkata",
};

/** The first message raised against a field, or undefined if it passed. */
const issueFor = (input: unknown, field: string) => {
  const parsed = parseBusinessSettings(input);
  if (parsed.ok) return undefined;
  return parsed.issues.find((issue) => issue.field === field)?.message;
};

const parseWith = (overrides: Record<string, unknown>) =>
  parseBusinessSettings({ ...VALID, ...overrides });

describe("a complete submission", () => {
  it("accepts the eight §158 fields", () => {
    const parsed = parseBusinessSettings(VALID);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).toEqual(VALID);
  });

  it("trims surrounding whitespace rather than storing it", () => {
    const parsed = parseWith({
      name: "  Limenzy Fincare  ",
      businessPhone: "  +91 80 4000 1234 ",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.name).toBe("Limenzy Fincare");
      expect(parsed.value.businessPhone).toBe("+91 80 4000 1234");
    }
  });

  it("upper-cases the country and currency codes", () => {
    const parsed = parseWith({ country: "in", currency: "inr" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.country).toBe("IN");
      expect(parsed.value.currency).toBe("INR");
    }
  });

  it("leaves the business email's capitals alone", () => {
    // Unlike the sign-in address, which is an identity and is lower-cased.
    const parsed = parseWith({ businessEmail: "Hello@Example.com" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.businessEmail).toBe("Hello@Example.com");
  });
});

describe("clearing an optional field stores NULL, never an empty string", () => {
  const OPTIONAL = [
    "businessType",
    "businessPhone",
    "businessEmail",
    "address",
  ] as const;

  it.each(OPTIONAL)("treats an empty %s as cleared", (field) => {
    const parsed = parseWith({ [field]: "" });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value[field]).toBeNull();
  });

  it.each(OPTIONAL)("treats a whitespace-only %s as cleared", (field) => {
    const parsed = parseWith({ [field]: "   " });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value[field]).toBeNull();
  });

  it.each(OPTIONAL)("treats an absent %s as cleared", (field) => {
    const input: Record<string, unknown> = { ...VALID };
    delete input[field];
    const parsed = parseBusinessSettings(input);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value[field]).toBeNull();
  });

  it("clears every optional field at once", () => {
    const parsed = parseWith({
      businessType: "",
      businessPhone: "",
      businessEmail: "",
      address: "",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toEqual({
        name: VALID.name,
        businessType: null,
        businessPhone: null,
        businessEmail: null,
        address: null,
        country: "IN",
        currency: "INR",
        timeZone: "Asia/Kolkata",
      });
    }
  });
});

describe("the four required fields are required", () => {
  it.each([
    ["name", "Enter your business name"],
    ["country", "Select a country"],
    ["currency", "Select a currency"],
    ["timeZone", "Select a time zone"],
  ])("rejects an empty %s", (field) => {
    expect(issueFor({ ...VALID, [field]: "" }, field)).toBeDefined();
  });

  it.each(["name", "country", "currency", "timeZone"])(
    "rejects a missing %s rather than defaulting it",
    (field) => {
      const input: Record<string, unknown> = { ...VALID };
      delete input[field];
      expect(issueFor(input, field)).toBeDefined();
    },
  );

  it("rejects a whitespace-only name instead of clearing it", () => {
    // A required field submitted blank is an error, not a clear — the other
    // half of the rule the optional fields follow.
    expect(issueFor({ ...VALID, name: "   " }, "name")).toBeDefined();
  });

  it("rejects a one-character name", () => {
    expect(issueFor({ ...VALID, name: "L" }, "name")).toBeDefined();
  });

  it("rejects a name beyond 160 characters", () => {
    expect(issueFor({ ...VALID, name: "L".repeat(161) }, "name")).toBeDefined();
    const parsed = parseWith({ name: "L".repeat(160) });
    expect(parsed.ok).toBe(true);
  });
});

describe("codes are checked against the approved lists", () => {
  it.each([
    ["country", "ZZ"],
    // XK is user-assigned, not an ISO-assigned code, and ICU will happily name
    // it — which is exactly why the list is a local allow-list, not a lookup.
    ["country", "XK"],
    ["currency", "XYZ"],
    ["currency", "BTC"],
    ["timeZone", "Mars/Olympus"],
    ["timeZone", "asia/kolkata"],
  ])("rejects %s = %s", (field, value) => {
    expect(issueFor({ ...VALID, [field]: value }, field)).toBeDefined();
  });

  it("trims a code before checking it", () => {
    const parsed = parseWith({ country: " in ", timeZone: " Asia/Kolkata " });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.country).toBe("IN");
      expect(parsed.value.timeZone).toBe("Asia/Kolkata");
    }
  });
});

describe("the business email is checked for shape, not deliverability", () => {
  it.each([
    "not-an-address",
    "no@domain",
    "two spaces@example.com",
    "@example.com",
  ])("rejects %s", (value) => {
    expect(
      issueFor({ ...VALID, businessEmail: value }, "businessEmail"),
    ).toBeDefined();
  });

  it.each(["owner@example.co.in", "first.last+tag@sub.example.org", "a@b.co"])(
    "accepts %s",
    (value) => {
      expect(parseWith({ businessEmail: value }).ok).toBe(true);
    },
  );

  it("rejects an address beyond 254 characters", () => {
    const long = `${"a".repeat(250)}@example.com`;
    expect(
      issueFor({ ...VALID, businessEmail: long }, "businessEmail"),
    ).toBeDefined();
  });
});

describe("control characters are rejected, not stripped", () => {
  it.each([
    ["name", "Limenzy\u0000Fincare"],
    ["name", "Limenzy\nFincare"],
    ["businessType", "Finance\u001b[31m"],
    ["businessPhone", "+91 80\u00854000"],
  ])("rejects a control character in %s", (field, value) => {
    expect(issueFor({ ...VALID, [field]: value }, field)).toBeDefined();
  });

  it("allows newlines in the address, because an address has lines", () => {
    const parsed = parseWith({ address: "Line one\nLine two\r\nLine three" });
    expect(parsed.ok).toBe(true);
  });

  it("stores one kind of line break, whatever the client sent", () => {
    // A browser submits a textarea with CRLF; everything else sends LF. Both
    // have to reach the database as the same text, or the stored address
    // depends on what happened to send it.
    for (const sent of [
      "Line one\r\nLine two",
      "Line one\nLine two",
      "Line one\rLine two",
    ]) {
      const parsed = parseWith({ address: sent });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.value.address).toBe("Line one\nLine two");
    }
  });

  it("counts a normalised line break as one character for the limit", () => {
    // Normalisation runs before the length check, so a CRLF costs one
    // character rather than two. 249 + CRLF + 250 is 500, and one more is 501.
    const fits = `${"x".repeat(249)}\r\n${"x".repeat(250)}`;
    const parsed = parseWith({ address: fits });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.address?.length).toBe(500);

    const overflows = `${"x".repeat(250)}\r\n${"x".repeat(250)}`;
    expect(issueFor({ ...VALID, address: overflows }, "address")).toBeDefined();
  });

  it("still rejects other control characters in the address", () => {
    expect(
      issueFor({ ...VALID, address: "Line\u0000one" }, "address"),
    ).toBeDefined();
  });
});

describe("lengths", () => {
  it.each([
    ["businessType", 120],
    ["businessPhone", 40],
    ["address", 500],
  ])("accepts %s at %i characters and rejects one more", (field, limit) => {
    expect(parseWith({ [field]: "x".repeat(limit) }).ok).toBe(true);
    expect(
      issueFor({ ...VALID, [field]: "x".repeat(limit + 1) }, field),
    ).toBeDefined();
  });
});

describe("anything the form did not send is reported, not ignored", () => {
  it("rejects an unexpected key", () => {
    const parsed = parseBusinessSettings({ ...VALID, role: "owner_admin" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      // strictObject attributes it to no known field, so it lands on `form`
      // rather than disappearing.
      expect(parsed.issues.some((issue) => issue.field === "form")).toBe(true);
    }
  });

  it.each([["workspaceId"], ["id"], ["enabledModules"]])(
    "rejects %s, which this form has no business carrying",
    (key) => {
      expect(parseBusinessSettings({ ...VALID, [key]: "x" }).ok).toBe(false);
    },
  );

  it("rejects a non-object submission", () => {
    expect(parseBusinessSettings(null).ok).toBe(false);
    expect(parseBusinessSettings("name=Limenzy").ok).toBe(false);
    expect(parseBusinessSettings([]).ok).toBe(false);
  });

  it("rejects a non-string value in a text field", () => {
    expect(parseBusinessSettings({ ...VALID, name: 42 }).ok).toBe(false);
    expect(parseBusinessSettings({ ...VALID, address: ["a", "b"] }).ok).toBe(
      false,
    );
  });
});

describe("every issue names a field the form can show it beside", () => {
  it("attributes each issue to a known field or to the form", () => {
    const parsed = parseBusinessSettings({
      name: "",
      businessType: "x".repeat(200),
      businessPhone: "x".repeat(60),
      businessEmail: "nope",
      address: "x".repeat(600),
      country: "ZZ",
      currency: "XYZ",
      timeZone: "Mars/Olympus",
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;

    const known = new Set([
      "name",
      "businessType",
      "businessPhone",
      "businessEmail",
      "address",
      "country",
      "currency",
      "timeZone",
      "form",
    ]);
    expect(parsed.issues.length).toBeGreaterThanOrEqual(8);
    for (const issue of parsed.issues) {
      expect(known.has(issue.field)).toBe(true);
      expect(issue.message.length).toBeGreaterThan(0);
    }
  });
});
