import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { InvitationAcceptance } from "@/components/invitations/invitation-acceptance";
import { formatInvitationExpiry } from "@/lib/invitation-display";
import { ROLE_LABELS } from "@/lib/validation/users";
import type { WorkspaceRole } from "@/lib/permissions";
import { INVITATION_COOKIE } from "@/server/auth/invitation-cookie";
import { pendingInvitationsForMe } from "@/server/auth/invitation-acceptance";
import { requireUser } from "@/server/auth/require-user";
import { VERIFY_EMAIL_PATH } from "@/server/auth/require-workspace";

export const metadata: Metadata = { title: "Join a workspace" };
export const dynamic = "force-dynamic";

/**
 * Accepting an invitation — spec §159.
 *
 * **It requires a signed-in person and nothing else.** Deliberately NOT
 * `requireWorkspaceContext()`: the whole point is that the visitor has no
 * membership yet, and may have no profile either. Running the workspace gate
 * here would redirect a brand-new invitee to `/setup`, where they would
 * create a workspace of their own instead of joining the one that invited
 * them — the exact failure this page exists to prevent.
 *
 * **Viewing redeems nothing.** The link's Route Handler only moved the token
 * into a cookie; joining is the explicit action below.
 *
 * **The token never appears here.** It is read from the cookie by the action,
 * server-side, so it reaches neither this page's markup nor its URL.
 */
export default async function InvitationsPage() {
  // Signing in returns here, so the cookie — and with it the invitation — is
  // still in place afterwards. No token is threaded through `next`.
  const user = await requireUser("/invitations");

  // §159 binds an invitation to an address, and an unconfirmed one is a claim
  // rather than a fact. The confirmation link returns to this page.
  if (!user.emailVerified) redirect(VERIFY_EMAIL_PATH);

  const store = await cookies();
  const hasLink = Boolean(store.get(INVITATION_COOKIE)?.value);

  /*
   * Everything live for this verified address.
   *
   * This is also the recovery path: if the continuation was lost — a
   * confirmation link opened in another browser, say — there is no cookie,
   * and the person still sees what is waiting for them instead of being
   * pushed into creating a workspace they do not want.
   */
  const waiting = await pendingInvitationsForMe();

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-xl content-start gap-6 px-4 py-12">
      <header className="grid gap-2">
        <h1 className="text-2xl font-semibold">Join a workspace</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user.email}. An invitation can only be accepted by the
          address it was sent to.
        </p>
      </header>

      <InvitationAcceptance
        hasLink={hasLink}
        invitations={waiting.map((invitation) => ({
          invitationId: invitation.invitationId,
          workspaceName: invitation.workspaceName,
          roleLabel:
            ROLE_LABELS[invitation.role as WorkspaceRole] ?? invitation.role,
          /* UTC: the visitor has no workspace yet, so there is no §158 time
             zone to render this in. */
          expiresLabel: formatInvitationExpiry(invitation.expiresAt, "UTC"),
        }))}
      />
    </main>
  );
}
