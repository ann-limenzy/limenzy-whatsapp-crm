import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCacheForTests } from "@/lib/env";

import { POOL_OPTIONS, createRuntimePool } from "./client";
import {
  DatabaseTlsConfigurationError,
  type RuntimeTlsOptions,
  assertNoOverridingUrlParameters,
  isLoopbackHost,
  normaliseHostname,
  parseCaCertificates,
  runtimeTlsOptions,
} from "./tls";

/**
 * The driver is replaced wholesale. `createRuntimePool` is exercised for the
 * options object it builds, and nothing else: no socket is opened, no DNS
 * lookup happens and no database is contacted. The factory records its
 * arguments and returns a sentinel.
 */
const poolSentinel = { sentinel: "pool" } as const;
const postgresFactory = vi.fn(() => poolSentinel);
vi.mock("postgres", () => ({
  default: (...args: unknown[]) => postgresFactory(...(args as [])),
}));

/**
 * Drizzle is mocked for the same reason the driver is.
 *
 * `createRuntimePool` builds the Drizzle handle as it creates the pool, so the
 * parser contract is fixed at pool creation rather than at the first query.
 * The real `drizzle()` would reach into `poolSentinel.options`, which a
 * sentinel does not have — and constructing a real Drizzle here would prove
 * nothing about TLS. The factory records its arguments and returns a sentinel.
 */
const dbSentinel = { sentinel: "db" } as const;
const drizzleFactory = vi.fn(() => dbSentinel);
vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: (...args: unknown[]) => drizzleFactory(...(args as [])),
}));

/**
 * Transport-security contract for the runtime database connection.
 *
 * Everything here is offline. No pool is constructed, no socket is opened and
 * no database is contacted: `runtimeTlsOptions` is a pure function of a URL
 * string and a PEM string, which is why the TLS decision lives in its own
 * module rather than inside `createRuntimePool`.
 *
 * The certificates below are SYNTHETIC, generated for this test alone with
 * `openssl req -x509`. They are self-signed throwaways, carry no private key,
 * and have no relationship to any real provider. Nothing in this file is a
 * credential.
 */

const SYNTHETIC_CA_PEM = `\n-----BEGIN CERTIFICATE-----
MIIDKTCCAhGgAwIBAgIUT8+ErVdKOgJeUDnyzylso92V8UIwDQYJKoZIhvcNAQEL
BQAwJDEiMCAGA1UEAwwZTGltZW56eSBTeW50aGV0aWMgVGVzdCBDQTAeFw0yNjEw
MTMxMDM5MjhaFw0zNjEwMTAxMDM5MjhaMCQxIjAgBgNVBAMMGUxpbWVuenkgU3lu
dGhldGljIFRlc3QgQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQCY
yHu5ShOQBXe9pYqUFLX5Vl6OnmGc8dL8MkjaL7EDyhV1rGHxgB1QLgs1qVChJvjJ
QVoV3sNhlZjnNuCaiPwo+FfHFEKX3irFC9lqlCxy2pSMPDkkaIu669ZNJOSwU5IL
/To4NRWmvkhUxgz8CWms/Inpm9qrLanPYSnMZ0JMeAzCtKUxmTaOdy8o8HL3ObS6
JfcRDU4Pu6wETsiQ6btVi7pfAftoj3SAUhWDij8K1qP1zrQ4nS6ruZe9lTDzOFab
JXRj3oOWTnNBGAQOTQUjp0POIIxv1z5QS+Dmheli9aHweejNhC2qhTo+tVIw8g8g
tXjiPMC6IBaKidmizuQrAgMBAAGjUzBRMB0GA1UdDgQWBBTRHpQ7iytZt9eNpThv
LcVvYSizOTAfBgNVHSMEGDAWgBTRHpQ7iytZt9eNpThvLcVvYSizOTAPBgNVHRMB
Af8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQB30N0lGPgEr2B/P6BbJ8DYBLiJ
l8S18zf+SY+vEj3KvM9iUZ0iBj00jMxIIjl1eO2t1bBamvoaK5uy3WIEnmapZuxt
Uo+eP+It6fxLmqLrfMaN7x2L1wQ1gMVB68X6zu6HyXfXmT7PzHWExVQllHPPd6zO
h1VBUir3LXEL3In6bic86GE6ACFRk6v/eVmmR8I7aDqNjlmPaSzHX/5FkKZnEDwS
o+GdkJjNitWZborttjrVe9YmTSJhYU9ErzIw8WNBzQnk7SZi426gvV1pi8D8WWcB
YTDVU3wXpOlqA9Tl+koY+tiTkZq93sg6F7q297Gdi8OvqW69VR1cpSIbadYJ
-----END CERTIFICATE-----\n`;

