"use client";

import { TriangleAlert, UserRound } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addTeamMemberAction,
  createSalesTeamAction,
  designateTeamLeadAction,
  removeTeamMemberAction,
  renameSalesTeamAction,
  setSalesTeamActiveAction,
  type SalesTeamState,
} from "@/app/actions/sales-teams";
import { StatusBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

/**
 * Settings → Sales Teams (§163.1–§163.4, §163.12).
 *
 * **A team is created with its first Team Lead, in one step.** §163.1 says
 * every active team has exactly one active Team Lead and §163.3 says the lead
 * must be a member of that team, so the three facts are supplied together and
 * the server writes them in one transaction. There is no draft state to
 * remember and no moment where a team exists without a lead.
 *
 * **A transfer is always named and always confirmed.** §163.2 allows one
 * active membership per person, so adding someone who already belongs to a
 * team moves them. The picker shows where each person is now, and the server
 * refuses until this screen has sent back both the confirmation and the exact
 * membership it was shown — so a confirmation given about one team can never
 * take effect against another.
 *
 * **Source-team problems are not solved from here.** §163.4 refuses to move
 * someone who leads another active team until a replacement is designated
 * there or that team is deactivated. This screen says so and stops; it offers
 * no controls over the other team, because fixing one team's leadership from
 * inside another team's form is how an administrator changes something they
 * did not mean to.
 */

export type TeamRow = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: "active" | "inactive";
  readonly teamLeadUserProfileId: string | null;
  readonly activeMemberCount: number;
  readonly members: readonly {
    readonly userProfileId: string;
    readonly isTeamLead: boolean;
  }[];
};

export type CandidateRow = {
  readonly userProfileId: string;
  readonly currentTeamId: string | null;
  readonly currentTeamName: string | null;
  readonly currentMembershipId: string | null;
  readonly leadsActiveTeam: boolean;
};

const EMPTY: SalesTeamState = { status: "idle", attempt: 0 };

/** One sentence per outcome. The server's word, not a guess at the cause. */
function message(state: SalesTeamState): string | null {
  switch (state.status) {
    case "idle":
    case "ok":
      return null;
    case "invalid":
      return "Check the name: it is required, and at most 60 characters.";
    case "name_taken":
      return "Another team in this workspace already has that name.";
    case "conflict":
      return "Somebody else changed this at the same moment. Nothing was saved — try again.";
    case "transfer_not_confirmed":
      return "That person already belongs to a team. Confirm the move to go ahead.";
    case "source_changed":
      return "Their team changed while you were deciding. Nothing was moved — check where they are now and try again.";
    case "leads_source_team":
      return "They lead another active team. Designate a replacement there, or deactivate that team, before moving them.";
    case "is_team_lead":
      return "They lead this team. Designate a replacement first.";
    case "team_lead_required":
      return "Add a member and designate a Team Lead before activating this team.";
    case "inactive_members":
      return "A member of this team is no longer an active user. Remove them before activating it.";
    case "not_a_member":
      return "They are not an active member of this team.";
    case "already_in_this_team":
      return "They are already in this team.";
    case "already_team_lead":
      return "They already lead this team.";
    case "unknown_team":
      return "That team no longer exists.";
    case "unknown_member":
    case "member_not_active":
      return "That person is not an active user of this workspace.";
    case "forbidden":
      return "You do not have permission to manage Sales Teams.";
    case "stale":
      return "This page was for a different workspace. Reload and try again.";
    case "unavailable":
      return "That could not be saved. Nothing was changed.";
  }
}

function Notice({ state }: { state: SalesTeamState }) {
  const text = message(state);
  if (text === null) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning-on-subtle"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
}

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {children}
    </Button>
  );
}

