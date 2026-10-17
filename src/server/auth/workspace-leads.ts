import "server-only";

import type { DuplicateMatchField, ParsedLead } from "@/lib/validation/leads";
import { normaliseSearch } from "@/lib/validation/leads";
import { withTenant, type TenantTx } from "@/server/db/tenant";
import type { TenantContext } from "@/server/db/tenant-context";

/**
 * Leads — spec §26, §30–§32, §35–§37, §130.1, §162.1.
 *
 * Every call goes through `withTenant()`, so the tenant settings are
 * established before any statement runs and the rows are filtered by the
 * `leads` policies: reading is §162.1 record access, writing needs §162's
 * `add_leads_customers`, both re-derived from stored rows inside the
 * database rather than trusted from the caller.
 *
 * **No workspace parameter.** The context decides, so there is no argument
 * through which a caller could reach another workspace — and every foreign
 * key on `leads` carries `workspace_id`, so a cross-workspace reference is
 * unrepresentable rather than merely refused.
 *
 * ## The locking contract, now honoured on both sides
 *
 * `src/server/auth/workspace-lead-pipeline.ts` has documented since
 * Milestone 3A that a write of `leads.stage_id` must take the stage's row
 * lock before referencing it, so that a Lead cannot be filed into a stage
 * that a concurrent transaction is closing. `createLead` does exactly that:
 *
 *     select id, is_active, kind from public.workspace_lead_stages
 *      where id = … for update
 *
 * The deactivating UPDATE takes the same lock, and the BEFORE UPDATE trigger
 * that refuses to close an occupied stage runs while holding it. Whichever
 * transaction commits second sees the other's result: either the Lead is
 * there and the deactivation is refused, or the stage is closed and the
 * insert is refused. There is no interleaving in which both succeed.
 *
 * ## The same contract for §160
 *
 * A Lead write then locks the acting member's own membership row and checks
 * it is still active, through `app.lock_actor_membership()`. Deactivating a
 * member holds that row for the whole of its own transaction — status change
 * first, Lead count second — so a Lead cannot be created for someone who is
 * being deactivated, and a member cannot be deactivated while a Lead is being
 * created for them. The order is always STAGE then MEMBERSHIP here, and
 * membership alone there, so no cycle exists.
 */

export type LeadListItem = {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly stageName: string;
  readonly stageIsActive: boolean;
  readonly sourceName: string | null;
  readonly recordOwnerUserProfileId: string;
  readonly isOwnedByActor: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type LeadDetail = LeadListItem & {
  readonly notes: string | null;
  /** §27.1 dials the NORMALISED number when one could be derived. */
  readonly phoneNormalised: string | null;
  readonly phoneNeedsReview: boolean;
  readonly createdByUserProfileId: string;
};

/**
 * A §130.1 candidate, as the SERVER sees it.
 *
 * This shape carries the id and the matched fields of every candidate,
 * including ones the actor may not access — the §130.1 override record needs
 * exactly that. **It must not be handed to the browser.** The action reduces
 * it to `DuplicateWarning` below before anything crosses that boundary.
 */
export type DuplicateCandidate = {
  readonly id: string;
  readonly matchedFields: readonly DuplicateMatchField[];
  /** False when the actor may not access it; then nothing below is set. */
  readonly visible: boolean;
  readonly name?: string;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly stageName?: string;
};

/**
 * The same candidates, reduced to what §162.1 permits the actor to learn.
 *
 * A record they may not access contributes to `hiddenMatches` and nothing
 * else: not its id, not which field matched, not that it is a Lead rather
 * than something else. §32 still gets its warning; §162.1 still gets its
 * boundary.
 */
export type DuplicateWarning = {
  readonly visible: readonly {
    readonly id: string;
    readonly matchedFields: readonly DuplicateMatchField[];
    readonly name: string;
    readonly phone: string | null;
    readonly email: string | null;
    readonly stageName: string;
  }[];
  readonly hiddenMatches: number;
};

/** Reduce server-side candidates to what may leave the server. */
export function describeForActor(
  candidates: readonly DuplicateCandidate[],
): DuplicateWarning {
  const visible = candidates
    .filter((candidate) => candidate.visible)
    .map((candidate) => ({
      id: candidate.id,
      matchedFields: candidate.matchedFields,
      name: candidate.name ?? "",
      phone: candidate.phone ?? null,
      email: candidate.email ?? null,
      stageName: candidate.stageName ?? "",
    }));
  return {
    visible,
    hiddenMatches: candidates.length - visible.length,
  };
}

export type LeadWriteResult =
  | { readonly ok: true; readonly leadId: string }
  /** Not permitted to add, or the stage/source did not belong to this workspace. */
  | { readonly ok: false; readonly reason: "not_permitted" }
  /** The chosen stage is closed, or is an outcome rather than a column. */
  | { readonly ok: false; readonly reason: "stage_unavailable" }
  /** §130.1 candidates exist and the actor did not, or may not, override. */
  | {
      readonly ok: false;
      readonly reason: "duplicate";
      readonly candidates: readonly DuplicateCandidate[];
    }
  | { readonly ok: false; readonly reason: "refused" }
  | { readonly ok: false; readonly reason: "unavailable" };

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FOREIGN_KEY_VIOLATION = "23503";
const INSUFFICIENT_PRIVILEGE = "42501";
const RAISE_EXCEPTION = "P0001";

const sqlState = (error: unknown): string | undefined =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;

/** Map a database refusal to a word the screen can say. */
function refusal(error: unknown): LeadWriteResult {
  const state = sqlState(error);
  if (state === INSUFFICIENT_PRIVILEGE) {
    return { ok: false, reason: "not_permitted" };
  }
  /*
   * A composite foreign key failing means the stage, source or owner did not
   * belong to this workspace. The row never existed as far as the caller is
   * concerned, so this says the same thing a filtered policy would.
   */
  if (state === FOREIGN_KEY_VIOLATION) {
    return { ok: false, reason: "not_permitted" };
  }
  if (
    state === CHECK_VIOLATION ||
    state === RAISE_EXCEPTION ||
    state === UNIQUE_VIOLATION
  ) {
    return { ok: false, reason: "refused" };
  }
  throw error;
}

type ListRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  stage_name: string;
  stage_is_active: boolean;
  source_name: string | null;
  record_owner_user_profile_id: string;
  /*
   * `Date | string`, deliberately. postgres.js parses `timestamptz` into a
   * Date when this project runs it from plain Node, and hands back the raw
   * string inside the Next runtime — which turned every Lead Detail render
   * into "Invalid time value". The driver's parsing is not something the UI
   * should depend on, so `toItem` coerces and the type says why.
   */
  created_at: Date | string;
  updated_at: Date | string;
};

