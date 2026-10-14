import "server-only";

import { X509Certificate } from "node:crypto";
import { isIP } from "node:net";

/**
 * Transport security for the runtime database connection.
 *
 * WHY THIS EXISTS AS ITS OWN MODULE
 *
 * postgres.js does **not** interpret `sslmode` the way libpq does, so the
 * verification we rely on for the Supabase CLI does not carry over to the
 * application's driver. Read from the installed postgres.js 3.4.9 source:
 *
 *   src/index.js:443      query.sslmode && (query.ssl = query.sslmode, …)
 *   src/connection.js:283-286
 *       if (ssl === 'require' || ssl === 'allow' || ssl === 'prefer')
 *         options.rejectUnauthorized = false
 *       else if (typeof ssl === 'object')
 *         Object.assign(options, ssl)
 *   src/connection.js:346  return ssl ? secure() : connected()
 *
 * which means, for this driver:
 *
 *   * `ssl` unset               → no TLS at all;
 *   * `sslmode=require|allow|prefer` → encrypted but **unverified**
 *                                 (`rejectUnauthorized: false`);
 *   * `sslmode=verify-full` as a string → falls through to Node's defaults,
 *                                 which verify against Node's built-in CA
 *                                 store — and Supabase's private root is not
 *                                 in it, so the connection fails;
 *   * an `ssl` **object**        → `Object.assign`ed onto the TLS options, so
 *                                 it is the only way to verify against a
 *                                 pinned CA.
 *
 * So this module builds that object explicitly. It never returns a weakened
 * configuration: either verified TLS, or — for an explicit loopback host —
 * none, which is what the local Docker stack has always used.
 *
 * PRECEDENCE, also from the source (src/index.js, parseOptions):
 *
 *   const value = k in o ? o[k] : k in query ? … : env['PG' + K] || d
 *
 * The options object wins over URL query parameters and over `PG*`
 * environment variables for every key in `defaults`, `ssl` among them. A
 * `?sslmode=…` in the URL therefore cannot override what this module returns.
 * That is a useful guarantee, not a reason to be relaxed about such a
 * parameter: one in the URL means somebody intended something this module is
 * silently ignoring, so {@link assertNoOverridingUrlParameters} refuses it.
 */

/** Raised for a TLS configuration fault. Never carries a certificate or URL. */
export class DatabaseTlsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseTlsConfigurationError";
  }
}

/**
 * The only hosts allowed to connect without TLS.
 *
 * Deliberately three exact names, not a range. `127.0.0.2` is loopback to the
 * kernel but is not what `npm run db:start` produces; `0.0.0.0` and `::` are
 * wildcards, not loopback; and a suffix rule would make `localhost.example.com`
 * — a name an attacker can register — exempt. Nothing here consults NODE_ENV
 * or any "is local" flag: the host is the only input.
 */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
]);

/**
 * Normalise a hostname taken from a parsed URL.
 *
 * `postgresql:` is not a WHATWG "special" scheme, so its host is an *opaque*
 * host: it is **not** lower-cased by the parser, and an IPv6 literal keeps its
 * brackets (`[::1]`). Both are handled here so a comparison is meaningful.
 */
export function normaliseHostname(hostname: string): string {
  const trimmed = hostname.trim();
  const unbracketed =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;
  return unbracketed.toLowerCase();
}

/** Whether a normalised hostname is one of the three loopback literals. */
export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(normaliseHostname(hostname));
}

/**
 * Query parameters refused outright.
 *
 * Two kinds, and both are refused rather than ignored:
 *
 *   * TLS settings — the options object already wins, so one of these in the
 *     URL cannot weaken the connection, but it does mean the author expected
 *     different behaviour from what they will get. Failing is honest;
 *     ignoring it is not.
 *   * connection-target settings — several of these are genuinely read by
 *     postgres.js (`port`, `dbname` and `user` have URL forms; anything not
 *     in the driver's `defaults` is forwarded as a startup parameter through
 *     `options.connection`), so they could move the connection somewhere
 *     other than the validated target.
 */
