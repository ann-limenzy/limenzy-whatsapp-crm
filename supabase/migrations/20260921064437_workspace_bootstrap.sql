-- Milestone 1C-C Phase 4C-1 — the initial-workspace bootstrap routine.
--
-- This is the first privileged write path in the application, and the only one.
-- Everything before it was read-only for the runtime role: Phase 2 gave
-- limenzy_app SELECT plus a column-scoped UPDATE on workspaces, and deliberately
-- no INSERT policy anywhere, so a brand-new verified user reaches
-- "onboarding_required" from Phase 4A and stops. This migration is what lets
-- them past that point — and nothing else.
--
-- THE SECURITY BOUNDARY
--
-- The obvious implementation would grant limenzy_app INSERT on the three tables
-- and add INSERT policies for it. That is rejected: an INSERT grant is permanent
-- and applies to every request the application ever makes, in exchange for a
-- path used exactly once per account. Instead:
--
--   * the write lives in ONE SECURITY DEFINER routine, app.create_initial_workspace;
--   * that routine is owned by limenzy_bootstrap — a NOLOGIN, NOBYPASSRLS role
--     reserved for this purpose since Phase 1, which owns nothing else and to
--     which nothing can connect;
--   * limenzy_app receives EXECUTE on that one function and NO new table
--     privilege of any kind. It still cannot INSERT into any of the three
--     tables, and a test proves it;
--   * limenzy_bootstrap itself is constrained by RLS (it is not the table
--     owner, and FORCE ROW LEVEL SECURITY applies to the owner besides), so
--     every statement the routine runs is filtered by the five narrow policies
--     below, all keyed on the verified identity in app.auth_user_id.
--
-- If the runtime credential leaks, the attacker gains the ability to call one
-- function that can only ever create a first workspace for whoever the
-- transaction says they are. They gain no ability to read, alter or delete any
-- existing row.
--
-- WHAT THE DATABASE DOES AND DOES NOT KNOW
--
-- PostgreSQL does not verify the Supabase JWT and has no way to know whether
-- app.auth_user_id reflects a real signature check. The server is responsible
-- for that: getClaims() verifies the token, and only then does trusted server
-- code set the transaction-local GUC. What the database enforces is
-- CONSISTENCY with that assertion — every policy below re-derives its decision
-- from app.current_auth_user_id() and stored rows, so a fault in the
-- application layer cannot create or attach a tenancy for a different user.
-- The foreign key from user_profiles.auth_user_id to auth.users remains the
-- backstop proving the asserted UUID belongs to a real account.
--
-- Neither existing migration is edited: supabase/migrations/ is the single
-- authoritative applied history (architecture-decisions §2.2). Corrections go
-- forward, in a new file.

-- ---------------------------------------------------------------------------
-- Ownership-transfer prerequisites
-- ---------------------------------------------------------------------------
-- Exactly the Phase 1 pattern, and necessary for the same two verified
-- reasons: `ALTER FUNCTION ... OWNER TO r` requires the executing role to be
-- able to SET ROLE to r ("must be able to SET ROLE", reproduced against this
-- database), and r must hold CREATE on the containing schema.
--
-- The membership is granted to the migration executor only. It is NEVER
-- granted to limenzy_app, which must not be able to become this role — proved
-- by a live test over a genuine runtime connection.
grant limenzy_bootstrap to current_user with set option;

-- Temporary: revoked at the end of this migration, once the function exists and
-- is owned. The final catalogue state shows USAGE without CREATE.
grant create on schema app to limenzy_bootstrap;
grant usage  on schema app to limenzy_bootstrap;

-- The routine reads the verified identity through the Phase 2 reader.
grant execute on function app.current_auth_user_id() to limenzy_bootstrap;

-- ---------------------------------------------------------------------------
-- Table privileges — the exact allow-list, nothing wider
-- ---------------------------------------------------------------------------
-- SELECT is needed to answer "do I already have a profile, and does it have an
-- active membership?". Note what is absent: no SELECT on workspaces (the
-- routine generates the id and never reads the row back), and no UPDATE or
-- DELETE anywhere.
grant select on public.user_profiles         to limenzy_bootstrap;
grant select on public.workspace_memberships to limenzy_bootstrap;

-- Column-scoped INSERT, mirroring the column-scoped UPDATE grant Phase 2 gave
-- limenzy_app. created_at and updated_at are the database's to set, so they are
-- not grantable here: an attempt to write one is refused by the grant, before
-- any policy is consulted.
grant insert (id, auth_user_id, full_name)
  on public.user_profiles to limenzy_bootstrap;