/** Signed by the CA above, but CA:FALSE — an end-entity certificate. */
const SYNTHETIC_LEAF_PEM = `\n-----BEGIN CERTIFICATE-----
MIIDFTCCAf2gAwIBAgIUZD2XljZt1+90GeAtAoQePK9FQOMwDQYJKoZIhvcNAQEL
BQAwJDEiMCAGA1UEAwwZTGltZW56eSBTeW50aGV0aWMgVGVzdCBDQTAeFw0yNjEw
MTMxMDM5MjhaFw0zNjEwMTAxMDM5MjhaMCExHzAdBgNVBAMMFmxpbWVuenktc3lu
dGhldGljLWxlYWYwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC/tdWP
J0zJils6kuDaO//canuL9DycBAyPUTyj8DmLZaP9K/fI5lIfc44RTipcuwLXRDz7
pYybn66kbxkC3twsW4oF62xjiItZ0QbwDLEiqu/FTCTq3SqVpbKYMYMYE/VlpY/9
OQzODKrucUJXO6cSeKAF8XjCtWKZUl7/BJbu+o0nYbuFis4bsWdj70hDJtHwVT+E
fLF74UIm3MtVWDaS9Z0JjvL1ftjYLIFh3p9TjupI4JtOZCQ/ls4HSS2eYpEfeFex
LJ9NKZYD/JHxRDLZZ/wpBp2R4S18mDgtyQz18I4CnM9QIHKVgP5lVo9A4nbuACXY
EzDoxchF4HY0S4x1AgMBAAGjQjBAMB0GA1UdDgQWBBRVSmUKZPszs/6zfIWluYNb
Jdtg5zAfBgNVHSMEGDAWgBTRHpQ7iytZt9eNpThvLcVvYSizOTANBgkqhkiG9w0B
AQsFAAOCAQEAehqSnGQsra2PW2hBMxz+I4cZvRpn4SSA5iM3z8Vz5XN50ySZN328
8lH9klJfFiBFmX6c5Y0YdveN1GB89ANoMi0AkwH0O73v9yjFHG4sR8gdLm6O9CqQ
tyBUArruwxh+sL3f7RltW0xpGvZA7LOx6ivkDC22eW33z0nM+96OrIJftpZu0q4c
VIMgLpsIh8cOhCbNfV6oDpjRUOv8MzQhC7pQMSMhmrqkr2yPf3gewp4j6cWqPZyH
Tcz9+ART01vCZWUjIUPebW9NTjqRDwjI9WCs4McgigYSvOEfOsWYTcYUSWr4kz5i
ujShlop8Lg6AS3VEwaqu/xdHP961/8MyBA==
-----END CERTIFICATE-----\n`;

/** Narrow `ssl` to the verified-TLS object, failing the test if it is `false`. */
function verifiedTls(options: RuntimeTlsOptions) {
  expect(options.ssl).not.toBe(false);
  return options.ssl as Exclude<RuntimeTlsOptions["ssl"], false>;
}

