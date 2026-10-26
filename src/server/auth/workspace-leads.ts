import "server-only";

import type {
  DuplicateMatchField,
  EditableLeadField,
  LeadLostReason,
  ParsedLead,
} from "@/lib/validation/leads";
import { changedLeadFields, normaliseSearch } from "@/lib/validation/leads";
import type { LeadStageKind } from "@/lib/validation/lead-pipeline";
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
  /** The stage this Lead is in. Stable across a rename — §34 allows those. */
  readonly stageId: string;
  readonly stageName: string;
  /**
   * Whether the STAGE is switched on — §34's own flag, not whether this Lead
   * is still open. Won and Lost stages are switched on like any other, so
   * this is the wrong question to ask about a Lead's state.
   */
  readonly stageIsActive: boolean;
  /**
   * The stage's immutable kind: `active`, `won` or `lost`.
   *
   * This is what says whether a Lead is still in play. §34 lets a workspace
   * rename any stage, so the label cannot carry it, and `stageIsActive`
   * answers a different question entirely — a screen that coloured Won and
   * Lost from that flag showed them as open, which is what this exists to
   * prevent.
   */
  readonly stageKind: LeadStageKind;
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
  stage_id: string;
  stage_is_active: boolean;
  stage_kind: LeadStageKind;
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
  stageId: row.stage_id,
  stageIsActive: row.stage_is_active,
  stageKind: row.stage_kind,
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
               l.stage_id,
               s.name as stage_name, s.is_active as stage_is_active,
               s.kind as stage_kind,
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

/**
 * How many Leads sit in each stage, for the Board.
 *
 * **The list is CAPPED, not paginated.** `listLeads` returns the 200 most
 * recent rows and there is no offset, no page control and no total anywhere
 * in this gateway. Grouping those rows by stage would therefore produce
 * column counts that silently mean "of the 200 newest", which on a busy
 * workspace is not the pipeline at all.
 *
 * So the counts come from the database, over the WHOLE set this actor may
 * see. The WHERE clause is deliberately identical to `listLeads`'s — same
 * scope, same search, same escaping — because a count that does not match
 * the rows beside it is worse than no count. §162.1's policies narrow both
 * the same way, through the same `withTenant` path.
 *
 * One grouped read. It adds no pagination and loads no Lead into the
 * browser; the Board still renders only the rows `listLeads` returned, and
 * says so wherever a column holds more than it was given.
 */
