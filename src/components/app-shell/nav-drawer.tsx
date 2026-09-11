"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { NavList } from "@/components/app-shell/nav-list";
import { UserMenu } from "@/components/app-shell/user-menu";
import { LimenzyLogo } from "@/components/brand/limenzy-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Collapsible navigation for tablet and mobile (spec §25).
 *
 * Radix Dialog underneath, so focus trapping, Escape-to-close, scroll locking
 * and `aria-modal` are handled correctly. Selecting a destination closes the
 * drawer.
 *
 * Rendered by the top bar (hamburger) below `lg`, and by the mobile bottom bar
 * as the "More" entry — both reuse this one component and the one nav config.
 */
export function NavDrawer({
  trigger,
  triggerClassName,
}: {
  trigger?: React.ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation menu"
            data-testid="nav-drawer-trigger"
            className={cn("size-11 sm:size-9 lg:hidden", triggerClassName)}
          >
            <Menu className="size-[18px]" aria-hidden="true" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex w-[min(19rem,86vw)] flex-col p-0"
      >
        <SheetHeader className="h-16 shrink-0 justify-center px-5">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Move between the sections of the CRM.
          </SheetDescription>
          {/* The drawer always shows the complete lockup — it has the room,
              and it is where phones go to find the full brand. */}
          <LimenzyLogo onNavigate={() => setOpen(false)} />
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <NavList onNavigate={() => setOpen(false)} />
        </div>

        {/* Theme and account live here below `sm`, where the phone header has
            no room for them. From `sm` the top bar carries them instead, so
            this row would be a duplicate. */}
        <div className="flex shrink-0 items-center gap-2 border-t border-border/70 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:hidden">
          <ThemeToggle className="size-11" />
          <UserMenu className="size-11" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