const REMOTE = "aws-0-ap-northeast-2.pooler.supabase.com";
const remoteUrl = (query = "") =>
  `postgresql://limenzy_app.abc123:FixturePasswordNotReal@${REMOTE}:6543/postgres${query}`;
const localUrl = (host: string) =>
  `postgresql://limenzy_app:FixturePasswordNotReal@${host}:54322/postgres`;

describe("normaliseHostname", () => {
  it("lower-cases, because postgresql:// is not a WHATWG special scheme", () => {
    // The parser leaves an opaque host's case alone, so a comparison must not.
    expect(normaliseHostname("LOCALHOST")).toBe("localhost");
    expect(new URL(localUrl("LOCALHOST")).hostname).toBe("LOCALHOST");
  });

  it("strips the brackets an IPv6 literal keeps after parsing", () => {
    expect(normaliseHostname("[::1]")).toBe("::1");
    expect(new URL(localUrl("[::1]")).hostname).toBe("[::1]");
  });
});

describe("isLoopbackHost", () => {
  it.each(["localhost", "127.0.0.1", "::1", "LocalHost", "[::1]"])(
    "exempts the loopback literal %s",
    (host) => {
      expect(isLoopbackHost(host)).toBe(true);
    },
  );

  it.each([
    // Loopback to the kernel, but not what the local stack produces.
    "127.0.0.2",
    "127.1.1.1",
    // Wildcards are not loopback.
    "0.0.0.0",
    "::",
    "[::]",
    // A suffix rule would exempt a name anyone can register.
    "localhost.evil.com",
    "sub.localhost",
    "notlocalhost",
    // Private ranges are remote.
    "10.0.0.5",
    "192.168.1.10",
    "172.16.0.1",
    REMOTE,
  ])("does not exempt %s", (host) => {
    expect(isLoopbackHost(host)).toBe(false);
  });
});

