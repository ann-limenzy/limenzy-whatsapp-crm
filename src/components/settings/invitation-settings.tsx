"use client";

import { Check, CircleCheck, Copy, Info, TriangleAlert } from "lucide-react";
import { useRef, useState, useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createInvitationAction,
  regenerateInvitationAction,
  revokeInvitationAction,
  type InvitationActionState,
} from "@/app/actions/invitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { WorkspaceRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { MAX_EMAIL, MAX_INVITED_NAME } from "@/lib/validation/invitations";
import { ROLE_LABELS } from "@/lib/validation/users";

/**
 * Invitations, in Settings → Users.
 *
 * ## One link on screen at a time
 *
 * A link is shown once and cannot be shown again, so the screen must never
 * leave an old one lying about for somebody to copy by mistake. The three
 * actions therefore share one state each at this level rather than one per
 * row: regenerating an invitation replaces whatever link was showing,
 * cancelling one takes its link away with it, and creating one puts the new
 * link in a single place.
 *
 * ## Cancelling says so, once the server has actually done it
 *
 * The row disappears and the confirmation appears only when the action has
 * RETURNED `revoked` — nothing is hidden on the strength of a click. A
 * failure therefore leaves the row exactly where it was and shows the reason,
 * with no restoring to do, because nothing was taken away in the first place.
 * The revalidated list arrives a moment later and agrees.
 *
 * ## Sending, and what "sent" can honestly mean
 *
 * The buttons send an email when mail is configured, and say so. What comes
 * back is that the mail server ACCEPTED the message — not that it arrived, so
 * the wording says accepted and the copyable link stays on screen underneath
 * as the thing that definitely works. With no mail configured the buttons do
 * not claim to send at all: they say they create a link, which is all they
 * do.
 *
 * Every control posts to a Server Action that re-resolves the membership and
 * re-checks the role on the server, and the database re-derives the same
 * thing from stored rows. Showing or hiding a button is presentation, never
 * the gate.
 */

export type InvitationRow = {
  readonly id: string;
  readonly email: string;
  readonly role: WorkspaceRole;
  readonly invitedName: string | null;
  /** Already written out by the server, in the workspace's time zone. */
  readonly expiresLabel: string;
  readonly isExpired: boolean;
};

const INITIAL: InvitationActionState = { status: "idle", attempt: 0 };

const ROLE_ORDER: readonly WorkspaceRole[] = [
  "owner_admin",
  "manager",
  "staff_sales",
];

const selectClassName = cn(
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs outline-none",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  "dark:bg-input/30",
);

function SubmitButton({
  children,
  busy,
  variant = "outline",
}: {
  children: React.ReactNode;
  busy: string;
  variant?: "outline" | "default" | "destructive";
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? busy : children}
    </Button>
  );
}

/**
 * The one moment a link exists anywhere but the recipient's inbox.
 *
 * The value sits in a readonly box as well as behind the button, because
 * `navigator.clipboard` needs a secure context and permission and can simply
 * refuse — and a copy button that silently does nothing would lose a link
 * that cannot be recovered.
 */
function LinkToCopy({ link, label }: { link: string; label: string }) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const field = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("done");
      window.setTimeout(() => setCopied("idle"), 2500);
    } catch {
      setCopied("failed");
      field.current?.select();
    }
  }

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-background/60 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={field}
          readOnly
          value={link}
          aria-label="Invitation link"
          onFocus={(event) => event.currentTarget.select()}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs"
        />
        <Button type="button" size="sm" onClick={copy}>
          {copied === "done" ? (
            <>
              <Check className="size-4" aria-hidden="true" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-4" aria-hidden="true" /> Copy link
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {copied === "failed"
          ? "Your browser blocked copying. The link is selected — copy it by hand."
          : "Shown only now. It expires in seven days."}
      </p>
    </div>
  );
}

/** The one message each refusal gets, in plain words. */
function Problem({ state }: { state: InvitationActionState }) {
  const message =
    state.status === "already_invited"
      ? "That person already has an invitation waiting. Use Send a new link below instead."
      : state.status === "already_member"
        ? "That person already works in this workspace."
        : state.status === "eligibility_unknown"
          ? "We could not check whether that person is already here, so nothing was created. Please try again in a moment."
          : state.status === "forbidden"
            ? "You do not have permission to invite people to this workspace."
            : state.status === "stale"
              ? "This page is out of date. Reload it and try again."
              : state.status === "unavailable"
                ? "That did not work. Nothing was changed — please try again."
                : state.status === "invalid" && !state.fieldErrors
                  ? "That invitation could not be found. Reload the page and try again."
                  : null;
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-on-subtle"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{message}</span>
    </div>
  );
}

