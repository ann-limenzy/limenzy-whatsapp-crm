import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Link from "next/link";

import { SetupForm } from "@/app/(account)/setup/setup-form";
import { countryOptions } from "@/lib/workspace-options";
import { pendingInvitationsForMe } from "@/server/auth/invitation-acceptance";
import { requireUser } from "@/server/auth/require-user";
import {
  NO_ACCESS_PATH,
  SELECT_WORKSPACE_PATH,
  VERIFY_EMAIL_PATH,
} from "@/server/auth/require-workspace";
import { resolveWorkspaceContext } from "@/server/auth/workspace-context";

export const metadata: Metadata = { title: "Workspace setup" };

/**
 * Onboarding Screen 1 (spec 7) - create the business workspace.
 *
 * An ACCOUNT surface: it needs a verified person, and deliberately not a
 * workspace — it is where someone goes precisely because they have none. That
 * is why it sits under `(account)` rather than `(app)`, whose layout now
 * requires a resolved workspace and would bounce this page in a loop.
 *
 * `requireUser()` is still called here rather than relying on the layout,
 * because a layout can be refactored away without anyone noticing that a page
 * stopped being protected.
 *
 * It renders the form for exactly one state. Someone who already has a
 * workspace is not shown a creation form — they are routed to it, which also
 * settles the email-confirmation link, whose `next` defaults to `/setup`.
 * Deliberately NOT offered: a second workspace for an existing member, and a
 * replacement workspace for someone whose access was removed.
 *
 * Only two things cross into the client component: the display name from
 * signup metadata, as an editable default, and the country labels. **No claim,
 * Auth UUID, profile id, membership id, role or connection detail is passed** -
 * the form has no use for any of them, and the operation behind it reads
 * identity from the verified token itself.
 *
 * No `TenantContext` is resolved or minted here. After the workspace exists,
 * the next request resolves its context through Phase 4A/4B like any other.
 */
export default async function SetupPage() {
  const user = await requireUser("/setup");

  /**
   * Resolved with NO candidate: whether this person may see a creation form
   * has nothing to do with a saved preference, and reading one here would let
   * a stale cookie decide what the page is.
   *
   * A database failure throws out of here to the `(account)` boundary as a
   * retryable error. It is never flattened into "you need to onboard".
   */
  const resolution = await resolveWorkspaceContext();

  switch (resolution.kind) {
    case "onboarding_required":
      break;
    case "ok":
      // Already a member: go where the application decides, on a fresh request.
      redirect("/");
      break;
    case "workspace_selection_required":
      redirect(SELECT_WORKSPACE_PATH);
      break;
    case "access_unavailable":
      redirect(NO_ACCESS_PATH);
      break;
    default:
      // `unauthenticated` here means a verified token whose address is not
      // confirmed; `forbidden` cannot occur without a candidate.
      redirect(VERIFY_EMAIL_PATH);
  }

  /*
   * Someone invited to an existing workspace must never be funnelled into
   * creating one of their own — §159 invites people INTO a workspace, and a
   * second, empty workspace is the one outcome nobody wanted.
   *
   * The invitation link normally carries them straight to `/invitations`,
   * but the continuation can be lost: the confirmation email opened in
   * another browser, a link opened before signing up, a cookie cleared. This
   * is the recovery for that case. It is offered, never forced — creating a
   * workspace is still right here for anyone who meant to.
   */
  const waiting = await pendingInvitationsForMe();
  const invited = waiting.status === "ok" ? waiting.invitations : [];

  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 gap-6 sm:gap-8">
      {invited.length > 0 ? (
        <div className="grid gap-2 rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium">
            {invited.length === 1
              ? `You have been invited to join ${invited[0]!.workspaceName}.`
              : "You have been invited to join an existing workspace."}
          </p>
          <p className="text-sm text-muted-foreground">
            Joining it is probably what you want — setting up a company below
            creates a separate, empty workspace instead.
          </p>
          <Link
            href="/invitations"
            className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            See the invitation
          </Link>
        </div>
      ) : null}

      {/*
        Nothing is waiting, and the lookup did run — so this person has no
        invitation this address can accept.

        That sentence is the whole point. An invitation matches the invited
        address EXACTLY, and somebody who signed up a character out — a
        different top-level domain, a plus-alias, a different mailbox
        entirely — gets a form offering to build a company when what they
        wanted was to join one, with nothing on the page to explain the gap.
        Showing them the address they are actually signed in as is what lets
        them see it for themselves.

        Deliberately quiet, and phrased as a question: an ordinary sign-up is
        the common case here and must not be made to feel like a mistake. It
        discloses nothing — the only address named is their own, and no
        invitation is confirmed or denied to exist.
      */}
      {waiting.status === "ok" && invited.length === 0 && user.email ? (
        <div className="grid gap-1 rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium">Were you invited to a team?</p>
          <p className="text-sm text-muted-foreground">
            You are signed in as{" "}
            <strong className="font-medium">{user.email}</strong>, and there is
            no invitation waiting for that address. An invitation only works for
            the exact address it was sent to — if yours went somewhere else,
            sign in with that address instead, or ask whoever invited you to
            send a new one.
          </p>
        </div>
      ) : null}

      {/*
        The lookup fell over. Said out loud rather than shown as "nothing is
        waiting": the whole hazard here is somebody with a valid invitation
        being quietly handed a form that builds a second, empty workspace.
        The form stays below, because an ordinary sign-up must not be blocked
        by a problem that has nothing to do with them.
      */}
      {waiting.status === "unavailable" ? (
        <div
          role="alert"
          className="grid gap-2 rounded-xl border border-danger/30 bg-danger-subtle p-4"
        >
          <p className="text-sm font-medium text-danger-on-subtle">
            We could not check whether you have an invitation.
          </p>
          <p className="text-sm text-danger-on-subtle">
            If someone invited you to their team, do not set up a company here —
            that would create a separate, empty one. Reload this page, or open
            your invitation link again.
          </p>
          <Link
            href="/invitations"
            className="w-fit rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Check for an invitation
          </Link>
        </div>
      ) : null}
      <header className="grid gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-balance text-foreground sm:text-2xl">
          Set up your company
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          A few details and your private CRM area is ready. You can change any
          of this later in Settings.
        </p>
      </header>

      <section className="surface-elevated min-w-0 rounded-xl border p-4 sm:p-6">
        <SetupForm
          defaultFullName={user.fullName ?? ""}
          countries={countryOptions()}
        />
      </section>
    </div>
  );
}
