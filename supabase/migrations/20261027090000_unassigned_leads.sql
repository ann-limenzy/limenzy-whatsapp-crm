-- ---------------------------------------------------------------------------
-- Milestone 5A — Unassigned Leads become representable
-- Spec §26, §32, §160, §162, §162.1, §163, §163.9, §163.10, §163.13
-- ---------------------------------------------------------------------------
--
-- §163.9 requires a Lead kept "with no Record Owner", and §163.18 decision 2
-- requires imported Leads left Unassigned. Neither is expressible today:
-- `leads.record_owner_user_profile_id` is `not null`, so a Lead without an
-- owner cannot exist and Assignment Required has nowhere to live.
--
-- This migration makes the column nullable and makes every rule that reads it
-- correct for NULL. It does NOT create a way to produce an Unassigned Lead.
-- There is no automatic routing, no rotation, no eligibility and no import in
-- this slice, and `leads_add_insert` still pins the Record Owner to the
-- creator, so the only Lead anyone can file is one they own. A nullable
-- column that nothing nulls is the point: the schema and the rules land
-- first, and the workflows that use them land against rules already proven.
--
-- WHAT NULL MEANS, AND WHAT IT DOES NOT
--
--   * **Unassigned** is a Lead with no Record Owner (§163.9). That is all it
--     is here. **Assignment Required** is the narrower state §163.9 defines —
--     Unassigned *and* an automatic assignment was tried and failed — and it
--     needs a failure reason, a rule and a target team, none of which exist
--     yet. This migration adds no column for it and claims none of it.
--   * Nobody is responsible for an Unassigned Lead, so it blocks nobody's
--     deactivation. `app.count_leads_owned_by` is unchanged and matches no
--     NULL row, which is the §160 answer and not a side effect.
--
-- THE THREE-VALUED-LOGIC AUDIT, WHICH IS THE REAL WORK HERE
--
--   Dropping NOT NULL is one line. The danger is every `= owner` predicate
--   that silently becomes NULL instead of FALSE, because `NOT NULL` is NULL
--   and a NULL guard does not fire. Each one was read:
--
--     * `leads_record_access_select` / `leads_edit_update` — the §162.1
--       predicate is `all_records OR owner = me`. For an Unassigned Lead a
--       Staff/Sales caller gets `false OR null` = NULL, and RLS admits a row
--       only on TRUE. It fails CLOSED, which is the behaviour §163 asks for:
--       Unassigned Leads are visible to Owner/Admin and to Managers with the
--       visibility, and to nobody else. The policies are therefore unchanged,
--       and the verification block below pins that reading.
--     * `app.reassign_lead_owner` — the same predicate inside PL/pgSQL fails
--       OPEN, because `if not (null)` does not fire and execution continues.
--       That one is fixed below, and it is the reason this is a migration
--       rather than a schema tweak.
--     * `require_history` and the 3D guard trigger already use
--       `is distinct from`, so both fire on an initial assignment with no
--       change needed.
--     * `count_leads_owned_by`, the "mine" list filter and the composite
--       foreign key all compare with `=`, where no match is the right answer.
--
-- NOTHING IS BACKFILLED. Every existing Lead keeps the owner it has and the
-- history it has. No `owner_changed` entry is invented for a transfer that
-- never happened (§163.15).

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------
alter table public.leads
  alter column record_owner_user_profile_id drop not null;

comment on column public.leads.record_owner_user_profile_id is
  'Spec §26, §163.9. The Record Owner, or NULL for an Unassigned Lead. NULL '
  'is not "unknown": it is the explicit absence of an owner. No creation '
  'path produces it in Milestone 5A.';

-- ---------------------------------------------------------------------------
-- §163.13: an initial assignment is a real owner change, and owes history
-- ---------------------------------------------------------------------------
/*
 * 3D's constraint required BOTH owners on an `owner_changed` entry, which was
 * right while every Lead had an owner: a transfer with no previous owner was
 * a bug. With Unassigned Leads it is the first assignment, and refusing it
 * would mean either no history for the moment a Lead got its owner, or a
 * fabricated "from" naming someone who never held it.
 *
 * What the constraint still refuses is unchanged in substance:
 *   * `to_owner` is always present — an entry that assigns nobody is not an
 *     assignment;
 *   * the two ends must differ — a transfer that moved nothing is not a
 *     transfer. `is distinct from` keeps that true when "from" is NULL.
 */
