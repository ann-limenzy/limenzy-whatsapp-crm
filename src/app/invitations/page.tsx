import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { InvitationAcceptance } from "@/components/invitations/invitation-acceptance";
import { formatInvitationExpiry } from "@/lib/invitation-display";
import { ROLE_LABELS } from "@/lib/validation/users";
import type { WorkspaceRole } from "@/lib/permissions";
import { pendingInvitationsForMe } from "@/server/auth/invitation-acceptance";
import { getAuthenticatedUser } from "@/server/auth/require-user";
import { VERIFY_EMAIL_PATH } from "@/server/auth/require-workspace";

export const metadata: Metadata = { title: "Join your team" };
export const dynamic = "force-dynamic";

/**
 * Where an invitation link lands.
 *
 * **Three states, and the first one is new.** Most people opening an
 * invitation have no account yet, so being bounced to a sign-in form is the
 * wrong first impression and the wrong instruction. Signed out, this page is
 * a welcome that offers creating an account as the main thing to do.
 *
 * **It never runs the workspace gate.** The visitor has no membership yet and
 * may have no profile, so `requireWorkspaceContext()` would send a brand-new
 * invitee to `/setup` and have them build a workspace of their own instead of
 * joining the one that invited them. That is the exact failure this page
 * exists to prevent.
 *
 * **Viewing redeems nothing.** The link's Route Handler only moved the token
 * into a short-lived cookie; joining is an explicit press.
 *
 * **The token never appears here**, in the markup or the URL. It is read from
 * the cookie by the action, on the server.
 */
export default async function InvitationsPage() {
  const user = await getAuthenticatedUser();

  /*
   * Signed out: welcome, not a redirect.
   *
   * `next` carries the way back here through signing up, confirming an
   * address and signing in. The invitation itself travels in the cookie, and
   * if that lapses — a confirmation link opened on a different device, say —
   * the list below finds the invitation again from the verified address. So
   * the journey survives either way.
   */
  if (!user) {
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-6 px-4 py-12">
        <div className="grid gap-3 text-center">
          <h1 className="text-2xl font-semibold">You have been invited</h1>
          <p className="text-sm text-muted-foreground">
            Someone has invited you to join their team on Limenzy CRM. Create
            your account to get started.
          </p>
        </div>

        <div className="grid gap-3">
          <Link
            href="/sign-up?next=%2Finvitations"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Create account and join
          </Link>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/sign-in?next=%2Finvitations"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Use the email address your invitation was sent to.
        </p>
      </main>
    );
  }

  // An invitation is tied to an address, and an unconfirmed one is a claim
  // rather than a fact. Confirming returns here.
  if (!user.emailVerified) redirect(VERIFY_EMAIL_PATH);

  /*
   * Everything live for this verified address — which is also the recovery
   * path when the link's cookie is gone.
   */
  const waiting = await pendingInvitationsForMe();

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-xl content-start gap-6 px-4 py-12">
      <header className="grid gap-2">
        <h1 className="text-2xl font-semibold">Join your team</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user.email}
        </p>
      </header>

      {waiting.status === "unavailable" ? (
        <div
          role="alert"
          className="grid gap-2 rounded-xl border border-danger/30 bg-danger-subtle p-4"
        >
          <p className="text-sm font-medium text-danger-on-subtle">
            We could not check your invitations just now.
          </p>
          <p className="text-sm text-danger-on-subtle">
            Nothing has changed. Reload this page in a moment, or open your
            invitation link again.
          </p>
        </div>
      ) : null}

      <InvitationAcceptance
        unavailable={waiting.status === "unavailable"}
        invitations={(waiting.status === "ok" ? waiting.invitations : []).map(
          (invitation) => ({
            invitationId: invitation.invitationId,
            workspaceName: invitation.workspaceName,
            roleLabel:
              ROLE_LABELS[invitation.role as WorkspaceRole] ?? invitation.role,
            /* UTC: the visitor has no workspace yet, so there is no business
             time zone to render this in. */
            expiresLabel: formatInvitationExpiry(invitation.expiresAt, "UTC"),
          }),
        )}
      />
    </main>
  );
}
