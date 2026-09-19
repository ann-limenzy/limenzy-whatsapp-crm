-- Milestone 1C-C Phase 1 — database roles and object ownership.
--
-- Establishes the role separation that every later phase depends on. It adds
-- NO policies, NO helper functions, NO data access and NO application
-- behaviour: after this migration the three foundation tables are exactly as
-- deny-by-default as they were before it, and that is asserted by test.
--
-- Why this is a new file rather than an edit to
-- 20260919045005_workspace_foundation.sql: `supabase/migrations/` is the single
-- authoritative applied history (architecture-decisions §2.2). An applied
-- migration is never edited.
--
-- ROLE MODEL (design §4)
--
--   limenzy_owner      owns the CRM objects; NOLOGIN, never connects
--   limenzy_bootstrap  will own the initial-workspace function in Phase 3;
--                      owns nothing and has no grants yet
--   limenzy_app        the application's only connection; non-owner,
--                      NOBYPASSRLS, created NOLOGIN here and given a
--                      local-only password by `npm run db:role:local`
--
-- None of the three is a superuser, none has BYPASSRLS, and none may create
-- databases or roles. The migration executor (`postgres` locally) keeps its
-- own capabilities; this migration does not change them.

-- ---------------------------------------------------------------------------
-- Roles (idempotent: roles are cluster-wide and may survive `db:reset`)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'limenzy_owner') then
    create role limenzy_owner
      nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'limenzy_bootstrap') then
    create role limenzy_bootstrap
      nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'limenzy_app') then
    -- LOGIN is granted separately by `npm run db:role:local`, which also sets a
    -- local-only password. No password is ever written into a migration.
    create role limenzy_app
      nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
  end if;
end
$$;