const toItem = (row: ListRow, actorProfileId: string): LeadListItem => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  email: row.email,
  stageName: row.stage_name,
  stageIsActive: row.stage_is_active,
  sourceName: row.source_name,
  recordOwnerUserProfileId: row.record_owner_user_profile_id,
  isOwnedByActor: row.record_owner_user_profile_id === actorProfileId,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

export type LeadListScope = "all" | "mine";

/**
 * The §31 list.
 *
 * `scope` is a NARROWING, never a widening: "All" means everything the
 * policy already allows, which for a Staff/Sales user is their own Leads
 * anyway. There is no scope value that reaches further than §162.1 does.
 *
 * Search covers Lead name, phone and email, as §31 lists. Phone and email are
 * searched on the value as entered AND on the normalised comparison value, so
 * typing `+919876543210` finds a Lead saved as `+91 98765 43210`.
 */
export async function listLeads(
  context: TenantContext,
  options: { readonly scope: LeadListScope; readonly search?: string },
): Promise<readonly LeadListItem[]> {
  const term = normaliseSearch(options.search ?? "");
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const mineOnly = options.scope === "mine";

  const rows = await withTenant(
    context,
    async (tx) =>
      tx<ListRow[]>`
        select l.id, l.name, l.phone, l.email,
               s.name as stage_name, s.is_active as stage_is_active,
               src.name as source_name,
               l.record_owner_user_profile_id,
               l.created_at, l.updated_at
          from public.leads l
          join public.workspace_lead_stages s
            on s.workspace_id = l.workspace_id and s.id = l.stage_id
          left join public.workspace_lead_sources src
            on src.workspace_id = l.workspace_id and src.id = l.source_id
         where (${mineOnly} = false
                or l.record_owner_user_profile_id = ${context.userProfileId}::uuid)
           and (${term} = ''
                or l.name ilike ${like}
                or l.phone ilike ${like}
                or l.email ilike ${like}
                or l.phone_normalised ilike ${like}
                or l.email_normalised ilike ${like})
         order by l.created_at desc
         limit 200
      `,
  );
  return rows.map((row) => toItem(row, context.userProfileId));
}

/** One Lead, or null when §162.1 does not let this actor see it. */
export async function leadDetail(
  context: TenantContext,
  leadId: string,
): Promise<LeadDetail | null> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<
        (ListRow & {
          notes: string | null;
          phone_normalised: string | null;
          phone_needs_review: boolean;
          created_by_user_profile_id: string;
        })[]
      >`
        select l.id, l.name, l.phone, l.email, l.notes,
               l.phone_normalised, l.phone_needs_review,
               s.name as stage_name, s.is_active as stage_is_active,
               src.name as source_name,
               l.record_owner_user_profile_id, l.created_by_user_profile_id,
               l.created_at, l.updated_at
          from public.leads l
          join public.workspace_lead_stages s
            on s.workspace_id = l.workspace_id and s.id = l.stage_id
          left join public.workspace_lead_sources src
            on src.workspace_id = l.workspace_id and src.id = l.source_id
         where l.id = ${leadId}::uuid
      `,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...toItem(row, context.userProfileId),
    notes: row.notes,
    phoneNormalised: row.phone_normalised,
    phoneNeedsReview: row.phone_needs_review,
    createdByUserProfileId: row.created_by_user_profile_id,
  };
}

