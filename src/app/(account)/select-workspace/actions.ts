"use server";

import { redirect } from "next/navigation";

import type { SelectionActionState } from "@/app/(account)/select-workspace/selection-state";
import { safeWorkspaceReturn } from "@/server/auth/require-workspace";
import { resolveWorkspaceContext } from "@/server/auth/workspace-context";
import { writeWorkspacePreference } from "@/server/auth/workspace-selection";

/**
 * Choosing a workspace.
 *
 * The only place a workspace preference is written, and it writes one only
 * after `resolveWorkspaceContext()` has answered `ok` for the signed-in user
 * on this request. The submitted id is treated as what it is: an untrusted
 * string from a browser. That it appeared in a list we rendered a moment ago
 * proves nothing now — the membership may have been deactivated since, and the
 * form may not have come from our page at all.
 *
 * **Selecting grants nothing.** The cookie this writes is a preference; the
 * next request re-resolves identity and active membership from the database
 * and would refuse the same workspace if anything changed in between.
 *
 * **It mints no context from the submission.** The resolution happens here to
 * decide whether to remember the choice; the context it produces is discarded,
 * and the fresh request after the redirect resolves its own.
 */

export async function selectWorkspaceAction(
  _previous: SelectionActionState,
  formData: FormData,
): Promise<SelectionActionState> {
  const attempt = _previous.attempt + 1;

  const raw = formData.get("workspaceId");
  // Never coerced or repaired: a value needing repair did not come from a list
  // this user was given, and the resolver refuses it for the same reason.
  const candidate = typeof raw === "string" ? raw : undefined;

  const requested = formData.get("next");
  const next = safeWorkspaceReturn(requested);

  let resolved = false;

  try {
    const resolution = await resolveWorkspaceContext(candidate);

    if (resolution.kind === "ok") {
      // Written only now, and only with the id the resolver matched against a
      // membership it read under row-level security.
      await writeWorkspacePreference(resolution.context.workspaceId);
      resolved = true;
    } else if (resolution.kind === "forbidden") {
      /**
       * One neutral answer for every refusal.
       *
       * It says nothing about whether that workspace exists, belongs to
       * somebody else, or once belonged to this user — the resolver already
       * returns a single frozen value for all of those, and this message must
       * not undo that. The page re-reads the authorized list on the next
       * render, so a stale option disappears on its own.
       *
       * The preference is deliberately NOT touched: a refused attempt must not
       * disturb a working saved choice.
       */
      return Object.freeze({
        status: "unavailable",
        message:
          "That workspace is not available to you. Choose one from the list below.",
        attempt,
      });
    } else {
      // unauthenticated / onboarding_required / access_unavailable: the page
      // itself routes these on its next render, where the destination logic
      // already lives. Nothing is written.
      return Object.freeze({
        status: "unavailable",
        message: "Your access has changed. Check the options below.",
        attempt,
      });
    }
  } catch {
    // The reason is never serialised to the browser; the resolver's own errors
    // already carry no SQL, identifier or connection detail.
    return Object.freeze({
      status: "error",
      message:
        "We could not confirm your access just now. Please try again in a moment.",
      attempt,
    });
  }

  /**
   * Outside the `try`: `redirect()` signals by throwing, and the `catch` above
   * would turn it into an error state.
   *
   * The destination re-resolves everything on a fresh request — the preference
   * written above is only a hint to that resolution, never a grant.
   */
  if (resolved) redirect(next || "/");

  return _previous;
}
