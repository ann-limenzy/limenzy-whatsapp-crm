import { Building2 } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/data/empty-state";
import { StatusBadge } from "@/components/data/status-badge";
import { requireUser } from "@/server/auth/require-user";

export const metadata: Metadata = { title: "Workspace setup" };

/**
 * Post-authentication handoff.
 *
 * A verified user lands here when no workspace context can be resolved.
 *
 * It deliberately does NOT create a workspace, and does not pretend one
 * exists. Workspaces, memberships and tenant isolation are Milestone 1C: the
 * schema, the `WorkspaceContext` and the RLS proof all belong there. Building
 * a form here would mean either inventing a workspace id or writing to a table
 * that does not exist.
 *
 * So this screen states plainly what is missing and what delivers it. The
 * authenticated session behind it is entirely real.
 */
export default async function SetupPage() {
  const user = await requireUser("/setup");

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="min-w-0 text-xl font-semibold tracking-tight break-words text-foreground sm:text-2xl">
          Workspace setup
        </h2>
        <StatusBadge tone="neutral" label="Not built · Milestone 1C" />
      </div>

      <EmptyState
        icon={Building2}
        title="Workspace creation isn't built yet"
        description={
          user.email
            ? `You are signed in as ${user.email}. Creating a business workspace — name, type, country, timezone and currency — needs the workspace and membership tables, which arrive in Milestone 1C. No workspace has been created for you yet.`
            : "You are signed in. Creating a business workspace needs the workspace and membership tables, which arrive in Milestone 1C. No workspace has been created for you yet."
        }
        footnote="Specification §7 · Milestone 1C"
      />
    </div>
  );
}
