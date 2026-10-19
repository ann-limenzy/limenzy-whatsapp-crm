-- ---------------------------------------------------------------------------
-- Milestone 3D — manual Lead Record Owner reassignment
-- Spec §26, §49, §160, §162, §162.1, §163.10, §163.13
-- ---------------------------------------------------------------------------
--
-- §163.10 is specific about who may reassign and who may receive, and none of
-- it needs Sales Teams to exist:
--
--   * an Owner/Admin may assign to any active workspace user;
--   * a Manager may assign where the workspace grants it (§162's Change
--     Record Owner is CONFIGURABLE, not "Decision required");
--   * Staff/Sales cannot;
--   * the assignee must be an active workspace user, and "the server
--     validates the assignee and never accepts it from the browser alone".
--
-- WHAT STAYS DEFERRED, AND IS NOT IMPLEMENTED HERE
--
--   Cross-team restriction, Team Lead reassignment (§163.18 decision 4) and
--   the team, rule, method and sequence fields of §163.13's assignment audit.
--   None of them can be written against a schema with no Sales Teams, and
--   none is claimed below. They are registered in
--   `src/server/auth/lead-lifecycle-dependencies.ts` so the day `sales_teams`
--   appears, the guard test fails until somebody decides what they now mean.
--
-- WHY A SECURITY DEFINER ROUTINE AND NOT A COLUMN GRANT
--
--   `limenzy_app` holds no UPDATE on `record_owner_user_profile_id` and still
--   does not: 3B refused it deliberately and a test pins it. Two things
--   follow that a grant could not give:
--
--     * §162's Change Record Owner is enforced INDEPENDENTLY of ordinary edit
--       permission. A Staff/Sales user holds `edit_permitted_records` and is
--       refused here even through a direct runtime call, because the routine
--       asks the matrix itself rather than trusting the caller's reach.
--     * A Manager whose §162.1 scope is "own, assigned and shared" keeps the
--       permission the workspace configured for them. `leads_edit_update`'s
--       WITH CHECK requires the row to stay in the actor's scope, so a plain
--       UPDATE would refuse to move a Lead OUT of it — losing sight of a Lead
--       you have just handed on is the correct outcome of a transfer, not a
--       failure, and §162.1 is checked BEFORE the transfer rather than after.
--
-- THE LOCK ORDER, AUDITED RATHER THAN ASSUMED
--
--   Sorting membership ids does NOT make this safe on its own. Measured
--   against what the existing routines actually take:
--
--     * `app.set_member_status` (2B) locks EVERY active owner_admin row,
--       `order by user_profile_id for update`, and only then its target row.
--     * `app.accept_workspace_invitation` locks the invitation row, then the
--       same owner_admin set in the same order.
--     * Every Lead mutation locks the stage row, then exactly ONE membership
--       row — the actor's, through `app.lock_actor_membership()`.
--
--   A transaction that takes one membership row cannot be half of a cycle.
--   Reassignment is the first to need three (actor, previous owner, new
--   owner), so ascending order alone would deadlock: 2B holding owner_admin
--   A and waiting for X, while a reassignment holds X and waits for A.
--
--   The rule this migration adopts, and which every existing path already
--   obeys:
--
--       stage row  →  active owner_admin rows, ascending
--                  →  any other membership row, ascending
--
--   Reassignment takes the owner_admin set FIRST, unconditionally, then the
--   three rows it touches in ascending order. That is heavier than it needs
--   to be when nobody involved is an Owner/Admin, and it is the only shape
--   that shares one total order with the two routines above.

