-- Milestone 2B — Settings → Users (§159) and User Deactivation (§160).
--
-- NOT APPLIED to the hosted project by the change that introduced it.
--
-- WHY THIS IS A ROUTINE AND NOT A POLICY
--
-- The obvious implementation is a co-member SELECT policy for limenzy_app:
-- "you may read a membership row when you hold an active owner_admin
-- membership in the same workspace". That predicate has to read
-- workspace_memberships to learn the reader's own role, and a policy on
-- workspace_memberships that reads workspace_memberships re-applies itself.
-- PostgreSQL detects that and raises 42P17, infinite recursion. There is no
-- way around it that keeps the decision in the policy: the existing
-- workspaces_member_select already reads memberships, so routing through
-- public.workspaces would close the same cycle one table further out.
--
-- So user management follows the boundary Phase 4C-1 already established for
-- the one privileged write path:
--
--   * the reads and writes live in THREE SECURITY DEFINER routines;
--   * they are owned by limenzy_members — a NOLOGIN, NOBYPASSRLS role created
--     here for this purpose, which owns nothing else and to which nothing can
--     connect;
--   * limenzy_members is itself constrained by RLS (it is not the table owner,
--     and FORCE ROW LEVEL SECURITY applies to the owner besides), so every
--     statement the routines run is filtered by the three narrow policies
--     below;
--   * limenzy_app receives EXECUTE on those three functions and NO new table
--     privilege of any kind. Its four existing policies are untouched, so
--     self-access behaves exactly as before.
--
-- The policies below are deliberately scoped only to "this workspace". They do
-- not re-check the caller's role, because that is what would recurse. The role
-- check lives in the routines instead, which is sound for the same three
-- reasons the bootstrap routine gives: limenzy_members is NOLOGIN and
-- unreachable, the only way to run as it is through these routines, and each
-- routine re-derives the caller's role from stored rows before it does
-- anything.
--
-- RECURSION, STATED PRECISELY
--
--   workspace_memberships_members_select  → references no table.  Terminates.
--   workspace_memberships_members_update  → references no table.  Terminates.
--   user_profiles_members_select          → reads workspace_memberships, whose
--                                           limenzy_members policy references
--                                           no table.  Terminates at depth 2.
--
-- No policy added here reads user_profiles, so the graph is acyclic. The four
-- limenzy_app policies are not edited and keep their own acyclic graph.
--
-- TRANSACTION AND ISOLATION ASSUMPTIONS
--
-- These routines are written for READ COMMITTED, which is PostgreSQL's
-- default and what the application's pool uses. Nothing sets a different
-- level, and the "at least one active Owner/Admin" rule depends on the
-- behaviour this level gives:
--
--   * each statement inside a VOLATILE function takes a fresh snapshot, so the
--     authorisation check at the top of a routine can be stale by the time the
--     locks are taken. That is why it is repeated immediately afterwards;
--   * SELECT ... FOR UPDATE blocks on a row another transaction has locked,
--     and once that transaction commits the row is RE-EVALUATED against the
--     WHERE clause. A membership that stopped being an active Owner/Admin
--     therefore drops out of both the lock set and the count. This
--     re-evaluation is what makes two concurrent demotions resolve correctly,
--     and it is specific to READ COMMITTED.
--
-- Under REPEATABLE READ or SERIALIZABLE that re-evaluation does not happen:
-- the locking statement raises 40001 (could not serialize access) instead.
-- That is SAFE — the transaction aborts and nothing is written — but it is a
-- different outcome, surfacing as an exception rather than as one of the words
-- these routines return. A genuine deadlock raises 40P01 and aborts likewise.
-- The gateway in src/server/auth/workspace-members.ts turns both into the
-- ordinary "unavailable" result, reveals no database detail, and does NOT
-- retry: a membership change is not idempotent from the caller's point of
-- view, and re-running one the person did not re-request is worse than asking
-- them to try again.
--
-- No routine here sets an isolation level, takes an advisory lock, or opens a
-- subtransaction. Each runs inside the single transaction withTenant() opened.
--
-- EMAIL IS NOT HERE
--
-- §159 lists Email in the Users table. It lives in auth.users, which has ROW
-- LEVEL SECURITY ENABLED WITH NO POLICIES and is owned by supabase_auth_admin.
-- A non-owner role therefore reads zero rows from it however it is granted.
-- Making it readable would need one of: membership of pg_read_all_data (read
-- every row in the database), BYPASSRLS (excluded by the Phase 1 role design),
-- or a new policy on Supabase's own auth.users. Each is a widening of
-- privilege well beyond one column, so none is done here. The decision is
-- recorded in docs/build-plan.md for a human to make.

