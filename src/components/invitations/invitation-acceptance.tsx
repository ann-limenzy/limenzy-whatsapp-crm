"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
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
 * The join step.
 *
 * Joining is an explicit press, never a side effect of arriving: adding
 * somebody to a workspace should not happen because a mail client prefetched
 * a link.
 *
 * The token is not here. It lives in an HttpOnly cookie the link's Route
 * Handler set, so page scripts cannot read it and it is not posted back in
 * the form — only the invitation id is, and the verified address is what
 * authorises either way.
 *
 * **Every dead end is one screen.** Used, cancelled, expired, or sent to a
 * different address: the person cannot act on any of them and does not need
 * to be taught the difference, so they are told the same understandable
 * thing. It is also the right answer for privacy — a page that distinguished
 * them would confirm which invitations exist.
 */

export type WaitingInvitation = {
  readonly invitationId: string;
  readonly workspaceName: string;
  readonly roleLabel: string;
  /** Already written out by the server. */
  readonly expiresLabel: string;
};

const INITIAL: AcceptanceActionState = { status: "idle", attempt: 0 };

function JoinButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
      {pending ? "Joining…" : label}
    </Button>
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="grid gap-4 rounded-xl border border-border bg-muted/40 p-6 text-center">
      <p className="text-base font-semibold">
        This invitation is not available
      </p>
      <p className="text-sm text-muted-foreground">{reason}</p>
      <p className="text-sm text-muted-foreground">
        Ask the person who invited you to send a new one.
      </p>
      <div className="flex flex-wrap justify-center gap-3 pt-1">
        <form action={signOutAction}>
          <Button type="submit" variant="outline" size="sm">
            Sign in as someone else
          </Button>
        </form>
        <Link
          href="/setup"
          className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-muted"
        >
          Start my own workspace
        </Link>
      </div>
    </div>
  );
}

export function InvitationAcceptance({
  invitations,
  unavailable = false,
}: {
  invitations: readonly WaitingInvitation[];
  /**
   * The lookup could not be made, so an empty list means UNKNOWN rather than
   * none. Without this the screen would announce "this invitation is not
   * available" on the strength of a failure it cannot see — a confident
   * answer to a question nobody asked it.
   */
  unavailable?: boolean;
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
        className="grid gap-4 rounded-xl border border-success/30 bg-success-subtle p-6 text-success-on-subtle"
      >
        <p className="flex items-start gap-2 text-base font-semibold">
          <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <span>
            {state.status === "already_member"
              ? "You are already part of this team"
              : "You're in"}
          </span>
        </p>
        <p className="text-sm">
          {state.status === "already_member"
            ? "Nothing about your access changed."
            : state.status === "reactivated"
              ? "Your access has been turned back on."
              : "You have joined the team."}
        </p>
        <Link
          href="/"
          className="inline-flex h-10 w-fit items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Go to the CRM
        </Link>
      </div>
    );
  }

  /*
   * One screen for every dead end. `email_mismatch` is the one worth telling
   * apart, because the person can act on it — they are signed in as the wrong
   * account and can simply switch.
   */
  if (state.status === "email_mismatch") {
    return (
      <Unavailable reason="This invitation was sent to a different email address. Sign in with that address to accept it." />
    );
  }
  if (
    state.status === "invalid" ||
    state.status === "inviter_not_permitted" ||
    (state.status === "idle" && invitations.length === 0 && !unavailable)
  ) {
    return (
      <Unavailable reason="It may have been used already, cancelled, or it may have expired." />
    );
  }

  const problem =
    state.status === "unauthenticated"
      ? "Your session ended. Sign in again to accept this invitation."
      : state.status === "unavailable"
        ? "That did not work. Nothing was changed — please try again."
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

      {invitations.map((invitation) => (
        <form
          key={invitation.invitationId}
          action={formAction}
          className="grid gap-4 rounded-xl border border-border p-6"
        >
          {/* Only needed when the link's cookie is gone. */}
          <input
            type="hidden"
            name="invitationId"
            value={invitation.invitationId}
          />
          <div className="grid gap-1">
            <p className="text-lg font-semibold">{invitation.workspaceName}</p>
            <p className="text-sm text-muted-foreground">
              You have been invited as {invitation.roleLabel}. This invitation
              expires on {invitation.expiresLabel}.
            </p>
          </div>
          <JoinButton label={`Join ${invitation.workspaceName}`} />
        </form>
      ))}
    </div>
  );
}
