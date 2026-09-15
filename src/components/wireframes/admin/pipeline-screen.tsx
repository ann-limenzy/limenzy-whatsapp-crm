"use client";

import {
  ArrowDown,
  ArrowUp,
  EyeOff,
  GitBranch,
  History,
  Pencil,
  Plus,
  Star,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CrmChrome } from "@/components/wireframes/crm-chrome";
import { Note, Panel, ScreenHeading } from "@/components/wireframes/wf-ui";
import { PIPELINE_STAGES } from "@/lib/wireframes/mock-data";
import { cn } from "@/lib/utils";

/**
 * E3 — Lead pipeline configuration.
 *
 * Reordering is buttons rather than drag-and-drop, deliberately: it works with
 * a keyboard, works on a touch screen, and is obvious to someone who has never
 * dragged a row in a web app.
 *
 * The retired "Cold Call" stage is the point of the screen — 23 old leads
 * still sit in it, and they keep that value.
 */
export function PipelineScreen() {
  const [stages, setStages] = useState([...PIPELINE_STAGES]);

  const move = (index: number, delta: number) => {
    setStages((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
  };

  const active = stages.filter((s) => s.active);
  const retired = stages.filter((s) => !s.active);

  return (
    <CrmChrome active="settings">
      <div className="flex flex-col gap-5">
        <ScreenHeading
          title="Lead pipeline"
          description="The stages a lead moves through at A&S Fincare. Change them to match how the team actually sells."
          actions={
            <Button>
              <Plus className="size-4" aria-hidden="true" />
              Add stage
            </Button>
          }
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
          <Panel title="Active stages" icon={GitBranch} count={active.length}>
            <ul className="divide-y divide-border/70">
              {stages.map((stage, index) =>
                stage.active ? (
                  <li
                    key={stage.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground"
                    >
                      {active.findIndex((s) => s.id === stage.id) + 1}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {stage.name}
                        </span>
                        {stage.isDefault ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">
                            <Star className="size-3" aria-hidden="true" />
                            First stage
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {stage.leads} leads currently here
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-1">
                      <IconButton
                        label={`Move ${stage.name} up`}
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={`Move ${stage.name} down`}
                        onClick={() => move(index, 1)}
                        disabled={index === stages.length - 1}
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton label={`Rename ${stage.name}`}>
                        <Pencil className="size-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton label={`Deactivate ${stage.name}`}>
                        <EyeOff className="size-4" aria-hidden="true" />
                      </IconButton>
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          </Panel>

          <div className="flex flex-col gap-4">
            <Panel title="Retired stages" icon={History} count={retired.length}>
              <ul className="divide-y divide-border/70">
                {retired.map((stage) => (
                  <li key={stage.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-muted-foreground">
                      {stage.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Not offered for new leads · {stage.leads} existing leads
                      keep this stage
                    </p>
                    <Button variant="ghost" size="sm" className="mt-2">
                      Make active again
                    </Button>
                  </li>
                ))}
              </ul>
            </Panel>

            <Note icon={History}>
              <strong className="font-semibold">
                Existing leads keep the stage they already have.
              </strong>{" "}
              Renaming a stage updates its label everywhere; deactivating one
              stops it being offered for new leads but never rewrites the 23
              leads already sitting in it.
            </Note>

            <Panel title="First stage" bodyClassName="p-4 sm:p-5">
              <p className="text-sm text-muted-foreground">
                New leads start at{" "}
                <span className="font-medium text-foreground">New</span> —
                including leads created by import when the file has no stage
                column.
              </p>
              <Button variant="outline" size="sm" className="mt-3">
                Change first stage
              </Button>
            </Panel>
          </div>
        </div>
      </div>
    </CrmChrome>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition-colors",
        disabled ? "opacity-40" : "hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