describe("parseCaCertificates", () => {
  it("accepts real multiline PEM and returns certificate material", () => {
    const parsed = parseCaCertificates(SYNTHETIC_CA_PEM);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toContain("BEGIN CERTIFICATE");
  });

  it("accepts a bundle of several CA certificates", () => {
    const parsed = parseCaCertificates(
      `${SYNTHETIC_CA_PEM}\n${SYNTHETIC_CA_PEM}`,
    );
    expect(parsed).toHaveLength(2);
  });

  it("rejects an empty value", () => {
    expect(() => parseCaCertificates("   ")).toThrow(
      DatabaseTlsConfigurationError,
    );
  });

  it("rejects text with no PEM block", () => {
    expect(() => parseCaCertificates("not a certificate")).toThrow(
      /not a well-formed PEM certificate bundle/,
    );
  });

  it("rejects a header with no matching END block", () => {
    expect(() =>
      parseCaCertificates("-----BEGIN CERTIFICATE-----\nMIIB"),
    ).toThrow(/not a well-formed PEM certificate bundle/);
  });

  it("rejects base64 that is not a certificate, which a substring check would accept", () => {
    const fake =
      "-----BEGIN CERTIFICATE-----\n" +
      "bm90IGEgY2VydGlmaWNhdGUgYXQgYWxsLCBqdXN0IGJhc2U2NA==\n" +
      "-----END CERTIFICATE-----";
    expect(fake).toContain("BEGIN CERTIFICATE");
    expect(() => parseCaCertificates(fake)).toThrow(
      /not a valid X.509 certificate/,
    );
  });

  it("rejects an end-entity certificate", () => {
    expect(() => parseCaCertificates(SYNTHETIC_LEAF_PEM)).toThrow(
      /end-entity certificate/,
    );
  });

  it("rejects a private key pasted into the variable", () => {
    const withKey = `${SYNTHETIC_CA_PEM}\n-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----`;
    expect(() => parseCaCertificates(withKey)).toThrow(
      DatabaseTlsConfigurationError,
    );
  });

  it("names the variable without echoing its value", () => {
    try {
      parseCaCertificates(SYNTHETIC_LEAF_PEM);
      expect.unreachable("parseCaCertificates should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("DATABASE_CA_CERT");
      expect(message).not.toContain("MII");
    }
  });

  // The whole input must be consumed. A scan-for-blocks parser accepts every
  // one of these by picking the good part out and discarding the rest.
  describe("consumes the entire input", () => {
    it("rejects trailing garbage after a valid block", () => {
      expect(() =>
        parseCaCertificates(`${SYNTHETIC_CA_PEM}\nand then some junk`),
      ).toThrow(DatabaseTlsConfigurationError);
    });

    it("rejects leading garbage before a valid block", () => {
      expect(() =>
        parseCaCertificates(`junk before\n${SYNTHETIC_CA_PEM}`),
      ).toThrow(DatabaseTlsConfigurationError);
    });

    it("rejects an unmatched footer", () => {
      expect(() => parseCaCertificates("-----END CERTIFICATE-----")).toThrow(
        DatabaseTlsConfigurationError,
      );
    });

    it("rejects a header with no footer", () => {
      expect(() =>
        parseCaCertificates("-----BEGIN CERTIFICATE-----\nMIIB\n"),
      ).toThrow(DatabaseTlsConfigurationError);
    });

    it("rejects a valid certificate followed by a TRUNCATED second block", () => {
      const truncated = `${SYNTHETIC_CA_PEM}\n-----BEGIN CERTIFICATE-----\nMIIB`;
      expect(() => parseCaCertificates(truncated)).toThrow(
        DatabaseTlsConfigurationError,
      );
    });

    it("rejects a valid certificate followed by a MALFORMED second block", () => {
      const malformed =
        `${SYNTHETIC_CA_PEM}\n` +
        "-----BEGIN CERTIFICATE-----\n" +
        "bm90IGEgY2VydGlmaWNhdGUgYXQgYWxsLCBqdXN0IGJhc2U2NA==\n" +
        "-----END CERTIFICATE-----";
      expect(() => parseCaCertificates(malformed)).toThrow(
        /block 2 is not a valid X.509 certificate/,
      );
    });

    it("rejects a nested BEGIN inside a block rather than swallowing it", () => {
      const nested =
        "-----BEGIN CERTIFICATE-----\n" +
        "-----BEGIN CERTIFICATE-----\nMIIB\n" +
        "-----END CERTIFICATE-----";
      expect(() => parseCaCertificates(nested)).toThrow(
        DatabaseTlsConfigurationError,
      );
    });

    it("discards nothing: the good block in a bad value is not returned", () => {
      // The clearest statement of the rule. A lenient parser returns [cert].
      expect(() =>
        parseCaCertificates(`${SYNTHETIC_CA_PEM}\n-----BEGIN PRIVATE KEY-----`),
      ).toThrow(DatabaseTlsConfigurationError);
    });

    it("accepts a bundle separated by blank lines and surrounding whitespace", () => {
      const bundle = `\n\n  ${SYNTHETIC_CA_PEM}\n\n\n${SYNTHETIC_CA_PEM}\n  \n`;
      expect(parseCaCertificates(bundle)).toHaveLength(2);
    });

    it("accepts a bundle with CRLF line endings", () => {
      const crlf = SYNTHETIC_CA_PEM.replace(/\n/g, "\r\n");
      expect(parseCaCertificates(`${crlf}\r\n${crlf}`)).toHaveLength(2);
    });

    it("never echoes an input-derived PEM label or any content", () => {
      const withKey = `${SYNTHETIC_CA_PEM}\n-----BEGIN RSA PRIVATE KEY-----\nSECRETKEYBYTES\n-----END RSA PRIVATE KEY-----`;
      try {
        parseCaCertificates(withKey);
        expect.unreachable("parseCaCertificates should have thrown");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("DATABASE_CA_CERT");
        // The label came from the input; repeating it back is an echo.
        expect(message).not.toContain("RSA PRIVATE KEY");
        expect(message).not.toContain("SECRETKEYBYTES");
        expect(message).not.toContain("MII");
      }
    });
  });

  it("does not silently repair a malformed value", () => {
    // Body mangled; a lenient parser might re-flow it. This one must not.
    const mangled = SYNTHETIC_CA_PEM.replace(/MII/, "XXX");
    expect(() => parseCaCertificates(mangled)).toThrow(
      DatabaseTlsConfigurationError,
    );
  });
});

describe("assertNoOverridingUrlParameters", () => {
  it.each([
    "?sslmode=require",
    "?ssl=false",
    "?sslrootcert=/tmp/other.crt",
    "?sslcert=/tmp/c.pem",
    "?sslkey=/tmp/k.pem",
    "?sslnegotiation=direct",
    "?host=evil.example.com",
    "?port=5432",
    "?dbname=other",
    "?user=postgres",
    "?options=-c%20search_path%3Dpublic",
    "?target_session_attrs=any",
  ])("refuses %s", (query) => {
    expect(() =>
      assertNoOverridingUrlParameters(new URL(remoteUrl(query))),
    ).toThrow(DatabaseTlsConfigurationError);
  });

  it("matches the parameter name case-insensitively", () => {
    expect(() =>
      assertNoOverridingUrlParameters(new URL(remoteUrl("?SSLMODE=require"))),
    ).toThrow(DatabaseTlsConfigurationError);
  });

  it("names the parameter but never its value", () => {
    try {
      assertNoOverridingUrlParameters(
        new URL(remoteUrl("?sslpassword=NotARealSecret")),
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("sslpassword");
      expect(message).not.toContain("NotARealSecret");
    }
  });

  it("allows a URL with no query string", () => {
    expect(() =>
      assertNoOverridingUrlParameters(new URL(remoteUrl())),
    ).not.toThrow();
  });
});

describe("runtimeTlsOptions — local development", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "connects without TLS and without a CA for %s",
    (host) => {
      // `ssl: false` is stated, not omitted: see RuntimeTlsOptions.
      expect(runtimeTlsOptions(localUrl(host))).toEqual({ ssl: false });
    },
  );

  it("states ssl explicitly so an ambient PGSSL cannot supply it", () => {
    const options = runtimeTlsOptions(localUrl("127.0.0.1"));
    expect("ssl" in options).toBe(true);
    expect(options.ssl).toBe(false);
  });

  it("still keeps verified TLS when a CA is configured locally", () => {
    const ssl = verifiedTls(
      runtimeTlsOptions(localUrl("localhost"), SYNTHETIC_CA_PEM),
    );
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.servername).toBe("localhost");
  });

  it("refuses a malformed CA even on loopback", () => {
    expect(() => runtimeTlsOptions(localUrl("localhost"), "nonsense")).toThrow(
      DatabaseTlsConfigurationError,
    );
  });
});