/**
 * What happened to an invitation, and to the message about it.
 *
 * Two separate facts. The invitation always exists by the time this renders;
 * only the email may have gone wrong, and that is recoverable rather than
 * fatal — which is why the link is here in every case.
 */
function Outcome({
  state,
  workspaceId,
  verb,
  retry,
}: {
  state: InvitationActionState;
  workspaceId: string;
  /** "created" or "replaced", for wording that fits what just happened. */
  verb: "created" | "replaced";
  /**
   * The SAME dispatcher the rows use, so another attempt lands in the one
   * regeneration state and replaces whatever link is on screen. A second
   * `useActionState` here would put two live links in front of somebody.
   */
  retry: (formData: FormData) => void;
}) {
  if (!state.link || !state.invitationId) return null;
  const failed = state.delivery === "failed";

  return (
    <div
      role="status"
      className={cn(
        "grid gap-3 rounded-lg border p-3",
        failed
          ? "border-danger/30 bg-danger-subtle"
          : "border-success/30 bg-success-subtle",
      )}
    >
      <p
        className={cn(
          "text-sm font-medium",
          failed ? "text-danger-on-subtle" : "text-success-on-subtle",
        )}
      >
        {failed
          ? "Invitation created, but the email could not be sent"
          : state.delivery === "accepted"
            ? `Invitation emailed to ${state.email}`
            : `Invitation ${verb} for ${state.email}`}
      </p>

      <p
        className={cn(
          "text-xs",
          failed ? "text-danger-on-subtle" : "text-success-on-subtle",
        )}
      >
        {failed
          ? "The invitation is ready and the link below works. Send it yourself, or try sending the email again."
          : state.delivery === "accepted"
            ? "The mail server accepted it. If it does not arrive, send the link below instead."
            : "Email sending is not set up, so send this link to them yourself."}
      </p>

      <LinkToCopy link={state.link} label="Invitation link" />

      {failed ? (
        <>
          <p className="text-xs text-danger-on-subtle">
            {/*
              Only the digest of a token is stored, so the one that failed
              cannot be recovered and re-sent. Another attempt mints a new
              token on the SAME invitation — nobody is invited twice — and the
              previous link stops working the moment its digest is replaced.
            */}
            Trying again sends a brand-new link. The one above stops working.
          </p>
          <form action={retry} className="flex">
            <input
              type="hidden"
              name="renderedWorkspaceId"
              value={workspaceId}
            />
            <input
              type="hidden"
              name="invitationId"
              value={state.invitationId}
            />
            <SubmitButton busy="Sending…">Try sending again</SubmitButton>
          </form>
        </>
      ) : null}
    </div>
  );
}