-- ---------------------------------------------------------------------------
-- What the history records about a transfer
-- ---------------------------------------------------------------------------
-- §163.13 asks a Lead assignment entry to carry the previous Record Owner,
-- the new Record Owner, the acting user and the timestamp. The last two are
-- already columns; these are the first two. Team, rule, method and sequence
-- are the deferred fields and are deliberately absent rather than nullable
-- placeholders nothing writes.
alter table public.lead_activities
  add column if not exists from_owner_user_profile_id uuid,
  add column if not exists to_owner_user_profile_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.lead_activities'::regclass
       and conname = 'lead_activities_from_owner_fkey'
  ) then
    alter table public.lead_activities
      add constraint lead_activities_from_owner_fkey
      foreign key (workspace_id, from_owner_user_profile_id)
      references public.workspace_memberships (workspace_id, user_profile_id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.lead_activities'::regclass
       and conname = 'lead_activities_to_owner_fkey'
  ) then
    alter table public.lead_activities
      add constraint lead_activities_to_owner_fkey
      foreign key (workspace_id, to_owner_user_profile_id)
      references public.workspace_memberships (workspace_id, user_profile_id)
      on delete restrict;
  end if;

  /* Each kind carries what it means, and nothing it does not. */
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.lead_activities'::regclass
       and conname = 'lead_activities_owners_only_on_transfer'
  ) then
    alter table public.lead_activities
      add constraint lead_activities_owners_only_on_transfer
      check (
        kind = 'owner_changed'::public.lead_activity_kind
        or (from_owner_user_profile_id is null
            and to_owner_user_profile_id is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.lead_activities'::regclass
       and conname = 'lead_activities_transfer_names_both_owners'
  ) then
    alter table public.lead_activities
      add constraint lead_activities_transfer_names_both_owners
      check (
        kind <> 'owner_changed'::public.lead_activity_kind
        or (from_owner_user_profile_id is not null
            and to_owner_user_profile_id is not null
            /* A transfer that moved nothing is not a transfer. */
            and from_owner_user_profile_id <> to_owner_user_profile_id)
      );
  end if;
end
$$;

comment on column public.lead_activities.from_owner_user_profile_id is
  'Spec §163.13. The Record Owner before a transfer; null for every other kind.';
comment on column public.lead_activities.to_owner_user_profile_id is
  'Spec §163.13. The Record Owner after a transfer; null for every other kind.';

-- ---------------------------------------------------------------------------
-- What the support role needs, and nothing more
-- ---------------------------------------------------------------------------
-- `limenzy_lead_support` is the NOLOGIN role 3B created for the three things
-- §162.1 denies the acting user directly. It already reads memberships,
-- profiles and Leads workspace-wide through its own narrow policies. It
-- gains exactly three things here:
--
--   * two workspace COLUMNS, so a §162 decision can be evaluated at all;
--   * UPDATE on one Lead column;
--   * INSERT on the history, so a transfer and its entry are written by the
--     same statement pair in the same routine and cannot disagree.
grant select (id, manager_record_scope, permissions_granted)
  on public.workspaces to limenzy_lead_support;

/*
 * A LOCK-ONLY write privilege on the workspace row.
 *
 * §162's Manager row is configurable, so this caller's permission lives on
 * the workspace row — and a transfer has to be serialised against a change
 * to it, not merely narrow the window. PostgreSQL will not take a row lock
 * without an UPDATE privilege: measured, `FOR SHARE` is refused for a role
 * holding only SELECT, even table-wide. So the privilege exists purely to
 * make the lock takeable.
 *
 * `time_zone` is the column, chosen because it is the most harmless one
 * there is — a §158 display setting. The policy below refuses every write
 * outright, so nothing can be written through it at all; the column choice
 * is what the blast radius would be if that policy were ever weakened, and
 * it is deliberately not `permissions_granted` or `manager_record_scope`.
 */
grant update (time_zone) on public.workspaces to limenzy_lead_support;

grant update (record_owner_user_profile_id)
  on public.leads to limenzy_lead_support;

grant insert (workspace_id, lead_id, kind, actor_user_profile_id,
              from_owner_user_profile_id, to_owner_user_profile_id)
  on public.lead_activities to limenzy_lead_support;

/*
 * §162.1's predicate, which the transfer has to evaluate for the ACTOR
 * before it moves anything. 3B revoked it from PUBLIC and granted it to the
 * runtime role alone; inside a definer routine the current user is this
 * role, so without this the routine fails with "permission denied for
 * function" rather than answering the question.
 *
 * It is an INVOKER function, so it runs with this role's own policies — all
 * of which are scoped to the current workspace and keyed on the acting
 * identity in the session settings. The answer is the actor's, not the
 * role's.
 */
grant execute on function app.current_user_may_access_all_records()
  to limenzy_lead_support;

/*
 * The workspace row, for the current workspace and only to an active member
 * of it. The same shape as `workspaces_members_select`, which exists so the
 * co-member name routine can read the Manager record scope; this one also
 * reaches `permissions_granted`, because §162's Manager row is configurable
 * and a decision cannot be made without reading the configuration.
 */
drop policy if exists workspaces_support_select on public.workspaces;
create policy workspaces_support_select on public.workspaces
  for select to limenzy_lead_support
  using (
    id = app.current_workspace_id()
    and exists (
      select 1 from public.workspace_memberships m
       where m.workspace_id    = workspaces.id
         and m.user_profile_id = app.current_user_profile_id()
         and m.status          = 'active'::public.workspace_membership_status
    )
  );

/*
 * USING admits the lock; WITH CHECK (false) means no update can ever land.
 * The same shape as `workspace_lead_stages_support_lock` and the two
 * membership lock policies.
 *
 * PERMISSIVE POLICIES ARE OR'd, so this is only a restriction if no OTHER
 * update policy on `workspaces` applies to this role. The only other one is
 * `workspaces_owner_admin_update`, which is scoped `to limenzy_app` — a
 * different role, so it never ORs with this. The verification block below
 * asserts that this role has exactly one update policy here and that its
 * WITH CHECK is `false`, so a second one cannot be added quietly.
 */
drop policy if exists workspaces_support_lock on public.workspaces;
create policy workspaces_support_lock on public.workspaces
  for update to limenzy_lead_support
  using (id = app.current_workspace_id())
  with check (false);

/*
 * One Lead column, in this workspace. The column grant above is what keeps
 * this from being a general write: a policy cannot name a column, and a
 * grant cannot name a row, so both are needed and neither is sufficient.
 */
drop policy if exists leads_support_reassign_update on public.leads;
create policy leads_support_reassign_update on public.leads
  for update to limenzy_lead_support
  using (workspace_id = app.current_workspace_id())
  with check (workspace_id = app.current_workspace_id());

/*
 * THE ONE REAL WIDENING IN THIS MIGRATION, AND WHY IT IS NEEDED.
 *
 * 3B scoped this role to the ACTOR: it may read and lock the acting
 * member's own row and nobody else's, because locking your own row is all a
 * Lead write ever needed. Measured against that, every lock statement in the
 * routine below matched zero rows and the recipient lookup reported
 * "unknown_recipient" for a member who was plainly there — a silent no-op
 * that looked like working code.
 *
 * A transfer cannot be scoped that way. §163.10 requires the server to
 * validate an assignee it did not choose, and the §160 race requires a lock
 * on the recipient's row specifically. So the role gains workspace-scoped
 * reads and a workspace-scoped LOCK.
 *
 * Added as separate, named policies rather than by rewriting 3B's: those
 * stay exactly as narrow as they were, and what this capability needed is
 * legible on its own. The lock policy still carries WITH CHECK (false), so
 * the role can take a lock on any member of this workspace and can never
 * write one.
 */
/*
 * Workspace-scoped and NOTHING ELSE in the predicate.
 *
 * The obvious version — "and the caller is an active member" — queries
 * `workspace_memberships` from a policy ON `workspace_memberships`, and
 * PostgreSQL stops it with "infinite recursion detected in policy". Measured
 * the hard way. `workspace_lead_stages_support_select` has the same shape
 * for the same reason: the workspace comes from a session setting that
 * `withTenant()` writes from a verified context, and the caller's membership
 * is established by the routines, which check it before they read anything.
 */
drop policy if exists workspace_memberships_support_workspace_select
  on public.workspace_memberships;
create policy workspace_memberships_support_workspace_select
  on public.workspace_memberships
  for select to limenzy_lead_support
  using (workspace_id = app.current_workspace_id());

drop policy if exists workspace_memberships_support_workspace_lock
  on public.workspace_memberships;
create policy workspace_memberships_support_workspace_lock
  on public.workspace_memberships
  for update to limenzy_lead_support
  using (workspace_id = app.current_workspace_id())
  with check (false);

/*
 * Names, for members of this workspace only. §163.10's picker has to say who
 * somebody is; an id is not a choice anyone can make.
 */
drop policy if exists user_profiles_support_member_select
  on public.user_profiles;
create policy user_profiles_support_member_select
  on public.user_profiles
  for select to limenzy_lead_support
  using (
    exists (
      select 1 from public.workspace_memberships m
       where m.workspace_id = app.current_workspace_id()
         and m.user_profile_id = user_profiles.id
    )
  );

/*
 * History written by the routine is still written in the ACTOR's name. The
 * check mirrors `lead_activities_actor_insert` rather than relaxing it: a
 * privileged routine is not a reason for an entry to lose its author.
 */
drop policy if exists lead_activities_support_insert on public.lead_activities;
create policy lead_activities_support_insert on public.lead_activities
  for insert to limenzy_lead_support
  with check (
    workspace_id = app.current_workspace_id()
    and actor_user_profile_id = app.current_user_profile_id()
    and kind = 'owner_changed'::public.lead_activity_kind
    and exists (
      select 1 from public.leads l
       where l.workspace_id = lead_activities.workspace_id
         and l.id = lead_activities.lead_id
    )
  );

-- ---------------------------------------------------------------------------
-- §162's Change Record Owner, asked of the matrix rather than of the caller
-- ---------------------------------------------------------------------------
-- Temporary, revoked at the end of this file: a role cannot be given
-- ownership of a function in a schema it cannot create in. 3A, 3B and 3C do
-- the same for their own roles, for the same reason.
grant create on schema app to limenzy_lead_support;


-- ---------------------------------------------------------------------------
-- The completeness check must not depend on who is committing
-- ---------------------------------------------------------------------------
-- 3C's `require_history` trigger function is SECURITY INVOKER, and that held
-- for as long as every actor who changed a Lead could still see it
-- afterwards. A transfer breaks exactly that assumption: a Manager scoped to
-- their own records hands a Lead on, the Lead leaves their scope, the history
-- policy stops showing them the entry they just wrote — and the check, asking
-- through their eyes, concluded the entry was missing and aborted a correct
-- transaction. Measured, not predicted: 23514 at COMMIT, "changed with no
-- history entry for revision 2".
--
-- The question the check asks is whether an entry EXISTS, which is not a
-- question about the actor's record scope. So it runs as the support role,
-- which is given a read of the history for this purpose and nothing else.
grant select (workspace_id, lead_id, lead_revision, kind)
  on public.lead_activities to limenzy_lead_support;

/*
 * The second arm is for privileged connections — a migration or the tooling
 * role — which have no tenant context. Without it the check would report a
 * missing entry for any Lead changed outside a request, which is the same
 * false negative in a different disguise. No application caller can reach
 * that arm: `withTenant()` always sets the workspace.
 */
drop policy if exists lead_activities_support_completeness_select
  on public.lead_activities;
create policy lead_activities_support_completeness_select
  on public.lead_activities
  for select to limenzy_lead_support
  using (
    workspace_id = app.current_workspace_id()
    or app.current_workspace_id() is null
  );

/*
 * In the `app` schema, not `public`.
 *
 * A role must hold CREATE on a schema to own an object in it, and `public`
 * is Supabase's — granting CREATE there to give one trigger function a new
 * owner would be a far larger change than the problem deserves. `app` is
 * ours, and this file already takes and gives back CREATE on it for the
 * other routines. The body is 20261022090000's, unchanged; only its schema
 * and the role that runs it change.
 */
create or replace function app.leads_require_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $trg$
begin
  if not exists (
    select 1 from public.lead_activities a
     where a.workspace_id = new.workspace_id
       and a.lead_id = new.id
       and a.lead_revision = new.revision
       and a.kind <> 'note_added'::public.lead_activity_kind
  ) then
    raise exception 'lead % changed with no history entry for revision %',
      new.id, new.revision
      using errcode = '23514', constraint = 'lead_history_required';
  end if;
  return null;
end
$trg$;

alter function app.leads_require_history() owner to limenzy_lead_support;

/*
 * PUBLIC loses EXECUTE here as it does on every other routine this role
 * owns. PostgreSQL already refuses a direct call — `0A000: trigger
 * functions can only be called as triggers`, measured rather than assumed —
 * so this closes no open door today. It is here because the door is only
 * shut by what the function currently IS: rewrite it as an ordinary
 * function and the default grant would hand a definer routine to every
 * role at once. The sibling routines do not rely on that argument and
 * neither should this one.
 */
revoke all on function app.leads_require_history() from public;

/*
 * The trigger, repointed and widened in the same statement: it now also
 * fires when the Record Owner changes, which no role could write before
 * this migration. Without that the transfer would be the one material
 * change that owes no history entry.
 */
drop trigger if exists require_history on public.leads;
create constraint trigger require_history
  after update on public.leads
  deferrable initially deferred
  for each row
  when (
    old.name is distinct from new.name
    or old.phone is distinct from new.phone
    or old.phone_normalised is distinct from new.phone_normalised
    or old.phone_needs_review is distinct from new.phone_needs_review
    or old.email is distinct from new.email
    or old.email_normalised is distinct from new.email_normalised
    or old.notes is distinct from new.notes
    or old.source_id is distinct from new.source_id
    or old.stage_id is distinct from new.stage_id
    or old.lost_reason is distinct from new.lost_reason
    or old.lost_reason_note is distinct from new.lost_reason_note
    or old.record_owner_user_profile_id
         is distinct from new.record_owner_user_profile_id
  )
  execute function app.leads_require_history();

/* Nothing references the old one now. */
drop function if exists public.leads_require_history();

-- ALLOW for Owner/Admin, CONFIGURABLE for Manager, DENY for Staff/Sales —
-- §162, mirrored from `src/lib/permissions.ts`. SECURITY DEFINER owned by
-- `limenzy_lead_support` so it gives the same answer in both places it is
-- asked: inside the reassignment routine, and from the application.
--
-- An INVOKER function could not: called from a definer routine it would run
-- as that routine's owner, which holds no policy on `workspaces`, and would
-- quietly answer "no" for everyone.
create or replace function app.current_user_may_change_record_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_memberships m
      join public.user_profiles p on p.id = m.user_profile_id
      join public.workspaces w on w.id = m.workspace_id
     where m.workspace_id    = app.current_workspace_id()
       and m.user_profile_id = app.current_user_profile_id()
       and m.status          = 'active'::public.workspace_membership_status
       and p.auth_user_id    = app.current_auth_user_id()
       and (
         m.role = 'owner_admin'::public.workspace_role
         or (m.role = 'manager'::public.workspace_role
             and 'change_record_owner' = any (
               coalesce(w.permissions_granted, array[]::text[])))
       )
  )