describe("runtimeTlsOptions — remote targets", () => {
  it("refuses a remote target with no CA", () => {
    expect(() => runtimeTlsOptions(remoteUrl())).toThrow(
      /DATABASE_CA_CERT is required/,
    );
  });

  it("refuses a remote target with a non-certificate CA value", () => {
    expect(() => runtimeTlsOptions(remoteUrl(), "not a certificate")).toThrow(
      DatabaseTlsConfigurationError,
    );
  });

  it("builds verified TLS options from valid CA material", () => {
    const ssl = verifiedTls(runtimeTlsOptions(remoteUrl(), SYNTHETIC_CA_PEM));
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.minVersion).toBe("TLSv1.2");
    expect(ssl.ca).toHaveLength(1);
    expect(ssl.ca[0]).toContain("BEGIN CERTIFICATE");
  });

  it("takes the server name from the validated connection target", () => {
    expect(
      verifiedTls(runtimeTlsOptions(remoteUrl(), SYNTHETIC_CA_PEM)).servername,
    ).toBe(REMOTE);
  });

  it("never supplies checkServerIdentity, so Node's hostname check is unmodified", () => {
    const ssl = verifiedTls(runtimeTlsOptions(remoteUrl(), SYNTHETIC_CA_PEM));
    expect(ssl).not.toHaveProperty("checkServerIdentity");
    expect(Object.keys(ssl).sort()).toEqual([
      "ca",
      "minVersion",
      "rejectUnauthorized",
      "servername",
    ]);
  });

  it("matches an IP literal through host rather than SNI", () => {
    const ssl = verifiedTls(
      runtimeTlsOptions(
        "postgresql://limenzy_app:FixturePasswordNotReal@203.0.113.7:6543/postgres",
        SYNTHETIC_CA_PEM,
      ),
    );
    expect(ssl.host).toBe("203.0.113.7");
    expect(ssl.servername).toBeUndefined();
    expect(ssl.rejectUnauthorized).toBe(true);
  });

  it("refuses a multi-host URL, which postgres.js would treat as a host list", () => {
    expect(() =>
      runtimeTlsOptions(
        `postgresql://limenzy_app:FixturePasswordNotReal@${REMOTE},evil.example.com:6543/postgres`,
        SYNTHETIC_CA_PEM,
      ),
    ).toThrow(/more than one host/);
  });
});

