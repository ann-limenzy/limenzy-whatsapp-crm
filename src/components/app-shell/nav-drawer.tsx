"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { NavList } from "@/components/app-shell/nav-list";
import { LimenzyLogo } from "@/components/brand/limenzy-logo";
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
            className={cn("lg:hidden", triggerClassName)}
          >
            <Menu className="size-[18px]" aria-hidden="true" />
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetHeader className="h-16 justify-center px-5">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Move between the sections of the CRM.
          </SheetDescription>
          <LimenzyLogo />
        </SheetHeader>
        <div className="overflow-y-auto px-3 pb-6">
          <NavList onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
