"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  createInvitationToken,
  hashInvitationToken,
  invitationExpiry,
  isInvitationToken,
} from "@/lib/invitation-token";
import { can } from "@/lib/permissions";
import {
  parseInvitation,
  type InvitationField,
} from "@/lib/validation/invitations";
import { serverEnv } from "@/lib/env";
import { formatInvitationExpiry } from "@/lib/invitation-display";
import { sendInvitationEmail } from "@/server/email/invitation-email";
import { businessSettingsFor } from "@/server/auth/workspace-business-settings";
import { acceptInvitation } from "@/server/auth/invitation-acceptance";
import { emailsForAuthUsers } from "@/server/auth/member-emails";
import { workspaceMembers } from "@/server/auth/workspace-members";
import {
  INVITATION_COOKIE,
  invitationCookieOptions,
} from "@/server/auth/invitation-cookie";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import {
  createInvitation,
  regenerateInvitation,
  revokeInvitation,
} from "@/server/auth/workspace-invitations";

/**
 * Invitations — spec §159 "Add User".
 *
 * §162 makes Manage Users a fixed Owner/Admin "Yes", so the role is resolved
 * here, on the server, from the membership this request re-resolved. A Server
 * Action is reachable by anyone who can POST to it, so the policies behind
 * these re-derive the same thing from stored rows.
 *
 * **The link is returned once and never stored.** A token exists in exactly
 * two places: the response that creates it, and the browser of whoever is
 * sent it. Only its hash reaches the database, and nothing here logs it — not
 * on success, not in an error.
 *
 * **The stale-workspace guard applies**, as it does to every Settings
 * mutation: the form carries the workspace it was rendered for, and a
 * mismatch refuses rather than inviting someone into whichever workspace the
 * preference cookie happens to name now.
 */

export type InvitationActionState = {
  readonly status:
    | "idle"
    | "created"
    | "regenerated"
    | "revoked"
    | "invalid"
    | "already_invited"
    | "already_member"
    /**
     * Whether that address already belongs to an active member could not be
     * established, so nothing was created. A configuration problem, not a
     * judgement about the address.
     */
    | "eligibility_unknown"
    | "forbidden"
    | "stale"
    | "unavailable";
  /** Shown once, for copying. Never persisted and never logged. */
  readonly link?: string;
  /**
   * Which invitation this outcome concerns, and the address it is for — both
   * read back from the row the database actually wrote, never echoed from
   * the submission. The screen uses them to put an outcome next to the right
   * row and to name the person in a confirmation.
   */
  readonly invitationId?: string;
  readonly email?: string;
  /**
   * What happened to the EMAIL, which is a separate question from what
   * happened to the invitation.
   *
   *   accepted        the mail server took the message. Not a promise that it
   *                   arrives — it may still bounce or be filed as spam.
   *   not_configured  no mail is set up; the link is the whole mechanism.
   *   failed          mail is set up and the attempt did not work. The
   *                   invitation still exists and the link still works.
   *
   * The invitation is never rolled back because a message failed: a usable
   * invitation nobody was told about is recoverable, and an Owner/Admin can
   * copy the link or ask for another attempt.
   */
  readonly delivery?: "accepted" | "not_configured" | "failed";
  readonly fieldErrors?: Readonly<Partial<Record<InvitationField, string>>>;
  readonly attempt: number;
};

const RENDERED_WORKSPACE_FIELD = "renderedWorkspaceId";

const text = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
};

/** Authorisation first, then the workspace the form was rendered for. */
async function authorise(formData: FormData) {
  const { context, role, workspaceId } = await requireWorkspaceContext();
  if (!can({ role, action: "manage_users" })) {
    return { ok: false as const, status: "forbidden" as const };
  }
  if (text(formData, RENDERED_WORKSPACE_FIELD) !== workspaceId) {
    return { ok: false as const, status: "stale" as const };
  }
  return { ok: true as const, context };
}

/**
 * The absolute address an invitation link points at.
 *
 * `NEXT_PUBLIC_SITE_URL` when it is configured, because that is the address
 * the recipient can actually reach; otherwise the request's own origin, which
 * is right for local development and previews.
 */
async function invitationOrigin(): Promise<string> {
  const configured = serverEnv().NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) throw new Error("Unable to determine the request origin.");
  const proto =
    headerList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