describe("a URL parameter cannot weaken the result", () => {
  it.each(["?sslmode=disable", "?sslmode=require", "?ssl=false"])(
    "refuses %s rather than returning unverified options",
    (query) => {
      expect(() =>
        runtimeTlsOptions(remoteUrl(query), SYNTHETIC_CA_PEM),
      ).toThrow(DatabaseTlsConfigurationError);
    },
  );

  it("refuses an attempt to substitute another CA file", () => {
    expect(() =>
      runtimeTlsOptions(
        remoteUrl("?sslrootcert=/tmp/attacker.pem"),
        SYNTHETIC_CA_PEM,
      ),
    ).toThrow(DatabaseTlsConfigurationError);
  });

  it("refuses an attempt to move the connection target", () => {
    expect(() =>
      runtimeTlsOptions(remoteUrl("?host=evil.example.com"), SYNTHETIC_CA_PEM),
    ).toThrow(DatabaseTlsConfigurationError);
  });
});

describe("the pool contract is unchanged", () => {
  it("keeps prepare:false, which the transaction pooler requires", () => {
    expect(POOL_OPTIONS.prepare).toBe(false);
  });

  it("keeps the pool limits and timeouts", () => {
    expect(POOL_OPTIONS.max).toBe(10);
    expect(POOL_OPTIONS.idle_timeout).toBe(20);
    expect(POOL_OPTIONS.connect_timeout).toBe(10);
  });

  it("silences notices, so nothing the driver emits reaches stdout", () => {
    expect(typeof POOL_OPTIONS.onnotice).toBe("function");
  });

  it("carries no TLS of its own — that is decided per connection target", () => {
    expect(POOL_OPTIONS).not.toHaveProperty("ssl");
  });
});

/**
 * How `createRuntimePool` assembles its options.
 *
 * The driver is mocked at the module boundary, so this exercises the options
 * object and nothing else: no socket, no DNS lookup, no database. The suite
 * exists because the guarantee is not "the helper returns the right object" —
 * it is "the object the helper returns is the one the driver receives, and
 * nothing displaces it".
 */
