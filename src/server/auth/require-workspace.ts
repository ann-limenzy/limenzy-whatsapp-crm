import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PATHNAME_HEADER, safeRedirect } from "@/lib/auth/redirect";
import { getAuthenticatedUser, requireUser } from "@/server/auth/require-user";
import { readWorkspacePreference } from "@/server/auth/workspace-selection";
import {
  resolveWorkspaceContext,
  type TenantContext,
} from "@/server/auth/workspace-context";
import type { WorkspaceRole } from "@/server/db/identity";

/**
 * The workspace gate for every application surface.
 *
 * It is the second half of `requireUser()`: that one answers "is there a
 * verified person?", this one answers "which workspace may they act in on
 * THIS request?" — and it answers it from the database every single time.
 *
 * **Call it in the page, not only in the layout.** A layout is not re-executed
 * for every client-side navigation between sibling routes, so a layout-only
 * check can be stale by the time a page renders; and Next.js warns that proxy
 * coverage can be removed by a matcher change or a refactor. Each page under
 * `(app)` therefore calls this itself, and every Server Action that will ever
 * write must call it again — the layout's call exists so the shell has a name
 * and a role to render, not to authorise anything.
 *
 * **Nothing is cached.** No `cache()`, no module-level memo, no role in a
 * cookie. Two calls in one request mean two resolutions, which is the price of
 * never serving a membership that was revoked a second ago.
 *
 * **It never mutates a cookie.** Setting or deleting during render is not
 * supported by the platform, so the one stale-preference case redirects to the
 * `/workspace/reset` Route Handler, which is allowed to clear it.
 *
 * FUTURE WRITES — the contract this phase establishes and does not yet use:
 *
 *   * A mutation resolves the workspace of the RECORD it touches, inside an
 *     authorised tenant context. The saved preference selects what the user is
 *     LOOKING AT; it must never select what they WRITE TO.
 *   * A workspace id arriving from the browser — hidden field, query, payload —
 *     is untrusted. It may be compared against the resolved workspace to detect
 *     a page rendered before a switch, and a mismatch must cause refusal and a
 *     reload prompt. It must never select the target.
 *   * So a cookie changed in another tab can never silently redirect an older
 *     form's write into a different workspace: the write is bound to its record
 *     and re-checked against current membership.
 */

/** Where a user with no profile goes. */
export const SETUP_PATH = "/setup";
/** Where a user with several memberships and no valid preference goes. */
export const SELECT_WORKSPACE_PATH = "/select-workspace";
/** Where a user with a profile but no active membership goes. */
export const NO_ACCESS_PATH = "/no-access";
/** The one place permitted to clear a stale preference. */
export const WORKSPACE_RESET_PATH = "/workspace/reset";
/** Where a verified-but-unconfirmed address is explained. */
export const VERIFY_EMAIL_PATH = "/verify-email";

/**
 * Account surfaces, which exist to resolve a missing workspace.
 *
 * None of them is ever a `next` destination: returning to one after choosing a
 * workspace would undo the choice, and in the chooser's case bounce straight
 * back. `safeRedirect` already refuses authentication routes; these are the
 * account equivalents, kept here because they are this module's concern.
 */
const ACCOUNT_PREFIXES = [
  SETUP_PATH,
  SELECT_WORKSPACE_PATH,
  NO_ACCESS_PATH,
  WORKSPACE_RESET_PATH,
] as const;

/** A destination worth returning to after the workspace question is settled. */
export function safeWorkspaceReturn(intended: unknown): string {
  const next = safeRedirect(intended, "");
  if (!next) return "";
  const path = next.split("?")[0] ?? next;
  return ACCOUNT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
    ? ""
    : next;
}

export type WorkspaceAccess = {
  readonly context: TenantContext;
  readonly role: WorkspaceRole;
  readonly workspaceId: string;
};

/**
 * The gate refused, and no navigation could fix it.
 *
 * Raised only for a state that should not occur: an identity that is present
 * and confirmed, which the resolver nevertheless will not act on. It carries
 * no identifier, claim or connection detail — the nearest error boundary shows
 * a retryable message, and the request gets no workspace.
 *
 * Deliberately not a redirect. Sign-in would send a user who still holds a
 * session back into the application, and straight back here.
 */
