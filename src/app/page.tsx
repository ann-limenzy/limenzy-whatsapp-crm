import { redirect } from "next/navigation";

import { requireUser } from "@/server/auth/require-user";
import {
  NO_ACCESS_PATH,
  SELECT_WORKSPACE_PATH,
  SETUP_PATH,
  VERIFY_EMAIL_PATH,
  WORKSPACE_RESET_PATH,
} from "@/server/auth/require-workspace";
import { resolveWorkspaceContext } from "@/server/auth/workspace-context";
import { readWorkspacePreference } from "@/server/auth/workspace-selection";

/**
 * The root route, which specification §179.1 makes load-bearing: an installed
 * application starts here, at `/`, and "the root route directs the user
 * through the normal server-side authentication, onboarding and
 * workspace-selection flow". It must not assume a destination, because at
 * install time there is no session to assume one from.
 *
 * So it resolves, then routes — it never sends anyone to `/dashboard` and
 * leaves that page to discover there is no workspace.
 *
 * A database failure throws to `app/error.tsx`, which offers a retry. It is
 * never flattened into "you need to onboard" or "you have no access".
 */

/** Resolved per request from cookies and the database; never prerendered. */
export const dynamic = "force-dynamic";

export default async function RootPage() {
  await requireUser("/");

  const candidate = await readWorkspacePreference();
  const resolution = await resolveWorkspaceContext(candidate);

  switch (resolution.kind) {
    case "ok":
      redirect("/dashboard");
      break;
    case "onboarding_required":
      redirect(SETUP_PATH);
      break;
    case "access_unavailable":
      redirect(NO_ACCESS_PATH);
      break;
    case "workspace_selection_required":
      redirect(SELECT_WORKSPACE_PATH);
      break;
    case "forbidden":
      // The saved preference is stale, revoked, foreign or forged — one answer
      // for all of them. Only the reset handler may clear a cookie.
      redirect(WORKSPACE_RESET_PATH);
      break;
    default:
      // A verified token whose address is still unconfirmed.
      redirect(VERIFY_EMAIL_PATH);
  }
}
