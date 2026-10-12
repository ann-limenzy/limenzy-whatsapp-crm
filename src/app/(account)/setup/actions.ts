"use server";

import { redirect } from "next/navigation";

import {
  TERMINAL_SETUP_STATUSES,
  type SetupActionState,
  type SetupFieldName,
} from "@/app/(account)/setup/setup-state";
import {
  BootstrapError,
  createInitialWorkspace,
} from "@/server/auth/create-initial-workspace";

/**
 * The `/setup` Server Action.
 *
 * It does one thing: turn a form submission into the six-field object
 * `createInitialWorkspace()` accepts, and turn that operation's answer into
 * something the form can render. It opens no connection, imports no pool,
 * reads no cookie and performs no redirect - every privileged decision was
 * already made in Phase 4C-1's database routine and Phase 4C-2's operation.
 *
 * **This module exports exactly one runtime value: the action.** A
 * `"use server"` file may export only async functions, so the state shape and
 * its initial value live in `./setup-state`. A regression test asserts that
 * every runtime export here is an async function.
 *
 * **The raw FormData never crosses this boundary.** Six named values are read
 * out explicitly, so a submitted `authUserId`, `workspaceId`, `role`, `status`
 * or `claims` field is not ignored by luck - there is simply nowhere for it to
 * go. (The operation would reject the payload anyway, because its schema is
 * strict; this is the second of the two independent reasons it cannot work.)
 */

/** Read one field as a string. Anything else becomes an empty string. */
const text = (formData: FormData, name: string): string => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function createWorkspaceAction(
  previous: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  // The database routine is the authoritative guard against a second tenancy;
  // this is the cheap one, so a double submission does not even reach it.
  if (TERMINAL_SETUP_STATUSES.includes(previous.status)) return previous;

  const attempt = previous.attempt + 1;

  // Exactly six values, read by name. The FormData itself goes no further.
  const input = {
    fullName: text(formData, "fullName"),
    workspaceName: text(formData, "workspaceName"),
    businessType: text(formData, "businessType"),
    country: text(formData, "country"),
    currency: text(formData, "currency"),
    timeZone: text(formData, "timeZone"),
  };

  /**
   * Set when the tenancy exists — whether this submission created it or found
   * it already there. Both answers mean the same thing to the browser: stop
   * rendering a form and let a fresh request work out where this user belongs.
   *
   * It is a flag rather than a `redirect()` inside the `try`, because
   * `redirect()` signals by throwing and the `catch` below would convert that
   * control flow into an error state. The redirect happens after the block.
   */
  let onboarded = false;

  try {
    const result = await createInitialWorkspace(input);

    switch (result.kind) {
      case "created":
      case "already_onboarded":
        onboarded = true;
        break;

      case "access_unavailable":
        return Object.freeze({
          status: "access_unavailable",
          message:
            "This account does not currently have access to a CRM area. Ask " +
            "an administrator at your company to restore your access.",
          attempt,
        });

      case "unauthenticated":
        return Object.freeze({
          status: "unauthenticated",
          message: "Your session has expired. Sign in again to continue.",
          attempt,
        });

      case "invalid_input": {
        const fieldErrors: Partial<Record<SetupFieldName, string>> = {};
        let formMessage: string | undefined;
        for (const issue of result.issues) {
          if (issue.field === "form") {
            formMessage ??= issue.message;
            continue;
          }
          fieldErrors[issue.field] ??= issue.message;
        }
        return Object.freeze({
          status: "invalid",
          message: formMessage ?? "Check the highlighted fields and try again.",
          fieldErrors: Object.freeze(fieldErrors),
          attempt,
        });
      }
    }
  } catch (error) {
    // Only the reason is read. The error object, its message and its cause are
    // never serialised into the state a browser receives.
    const temporary =
      error instanceof BootstrapError &&
      error.reason === "database_unavailable";
    return Object.freeze({
      status: "error",
      message: temporary
        ? "We could not reach the service just now. Please try again in a moment."
        : "Something went wrong creating your CRM area. Please try again.",
      attempt,
    });
  }

  /**
   * Outside the `try`, because `redirect()` throws to signal.
   *
   * The destination is the root route, which re-resolves identity and active
   * membership from the database on a **fresh request** and sends the user
   * where they actually belong. Nothing from this submission travels with
   * them: the bootstrap result carries no profile id, workspace id or role,
   * and no context is minted here or from a form field.
   *
   * It claims nothing about the later onboarding screens — products, renewal
   * dates, team invitations, import and WhatsApp (spec §8–§13) are untouched
   * by this phase and nothing here marks them complete.
   */
  if (onboarded) redirect("/");

  // Every other outcome returned inside the block above.
  return previous;
}
