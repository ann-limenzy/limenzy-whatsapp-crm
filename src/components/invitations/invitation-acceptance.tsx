"use client";

import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signOutAction } from "@/app/actions/auth";
import {
  acceptInvitationAction,
  type AcceptanceActionState,
} from "@/app/actions/invitations";
import { Button } from "@/components/ui/button";

/**
 * The join step — spec §159.
 *
 * Joining is an explicit press, never a side effect of arriving: §159's Add
 * User adds somebody to a workspace, and that should not happen because a
 * mail client prefetched a link.
 *
 * The token is not here. It lives in an HttpOnly cookie the link's Route
 * Handler set, so page scripts cannot read it and it is not posted back in
 * the form — only the invitation id is, and only on the recovery path, where
 * the verified address is what authorises.
 */

export type WaitingInvitation = {
  readonly invitationId: string;
  readonly workspaceName: string;
  readonly roleLabel: string;
  /** Already written out by the server — see the settings list for why. */
  readonly expiresLabel: string;
};

const INITIAL: AcceptanceActionState = { status: "idle", attempt: 0 };

function JoinButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Joining…" : label}
    </Button>
  );
}

export function InvitationAcceptance({
  hasLink,
  invitations,
}: {
  /** Whether an invitation link was opened for this browser. */
  hasLink: boolean;
  invitations: readonly WaitingInvitation[];
}) {
  const [state, formAction] = useActionState(acceptInvitationAction, INITIAL);

  if (
    state.status === "joined" ||
    state.status === "reactivated" ||
    state.status === "already_member"
  ) {
    return (
      <div
        role="status"
        className="grid gap-4 rounded-xl border border-success/30 bg-success-subtle p-5 text-success-on-subtle"
      >
        <p className="flex items-start gap-2 text-base font-semibold">
          <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <span>
            {state.status === "already_member"
              ? "You are already a member"
              : "You're in"}
          </span>
        </p>
        <p className="text-sm">
          {state.status === "already_member"
            ? "You already belonged to this workspace, so nothing about your access changed."
            : state.status === "reactivated"
              ? "Your access has been restored."
              : "You have joined the workspace."}
        </p>
        <Link
          href="/"
          className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Go to the CRM
        </Link>
      </div>
    );
  }

  const problem =
    state.status === "email_mismatch"
      ? "This invitation was sent to a different email address. Sign in with that address to accept it."
      : state.status === "inviter_not_permitted"
        ? "Whoever sent this invitation no longer manages this workspace. Ask an Owner/Admin to send a new one."
        : state.status === "invalid"
          ? "This invitation is no longer valid. It may have been used, withdrawn, or it may have expired."
          : state.status === "unauthenticated"
            ? "Your session ended. Sign in again to accept."
            : state.status === "unavailable"
              ? "That could not be completed just now. Nothing was changed."
              : null;

  return (
    <div className="grid gap-5">
      {problem ? (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-on-subtle"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="min-w-0">{problem}</span>
        </div>
      ) : null}

      {hasLink && invitations.length === 0 ? (
        /* A link was opened, but nothing live is addressed to this account.
           Said in one way for every cause, so the page never confirms that a
           particular workspace or token exists. */
        <div className="grid gap-3 rounded-xl border border-border bg-muted/40 p-5">
          <p className="text-sm font-medium">
            This invitation is not available for {""}
            <span className="font-semibold">this account</span>.
          </p>
          <p className="text-sm text-muted-foreground">
            It may have been sent to a different email address, already used,
            withdrawn, or expired. If you have another account, sign out and
            sign in with the address it was sent to.
          </p>
          <form action={signOutAction} className="w-fit">
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      ) : null}

      {invitations.map((invitation) => (
        <form
          key={invitation.invitationId}
          action={formAction}
          className="grid gap-3 rounded-xl border border-border p-5"
        >
          {/* Only needed when there is no link cookie — the recovery path. */}
          <input
            type="hidden"
            name="invitationId"
            value={invitation.invitationId}
          />
          <p className="text-base font-semibold">{invitation.workspaceName}</p>
          <p className="text-sm text-muted-foreground">
            You have been invited as {invitation.roleLabel}. This invitation
            expires on {invitation.expiresLabel}.
          </p>
          <JoinButton label={`Join ${invitation.workspaceName}`} />
        </form>
      ))}

      {!hasLink && invitations.length === 0 ? (
        <div className="grid gap-3 rounded-xl border border-border bg-muted/40 p-5">
          <p className="flex items-start gap-2 text-sm font-medium">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>No invitation is waiting for this address.</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Ask whoever invited you to send a new link. You can also start a
            workspace of your own — that is a separate thing, and nothing here
            does it for you.
          </p>
          <Link
            href="/setup"
            className="w-fit rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Create my own workspace
          </Link>
        </div>
      ) : null}
    </div>
  );
}
