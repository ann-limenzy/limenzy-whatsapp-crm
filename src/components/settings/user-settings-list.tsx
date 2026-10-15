"use client";

import { Info, TriangleAlert } from "lucide-react";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  setMemberRoleAction,
  setMemberStatusAction,
  type UserActionState,
} from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { WorkspaceRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  ROLE_LABELS,
  STATUS_LABELS,
  type MembershipStatus,
} from "@/lib/validation/users";

/**
 * Settings → Users — spec §159, §160.
 *
 * One form per action per row, each posting to a Server Action that
 * re-resolves the membership and re-checks the Owner/Admin role on the
 * server. This component hiding or showing a control is presentation, never
 * the gate: the same POST from a Manager is refused, and the database routine
 * refuses it again.
 *
 * **Changing your own row asks first.** §159 lets an Owner/Admin demote or
 * deactivate themselves while another active Owner/Admin remains, and the
 * consequence — losing this screen, or losing the workspace — is immediate
 * and not obvious from a button labelled "Deactivate" or "Change". So a
 * self-action that reduces the actor's own access shows what will happen and
 * requires a second, differently-labelled click. The rule itself is enforced
 * in the database, atomically; this is only so nobody does it by accident.
 *
 * It also matters because a successful self-demotion re-renders this screen
 * away — the actor is no longer an Owner/Admin, so the section is gone and
 * there is nowhere left to show a confirmation. Saying so beforehand is the
 * only honest place to say it.
 */

export type MemberRow = {
  readonly userProfileId: string;
  readonly fullName: string;
  readonly role: WorkspaceRole;
  readonly status: MembershipStatus;
  readonly isSelf: boolean;
};

const INITIAL: UserActionState = { status: "idle", attempt: 0 };

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
  variant = "outline",
  label,
}: {
  children: React.ReactNode;
  variant?: "outline" | "default" | "destructive";
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      disabled={pending}
      aria-busy={pending}
      aria-label={label}
    >
      {pending ? "Working…" : children}
    </Button>
  );
}

/** The one message each outcome gets. */
function Outcome({ state }: { state: UserActionState }) {
  if (state.status === "idle") return null;

  if (state.status === "ok") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-success/30 bg-success-subtle px-3 py-2.5 text-sm text-success-on-subtle"
      >
        {state.selfAffected
          ? "Saved. That was your own membership, so your access has been re-checked — if you no longer have permission, the next page you open will say so."
          : "Saved."}
      </div>
    );
  }

  const message =
    state.status === "forbidden"
      ? "Only an Owner/Admin can manage users. Nothing was changed."
      : state.status === "stale"
        ? "You switched workspace in another tab, so this list is out of date. Reload the page before making changes. Nothing was changed."
        : state.status === "last_owner_admin"
          ? "This workspace must keep at least one active Owner/Admin, and this is the last one. Nothing was changed."
          : state.status === "unknown_member"
            ? "That person is no longer a member of this workspace. Reload the page. Nothing was changed."
            : state.status === "blocked_by_responsibilities"
              ? "This person still has active work that must be reassigned first. Nothing was changed."
              : state.status === "invalid"
                ? "That request wasn't valid. Nothing was changed."
                : "That change could not be saved. Nothing was changed.";

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

