-- Milestone 1C-B — multi-tenant workspace foundation.
--
-- Creates the three tables the product's tenancy rests on: the workspace, the
-- person, and the membership joining them. Nothing business-facing is created
-- here: no Sales Teams, Leads, Customers, permissions or module tables.
--
-- Specification sources:
--   §2   User Roles              — the three workspace roles; Team Lead is NOT one
--   §7   First-Time Onboarding   — the fields captured when a workspace is created
--   §158 Business Settings       — workspace time zone is an IANA identifier
--   §159 Users                   — roles, Active/Inactive status, deactivate-not-delete
--   §160 User Deactivation       — history must keep showing the original user's name
--   §177 System-Wide Behaviour   — every entity belongs to exactly one workspace, and
--                                  isolation is enforced in the application AND the
--                                  database, neither replacing the other
--
-- SECURITY POSTURE OF THIS MIGRATION
--
-- These tables live in `public` and are therefore reachable through PostgREST.
-- They are created with row level security ENABLED and **no policies**, and the
-- Data API roles have their grants revoked. The result is deny-by-default: an
-- anonymous or ordinary authenticated caller can read nothing and write
-- nothing. This is a safe starting state, not tenant isolation — Milestone 1C-C
-- implements and proves the real workspace policies and the session context
-- they depend on. Nothing here should be read as a claim that isolation is
-- complete.

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- ---------------------------------------------------------------------------
-- Maintained in the database rather than by application code, so the value
-- cannot drift when a row is changed by a migration, a job or a console.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger function: sets updated_at to now() on every UPDATE.';

-- ---------------------------------------------------------------------------
-- Closed value sets (spec §2, §159)
-- ---------------------------------------------------------------------------
-- Native enums rather than free text: the product defines exactly these values,
-- so the database should refuse anything else.
--
-- There is deliberately no 'team_lead' role. §2 and §159: Team Lead "is not a
-- role and does not appear in the Roles list" — it is a Sales Team
-- responsibility, and Sales Teams are out of scope for this milestone.
create type public.workspace_role as enum (
  'owner_admin',
  'manager',
  'staff_sales'
);

-- §159 lists exactly two statuses. Deactivation flips this value; it never
-- deletes the membership row.
create type public.workspace_membership_status as enum (
  'active',
  'inactive'
);

-- ---------------------------------------------------------------------------
-- workspaces — the tenant (§7, §158, §177)
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id            uuid primary key default gen_random_uuid(),

  -- Business Name. NOT globally unique: unrelated businesses may share a name,
  -- and the specification never asks for uniqueness.
  name          text not null,

  -- Business Type / Industry (§7). Optional, and must not lock the CRM into an
  -- industry — it only informs setup and templates.
  business_type text,

  -- Country and Currency (§7, §158). Required. The specification does not name
  -- a code standard, so no format is invented beyond "not blank".
  country       text not null,
  currency      text not null,

  -- IANA time-zone identifier, e.g. 'Asia/Kolkata' (§158). Never a fixed
  -- offset: offsets change across daylight-saving transitions.
  time_zone     text not null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint workspaces_name_not_blank      check (btrim(name) <> ''),
  constraint workspaces_country_not_blank   check (btrim(country) <> ''),
  constraint workspaces_currency_not_blank  check (btrim(currency) <> ''),
  constraint workspaces_time_zone_not_blank check (btrim(time_zone) <> '')
);

comment on table public.workspaces is
  'The tenant. Every business entity belongs to exactly one workspace (spec §177).';

-- §158 requires the server to reject an unknown time-zone identifier. The
-- database can guarantee that too, by checking the identifier against the
-- installed time-zone database. A CHECK constraint cannot do this (the lookup
-- is not immutable — the tz database is updated), so it is a trigger.
create or replace function public.assert_valid_iana_time_zone()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from pg_timezone_names where name = new.time_zone
  ) then
    raise exception
      'invalid IANA time zone: %', new.time_zone
      using errcode = 'invalid_parameter_value';
  end if;
  return new;
end;
$$;

comment on function public.assert_valid_iana_time_zone() is
  'Trigger function: rejects a time_zone that is not a known IANA identifier (spec §158).';

