import "server-only";

import {
  orderingWithNewStage,
  reorderStages,
  type LeadStageKind,
} from "@/lib/validation/lead-pipeline";
import { withTenant, type TenantTx } from "@/server/db/tenant";
import type { TenantContext } from "@/server/db/tenant-context";

/**
 * Lead pipeline and source configuration — spec §34, §164, §165.
 *
 * Every call goes through `withTenant()`, so the tenant settings are
 * established before any statement runs and the rows are filtered by the
 * `workspace_lead_*` policies: reading needs an active membership, writing
 * needs an active Owner/Admin, both re-derived from stored rows.
 *
 * **No workspace parameter.** The context decides, so there is no argument
 * through which a caller could reach another workspace — and the composite
 * foreign keys on both tables mean a future Lead cannot cross workspaces
 * either.
 *
 * ## The locking contract
 *
 * Reordering and deactivating both write several rows, and the cross-row
 * invariants are DEFERRED constraint triggers, so each operation must happen
 * inside ONE transaction — which `withTenant()` already provides. Every
 * mutation below therefore opens by locking the workspace's stage rows in a
 * fixed order:
 *
 *     select id from public.workspace_lead_stages
 *      where workspace_id = … order by id for update
 *
 * Ordered by `id` so two concurrent administrators queue rather than deadlock,
 * exactly as the Milestone 2B membership mutations order theirs. A future
 * write of `leads.stage_id` must take the same lock on the stage it is about
 * to reference and re-read `is_active` afterwards; until it does, a Lead could
 * be filed against a stage that a concurrent transaction is closing. The
 * occupancy check itself belongs in a trigger and does not exist yet — see the
 * schema file.
 */

export type LeadStage = {
  readonly id: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly kind: LeadStageKind;
  readonly isActive: boolean;
};

export type LeadSource = {
  readonly id: string;
  readonly name: string;
  readonly isActive: boolean;
};

type StageRow = {
  id: string;
  name: string;
  sort_order: number;
  kind: LeadStageKind;
  is_active: boolean;
};

type SourceRow = { id: string; name: string; is_active: boolean };

const toStage = (row: StageRow): LeadStage => ({
  id: row.id,
  name: row.name,
  sortOrder: row.sort_order,
  kind: row.kind,
  isActive: row.is_active,
});

export type LeadPipelineWriteResult =
  | { readonly ok: true }
  /** Not an active Owner/Admin of this workspace, or no row matched. */
  | { readonly ok: false; readonly reason: "not_permitted" }
  /** An active stage or source already uses that name. */
  | { readonly ok: false; readonly reason: "name_taken" }
  /** The move was at an end of the pipeline, or aimed at an outcome. */
  | { readonly ok: false; readonly reason: "cannot_move" }
  /** A database invariant refused it — the last active stage, or an outcome. */
  | { readonly ok: false; readonly reason: "refused" }
  /** §34: leads are sitting in this stage and must be moved first. */
  | { readonly ok: false; readonly reason: "stage_occupied" }
  | { readonly ok: false; readonly reason: "unavailable" };

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const INSUFFICIENT_PRIVILEGE = "42501";
/** A deferred constraint trigger raises at COMMIT, which postgres.js surfaces here. */
const RAISE_EXCEPTION = "P0001";

/** The `constraint` a RAISE set, when the driver surfaced one. */
const constraintName = (error: unknown): string | undefined => {
  const named = error as { constraint_name?: unknown; constraint?: unknown };
  if (typeof named?.constraint_name === "string") return named.constraint_name;
  if (typeof named?.constraint === "string") return named.constraint;
  return undefined;
};

const sqlState = (error: unknown): string | undefined =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;

/** Map a database refusal to a word the screen can say. */
function refusal(error: unknown): LeadPipelineWriteResult {
  const state = sqlState(error);
  if (state === UNIQUE_VIOLATION) return { ok: false, reason: "name_taken" };
  if (state === INSUFFICIENT_PRIVILEGE) {
    return { ok: false, reason: "not_permitted" };
  }
  if (state === CHECK_VIOLATION || state === RAISE_EXCEPTION) {
    /*
     * §34's occupancy rule and the "keep one active stage" rule both arrive
     * as check violations, and they need different words on screen. The
     * trigger names the first one, so the two are told apart by what the
     * database said rather than by guessing from the message text.
     */
    return constraintName(error) === "stage_has_leads"
      ? { ok: false, reason: "stage_occupied" }
      : { ok: false, reason: "refused" };
  }
  throw error;
}

/** Stages, including deactivated ones, in pipeline order. */
export async function leadStages(
  context: TenantContext,
): Promise<readonly LeadStage[]> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<StageRow[]>`
        select id, name, sort_order, kind::text as kind, is_active
          from public.workspace_lead_stages
         order by sort_order
      `,
  );
  return rows.map(toStage);
}

export async function leadSources(
  context: TenantContext,
): Promise<readonly LeadSource[]> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<SourceRow[]>`
        select id, name, is_active
          from public.workspace_lead_sources
         order by lower(name)
      `,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.is_active,
  }));
}