/**
 * Record Owner names for the current workspace — §31's table column.
 *
 * Resolved through `app.workspace_member_names()`, because the runtime role
 * cannot read another person's profile. A caller who may not access every
 * record gets their own name only, which is all they need: every Lead they
 * can see is one they own.
 */
export async function recordOwnerNames(
  context: TenantContext,
): Promise<ReadonlyMap<string, string>> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<{ user_profile_id: string; full_name: string }[]>`
        select user_profile_id, full_name from app.workspace_member_names()
      `,
  );
  return new Map(rows.map((row) => [row.user_profile_id, row.full_name]));
}

/** The §130.1 lookup, run before the form is submitted as well as inside it. */
export async function findDuplicateCandidates(
  context: TenantContext,
  contact: {
    readonly phoneNormalised: string | null;
    readonly emailNormalised: string | null;
  },
): Promise<readonly DuplicateCandidate[]> {
  return withTenant(context, (tx) => duplicateCandidates(tx, contact));
}

/** Shared by the pre-check and the mandatory in-transaction check. */
async function duplicateCandidates(
  tx: TenantTx,
  contact: {
    readonly phoneNormalised: string | null;
    readonly emailNormalised: string | null;
  },
): Promise<readonly DuplicateCandidate[]> {
  if (contact.phoneNormalised === null && contact.emailNormalised === null) {
    return [];
  }
  const matches = await tx<{ lead_id: string; matched_fields: string[] }[]>`
    select lead_id, matched_fields
      from app.lead_duplicate_candidates(
        ${contact.phoneNormalised}, ${contact.emailNormalised})
  `;
  if (matches.length === 0) return [];

  /*
   * §162.1 decides what may be DESCRIBED. The routine above deliberately
   * returns ids only; this second read goes through the ordinary Lead policy,
   * so a candidate the actor may not access simply does not come back and is
   * reported as an invisible match rather than spelled out.
   */
  const ids = matches.map((m) => m.lead_id);
  const visible = await tx<
    {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      stage_name: string;
    }[]
  >`
    select l.id, l.name, l.phone, l.email, s.name as stage_name
      from public.leads l
      join public.workspace_lead_stages s
        on s.workspace_id = l.workspace_id and s.id = l.stage_id
     where l.id = any (${ids}::uuid[])
  `;
  const byId = new Map(visible.map((row) => [row.id, row]));

  return matches.map((match) => {
    const row = byId.get(match.lead_id);
    const matchedFields = match.matched_fields as DuplicateMatchField[];
    if (!row) {
      return { id: match.lead_id, matchedFields, visible: false };
    }
    return {
      id: match.lead_id,
      matchedFields,
      visible: true,
      name: row.name,
      phone: row.phone,
      email: row.email,
      stageName: row.stage_name,
    };
  });
}

export type CreateLeadOptions = {
  /**
   * §32's Create Anyway. The ACTION decides whether the actor holds
   * `create_anyway_after_duplicate_warning`; this only records that they
   * asked. An override with no candidates writes no audit row, because
   * §130.1's record is of an override that actually happened.
   */
  readonly override?: boolean;
  readonly overrideExplanation?: string | null;
};

/**
 * Create a Lead — §32.
 *
 * One transaction, in this order:
 *
 *   1. lock the stage row, and check it is an open ordinary column;
 *   2. re-run duplicate detection INSIDE the transaction — §130.1 calls this
 *      checkpoint "mandatory even when an earlier check passed, because
 *      records can be created concurrently", and it is the only one that can
 *      see a Lead another request committed a moment ago;
 *   3. insert;
 *   4. record the override, when one was used.
 */
