import { ShieldOff } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signOutAction } from "@/app/actions/auth";
import { requireUser } from "@/server/auth/require-user";
import {
  SELECT_WORKSPACE_PATH,
  SETUP_PATH,
  VERIFY_EMAIL_PATH,
} from "@/server/auth/require-workspace";
import { resolveWorkspaceContext } from "@/server/auth/workspace-context";

export const metadata: Metadata = { title: "No workspace access" };

/**
 * The honest end of the road: a profile exists, and no active membership does.
 *
 * Specification §159 and §160 deactivate rather than delete, so this is most
 * often someone who was removed from the workspace they used to work in. Their
 * history is intact and still carries their name; what they have lost is
 * access.
 *
 * **It does not offer to create a replacement workspace.** Deactivation is not
 * permission to start again, and offering a new tenancy here would hand
 * someone who was just removed from a business their own copy of the product
 * — with none of the data, and none of the authority they used to have. The
 * only actions are to ask an administrator, or to sign out.
 *
 * It re-resolves on every visit rather than trusting how the user arrived, so
 * someone whose access was restored a minute ago is routed onward instead of
 * being told they have none.
 */
export default async function NoAccessPage() {
  const user = await requireUser();

  const resolution = await resolveWorkspaceContext();

  switch (resolution.kind) {
    case "access_unavailable":
      break;
    case "ok":
      // Access was restored since they landed here.
      redirect("/");
      break;
    case "workspace_selection_required":
      redirect(SELECT_WORKSPACE_PATH);
      break;
    case "onboarding_required":
      redirect(SETUP_PATH);
      break;
    default:
      redirect(VERIFY_EMAIL_PATH);
  }

  return (
    <div className="surface-elevated flex flex-col items-center rounded-xl px-6 py-14 text-center">
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <ShieldOff className="size-6" aria-hidden="true" />
      </span>

      <h1 className="text-lg font-semibold text-foreground">
        You do not have access to a workspace
      </h1>

      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
        {user.email ? (
          <>
            You are signed in as{" "}
            <span className="font-medium text-foreground">{user.email}</span>,
            but this account is not an active member of any workspace.{" "}
          </>
        ) : (
          <>
            You are signed in, but this account is not an active member of any
            workspace.{" "}
          </>
        )}
        If you expected access, ask an administrator at your company to restore
        it. Your past activity is unchanged.
      </p>

      <form action={signOutAction} className="mt-6">
        <button
          type="submit"
          data-testid="no-access-sign-out"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
