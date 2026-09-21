-- Milestone 1C-C Phase 2 — context readers, RLS policies, runtime grants and
-- FORCE ROW LEVEL SECURITY.
--
-- Phase 1 established the roles and moved ownership to limenzy_owner. This
-- migration is what turns deny-everything into actual tenant scoping for the
-- runtime role, and nothing more:
--
--   * three tiny functions that read transaction-local settings;
--   * the minimum grants those policies need to function;
--   * restrictive SELECT/UPDATE policies scoped TO limenzy_app;
--   * FORCE ROW LEVEL SECURITY on all three tables.
--
-- Deliberately NOT here: the initial-workspace routine, any application
-- database client, withTenant(), the workspace-context resolver, /setup and
-- workspace selection. Those are later phases. In particular, nothing yet
-- SETS the three settings — Phase 4 does that with transaction-local
-- set_config(..., true). Until then every policy below evaluates against NULL
-- and therefore denies, which is the correct resting state.
--
-- Neither existing migration is edited: supabase/migrations/ is the single
-- authoritative applied history (architecture-decisions §2.2).

-- ---------------------------------------------------------------------------
-- Context readers
-- ---------------------------------------------------------------------------
-- Each reads exactly one setting and converts it to uuid. Three properties
-- matter and are asserted by test:
--
--   * `current_setting(name, true)` returns NULL rather than raising when the
--     setting is absent, so an unset context yields NULL, every comparison
--     yields NULL, and no row is visible. Fail-closed by construction.
--   * `nullif(..., '')` maps an empty string to NULL, so a blank setting is
--     treated as absent rather than as a cast error.
--   * a malformed, non-empty value raises `invalid input syntax for type uuid`
--     and aborts the statement. That is deliberate: a bad identity must fail
--     loudly, never silently degrade into some other identity.
--
-- STABLE, not IMMUTABLE: the value can differ between statements in a
-- transaction, and marking it IMMUTABLE would let the planner fold it away.
-- SECURITY INVOKER: these carry no privilege of their own.
-- `search_path = ''` with pg_catalog-qualified calls, so no schema shadowing
-- can change what they resolve to.

create or replace function app.current_auth_user_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting('app.auth_user_id', true), '')::uuid
$$;

create or replace function app.current_user_profile_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting('app.user_profile_id', true), '')::uuid
$$;

create or replace function app.current_workspace_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(pg_catalog.current_setting('app.workspace_id', true), '')::uuid
$$;

alter function app.current_auth_user_id()     owner to limenzy_owner;
alter function app.current_user_profile_id()  owner to limenzy_owner;
alter function app.current_workspace_id()     owner to limenzy_owner;

comment on function app.current_auth_user_id() is
  'Verified Supabase auth user id for this transaction, or NULL. Fails closed.';
comment on function app.current_user_profile_id() is
  'Resolved user_profiles.id for this transaction, or NULL. Fails closed.';
comment on function app.current_workspace_id() is
  'Selected workspace id for this transaction, or NULL. Fails closed.';

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, so each one
-- needs an explicit revoke before anything is granted back.
revoke all on function app.current_auth_user_id()    from public;
revoke all on function app.current_user_profile_id() from public;
revoke all on function app.current_workspace_id()    from public;

-- The trigger functions from 1C-B carry the same default, and additionally
-- picked up explicit anon/authenticated/service_role grants from Supabase's
-- own ALTER DEFAULT PRIVILEGES at the moment they were created (before Phase 1
-- narrowed the defaults). PUBLIC and the two browser-reachable roles are
-- revoked here.
--
-- This does not affect the triggers: PostgreSQL checks EXECUTE when a trigger
-- is CREATED, not each time it fires, and a calling role gains nothing anyway —
-- invoking a trigger function directly raises "trigger functions can only be
-- called as triggers". A test proves updated_at still advances afterwards.
--
-- service_role is left alone deliberately: it is Supabase's, it already holds
-- BYPASSRLS, and removing a privilege it never exercises here would be churn
-- rather than hardening.
revoke all on function public.set_updated_at()              from public;
revoke all on function public.assert_valid_iana_time_zone() from public;
revoke execute on function public.set_updated_at()              from anon, authenticated;
revoke execute on function public.assert_valid_iana_time_zone() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Runtime grants — the minimum the policies below require
-- ---------------------------------------------------------------------------
-- A policy filters rows; a GRANT authorises the operation. Both are needed, and
-- neither implies the other, so these are deliberately narrow.
grant usage on schema app to limenzy_app;          -- USAGE only, never CREATE