$$;

alter function app.current_user_may_change_record_owner()
  owner to limenzy_lead_support;
revoke all on function app.current_user_may_change_record_owner() from public;
grant execute on function app.current_user_may_change_record_owner()
  to limenzy_app;

comment on function app.current_user_may_change_record_owner() is
  'Spec §162. Whether the acting user holds Change Record Owner: always for '
  'Owner/Admin, for a Manager only where the workspace granted it, never '
  'for Staff/Sales.';

-- ---------------------------------------------------------------------------
-- Who may be handed a Lead
-- ---------------------------------------------------------------------------
-- §163.10: "The assignee must be an active workspace user. The server
-- validates the assignee and never accepts it from the browser alone."
--
-- Restricted to callers who may actually reassign, and returning only what a
-- picker needs — an id and a name. A Manager scoped to their own records can
-- hold this permission, so this cannot be derived from record access the way
-- `app.workspace_member_names()` is; that one answers a different question
-- and gives such a Manager only their own name.
create or replace function app.assignable_member_names()
returns table (user_profile_id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name
    from public.workspace_memberships m
    join public.user_profiles p on p.id = m.user_profile_id
   where m.workspace_id = app.current_workspace_id()
     and m.status = 'active'::public.workspace_membership_status
     and app.current_user_may_change_record_owner()
   order by p.full_name, p.id
$$;

alter function app.assignable_member_names() owner to limenzy_lead_support;
revoke all on function app.assignable_member_names() from public;
grant execute on function app.assignable_member_names() to limenzy_app;

comment on function app.assignable_member_names() is
  'Spec §163.10. Active workspace members who may receive a manual Lead '
  'assignment, for callers who hold Change Record Owner. Empty for everyone '
  'else: it is a picker, not a directory.';

-- ---------------------------------------------------------------------------
-- The transfer itself
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
   */
  if not (app.current_user_may_access_all_records()
          or v_owner = app.current_user_profile_id()) then
    return query select 'not_permitted'::text, null::uuid;
    return;
  end if;

  /*
   * Choosing the current owner changes nothing and records nothing. Returned
   * as its own outcome so a caller can say so, rather than as a success that
   * silently wrote no history and would then fail the completeness check.
   */
  if p_new_owner = v_owner then
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
     and record_owner_user_profile_id = v_owner
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
  'Spec §26, §49, §162, §162.1, §163.10. Moves a Lead''s Record Owner to '
  'another active member, enforcing Change Record Owner independently of '
  'edit permission, and writing §163.13''s previous/new owner entry in the '
  'same transaction. Team-scoped rules are deferred, not implemented.';

revoke create on schema app from limenzy_lead_support;

-- ---------------------------------------------------------------------------
-- Verify rather than assume
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  -- The runtime role still cannot write the owner. This is the whole reason
  -- the routine exists, and the 3B test that pins it must keep passing.
  if has_column_privilege('limenzy_app', 'public.leads',
                          'record_owner_user_profile_id', 'UPDATE') then
    raise exception 'the runtime role can rewrite a Record Owner directly';
  end if;

  -- Exactly one column of it for the support role, and no other write.
  select count(*) into v_count
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'leads'
     and grantee = 'limenzy_lead_support'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if v_count <> 1 then
    raise exception 'the support role holds % write grant(s) on leads, expected 1',
      v_count;
  end if;

  -- The history stays append-only for everyone.
  if has_table_privilege('limenzy_lead_support', 'public.lead_activities',
                         'UPDATE')
     or has_table_privilege('limenzy_lead_support', 'public.lead_activities',
                            'DELETE')
  then
    raise exception 'the support role can rewrite lead history';
  end if;

  /*
   * The support role's workspace privileges, exactly: three columns it may
   * read, and ONE column it may nominally update — which exists only so a
   * row lock can be taken, and which the lock policy below refuses to let
   * it actually write.
   */
  select count(*) into v_count
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'workspaces'
     and grantee = 'limenzy_lead_support'
     and privilege_type = 'SELECT'
     and column_name in ('id', 'manager_record_scope', 'permissions_granted');
  if v_count <> 3 then
    raise exception 'the support role reads % workspace column(s), expected 3',
      v_count;
  end if;

  select count(*) into v_count
    from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'workspaces'
     and grantee = 'limenzy_lead_support'
     and privilege_type <> 'SELECT';
  if v_count <> 1 then
    raise exception 'the support role holds % workspace write grant(s), expected 1',
      v_count;
  end if;

  -- And that one is the harmless column, not an authority column.
  if not has_column_privilege('limenzy_lead_support', 'public.workspaces',
                              'time_zone', 'UPDATE')
     or has_column_privilege('limenzy_lead_support', 'public.workspaces',
                             'permissions_granted', 'UPDATE')
     or has_column_privilege('limenzy_lead_support', 'public.workspaces',
                             'manager_record_scope', 'UPDATE')
  then
    raise exception 'the support role can write a workspace authority column';
  end if;

  /*
   * THE PERMISSIVE-OR AUDIT.
   *
   * Permissive policies are OR'd, so `with check (false)` only restricts if
   * no OTHER update policy on this table applies to this role. Count every
   * update policy that does — by role list, and counting an unrestricted
   * policy (polroles containing 0, meaning PUBLIC) as applying. There must
   * be exactly one, and its WITH CHECK must be `false`.
   */
  select count(*) into v_count
    from pg_policy pol
   where pol.polrelid = 'public.workspaces'::regclass
     and pol.polcmd in ('w', '*')
     and (0 = any(pol.polroles)
          or 'limenzy_lead_support'::regrole::oid = any(pol.polroles));
  if v_count <> 1 then
    raise exception
      'the support role has % update policies on workspaces that could OR together, expected 1',
      v_count;
  end if;

  select count(*) into v_count
    from pg_policy pol
   where pol.polrelid = 'public.workspaces'::regclass
     and pol.polname = 'workspaces_support_lock'
     and pg_get_expr(pol.polwithcheck, pol.polrelid) = 'false';
  if v_count <> 1 then
    raise exception 'the workspace lock policy can write';
  end if;

  -- The completeness check now covers the owner, and is still deferred.
  select count(*) into v_count
    from pg_trigger
   where tgrelid = 'public.leads'::regclass and tgname = 'require_history'
     and tgdeferrable and tginitdeferred
     and pg_get_triggerdef(oid) like '%record_owner_user_profile_id%';
  if v_count <> 1 then
    raise exception 'the history check does not cover the Record Owner';
  end if;

  /*
   * Nothing for the Data API roles on the two tables whose grants this
   * migration changes. `workspaces` is deliberately NOT in the list: it
   * carries service_role grants from the database it was created in, which
   * predate this slice and are not this slice's to change. Row-level
   * security is forced there, and quietly revoking someone else's grant
   * inside a feature migration would be a behaviour change smuggled in
   * under a verification block.
   */
  select count(*) into v_count
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('leads', 'lead_activities')
     and grantee in ('anon', 'authenticated', 'service_role');
  if v_count <> 0 then
    raise exception 'the Data API roles hold % grant(s) on the Lead tables',
      v_count;
  end if;

  -- Both routines are the support role's, and EXECUTE is the app's alone.
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and p.proname in ('reassign_lead_owner',
                       'current_user_may_change_record_owner',
                       'assignable_member_names')
     and p.prosecdef
     and pg_get_userbyid(p.proowner) = 'limenzy_lead_support';
  if v_count <> 3 then
    raise exception 'expected three definer routines owned by the support role, found %',
      v_count;
  end if;

  -- No routine this role owns is executable by PUBLIC.
  /* grantee 0 is PUBLIC; a null ACL means the default, which includes it. */
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and pg_get_userbyid(p.proowner) = 'limenzy_lead_support'
     and (
       p.proacl is null
       or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
     );
  if v_count <> 0 then
    raise exception '% routine(s) of the support role are executable by PUBLIC',
      v_count;
  end if;

  -- The completeness check runs as the support role, not as whoever commits.
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'leads_require_history'
     and p.prosecdef
     and pg_get_userbyid(p.proowner) = 'limenzy_lead_support';
  if v_count <> 1 then
    raise exception 'the history check still depends on who is committing';
  end if;

  if to_regprocedure('public.leads_require_history()') is not null then
    raise exception 'the superseded history check is still present';
  end if;

  -- The workspace-scoped lock is still lock-only.
  select count(*) into v_count from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
   where pol.polname = 'workspace_memberships_support_workspace_lock'
     and pg_get_expr(pol.polwithcheck, pol.polrelid) = 'false';
  if v_count <> 1 then
    raise exception 'the workspace-scoped membership lock can write';
  end if;

  -- The temporary CREATE on the app schema was given back.
  if has_schema_privilege('limenzy_lead_support', 'app', 'CREATE') then
    raise exception 'the support role kept CREATE on the app schema';
  end if;

  -- §39's kinds gained exactly one.
  select count(*) into v_count
    from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'lead_activity_kind';
  if v_count <> 8 then
    raise exception 'expected eight activity kinds, found %', v_count;
  end if;
end
$$;
