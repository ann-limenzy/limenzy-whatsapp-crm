import "server-only";

import {
  resolveWorkspaceChoices,
  type TenantContext,
  type WorkspaceChoiceContext,
} from "@/server/auth/workspace-context";
import type { WorkspaceRole } from "@/server/db/identity";
import { withTenant } from "@/server/db/tenant";

/**
 * The chooser's data: which workspaces this user may enter, by name.
 *
 * The whole path is the ordinary authorised one, end to end:
 *
 *   verified access token  →  resolveVerifiedIdentity()   (RLS, own rows only)
 *   active memberships     →  resolveWorkspaceChoices()   (mints each context)
 *   one context per choice →  withTenant(...)             (SET LOCAL app.*)
 *   workspaces_member_select grants exactly that one row, and only while the
 *   membership is still active.
 *
 * No tooling connection, no secret key, no `SECURITY DEFINER`, no policy
 * change, no second query path. One transaction per workspace is not an
 * oversight — the policy requires `app.workspace_id` to equal the row being
 * read, so a single transaction can authorise exactly one name.
 *
 * **A context never leaves the server.** Only `workspaceId`, `role` and `name`
 * are returned, so nothing here can be serialised into a payload a browser
 * receives.
 */

/**
 * The current workspace's name, for display in the shell.
 *
 * Takes a context the caller already resolved — this function neither mints
 * one nor decides anything. `null` when the row is not readable, which means
 * the membership stopped being active between the gate and this read; the
 * shell shows a neutral label and the user's next request is refused by the
 * gate, which is the correct order for that race.
 */
export async function workspaceNameFor(
  context: TenantContext,
): Promise<string | null> {
  const rows = await withTenant(
    context,
    async (tx) => tx<{ name: string }[]>`select name from public.workspaces`,
  );
  return rows[0]?.name ?? null;
}

export type NamedWorkspaceChoice = {
  readonly workspaceId: string;
  readonly role: WorkspaceRole;
  readonly name: string;
};

export type WorkspaceChoicesWithNames =
  | { readonly kind: "unauthenticated" }
  | { readonly kind: "onboarding_required" }
  /** No membership, or none that is still readable. Same destination either way. */
  | { readonly kind: "access_unavailable" }
  | {
      readonly kind: "choices";
      readonly choices: readonly NamedWorkspaceChoice[];
    };

/**
 * Read one workspace's name under its own context.
 *
 * Returns `null` when the policy yields no row — which happens when the
 * membership was deactivated between resolution and this read. A failure of
 * the query itself is NOT turned into `null`: it propagates, because "the
 * database is unavailable" must never be rendered as "you have fewer
 * workspaces than you thought".
 */
async function readName(
  choice: WorkspaceChoiceContext,
): Promise<string | null> {
  const rows = await withTenant(
    choice.context,
    async (tx) => tx<{ name: string }[]>`select name from public.workspaces`,
  );
  const row = rows[0];
  return row ? row.name : null;
}

/**
 * Every choice this user may act on, named.
 *
 * Choices whose name cannot be read are **dropped**, never shown as a
 * placeholder: an entry a user can see and click, which the resolver would
 * then refuse, is a worse answer than not offering it. If that empties the
 * list, the honest outcome is the access-unavailable state, which is where the
 * user's next request would land anyway.
 */
export async function resolveNamedWorkspaceChoices(): Promise<WorkspaceChoicesWithNames> {
  const resolution = await resolveWorkspaceChoices();

  if (resolution.kind !== "choices") return resolution;

  const named: NamedWorkspaceChoice[] = [];
  for (const choice of resolution.choices) {
    // Sequential rather than concurrent: each iteration opens its own
    // transaction on the runtime pool, and a burst of them on one small pool
    // is how a chooser turns into a connection stampede.
    const name = await readName(choice);
    if (name === null) continue;
    named.push(
      Object.freeze({
        workspaceId: choice.workspaceId,
        role: choice.role,
        name,
      }),
    );
  }

  if (named.length === 0) {
    return Object.freeze({
      kind: "access_unavailable",
    }) as WorkspaceChoicesWithNames;
  }

  return Object.freeze({
    kind: "choices",
    choices: Object.freeze(named),
  }) as WorkspaceChoicesWithNames;
}