grant insert (id, name, business_type, country, currency, time_zone)
  on public.workspaces to limenzy_bootstrap;
grant insert (id, workspace_id, user_profile_id, role, status)
  on public.workspace_memberships to limenzy_bootstrap;

-- ---------------------------------------------------------------------------
-- Policies — five, all TO limenzy_bootstrap, all keyed on the verified GUC
-- ---------------------------------------------------------------------------
-- The four Phase 2 policies are untouched. Nothing here grants limenzy_app,
-- anon, authenticated, service_role, limenzy_owner or PUBLIC anything, and
-- there is no USING (true) and no WITH CHECK (true) below.

-- Read only my own profile. This is how "have I onboarded?" is answered, and
-- it cannot answer it about anybody else.
drop policy if exists user_profiles_bootstrap_select on public.user_profiles;
create policy user_profiles_bootstrap_select on public.user_profiles
  for select to limenzy_bootstrap
  using (auth_user_id = app.current_auth_user_id());

-- Create a profile for myself and no one else. The verified UUID is not a
-- parameter of the routine, so this predicate is the whole of the identity
-- decision.
drop policy if exists user_profiles_bootstrap_insert on public.user_profiles;
create policy user_profiles_bootstrap_insert on public.user_profiles
  for insert to limenzy_bootstrap
  with check (auth_user_id = app.current_auth_user_id());

-- Read only memberships belonging to my own profile.
drop policy if exists workspace_memberships_bootstrap_select on public.workspace_memberships;
create policy workspace_memberships_bootstrap_select on public.workspace_memberships
  for select to limenzy_bootstrap
  using (
    exists (
      select 1
        from public.user_profiles p
       where p.id = public.workspace_memberships.user_profile_id
         and p.auth_user_id = app.current_auth_user_id()
    )
  );

-- Create exactly one kind of membership: my own, as an active Owner/Admin.
-- Role and status are pinned in the predicate as well as in the routine, so a
-- future caller cannot mint a membership for another profile, another role, or
-- one that starts inactive.
drop policy if exists workspace_memberships_bootstrap_insert on public.workspace_memberships;
create policy workspace_memberships_bootstrap_insert on public.workspace_memberships
  for insert to limenzy_bootstrap
  with check (
    role = 'owner_admin'
    and status = 'active'
    and exists (
      select 1
        from public.user_profiles p
       where p.id = user_profile_id
         and p.auth_user_id = app.current_auth_user_id()
    )
  );

-- Workspaces carry no owning column, so there is nothing identity-shaped to key
-- this on; it requires only that a verified identity is present. That is not a
-- general write path, for three reasons: limenzy_bootstrap is NOLOGIN and
-- unreachable, the only way to run as it is the routine below, which refuses
-- unless the caller has no profile at all, and a workspace with no membership
-- is invisible to everyone — workspaces_member_select requires an active
-- membership. The claiming membership is inserted in the same transaction.
drop policy if exists workspaces_bootstrap_insert on public.workspaces;
create policy workspaces_bootstrap_insert on public.workspaces
  for insert to limenzy_bootstrap
  with check (app.current_auth_user_id() is not null);

-- ---------------------------------------------------------------------------
-- The routine
-- ---------------------------------------------------------------------------
-- Takes the six business fields from spec §7 Screen 1 and nothing else. It
-- accepts no Auth UUID, profile id, workspace id, membership id, role or
-- status: identity comes from the transaction, and role and status are
-- constants.
--
-- Returns one of three words and never an identifier. A caller learns only
-- about its own state; nothing distinguishes "that workspace exists" from "it
-- does not", because no workspace is ever named.
--
-- SECURITY DEFINER with an empty search_path and pg_catalog-qualified calls, so
-- no schema shadowing can change what it resolves to. No dynamic SQL: there is
-- no EXECUTE anywhere in the body, so no value can become part of a statement.
create or replace function app.create_initial_workspace(
  p_full_name      text,
  p_workspace_name text,
  p_business_type  text,
  p_country        text,
  p_currency       text,
  p_time_zone      text
)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $fn$
declare
  v_auth          uuid;
  v_profile_id    uuid;
  v_workspace_id  uuid;
  v_full_name     text;
  v_name          text;
  v_business_type text;
  v_country       text;
  v_currency      text;
  v_time_zone     text;
  v_active        integer;
