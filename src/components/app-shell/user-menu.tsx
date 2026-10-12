"use client";

import { ArrowLeftRight, LogOut, UserRound } from "lucide-react";
import Link from "next/link";

import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AuthenticatedUser } from "@/server/auth/require-user";
import type { WorkspaceRole } from "@/server/db/identity";

/** Presentation only. The membership row decides access, every request. */
const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner_admin: "Owner / Admin",
  manager: "Manager",
  staff_sales: "Staff",
};

/**
 * Account menu for the signed-in user.
 *
 * The user object is resolved on the server by the `(app)` layout and passed
 * down as a plain prop. Nothing here reads identity from the browser, and
 * nothing it displays is used for an authorization decision — the display name
 * is presentation only.
 *
 * Sign-out is a real server-side action posted from a form, not a client-side
 * state change: it clears the Supabase session and expires the auth cookies,
 * after which protected routes stop resolving a user.
 */
export function UserMenu({
  user,
  workspaceName,
  role,
  className,
}: {
  user: AuthenticatedUser;
  /**
   * Current workspace, when the surface has one. Optional because this menu
   * also mounts inside the navigation drawer, which is given a user and
   * nothing else. Display only.
   */
  workspaceName?: string | null;
  /** Presentation only — never an authorization decision. */
  role?: WorkspaceRole;
  className?: string;
}) {
  const label = user.fullName ?? user.email ?? "Account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Account — ${label}`}
          data-testid="user-menu"
          className={className}
        >
          <UserRound className="size-[18px]" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-foreground">
            {user.fullName ?? "Signed in"}
          </span>
          {user.email ? (
            <span className="block truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          ) : null}
        </DropdownMenuLabel>

        {workspaceName ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="font-normal">
              <span className="block text-[11px] tracking-wide text-muted-foreground uppercase">
                Workspace
              </span>
              <span className="mt-0.5 block truncate text-sm font-medium text-foreground">
                {workspaceName}
              </span>
              {role ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {ROLE_LABEL[role]}
                </span>
              ) : null}
            </DropdownMenuLabel>
          </>
        ) : null}

        <DropdownMenuSeparator />

        <div className="p-1">
          {/*
            A deliberate way back to the chooser, rather than only landing
            there when a preference goes stale. The destination consults no
            saved preference, so it always offers the list — including for
            someone who currently has one workspace.
          */}
          <Link
            href="/select-workspace?change=1"
            data-testid="switch-workspace"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeftRight className="size-4" aria-hidden="true" />
            Switch workspace
          </Link>

          <form action={signOutAction}>
            <button
              type="submit"
              data-testid="sign-out"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