const REFUSED_URL_PARAMETERS: ReadonlySet<string> = new Set([
  // TLS and authentication transport
  "ssl",
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslpassword",
  "sslcrl",
  "sslcrldir",
  "sslsni",
  "sslnegotiation",
  "sslminprotocolversion",
  "sslmaxprotocolversion",
  "requiressl",
  "requirepeer",
  "channel_binding",
  "channelbinding",
  "gssencmode",
  "krbsrvname",
  // Connection target
  "host",
  "hostaddr",
  "port",
  "dbname",
  "database",
  "db",
  "user",
  "username",
  "password",
  "pass",
  "passfile",
  "service",
  "servicefile",
  "target_session_attrs",
  "options",
]);

/**
 * Refuse a URL that tries to steer TLS or the connection target.
 *
 * The parameter NAME is reported; its value never is, because a refused
 * `password=` or `sslpassword=` would otherwise be echoed into a log.
 */
export function assertNoOverridingUrlParameters(url: URL): void {
  const refused: string[] = [];
  for (const name of url.searchParams.keys()) {
    if (REFUSED_URL_PARAMETERS.has(name.toLowerCase())) refused.push(name);
  }
  if (refused.length > 0) {
    const unique = [...new Set(refused)].sort();
    throw new DatabaseTlsConfigurationError(
      "DATABASE_URL carries connection parameter(s) that would change the " +
        `TLS settings or the connection target: ${unique.join(", ")}. ` +
        "Transport security is configured by the application, not by the " +
        "URL. Remove the parameter(s); use DATABASE_CA_CERT for the " +
        "certificate authority.",
    );
  }
}

/**
 * Parse `DATABASE_CA_CERT` into certificate material.
 *
 * A substring check for `BEGIN CERTIFICATE` is not validation: it accepts a
 * truncated body, a private key pasted alongside, or base64 that is not a
 * certificate at all. Every block is therefore parsed by
 * `node:crypto`'s X509Certificate, and the value handed to Node's TLS stack is
 * re-serialised from what parsed — so nothing that is not a certificate can
 * reach it, whatever else the variable contained.
 *
 * Nothing is repaired: no whitespace is re-flowed, no header is synthesised,
 * no block is skipped. A malformed value is an error.
 */
export function parseCaCertificates(pem: string): string[] {
  if (pem.trim().length === 0) {
    throw new DatabaseTlsConfigurationError(
      "DATABASE_CA_CERT is set but empty. It must contain PEM certificate " +
        "text for the certificate authority that signs the database server's " +
        "certificate.",
    );
  }

  const structureError = () =>
    new DatabaseTlsConfigurationError(
      "DATABASE_CA_CERT is not a well-formed PEM certificate bundle. It must " +
        "contain one or more complete '-----BEGIN CERTIFICATE-----' … " +
        "'-----END CERTIFICATE-----' blocks and nothing else but whitespace " +
        "between them — no stray text, no truncated block, and no other PEM " +
        "type such as a private key. This variable takes the certificate " +
        "authority's public certificate only.",
    );

  // The whole input is consumed, not scanned for anything that looks like a
  // certificate. A global `match()` would happily pick two good blocks out of
  // a value that also contained a private key or a truncated third block, and
  // discard the rest silently — exactly the "repair" this must not do.
  //
  // The body is restricted to base64 and whitespace, so a nested
  // '-----BEGIN …' can never be swallowed inside a block: it simply fails to
  // match, and the position check below turns that into an error.
  const whitespace = /\s*/y;
  const block =
    /-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=\s]*-----END CERTIFICATE-----/y;

  const blocks: string[] = [];
  let index = 0;
  while (index < pem.length) {
    whitespace.lastIndex = index;
    whitespace.exec(pem);
    index = whitespace.lastIndex;
    if (index >= pem.length) break;

    block.lastIndex = index;
    const match = block.exec(pem);
    // No match at this position means leading garbage, trailing garbage, an
    // unmatched header or footer, a truncated block, or a non-certificate PEM
    // type. All of them are the same answer: the value is not a bundle.
    if (match === null) throw structureError();

    blocks.push(match[0]);
    index = block.lastIndex;
  }

  if (blocks.length === 0) throw structureError();

  return blocks.map((text, position) => {
    let certificate: X509Certificate;
    try {
      certificate = new X509Certificate(text);
    } catch {
      // The parser's own message can quote the offending bytes, so it is never
      // propagated. Only the ordinal position is reported — no label, no
      // content, nothing derived from the value itself.
      throw new DatabaseTlsConfigurationError(
        `DATABASE_CA_CERT block ${position + 1} is not a valid X.509 ` +
          "certificate. Re-copy the PEM text from the provider's dashboard.",
      );
    }
    if (!certificate.ca) {
      throw new DatabaseTlsConfigurationError(
        `DATABASE_CA_CERT block ${position + 1} is an end-entity certificate, ` +
          "not a certificate authority. Provide the CA certificate that " +
          "signs the database server's certificate.",
      );
    }
    return certificate.toString();
  });
}