export class WorkspaceGateError extends Error {
  constructor() {
    super("workspace gate: identity could not be resolved for this request");
    this.name = "WorkspaceGateError";
  }
}

/** The path being rendered, as stamped on the request by the proxy. */
async function currentPath(): Promise<string | undefined> {
  try {
    return (await headers()).get(PATHNAME_HEADER) ?? undefined;
  } catch {
    // No request context — nothing to preserve, which is not an error.
    return undefined;
  }
}

/**
 * Resolve the workspace for this request, or navigate somewhere that can fix
 * the situation.
 *
 * Every non-`ok` outcome is a redirect, so the caller only ever receives a
 * validated context. `redirect()` works by throwing, so callers must not wrap
 * this in a `try/catch` that swallows — a swallowed redirect renders a page
 * that was supposed to navigate away.
 */
export async function requireWorkspaceContext(): Promise<WorkspaceAccess> {
  // Identity first, so an anonymous visitor gets the existing sign-in
  // behaviour — including the validated `next` — rather than a workspace page.
  await requireUser();

  const candidate = await readWorkspacePreference();
  const resolution = await resolveWorkspaceContext(candidate);

  switch (resolution.kind) {
    case "ok":
      return {
        context: resolution.context,
        role: resolution.role,
        workspaceId: resolution.context.workspaceId,
      };

    case "unauthenticated": {
      /**
       * The resolver's `unauthenticated` is GENERIC, and must not be read as
       * "the address is unverified". `resolveVerifiedIdentity()` returns it
       * for three different situations: no user at all, a user whose address
       * is unconfirmed, and a user whose subject claim is not a canonical
       * UUID. Only the second one is about email verification.
       *
       * So the identity is read once more, and the three are separated:
       */
      const user = await getAuthenticatedUser();

      if (!user) {
        /**
         * The session ended between the two reads — expired, revoked, or
         * signed out in another tab. This is an ordinary anonymous request
         * now, and it gets the ordinary handling: `requireUser()` redirects to
         * sign-in with the validated return destination, and the sign-in page
         * renders a form because `requireAnonymous()` finds nobody.
         */
        await requireUser();
        /**
         * Unreachable in practice: `requireUser()` redirects when there is no
         * user. Reaching here means identity flickered back between two reads
         * in one request, which is a state to refuse rather than to act on.
         */
        throw new WorkspaceGateError();
      }

      if (!user.emailVerified) {
        // Positively identified: there IS a verified token, and its owner has
        // not confirmed the address. The page that explains that is correct —
        // not sign-in, which would bounce them straight back here.
        redirect(VERIFY_EMAIL_PATH);
      }

      /**
       * A confirmed, present identity that the resolver still refuses. The
       * remaining cause is an identity this application will not act on — a
       * malformed subject claim.
       *
       * It fails closed by throwing, deliberately NOT by redirecting to
       * sign-in: that page sends a user who still has a session straight back
       * into the application, which would loop between the two forever. One
       * extra identity read, one throw, no recursion, no access.
       */
      throw new WorkspaceGateError();
    }

    case "onboarding_required":
      redirect(SETUP_PATH);
      break;

    case "access_unavailable":
      redirect(NO_ACCESS_PATH);
      break;

    case "workspace_selection_required":
      redirect(withNext(SELECT_WORKSPACE_PATH, await currentPath()));
      break;

    case "forbidden": {
      /**
       * The only candidate this function supplies is the saved preference, so
       * `forbidden` here means exactly one thing: the cookie names a workspace
       * that is not an active membership — stale, revoked, foreign or forged,
       * and deliberately indistinguishable between those.
       *
       * It is NOT a 404, because the user did not request this workspace on
       * this request; a saved preference is not an assertion that the resource
       * exists. The reset handler clears it and sends them to the chooser,
       * which consults no cookie and so cannot bounce back here.
       */
      redirect(withNext(WORKSPACE_RESET_PATH, await currentPath()));
      break;
    }
  }

  // Unreachable: every branch above returns or throws. Present so a future
  // resolution kind is a type error here rather than a silent fall-through
  // into an unprotected render.
  throw new Error("workspace gate: unhandled resolution");
}

/** Append a validated `next`, or nothing at all. */
function withNext(path: string, intended?: string): string {
  const next = safeWorkspaceReturn(intended);
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}
