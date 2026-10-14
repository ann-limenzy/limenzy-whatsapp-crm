"use client";

import { ArrowRight, Building2, TriangleAlert } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { selectWorkspaceAction } from "@/app/(account)/select-workspace/actions";
import {
  SELECTION_INITIAL_STATE,
  type SelectionActionState,
} from "@/app/(account)/select-workspace/selection-state";

/**
 * The workspace chooser.
 *
 * One form per workspace, each posting a single id. A radio group plus one
 * submit was tried in review and rejected: a list of buttons is one tap on a
 * phone, needs no selection state, and keeps each option a real control with
 * its own accessible name.
 *
 * Everything shown here was read on the server from memberships under
 * row-level security, through a context the server minted. Nothing in this
 * component decides access, and the id it posts is re-validated before
 * anything is remembered.
 */

export type WorkspaceOption = {
  readonly workspaceId: string;
  readonly name: string;
  readonly roleLabel: string;
};

export function ChooserForm({
  options,
  next,
}: {
  readonly options: readonly WorkspaceOption[];
  /** Already validated on the server; carried so a choice can return there. */
  readonly next: string;
}) {
  const [state, formAction, pending] = useActionState<
    SelectionActionState,
    FormData
  >(selectWorkspaceAction, SELECTION_INITIAL_STATE);

  const alertRef = useRef<HTMLDivElement>(null);
  const lastAnnounced = useRef(0);

  useEffect(() => {
    // Move focus to the message once per submission, not on every render.
    if (state.status === "idle" || state.attempt === lastAnnounced.current) {
      return;
    }
    lastAnnounced.current = state.attempt;
    alertRef.current?.focus();
  }, [state.status, state.attempt]);

  return (
    <div className="grid gap-4">
      {state.message ? (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning-subtle px-3.5 py-3 text-sm text-warning-on-subtle outline-none"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <p>{state.message}</p>
        </div>
      ) : null}

      <ul className="grid gap-2.5">
        {options.map((option) => (
          <li key={option.workspaceId}>
            <form action={formAction}>
              <input
                type="hidden"
                name="workspaceId"
                value={option.workspaceId}
              />
              <input type="hidden" name="next" value={next} />
              <button
                type="submit"
                disabled={pending}
                className="surface-elevated flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-start transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary"
                >
                  <Building2 className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {option.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {option.roleLabel}
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