alter table public.lead_activities
  drop constraint if exists lead_activities_transfer_names_both_owners;

alter table public.lead_activities
  add constraint lead_activities_transfer_names_an_owner
  check (
    kind <> 'owner_changed'::public.lead_activity_kind
    or (to_owner_user_profile_id is not null
        and from_owner_user_profile_id
              is distinct from to_owner_user_profile_id)
  );

comment on column public.lead_activities.from_owner_user_profile_id is
  'Spec §163.13. The Record Owner before a transfer; NULL on the first '
  'assignment of a previously Unassigned Lead, and NULL for every other '
  'kind.';

-- ---------------------------------------------------------------------------
-- The transfer routine, corrected for a NULL owner
-- ---------------------------------------------------------------------------
create or replace function app.reassign_lead_owner(
  p_lead_id           uuid,
  p_new_owner         uuid,
  p_expected_revision integer
)
returns table (outcome text, previous_owner uuid)
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $fn$
declare
  v_ws       uuid;
  v_owner    uuid;
  v_revision integer;
  v_active   boolean;
  v_updated  integer;
begin
  v_ws := app.current_workspace_id();

  /*
   * THE WORKSPACE ROW, FIRST, AND HELD TO COMMIT.
   *
   * §162's Manager row is configurable, so the authority for this caller
   * lives here. `setPermissionGranted` reads the row, computes the new
   * array and writes it with a plain UPDATE — which takes FOR NO KEY
   * UPDATE, and that conflicts with FOR SHARE. So from this statement
   * until this transaction ends, no revocation can commit: it queues on
   * this row instead. The permission read immediately below is therefore
   * stable for the rest of the routine rather than merely recent.
   *
   * FOR SHARE and not FOR UPDATE: two transfers in the same workspace have
   * no reason to serialise against each other, and SHARE is compatible with
   * SHARE. It is also compatible with the FOR KEY SHARE that every Lead and
   * history insert takes on this row through its workspace foreign key, so
   * holding it blocks no ordinary Lead work.
   *
   * It is FIRST because the permission write path takes no other row lock
   * at all — read `setPermissionGranted`: a read, then one UPDATE — so it
   * can never be waiting on anything this routine holds, and no cycle can
   * form through it wherever it sits. First is simply the position that
   * makes the authority stable earliest.
   */
  perform 1 from public.workspaces where id = v_ws for share;

  /*
   * THE LOCK ORDER, MEMBERSHIP ROWS.
   *
   * The active Owner/Admin rows, ascending — the same set, in the same
   * order, that `app.set_member_status` and `app.accept_workspace_invitation`
   * take before they touch any other membership row. Taking it here, before
   * the three rows below, is what puts this routine on the one total order
   * those two already share. Ascending order over the three alone would
   * deadlock against 2B whenever an Owner/Admin sorted after a recipient.
   *
   * Unconditional, even when nobody involved is an Owner/Admin: a lock set
   * that depends on who the parties turn out to be is a lock set that has to
   * be re-derived after it is already too late to take it.
   */
  perform 1
     from public.workspace_memberships
    where workspace_id = v_ws
      and role   = 'owner_admin'::public.workspace_role
      and status = 'active'::public.workspace_membership_status
    order by user_profile_id
      for update;

  /*
   * Re-read AFTER the lock, not before it. The answer is now fixed for the
   * rest of the transaction, because changing it requires a lock this
   * transaction holds.
   */
  if not app.current_user_may_change_record_owner() then
    return query select 'not_permitted'::text, null::uuid;
    return;
  end if;

  select l.record_owner_user_profile_id, l.revision
    into v_owner, v_revision
    from public.leads l
   where l.workspace_id = v_ws and l.id = p_lead_id;

  if not found then
    /* Not here, or not this workspace. §162.1 gives the same answer. */
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  /*
   * §162.1, checked BEFORE the transfer. Whether the actor can still see the
   * Lead afterwards is not a question this routine asks: handing on a record
   * you then stop seeing is the point of handing it on.
   *
   * 5A: `v_owner` can now be NULL, and the three-valued logic here mattered.
   * Written as `all_records or v_owner = me`, an Unassigned Lead gave
   * `false or null` = NULL for a Staff/Sales caller, `not null` is NULL, the
   * IF did not fire and the routine CONTINUED. The check failed open on
   * exactly the rows it was added to protect.
   *
   * So the Unassigned case is its own branch, answered before the comparison
   * is reached. §162.1: a Lead nobody owns is owned by nobody, so "records
   * they own" cannot include it; §163 puts it in reach of Owner/Admin and of
   * a Manager configured for All Records, which is what this predicate is.
   */
  if v_owner is null then
    if not app.current_user_may_access_all_records() then
      return query select 'not_permitted'::text, null::uuid;
      return;
    end if;
  elsif not (app.current_user_may_access_all_records()
             or v_owner = app.current_user_profile_id()) then
    return query select 'not_permitted'::text, null::uuid;
    return;
  end if;

  /*
   * Choosing the current owner changes nothing and records nothing. Returned
   * as its own outcome so a caller can say so, rather than as a success that
   * silently wrote no history and would then fail the completeness check.
   */
  if p_new_owner is not distinct from v_owner then
    return query select 'unchanged'::text, v_owner;
    return;
  end if;

  /*
   * The three membership rows this transaction will touch, ascending: the
   * actor, the owner it is taken from, and the owner it is given to. The
   * previous owner is in the set because the history row references it, and
   * a reference takes its own lock — one taken outside this order would be
   * taken outside the order.
   */
  perform 1
     from public.workspace_memberships
    where workspace_id = v_ws
      and user_profile_id in (
        app.current_user_profile_id(), v_owner, p_new_owner)
      /* `v_owner` is NULL for an initial assignment. `IN` simply does not
         match on it, which is right -- there is no previous owner's row to
         lock, and the history entry references none. */
    order by user_profile_id
      for update;

  /*
   * Re-checked after the waits. Those locks may have queued behind the very
   * transaction that demoted this actor or deactivated the recipient, and
   * the answers above were read from an earlier snapshot.
   */
  if not app.current_user_may_change_record_owner() then
    return query select 'not_permitted'::text, null::uuid;
    return;
  end if;

  select (m.status = 'active'::public.workspace_membership_status)
    into v_active
    from public.workspace_memberships m
   where m.workspace_id = v_ws and m.user_profile_id = p_new_owner;

  if not found then
    return query select 'unknown_recipient'::text, v_owner;
    return;
  end if;

  if not v_active then
    /* §160 from the other side: nobody inactive newly owns a Lead. */
    return query select 'recipient_inactive'::text, v_owner;
    return;
  end if;

  /*
   * THE AUTHORITY IS PART OF THE WRITE, not a conclusion reached before it.
   *
   * §162's Manager row is configurable, so this caller's permission lives on
   * the WORKSPACE row, which nothing here locks — and cannot lock. Measured:
   * a row lock on `public.workspaces` needs the UPDATE privilege even for
   * FOR SHARE, and table-level SELECT does not suffice. Buying a lock would
   * mean granting this role a write on the workspace, which is a far worse
   * trade than the window it closes.
   *
   * Putting the predicate inside the UPDATE closes that window without one.
   * Under READ COMMITTED every statement takes its own snapshot, so this
   * statement is judged against everything committed when it RUNS — not
   * when the checks above ran, which may have been before a lock wait. A
   * revocation that committed at any point before this statement is seen by
   * it, and the write simply matches no row.
   *
   * What remains is a genuinely concurrent revocation — one that commits
   * after this statement and before this transaction does. That is not a
   * stale check; it is two transactions overlapping, and serialising the
   * transfer before the revocation is a correct outcome for them.
   *
   * The owner and the revision are here for their own reasons: the revision
   * catches a stale form, the owner the narrower case of two transfers
   * racing from the same starting point.
   */
  update public.leads
     set record_owner_user_profile_id = p_new_owner
   where id = p_lead_id
     and workspace_id = v_ws
     and record_owner_user_profile_id is not distinct from v_owner
     and revision = p_expected_revision
     and app.current_user_may_change_record_owner();

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    /*
     * Which of the three it was. Asked in a fresh statement rather than
     * guessed, so a revoked Manager is told they may not do this instead of
     * being told their form was stale.
     */
    if not app.current_user_may_change_record_owner() then
      return query select 'not_permitted'::text, null::uuid;
    else
      return query select 'stale'::text, v_owner;
    end if;
    return;
  end if;

  /*
   * The history, from the same variables as the write above, in the same
   * statement pair. There is no path by which the entry can name an owner
   * the UPDATE did not move, and 3C's deferred constraint refuses the
   * transaction at COMMIT if the entry is missing altogether.
   */
  insert into public.lead_activities
    (workspace_id, lead_id, kind, actor_user_profile_id,
     from_owner_user_profile_id, to_owner_user_profile_id)
  values (v_ws, p_lead_id, 'owner_changed'::public.lead_activity_kind,
          app.current_user_profile_id(), v_owner, p_new_owner);

  return query select 'ok'::text, v_owner;
