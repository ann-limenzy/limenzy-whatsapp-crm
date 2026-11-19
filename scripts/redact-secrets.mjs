/**
 * Keep credentials out of anything this project prints.
 *
 * WHY THIS EXISTS
 *
 * A connection string carries its password in the middle of an otherwise
 * harmless-looking value, so the dangerous thing is rarely a deliberate
 * `console.log(url)`. It is the incidental paths:
 *
 *   - a driver error whose message quotes the connection string;
 *   - a CLI subprocess echoing the `--db-url` it was handed;
 *   - a diagnostic that reports "the value is X" to explain a parse failure.
 *
 * The last one is not hypothetical. A check written to identify a leftover
 * dashboard placeholder — `[YOUR-PASSWORD]` — matched a real password that
 * happened to be bracketed, and printed it. The lesson is that a diagnostic
 * must never decide for itself that a value is safe to show: it reports
 * SHAPE, and the value goes through here on the way out.
 *
 * WHAT IT GUARANTEES
 *
 *   - Any `scheme://…@host` is rewritten so no user info survives.
 *   - Any string listed in `secrets` is replaced wherever it appears, even
 *     outside a URL, and in percent-encoded form.
 *   - It is applied to every line this project's tooling prints, including
 *     error messages and subprocess output, rather than at call sites that
 *     someone must remember.
 *
 * It is a last line of defence, not a licence to pass secrets around.
 */

/** What a URL may be reduced to: enough to debug, nothing to steal. */
export function describeUrl(value) {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const port = parsed.port || "(default)";
    const database = parsed.pathname.replace(/^\//, "") || "(none)";
    return `${parsed.protocol}//<redacted>@${host}:${port}/${database}`;
  } catch {
    return "<redacted-url>";
  }
}

/*
 * Matches a URL carrying user info. The `@` is required, so a plain
 * `https://example.com/doc` is left alone — over-redacting makes output
 * useless and trains people to turn it off.
 */
const URL_WITH_USERINFO =
  /\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s/@]+@[^\s'"<>\\]+/g;

/**
 * Remove credentials from arbitrary text.
 *
 * `secrets` are exact strings to erase — a password read from configuration,
 * for instance. Each is also erased in percent-encoded form, because that is
 * how it appears inside a URL.
 */
export function redact(text, secrets = []) {
  let out = typeof text === "string" ? text : String(text ?? "");

  out = out.replace(URL_WITH_USERINFO, (match) => describeUrl(match));

  const variants = new Set();
  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length < 4) continue;
    variants.add(secret);
    try {
      variants.add(encodeURIComponent(secret));
    } catch {
      /* not encodable; the literal form is still covered */
    }
  }
  /* Longest first, so a secret containing another is not half-replaced. */
  for (const variant of [...variants].sort((a, b) => b.length - a.length)) {
    out = out.split(variant).join("***");
  }
  return out;
}

/** Everything an Error can carry, flattened and cleaned. */
export function redactError(error, secrets = []) {
  if (error === null || error === undefined) return "(no error)";
  const parts = [];
  if (error instanceof Error) {
    parts.push(error.message);
    for (const key of ["code", "severity", "detail", "hint", "where"]) {
      const value = error[key];
      if (value) parts.push(`${key}=${value}`);
    }
  } else {
    parts.push(String(error));
  }
  return redact(parts.join(" "), secrets);
}

/** A console whose every argument is cleaned on the way out. */
export function createSafeConsole(secrets = [], sink = console) {
  const clean = (args) => args.map((a) => redact(a, secrets));
  return {
    log: (...args) => sink.log(...clean(args)),
    warn: (...args) => sink.warn(...clean(args)),
    error: (...args) => sink.error(...clean(args)),
  };
}