describe("createRuntimePool builds the connection options", () => {
  const LOCAL_URL =
    "postgresql://limenzy_app:FixturePasswordNotReal@127.0.0.1:54322/postgres";
  const REMOTE_URL = `postgresql://limenzy_app.abc123:FixturePasswordNotReal@${REMOTE}:6543/postgres`;

  const savedEnv = { ...process.env };

  beforeEach(() => {
    postgresFactory.mockClear();
    drizzleFactory.mockClear();
    resetEnvCacheForTests();
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_CA_CERT;
    delete process.env.PGSSL;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    resetEnvCacheForTests();
  });

  /** The options object the driver was handed. */
  function optionsPassedToDriver() {
    expect(postgresFactory).toHaveBeenCalledTimes(1);
    const [, options] = postgresFactory.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    return options;
  }

  it("hands a remote connection the explicit verified TLS object", () => {
    process.env.DATABASE_URL = REMOTE_URL;
    process.env.DATABASE_CA_CERT = SYNTHETIC_CA_PEM;

    expect(createRuntimePool()).toBe(poolSentinel);

    const ssl = optionsPassedToDriver().ssl as Record<string, unknown>;
    expect(ssl).toBeTypeOf("object");
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.minVersion).toBe("TLSv1.2");
    expect(ssl.servername).toBe(REMOTE);
    expect(ssl.ca).toHaveLength(1);
    expect(ssl).not.toHaveProperty("checkServerIdentity");
  });

  it("refuses to build a remote pool with no certificate", () => {
    process.env.DATABASE_URL = REMOTE_URL;
    expect(() => createRuntimePool()).toThrow(DatabaseTlsConfigurationError);
    expect(postgresFactory).not.toHaveBeenCalled();
  });

  it("states ssl:false for loopback rather than leaving the key out", () => {
    process.env.DATABASE_URL = LOCAL_URL;

    createRuntimePool();

    const options = optionsPassedToDriver();
    expect("ssl" in options).toBe(true);
    expect(options.ssl).toBe(false);
  });

  it("cannot inherit PGSSL, which the driver would otherwise consult", () => {
    // postgres.js resolves `k in o ? o[k] : k in query ? … : env['PG'+K] || d`
    // (src/index.js, parseOptions). An omitted `ssl` would pick this up.
    process.env.DATABASE_URL = LOCAL_URL;
    process.env.PGSSL = "require";

    createRuntimePool();

    expect(optionsPassedToDriver().ssl).toBe(false);
  });

  it("keeps PGSSL from weakening a remote connection either", () => {
    process.env.DATABASE_URL = REMOTE_URL;
    process.env.DATABASE_CA_CERT = SYNTHETIC_CA_PEM;
    process.env.PGSSL = "require";

    createRuntimePool();

    const ssl = optionsPassedToDriver().ssl as Record<string, unknown>;
    expect(ssl.rejectUnauthorized).toBe(true);
  });

  it("preserves prepare:false and the pool settings alongside TLS", () => {
    process.env.DATABASE_URL = REMOTE_URL;
    process.env.DATABASE_CA_CERT = SYNTHETIC_CA_PEM;

    createRuntimePool();

    const options = optionsPassedToDriver();
    expect(options.prepare).toBe(false);
    expect(options.max).toBe(10);
    expect(options.idle_timeout).toBe(20);
    expect(options.connect_timeout).toBe(10);
    expect(options.onnotice).toBeTypeOf("function");
  });

  it("lets an explicit max override the default without touching ssl", () => {
    process.env.DATABASE_URL = REMOTE_URL;
    process.env.DATABASE_CA_CERT = SYNTHETIC_CA_PEM;

    createRuntimePool({ max: 1 });

    const options = optionsPassedToDriver();
    expect(options.max).toBe(1);
    expect(options.prepare).toBe(false);
    expect(options.ssl).toBeTypeOf("object");
  });

  it("passes the validated URL through unchanged", () => {
    process.env.DATABASE_URL = LOCAL_URL;

    createRuntimePool();

    const [url] = postgresFactory.mock.calls[0] as unknown as [string];
    expect(url).toBe(LOCAL_URL);
  });
});

