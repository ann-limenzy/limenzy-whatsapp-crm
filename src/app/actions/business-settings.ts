"use server";

import { revalidatePath } from "next/cache";

import { can } from "@/lib/permissions";
import {
  parseBusinessSettings,
  type BusinessSettingsField,
  type BusinessSettingsInput,
} from "@/lib/validation/business-settings";
import { requireWorkspaceContext } from "@/server/auth/require-workspace";
import { updateBusinessSettings } from "@/server/auth/workspace-business-settings";

/**
 * Save Business Settings — spec §158.
 *
 * §158 gives these settings to Owner/Admin, and §162 makes "Configure CRM
 * Settings" an Owner/Admin action. The role is resolved **here, on the
 * server**, from the membership this request re-resolved — never from a form
 * field, a cookie or anything else the browser sent. A Server Action is
 * reachable by anyone who can POST to it, so the form hiding its controls is
 * presentation, not the gate.
 *
 * The workspace is resolved before the submission is parsed. A caller with no
 * active membership gets the gate's own behaviour rather than a validation
 * reply, which would otherwise confirm which fields exist to someone who may
 * not even be signed in.
 *
 * ## The workspace the form was rendered for
 *
 * `require-workspace.ts` sets out the rule this honours: a workspace id from
 * the browser is untrusted and must never SELECT the target, but it may be
 * compared against the resolved workspace to detect a page rendered before a
 * switch. That matters more here than for a permission toggle. The saved
 * preference is a cookie shared by every tab, so someone who opens Business
 * Settings for one workspace, switches to another elsewhere and then saves
 * would otherwise overwrite all eight fields of the second workspace with the
 * first one's details — silently, and with a success message.
 *
 * So the form carries the id it was rendered for, the action compares it, and
 * a mismatch refuses and asks for a reload. The comparison is a detection, not
 * a selection: the write still goes to the context the gate resolved.
 *
 * Row-level security and the column-scoped UPDATE grant re-check regardless,
 * and `updateBusinessSettings` reports a refused write rather than treating a
 * zero-row UPDATE as success.
 */

export type BusinessSettingsState = {
  /**
   * `idle` before the first submission. `invalid`, `forbidden`, `stale` and
   * `unavailable` are all retryable — nothing was written in any of them —
   * and `saved` carries the values as they were actually stored.
   */
  readonly status:
    "idle" | "saved" | "invalid" | "forbidden" | "stale" | "unavailable";
  /** Inline messages keyed by field; `form` covers anything unattributable. */
  readonly fieldErrors?: Readonly<
    Partial<Record<BusinessSettingsField, string>>
  >;
  /**
   * What the database now holds, on success only. Returned so the form can
   * show the *stored* values rather than what was typed: the parser trims and
   * upper-cases, so the two legitimately differ.
   */
  readonly settings?: BusinessSettingsInput;
  /**
   * Changes on every submission, so the form can tell a fresh answer from the
   * same state re-rendered. That is what moves focus to the error summary
   * exactly once per attempt, including when two attempts fail identically.
   */
  readonly attempt: number;
};

/**
 * The hidden field carrying the workspace the form was rendered for.
 *
 * Exported as a type-only constant would not survive a `"use server"` module,
 * so the name is duplicated in the form rather than shared — and a test holds
 * the two together.
 */
const RENDERED_WORKSPACE_FIELD = "renderedWorkspaceId";

/** Read a form value as a string, treating a missing field as empty. */
const text = (data: FormData, key: string): string => {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
};

export async function saveBusinessSettingsAction(
  previous: BusinessSettingsState,
  formData: FormData,
): Promise<BusinessSettingsState> {
  const attempt = previous.attempt + 1;
  const { context, role, workspaceId } = await requireWorkspaceContext();

  // Authorization stays outermost: whether this person may configure the
  // workspace they are actually in is decided before anything the browser sent
  // is consulted at all.
  if (!can({ role, action: "configure_crm_settings" })) {
    return { status: "forbidden", attempt };
  }

  // Fails closed. The only caller that omits this field is not this form, and
  // a submission that cannot say which workspace it was rendered for is
  // exactly the one that must not overwrite eight fields of whichever
  // workspace the cookie happens to name now.
  if (text(formData, RENDERED_WORKSPACE_FIELD) !== workspaceId) {
    return { status: "stale", attempt };
  }

  const parsed = parseBusinessSettings({
    name: text(formData, "name"),
    businessType: text(formData, "businessType"),
    businessPhone: text(formData, "businessPhone"),
    businessEmail: text(formData, "businessEmail"),
    address: text(formData, "address"),
    country: text(formData, "country"),
    currency: text(formData, "currency"),
    timeZone: text(formData, "timeZone"),
  });

  if (!parsed.ok) {
    // First message per field wins. A field can raise several issues at once
    // and showing them stacked beside one input reads as noise; the first is
    // the one that has to be fixed anyway.
    const fieldErrors: Partial<Record<BusinessSettingsField, string>> = {};
    for (const issue of parsed.issues) {
      fieldErrors[issue.field] ??= issue.message;
    }
    return { status: "invalid", fieldErrors, attempt };
  }

  const result = await updateBusinessSettings(context, parsed.value);
  if (!result.ok) return { status: "unavailable", attempt };

  // The workspace name appears in the application shell, which the `(app)`
  // layout renders, so the whole tree is revalidated rather than this page
  // alone — otherwise a renamed workspace would keep its old name in the
  // navigation until the next full load.
  revalidatePath("/", "layout");
  return { status: "saved", settings: result.settings, attempt };
}