grant execute on function app.current_auth_user_id()    to limenzy_app;
grant execute on function app.current_user_profile_id() to limenzy_app;
grant execute on function app.current_workspace_id()    to limenzy_app;

-- Read-only for identity and membership.
grant select on public.user_profiles         to limenzy_app;
grant select on public.workspace_memberships to limenzy_app;

-- Workspaces: read, plus column-scoped update of the settings fields only.
-- `id` and `created_at` are immutable, and `updated_at` belongs to the trigger,
-- so none of the three is grantable here. This is an independent layer from the
-- policies: even a mistaken policy cannot write a column that was never granted.
grant select on public.workspaces to limenzy_app;
grant update (name, business_type, country, currency, time_zone)
  on public.workspaces to limenzy_app;

-- ---------------------------------------------------------------------------
-- Policies — all scoped TO limenzy_app
-- ---------------------------------------------------------------------------
-- No policy is created for limenzy_bootstrap in this phase: the
-- initial-workspace routine is Phase 3, and granting it access now would widen
-- the surface before anything uses it.
--
-- There is no USING (true), no WITH CHECK (true), no SECURITY DEFINER helper,
-- no service-role logic and no browser JWT function anywhere below.

-- user_profiles: a person sees exactly their own profile row, keyed on the
-- authenticated identity. This is the base of the dependency graph and
-- references no other table.
drop policy if exists user_profiles_self_select on public.user_profiles;
create policy user_profiles_self_select on public.user_profiles
  for select to limenzy_app
  using (auth_user_id = app.current_auth_user_id());

-- workspace_memberships: a person sees only their own membership rows, and the
-- profile GUC must agree with the authenticated GUC against stored data. The
-- EXISTS is what ties the two settings together: presenting someone else's
-- profile id while holding your own auth id matches nothing.
--
-- The subquery reads user_profiles, whose own policy references only the
-- context readers, so evaluation terminates. It is not self-referential.
drop policy if exists workspace_memberships_self_select on public.workspace_memberships;
create policy workspace_memberships_self_select on public.workspace_memberships
  for select to limenzy_app
  using (
    user_profile_id = app.current_user_profile_id()
    and exists (
      select 1
        from public.user_profiles p
       where p.id = public.workspace_memberships.user_profile_id
         and p.auth_user_id = app.current_auth_user_id()
    )
  );

-- workspaces: the selected workspace only, and only while an active membership
-- for the current profile exists. The membership subquery is itself filtered by
-- the policy above, so the identity-consistency check applies transitively.
drop policy if exists workspaces_member_select on public.workspaces;
create policy workspaces_member_select on public.workspaces
  for select to limenzy_app
  using (
    id = app.current_workspace_id()
    and exists (
      select 1
        from public.workspace_memberships m
       where m.workspace_id = public.workspaces.id
         and m.user_profile_id = app.current_user_profile_id()
         and m.status = 'active'
    )
  );

-- Only an active owner_admin of the current workspace may update it, checked
-- both on the row being read and on the row being written.
drop policy if exists workspaces_owner_admin_update on public.workspaces;
create policy workspaces_owner_admin_update on public.workspaces
  for update to limenzy_app
  using (
    id = app.current_workspace_id()
    and exists (
      select 1
        from public.workspace_memberships m
       where m.workspace_id = public.workspaces.id
         and m.user_profile_id = app.current_user_profile_id()
         and m.status = 'active'
         and m.role = 'owner_admin'
    )
  )
  with check (
    id = app.current_workspace_id()
    and exists (
      select 1
        from public.workspace_memberships m
       where m.workspace_id = public.workspaces.id
         and m.user_profile_id = app.current_user_profile_id()
         and m.status = 'active'
         and m.role = 'owner_admin'
    )
  );

-- No INSERT or DELETE policy on any of the three tables, and no UPDATE policy
-- on user_profiles or workspace_memberships. With no policy present the
-- operation is refused outright — self-escalation and arbitrary membership
-- creation are impossible by construction rather than by predicate.

-- ---------------------------------------------------------------------------
-- FORCE ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
-- Applies the policies to the table OWNER as well. Without it, limenzy_owner
-- would be exempt from its own tables, so a misconfiguration that connected the
-- application as the owner would silently lose all row filtering.
--
-- Stated accurately: FORCE does NOT constrain a superuser, nor a role with
-- BYPASSRLS. Locally `postgres` holds BYPASSRLS and continues to see
-- everything, which is what lets migrations and tooling work. The guarantee for
-- the application comes from limenzy_app being a non-owner, non-superuser,
-- NOBYPASSRLS role — asserted by test.
alter table public.workspaces            force row level security;
alter table public.user_profiles         force row level security;
alter table public.workspace_memberships force row level security;
