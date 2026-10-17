"use client";

import { ChevronDown, ChevronUp, Info, TriangleAlert } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addLeadSourceAction,
  addLeadStageAction,
  moveLeadStageAction,
  renameLeadSourceAction,
  renameLeadStageAction,
  setLeadSourceActiveAction,
  setLeadStageActiveAction,
  type LeadPipelineState,
} from "@/app/actions/lead-pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  MAX_SOURCE_NAME,
  MAX_STAGE_NAME,
  type LeadStageKind,
} from "@/lib/validation/lead-pipeline";

/**
 * Settings → Lead Pipeline and Lead Sources (§34, §164, §165).
 *
 * **Won and Lost can be renamed; what they MEAN is fixed.** §34 requires a
 * workspace to retain a Won outcome and a Lost outcome, fixes Won as the final
 * pipeline column and treats Lost as a closed outcome rather than a column —
 * none of which is a rule about the label. A workspace may call them whatever
 * suits it, so both rows carry the ordinary rename control. What they do not
 * carry is move or switch-off, because those would be refused: a stage's kind
 * is immutable, Won stays last, and neither outcome can be deactivated.
 *
 * Every control posts to a Server Action that re-resolves the membership,
 * re-checks Owner/Admin and re-checks that the Leads module is on. Showing a
 * control is presentation, never the gate.
 */

export type StageRow = {
  readonly id: string;
  readonly name: string;
  readonly kind: LeadStageKind;
  readonly isActive: boolean;
};

export type SourceRow = {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
};

const INITIAL: LeadPipelineState = { status: "idle", attempt: 0 };

function SubmitButton({
  children,
  busy,
  variant = "outline",
  label,
}: {
  children: React.ReactNode;
  busy: string;
  variant?: "outline" | "default" | "destructive";
  label?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      disabled={pending}
      aria-busy={pending}
      aria-label={label}
    >
      {pending ? busy : children}
    </Button>
  );
}

/** The one message each refusal gets, in plain words. */
function Problem({ state }: { state: LeadPipelineState }) {
  const message =
    state.status === "name_taken"
      ? "Something active already has that name. Choose another."
      : state.status === "invalid"
        ? state.issue === "name_too_long"
          ? "That name is too long."
          : state.issue === "name_has_control_characters"
            ? "Remove the special characters from that name."
            : "Enter a name."
        : state.status === "cannot_move"
          ? "That stage is already at the end of the pipeline."
          : state.status === "refused"
            ? "That change would leave the pipeline with no stage to put a new lead in."
            : state.status === "forbidden"
              ? "You do not have permission to change these settings."
              : state.status === "module_disabled"
                ? "Leads are switched off for this workspace."
                : state.status === "stale"
                  ? "This page is out of date. Reload it and try again."
                  : state.status === "unavailable"
                    ? "That did not work. Nothing was changed — please try again."
                    : null;
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2.5 text-sm text-danger-on-subtle"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{message}</span>
    </div>
  );
}

const OUTCOME_NOTE: Record<Exclude<LeadStageKind, "active">, string> = {
  won: "Always the last stage",
  lost: "An outcome, not a pipeline stage",
};