end
$fn$;
alter function app.reassign_lead_owner(uuid, uuid, integer)
  owner to limenzy_lead_support;
revoke all on function app.reassign_lead_owner(uuid, uuid, integer)
  from public;
grant execute on function app.reassign_lead_owner(uuid, uuid, integer)
  to limenzy_app;

comment on function app.reassign_lead_owner(uuid, uuid, integer) is
  'Spec §162, §162.1, §163.10, §163.13. Moves one Lead''s Record Owner under '
  'the established lock order, re-checking authority after every wait. From '
  'Milestone 5A the current owner may be NULL — an initial assignment of an '
  'Unassigned Lead — which only an actor who may access all records may '
  'perform, and which records an owner_changed entry with no "from".';

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
do $$
declare
  v_count   integer;
  v_notnull boolean;
begin
  -- The column is nullable, and nothing else about it moved.
  select a.attnotnull into v_notnull
    from pg_attribute a
   where a.attrelid = 'public.leads'::regclass
     and a.attname  = 'record_owner_user_profile_id'
     and not a.attisdropped;
  if v_notnull is null then
    raise exception 'the Record Owner column is missing';
  end if;
  if v_notnull then
    raise exception 'the Record Owner column is still NOT NULL';
  end if;

  -- No Lead lost its owner on the way through.
  select count(*) into v_count
    from public.leads where record_owner_user_profile_id is null;
  if v_count <> 0 then
    raise exception
      'this migration created % Unassigned Lead(s); it must create none',
      v_count;
  end if;

  -- The superseded constraint is gone and its replacement is in place.
  if exists (select 1 from pg_constraint
              where conrelid = 'public.lead_activities'::regclass
                and conname = 'lead_activities_transfer_names_both_owners') then
    raise exception 'the superseded owner-pair constraint is still present';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.lead_activities'::regclass
                    and conname = 'lead_activities_transfer_names_an_owner') then
    raise exception 'the replacement owner-pair constraint was not created';
  end if;

  /*
   * The §162.1 predicate is still the one that fails closed on NULL. If
   * somebody rewrites it as `coalesce(owner, me)` or `owner is not distinct
   * from me`, an Unassigned Lead becomes visible to everyone and nothing
   * else here would notice.
   */
  select count(*) into v_count
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
   where c.relname = 'leads'
     and pol.polname in ('leads_record_access_select', 'leads_edit_update')
     and pg_get_expr(pol.polqual, pol.polrelid)
           like '%record_owner_user_profile_id = app.current_user_profile_id()%';
  if v_count <> 2 then
    raise exception
      'the record-access policies no longer compare the owner with =; '
      'an Unassigned Lead may have become visible to its non-owners';
  end if;

  -- 5A adds no creation path for an Unassigned Lead: the insert policy still
  -- pins the Record Owner to the creator.
  if not exists (
    select 1 from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
     where c.relname = 'leads' and pol.polname = 'leads_add_insert'
       and pg_get_expr(pol.polwithcheck, pol.polrelid)
             like '%record_owner_user_profile_id = app.current_user_profile_id()%'
  ) then
    raise exception 'Lead creation no longer pins the Record Owner to the creator';
  end if;

  -- The runtime role still cannot write the owner column directly.
  if has_column_privilege('limenzy_app', 'public.leads',
                          'record_owner_user_profile_id', 'UPDATE') then
    raise exception 'the runtime role gained a direct write on the Record Owner';
  end if;

  -- The routine is still the support role's, and still not public.
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'reassign_lead_owner'
     and p.prosecdef
     and pg_get_userbyid(p.proowner) = 'limenzy_lead_support';
  if v_count <> 1 then
    raise exception 'the transfer routine changed owner or lost SECURITY DEFINER';
  end if;

  -- The history requirement still covers an owner change.
  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.leads'::regclass
       and t.tgname = 'require_history'
       and pg_get_triggerdef(t.oid) like '%record_owner_user_profile_id%'
  ) then
    raise exception 'an owner change no longer requires a history entry';
  end if;
end
$$;