/**
 * `overrides` is typed `{ max?: number }`, but a type is a compile-time
 * promise. These cases pass an object carrying extra properties through a cast
 * — the shape a value takes when it has crossed a boundary that lost its
 * types — and assert that only `max` is honoured.
 */
describe("createRuntimePool ignores everything in overrides except max", () => {
  const REMOTE_URL = `postgresql://limenzy_app.abc123:FixturePasswordNotReal@${REMOTE}:6543/postgres`;

  const savedEnv = { ...process.env };

  beforeEach(() => {
    postgresFactory.mockClear();
    drizzleFactory.mockClear();
    resetEnvCacheForTests();
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_CA_CERT;
    process.env.DATABASE_URL = REMOTE_URL;
    process.env.DATABASE_CA_CERT = SYNTHETIC_CA_PEM;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    resetEnvCacheForTests();
  });

  /** An overrides object that has smuggled in every dangerous key. */
  const hostileOverrides = {
    max: 3,
    ssl: false,
    host: "evil.example.com",
    hostname: "evil.example.com",
    port: 1234,
    user: "postgres",
    username: "postgres",
    pass: "NotARealSecret",
    password: "NotARealSecret",
    database: "other",
    prepare: true,
    connection: { options: "-c search_path=evil" },
    path: "/tmp/evil.sock",
    idle_timeout: 9999,
    connect_timeout: 9999,
    onnotice: undefined,
  } as unknown as { max?: number };

  function optionsPassedToDriver() {
    expect(postgresFactory).toHaveBeenCalledTimes(1);
    const [, options] = postgresFactory.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    return options;
  }

  it("honours max and nothing else from the object", () => {
    createRuntimePool(hostileOverrides);

    const options = optionsPassedToDriver();
    expect(options.max).toBe(3);
    // Every other key in the hostile object must be absent or untouched.
    for (const key of [
      "host",
      "hostname",
      "port",
      "user",
      "username",
      "pass",
      "password",
      "database",
      "connection",
      "path",
    ]) {
      expect(options).not.toHaveProperty(key);
    }
  });

  it("keeps verified TLS: ssl:false in the object cannot disable it", () => {
    createRuntimePool(hostileOverrides);

    const ssl = optionsPassedToDriver().ssl as Record<string, unknown>;
    expect(ssl).toBeTypeOf("object");
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.minVersion).toBe("TLSv1.2");
    expect(ssl.servername).toBe(REMOTE);
  });

  it("keeps prepare:false, which prepare:true in the object cannot flip", () => {
    createRuntimePool(hostileOverrides);

    expect(optionsPassedToDriver().prepare).toBe(false);
  });

  it("keeps the pool timeouts the object tried to change", () => {
    createRuntimePool(hostileOverrides);

    const options = optionsPassedToDriver();
    expect(options.idle_timeout).toBe(20);
    expect(options.connect_timeout).toBe(10);
    expect(options.onnotice).toBeTypeOf("function");
  });

  it("lets no credential or target string reach the driver", () => {
    createRuntimePool(hostileOverrides);

    const serialised = JSON.stringify(optionsPassedToDriver());
    expect(serialised).not.toContain("evil.example.com");
    expect(serialised).not.toContain("NotARealSecret");
    expect(serialised).not.toContain("search_path=evil");
    expect(serialised).not.toContain("/tmp/evil.sock");
  });

  it("still connects to the validated URL, not the smuggled host", () => {
    createRuntimePool(hostileOverrides);

    const [url] = postgresFactory.mock.calls[0] as unknown as [string];
    expect(url).toBe(REMOTE_URL);
  });

  it("omits max entirely when the object does not carry one", () => {
    createRuntimePool({ ssl: false } as unknown as { max?: number });

    const options = optionsPassedToDriver();
    // POOL_OPTIONS keeps its own default; nothing was copied in.
    expect(options.max).toBe(10);
    expect(options.ssl).toBeTypeOf("object");
  });
});