/** Lock the workspace's stage rows, in id order, for the rest of the transaction. */
const lockStages = (tx: TenantTx) =>
  tx<StageRow[]>`
    select id, name, sort_order, kind::text as kind, is_active
      from public.workspace_lead_stages
     order by id
       for update
  `;

/**
 * Add an ordinary pipeline column.
 *
 * It goes last among the columns, which means immediately before Won — so Won
 * and Lost shift down by one in the same transaction. The deferred uniqueness
 * on `(workspace_id, sort_order)` is what allows the renumbering to pass
 * through a transient collision on its way to a valid state.
 */
export async function addLeadStage(
  context: TenantContext,
  name: string,
): Promise<LeadPipelineWriteResult> {
  try {
    const ok = await withTenant(context, async (tx) => {
      const existing = (await lockStages(tx)).map(toStage);

      const inserted = await tx<{ id: string }[]>`
        insert into public.workspace_lead_stages
          (workspace_id, name, sort_order, kind)
        values (${context.workspaceId}, ${name},
                ${existing.length + 1}, 'active')
        returning id
      `;
      const id = inserted[0]?.id;
      if (!id) return false;

      /*
       * `existing` is the pipeline as it was BEFORE the insert, which is what
       * `orderingWithNewStage` wants — it appends the new id itself. Passing a
       * list that already contained it numbered the new stage twice and
       * shifted every row by one.
       */
      for (const row of orderingWithNewStage(existing, id)) {
        await tx`
          update public.workspace_lead_stages
             set sort_order = ${row.sortOrder}
           where id = ${row.id}::uuid
        `;
      }
      return true;
    });
    return ok ? { ok: true } : { ok: false, reason: "not_permitted" };
  } catch (error) {
    return refusal(error);
  }
}

export async function renameLeadStage(
  context: TenantContext,
  stageId: string,
  name: string,
): Promise<LeadPipelineWriteResult> {
  try {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ id: string }[]>`
          update public.workspace_lead_stages
             set name = ${name}
           where id = ${stageId}::uuid
          returning id
        `,
    );
    return rows.length > 0
      ? { ok: true }
      : { ok: false, reason: "not_permitted" };
  } catch (error) {
    return refusal(error);
  }
}

/** Move one ordinary column up or down. Outcomes never move. */
export async function moveLeadStage(
  context: TenantContext,
  stageId: string,
  direction: "up" | "down",
): Promise<LeadPipelineWriteResult> {
  try {
    const outcome = await withTenant(context, async (tx) => {
      const existing = (await lockStages(tx)).map(toStage);
      const ordering = reorderStages(existing, stageId, direction);
      if (!ordering) return "cannot_move" as const;

      for (const row of ordering) {
        await tx`
          update public.workspace_lead_stages
             set sort_order = ${row.sortOrder}
           where id = ${row.id}::uuid
        `;
      }
      return "ok" as const;
    });
    return outcome === "ok" ? { ok: true } : { ok: false, reason: outcome };
  } catch (error) {
    return refusal(error);
  }
}

/**
 * Switch a stage off or on.
 *
 * The UPDATE takes the stage's row lock as part of writing it, which is the
 * half of the locking contract this side owes. Won and Lost are refused by a
 * row trigger, and emptying the pipeline is refused by the deferred one.
 */
export async function setLeadStageActive(
  context: TenantContext,
  stageId: string,
  isActive: boolean,
): Promise<LeadPipelineWriteResult> {
  try {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ id: string }[]>`
          update public.workspace_lead_stages
             set is_active = ${isActive}
           where id = ${stageId}::uuid
          returning id
        `,
    );
    return rows.length > 0
      ? { ok: true }
      : { ok: false, reason: "not_permitted" };
  } catch (error) {
    return refusal(error);
  }
}

export async function addLeadSource(
  context: TenantContext,
  name: string,
): Promise<LeadPipelineWriteResult> {
  try {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ id: string }[]>`
          insert into public.workspace_lead_sources (workspace_id, name)
          values (${context.workspaceId}, ${name})
          returning id
        `,
    );
    return rows.length > 0
      ? { ok: true }
      : { ok: false, reason: "not_permitted" };
  } catch (error) {
    return refusal(error);
  }
}

export async function renameLeadSource(
  context: TenantContext,
  sourceId: string,
  name: string,
): Promise<LeadPipelineWriteResult> {
  try {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ id: string }[]>`
          update public.workspace_lead_sources
             set name = ${name}
           where id = ${sourceId}::uuid
          returning id
        `,
    );
    return rows.length > 0
      ? { ok: true }
      : { ok: false, reason: "not_permitted" };
  } catch (error) {
    return refusal(error);
  }
}

export async function setLeadSourceActive(
  context: TenantContext,
  sourceId: string,
  isActive: boolean,
): Promise<LeadPipelineWriteResult> {
  try {
    const rows = await withTenant(
      context,
      async (tx) =>
        tx<{ id: string }[]>`
          update public.workspace_lead_sources
             set is_active = ${isActive}
           where id = ${sourceId}::uuid
          returning id
        `,
    );
    return rows.length > 0
      ? { ok: true }
      : { ok: false, reason: "not_permitted" };
  } catch (error) {
    return refusal(error);
  }
}