begin;

-- ---------------------------------------------------------------------------
-- The role
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'limenzy_members') then
    create role limenzy_members
      nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
  end if;
end
$$;

comment on role limenzy_members is
  'Owns the Settings → Users routines (spec §159, §160) and nothing else. '
  'NOLOGIN, NOBYPASSRLS, not a table owner, so row-level security applies to '
  'it in full. Never granted to limenzy_app.';

-- Required to transfer ownership: ALTER FUNCTION ... OWNER TO r needs the
-- executing role to be able to SET ROLE to r. Granted to the migration
-- executor only, never to limenzy_app.
grant limenzy_members to current_user with set option;

-- Temporary: revoked at the end, once the routines exist and are owned.
grant create on schema app to limenzy_members;
grant usage  on schema app to limenzy_members;

grant execute on function app.current_auth_user_id()    to limenzy_members;
grant execute on function app.current_user_profile_id() to limenzy_members;
grant execute on function app.current_workspace_id()    to limenzy_members;

-- ---------------------------------------------------------------------------
-- Table privileges — the exact allow-list, nothing wider
-- ---------------------------------------------------------------------------
-- No INSERT anywhere: §159's Add User is not in this slice, and adding the
-- grant now would leave a write path nothing uses. No DELETE anywhere either —
-- §159 and §160 deactivate rather than delete, and the foreign keys restrict.
grant select on public.user_profiles         to limenzy_members;
grant select on public.workspace_memberships to limenzy_members;

-- Column-scoped, mirroring the column-scoped UPDATE limenzy_app holds on
-- workspaces. workspace_id and user_profile_id are deliberately absent: a
-- membership can never be moved to another workspace or another person.
grant update (role, status) on public.workspace_memberships to limenzy_members;

-- ---------------------------------------------------------------------------
-- Policies — three, all TO limenzy_members
-- ---------------------------------------------------------------------------
-- Nothing here grants limenzy_app, anon, authenticated, service_role,
-- limenzy_owner, limenzy_bootstrap or PUBLIC anything. There is no
-- USING (true) and no WITH CHECK (true).

-- Every membership of the selected workspace, and nothing outside it. This is
-- the cross-workspace boundary, and it is the whole of it: app.workspace_id is
-- set by trusted server code from a membership it re-resolved for the request.
drop policy if exists workspace_memberships_members_select on public.workspace_memberships;
create policy workspace_memberships_members_select on public.workspace_memberships
  for select to limenzy_members
  using (workspace_id = app.current_workspace_id());

-- The same rows, for writing. Role and status are the only grantable columns,
-- and WITH CHECK repeats the predicate so a row cannot be written out of the
-- workspace it was read from.
drop policy if exists workspace_memberships_members_update on public.workspace_memberships;
create policy workspace_memberships_members_update on public.workspace_memberships
  for update to limenzy_members
  using (workspace_id = app.current_workspace_id())
  with check (workspace_id = app.current_workspace_id());

-- Profiles of people who hold a membership in the selected workspace. Not all
-- profiles: someone who has never been a member of this workspace is invisible
-- here, which is what keeps a workspace from enumerating the product's users.
drop policy if exists user_profiles_members_select on public.user_profiles;
create policy user_profiles_members_select on public.user_profiles
  for select to limenzy_members
  using (
    exists (
      select 1
        from public.workspace_memberships m
       where m.user_profile_id = public.user_profiles.id
         and m.workspace_id = app.current_workspace_id()
    )
  );