begin
  -- 1/2. Identity, or nothing. NULL covers absent, empty and blank, because
  --      app.current_auth_user_id() maps '' to NULL; a non-empty malformed
  --      value raises on the cast rather than degrading into another identity.
  v_auth := app.current_auth_user_id();
  if v_auth is null then
    raise exception 'initial workspace: no verified identity in this transaction'
      using errcode = '28000';
  end if;

  -- Input normalisation, before the lock: a request that cannot succeed should
  -- not serialise anything. This is the database boundary's own backstop; the
  -- server validates first, and the UI validates before that.
  v_full_name     := pg_catalog.btrim(coalesce(p_full_name, ''));
  v_name          := pg_catalog.btrim(coalesce(p_workspace_name, ''));
  v_business_type := nullif(pg_catalog.btrim(coalesce(p_business_type, '')), '');
  v_country       := pg_catalog.btrim(coalesce(p_country, ''));
  v_currency      := pg_catalog.btrim(coalesce(p_currency, ''));
  v_time_zone     := pg_catalog.btrim(coalesce(p_time_zone, ''));

  if v_full_name = '' then
    raise exception 'initial workspace: full name is required' using errcode = '22023';
  end if;
  if v_name = '' then
    raise exception 'initial workspace: workspace name is required' using errcode = '22023';
  end if;
  if v_country = '' then
    raise exception 'initial workspace: country is required' using errcode = '22023';
  end if;
  if v_currency = '' then
    raise exception 'initial workspace: currency is required' using errcode = '22023';
  end if;
  if v_time_zone = '' then
    raise exception 'initial workspace: time zone is required' using errcode = '22023';
  end if;

  -- Control characters never belong in any of these, and a newline in a
  -- business name is far more likely to be an injection attempt against some
  -- later renderer than a real name.
  if v_full_name ~ '[[:cntrl:]]'
     or v_name ~ '[[:cntrl:]]'
     or coalesce(v_business_type, '') ~ '[[:cntrl:]]'
     or v_country ~ '[[:cntrl:]]'
     or v_currency ~ '[[:cntrl:]]'
     or v_time_zone ~ '[[:cntrl:]]' then
    raise exception 'initial workspace: a value contains control characters'
      using errcode = '22023';
  end if;

  -- 3. One first-onboarding at a time per verified user. Transaction-scoped, so
  --    it is released by COMMIT or ROLLBACK without any explicit unlock.
  --
  --    The key is a 64-bit hash of a 122-bit UUID, so a collision is possible in
  --    principle. If two different users ever collided, one would simply wait
  --    for the other — the key participates in no authorisation decision, all of
  --    which are made from app.current_auth_user_id() and stored rows. The lock
  --    is for clean serialisation; the correctness backstop is the unique
  --    constraint on user_profiles.auth_user_id.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('limenzy.bootstrap:' || v_auth::text, 0));

  -- 4. Only after the lock, so a concurrent caller cannot read "no profile"
  --    at the same moment as this one.
  select p.id into v_profile_id
    from public.user_profiles p
   where p.auth_user_id = v_auth;

  if v_profile_id is not null then
    select pg_catalog.count(*) into v_active
      from public.workspace_memberships m
     where m.user_profile_id = v_profile_id
       and m.status = 'active';

    -- 6. Already has access. Nothing is created, and no identifier is returned:
    --    the caller should resolve its context again, which is the only path
    --    permitted to hand out a workspace.
    if v_active > 0 then
      return 'already_onboarded';
    end if;

    -- 7. A profile with no active membership is NOT a new user. It is most
    --    likely someone deactivated everywhere (spec §159/§160 deactivate
    --    rather than delete), and creating them a fresh workspace would be a
    --    silent privilege grant. Inconsistent partial states land here too, and
    --    are for an administrator to repair, never for this routine to guess at.
    return 'access_unavailable';
  end if;

  -- 5. No profile: create the whole tenancy, atomically, in the caller's
  --    transaction.
  --
  --    Identifiers are generated here rather than read back with
  --    INSERT ... RETURNING, because RETURNING additionally applies the SELECT
  --    policy to the new row — and the workspace SELECT policy cannot match
  --    until the membership exists, which is one statement later. Generating
  --    them also means limenzy_bootstrap needs no SELECT on workspaces at all.
  v_profile_id   := pg_catalog.gen_random_uuid();
  v_workspace_id := pg_catalog.gen_random_uuid();

  insert into public.user_profiles (id, auth_user_id, full_name)
  values (v_profile_id, v_auth, v_full_name);

  insert into public.workspaces (id, name, business_type, country, currency, time_zone)
  values (v_workspace_id, v_name, v_business_type, v_country, v_currency, v_time_zone);

  -- Role and status are constants, not parameters and not defaults. The first
  -- member of a new workspace is its Owner/Admin (spec §2.1, §159), and the
  -- INSERT policy above re-checks both.
  insert into public.workspace_memberships (id, workspace_id, user_profile_id, role, status)
  values (pg_catalog.gen_random_uuid(), v_workspace_id, v_profile_id, 'owner_admin', 'active');

  return 'created';
