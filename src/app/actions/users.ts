"use server";

import { revalidatePath } from "next/cache";

import { can } from "@/lib/permissions";
import {
  isMembershipStatus,
  isUserProfileId,
  isWorkspaceRole,
} from "@/lib/validation/users";

import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import {
  deactivateMember,
  setMemberRole,
  setMemberStatus,
} from "@/server/auth/workspace-members";

/**
 * Settings → Users mutations — spec §159, §160.
 *
 * §162 makes "Manage Users" a fixed Owner/Admin "Yes" — not a configurable
 * cell — so the role is resolved here, on the server, from the membership
 * this request re-resolved, and never from anything the browser sent. A
 * Server Action is reachable by anyone who can POST to it, so the routine
 * behind each of these re-derives the same thing from stored rows, and that
 * check is the one that cannot be bypassed.
 *
 * ## The workspace the form was rendered for
 *
 * Same guard as Business Settings, for a sharper reason. The saved workspace
 * preference is a cookie shared by every tab. Without this, opening Users for
 * one workspace, switching elsewhere, then clicking Deactivate would send a
 * profile id that means nothing in the new workspace — at best a confusing
 * "unknown member", at worst a change to whoever that id happens to identify
 * there. The form carries the id it was rendered for, this compares it, and a
 * mismatch refuses. It is a detection, never a selection: the routine still
 * reads `app.workspace_id`.
 */

export type UserActionState = {
  readonly status:
    | "idle"
    | "ok"
    | "forbidden"
    | "stale"
    | "invalid"
    | "unknown_member"
    | "last_owner_admin"
    | "blocked_by_responsibilities"
    | "unavailable";
  /**
   * True when the change applied to the signed-in person's own membership, so
   * the form can say that their own access may have changed.
   */
  readonly selfAffected?: boolean;
  /** Changes on every submission, so the form can tell answers apart. */
  readonly attempt: number;
};

const RENDERED_WORKSPACE_FIELD = "renderedWorkspaceId";

const text = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
};

/**
 * The checks every mutation here repeats, in the order that matters.
 *
 * Authorisation is outermost: whether this person may manage users in the
 * workspace they are actually in is settled before anything the browser sent
 * is consulted at all.
 */
async function authorise(formData: FormData) {
  const { context, role, workspaceId } = await requireWorkspaceContext();

  if (!can({ role, action: "manage_users" })) {
    return { ok: false as const, status: "forbidden" as const };
  }

  // Fails closed: a submission that cannot say which workspace it was
  // rendered for is exactly the one that must not change a membership.
  if (text(formData, RENDERED_WORKSPACE_FIELD) !== workspaceId) {
    return { ok: false as const, status: "stale" as const };
  }

  const userProfileId = text(formData, "userProfileId");
  if (!isUserProfileId(userProfileId)) {
    return { ok: false as const, status: "invalid" as const };
  }

  return {
    ok: true as const,
    context,
    userProfileId,
    /*
     * Whether the row being changed is the actor's own, decided HERE from the
     * membership this request resolved — never from the form, so it cannot be
     * spoofed into suppressing the warning or into showing a false one.
     *
     * It must also be computed before the write. Re-resolving the gate
     * afterwards would redirect when the actor has just deactivated
     * themselves, and `redirect()` throws, so the result of a write that
     * already succeeded would be lost.
     */
    isSelf: context.userProfileId === userProfileId,
  };
}

/** Map a gateway refusal onto the state the form renders. */
const refusal = (reason: string): UserActionState["status"] => {
  switch (reason) {
    case "not_permitted":
      return "forbidden";
    case "unknown_member":
      return "unknown_member";
    case "last_owner_admin":
      return "last_owner_admin";
    case "invalid":
      return "invalid";
    default:
      return "unavailable";
  }
};

/** §159 Change Role. */
export async function setMemberRoleAction(
  previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const role = text(formData, "role");
  if (!isWorkspaceRole(role)) return { status: "invalid", attempt };

  const result = await setMemberRole(gate.context, gate.userProfileId, role);
  if (!result.ok) return { status: refusal(result.reason), attempt };

  // A role change alters what the navigation and every gated page will allow,
  // so the whole tree is revalidated rather than this page alone. That is what
  // re-resolves the actor's own access when they changed their own row.
  revalidatePath("/", "layout");
  return { status: "ok", selfAffected: gate.isSelf, attempt };
}

/** §160 Deactivate and Reactivate. */
export async function setMemberStatusAction(
  previous: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const status = text(formData, "status");
  if (!isMembershipStatus(status)) return { status: "invalid", attempt };

  /*
   * §160's reassignment precondition.
   *
   * `no_sources_exist` is a distinct answer from "counted, and found none" —
   * see the registry for why that distinction is the point. Milestone 3B
   * registered Leads, so the count below is real: a person who is the Record
   * Owner of any Lead cannot be deactivated. There is no reassignment
   * workflow to offer them yet, which is the order the registry describes.
   *
   * The count and the status change are ONE transaction, in `deactivateMember`
   * — separate statements left a window in which a Lead could be created for
   * someone between the count and the change. The count also covers every
   * Lead in the workspace rather than only the ones this actor can see, and
   * it refuses rather than answering zero when it cannot be taken. All of
   * that lives in the gateway, where the transaction is.
   */
  const result =
    status === "inactive"
      ? await deactivateMember(gate.context, gate.userProfileId)
      : await setMemberStatus(gate.context, gate.userProfileId, status);

  if (!result.ok && result.reason === "blocked") {
    return { status: "blocked_by_responsibilities", attempt };
  }
  if (!result.ok) return { status: refusal(result.reason), attempt };

  revalidatePath("/", "layout");
  return { status: "ok", selfAffected: gate.isSelf, attempt };
}
