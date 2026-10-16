"use client";

import { Check, Copy, Info, TriangleAlert } from "lucide-react";
import { useActionState, useRef, useState } from "react";
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
 * Settings → Users → Invitations — spec §159 "Add User".
 *
 * **Nothing is emailed.** The CRM has no mail provider connected and §180.1's
 * D12 leaves the choice open, so an invitation produces a link that the
 * Owner/Admin copies and sends however they already talk to the person. The
 * screen says so rather than implying a message is on its way.
 *
 * **A link is shown once.** It is returned by the action that minted it and
 * never read back: only a hash is stored, so after this render nobody —
 * including an Owner/Admin — can recover it. Regenerating issues a new one
 * and the previous link stops working.
 *
 * Every control here posts to a Server Action that re-resolves the
 * membership and re-checks Owner/Admin on the server, and the table's
 * policies re-derive the same thing from stored rows. Showing or hiding a
 * button is presentation, never the gate.
 */

export type InvitationRow = {
  readonly id: string;
  readonly email: string;
  readonly role: WorkspaceRole;
  readonly invitedName: string | null;
  /**
   * Already written out, by the server, in the workspace's time zone.
   *
   * Deliberately not an ISO string to format here: this component is
   * server-rendered before it is hydrated, and a date formatted in the
   * environment's own locale differs between the two — which React resolves
   * by discarding the tree, taking the one-time link with it.
   */
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
 * The one moment the link exists outside the recipient's browser.
 *
 * The value is in a readonly input as well as behind the button, because
 * `navigator.clipboard` needs a secure context and permission and can simply
 * refuse — and a copy button that silently does nothing would lose a link
 * that cannot be recovered. Selecting the text is the fallback, and the
 * failure is said out loud.
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
    <div
      role="status"
      className="grid gap-2 rounded-lg border border-success/30 bg-success-subtle p-3"
    >
      <p className="text-sm font-medium text-success-on-subtle">{label}</p>
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
      <p className="text-xs text-success-on-subtle">
        {copied === "failed"
          ? "Copying was blocked by the browser — the link is selected, copy it manually."
          : "Send this to the person yourself. It is shown only now and cannot be shown again; it expires in seven days."}
      </p>
    </div>
  );
}

/** The one message each refusal gets. */
function Problem({ state }: { state: InvitationActionState }) {
  const message =
    state.status === "already_invited"
      ? "There is already a pending invitation for that address. Regenerate its link below instead."
      : state.status === "already_member"
        ? "That person is already an active member of this workspace."
        : state.status === "eligibility_unknown"
          ? "This workspace's member addresses could not be read just now, so there is no way to tell whether that person already has access. Nothing was created. Check that SUPABASE_SECRET_KEY is configured, then try again."
          : state.status === "forbidden"
            ? "You do not have permission to manage users in this workspace."
            : state.status === "stale"
              ? "This page was loaded for a different workspace. Reload it and try again."
              : state.status === "unavailable"
                ? "That could not be completed just now. Nothing was changed."
                : state.status === "invalid" && !state.fieldErrors
                  ? "That invitation could not be identified. Reload the page and try again."
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

function PendingInvitation({
  invitation,
  workspaceId,
}: {
  invitation: InvitationRow;
  workspaceId: string;
}) {
  // Two actions, so two states: `useActionState` binds one action each.
  const [regenerated, regenerate] = useActionState(
    regenerateInvitationAction,
    INITIAL,
  );
  const [revoked, revoke] = useActionState(revokeInvitationAction, INITIAL);

  return (
    <li className="grid gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-0.5">
          <p className="truncate text-sm font-medium">{invitation.email}</p>
          <p className="text-xs text-muted-foreground">
            {ROLE_LABELS[invitation.role]}
            {invitation.invitedName ? ` · ${invitation.invitedName}` : ""}
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
            <input type="hidden" name="invitationId" value={invitation.id} />
            <SubmitButton busy="Working…">Regenerate link</SubmitButton>
          </form>
          <form action={revoke}>
            <input
              type="hidden"
              name="renderedWorkspaceId"
              value={workspaceId}
            />
            <input type="hidden" name="invitationId" value={invitation.id} />
            <SubmitButton busy="Working…" variant="destructive">
              Revoke
            </SubmitButton>
          </form>
        </div>
      </div>

      {invitation.isExpired ? (
        <p className="text-xs text-muted-foreground">
          This link no longer works. Regenerating it issues a new one and
          restarts the seven days.
        </p>
      ) : null}

      {regenerated.status === "regenerated" && regenerated.link ? (
        <LinkToCopy
          link={regenerated.link}
          label="New link — the previous one has stopped working"
        />
      ) : null}
      <Problem state={regenerated} />
      <Problem state={revoked} />
    </li>
  );
}

export function InvitationSettings({
  invitations,
  workspaceId,
}: {
  invitations: readonly InvitationRow[];
  workspaceId: string;
}) {
  const [created, create] = useActionState(createInvitationAction, INITIAL);
  const errors = created.fieldErrors;

  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          Invitations are links you copy and send yourself — the CRM does not
          email them. Anyone with the link still has to sign in with the address
          you invited before they can join.
        </span>
      </div>

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
          <Label htmlFor="invite-name">Name (optional)</Label>
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
              Only used to label the invitation until they join. It never
              replaces a name they have already set.
            </p>
          )}
        </div>

        <div className="flex">
          <SubmitButton busy="Creating…" variant="default">
            Create invitation
          </SubmitButton>
        </div>

        {created.status === "created" && created.link ? (
          <LinkToCopy link={created.link} label="Invitation created" />
        ) : null}
        <Problem state={created} />
      </form>

      <Separator />

      <div className="grid gap-2">
        <h3 className="text-sm font-medium">Pending invitations</h3>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No invitations are waiting to be accepted.
          </p>
        ) : (
          <ul className="grid gap-2">
            {invitations.map((invitation) => (
              <PendingInvitation
                key={invitation.id}
                invitation={invitation}
                workspaceId={workspaceId}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