-- ---------------------------------------------------------------------------
-- The authorization every routine repeats
-- ---------------------------------------------------------------------------
-- True only when the transaction's identity is an ACTIVE owner_admin of the
-- selected workspace, and the profile setting agrees with the authenticated
-- setting against stored data. The EXISTS over user_profiles is what ties the
-- two together: presenting someone else's profile id while holding your own
-- auth id matches nothing.
--
-- SECURITY INVOKER: it carries no privilege of its own and is only ever called
-- from inside a definer routine, where the current role is already
-- limenzy_members.
create or replace function app.current_user_is_owner_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from public.workspace_memberships m
      join public.user_profiles p on p.id = m.user_profile_id
     where m.workspace_id    = app.current_workspace_id()
       and m.user_profile_id = app.current_user_profile_id()
       and m.status          = 'active'::public.workspace_membership_status
       and m.role            = 'owner_admin'::public.workspace_role
       and p.auth_user_id    = app.current_auth_user_id()
  )
$$;

alter function app.current_user_is_owner_admin() owner to limenzy_owner;
revoke all on function app.current_user_is_owner_admin() from public;
grant execute on function app.current_user_is_owner_admin() to limenzy_members;

-- ---------------------------------------------------------------------------
-- 1. The list — §159
-- ---------------------------------------------------------------------------
-- Takes no arguments. The workspace comes from the transaction, so there is no
-- parameter through which a caller could ask about another one.
--
-- Returns no rows when the caller is not an active Owner/Admin. That is the
-- same refusal shape every read in this application uses: a policy that
-- matches nothing returns nothing, and the caller learns no more than that.
create or replace function app.workspace_members()
returns table (
  user_profile_id uuid,
  full_name       text,
  member_role     text,
  member_status   text,
  is_self         boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_profile_id,
         p.full_name,
         m.role::text,
         m.status::text,
         m.user_profile_id = app.current_user_profile_id()
    from public.workspace_memberships m
    join public.user_profiles p on p.id = m.user_profile_id
   where app.current_user_is_owner_admin()
   order by p.full_name, m.user_profile_id
$$;

-- ---------------------------------------------------------------------------
-- 2. Change Role — §159
-- ---------------------------------------------------------------------------
-- Returns a word, never an identifier:
--   ok                 the role was changed
--   not_permitted      the caller is not an active Owner/Admin here
--   unknown_member     no membership for that profile in this workspace
--   invalid_role       not one of the three §161 roles
--   last_owner_admin   the change would leave the workspace with none
create or replace function app.set_member_role(
  p_user_profile_id uuid,
  p_role            text
)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $fn$
declare
  v_ws            uuid;
  v_role          public.workspace_role;
  v_current_role  public.workspace_role;
  v_status        public.workspace_membership_status;
  v_owner_count   integer;
begin
  if not app.current_user_is_owner_admin() then
    return 'not_permitted';
  end if;

  v_ws := app.current_workspace_id();

  if p_role is null or p_role not in ('owner_admin', 'manager', 'staff_sales') then
    return 'invalid_role';
  end if;
  v_role := p_role::public.workspace_role;

  -- Serialise every decision about this workspace's Owner/Admins before
  -- reading the count. Two concurrent demotions would otherwise each see the
  -- other's row as still active and both succeed, leaving none.
  --
  -- ORDER BY is not cosmetic. FOR UPDATE locks rows in the order the plan
  -- returns them, so without a total order two callers can take the same two
  -- rows in opposite orders and deadlock. Ordering by user_profile_id makes
  -- every caller queue behind the other instead.
  --
  -- Under READ COMMITTED the second transaction re-evaluates these rows once
  -- the first commits, so a row that stopped being an active Owner/Admin drops
  -- out of the lock set and out of the count below. That re-evaluation is the
  -- whole mechanism; the count is taken only after the locks are held.
  perform 1
     from public.workspace_memberships
    where workspace_id = v_ws
      and role   = 'owner_admin'::public.workspace_role
      and status = 'active'::public.workspace_membership_status
    order by user_profile_id
      for update;

  -- Re-check the CALLER, now that the locks are held.
  --
  -- The check at the top of this routine read an earlier snapshot: each
  -- statement in a VOLATILE function takes a fresh one under READ COMMITTED,
  -- so a concurrent transaction can demote or deactivate the caller between
  -- that check and this lock. When it does, the caller's row drops out of the
  -- lock set and the caller never blocks — leaving the first decision in force
  -- for a mutation it no longer authorises.
  --
  -- After this point the answer is stable for the rest of the transaction: a
  -- caller who is still an active Owner/Admin holds a lock on their own row,
  -- so nothing can change it until this transaction ends.
  if not app.current_user_is_owner_admin() then
    return 'not_permitted';
  end if;

  select m.role, m.status into v_current_role, v_status
    from public.workspace_memberships m
   where m.workspace_id    = v_ws
     and m.user_profile_id = p_user_profile_id
     for update;

  if not found then
    return 'unknown_member';
  end if;

  if v_current_role = v_role then
    return 'ok';
  end if;

  select count(*) into v_owner_count
    from public.workspace_memberships
   where workspace_id = v_ws
     and role   = 'owner_admin'::public.workspace_role
     and status = 'active'::public.workspace_membership_status;

  -- §159: at least one active Owner/Admin must remain. This covers the caller
  -- demoting themselves, which §159 permits only while someone else remains.
  if v_current_role = 'owner_admin'::public.workspace_role
     and v_status   = 'active'::public.workspace_membership_status
     and v_owner_count <= 1 then
    return 'last_owner_admin';
  end if;

  update public.workspace_memberships
     set role = v_role
   where workspace_id    = v_ws
     and user_profile_id = p_user_profile_id;

  return 'ok';
end
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Deactivate and Reactivate — §160
-- ---------------------------------------------------------------------------
-- Changes THIS workspace's membership only. The person's account and any
-- membership of another workspace are untouched, and nothing is deleted:
-- §159 and §160 deactivate rather than delete so history keeps the name.
--
-- The §160 reassignment precondition is NOT enforced here. It cannot be: none
-- of the five record types it names — Leads, Customers, incomplete Follow-ups,
-- Renewal actions, open WhatsApp conversations — exists as a table yet, so
-- there is nothing a predicate could count. A check that passed because there
-- is nothing to check would keep passing silently once those tables arrive,
-- which is the failure mode worth preventing. The registry in
-- src/server/auth/deactivation-responsibilities.ts holds the list, and a test
-- fails the build when a new table appears without a decision about it.
create or replace function app.set_member_status(
  p_user_profile_id uuid,
  p_status          text
)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $fn$
declare
  v_ws           uuid;
  v_status       public.workspace_membership_status;
  v_current      public.workspace_membership_status;
  v_role         public.workspace_role;
  v_owner_count  integer;
begin
  if not app.current_user_is_owner_admin() then
    return 'not_permitted';
  end if;

  v_ws := app.current_workspace_id();

  if p_status is null or p_status not in ('active', 'inactive') then
    return 'invalid_status';
  end if;
  v_status := p_status::public.workspace_membership_status;

  perform 1
     from public.workspace_memberships
    where workspace_id = v_ws
      and role   = 'owner_admin'::public.workspace_role
      and status = 'active'::public.workspace_membership_status
    order by user_profile_id
      for update;

  -- Re-check the CALLER, now that the locks are held.
  --
  -- The check at the top of this routine read an earlier snapshot: each
  -- statement in a VOLATILE function takes a fresh one under READ COMMITTED,
  -- so a concurrent transaction can demote or deactivate the caller between
  -- that check and this lock. When it does, the caller's row drops out of the
  -- lock set and the caller never blocks — leaving the first decision in force
  -- for a mutation it no longer authorises.
  --
  -- After this point the answer is stable for the rest of the transaction: a
  -- caller who is still an active Owner/Admin holds a lock on their own row,
  -- so nothing can change it until this transaction ends.
  if not app.current_user_is_owner_admin() then
    return 'not_permitted';
  end if;

  select m.status, m.role into v_current, v_role
    from public.workspace_memberships m
   where m.workspace_id    = v_ws
     and m.user_profile_id = p_user_profile_id
     for update;

  if not found then
    return 'unknown_member';
  end if;

  if v_current = v_status then
    return 'ok';
  end if;

  select count(*) into v_owner_count
    from public.workspace_memberships
   where workspace_id = v_ws
     and role   = 'owner_admin'::public.workspace_role
     and status = 'active'::public.workspace_membership_status;

  -- §160: the last active Owner/Admin cannot be deactivated.
  if v_status = 'inactive'::public.workspace_membership_status
     and v_role = 'owner_admin'::public.workspace_role
     and v_current = 'active'::public.workspace_membership_status
     and v_owner_count <= 1 then
    return 'last_owner_admin';
  end if;

  update public.workspace_memberships
     set status = v_status
   where workspace_id    = v_ws
     and user_profile_id = p_user_profile_id;

  return 'ok';
end
$fn$;

-- ---------------------------------------------------------------------------
-- Ownership and execution
-- ---------------------------------------------------------------------------
alter function app.workspace_members()                 owner to limenzy_members;
alter function app.set_member_role(uuid, text)         owner to limenzy_members;
alter function app.set_member_status(uuid, text)       owner to limenzy_members;

comment on function app.workspace_members() is
  'Spec §159 Users list for the selected workspace. SECURITY DEFINER as '
  'limenzy_members; the workspace comes from app.workspace_id, never from an '
  'argument. Returns no rows unless the caller is an active Owner/Admin. '
  'Email is not returned — see the migration header.';
comment on function app.set_member_role(uuid, text) is
  'Spec §159 Change Role. Returns ok, not_permitted, unknown_member, '
  'invalid_role or last_owner_admin, and never an identifier.';
comment on function app.set_member_status(uuid, text) is
  'Spec §160 Deactivate and Reactivate, for this workspace membership only. '
  'Returns ok, not_permitted, unknown_member, invalid_status or '
  'last_owner_admin, and never an identifier.';

-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default, so the
-- revoke must come first and must not be omitted on replay.
revoke all on function app.workspace_members()           from public;
revoke all on function app.set_member_role(uuid, text)   from public;
revoke all on function app.set_member_status(uuid, text) from public;

grant execute on function app.workspace_members()           to limenzy_app;
grant execute on function app.set_member_role(uuid, text)   to limenzy_app;
grant execute on function app.set_member_status(uuid, text) to limenzy_app;

-- The routines exist and are owned; limenzy_members never creates anything
-- again. USAGE remains so they can resolve app.* at call time.
revoke create on schema app from limenzy_members;

-- ---------------------------------------------------------------------------
-- Verify rather than assume
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  -- The new role must have none of the dangerous attributes.
  perform 1 from pg_catalog.pg_roles
   where rolname = 'limenzy_members'
     and (rolsuper or rolbypassrls or rolcreatedb or rolcreaterole
          or rolreplication or rolcanlogin);
  if found then
    raise exception 'limenzy_members has unexpected attributes';
  end if;

  -- limenzy_app must not be able to become limenzy_members.
  select count(*) into v_count
    from pg_catalog.pg_auth_members am
    join pg_catalog.pg_roles granted on granted.oid = am.roleid
    join pg_catalog.pg_roles grantee on grantee.oid = am.member
   where granted.rolname = 'limenzy_members'
     and grantee.rolname = 'limenzy_app';
  if v_count <> 0 then
    raise exception 'limenzy_app is a member of limenzy_members';
  end if;

  -- limenzy_app must have gained no new table privilege on memberships.
  select count(*) into v_count
    from information_schema.table_privileges
   where grantee = 'limenzy_app' and table_schema = 'public'
     and table_name = 'workspace_memberships'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  if v_count <> 0 then
    raise exception 'limenzy_app gained a write privilege on workspace_memberships';
  end if;

  -- Neither limenzy_app nor limenzy_members may reach auth.users.
  if has_schema_privilege('limenzy_app', 'auth', 'USAGE')
     or has_schema_privilege('limenzy_members', 'auth', 'USAGE') then
    raise exception 'a limenzy role holds USAGE on schema auth';
  end if;

  -- The four Phase 2 policies must still be present and untouched.
  select count(*) into v_count
    from pg_catalog.pg_policy
   where polname in ('user_profiles_self_select',
                     'workspace_memberships_self_select',
                     'workspaces_member_select',
                     'workspaces_owner_admin_update');
  if v_count <> 4 then
    raise exception 'the Phase 2 policies are not all present (found %)', v_count;
  end if;
end
$$;

commit;