/**
 * The TLS half of the options passed to postgres.js.
 *
 * `ssl` is ALWAYS present, including for plaintext loopback, where it is an
 * explicit `false`. That is not decoration. postgres.js resolves each option
 * as (src/index.js, parseOptions):
 *
 *   const value = k in o ? o[k] : k in query ? … : env['PG' + K] || d
 *
 * so an option this module merely omitted would fall through to the URL's
 * query string and then to `PGSSL` in the ambient environment. Stating `false`
 * puts `ssl` in `o`, where it wins over both.
 */
export type RuntimeTlsOptions = {
  readonly ssl:
    | false
    | {
        readonly ca: readonly string[];
        readonly rejectUnauthorized: true;
        readonly minVersion: "TLSv1.2";
        readonly servername?: string;
        readonly host?: string;
      };
};

/**
 * Build the TLS options for a validated runtime connection string.
 *
 * Three outcomes, and no fourth:
 *
 *   * loopback host, no CA  → `{ ssl: false }`. No TLS, which is what the
 *     local Docker stack has always done and what `npm run db:role:local`
 *     produces — stated explicitly so an ambient `PGSSL` cannot supply it.
 *   * loopback host, CA set → verified TLS. Configuring a CA locally is taken
 *     at face value rather than ignored.
 *   * any other host        → verified TLS, and a missing CA is an error.
 *
 * `rejectUnauthorized` is always true and `checkServerIdentity` is never
 * supplied, so Node's own hostname check applies unmodified. The name checked
 * is derived from the URL that was validated — `servername` for a DNS host, or
 * `host` for an IP literal, which is how Node decides what to match a
 * certificate against. Neither is ever taken from a query parameter.
 */
export function runtimeTlsOptions(
  databaseUrl: string,
  caCertificate?: string,
): RuntimeTlsOptions {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new DatabaseTlsConfigurationError(
      "DATABASE_URL is not a valid connection URL.",
    );
  }

  assertNoOverridingUrlParameters(url);

  const hostname = normaliseHostname(url.hostname);
  if (hostname.length === 0) {
    throw new DatabaseTlsConfigurationError(
      "DATABASE_URL has no host, so the server's certificate could not be " +
        "checked against anything.",
    );
  }
  // postgres.js reads a comma-separated host list as multiple candidate hosts
  // (src/index.js, parseUrl → `multihost`), which would let a URL reach a
  // server other than the one whose name is verified here.
  if (hostname.includes(",")) {
    throw new DatabaseTlsConfigurationError(
      "DATABASE_URL lists more than one host. This application connects to " +
        "exactly one database server.",
    );
  }

  const loopback = isLoopbackHost(hostname);

  if (caCertificate === undefined || caCertificate.length === 0) {
    if (loopback) return { ssl: false };
    throw new DatabaseTlsConfigurationError(
      "DATABASE_CA_CERT is required for a remote database. Set it to the " +
        "PEM certificate of the authority that signs the database server's " +
        "certificate. Only the local loopback hosts (localhost, 127.0.0.1, " +
        "::1) may connect without TLS.",
    );
  }

  const ca = parseCaCertificates(caCertificate);

  return {
    ssl: {
      ca,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      // An IP literal cannot be an SNI name; Node matches it against the
      // certificate's IP SANs through `host` instead.
      ...(isIP(hostname) === 0 ? { servername: hostname } : { host: hostname }),
    },
  };
}
