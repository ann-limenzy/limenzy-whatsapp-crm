import { History, Mail, ShieldCheck, UserMinus, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CrmChrome } from "@/components/wireframes/crm-chrome";
import {
  Avatar,
  Note,
  Panel,
  ScreenHeading,
  TableScroll,
} from "@/components/wireframes/wf-ui";
import { SETTINGS_USERS } from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * E2 — Users and roles.
 *
 * The important design decision here is what deactivation does NOT do. Joseph
 * Kurian left the business, but his 38 records and his name on every past
 * activity stay exactly where they are. History is not rewritten when someone
 * leaves.
 */

const STATUS_CLASS = {
  Active: "border-success/30 bg-success-subtle text-success-on-subtle",
  Invited: "border-info/30 bg-info-subtle text-info-on-subtle",
  Deactivated:
    "border-border-strong/40 bg-neutral-subtle text-neutral-on-subtle",
} as const;

const ROLE_CLASS = {
  Owner: "border-primary/30 bg-primary/12 text-primary",
  Admin: "border-primary/30 bg-primary/12 text-primary",
  Manager: "border-info/30 bg-info-subtle text-info-on-subtle",
  Staff: "border-border bg-muted text-muted-foreground",
} as const;

export function UsersScreen() {
  return (
    <CrmChrome active="settings">
      <div className="flex min-w-0 flex-col gap-5">
        <ScreenHeading
          title="Users and roles"
          description="Who is on the team, what they can see, and how much work each person is carrying."
          actions={
            <Button>
              <UserPlus className="size-4" aria-hidden="true" />
              Invite user
            </Button>
          }
        />

        <Panel title="Team" icon={ShieldCheck} count={SETTINGS_USERS.length}>
          <TableScroll>
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    User
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Assigned records
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Last active
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {SETTINGS_USERS.map((user) => {
                  const inactive = user.status === "Deactivated";
                  return (
                    <tr
                      key={user.id}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-3">
                          <Avatar
                            initials={user.name
                              .split(" ")
                              .slice(0, 2)
                              .map((p) => p[0])
                              .join("")}
                            tone={inactive ? "muted" : "primary"}
                          />
                          <span className="min-w-0">
                            <span
                              className={cn(
                                "block truncate font-medium",
                                inactive
                                  ? "text-muted-foreground"
                                  : "text-foreground",
                              )}
                            >
                              {user.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            ROLE_CLASS[user.role],
                          )}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            STATUS_CLASS[user.status],
                          )}
                        >
                          {user.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {user.assignedRecords}
                        {inactive && user.assignedRecords > 0 ? (
                          <span className="ms-1.5 text-xs">(retained)</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {user.lastActive}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {user.status === "Invited" ? (
                            <Button variant="outline" size="sm">
                              <Mail className="size-3.5" aria-hidden="true" />
                              Resend
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm">
                              Edit role
                            </Button>
                          )}
                          {user.status === "Active" && user.role !== "Owner" ? (
                            <Button variant="ghost" size="sm">
                              <UserMinus
                                className="size-3.5"
                                aria-hidden="true"
                              />
                              Deactivate
                            </Button>
                          ) : null}
                          {inactive ? (
                            <Button variant="ghost" size="sm">
                              Reactivate
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Note icon={History}>
            <strong className="font-semibold">
              Deactivating a user never deletes their history.
            </strong>{" "}
            Joseph Kurian&apos;s 38 records keep his name as the original owner,
            and every activity he logged stays in the timeline. Reassign the
            live records to someone else; the past stays as it happened.
          </Note>

          <Panel title="What each role can do" bodyClassName="p-4 sm:p-5">
            <dl className="flex flex-col gap-3 text-sm">
              <RoleRow
                role="Owner / Admin"
                detail="Everything, including settings, users and integrations."
              />
              <RoleRow
                role="Manager"
                detail="Permitted leads and customers, team reports, reassignment."
              />
              <RoleRow
                role="Staff"
                detail="Their own records, follow-ups and conversations. No configuration."
              />
            </dl>
          </Panel>
        </div>
      </div>
    </CrmChrome>
  );
}

function RoleRow({ role, detail }: { role: string; detail: string }) {
  return (
    <div>
      <dt className="font-medium text-foreground">{role}</dt>
      <dd className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
        {detail}
      </dd>
    </div>
  );
}
