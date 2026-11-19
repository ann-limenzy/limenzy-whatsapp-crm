/**
 * Transport options for a database suite's own connections.
 *
 * A suite opens connections the application never opens: a tooling
 * (superuser) session that builds fixtures, and a runtime session that proves
 * row-level security refuses them. Those are constructed directly with
 * `postgres(url, …)`, so they do not pass through `runtimeTlsOptions` and get
 * no TLS unless it is asked for here.
 *
 * ## Why `ssl: true` and not a certificate object
 *
 * `true` is the one value postgres.js leaves alone: it is neither
 * `require`/`allow`/`prefer` — each of which sets `rejectUnauthorized: false`
 * and verifies nothing — nor an options object that could overwrite the
 * defaults. What reaches `tls.connect` is therefore Node's default
 * `rejectUnauthorized: true`, plus the `servername` postgres.js derives from
 * the host, which together check **the certificate chain and the hostname**.
 *
 * Measured, not assumed: without the Supabase root available the same
 * connection fails with `SELF_SIGNED_CERT_IN_CHAIN`. Verification is on.
 *
 * The root itself arrives through `NODE_EXTRA_CA_CERTS`, which the hosted
 * runner sets for the whole process. Keeping it out of this file means no
 * suite handles a certificate, and no suite can weaken one.
 *
 * Loopback gets `{}` — the local stack serves no TLS, and demanding it there
 * would break every local run for no gain.
 */

/** Options to spread into a suite's `postgres(url, { … })` call. */
export function testTls(): Record<string, unknown> {
  return process.env.LIMENZY_TEST_MODE === "hosted" ? { ssl: true } : {};
}
