/**
 * Internal redirect validation.
 *
 * Every place the application accepts a caller-supplied destination — the
 * `next` query parameter on sign-in, the `next` carried through the email
 * confirmation link — routes it through `safeRedirect()` first.
 *
 * The rule is allow-list, not deny-list: a destination is accepted only if it
 * is a plain, single-leading-slash, same-document path. Anything else falls
 * back to the default. That makes the open-redirect class of bug structurally
 * impossible rather than a matter of remembering to check.
 *
 * Rejected, with the reason each one matters:
 *
 *   https://evil.test/x   absolute URL — classic open redirect
 *   //evil.test/x         protocol-relative; the browser treats it as absolute
 *   /\evil.test           back-slash; some parsers normalise `\` to `/`
 *   /%2f%2fevil.test      percent-encoded double slash, decoded later
 *   javascript:alert(1)   scheme injection
 *   /auth/sign-in         an auth route — would bounce the user straight back
 */

/** Where an authenticated user goes when no valid destination was supplied. */
export const DEFAULT_AUTHENTICATED_REDIRECT = "/dashboard";

/** Where an unauthenticated user is sent. */
export const SIGN_IN_PATH = "/sign-in";

/**
 * Request header carrying the path being rendered, set by the proxy.
 *
 * Server Components cannot read their own URL. The value still passes through
 * `safeRedirect` before use — it is a hint, not a trusted destination.
 */
export const PATHNAME_HEADER = "x-limenzy-pathname";

/**
 * Paths that must never be used as a post-authentication destination, because
 * landing on them would immediately redirect again and could loop.
 */
const NON_DESTINATION_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/auth/",
] as const;

function hasControlChars(value: string): boolean {
  // Reject attempts to smuggle CR, LF or NUL into a Location header.
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Normalise a caller-supplied destination to a safe internal path.
 *
 * Returns `fallback` whenever the value is absent, malformed, external, or
 * points at an authentication route.
 */
export function safeRedirect(
  value: unknown,
  fallback: string = DEFAULT_AUTHENTICATED_REDIRECT,
): string {
  if (typeof value !== "string") return fallback;

  const candidate = value.trim();
  if (candidate === "") return fallback;
  if (hasControlChars(candidate)) return fallback;

  // Must be a single leading slash. Rejects absolute URLs ("https://…"),
  // protocol-relative ("//host") and scheme-like values ("javascript:").
  if (!candidate.startsWith("/")) return fallback;
  if (candidate.startsWith("//")) return fallback;
  if (candidate.startsWith("/\\")) return fallback;

  // A backslash anywhere in the leading segment can be normalised to "/" by
  // some user agents, turning "/\\evil.test" into "//evil.test".
  if (candidate.includes("\\")) return fallback;

  // Decode once and re-check: "/%2f%2fevil.test" decodes to "//evil.test".
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    // Malformed percent-encoding — reject rather than guess.
    return fallback;
  }
  if (
    decoded.startsWith("//") ||
    decoded.startsWith("/\\") ||
    decoded.includes("\\") ||
    hasControlChars(decoded)
  ) {
    return fallback;
  }

  // Parse against an opaque base. Anything that escapes that origin is not a
  // relative path, whatever it looked like.
  let url: URL;
  try {
    url = new URL(candidate, "http://internal.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://internal.invalid") return fallback;

  const path = `${url.pathname}${url.search}${url.hash}`;

  if (NON_DESTINATION_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    return fallback;
  }

  return path;
}

/**
 * Build an absolute URL for an email callback link.
 *
 * Supabase needs an absolute `emailRedirectTo`. The origin comes from the
 * server — the configured site URL, or the request's own origin — never from
 * user input, so a crafted form field cannot point a verification email at an
 * attacker's host.
 */
export function buildCallbackUrl(
  origin: string,
  path: string,
  next?: string,
): string {
  const url = new URL(path, origin);
  const safeNext = safeRedirect(next, "");
  if (safeNext) url.searchParams.set("next", safeNext);
  return url.toString();
}