-- Verify the attributes rather than re-asserting them.
--
-- `ALTER ROLE ... NOSUPERUSER` is refused unless the executor is itself a
-- superuser ("Only roles with the SUPERUSER attribute may alter roles with the
-- SUPERUSER attribute"), and the local Supabase `postgres` role is not one —
-- verified against this database. Silently skipping the check would be worse
-- than failing, so a drifted attribute aborts the migration instead.
--
-- LOGIN is deliberately not checked: provisioning grants it, and re-running
-- this migration must not revoke a working local login.
do $$
declare
  r record;
begin
  for r in
    select rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
      from pg_catalog.pg_roles
     where rolname in ('limenzy_owner', 'limenzy_bootstrap', 'limenzy_app')
  loop
    if r.rolsuper or r.rolbypassrls or r.rolcreatedb
       or r.rolcreaterole or r.rolreplication then
      raise exception
        'role % has unexpected attributes (super=% bypassrls=% createdb=% createrole=% replication=%)',
        r.rolname, r.rolsuper, r.rolbypassrls, r.rolcreatedb,
        r.rolcreaterole, r.rolreplication
        using errcode = 'insufficient_privilege';
    end if;
  end loop;

  if (select count(*) from pg_catalog.pg_roles
       where rolname in ('limenzy_owner', 'limenzy_bootstrap', 'limenzy_app')) <> 3 then
    raise exception 'expected all three CRM roles to exist';
  end if;
end
$$;

comment on role limenzy_owner is
  'Owns the CRM schema objects. NOLOGIN: it never connects.';
comment on role limenzy_bootstrap is
  'Reserved owner of the Phase-3 initial-workspace function. Owns nothing yet.';
comment on role limenzy_app is
  'The application runtime connection. Non-owner, NOBYPASSRLS, RLS applies in full.';

-- ---------------------------------------------------------------------------
-- Ownership transfer prerequisites
-- ---------------------------------------------------------------------------
-- `ALTER ... OWNER TO r` requires the executing role to be able to SET ROLE to
-- r. PostgreSQL 16 split role membership into MEMBER / SET / ADMIN, and a
-- CREATEROLE creator does not receive SET implicitly — verified against this
-- database, where the transfer fails with "must be able to SET ROLE" without
-- the grant below.
grant limenzy_owner to current_user with set option;

-- `ALTER ... OWNER TO r` also requires r to hold CREATE on the containing
-- schema — likewise verified: without this the transfer fails with "permission
-- denied for schema public". limenzy_owner is NOLOGIN, so this privilege is
-- reachable only by a role that can already SET ROLE to it, i.e. the migration
-- executor. The application roles receive CREATE nowhere.
grant create on schema public to limenzy_owner;

-- ---------------------------------------------------------------------------
-- Schema app — home of the Phase-2 context readers and the Phase-3 routine
-- ---------------------------------------------------------------------------
-- Deliberately not `public`: supabase/config.toml exposes only
-- ["public", "graphql_public"] through PostgREST, so nothing placed in `app`
-- is reachable through the Data API.
create schema if not exists app authorization limenzy_owner;

comment on schema app is
  'CRM tenant-security internals. Not exposed through PostgREST.';

-- Nothing exists in `app` yet, so nothing is granted on it yet. USAGE for
-- limenzy_app arrives in Phase 2 together with the functions it needs.
revoke all on schema app from public;
revoke all on schema app from anon;
revoke all on schema app from authenticated;

-- ---------------------------------------------------------------------------
-- Transfer ownership of the 1C-B objects
-- ---------------------------------------------------------------------------
-- Only objects this project created. Nothing in auth, storage, extensions or
-- any Supabase-internal schema is touched, and the `public` schema itself keeps
-- its existing owner (pg_database_owner).
alter table public.workspaces            owner to limenzy_owner;
alter table public.user_profiles         owner to limenzy_owner;
alter table public.workspace_memberships owner to limenzy_owner;

alter type public.workspace_role                owner to limenzy_owner;
alter type public.workspace_membership_status   owner to limenzy_owner;

alter function public.set_updated_at()              owner to limenzy_owner;
alter function public.assert_valid_iana_time_zone() owner to limenzy_owner;

-- ---------------------------------------------------------------------------
-- Default privileges
-- ---------------------------------------------------------------------------
-- PostgreSQL rejects `ON TABLES, FUNCTIONS` in a single statement (syntax
-- error, verified), so each object type is a separate statement.
--
-- Default privileges are recorded per creating role, and transferring ownership
-- afterwards does NOT retroactively change which role's defaults applied. Both
-- the migration executor and limenzy_owner are therefore covered, because
-- either may create CRM objects in future phases.
--
-- This matters here specifically: supabase/config.toml leaves
-- `auto_expose_new_tables` at its default, so a new table in `public` would
-- otherwise be granted to the Data API roles automatically.

-- schema public, created by the migration executor
alter default privileges for role current_user in schema public revoke all on tables    from public;
alter default privileges for role current_user in schema public revoke all on tables    from anon;
alter default privileges for role current_user in schema public revoke all on tables    from authenticated;
alter default privileges for role current_user in schema public revoke all on functions from public;
alter default privileges for role current_user in schema public revoke all on functions from anon;
alter default privileges for role current_user in schema public revoke all on functions from authenticated;
alter default privileges for role current_user in schema public revoke all on sequences from public;
alter default privileges for role current_user in schema public revoke all on sequences from anon;
alter default privileges for role current_user in schema public revoke all on sequences from authenticated;

-- schema public, created by limenzy_owner
alter default privileges for role limenzy_owner in schema public revoke all on tables    from public;
alter default privileges for role limenzy_owner in schema public revoke all on tables    from anon;
alter default privileges for role limenzy_owner in schema public revoke all on tables    from authenticated;
alter default privileges for role limenzy_owner in schema public revoke all on functions from public;
alter default privileges for role limenzy_owner in schema public revoke all on functions from anon;
alter default privileges for role limenzy_owner in schema public revoke all on functions from authenticated;
alter default privileges for role limenzy_owner in schema public revoke all on sequences from public;
alter default privileges for role limenzy_owner in schema public revoke all on sequences from anon;
alter default privileges for role limenzy_owner in schema public revoke all on sequences from authenticated;

-- schema app, created by the migration executor
alter default privileges for role current_user in schema app revoke all on tables    from public;
alter default privileges for role current_user in schema app revoke all on tables    from anon;
alter default privileges for role current_user in schema app revoke all on tables    from authenticated;
alter default privileges for role current_user in schema app revoke all on functions from public;
alter default privileges for role current_user in schema app revoke all on functions from anon;
alter default privileges for role current_user in schema app revoke all on functions from authenticated;
alter default privileges for role current_user in schema app revoke all on sequences from public;
alter default privileges for role current_user in schema app revoke all on sequences from anon;
alter default privileges for role current_user in schema app revoke all on sequences from authenticated;

-- schema app, created by limenzy_owner
alter default privileges for role limenzy_owner in schema app revoke all on tables    from public;
alter default privileges for role limenzy_owner in schema app revoke all on tables    from anon;
alter default privileges for role limenzy_owner in schema app revoke all on tables    from authenticated;
alter default privileges for role limenzy_owner in schema app revoke all on functions from public;
alter default privileges for role limenzy_owner in schema app revoke all on functions from anon;
alter default privileges for role limenzy_owner in schema app revoke all on functions from authenticated;
alter default privileges for role limenzy_owner in schema app revoke all on sequences from public;
alter default privileges for role limenzy_owner in schema app revoke all on sequences from anon;
alter default privileges for role limenzy_owner in schema app revoke all on sequences from authenticated;

-- ---------------------------------------------------------------------------
-- Deny-by-default is preserved, deliberately
-- ---------------------------------------------------------------------------
-- Re-asserted rather than assumed: ownership transfer does not alter ACLs, and
-- no grant in this migration gives any application role data access.
--
--   * RLS stays enabled on all three tables.
--   * FORCE ROW LEVEL SECURITY is NOT added — that is Phase 2, with policies.
--   * There are still zero policies, so every non-owner read returns nothing.
--   * anon and authenticated keep zero table privileges.
--   * limenzy_app and limenzy_bootstrap receive no table privileges at all.
revoke all on public.workspaces            from anon, authenticated, limenzy_app, limenzy_bootstrap;
revoke all on public.user_profiles         from anon, authenticated, limenzy_app, limenzy_bootstrap;
revoke all on public.workspace_memberships from anon, authenticated, limenzy_app, limenzy_bootstrap;