export function SalesTeamSettings({
  teams,
  candidates,
  names,
  workspaceId,
}: {
  teams: readonly TeamRow[];
  candidates: readonly CandidateRow[];
  /** Profile id to display name — §162.1 decides which names exist at all. */
  names: Readonly<Record<string, string>>;
  workspaceId: string;
}) {
  const [created, create] = useActionState(createSalesTeamAction, EMPTY);
  const [renamed, rename] = useActionState(renameSalesTeamAction, EMPTY);
  const [added, add] = useActionState(addTeamMemberAction, EMPTY);
  const [removed, remove] = useActionState(removeTeamMemberAction, EMPTY);
  const [designated, designate] = useActionState(
    designateTeamLeadAction,
    EMPTY,
  );
  const [switched, switchTeam] = useActionState(
    setSalesTeamActiveAction,
    EMPTY,
  );

  const nameOf = (id: string | null) =>
    id === null ? "Nobody" : (names[id] ?? "A team member");

  const workspaceField = (
    <input type="hidden" name="renderedWorkspaceId" value={workspaceId} />
  );

  /*
   * The confirmation a transfer needs, as two hidden fields. The membership
   * id is what the server compares with what it finds under lock: the screen
   * is asserting "this is the membership I showed, and the administrator
   * agreed to end THAT one".
   */
  const transferFields = (person: CandidateRow | undefined) =>
    person?.currentMembershipId ? (
      <>
        <input type="hidden" name="confirmTransfer" value="true" />
        <input
          type="hidden"
          name="expectedSourceMembershipId"
          value={person.currentMembershipId}
        />
      </>
    ) : null;

  const where = (person: CandidateRow) =>
    person.currentTeamName === null
      ? "no team"
      : person.leadsActiveTeam
        ? `leads ${person.currentTeamName}`
        : person.currentTeamName;

  return (
    <div className="grid gap-6">
      <Notice state={created} />
      <Notice state={renamed} />
      <Notice state={added} />
      <Notice state={removed} />
      <Notice state={designated} />
      <Notice state={switched} />

      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Sales Teams yet. Create one below.
        </p>
      ) : (
        <ul className="grid gap-4">
          {teams.map((team) => {
            const memberIds = new Set(
              team.members.map((member) => member.userProfileId),
            );
            const joinable = candidates.filter(
              (person) => !memberIds.has(person.userProfileId),
            );

            return (
              <li
                key={team.id}
                className="grid gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium">{team.name}</h4>
                      <StatusBadge
                        tone={team.status === "active" ? "info" : "neutral"}
                        label={team.status === "active" ? "Active" : "Inactive"}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Team Lead: {nameOf(team.teamLeadUserProfileId)} ·{" "}
                      {team.activeMemberCount}{" "}
                      {team.activeMemberCount === 1 ? "member" : "members"}
                    </p>
                    {team.description ? (
                      <p className="text-sm text-muted-foreground">
                        {team.description}
                      </p>
                    ) : null}
                  </div>

                  <form action={switchTeam}>
                    {workspaceField}
                    <input type="hidden" name="salesTeamId" value={team.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={team.status === "active" ? "false" : "true"}
                    />
                    <Submit>
                      {team.status === "active" ? "Deactivate" : "Activate"}
                    </Submit>
                  </form>
                </div>

                <form
                  action={rename}
                  className="flex flex-wrap items-end gap-2"
                >
                  {workspaceField}
                  <input type="hidden" name="salesTeamId" value={team.id} />
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <Label htmlFor={`team-name-${team.id}`}>Team name</Label>
                    <Input
                      id={`team-name-${team.id}`}
                      name="name"
                      defaultValue={team.name}
                      maxLength={60}
                      required
                      className="h-9"
                    />
                  </div>
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <Label htmlFor={`team-description-${team.id}`}>
                      Description
                    </Label>
                    <Input
                      id={`team-description-${team.id}`}
                      name="description"
                      defaultValue={team.description ?? ""}
                      maxLength={500}
                      className="h-9"
                    />
                  </div>
                  <Submit>Save</Submit>
                </form>

                <Separator />

                <div className="grid gap-2">
                  <h5 className="text-sm font-medium">Members</h5>
                  {team.members.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nobody is in this team.
                    </p>
                  ) : (
                    <ul className="grid gap-1.5">
                      {team.members.map((member) => (
                        <li
                          key={member.userProfileId}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span className="flex items-center gap-2">
                            <UserRound
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                            {nameOf(member.userProfileId)}
                            {member.isTeamLead ? (
                              <StatusBadge tone="info" label="Team Lead" />
                            ) : null}
                          </span>

                          <span className="flex items-center gap-2">
                            {member.isTeamLead ? null : (
                              <form action={designate}>
                                {workspaceField}
                                <input
                                  type="hidden"
                                  name="salesTeamId"
                                  value={team.id}
                                />
                                <input
                                  type="hidden"
                                  name="userProfileId"
                                  value={member.userProfileId}
                                />
                                <Submit>Make Team Lead</Submit>
                              </form>
                            )}
                            <form action={remove}>
                              {workspaceField}
                              <input
                                type="hidden"
                                name="salesTeamId"
                                value={team.id}
                              />
                              <input
                                type="hidden"
                                name="userProfileId"
                                value={member.userProfileId}
                              />
                              <Submit>Remove</Submit>
                            </form>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {joinable.length > 0 ? (
                    <form
                      action={add}
                      className="flex flex-wrap items-end gap-2 pt-1"
                    >
                      {workspaceField}
                      <input type="hidden" name="salesTeamId" value={team.id} />
                      <div className="grid min-w-0 flex-1 gap-1.5">
                        <Label htmlFor={`team-add-${team.id}`}>
                          Add someone
                        </Label>
                        {/*
                          Everyone active is listed, with where they are now,
                          because §163.2 allows adding a person who is already
                          in a team as an explicit transfer. Hiding them would
                          make a legitimate move look impossible.
                        */}
                        <select
                          id={`team-add-${team.id}`}
                          name="userProfileId"
                          className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
                          defaultValue=""
                          required
                        >
                          <option value="" disabled>
                            Choose a person
                          </option>
                          {joinable.map((person) => (
                            <option
                              key={person.userProfileId}
                              value={person.userProfileId}
                            >
                              {nameOf(person.userProfileId)} — {where(person)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Submit>Add</Submit>
                    </form>
                  ) : null}

                  {/*
                    The confirmation step. It appears only after the server has
                    refused an unconfirmed move, and it names the team the
                    person is leaving — §163.4's transfer is explicit or it
                    does not happen.
                  */}
                  {added.status === "transfer_not_confirmed" &&
                  added.targetId === team.id &&
                  added.pendingTransfer
                    ? (() => {
                        const person = candidates.find(
                          (row) =>
                            row.userProfileId ===
                            added.pendingTransfer!.userProfileId,
                        );
                        if (!person?.currentMembershipId) return null;
                        return (
                          <form
                            action={add}
                            className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3"
                          >
                            {workspaceField}
                            <input
                              type="hidden"
                              name="salesTeamId"
                              value={team.id}
                            />
                            <input
                              type="hidden"
                              name="userProfileId"
                              value={person.userProfileId}
                            />
                            {transferFields(person)}
                            <p className="text-sm">
                              {nameOf(person.userProfileId)} is in{" "}
                              <strong className="font-medium">
                                {person.currentTeamName}
                              </strong>
                              . Moving them to {team.name} ends that membership
                              and starts a new one here. Their leads and
                              customers stay with them.
                            </p>
                            <div>
                              <Submit>Move them to {team.name}</Submit>
                            </div>
                          </form>
                        );
                      })()
                    : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Separator />

      <form action={create} className="grid gap-2">
        {workspaceField}
        <h4 className="text-sm font-medium">Create a team</h4>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="new-team-name">Team name</Label>
            <Input
              id="new-team-name"
              name="name"
              maxLength={60}
              required
              className="h-9"
            />
          </div>
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="new-team-description">Description</Label>
            <Input
              id="new-team-description"
              name="description"
              maxLength={500}
              className="h-9"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label htmlFor="new-team-lead">Team Lead</Label>
            <select
              id="new-team-lead"
              name="teamLeadUserProfileId"
              className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
              defaultValue=""
              required
            >
              <option value="" disabled>
                Choose a person
              </option>
              {candidates.map((person) => (
                <option key={person.userProfileId} value={person.userProfileId}>
                  {nameOf(person.userProfileId)} — {where(person)}
                </option>
              ))}
            </select>
          </div>
          <Submit>Create team</Submit>
        </div>
        <p className="text-sm text-muted-foreground">
          Every team has one Team Lead, chosen here. If they already belong to
          another team, you will be asked to confirm moving them.
        </p>
      </form>

      {/* The same confirmation, for creation. */}
      {created.status === "transfer_not_confirmed" && created.pendingTransfer
        ? (() => {
            const person = candidates.find(
              (row) =>
                row.userProfileId === created.pendingTransfer!.userProfileId,
            );
            if (!person?.currentMembershipId) return null;
            return (
              <form
                action={create}
                className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3"
              >
                {workspaceField}
                <input
                  type="hidden"
                  name="teamLeadUserProfileId"
                  value={person.userProfileId}
                />
                {transferFields(person)}
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <Label htmlFor="confirm-team-name">Team name</Label>
                    {/* Restated, not re-asked: the administrator already
                        typed this, and a confirmation that loses the thing
                        being confirmed is a confirmation of something else. */}
                    <Input
                      id="confirm-team-name"
                      name="name"
                      defaultValue={created.pendingTransfer?.name ?? ""}
                      maxLength={60}
                      required
                      className="h-9"
                    />
                  </div>
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <Label htmlFor="confirm-team-description">
                      Description
                    </Label>
                    <Input
                      id="confirm-team-description"
                      name="description"
                      defaultValue={created.pendingTransfer?.description ?? ""}
                      maxLength={500}
                      className="h-9"
                    />
                  </div>
                </div>
                <p className="text-sm">
                  {nameOf(person.userProfileId)} is in{" "}
                  <strong className="font-medium">
                    {person.currentTeamName}
                  </strong>
                  . Creating this team with them as Team Lead ends that
                  membership and starts a new one here.
                </p>
                <div>
                  <Submit>Create the team and move them</Submit>
                </div>
              </form>
            );
          })()
        : null}
    </div>
  );
}
