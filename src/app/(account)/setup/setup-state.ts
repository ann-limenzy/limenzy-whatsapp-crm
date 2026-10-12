import type { WorkspaceSetupField } from "@/lib/validation/workspace-setup";

/**
 * The `/setup` action's state shape and its initial value.
 *
 * Deliberately **not** in `actions.ts`. A file carrying the `"use server"`
 * directive may export only async Server Actions — Next.js rejects the module
 * at build/dispatch time with "a 'use server' file can only export async
 * functions, found object" — so the initial state object cannot live there,
 * even though it is only data. Types alone would be erased and safe, but they
 * belong beside the value they describe.
 *
 * Nothing here is server-only: the client form imports the same constant to
 * seed `useActionState`.
 */

/** Fields the form renders an inline message beside. */
export type SetupFieldName = Exclude<WorkspaceSetupField, "form">;

export type SetupActionState = {
  /**
   * `idle` before the first submission; `invalid` and `error` are retryable;
   * `created`, `already_onboarded` and `access_unavailable` are terminal and
   * the form stops offering to submit.
   */
  readonly status:
    | "idle"
    | "invalid"
    | "unauthenticated"
    | "error"
    | "created"
    | "already_onboarded"
    | "access_unavailable";
  /** Form-level message, shown in the summary and announced. */
  readonly message?: string;
  /** Inline messages keyed by field name. */
  readonly fieldErrors?: Readonly<Partial<Record<SetupFieldName, string>>>;
  /**
   * Changes on every submission so the form can tell "a new answer arrived"
   * from "the same state re-rendered", which is what moves focus to the error
   * summary exactly once per attempt.
   */
  readonly attempt: number;
};

export const SETUP_INITIAL_STATE: SetupActionState = Object.freeze({
  status: "idle",
  attempt: 0,
});

/** Statuses that must never be submitted again. */
export const TERMINAL_SETUP_STATUSES: readonly SetupActionState["status"][] =
  Object.freeze(["created", "already_onboarded", "access_unavailable"]);