create trigger workspaces_validate_time_zone
  before insert or update of time_zone on public.workspaces
  for each row execute function public.assert_valid_iana_time_zone();

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_profiles — the application's view of a person (§159, §160)
-- ---------------------------------------------------------------------------
-- The profile owns its own identifier and merely points at an authentication
-- account. That indirection is deliberate: §159 requires users with history to
-- be deactivated rather than deleted, and §160 requires history to keep showing
-- the original user's name. Keying this row on auth.users(id) and cascading
-- would delete the name that history depends on.
--
-- Email is NOT stored here. It belongs to auth.users; a copy would be a second
-- source of truth for identity and a second place for it to go stale.
create table public.user_profiles (
  id           uuid primary key default gen_random_uuid(),

  -- One authentication account maps to at most one profile. Nullable and
  -- ON DELETE SET NULL: removing the account detaches sign-in without
  -- destroying the person's history.
  auth_user_id uuid unique references auth.users (id) on delete set null,

  -- "User Name" in Settings → Users (§159), and the name history shows (§160).
  full_name    text not null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint user_profiles_full_name_not_blank check (btrim(full_name) <> '')
);

comment on table public.user_profiles is
  'A person as the application knows them. Outlives its auth.users row so history keeps the name (spec §160).';

comment on column public.user_profiles.auth_user_id is
  'Supabase auth account, if any. SET NULL on delete so history survives account removal.';

create trigger user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- workspace_memberships — who belongs where, in what role (§159, §160, D1)
-- ---------------------------------------------------------------------------
-- A person is a member of a workspace, not of the product. A user may belong to
-- several workspaces (architecture decision D1) and holds a role per workspace.
--
-- Both foreign keys RESTRICT. Nothing about this product wants a delete to
-- quietly remove the record that someone was once a member: §159 and §160 are
-- explicit that deactivation, not deletion, is how people leave.
create table public.workspace_memberships (
  id              uuid primary key default gen_random_uuid(),

  workspace_id    uuid not null references public.workspaces (id) on delete restrict,
  user_profile_id uuid not null references public.user_profiles (id) on delete restrict,

  role            public.workspace_role not null,

  -- Deactivate/Reactivate (§159) flip this; the row itself persists.
  status          public.workspace_membership_status not null default 'active',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One membership per person per workspace. Rejoining reactivates this row
  -- rather than creating a second one.
  constraint workspace_memberships_workspace_id_user_profile_id_key
    unique (workspace_id, user_profile_id)
);

comment on table public.workspace_memberships is
  'Membership of a person in a workspace, with their role there. Deactivated, never deleted (spec §159, §160).';

-- "Which workspaces does this signed-in person belong to?" — needed on sign-in
-- and by requireWorkspaceContext() in 1C-C. The workspace-scoped direction is
-- already served by the unique constraint above. No status-filtered index yet:
-- a person belongs to few workspaces, so filtering that handful is cheaper than
-- maintaining a second index.
create index workspace_memberships_user_profile_id_idx
  on public.workspace_memberships (user_profile_id);

create trigger workspace_memberships_set_updated_at
  before update on public.workspace_memberships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Deny by default (see SECURITY POSTURE above)
-- ---------------------------------------------------------------------------
-- RLS on, no policies: with no policy present, every row is invisible and every
-- write is refused for any non-superuser, non-owner role. The real workspace
-- policies are Milestone 1C-C's work, together with the session-context
-- mechanism they key on and the proof that it holds.
alter table public.workspaces            enable row level security;
alter table public.user_profiles         enable row level security;
alter table public.workspace_memberships enable row level security;

-- Belt and braces. This project leaves Supabase's `auto_expose_new_tables`
-- at its default, so new public tables are granted to the Data API roles
-- automatically. RLS already stops them, but a table that is both ungranted
-- and policy-less cannot be reached even if a future policy is added
-- carelessly. 1C-C grants back exactly what its policies intend to allow.
revoke all on public.workspaces            from anon, authenticated;
revoke all on public.user_profiles         from anon, authenticated;
revoke all on public.workspace_memberships from anon, authenticated;