export function InvitationSettings({
  invitations,
  workspaceId,
  emailEnabled,
}: {
  invitations: readonly InvitationRow[];
  workspaceId: string;
  /** Whether this deployment can send mail at all. Resolved on the server. */
  emailEnabled: boolean;
}) {
  const [created, create] = useActionState(createInvitationAction, INITIAL);
  const [regenerated, regenerate] = useActionState(
    regenerateInvitationAction,
    INITIAL,
  );
  const [cancelled, revoke] = useActionState(revokeInvitationAction, INITIAL);

  const justCancelled =
    cancelled.status === "revoked" ? cancelled.invitationId : undefined;

  /*
   * Hidden only once the action has RETURNED `revoked` — the server has done
   * the work by then. A failure leaves `status` as the refusal, so this stays
   * undefined, the row never left, and `Problem` below says why. There is no
   * optimistic state to restore because none was taken.
   */
  const pending = invitations.filter((row) => row.id !== justCancelled);

  // A link for an invitation that has just been cancelled must not survive
  // on screen, wherever it was being shown.
  const newLink =
    created.status === "created" && created.invitationId !== justCancelled
      ? created.link
      : undefined;
  const replacedFor =
    regenerated.status === "regenerated" &&
    regenerated.invitationId !== justCancelled
      ? regenerated.invitationId
      : undefined;

  const errors = created.fieldErrors;

  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          {emailEnabled
            ? "We email the invitation for you, and you can copy the link as well. They will need to sign in with the address you invite before they can join."
            : "Email sending is not set up yet, so create a link and send it to the person yourself. They will need to sign in with the address you invite before they can join."}
        </span>
      </div>

      {cancelled.status === "revoked" ? (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm"
        >
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            Invitation to <span className="font-medium">{cancelled.email}</span>{" "}
            cancelled. Their link no longer works.
          </span>
        </div>
      ) : null}
      <Problem state={cancelled} />

      <form action={create} className="grid gap-3">
        <input type="hidden" name="renderedWorkspaceId" value={workspaceId} />

        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="grid gap-1.5">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              autoComplete="off"
              maxLength={MAX_EMAIL}
              required
              aria-invalid={errors?.email ? true : undefined}
              aria-describedby={
                errors?.email ? "invite-email-error" : undefined
              }
            />
            {errors?.email ? (
              <p
                id="invite-email-error"
                className="text-xs text-danger-on-subtle"
              >
                {errors.email}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              name="role"
              defaultValue="staff_sales"
              className={selectClassName}
              aria-invalid={errors?.role ? true : undefined}
            >
              {ROLE_ORDER.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            {errors?.role ? (
              <p className="text-xs text-danger-on-subtle">{errors.role}</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="invite-name">Their name (optional)</Label>
          <Input
            id="invite-name"
            name="invitedName"
            autoComplete="off"
            maxLength={MAX_INVITED_NAME}
            aria-invalid={errors?.invitedName ? true : undefined}
          />
          {errors?.invitedName ? (
            <p className="text-xs text-danger-on-subtle">
              {errors.invitedName}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Helps you tell invitations apart. They can change it later.
            </p>
          )}
        </div>

        <div className="flex">
          <SubmitButton
            busy={emailEnabled ? "Sending…" : "Creating…"}
            variant="default"
          >
            {emailEnabled ? "Send invitation" : "Create invitation link"}
          </SubmitButton>
        </div>
      </form>

      {/*
        OUTSIDE the create form, deliberately. The panel carries its own
        "try again" form, and a form nested inside another is invalid HTML —
        the browser silently drops the inner one, so the retry button looked
        present and did nothing.
      */}
      {newLink ? (
        <Outcome
          state={created}
          workspaceId={workspaceId}
          verb="created"
          retry={regenerate}
        />
      ) : null}
      <Problem state={created} />

      <Separator />

      <div className="grid gap-2">
        <h3 className="text-sm font-medium">Waiting to be accepted</h3>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No one has an invitation waiting.
          </p>
        ) : (
          <ul className="grid gap-2">
            {pending.map((invitation) => (
              <li
                key={invitation.id}
                className="grid gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="grid min-w-0 gap-0.5">
                    <p className="truncate text-sm font-medium">
                      {invitation.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[invitation.role]}
                      {invitation.invitedName
                        ? ` · ${invitation.invitedName}`
                        : ""}
                      {" · "}
                      {invitation.isExpired
                        ? `Expired ${invitation.expiresLabel}`
                        : `Expires ${invitation.expiresLabel}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <form action={regenerate}>
                      <input
                        type="hidden"
                        name="renderedWorkspaceId"
                        value={workspaceId}
                      />
                      <input
                        type="hidden"
                        name="invitationId"
                        value={invitation.id}
                      />
                      <SubmitButton
                        busy={emailEnabled ? "Sending…" : "Working…"}
                      >
                        {emailEnabled
                          ? "Send a new invitation"
                          : "Create a new link"}
                      </SubmitButton>
                    </form>
                    <form action={revoke}>
                      <input
                        type="hidden"
                        name="renderedWorkspaceId"
                        value={workspaceId}
                      />
                      <input
                        type="hidden"
                        name="invitationId"
                        value={invitation.id}
                      />
                      <SubmitButton busy="Cancelling…" variant="destructive">
                        Cancel invitation
                      </SubmitButton>
                    </form>
                  </div>
                </div>

                {invitation.isExpired ? (
                  <p className="text-xs text-muted-foreground">
                    This link has expired. Send a new one to give them another
                    seven days.
                  </p>
                ) : null}

                {replacedFor === invitation.id ? (
                  <Outcome
                    state={regenerated}
                    workspaceId={workspaceId}
                    verb="replaced"
                    retry={regenerate}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <Problem state={regenerated} />
      </div>
    </div>
  );
}
