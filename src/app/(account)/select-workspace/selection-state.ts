/**
 * The chooser action's state shape and its initial value.
 *
 * Separate from `actions.ts` for the same reason the setup flow keeps its
 * state separate: a `"use server"` file may export only async functions, so a
 * plain object cannot live there even though it is only data.
 *
 * Nothing here is server-only — the client form imports the same constant to
 * seed `useActionState`.
 */

export type SelectionActionState = {
  /**
   * `idle` before the first submission. `unavailable` means the submitted
   * workspace is not an active membership of this user — stale, revoked,
   * foreign, malformed or invented, deliberately indistinguishable. `error` is
   * a temporary fault worth retrying.
   */
  readonly status: "idle" | "unavailable" | "error";
  /** Message shown in the form-level alert. Never names a workspace. */
  readonly message?: string;
  /** Changes on every submission, so the form can move focus exactly once. */
  readonly attempt: number;
};

export const SELECTION_INITIAL_STATE: SelectionActionState = Object.freeze({
  status: "idle",
  attempt: 0,
});