export function LeadPipelineSettings({
  stages,
  sources,
  workspaceId,
}: {
  stages: readonly StageRow[];
  sources: readonly SourceRow[];
  workspaceId: string;
}) {
  const [addStage, addStageAction] = useActionState(
    addLeadStageAction,
    INITIAL,
  );
  const [renameStage, renameStageAction] = useActionState(
    renameLeadStageAction,
    INITIAL,
  );
  const [moveStage, moveStageAction] = useActionState(
    moveLeadStageAction,
    INITIAL,
  );
  const [switchStage, switchStageAction] = useActionState(
    setLeadStageActiveAction,
    INITIAL,
  );
  const [addSource, addSourceAction] = useActionState(
    addLeadSourceAction,
    INITIAL,
  );
  const [renameSource, renameSourceAction] = useActionState(
    renameLeadSourceAction,
    INITIAL,
  );
  const [switchSource, switchSourceAction] = useActionState(
    setLeadSourceActiveAction,
    INITIAL,
  );

  const ordinary = stages.filter((stage) => stage.kind === "active");
  const hidden = (
    <input type="hidden" name="renderedWorkspaceId" value={workspaceId} />
  );

  return (
    <div className="grid gap-8">
      <section aria-labelledby="pipeline-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h3 id="pipeline-heading" className="text-base font-semibold">
            Lead Pipeline
          </h3>
          <p className="text-sm text-muted-foreground">
            The stages a lead moves through. New leads start at the first stage.
          </p>
        </div>

        <ul className="grid gap-2">
          {stages.map((stage) => {
            const isOutcome = stage.kind !== "active";
            const first = ordinary[0]?.id === stage.id;
            const last = ordinary[ordinary.length - 1]?.id === stage.id;

            return (
              <li
                key={stage.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border p-3"
              >
                <form
                  action={renameStageAction}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  {hidden}
                  <input type="hidden" name="stageId" value={stage.id} />
                  <Input
                    name="name"
                    defaultValue={stage.name}
                    maxLength={MAX_STAGE_NAME}
                    aria-label={`Name of the ${stage.name} stage`}
                    className="h-9 max-w-56"
                  />
                  <SubmitButton busy="Saving…">Rename</SubmitButton>
                </form>

                {isOutcome ? (
                  <span className="text-xs text-muted-foreground">
                    {OUTCOME_NOTE[stage.kind]}
                  </span>
                ) : (
                  <div className="flex shrink-0 items-center gap-2">
                    {!stage.isActive ? (
                      <span className="text-xs text-muted-foreground">
                        Switched off
                      </span>
                    ) : null}
                    <form action={moveStageAction}>
                      {hidden}
                      <input type="hidden" name="stageId" value={stage.id} />
                      <input type="hidden" name="direction" value="up" />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={first}
                        aria-label={`Move ${stage.name} earlier`}
                      >
                        <ChevronUp className="size-4" aria-hidden="true" />
                      </Button>
                    </form>
                    <form action={moveStageAction}>
                      {hidden}
                      <input type="hidden" name="stageId" value={stage.id} />
                      <input type="hidden" name="direction" value="down" />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        disabled={last}
                        aria-label={`Move ${stage.name} later`}
                      >
                        <ChevronDown className="size-4" aria-hidden="true" />
                      </Button>
                    </form>
                    <form action={switchStageAction}>
                      {hidden}
                      <input type="hidden" name="stageId" value={stage.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={stage.isActive ? "false" : "true"}
                      />
                      <SubmitButton
                        busy="Working…"
                        variant={stage.isActive ? "destructive" : "outline"}
                      >
                        {stage.isActive ? "Switch off" : "Switch on"}
                      </SubmitButton>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            You can rename Won and Lost. That changes the label only — Won stays
            the final stage, Lost stays outside the pipeline, and neither can be
            switched off.
          </span>
        </p>

        <Problem state={renameStage} />
        <Problem state={moveStage} />
        <Problem state={switchStage} />

        <form action={addStageAction} className="grid gap-2">
          {hidden}
          <Label htmlFor="new-stage">Add a stage</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="new-stage"
              name="name"
              maxLength={MAX_STAGE_NAME}
              required
              className="h-9 max-w-56"
            />
            <SubmitButton busy="Adding…" variant="default">
              Add stage
            </SubmitButton>
          </div>
          <p className="text-xs text-muted-foreground">
            New stages are added just before Won.
          </p>
          <Problem state={addStage} />
        </form>
      </section>

      <Separator />

      <section aria-labelledby="sources-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h3 id="sources-heading" className="text-base font-semibold">
            Lead Sources
          </h3>
          <p className="text-sm text-muted-foreground">
            Where your leads come from. Switching one off keeps it on existing
            leads but stops it being chosen again.
          </p>
        </div>

        {sources.length === 0 ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>No sources yet.</span>
          </p>
        ) : (
          <ul className="grid gap-2">
            {sources.map((source) => (
              <li
                key={source.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border p-3"
              >
                <form
                  action={renameSourceAction}
                  className="flex min-w-0 flex-1 items-center gap-2"
                >
                  {hidden}
                  <input type="hidden" name="sourceId" value={source.id} />
                  <Input
                    name="name"
                    defaultValue={source.name}
                    maxLength={MAX_SOURCE_NAME}
                    aria-label={`Name of the ${source.name} source`}
                    className="h-9 max-w-56"
                  />
                  <SubmitButton busy="Saving…">Rename</SubmitButton>
                </form>

                <div className="flex shrink-0 items-center gap-2">
                  {!source.isActive ? (
                    <span className="text-xs text-muted-foreground">
                      Switched off
                    </span>
                  ) : null}
                  <form action={switchSourceAction}>
                    {hidden}
                    <input type="hidden" name="sourceId" value={source.id} />
                    <input
                      type="hidden"
                      name="isActive"
                      value={source.isActive ? "false" : "true"}
                    />
                    <SubmitButton
                      busy="Working…"
                      variant={source.isActive ? "destructive" : "outline"}
                    >
                      {source.isActive ? "Switch off" : "Switch on"}
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Problem state={renameSource} />
        <Problem state={switchSource} />

        <form action={addSourceAction} className="grid gap-2">
          {hidden}
          <Label htmlFor="new-source">Add a source</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="new-source"
              name="name"
              maxLength={MAX_SOURCE_NAME}
              required
              className="h-9 max-w-56"
            />
            <SubmitButton busy="Adding…" variant="default">
              Add source
            </SubmitButton>
          </div>
          <Problem state={addSource} />
        </form>
      </section>
    </div>
  );
}
