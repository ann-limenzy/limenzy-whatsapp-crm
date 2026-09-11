"use client";

import { UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * User menu — presentation only.
 *
 * There is no authentication in this milestone, so this deliberately shows NO
 * user name, avatar, email or workspace. Inventing one would be a pretend
 * signed-in state. It reserves the top-bar slot and states what is missing.
 *
 * Real identity arrives in Milestone 1B (Supabase Auth), and the workspace it
 * belongs to in Milestone 1C/1D.
 */
export function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Account — not signed in"
          data-testid="user-menu"
        >
          <UserRound className="size-[18px]" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Not signed in</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Authentication is not configured yet. Sign-in, sign-up and email
            verification arrive in Milestone 1B; workspace membership follows in
            Milestone 1C.
          </p>
          <p className="mt-2 font-mono text-xs text-muted-foreground/80">
            Spec §7 · §11 · §159
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
