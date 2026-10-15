-- Milestone 2B follow-up — expose auth_user_id from the Users routine.
--
-- NOT APPLIED to the hosted project by the change that introduced it.
--
-- A separate migration from 20261016090000, which is already committed and
-- whose history row is recorded. Corrections and additions go forward in a new
-- file (architecture-decisions §2.2).
--
-- WHY
--
-- §159 lists Email. It lives in auth.users, which has row-level security
-- enabled with no policies, so no database role this project can create is
-- able to read it: `postgres` holds USAGE on schema auth WITHOUT grant option
-- and cannot pass it on, and it is not a member of the schema owner. The
-- database route is closed, and widening privileges to force it open was
-- refused.
--
-- The addresses are therefore read server-side through Supabase's Auth Admin
-- API, one user at a time, by src/server/auth/member-emails.ts. That helper
-- needs the AUTH user id, and this routine previously returned only the
-- profile id. This migration adds `auth_user_id` to its result and changes
-- nothing else.
--
-- WHAT THIS DOES NOT CHANGE
--
--   * no new role, no new grant to any existing role, no new policy;
--   * the authorisation is still app.current_user_is_owner_admin(), evaluated
--     inside the routine against stored rows;
--   * the rows are still filtered to app.workspace_id by the limenzy_members
--     policies the routine runs under;
--   * limenzy_app still holds EXECUTE on this routine and nothing else.
--
-- auth_user_id is an identifier, not a credential, and it stays on the server:
-- the Settings page uses it to look an address up and passes only display data
-- to the browser. A test asserts the client component never receives it.
--
-- The column is NULLABLE because public.user_profiles.auth_user_id is: the
-- Auth account may have been deleted while the profile survives so history
-- keeps the person's name. Such a member is still listed, with no address.

begin;

-- The return type gains a column, which CREATE OR REPLACE cannot do, so the
-- function is dropped and recreated. Ownership and the exact EXECUTE grants
-- are restored below — a dropped function takes its ACL with it, and
-- PostgreSQL grants EXECUTE on a NEW function to PUBLIC by default, so
-- omitting either step would silently widen access.
--
-- limenzy_members needs CREATE on schema app again for the ownership
-- transfer; 20261016090000 withdrew it once its routines were in place, and
-- this file withdraws it again at the end.
grant create on schema app to limenzy_members;

drop function if exists app.workspace_members();

create or replace function app.workspace_members()
returns table (
  user_profile_id uuid,
  auth_user_id    uuid,
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
         p.auth_user_id,
         p.full_name,
         m.role::text,
         m.status::text,
         m.user_profile_id = app.current_user_profile_id()
    from public.workspace_memberships m
    join public.user_profiles p on p.id = m.user_profile_id
   where app.current_user_is_owner_admin()
   order by p.full_name, m.user_profile_id
$$;

alter function app.workspace_members() owner to limenzy_members;

comment on function app.workspace_members() is
  'Spec §159 Users list for the selected workspace, including each member''s '
  'auth user id so the server can look their address up through the Auth '
  'Admin API. SECURITY DEFINER as limenzy_members; the workspace comes from '
  'app.workspace_id, never from an argument. Returns no rows unless the '
  'caller is an active Owner/Admin. auth_user_id is null when the Auth '
  'account was deleted and the profile was kept for history.';

-- Restore the exact grants the dropped function had: PUBLIC revoked first,
-- then EXECUTE to limenzy_app alone.
revoke all on function app.workspace_members() from public;
grant execute on function app.workspace_members() to limenzy_app;

revoke create on schema app from limenzy_members;

-- ---------------------------------------------------------------------------
-- Verify rather than assume
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  -- The routine is owned by the reserved role and is still a definer.
  perform 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'workspace_members'
     and p.prosecdef
     and pg_catalog.pg_get_userbyid(p.proowner) = 'limenzy_members';
  if not found then
    raise exception 'app.workspace_members() is not a definer owned by limenzy_members';
  end if;

  -- Exactly one EXECUTE grantee, and it is the runtime role. PUBLIC is not it.
  if not has_function_privilege('limenzy_app', 'app.workspace_members()', 'EXECUTE') then
    raise exception 'limenzy_app cannot execute app.workspace_members()';
  end if;
  if has_function_privilege('public', 'app.workspace_members()', 'EXECUTE') then
    raise exception 'PUBLIC can execute app.workspace_members()';
  end if;
  for v_count in
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) as r(name)
     where has_function_privilege(r.name, 'app.workspace_members()', 'EXECUTE')
  loop
    raise exception 'a Data API role can execute app.workspace_members()';
  end loop;

  -- limenzy_members must not keep CREATE on schema app.
  if has_schema_privilege('limenzy_members', 'app', 'CREATE') then
    raise exception 'limenzy_members still holds CREATE on schema app';
  end if;

  -- No role gained a reach into auth as a side effect of this file.
  if has_schema_privilege('limenzy_app', 'auth', 'USAGE')
     or has_schema_privilege('limenzy_members', 'auth', 'USAGE') then
    raise exception 'a limenzy role holds USAGE on schema auth';
  end if;

  -- The Milestone 2B policies are untouched.
  select count(*) into v_count
    from pg_catalog.pg_policy
   where polname in ('workspace_memberships_members_select',
                     'workspace_memberships_members_update',
                     'user_profiles_members_select');
  if v_count <> 3 then
    raise exception 'the Milestone 2B policies are not all present (found %)', v_count;
  end if;
end
$$;

commit;