export async function createLead(
  context: TenantContext,
  lead: ParsedLead,
  options: CreateLeadOptions = {},
): Promise<LeadWriteResult> {
  try {
    return await withTenant(context, async (tx) => {
      /*
       * THE LOCKING CONTRACT. The stage row is locked before anything
       * references it. A concurrent deactivation of this stage either has not
       * started (and will then see this Lead and be refused) or holds the
       * lock already (and this waits, then sees `is_active = false`).
       *
       * Through a routine rather than inline, because `select … for update`
       * needs the UPDATE privilege and limenzy_app's UPDATE policy on stages
       * admits only Owner/Admin — so an inline lock returned no rows for a
       * Staff/Sales user and they could not create a Lead at all. The routine
       * runs as a role whose UPDATE policy carries `with check (false)`: it
       * may take the lock and can never write. The lock belongs to THIS
       * transaction either way.
       */
      const stages = await tx<
        { stage_id: string; is_active: boolean; kind: string }[]
      >`
        select stage_id, is_active, kind
          from app.lock_lead_stage(${lead.stageId}::uuid)
      `;
      const stage = stages[0];
      // Filtered by policy, or simply not this workspace's stage.
      if (!stage) return { ok: false, reason: "not_permitted" } as const;

      /*
       * THE SECOND LOCK, and the §160 half of the contract.
       *
       * Stage first, membership second — the order every Lead write uses, and
       * the one deactivation never reverses, so the two cannot deadlock. A
       * deactivation in flight holds this row through the UPDATE inside
       * `app.set_member_status`, so this waits and then reads the committed
       * status; a deactivation that has not started yet will wait for this
       * transaction and then count the Lead it created.
       *
       * The foreign key's own lock is not enough: an insert takes FOR KEY
       * SHARE on the membership row and `update … set status` takes FOR NO
       * KEY UPDATE, and those two do not conflict.
       */
      const [actorStatus] = await tx<{ status: string | null }[]>`
        select app.lock_actor_membership() as status
      `;
      if (actorStatus?.status !== "active") {
        return { ok: false, reason: "not_permitted" } as const;
      }
      /*
       * A Lead starts in the pipeline, not at an outcome: §45 and §48 are how
       * a Lead becomes Won or Lost, and neither exists yet. A closed stage is
       * refused for the obvious reason.
       */
      if (!stage.is_active || stage.kind !== "active") {
        return { ok: false, reason: "stage_unavailable" } as const;
      }

      const candidates = await duplicateCandidates(tx, lead);
      if (candidates.length > 0 && options.override !== true) {
        return { ok: false, reason: "duplicate", candidates } as const;
      }

      const inserted = await tx<{ id: string }[]>`
        insert into public.leads
          (workspace_id, name, phone, phone_normalised, phone_needs_review,
           email, email_normalised, notes, stage_id, source_id,
           record_owner_user_profile_id, created_by_user_profile_id)
        values
          (${context.workspaceId}::uuid, ${lead.name}, ${lead.phone},
           ${lead.phoneNormalised}, ${lead.phoneNeedsReview}, ${lead.email},
           ${lead.emailNormalised}, ${lead.notes}, ${lead.stageId}::uuid,
           ${lead.sourceId}, ${context.userProfileId}::uuid,
           ${context.userProfileId}::uuid)
        returning id
      `;
      const id = inserted[0]?.id;
      if (!id) return { ok: false, reason: "not_permitted" } as const;

      if (options.override === true && candidates.length > 0) {
        const fields = [...new Set(candidates.flatMap((c) => c.matchedFields))];
        await tx`
          insert into public.lead_duplicate_overrides
            (workspace_id, lead_id, overridden_by_user_profile_id,
             candidate_lead_ids, matched_fields, explanation)
          values
            (${context.workspaceId}::uuid, ${id}::uuid,
             ${context.userProfileId}::uuid,
             ${candidates.map((c) => c.id)}::uuid[],
             ${fields}::text[],
             ${options.overrideExplanation ?? null})
        `;
      }

      return { ok: true, leadId: id } as const;
    });
  } catch (error) {
    return refusal(error);
  }
}

/**
 * How many Leads one person is the Record Owner of — §160's precondition.
 *
 * Counted by `app.count_leads_owned_by()`, which is SECURITY DEFINER, so the
 * answer covers EVERY Lead in the workspace rather than only the ones the
 * asker can see. Counting through the asker's own policy would have been
 * correct only for as long as §162 keeps user management with Owner/Admin,
 * and would have under-counted silently the day it did not — deactivating
 * someone who still owns work, which is what §160 exists to prevent.
 *
 * Returns **null** when the routine refuses, which it does for anyone who is
 * not an active Owner/Admin here. Null is not zero.
 */
export async function countLeadsOwnedBy(
  context: TenantContext,
  userProfileId: string,
): Promise<number | null> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<{ owned: number | null }[]>`
        select app.count_leads_owned_by(${userProfileId}::uuid) as owned
      `,
  );
  const owned = rows[0]?.owned;
  /*
   * NULL means the routine refused — the caller is not an active Owner/Admin
   * of this workspace. It is NOT zero, and a caller that treated it as zero
   * would deactivate someone who still owns Leads. Returning null makes the
   * distinction impossible to ignore.
   */
  return typeof owned === "number" ? owned : null;
}