/**
 * Is this address already an ACTIVE member of this workspace?
 *
 * §159 adds people who are not here yet, so inviting someone who already has
 * access is a mistake worth catching at the point it is made rather than one
 * to discover when the link reports "you are already a member".
 *
 * The membership rows come from the workspace-scoped routine and the
 * addresses only for the ids it returned, in that order — the same ordering
 * the Settings page uses, so an unauthorised caller never reaches the Auth
 * Admin credential. `authorise()` has already run above every call site.
 *
 * **It answers "unknown", and "unknown" refuses.** Deciding eligibility means
 * reading addresses out of Auth, and that lookup can be missing (no secret
 * key configured) or fail (the API refused, or timed out part way). Treating
 * either as "not a member" would quietly invite someone who already works
 * here, which is the exact mistake this exists to prevent — so the caller
 * reports a configuration problem instead of guessing.
 *
 * **It is still a check, not a lock.** Someone could be reactivated between
 * this read and the insert. That race is not a hole: acceptance re-reads
 * membership inside the locked transaction and leaves an active membership
 * exactly as it found it. This is the courtesy in front of that guarantee,
 * not a replacement for it.
 */
type Eligibility = "active_member" | "not_a_member" | "unknown";

async function activeMembershipFor(
  context: Parameters<typeof workspaceMembers>[0],
  email: string,
): Promise<Eligibility> {
  const active = (await workspaceMembers(context)).filter(
    (member) => member.status === "active",
  );

  /*
   * A profile whose Auth account is gone (`auth_user_id` is NULL — the
   * foreign key sets it null on deletion) is deliberately not counted as
   * unresolvable. There is no account holding that address any more, so it
   * cannot be the invitee: acceptance matches a profile by Auth user id, and
   * a detached profile can never be matched.
   */
  const ids = active
    .map((member) => member.authUserId)
    .filter((id): id is string => id !== null);
  if (ids.length === 0) return "not_a_member";

  const { status, emails } = await emailsForAuthUsers(ids);
  for (const address of emails.values()) {
    if (address !== null && address.toLowerCase() === email) {
      return "active_member";
    }
  }

  // Not found among the ones that answered — which only settles the question
  // if they all answered.
  return status === "ok" ? "not_a_member" : "unknown";
}

const linkFor = async (token: string) =>
  `${await invitationOrigin()}/invitations/${token}`;

/**
 * Hand the invitation to the mail server, and report what it said.
 *
 * Deliberately after the row exists. If this fails the invitation is still
 * there and still valid, so the screen can offer the link or another attempt;
 * sending first and creating second would risk the opposite — a message
 * pointing at an invitation that was never stored.
 */
async function deliver(
  context: Parameters<typeof businessSettingsFor>[0],
  invitation: {
    readonly to: string;
    readonly link: string;
    readonly expiresAt: Date;
    readonly invitedName: string | null;
  },
): Promise<"accepted" | "not_configured" | "failed"> {
  const workspace = await businessSettingsFor(context);
  const outcome = await sendInvitationEmail({
    to: invitation.to,
    workspaceName: workspace?.name ?? "your team",
    link: invitation.link,
    expiresLabel: formatInvitationExpiry(
      invitation.expiresAt,
      workspace?.timeZone ?? "UTC",
    ),
    invitedName: invitation.invitedName,
  });
  return outcome.ok ? "accepted" : outcome.reason;
}

/** §159 Add User — issue an invitation and show its link once. */
export async function createInvitationAction(
  previous: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const parsed = parseInvitation({
    email: formData.get("email"),
    role: formData.get("role"),
    invitedName: formData.get("invitedName"),
  });
  if (!parsed.ok) {
    const fieldErrors: Partial<Record<InvitationField, string>> = {};
    for (const issue of parsed.issues)
      fieldErrors[issue.field] ??= issue.message;
    return { status: "invalid", fieldErrors, attempt };
  }

  // Before a token exists: nothing is generated for an invitation that is
  // going to be refused. `parsed.value.email` is already normalised.
  const eligibility = await activeMembershipFor(
    gate.context,
    parsed.value.email,
  );
  if (eligibility === "active_member") {
    return { status: "already_member", attempt };
  }
  if (eligibility === "unknown") {
    return { status: "eligibility_unknown", attempt };
  }

  const token = createInvitationToken();
  const expiry = invitationExpiry();
  const result = await createInvitation(gate.context, {
    ...parsed.value,
    tokenHash: await hashInvitationToken(token),
    expiresAt: expiry,
  });

  if (!result.ok) {
    return {
      status:
        result.reason === "already_invited"
          ? "already_invited"
          : result.reason === "not_permitted"
            ? "forbidden"
            : "unavailable",
      attempt,
    };
  }

  const link = await linkFor(token);
  const delivery = await deliver(gate.context, {
    to: result.email,
    link,
    expiresAt: expiry,
    invitedName: result.invitedName,
  });

  revalidatePath("/settings");
  return {
    status: "created",
    link,
    invitationId: result.id,
    email: result.email,
    delivery,
    attempt,
  };
}