export function UserSettingsList({
  members,
  workspaceId,
  signedInEmail,
}: {
  members: readonly MemberRow[];
  /**
   * The workspace this list was rendered for, echoed back so each action can
   * detect a page that predates a workspace switch in another tab. It never
   * selects where the change lands.
   */
  workspaceId: string;
  /**
   * The signed-in person's own address, from their verified session.
   *
   * Only their own: see the note rendered below. No database privilege is
   * involved in showing it, because the server already holds it.
   */
  signedInEmail: string | null;
}) {
  const [roleState, roleAction] = useActionState(setMemberRoleAction, INITIAL);
  const [statusState, statusAction] = useActionState(
    setMemberStatusAction,
    INITIAL,
  );

  /** Which self-action is awaiting its second click, if any. */
  const [confirming, setConfirming] = useState<string | null>(null);

  /**
   * The role selects, read at click time rather than mirrored into state.
   *
   * The server re-renders this list after every change, so a copy in state
   * would have to be reconciled with each new set of props. Reading the live
   * DOM value when the button is pressed needs no reconciliation and cannot
   * drift.
   */
  const roleSelects = useRef<Record<string, HTMLSelectElement | null>>({});

  // Whichever answer is newer is the one worth showing.
  const latest =
    roleState.attempt >= statusState.attempt ? roleState : statusState;

  return (
    <div className="grid gap-4">
      <Outcome state={latest} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <caption className="sr-only">
            Everyone with a membership of this workspace, with their role and
            status.
          </caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="px-2 py-2 font-medium">
                User name
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Email
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Sales Team
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Status
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Role
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const deactivating = member.status === "active";
              const statusKey = `status:${member.userProfileId}`;
              const roleKey = `role:${member.userProfileId}`;
              const needsConfirm = member.isSelf && deactivating;
              const awaiting = confirming === statusKey;

              return (
                <tr
                  key={member.userProfileId}
                  className="border-b border-border/60 align-top"
                >
                  <td className="px-2 py-3">
                    <span className="font-medium">{member.fullName}</span>
                    {member.isSelf ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        (you)
                      </span>
                    ) : null}
                  </td>

                  <td className="px-2 py-3">
                    {member.isSelf && signedInEmail ? (
                      signedInEmail
                    ) : (
                      <span className="text-muted-foreground">
                        Not available
                      </span>
                    )}
                  </td>

                  <td className="px-2 py-3 text-muted-foreground">
                    Not available
                  </td>

                  <td className="px-2 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        member.status === "active"
                          ? "bg-success-subtle text-success-on-subtle"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {STATUS_LABELS[member.status]}
                    </span>
                  </td>

                  <td className="px-2 py-3">
                    <form action={roleAction} className="grid gap-2">
                      <input
                        type="hidden"
                        name="renderedWorkspaceId"
                        value={workspaceId}
                      />
                      <input
                        type="hidden"
                        name="userProfileId"
                        value={member.userProfileId}
                      />
                      <div className="flex gap-2">
                        <label
                          className="sr-only"
                          htmlFor={`role-${member.userProfileId}`}
                        >
                          Role for {member.fullName}
                        </label>
                        <select
                          id={`role-${member.userProfileId}`}
                          name="role"
                          defaultValue={member.role}
                          ref={(element) => {
                            roleSelects.current[member.userProfileId] = element;
                          }}
                          className={selectClassName}
                        >
                          {ROLE_ORDER.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>

                        {member.isSelf && confirming !== roleKey ? (
                          /* Stays a plain button until the consequence has
                             been shown; only the confirming state submits. */
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={(clickEvent) => {
                              const chosen =
                                roleSelects.current[member.userProfileId]
                                  ?.value ?? member.role;
                              // Staying an Owner/Admin loses nothing, so it
                              // submits straight away; anything else reduces
                              // the actor's own access and is confirmed first.
                              if (chosen === "owner_admin") {
                                clickEvent.currentTarget
                                  .closest("form")
                                  ?.requestSubmit();
                                return;
                              }
                              setConfirming(roleKey);
                            }}
                          >
                            Change
                          </Button>
                        ) : (
                          <SubmitButton
                            variant={
                              confirming === roleKey ? "destructive" : "outline"
                            }
                            label={`Change the role of ${member.fullName}`}
                          >
                            {confirming === roleKey
                              ? "Yes, change my own role"
                              : "Change"}
                          </SubmitButton>
                        )}

                        {confirming === roleKey ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirming(null)}
                          >
                            Cancel
                          </Button>
                        ) : null}
                      </div>

                      {confirming === roleKey ? (
                        <p className="max-w-[18rem] text-xs text-danger-on-subtle">
                          You are about to change your own role. This section
                          will disappear and you will no longer be able to
                          manage users.
                        </p>
                      ) : null}
                    </form>
                  </td>

                  <td className="px-2 py-3">
                    {needsConfirm && !awaiting ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirming(statusKey)}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <form action={statusAction} className="grid gap-2">
                        <input
                          type="hidden"
                          name="renderedWorkspaceId"
                          value={workspaceId}
                        />
                        <input
                          type="hidden"
                          name="userProfileId"
                          value={member.userProfileId}
                        />
                        <input
                          type="hidden"
                          name="status"
                          value={deactivating ? "inactive" : "active"}
                        />
                        {awaiting ? (
                          <p className="max-w-[18rem] text-xs text-danger-on-subtle">
                            You are about to deactivate your own membership. You
                            will lose access to this workspace immediately.
                          </p>
                        ) : null}
                        <div className="flex gap-2">
                          <SubmitButton
                            variant={awaiting ? "destructive" : "outline"}
                            label={
                              deactivating
                                ? `Deactivate ${member.fullName}`
                                : `Reactivate ${member.fullName}`
                            }
                          >
                            {awaiting
                              ? "Yes, remove my own access"
                              : deactivating
                                ? "Deactivate"
                                : "Reactivate"}
                          </SubmitButton>
                          {awaiting ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirming(null)}
                            >
                              Cancel
                            </Button>
                          ) : null}
                        </div>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Separator />

      <div className="grid gap-2 text-xs text-muted-foreground">
        <p className="flex items-start gap-1.5">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-medium">
              Sales Team is not built yet.
            </strong>{" "}
            §159 lists it here, and Sales Teams arrive in a later milestone. The
            column shows &ldquo;Not available&rdquo; rather than a blank, which
            would read as &ldquo;no team&rdquo;.
          </span>
        </p>
        <p className="flex items-start gap-1.5">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-medium">
              Email is shown only for your own account.
            </strong>{" "}
            Addresses are held by the authentication service, which the CRM
            cannot read for other people without a much wider database privilege
            than this screen justifies. It is recorded as a decision to make
            rather than worked around.
          </span>
        </p>
        <p className="flex items-start gap-1.5">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-medium">Adding people comes next.</strong>{" "}
            Invitations are a separate slice. Deactivating someone affects this
            workspace only — not their account, and not any other workspace they
            belong to — and nothing is deleted, so past activity keeps their
            name.
          </span>
        </p>
      </div>
    </div>
  );
}