export async function leadStageCounts(
  context: TenantContext,
  options: { readonly scope: LeadListScope; readonly search?: string },
): Promise<ReadonlyMap<string, number>> {
  const term = normaliseSearch(options.search ?? "");
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const mineOnly = options.scope === "mine";

  const rows = await withTenant(
    context,
    async (tx) =>
      tx<{ stage_id: string; total: number }[]>`
        select l.stage_id, count(*)::int as total
          from public.leads l
         where (${mineOnly} = false
                or l.record_owner_user_profile_id = ${context.userProfileId}::uuid)
           and (${term} = ''
                or l.name ilike ${like}
                or l.phone ilike ${like}
                or l.email ilike ${like}
                or l.phone_normalised ilike ${like}
                or l.email_normalised ilike ${like})
         group by l.stage_id
      `,
  );
  return new Map(rows.map((row) => [row.stage_id, row.total]));
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
               l.stage_id,
               s.name as stage_name, s.is_active as stage_is_active,
               s.kind as stage_kind,
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
  /** The Lead being edited, which must not report itself as its own match. */
  excludeLeadId: string | null = null,
): Promise<readonly DuplicateCandidate[]> {
  if (contact.phoneNormalised === null && contact.emailNormalised === null) {
    return [];
  }
  const matches = await tx<{ lead_id: string; matched_fields: string[] }[]>`
    select lead_id, matched_fields
      from app.lead_duplicate_candidates(
        ${contact.phoneNormalised}, ${contact.emailNormalised},
        ${excludeLeadId}::uuid)
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

      /*
       * §39's first entry is NOT written here. An AFTER INSERT trigger on
       * `leads` writes it, so a Lead cannot exist without the history saying
       * where it came from — whatever inserted it, and whether or not a
       * future code path remembers to. Leads created before 3C were given
       * theirs by the migration's backfill.
       */

      if (options.override === true && candidates.length > 0) {
        await recordOverride(tx, context, id, candidates, options);
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

// ---------------------------------------------------------------------------
// Milestone 3C — editing, stage changes and history
// ---------------------------------------------------------------------------

/**
 * Every mutation below shares one shape, and it is worth stating once.
 *
 * ## Lock order, across the whole application
 *
 *     stage row  →  the acting member's own row
 *
 * A Lead write that touches a stage takes `app.lock_lead_stage()` first, then
 * `app.lock_actor_membership()`. Deactivating a member takes only the
 * membership row; deactivating a stage takes only the stage row; changing a
 * role takes only the membership row. Nothing takes membership before stage,
 * so no cycle exists and no pair can deadlock.
 *
 * ## Authority is rechecked AFTER the waits
 *
 * Both locks can block. Whatever the actor's membership was when the request
 * began, what matters is what it is once the locks are held — so the
 * membership status is read from the lock itself and an inactive member is
 * refused, even though their request began while they were active.
 *
 * ## Every change and its history entry are one transaction
 *
 * §39 calls the history permanent. A change without its entry would be a
 * record of something that did not happen, and an entry without its change
 * the reverse, so both are written inside one `withTenant()` call and roll
 * back together.
 *
 * ## Aborts are refusals, never retries
 *
 * 40001 and 40P01 come back as `unavailable`. Re-running a mutation that may
 * already have applied is how a deadlock becomes a double change.
 */

const ABORTED_SQLSTATES: ReadonlySet<string> = new Set(["40001", "40P01"]);

const isConcurrencyAbort = (error: unknown): boolean =>
  ABORTED_SQLSTATES.has(sqlState(error) ?? "");

export type LeadChangeResult =
  | { readonly ok: true }
  /** §162.1 does not let this actor touch this Lead, or it is not here. */
  | { readonly ok: false; readonly reason: "not_permitted" }
  /** Somebody else saved first. §37's edits are not merged. */
  | { readonly ok: false; readonly reason: "stale" }
  /** The chosen stage is closed, or is an outcome where one is not allowed. */
  | { readonly ok: false; readonly reason: "stage_unavailable" }
  /** The workspace has no Won or Lost row — §34 says it must. */
  | { readonly ok: false; readonly reason: "outcome_missing" }
  /** §130.1 candidates exist and the actor did not, or may not, override. */
  | {
      readonly ok: false;
      readonly reason: "duplicate";
      readonly candidates: readonly DuplicateCandidate[];
    }
  | { readonly ok: false; readonly reason: "refused" }
  | { readonly ok: false; readonly reason: "unavailable" };

function changeRefusal(error: unknown): LeadChangeResult {
  if (isConcurrencyAbort(error)) return { ok: false, reason: "unavailable" };
  const state = sqlState(error);
  if (state === INSUFFICIENT_PRIVILEGE || state === FOREIGN_KEY_VIOLATION) {
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

export type LeadActivityEntry = {
  readonly id: string;
  readonly kind:
    | "record_created"
    | "details_edited"
    | "stage_changed"
    | "marked_won"
    | "marked_lost"
    | "reopened"
    | "note_added"
    | "owner_changed";
  readonly actorUserProfileId: string | null;
  readonly fromStageName: string | null;
  readonly toStageName: string | null;
  readonly changedFields: readonly string[] | null;
  /** §163.13: who a transfer moved the Lead from and to. */
  readonly fromOwnerUserProfileId: string | null;
  readonly toOwnerUserProfileId: string | null;
  readonly note: string | null;
  readonly lostReason: LeadLostReason | null;
  readonly occurredAt: Date;
};

/** The §39 timeline for one Lead, newest first. */
export async function leadActivity(
  context: TenantContext,
  leadId: string,
): Promise<readonly LeadActivityEntry[]> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<
        {
          id: string;
          kind: LeadActivityEntry["kind"];
          actor_user_profile_id: string | null;
          from_stage_name: string | null;
          to_stage_name: string | null;
          changed_fields: string[] | null;
          from_owner_user_profile_id: string | null;
          to_owner_user_profile_id: string | null;
          note: string | null;
          lost_reason: LeadLostReason | null;
          occurred_at: Date | string;
        }[]
      >`
        select a.id, a.kind::text as kind, a.actor_user_profile_id,
               f.name as from_stage_name, t.name as to_stage_name,
               a.changed_fields, a.from_owner_user_profile_id,
               a.to_owner_user_profile_id,
               a.note, a.lost_reason::text as lost_reason,
               a.occurred_at
          from public.lead_activities a
          left join public.workspace_lead_stages f
            on f.workspace_id = a.workspace_id and f.id = a.from_stage_id
          left join public.workspace_lead_stages t
            on t.workspace_id = a.workspace_id and t.id = a.to_stage_id
         where a.lead_id = ${leadId}::uuid
         order by a.occurred_at desc, a.id desc
         limit 200
      `,
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    actorUserProfileId: row.actor_user_profile_id,
    fromStageName: row.from_stage_name,
    toStageName: row.to_stage_name,
    changedFields: row.changed_fields,
    fromOwnerUserProfileId: row.from_owner_user_profile_id,
    toOwnerUserProfileId: row.to_owner_user_profile_id,
    note: row.note,
    lostReason: row.lost_reason,
    occurredAt: new Date(row.occurred_at),
  }));
}

/** The Lead as the edit form needs it, including its revision. */
export type LeadForEdit = {
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly notes: string | null;
  readonly stageId: string;
  readonly stageKind: LeadStageKind;
  readonly sourceId: string | null;
  readonly lostReason: LeadLostReason | null;
  readonly lostReasonNote: string | null;
};

export async function leadForEdit(
  context: TenantContext,
  leadId: string,
): Promise<LeadForEdit | null> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<
        {
          id: string;
          revision: number;
          name: string;
          phone: string | null;
          email: string | null;
          notes: string | null;
          stage_id: string;
          stage_kind: LeadStageKind;
          source_id: string | null;
          lost_reason: LeadLostReason | null;
          lost_reason_note: string | null;
        }[]
      >`
        select l.id, l.revision, l.name, l.phone, l.email, l.notes,
               l.stage_id, s.kind::text as stage_kind, l.source_id,
               l.lost_reason::text as lost_reason, l.lost_reason_note
          from public.leads l
          join public.workspace_lead_stages s
            on s.workspace_id = l.workspace_id and s.id = l.stage_id
         where l.id = ${leadId}::uuid
      `,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    revision: row.revision,
    name: row.name,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    stageId: row.stage_id,
    stageKind: row.stage_kind,
    sourceId: row.source_id,
    lostReason: row.lost_reason,
    lostReasonNote: row.lost_reason_note,
  };
}

/**
 * Hold the acting member's row and confirm they are still active.
 *
 * Called after every lock a mutation takes, because a lock that waited may
 * have waited on the very transaction that deactivated this person.
 */
async function actorStillActive(tx: TenantTx): Promise<boolean> {
  const [row] = await tx<{ status: string | null }[]>`
    select app.lock_actor_membership() as status
  `;
  return row?.status === "active";
}

export type EditLeadOptions = {
  /** §130.1's Create Anyway, for an edit that collides with another Lead. */
  readonly override?: boolean;
  readonly overrideExplanation?: string | null;
};

/**
 * Edit a Lead's details — §37, §39, §130.1.
 *
 * `expectedRevision` is the stale-edit guard. The UPDATE carries it in its
 * WHERE clause, so two people who opened the same Lead cannot both save:
 * whoever is second matches no row and is told, rather than silently
 * overwriting work they never saw.
 *
 * Duplicate detection runs again when a normalised contact value CHANGES,
 * excluding this Lead so it cannot report itself. §130.1 names creation, not
 * editing; the same collision is the same problem, so the same check applies.
 */
export async function editLead(
  context: TenantContext,
  leadId: string,
  expectedRevision: number,
  lead: ParsedLead,
  options: EditLeadOptions = {},
): Promise<LeadChangeResult> {
  try {
    return await withTenant(context, async (tx) => {
      if (!(await actorStillActive(tx))) {
        return { ok: false, reason: "not_permitted" } as const;
      }

      const [before] = await tx<
        {
          name: string;
          phone: string | null;
          email: string | null;
          notes: string | null;
          source_id: string | null;
          phone_normalised: string | null;
          email_normalised: string | null;
          stage_id: string;
        }[]
      >`
        select name, phone, email, notes, source_id,
               phone_normalised, email_normalised, stage_id
          from public.leads where id = ${leadId}::uuid
      `;
      // Filtered by §162.1, or simply not a Lead here. Same answer either way.
      if (!before) return { ok: false, reason: "not_permitted" } as const;

      /*
       * Only when a comparison value CHANGES. Re-warning about a Lead's own
       * unchanged number on every save would train people to click through
       * the warning, which is how a warning stops working.
       */
      const contactChanged =
        before.phone_normalised !== lead.phoneNormalised ||
        before.email_normalised !== lead.emailNormalised;
      let candidates: readonly DuplicateCandidate[] = [];
      if (contactChanged) {
        candidates = await duplicateCandidates(tx, lead, leadId);
        if (candidates.length > 0 && options.override !== true) {
          return { ok: false, reason: "duplicate", candidates } as const;
        }
      }

      const changed = changedLeadFields(
        {
          name: before.name,
          phone: before.phone,
          email: before.email,
          notes: before.notes,
          sourceId: before.source_id,
        },
        lead,
      );
      // Nothing to record and nothing to write. Not an error — a no-op save.
      if (changed.length === 0) return { ok: true } as const;

      const updated = await tx<{ id: string }[]>`
        update public.leads
           set name = ${lead.name},
               phone = ${lead.phone},
               phone_normalised = ${lead.phoneNormalised},
               phone_needs_review = ${lead.phoneNeedsReview},
               email = ${lead.email},
               email_normalised = ${lead.emailNormalised},
               notes = ${lead.notes},
               source_id = ${lead.sourceId}
         where id = ${leadId}::uuid
           and revision = ${expectedRevision}
        returning id
      `;
      /*
       * No row means the revision moved: somebody saved while this form was
       * open. The row is still there and still theirs to edit — they simply
       * have to look at what changed first.
       */
      if (updated.length === 0) return { ok: false, reason: "stale" } as const;

      await recordActivity(tx, context, leadId, {
        kind: "details_edited",
        changedFields: changed,
      });

      if (options.override === true && candidates.length > 0) {
        await recordOverride(tx, context, leadId, candidates, options);
      }
      return { ok: true } as const;
    });
  } catch (error) {
    return changeRefusal(error);
  }
}

/** Move a Lead to another ORDINARY stage — §39's "changed stage". */
export async function changeLeadStage(
  context: TenantContext,
  leadId: string,
  expectedRevision: number,
  stageId: string,
): Promise<LeadChangeResult> {
  return moveStage(context, leadId, expectedRevision, {
    kind: "stage_changed",
    target: async () => ({ stageId }),
    accepts: ordinaryOpenStage,
  });
}

/**
 * Mark a Lead Won — §45.
 *
 * The outcome is the Lead's stage, found by the immutable `kind`. §34 lets a
 * workspace rename Won, so a lookup by label would break the day someone did.
 *
 * No conversion is offered. §45 asks for "Convert this Lead into a Customer?"
 * and there is no Customer; a prompt whose only honest answer is "not yet" is
 * worse than none. Recorded in `lead-lifecycle-dependencies.ts`.
 */
export async function markLeadWon(
  context: TenantContext,
  leadId: string,
  expectedRevision: number,
): Promise<LeadChangeResult> {
  return moveStage(context, leadId, expectedRevision, {
    kind: "marked_won",
    target: (tx) => findOutcomeStage(tx, "won"),
    accepts: (stage) => stage.kind === "won",
  });
}

/** Mark a Lead Lost, with the reason §48 requires. */
export async function markLeadLost(
  context: TenantContext,
  leadId: string,
  expectedRevision: number,
  outcome: { readonly reason: LeadLostReason; readonly note: string | null },
): Promise<LeadChangeResult> {
  return moveStage(context, leadId, expectedRevision, {
    kind: "marked_lost",
    target: (tx) => findOutcomeStage(tx, "lost"),
    accepts: (stage) => stage.kind === "lost",
    lost: outcome,
  });
}

/**
 * Reopen a Lost Lead into an active ordinary stage — §48.
 *
 * The reason is cleared from the Lead and kept in its history: the Lead is no
 * longer lost, but that it once was, and why, is permanent.
 */
export async function reopenLead(
  context: TenantContext,
  leadId: string,
  expectedRevision: number,
  stageId: string,
): Promise<LeadChangeResult> {
  return moveStage(context, leadId, expectedRevision, {
    /*
     * No `lost` outcome, so the write below clears the reason. The Lead is
     * no longer lost; that it once was, and why, stays in its history.
     */
    kind: "reopened",
    target: async () => ({ stageId }),
    accepts: ordinaryOpenStage,
  });
}

/** Add a note — §39. No confirmation: §28 lists "add note" as not needing one. */
export async function addLeadNote(
  context: TenantContext,
  leadId: string,
  note: string,
): Promise<LeadChangeResult> {
  try {
    return await withTenant(context, async (tx) => {
      if (!(await actorStillActive(tx))) {
        return { ok: false, reason: "not_permitted" } as const;
      }
      /*
       * A note changes no Lead field, so there is no revision to check: two
       * notes written at once are both wanted, which is the opposite of two
       * edits written at once.
       */
      const [lead] = await tx<{ id: string }[]>`
        select id from public.leads where id = ${leadId}::uuid
      `;
      if (!lead) return { ok: false, reason: "not_permitted" } as const;

      await recordActivity(tx, context, leadId, { kind: "note_added", note });
      return { ok: true } as const;
    });
  } catch (error) {
    return changeRefusal(error);
  }
}

// ---------------------------------------------------------------------------
// The pieces every mutation shares
// ---------------------------------------------------------------------------

/** §130.1's override record, written in the same transaction as the change. */
async function recordOverride(
  tx: TenantTx,
  context: TenantContext,
  leadId: string,
  candidates: readonly DuplicateCandidate[],
  options: { readonly overrideExplanation?: string | null },
): Promise<void> {
  const fields = [...new Set(candidates.flatMap((c) => c.matchedFields))];
  await tx`
    insert into public.lead_duplicate_overrides
      (workspace_id, lead_id, overridden_by_user_profile_id,
       candidate_lead_ids, matched_fields, explanation)
    values
      (${context.workspaceId}::uuid, ${leadId}::uuid,
       ${context.userProfileId}::uuid,
       ${candidates.map((c) => c.id)}::uuid[],
       ${fields}::text[],
       ${options.overrideExplanation ?? null})
  `;
}

type ActivityToRecord = {
  readonly kind: LeadActivityEntry["kind"];
  readonly fromStageId?: string;
  readonly toStageId?: string;
  readonly changedFields?: readonly EditableLeadField[];
  readonly note?: string;
  readonly lostReason?: LeadLostReason;
};

/**
 * Write one history entry — §39.
 *
 * Always inside the caller's transaction, never after it, and always AFTER
 * the change it describes: a trigger stamps the entry with the Lead's
 * revision as it stands, and a deferred constraint checks at COMMIT that the
 * revision each material change produced has an entry. Writing the entry
 * first would stamp the old revision and abort the transaction.
 *
 * The author is the acting profile and the policy pins it there, so nobody
 * writes history in somebody else's name; the time comes from the database.
 */
async function recordActivity(
  tx: TenantTx,
  context: TenantContext,
  leadId: string,
  entry: ActivityToRecord,
): Promise<void> {
  await tx`
    insert into public.lead_activities
      (workspace_id, lead_id, kind, actor_user_profile_id,
       from_stage_id, to_stage_id, changed_fields, note, lost_reason)
    values
      (${context.workspaceId}::uuid, ${leadId}::uuid, ${entry.kind},
       ${context.userProfileId}::uuid,
       ${entry.fromStageId ?? null}, ${entry.toStageId ?? null},
       ${entry.changedFields ? [...entry.changedFields] : null},
       ${entry.note ?? null}, ${entry.lostReason ?? null})
  `;
}

/**
 * Which stage a move is heading for. Identified, NOT yet locked.
 *
 * Finding the target and locking it used to be one step, which forced the
 * target to be locked before the Lead was read — and therefore before the
 * stage it was moving FROM was even known. That is what made the lock order
 * depend on which stage happened to be the target. See `lockStagesInOrder`.
 */
async function findOutcomeStage(
  tx: TenantTx,
  kind: "won" | "lost",
): Promise<{ stageId: string } | { problem: "outcome_missing" }> {
  const [row] = await tx<{ id: string }[]>`
    select id from public.workspace_lead_stages
     where kind = ${kind}::public.lead_stage_kind
  `;
  return row ? { stageId: row.id } : { problem: "outcome_missing" };
}

type LockedStage = { stageId: string; isActive: boolean; kind: string };

/**
 * Lock the stage rows a move touches, in ascending id order.
 *
 * BOTH of them: the stage the Lead leaves as well as the one it arrives at.
 * The old stage is not optional housekeeping — the history entry references
 * it, and a foreign key takes its own `FOR KEY SHARE` on the referenced row.
 * A lock taken implicitly, after the explicit ones, is a lock taken outside
 * the order.
 *
 * MEASURED, not predicted. With only the target locked, a Lead move holding
 * the target and then taking the implicit key-share on the old stage
 * deadlocked against the pipeline's `lockStages`, which takes every stage
 * `FOR UPDATE` ordered by id: `40P01`, reproduced in
 * `lead-stage-locking.db.test.ts`. Ascending id order here is the same order
 * that routine uses, which is what removes the cycle rather than making it
 * rarer.
 *
 * uuids are compared as their canonical text, whose ordering matches
 * PostgreSQL's byte ordering: the separators sit at fixed positions and the
 * remaining characters are lowercase hex.
 */
async function lockStagesInOrder(
  tx: TenantTx,
  stageIds: readonly string[],
): Promise<Map<string, LockedStage>> {
  const ordered = [...new Set(stageIds)].sort();
  const locked = new Map<string, LockedStage>();
  for (const id of ordered) {
    const [row] = await tx<
      { stage_id: string; is_active: boolean; kind: string }[]
    >`
      select stage_id, is_active, kind
        from app.lock_lead_stage(${id}::uuid)
    `;
    if (row) {
      locked.set(row.stage_id, {
        stageId: row.stage_id,
        isActive: row.is_active,
        kind: row.kind,
      });
    }
  }
  return locked;
}

type StageMove = {
  readonly kind: LeadActivityEntry["kind"];
  /** The destination, found without locking anything. */
  readonly target: (
    tx: TenantTx,
  ) => Promise<
    | { stageId: string }
    | { problem: "not_permitted" | "stage_unavailable" | "outcome_missing" }
  >;
  /** Whether the destination, as LOCKED, is one this move may use. */
  readonly accepts: (stage: LockedStage) => boolean;
  readonly lost?: {
    readonly reason: LeadLostReason;
    readonly note: string | null;
  };
};

/** §45 and §48 are how a Lead reaches an outcome; the picker cannot. */
const ordinaryOpenStage = (stage: LockedStage) =>
  stage.kind === "active" && stage.isActive;

/**
 * Every stage move, in one place.
 *
 * Stage rows (both, ascending) → the acting member's row → the Lead row,
 * which is the order the whole application uses. The revision guard applies
 * here too: moving a Lead someone else has since moved is the same surprise
 * as overwriting their edit.
 */
async function moveStage(
  context: TenantContext,
  leadId: string,
  expectedRevision: number,
  move: StageMove,
): Promise<LeadChangeResult> {
  try {
    return await withTenant(context, async (tx) => {
      /*
       * Read BEFORE locking, so both stage ids are known and the pair can be
       * locked in a fixed order. Nothing is trusted from this read: the Lead
       * is re-read under the revision guard below, and the destination is
       * judged from its locked row rather than from this one.
       */
      const [seen] = await tx<{ stage_id: string }[]>`
        select stage_id from public.leads where id = ${leadId}::uuid
      `;
      // Filtered by §162.1, or simply not a Lead here. Same answer either way.
      if (!seen) return { ok: false, reason: "not_permitted" } as const;

      const resolved = await move.target(tx);
      if ("problem" in resolved) {
        return { ok: false, reason: resolved.problem } as const;
      }

      const locked = await lockStagesInOrder(tx, [
        seen.stage_id,
        resolved.stageId,
      ]);
      const destination = locked.get(resolved.stageId);
      // No row means the policy filtered it, or it is not this workspace's.
      if (!destination) return { ok: false, reason: "not_permitted" } as const;
      if (!move.accepts(destination)) {
        return { ok: false, reason: "stage_unavailable" } as const;
      }

      // After the stage locks, which may have waited on a deactivation.
      if (!(await actorStillActive(tx))) {
        return { ok: false, reason: "not_permitted" } as const;
      }

      const [before] = await tx<{ stage_id: string }[]>`
        select stage_id from public.leads where id = ${leadId}::uuid
      `;
      if (!before) return { ok: false, reason: "not_permitted" } as const;
      if (before.stage_id === resolved.stageId) return { ok: true } as const;
      /*
       * The Lead moved between the first read and the locks, so the stage it
       * is leaving is not the one this transaction locked. Refusing is the
       * honest answer: the revision guard would catch it too, but only after
       * the history entry had already named a stage nobody held.
       */
      if (before.stage_id !== seen.stage_id) {
        return { ok: false, reason: "stale" } as const;
      }

      const updated = await tx<{ id: string }[]>`
        update public.leads
           set stage_id = ${resolved.stageId}::uuid,
               lost_reason = ${move.lost?.reason ?? null},
               lost_reason_note = ${move.lost?.note ?? null}
         where id = ${leadId}::uuid
           and revision = ${expectedRevision}
        returning id
      `;
      if (updated.length === 0) return { ok: false, reason: "stale" } as const;

      await recordActivity(tx, context, leadId, {
        kind: move.kind,
        fromStageId: before.stage_id,
        toStageId: resolved.stageId,
        ...(move.lost
          ? { lostReason: move.lost.reason, note: move.lost.note ?? undefined }
          : {}),
      });
      return { ok: true } as const;
    });
  } catch (error) {
    /*
     * A deadlock or serialization failure rolls back the move AND its
     * history entry together, and is reported as unavailable. Nothing is
     * retried automatically.
     */
    return changeRefusal(error);
  }
}

// ---------------------------------------------------------------------------
// Manual Record Owner reassignment — §26, §49, §162, §162.1, §163.10, §163.13
// ---------------------------------------------------------------------------

export type AssignableMember = {
  readonly userProfileId: string;
  readonly fullName: string;
};

/**
 * Who this actor may hand a Lead to — §163.10.
 *
 * Active members only, and only for a caller who holds Change Record Owner:
 * the routine returns nothing to anyone else, so this is a picker rather
 * than a directory. It cannot be derived from `recordOwnerNames()`, which
 * answers a different question — a Manager scoped to their own records gets
 * only their own name there, and such a Manager may still hold this
 * permission.
 */
export async function assignableMembers(
  context: TenantContext,
): Promise<readonly AssignableMember[]> {
  const rows = await withTenant(
    context,
    async (tx) =>
      tx<{ user_profile_id: string; full_name: string }[]>`
        select user_profile_id, full_name from app.assignable_member_names()
      `,
  );
  return rows.map((row) => ({
    userProfileId: row.user_profile_id,
    fullName: row.full_name,
  }));
}

export type ReassignResult =
  | {
      readonly ok: true;
      /** Whether the actor can still see the Lead now that it has moved. */
      readonly retainsAccess: boolean;
      readonly previousOwnerUserProfileId: string;
    }
  /** Already theirs. Nothing was written and nothing was recorded. */
  | { readonly ok: false; readonly reason: "unchanged" }
  | { readonly ok: false; readonly reason: "not_permitted" }
  | { readonly ok: false; readonly reason: "stale" }
  | { readonly ok: false; readonly reason: "recipient_inactive" }
  | { readonly ok: false; readonly reason: "unknown_recipient" }
  | { readonly ok: false; readonly reason: "unavailable" };

/**
 * Hand a Lead to another active member.
 *
 * Everything that decides whether this may happen is inside
 * `app.reassign_lead_owner`, under its own locks, re-read after every wait:
 * §162's Change Record Owner (asked of the matrix, not of the caller's reach
 * — a Staff/Sales user is refused here even through a direct runtime call),
 * §162.1 access BEFORE the transfer, the recipient's active membership, the
 * current owner and the revision. The Lead's owner column is not writable by
 * this connection at all, so there is no second path to the same write.
 *
 * `retainsAccess` is not a failure. An actor who could see the Lead only
 * because they owned it stops seeing it the moment they hand it on, which is
 * what handing it on means; the caller uses this to say so and send them
 * somewhere that still exists.
 */
export async function reassignLead(
  context: TenantContext,
  leadId: string,
  expectedRevision: number,
  newOwnerUserProfileId: string,
): Promise<ReassignResult> {
  try {
    return await withTenant(context, async (tx) => {
      const [row] = await tx<
        { outcome: string; previous_owner: string | null }[]
      >`
        select outcome, previous_owner
          from app.reassign_lead_owner(
            ${leadId}::uuid, ${newOwnerUserProfileId}::uuid,
            ${expectedRevision}::integer)
      `;
      const outcome = row?.outcome;

      if (outcome === "ok") {
        /*
         * Asked rather than assumed, and asked through the actor's own
         * policies: the Lead is either still visible to them or it is not,
         * and only the policy knows which.
         */
        const [visible] = await tx<{ id: string }[]>`
          select id from public.leads where id = ${leadId}::uuid
        `;
        return {
          ok: true as const,
          retainsAccess: visible !== undefined,
          previousOwnerUserProfileId: row?.previous_owner ?? "",
        };
      }

      switch (outcome) {
        case "unchanged":
          return { ok: false as const, reason: "unchanged" as const };
        case "stale":
          return { ok: false as const, reason: "stale" as const };
        case "recipient_inactive":
          return { ok: false as const, reason: "recipient_inactive" as const };
        case "unknown_recipient":
          return { ok: false as const, reason: "unknown_recipient" as const };
        /*
         * `not_found` is reported as `not_permitted` on purpose: §162.1
         * answers "you may not see this" by returning nothing, and saying
         * "no such Lead" would tell an actor which ids exist here.
         */
        default:
          return { ok: false as const, reason: "not_permitted" as const };
      }
    });
  } catch (error) {
    /*
     * A deadlock or serialization failure rolls the whole transaction back —
     * the transfer and its history entry together — and is reported as
     * unavailable. Nothing is retried automatically: a mutation that aborted
     * is the person's to repeat, with the revision they are then shown.
     */
    if (isConcurrencyAbort(error)) {
      return { ok: false, reason: "unavailable" };
    }
    const state = sqlState(error);
    if (state === INSUFFICIENT_PRIVILEGE || state === FOREIGN_KEY_VIOLATION) {
      return { ok: false, reason: "not_permitted" };
    }
    if (
      state === CHECK_VIOLATION ||
      state === RAISE_EXCEPTION ||
      state === UNIQUE_VIOLATION
    ) {
      return { ok: false, reason: "not_permitted" };
    }
    throw error;
  }
}