/** Replace a pending invitation's link and restart its seven days. */
export async function regenerateInvitationAction(
  previous: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const invitationId = text(formData, "invitationId");
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) {
    return { status: "invalid", attempt };
  }

  const token = createInvitationToken();
  const expiry = invitationExpiry();
  const result = await regenerateInvitation(
    gate.context,
    invitationId,
    await hashInvitationToken(token),
    expiry,
  );
  if (!result.ok) return { status: "unavailable", attempt };

  const link = await linkFor(token);
  const delivery = await deliver(gate.context, {
    to: result.email,
    link,
    expiresAt: expiry,
    invitedName: result.invitedName,
  });

  revalidatePath("/settings");
  return {
    status: "regenerated",
    link,
    invitationId: result.id,
    email: result.email,
    delivery,
    attempt,
  };
}

/** Withdraw a pending invitation. The row stays; the link stops working. */
export async function revokeInvitationAction(
  previous: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const attempt = previous.attempt + 1;
  const gate = await authorise(formData);
  if (!gate.ok) return { status: gate.status, attempt };

  const invitationId = text(formData, "invitationId");
  if (!/^[0-9a-f-]{36}$/i.test(invitationId)) {
    return { status: "invalid", attempt };
  }

  const result = await revokeInvitation(gate.context, invitationId);
  if (!result.ok) return { status: "unavailable", attempt };

  revalidatePath("/settings");
  return {
    status: "revoked",
    invitationId: result.id,
    email: result.email,
    attempt,
  };
}

export type AcceptanceActionState = {
  readonly status:
    | "idle"
    | "joined"
    | "reactivated"
    | "already_member"
    | "invalid"
    | "email_mismatch"
    | "inviter_not_permitted"
    | "unauthenticated"
    | "unavailable";
  readonly attempt: number;
};

/**
 * Join the workspace an invitation names.
 *
 * The token comes from the cookie the link route stored, never from the form:
 * a page that posted it back would put it in a request body that proxies and
 * error reporters routinely capture, and would let one page's token be
 * replayed from another.
 *
 * This is the explicit action §159 requires — viewing a link never redeems
 * it. The identity, the address and its verification all come from the
 * session on the server; nothing here is read from the submission.
 */
export async function acceptInvitationAction(
  previous: AcceptanceActionState,
  formData: FormData,
): Promise<AcceptanceActionState> {
  const attempt = previous.attempt + 1;
  const store = await cookies();
  const token = store.get(INVITATION_COOKIE)?.value;

  /*
   * The invitation the page actually offered, when it named one; the link's
   * token otherwise.
   *
   * **The id wins deliberately.** The cookie is a continuation, and it
   * outlives the link that set it: open one link, have it regenerated or
   * withdrawn, then accept a different invitation from the recovery list, and
   * a cookie-first rule would redeem the dead token and refuse an acceptance
   * that was perfectly valid. The person would be told their invitation was
   * invalid while looking at it.
   *
   * It is not a weaker check. An invitation id is not a secret and confers
   * nothing on its own: the routine still requires a signed-in, verified
   * address equal to the invited one, and the page only lists invitations
   * already addressed to that person. The token's job is to carry the
   * invitation here and to keep it out of the URL — not to be the thing that
   * authorises, which is the verified identity.
   */
  const invitationId = text(formData, "invitationId");
  const by =
    invitationId !== ""
      ? { invitationId }
      : isInvitationToken(token)
        ? { tokenHash: await hashInvitationToken(token) }
        : null;
  if (!by) return { status: "invalid", attempt };

  const outcome = await acceptInvitation(by);

  // Clear the cookie once it can no longer be used, so a shared browser does
  // not keep a live token. A refusal that is worth retrying keeps it.
  if (
    outcome === "joined" ||
    outcome === "reactivated" ||
    outcome === "already_member" ||
    outcome === "invalid"
  ) {
    store.set(INVITATION_COOKIE, "", {
      ...invitationCookieOptions(),
      maxAge: 0,
    });
  }

  // Membership changed what every gated page will allow, so the whole tree is
  // revalidated rather than this page alone.
  revalidatePath("/", "layout");
  return { status: outcome, attempt };
}
