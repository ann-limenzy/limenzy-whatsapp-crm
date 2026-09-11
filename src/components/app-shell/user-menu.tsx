"use client";

import { LogOut, UserRound } from "lucide-react";

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
  className,
}: {
  user: AuthenticatedUser;
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

        <DropdownMenuSeparator />

        <div className="p-1">
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