end
$fn$;

alter function app.create_initial_workspace(text, text, text, text, text, text)
  owner to limenzy_bootstrap;

comment on function app.create_initial_workspace(text, text, text, text, text, text) is
  'Creates a verified user''s first profile, workspace and active Owner/Admin '
  'membership, atomically. SECURITY DEFINER as limenzy_bootstrap; identity is '
  'read from app.auth_user_id, never accepted as an argument. Returns created, '
  'already_onboarded or access_unavailable, and no identifier.';

-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default, so the
-- revoke must come first and must not be omitted on replay.
revoke all on function app.create_initial_workspace(text, text, text, text, text, text) from public;
grant execute on function app.create_initial_workspace(text, text, text, text, text, text) to limenzy_app;

-- anon, authenticated and service_role are not granted EXECUTE, and none of
-- them holds USAGE on schema app either, so the function is unreachable to all
-- three even if a future grant were made by mistake.

-- ---------------------------------------------------------------------------
-- Withdraw the temporary CREATE
-- ---------------------------------------------------------------------------
-- The function exists and is owned; limenzy_bootstrap never needs to create
-- anything again. USAGE remains so the routine can resolve app.* at call time.
revoke create on schema app from limenzy_bootstrap;

-- ---------------------------------------------------------------------------
-- Verify rather than assume
-- ---------------------------------------------------------------------------
-- Attribute drift on this role would be a silent escalation, so the migration
-- aborts instead of completing against a role that is no longer what Phase 1
-- created.
do $$
declare
  r record;
  f record;
begin
  select rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
    into r
    from pg_catalog.pg_roles
   where rolname = 'limenzy_bootstrap';

  if not found then
    raise exception 'limenzy_bootstrap is missing' using errcode = 'insufficient_privilege';
  end if;
  if r.rolcanlogin or r.rolsuper or r.rolbypassrls
     or r.rolcreatedb or r.rolcreaterole or r.rolreplication then
    raise exception
      'limenzy_bootstrap has unexpected attributes (login=% super=% bypassrls=% createdb=% createrole=% replication=%)',
      r.rolcanlogin, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole, r.rolreplication
      using errcode = 'insufficient_privilege';
  end if;

  -- The runtime role must not be able to become the bootstrap role.
  if exists (
    select 1
      from pg_catalog.pg_auth_members am
      join pg_catalog.pg_roles granted on granted.oid = am.roleid
      join pg_catalog.pg_roles member  on member.oid  = am.member
     where granted.rolname = 'limenzy_bootstrap'
       and member.rolname  = 'limenzy_app'
  ) then
    raise exception 'limenzy_app must not be a member of limenzy_bootstrap'
      using errcode = 'insufficient_privilege';
  end if;

  -- The temporary CREATE must be gone.
  if pg_catalog.has_schema_privilege('limenzy_bootstrap', 'app', 'CREATE') then
    raise exception 'limenzy_bootstrap still holds CREATE on schema app'
      using errcode = 'insufficient_privilege';
  end if;

  -- The routine must have the exact security shape this file describes.
  select p.prosecdef, p.provolatile::text, p.proparallel::text,
         pg_catalog.array_to_string(p.proconfig, ',') as cfg,
         pg_catalog.pg_get_userbyid(p.proowner) as owner
    into f
    from pg_catalog.pg_proc p
   where p.pronamespace = 'app'::regnamespace
     and p.proname = 'create_initial_workspace';

  if not found then
    raise exception 'app.create_initial_workspace is missing';
  end if;
  if not f.prosecdef or f.owner <> 'limenzy_bootstrap'
     or f.provolatile <> 'v' or f.proparallel <> 'u'
     or f.cfg is distinct from 'search_path=""' then
    raise exception
      'app.create_initial_workspace has the wrong security shape (owner=% secdef=% volatile=% parallel=% cfg=%)',
      f.owner, f.prosecdef, f.provolatile, f.proparallel, f.cfg
      using errcode = 'insufficient_privilege';
  end if;

  -- RLS must still be on, and still forced, on all three tables.
  if exists (
    select 1 from pg_catalog.pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relname in ('workspaces', 'user_profiles', 'workspace_memberships')
       and (not c.relrowsecurity or not c.relforcerowsecurity)
  ) then
    raise exception 'row level security is no longer enabled and forced on all three tables'
      using errcode = 'insufficient_privilege';
  end if;
end
$$;
