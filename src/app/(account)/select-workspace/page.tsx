import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import {
  ChooserForm,
  type WorkspaceOption,
} from "@/app/(account)/select-workspace/chooser-form";
import { requireUser } from "@/server/auth/require-user";
import {
  NO_ACCESS_PATH,
  SETUP_PATH,
  VERIFY_EMAIL_PATH,
  safeWorkspaceReturn,
} from "@/server/auth/require-workspace";
import { resolveWorkspaceContext } from "@/server/auth/workspace-context";
import { resolveNamedWorkspaceChoices } from "@/server/auth/workspace-names";
import type { WorkspaceRole } from "@/server/db/identity";

export const metadata: Metadata = { title: "Choose a workspace" };

/** Presentation only. Authorization comes from the membership row, every request. */
const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner_admin: "Owner / Admin",
  manager: "Manager",
  staff_sales: "Staff",
};

/**
 * The workspace chooser (spec §179.1 — the root route leads through the
 * authentication, onboarding and workspace-selection flow).
 *
 * **It reads no saved preference.** That is what makes it the safe landing
 * place for a stale one: the workspace gate sends a bad cookie here through
 * `/workspace/reset`, and because this page never consults a cookie, it cannot
 * bounce the visitor back into the gate — the loop is closed structurally
 * rather than by a counter or a marker.
 *
 * `?change=1` is therefore not a mode this page needs to implement: arriving
 * here always means "choose", whatever is saved. The parameter exists so the
 * "Switch workspace" control in the shell has an unmistakable destination, and
 * so a user with exactly one workspace still sees this screen rather than
 * being bounced onward. Authentication, onboarding and no-access all take
 * precedence over it, because they are resolved first, below.
 *
 * Names are read through the ordinary authorised path — see
 * `resolveNamedWorkspaceChoices()` — one transaction per workspace under a
 * context minted from a membership read under RLS. A workspace whose name
 * cannot be read is dropped rather than shown as a placeholder.
 */
export default async function SelectWorkspacePage({
  searchParams,
}: PageProps<"/select-workspace">) {
  await requireUser();

  const params = await searchParams;
  const next = safeWorkspaceReturn(params.next);

  /**
   * A deep link naming a specific workspace is an EXPLICIT request for a
   * resource, so it follows the standing cross-tenant rule: a miss is a 404,
   * never a 403 and never a message, because anything else confirms that the
   * workspace exists somewhere. Foreign, deactivated, malformed and invented
   * are one answer.
   *
   * It deliberately does not select anything: a page cannot write the
   * preference cookie, and a GET should not. A valid deep link simply renders
   * the chooser, where one tap goes through the action that can.
   */
  const requested = params.workspace;
  if (typeof requested === "string" && requested.length > 0) {
    const explicit = await resolveWorkspaceContext(requested);
    if (explicit.kind === "forbidden") notFound();
  }

  const resolution = await resolveNamedWorkspaceChoices();

  switch (resolution.kind) {
    case "choices":
      break;
    case "onboarding_required":
      redirect(SETUP_PATH);
      break;
    case "access_unavailable":
      redirect(NO_ACCESS_PATH);
      break;
    default:
      redirect(VERIFY_EMAIL_PATH);
  }

  const options: readonly WorkspaceOption[] = resolution.choices.map(
    (choice) => ({
      workspaceId: choice.workspaceId,
      name: choice.name,
      roleLabel: ROLE_LABEL[choice.role],
    }),
  );

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Choose a workspace
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          You have access to more than one business area. Pick the one you want
          to work in — you can switch at any time from the account menu.
        </p>
      </header>

      <ChooserForm options={options} next={next} />
    </div>
  );
}
