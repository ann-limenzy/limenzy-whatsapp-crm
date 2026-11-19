import { describe, expect, it } from "vitest";

import {
  createSafeConsole,
  describeUrl,
  redact,
  redactError,
} from "../../scripts/redact-secrets.mjs";

/**
 * Offline proof that credentials cannot reach output.
 *
 * Every case below uses the same FICTIONAL password, chosen to be awkward on
 * purpose: it contains the bracket characters that caused a real leak, plus
 * `@`, `:` and `/`, which are exactly the characters that make a connection
 * string ambiguous to a naive regex.
 *
 * Nothing here connects to anything.
 */
const PASSWORD = "Fict1t10us-P@ss[word]/here:X";
const ENCODED = encodeURIComponent(PASSWORD);
const URL_WITH_SECRET = `postgresql://postgres.abcdefghijklmnopqrst:${ENCODED}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;

/** The single assertion that matters, applied to every shape of output. */
const leaks = (text: string) =>
  text.includes(PASSWORD) || text.includes(ENCODED);

describe("redact", () => {
  it("removes the password from a connection string", () => {
    const out = redact(URL_WITH_SECRET, [PASSWORD]);
    expect(leaks(out)).toBe(false);
    /* Still useful: host, port and database survive. */
    expect(out).toContain("aws-0-ap-northeast-1.pooler.supabase.com");
    expect(out).toContain("5432");
    expect(out).toContain("postgres");
  });

  it("removes a bare password even outside a URL", () => {
    /*
     * The real leak was of this shape: a diagnostic explaining a value,
     * with no URL anywhere in the string.
     */
    const out = redact(`decoded password is [${PASSWORD}]`, [PASSWORD]);
    expect(leaks(out)).toBe(false);
    expect(out).toContain("***");
  });

  it("removes the percent-encoded form", () => {
    const out = redact(`url pass segment: ${ENCODED}`, [PASSWORD]);
    expect(leaks(out)).toBe(false);
  });

  it("strips user info even when the password is not supplied", () => {
    /* The URL rule must not depend on knowing the secret. */
    const out = redact(URL_WITH_SECRET, []);
    expect(leaks(out)).toBe(false);
    expect(out).toContain("<redacted>@");
  });

  it("leaves an ordinary URL alone", () => {
    const plain = "https://supabase.com/docs/guides/cli";
    expect(redact(plain, [PASSWORD])).toBe(plain);
  });

  it("handles several URLs in one string", () => {
    const out = redact(`a=${URL_WITH_SECRET} b=${URL_WITH_SECRET}`, []);
    expect(leaks(out)).toBe(false);
    expect(out.match(/<redacted>@/g)).toHaveLength(2);
  });
});

describe("redactError", () => {
  it("cleans a message that quotes the connection string", () => {
    const error = new Error(`failed to connect to ${URL_WITH_SECRET}`);
    expect(leaks(redactError(error, [PASSWORD]))).toBe(false);
  });

  it("cleans driver fields beside the message", () => {
    const error = Object.assign(new Error("password authentication failed"), {
      code: "28P01",
      severity: "FATAL",
      detail: `connection string was ${URL_WITH_SECRET}`,
    });
    const out = redactError(error, [PASSWORD]);
    expect(leaks(out)).toBe(false);
    expect(out).toContain("28P01");
  });

  it("survives a thrown non-Error", () => {
    expect(leaks(redactError(URL_WITH_SECRET, [PASSWORD]))).toBe(false);
  });
});

describe("createSafeConsole", () => {
  it("cleans every argument of every method", () => {
    const written: string[] = [];
    const sink = {
      log: (...a: unknown[]) => written.push(a.join(" ")),
      warn: (...a: unknown[]) => written.push(a.join(" ")),
      error: (...a: unknown[]) => written.push(a.join(" ")),
    };
    const safe = createSafeConsole([PASSWORD], sink as unknown as Console);

    safe.log("url", URL_WITH_SECRET);
    safe.warn(`password is ${PASSWORD}`);
    safe.error(`encoded ${ENCODED}`);

    expect(written).toHaveLength(3);
    for (const line of written) expect(leaks(line)).toBe(false);
  });
});

describe("describeUrl", () => {
  it("keeps the non-secret identity and nothing else", () => {
    const described = describeUrl(URL_WITH_SECRET);
    expect(leaks(described)).toBe(false);
    expect(described).not.toContain("postgres.abcdefghijklmnopqrst");
    expect(described).toContain(
      "aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
    );
  });

  it("refuses to echo an unparseable value", () => {
    expect(describeUrl(`not a url ${PASSWORD}`)).toBe("<redacted-url>");
  });
});
