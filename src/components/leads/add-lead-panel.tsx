"use client";

import { useState, type ReactNode } from "react";

import {
  AddLeadForm,
  type SourceOption,
  type StageOption,
} from "@/components/leads/add-lead-form";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * §32: "This may be displayed as a modal, drawer or dedicated screen
 * depending on the final UI design, but the fields and behaviour remain the
 * same."
 *
 * A drawer, so the list stays behind it on a desktop and it becomes a
 * full-height panel on a phone. On success the Server Action redirects to the
 * new Lead's detail screen, which is what §32's Save Lead does.
 */
export function AddLeadPanel({
  stages,
  sources,
  workspaceId,
  ownerName,
  trigger,
}: {
  stages: readonly StageOption[];
  sources: readonly SourceOption[];
  workspaceId: string;
  ownerName: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          className="min-h-11 sm:min-h-8"
          disabled={stages.length === 0}
        >
          {trigger}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle>Add a lead</SheetTitle>
          <SheetDescription>
            Only the name and one way to reach them are required.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {/* On success the action redirects to the new Lead, which unmounts
              this panel — so there is nothing to close here. */}
          <AddLeadForm
            stages={stages}
            sources={sources}
            workspaceId={workspaceId}
            ownerName={ownerName}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
