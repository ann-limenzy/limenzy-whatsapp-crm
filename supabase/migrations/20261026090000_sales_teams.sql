-- Milestone 4 — Sales Teams and membership foundation
-- (spec §159, §160, §161, §162, §163.1–§163.4, §163.12, §163.14, §163.15).
--
-- Structure and administration only. There is no assignment behaviour here:
-- no eligibility column, no rotation state, no assignment rules and no
-- Assignment Required. §163.5–§163.9 arrive with Milestone 5, and a column
-- nothing writes would imply coverage that does not exist.
--
-- WHAT THIS FILE ENFORCES, AND WHERE
--
--   1. One active Sales Team membership per workspace membership (§163.2).
--      A PARTIAL UNIQUE INDEX, so it holds against settings screens, imports,
--      retries and two concurrent requests alike — "enforced by the system,
--      not only by the interface".
--   2. At most one open Team Lead period per team (§163.1, §163.3). Also a
--      partial unique index.
--   3. EXACTLY one for an ACTIVE team — the "at least one" half that no index
--      can carry — plus "an active team membership belongs to an active
--      workspace member", in a DEFERRED CONSTRAINT TRIGGER that judges the
--      state each transaction commits rather than the order it wrote it in.
--      Deferred because creation inserts a team, a membership and a lead
--      period in one transaction and no single ordering of those three is
--      valid at every intermediate step.
--   4. Ended membership periods are permanent and are never reopened
--      (§163.2, §163.15). `sales_team_memberships.id` is a stable per-period
--      key, so a person's third spell in a team is a distinct, citable row
--      rather than one that looks reopened.
--   5. Team Lead responsibility is its own table of PERIODS, not a mutable
--      flag on the membership (§163.3, §163.15). Leadership can change hands
--      twice inside one unbroken membership, and a flag cannot record that it
--      ever happened.
--
-- WHY A DEFINER ROLE, WHEN 3A DID NOT NEED ONE
--
-- 3A's tables are edited by one UPDATE under one policy. These are not: every
-- operation here spans two or three tables, must re-check authority after its
-- locks are held, and must commit or roll back as a unit. That is the 2B/3D
-- shape, so it takes the 2B/3D mechanism — SECURITY DEFINER routines owned by
-- a NOLOGIN, NOBYPASSRLS role that is not a table owner, so row-level security
-- applies to it in full. limenzy_app is granted SELECT on the three tables and
-- no INSERT, UPDATE or DELETE at all: there is no write path except through a
-- routine that enforces the invariants above.
--
-- THE LOCK ORDER
--
-- The order in force before this file, read from the routines themselves:
--
--     workspaces row  →  stage row  →  active owner_admin memberships, asc
--                     →  any other membership row, asc  →  lead row
--
-- This file APPENDS to it and changes no existing position:
--
--     …  →  any other membership row, asc  →  sales_teams, asc
--        →  sales_team_memberships, asc    →  sales_team_lead_periods, asc
--
-- Every routine below takes the active owner_admin set FIRST, unconditionally,
-- exactly as `app.reassign_lead_owner` does. The reason is measured rather
-- than assumed: each of these routines locks TWO OR MORE membership rows once
-- helper calls are counted — `app.lock_actor_membership()` takes the actor's
-- row, and the target's row is taken separately — and 3D's audit shows the
-- failing shape for exactly that case. A routine holding a non-owner row and
-- waiting for an owner_admin row deadlocks against `app.set_member_status`,
-- which holds that owner_admin row from its set and waits for the non-owner
-- row as its target. Taking the whole set first removes the cycle.
--
-- Routines that lock only ONE membership row do not need the set. None here
-- qualifies, so none omits it. A conditional set — taken only when an
-- Owner/Admin is involved — would be lighter and is NOT adopted: it has not
-- been audited, and a lock set that depends on who the parties turn out to be
-- has to be re-derived after it is already too late to take it.
--
-- No routine here takes the WORKSPACE row. 3D takes it `for share` to hold a
-- CONFIGURABLE §162 cell still while it reads it. Every Sales Team
-- administration cell is a fixed Owner/Admin "Yes" (§162), so no
-- `permissions_granted` value is read and there is nothing to stabilise. If
-- §163.18 decision 5 is ever approved and Manager administration becomes
-- configurable, these routines MUST take `select 1 from public.workspaces
-- where id = … for share` as their first statement, before the owner_admin
-- set, exactly as `app.reassign_lead_owner` does.
--
-- WHAT IS DELIBERATELY NOT ENFORCED HERE
--
-- §163.1's "deactivate every active Lead assignment rule that targets the
-- team" and §163.12's "select which rules to reactivate" are no-ops, because
-- no rule table exists. They are written as explicit no-ops in the routines
-- rather than silently omitted, so the day rules arrive the place to add them
-- is already named.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type t
     where t.typnamespace = 'public'::regnamespace
       and t.typname = 'sales_team_status'
  ) then
    create type public.sales_team_status as enum ('active', 'inactive');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type t
     where t.typnamespace = 'public'::regnamespace
       and t.typname = 'sales_team_membership_status'
  ) then
    create type public.sales_team_membership_status as enum ('active', 'ended');
  end if;
end
$$;

-- Only the kinds this slice can actually emit. Eligibility and assignment
-- kinds arrive with Milestone 5; a kind nothing writes would imply coverage
-- that does not exist.
do $$
begin
  if not exists (
    select 1 from pg_type t
     where t.typnamespace = 'public'::regnamespace
       and t.typname = 'sales_team_activity_kind'
  ) then
    create type public.sales_team_activity_kind as enum (
      'team_created',
      'team_renamed',
      'team_deactivated',
      'team_reactivated',
      'member_added',
      'member_removed',
      'member_transferred',
      'team_lead_designated',
      'team_lead_ended'
    );
  end if;
end
$$;

/* Owned by the schema owner, as every other enum in this schema is. A type
   left owned by whoever ran the migration is a privilege the deployment did
   not intend to hand out. */
alter type public.sales_team_status            owner to limenzy_owner;
alter type public.sales_team_membership_status owner to limenzy_owner;
alter type public.sales_team_activity_kind     owner to limenzy_owner;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.sales_teams (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,

  name         text not null,
  description  text,

  status       public.sales_team_status not null default 'active',

  created_by_user_profile_id uuid
    references public.user_profiles (id) on delete restrict,
  updated_by_user_profile_id uuid
    references public.user_profiles (id) on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sales_teams_name_not_blank
    check (name = btrim(name) and btrim(name) <> ''),
  constraint sales_teams_name_length check (char_length(name) <= 60),
  constraint sales_teams_description_length
    check (description is null or char_length(description) <= 500),

  /* The foreign-key TARGET, so a membership in one workspace can never point
     at another workspace's team. Unrepresentable, not merely forbidden. */
  constraint sales_teams_workspace_id_key unique (workspace_id, id)
);

/*
 * §163.1: "Team names must be unique within a workspace." Unconditional, not
 * only among active teams — unlike a pipeline stage, a Sales Team is never
 * deleted and its name stays attached to its history, so reusing it for a
 * different team would make two different teams indistinguishable in an audit
 * trail. Case-insensitive, as every other workspace-scoped name is.
 */
create unique index if not exists sales_teams_name_key
  on public.sales_teams (workspace_id, lower(name));

comment on table public.sales_teams is
  'Spec §163.1. A named group of salespeople within one workspace. '
  'Deactivated, never deleted, so membership and leadership history survive.';

create table if not exists public.sales_team_memberships (
  /*
   * A stable key for ONE MEMBERSHIP PERIOD. §163.2: "An ended membership is
   * permanent history and must never be reopened. A user who rejoins a team
   * receives a new membership period." Keying this table on
   * (team, user) would make a second period unrepresentable and would invite
   * exactly the reopening the specification forbids.
   */
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,

  sales_team_id   uuid not null,
  user_profile_id uuid not null,

  status    public.sales_team_membership_status not null default 'active',
  /*
   * clock_timestamp(), not now(). `now()` is the TRANSACTION's start time, so
   * a transaction that began before another one committed can stamp an event
   * with a moment earlier than one that has already happened — and closing a
   * period could then land before that period started. The `ended_*` updates
   * take `greatest(...)` for the same reason, so the ordering holds whatever
   * the interleaving. The check constraints below are what caught this.
   */
  joined_at timestamptz not null default clock_timestamp(),
  ended_at  timestamptz,

  joined_by_user_profile_id uuid
    references public.user_profiles (id) on delete restrict,
  ended_by_user_profile_id uuid
    references public.user_profiles (id) on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (workspace_id, sales_team_id)
    references public.sales_teams (workspace_id, id) on delete restrict,
  /*
   * §163.2: "Only an active workspace member may hold an active Sales Team
   * membership." The composite reference carries the workspace half — a team
   * membership for someone who is not in this workspace at all is
   * unrepresentable. The ACTIVE half is a state, not a shape, and is enforced
   * by the deferred constraint below.
   */
  foreign key (workspace_id, user_profile_id)
    references public.workspace_memberships (workspace_id, user_profile_id)
    on delete restrict,

  constraint sales_team_memberships_workspace_id_key unique (workspace_id, id),

  constraint sales_team_memberships_ended_consistently
    check (
      (status = 'active' and ended_at is null)
      or (status = 'ended' and ended_at is not null)
    ),
  constraint sales_team_memberships_ended_after_joined
    check (ended_at is null or ended_at >= joined_at)
);

/*
 * §163.2's cardinality rule, as a constraint rather than a check in code:
 * "One active Sales Team membership per workspace membership." Workspace-wide,
 * not per team — belonging to two teams at once is the thing being prevented.
 *
 * This is also the backstop for the concurrency case. Two requests that each
 * read "no active membership" and then insert cannot both commit: the second
 * fails on this index, which is why the routines treat a unique violation as
 * a real outcome rather than an unexpected error.
 */
create unique index if not exists sales_team_memberships_one_active_key
  on public.sales_team_memberships (workspace_id, user_profile_id)
  where status = 'active';

create index if not exists sales_team_memberships_team_idx
  on public.sales_team_memberships (workspace_id, sales_team_id, status);

comment on table public.sales_team_memberships is
  'Spec §163.2. One membership PERIOD of one team by one person. Ended '
  'periods are permanent history and are never reopened; rejoining creates a '
  'new row.';

create table if not exists public.sales_team_lead_periods (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,

  sales_team_id uuid not null,
  /* The PERIOD, not the person: leadership belongs to a spell of membership,
     so it can never outlive the membership that carried it. */
  membership_id uuid not null,

  started_at timestamptz not null default clock_timestamp(),
  ended_at   timestamptz,

  started_by_user_profile_id uuid
    references public.user_profiles (id) on delete restrict,
  ended_by_user_profile_id uuid
    references public.user_profiles (id) on delete restrict,

  foreign key (workspace_id, sales_team_id)
    references public.sales_teams (workspace_id, id) on delete restrict,
  foreign key (workspace_id, membership_id)
    references public.sales_team_memberships (workspace_id, id) on delete restrict,

  constraint sales_team_lead_periods_ended_after_started
    check (ended_at is null or ended_at >= started_at)
);

/* At most one OPEN period per team. The "at least one, for an active team"
   half is a state invariant and lives in the deferred constraint below. */
create unique index if not exists sales_team_lead_periods_one_open_key
  on public.sales_team_lead_periods (sales_team_id)
  where ended_at is null;

create index if not exists sales_team_lead_periods_membership_idx
  on public.sales_team_lead_periods (workspace_id, membership_id);

comment on table public.sales_team_lead_periods is
  'Spec §163.3, §163.15. Team Lead responsibility as PERIODS, so leadership '
  'that changes hands during one unbroken membership is still history. A '
  'mutable flag on the membership could not record that it ever happened.';

create table if not exists public.sales_team_activities (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,

  sales_team_id uuid not null,

  kind public.sales_team_activity_kind not null,

  actor_user_profile_id uuid
    references public.user_profiles (id) on delete restrict,
  /* The person the entry is about, where there is one. */
  subject_user_profile_id uuid
    references public.user_profiles (id) on delete restrict,

  /* §163.4 item 10: a transfer records the former team and the destination. */
  from_sales_team_id uuid,
  to_sales_team_id   uuid,

  /* The name as it stood, for a rename — history keeps the old wording. */
  detail text,

  occurred_at timestamptz not null default clock_timestamp(),

  foreign key (workspace_id, sales_team_id)
    references public.sales_teams (workspace_id, id) on delete restrict,
  foreign key (workspace_id, from_sales_team_id)
    references public.sales_teams (workspace_id, id) on delete restrict,
  foreign key (workspace_id, to_sales_team_id)
    references public.sales_teams (workspace_id, id) on delete restrict,

  constraint sales_team_activities_detail_length
    check (detail is null or char_length(detail) <= 500)
);

create index if not exists sales_team_activities_team_idx
  on public.sales_team_activities (workspace_id, sales_team_id, occurred_at desc, id desc);

comment on table public.sales_team_activities is
  'Spec §163.4, §163.15. Append-only administrative history. No application '
  'role holds UPDATE or DELETE here, which is what makes it append-only.';

-- ---------------------------------------------------------------------------
-- Ownership, row-level security and the Data API
-- ---------------------------------------------------------------------------
alter table public.sales_teams             owner to limenzy_owner;
alter table public.sales_team_memberships  owner to limenzy_owner;
alter table public.sales_team_lead_periods owner to limenzy_owner;
alter table public.sales_team_activities   owner to limenzy_owner;

drop trigger if exists set_updated_at on public.sales_teams;
create trigger set_updated_at
  before update on public.sales_teams
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.sales_team_memberships;
create trigger set_updated_at
  before update on public.sales_team_memberships
  for each row execute function public.set_updated_at();

alter table public.sales_teams             enable row level security;
alter table public.sales_teams             force  row level security;
alter table public.sales_team_memberships  enable row level security;
alter table public.sales_team_memberships  force  row level security;
alter table public.sales_team_lead_periods enable row level security;
alter table public.sales_team_lead_periods force  row level security;
alter table public.sales_team_activities   enable row level security;
alter table public.sales_team_activities   force  row level security;

/* Supabase grants new tables in `public` to the Data API roles by default. */
revoke all on public.sales_teams             from anon, authenticated, service_role;
revoke all on public.sales_team_memberships  from anon, authenticated, service_role;
revoke all on public.sales_team_lead_periods from anon, authenticated, service_role;
revoke all on public.sales_team_activities   from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The state invariants, deferred
-- ---------------------------------------------------------------------------
-- Judged on what a transaction COMMITS, not on the order it wrote rows in.
-- Creation inserts a team, a membership and a lead period together and no
-- ordering of those three is valid at every intermediate step.
--
-- SECURITY INVOKER, for 3A's reason: it counts rows, and running it as the
-- table owner would need a policy naming limenzy_owner, which Phase 1 forbids
-- because FORCE ROW LEVEL SECURITY exists precisely to subject the owner to
-- policies. Each caller reads through its own policy. The failure direction is
-- safe: a role that cannot see the rows counts zero leads and the check
-- refuses the transaction.
create or replace function public.sales_teams_check_shape()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $trg$
declare
  v_workspace uuid := coalesce(new.workspace_id, old.workspace_id);
  v_team      uuid;
  v_open      integer;
begin
  /*
   * IF, not a CASE expression. PL/pgSQL resolves every field named in an
   * expression it evaluates, and `new.sales_team_id` does not exist on a
   * `sales_teams` record — a CASE that merely never takes that branch still
   * fails at runtime with "record new has no field sales_team_id".
   */
  if tg_table_name = 'sales_teams' then
    v_team := coalesce(new.id, old.id);
  else
    v_team := coalesce(new.sales_team_id, old.sales_team_id);
  end if;

  /* A team removed outright has no shape left to keep. No application role
     can delete from these tables — limenzy_app holds SELECT only and the
     routines never delete — so reaching this takes the table owner. */
  if tg_op = 'DELETE' and not exists (
    select 1 from public.sales_teams where id = v_team
  ) then
    return null;
  end if;

  /*
   * §163.1, §163.3: every ACTIVE team has exactly one active Team Lead, who
   * is an active member of that same team. The index beside this enforces
   * "at most one"; this is the half that says "at least one", and it is why
   * a team cannot be left active after its lead departs.
   */
  select count(*) into v_open
    from public.sales_team_lead_periods p
    join public.sales_team_memberships m
      on m.workspace_id = p.workspace_id and m.id = p.membership_id
   where p.workspace_id  = v_workspace
     and p.sales_team_id = v_team
     and p.ended_at is null
     and m.status = 'active'::public.sales_team_membership_status
     and m.sales_team_id = v_team;

  if exists (
    select 1 from public.sales_teams t
     where t.id = v_team
       and t.status = 'active'::public.sales_team_status
  ) and v_open <> 1 then
    raise exception
      'an active Sales Team must have exactly one active Team Lead who is a member of it'
      using errcode = '23514';
  end if;

  /*
   * An OPEN lead period whose membership has ended is leadership outliving
   * the membership that carried it. Refused whatever the team's status, so
   * an inactive team cannot be left holding one either.
   */
  if exists (
    select 1
      from public.sales_team_lead_periods p
      join public.sales_team_memberships m
        on m.workspace_id = p.workspace_id and m.id = p.membership_id
     where p.workspace_id  = v_workspace
       and p.sales_team_id = v_team
       and p.ended_at is null
       and (m.status <> 'active'::public.sales_team_membership_status
            or m.sales_team_id <> p.sales_team_id)
  ) then
    raise exception 'a Team Lead period must belong to an active membership of that team'
      using errcode = '23514';
  end if;

  /*
   * §163.2: "Only an active workspace member may hold an active Sales Team
   * membership." The backstop for every path, including one that deactivates
   * a workspace member without going through app.set_member_status.
   */
  if exists (
    select 1
      from public.sales_team_memberships m
      join public.workspace_memberships w
        on w.workspace_id = m.workspace_id
       and w.user_profile_id = m.user_profile_id
     where m.workspace_id  = v_workspace
       and m.sales_team_id = v_team
       and m.status = 'active'::public.sales_team_membership_status
       and w.status <> 'active'::public.workspace_membership_status
  ) then
    raise exception 'an active Sales Team membership requires an active workspace member'
      using errcode = '23514';
  end if;

  return null;
end
$trg$;

alter function public.sales_teams_check_shape() owner to limenzy_owner;

drop trigger if exists sales_teams_shape on public.sales_teams;
create constraint trigger sales_teams_shape
  after insert or update or delete on public.sales_teams
  deferrable initially deferred
  for each row execute function public.sales_teams_check_shape();

drop trigger if exists sales_team_memberships_shape on public.sales_team_memberships;
create constraint trigger sales_team_memberships_shape
  after insert or update or delete on public.sales_team_memberships
  deferrable initially deferred
  for each row execute function public.sales_teams_check_shape();

drop trigger if exists sales_team_lead_periods_shape on public.sales_team_lead_periods;
create constraint trigger sales_team_lead_periods_shape
  after insert or update or delete on public.sales_team_lead_periods
  deferrable initially deferred
  for each row execute function public.sales_teams_check_shape();

/*
 * The same invariant, approached from the workspace membership side.
 *
 * Deactivating a workspace member does not touch any sales_team table, so the
 * triggers above never fire for it. `app.set_member_status` ends the team
 * membership itself — but this is the backstop that holds when something
 * else changes a membership's status, which is the difference between the
 * gateway enforcing a rule and the database enforcing it.
 */
create or replace function public.workspace_memberships_check_team_shape()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $trg$
begin
  if new.status = 'active'::public.workspace_membership_status then
    return null;
  end if;

  if exists (
    select 1 from public.sales_team_memberships m
     where m.workspace_id    = new.workspace_id
       and m.user_profile_id = new.user_profile_id
       and m.status = 'active'::public.sales_team_membership_status
  ) then
    raise exception
      'a deactivated workspace member cannot keep an active Sales Team membership'
      using errcode = '23514';
  end if;

  return null;
end
$trg$;

alter function public.workspace_memberships_check_team_shape() owner to limenzy_owner;

drop trigger if exists workspace_memberships_team_shape on public.workspace_memberships;
create constraint trigger workspace_memberships_team_shape
  after update of status on public.workspace_memberships
  deferrable initially deferred
  for each row execute function public.workspace_memberships_check_team_shape();

-- ---------------------------------------------------------------------------
-- The definer role
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'limenzy_teams') then
    create role limenzy_teams
      nologin nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
  end if;
end
$$;

comment on role limenzy_teams is
  'Owns the Settings → Sales Teams routines (spec §163.1–§163.4, §163.12) and '
  'nothing else. NOLOGIN, NOBYPASSRLS, not a table owner, so row-level '
  'security applies to it in full. Never granted to limenzy_app.';

grant limenzy_teams to current_user with set option;

-- Temporary: revoked at the end, once the routines exist and are owned.
grant create on schema app to limenzy_teams;
grant usage  on schema app to limenzy_teams;

grant execute on function app.current_auth_user_id()        to limenzy_teams;
grant execute on function app.current_user_profile_id()     to limenzy_teams;
grant execute on function app.current_workspace_id()        to limenzy_teams;
grant execute on function app.current_user_is_owner_admin() to limenzy_teams;

-- ---------------------------------------------------------------------------
-- Privileges — the exact allow-list, nothing wider
-- ---------------------------------------------------------------------------
-- limenzy_app READS and never writes. Every write goes through a routine that
-- enforces the invariants, so there is no path that can produce a second
-- active membership or a leaderless active team.
grant select on public.sales_teams             to limenzy_app;
grant select on public.sales_team_memberships  to limenzy_app;
grant select on public.sales_team_lead_periods to limenzy_app;
grant select on public.sales_team_activities   to limenzy_app;

grant select on public.workspaces            to limenzy_teams;
grant select on public.user_profiles         to limenzy_teams;
grant select on public.workspace_memberships to limenzy_teams;
grant select on public.sales_teams             to limenzy_teams;
grant select on public.sales_team_memberships  to limenzy_teams;
grant select on public.sales_team_lead_periods to limenzy_teams;
grant select on public.sales_team_activities   to limenzy_teams;

/* The one column that exists so the membership lock is privileged enough to
   take. SELECT … FOR UPDATE needs the UPDATE privilege, and a column-level
   grant is enough — the same device `app.lock_lead_stage` uses. The policy
   below has WITH CHECK (false), so this can never become a write. */
grant update (status) on public.workspace_memberships to limenzy_teams;

grant insert on public.sales_teams             to limenzy_teams;
grant insert on public.sales_team_memberships  to limenzy_teams;
grant insert on public.sales_team_lead_periods to limenzy_teams;
grant insert on public.sales_team_activities   to limenzy_teams;

grant update (name, description, status, updated_by_user_profile_id)
  on public.sales_teams to limenzy_teams;
grant update (status, ended_at, ended_by_user_profile_id)
  on public.sales_team_memberships to limenzy_teams;
grant update (ended_at, ended_by_user_profile_id)
  on public.sales_team_lead_periods to limenzy_teams;

-- limenzy_members ends a departing user's team membership inside
-- app.set_member_status. It gets exactly that and nothing more.
grant select on public.sales_teams             to limenzy_members;
grant select on public.sales_team_memberships  to limenzy_members;
grant select on public.sales_team_lead_periods to limenzy_members;
grant update (status, ended_at, ended_by_user_profile_id)
  on public.sales_team_memberships to limenzy_members;
grant update (ended_at, ended_by_user_profile_id)
  on public.sales_team_lead_periods to limenzy_members;
grant insert on public.sales_team_activities to limenzy_members;

-- No UPDATE or DELETE on sales_team_activities for ANY application role. That
-- absence is what makes the history append-only; it is asserted at the end of
-- this file rather than trusted.

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
-- Nothing below grants anon, authenticated, service_role, limenzy_owner or
-- PUBLIC anything. There is no USING (true) and no WITH CHECK (true).
--
-- §163.2: "Team membership does not grant access to records owned by other
-- team members." No policy in this file mentions leads, customers or any
-- other record table, and no policy on those tables is touched. Being in a
-- team is not a record-access path, and the test suite proves it by reading
-- a teammate's Lead and getting nothing.

drop policy if exists sales_teams_member_select on public.sales_teams;
create policy sales_teams_member_select on public.sales_teams
  for select to limenzy_app
  using (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_memberships_member_select on public.sales_team_memberships;
create policy sales_team_memberships_member_select on public.sales_team_memberships
  for select to limenzy_app
  using (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_lead_periods_member_select on public.sales_team_lead_periods;
create policy sales_team_lead_periods_member_select on public.sales_team_lead_periods
  for select to limenzy_app
  using (workspace_id = app.current_workspace_id());

/* §163.12 lists administrative audit information among the Owner/Admin
   capabilities, and §162 gives Staff/Sales no row for it. */
drop policy if exists sales_team_activities_owner_admin_select on public.sales_team_activities;
create policy sales_team_activities_owner_admin_select on public.sales_team_activities
  for select to limenzy_app
  using (
    workspace_id = app.current_workspace_id()
    and app.current_user_is_owner_admin()
  );

-- limenzy_teams, inside its routines.
drop policy if exists sales_teams_teams_select on public.sales_teams;
create policy sales_teams_teams_select on public.sales_teams
  for select to limenzy_teams
  using (workspace_id = app.current_workspace_id());

drop policy if exists sales_teams_teams_insert on public.sales_teams;
create policy sales_teams_teams_insert on public.sales_teams
  for insert to limenzy_teams
  with check (workspace_id = app.current_workspace_id());

drop policy if exists sales_teams_teams_update on public.sales_teams;
create policy sales_teams_teams_update on public.sales_teams
  for update to limenzy_teams
  using (workspace_id = app.current_workspace_id())
  with check (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_memberships_teams_select on public.sales_team_memberships;
create policy sales_team_memberships_teams_select on public.sales_team_memberships
  for select to limenzy_teams
  using (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_memberships_teams_insert on public.sales_team_memberships;
create policy sales_team_memberships_teams_insert on public.sales_team_memberships
  for insert to limenzy_teams
  with check (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_memberships_teams_update on public.sales_team_memberships;
create policy sales_team_memberships_teams_update on public.sales_team_memberships
  for update to limenzy_teams
  using (workspace_id = app.current_workspace_id())
  with check (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_lead_periods_teams_select on public.sales_team_lead_periods;
create policy sales_team_lead_periods_teams_select on public.sales_team_lead_periods
  for select to limenzy_teams
  using (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_lead_periods_teams_insert on public.sales_team_lead_periods;
create policy sales_team_lead_periods_teams_insert on public.sales_team_lead_periods
  for insert to limenzy_teams
  with check (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_lead_periods_teams_update on public.sales_team_lead_periods;
create policy sales_team_lead_periods_teams_update on public.sales_team_lead_periods
  for update to limenzy_teams
  using (workspace_id = app.current_workspace_id())
  with check (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_activities_teams_insert on public.sales_team_activities;
create policy sales_team_activities_teams_insert on public.sales_team_activities
  for insert to limenzy_teams
  with check (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_activities_teams_select on public.sales_team_activities;
create policy sales_team_activities_teams_select on public.sales_team_activities
  for select to limenzy_teams
  using (workspace_id = app.current_workspace_id());

/* The lock-only privilege: read the row and hold it, never write it. */
drop policy if exists workspace_memberships_teams_select on public.workspace_memberships;
create policy workspace_memberships_teams_select on public.workspace_memberships
  for select to limenzy_teams
  using (workspace_id = app.current_workspace_id());

drop policy if exists workspace_memberships_teams_lock on public.workspace_memberships;
create policy workspace_memberships_teams_lock on public.workspace_memberships
  for update to limenzy_teams
  using (workspace_id = app.current_workspace_id())
  with check (false);

drop policy if exists user_profiles_teams_select on public.user_profiles;
create policy user_profiles_teams_select on public.user_profiles
  for select to limenzy_teams
  using (
    exists (
      select 1
        from public.workspace_memberships m
       where m.user_profile_id = public.user_profiles.id
         and m.workspace_id = app.current_workspace_id()
    )
  );

drop policy if exists workspaces_teams_select on public.workspaces;
create policy workspaces_teams_select on public.workspaces
  for select to limenzy_teams
  using (id = app.current_workspace_id());

-- limenzy_members, for the deactivation path only.
drop policy if exists sales_teams_members_select on public.sales_teams;
create policy sales_teams_members_select on public.sales_teams
  for select to limenzy_members
  using (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_memberships_members_select on public.sales_team_memberships;
create policy sales_team_memberships_members_select on public.sales_team_memberships
  for select to limenzy_members
  using (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_memberships_members_update on public.sales_team_memberships;
create policy sales_team_memberships_members_update on public.sales_team_memberships
  for update to limenzy_members
  using (workspace_id = app.current_workspace_id())
  with check (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_lead_periods_members_select on public.sales_team_lead_periods;
create policy sales_team_lead_periods_members_select on public.sales_team_lead_periods
  for select to limenzy_members
  using (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_lead_periods_members_update on public.sales_team_lead_periods;
create policy sales_team_lead_periods_members_update on public.sales_team_lead_periods
  for update to limenzy_members
  using (workspace_id = app.current_workspace_id())
  with check (workspace_id = app.current_workspace_id());

drop policy if exists sales_team_activities_members_insert on public.sales_team_activities;
create policy sales_team_activities_members_insert on public.sales_team_activities
  for insert to limenzy_members
  with check (workspace_id = app.current_workspace_id());

-- ---------------------------------------------------------------------------
-- The shared lock prelude
-- ---------------------------------------------------------------------------
-- Every administrative routine opens with this, so the order is written once
-- and cannot drift between them. See THE LOCK ORDER at the top of this file
-- for why the owner_admin set comes first and is unconditional.
--
-- It returns whether the CALLER is still an active Owner/Admin, re-read after
-- the locks are held. The check every routine makes before calling this read
-- an earlier snapshot: each statement in a VOLATILE function takes a fresh one
-- under READ COMMITTED, so a concurrent transaction can demote the caller in
-- between. After this returns true the answer is stable for the transaction,
-- because the caller holds a lock on their own row.
create or replace function app.lock_sales_team_prelude()
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $fn$
begin
  perform 1
     from public.workspace_memberships
    where workspace_id = app.current_workspace_id()
      and role   = 'owner_admin'::public.workspace_role
      and status = 'active'::public.workspace_membership_status
    order by user_profile_id
      for update;

  return app.current_user_is_owner_admin();
end
$fn$;

-- ---------------------------------------------------------------------------
-- Placing a member: add, or an explicit confirmed transfer
-- ---------------------------------------------------------------------------
-- §163.2: an attempt to add someone who already has an active membership
-- "must be refused, or handled as an explicit transfer". Both, here: it is
-- refused unless the caller confirms a transfer AND names the exact source
-- membership period they were shown.
--
-- INTERNAL. Assumes the caller has run the prelude and holds its locks.
create or replace function app.sales_team_place_member(
  p_team_id          uuid,
  p_user_profile_id  uuid,
  p_expected_source  uuid,
  p_confirm_transfer boolean
)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $fn$
declare
  v_ws       uuid := app.current_workspace_id();
  v_actor    uuid := app.current_user_profile_id();
  v_status   public.workspace_membership_status;
  v_current  public.sales_team_memberships%rowtype;
  v_new_id   uuid;
begin
  /* The target's workspace membership row, locked, so "active workspace
     member" stays true for the rest of this transaction. */
  select status into v_status
    from public.workspace_memberships
   where workspace_id    = v_ws
     and user_profile_id = p_user_profile_id
     for update;

  if not found then
    return 'unknown_member';
  end if;
  if v_status <> 'active'::public.workspace_membership_status then
    return 'member_not_active';
  end if;

  /*
   * The person's current active membership, read UNDER THE LOCK rather than
   * trusted from the form. A transfer confirmed against one team must never
   * silently take effect against another, so the confirmed source id is
   * compared with what is actually there.
   */
  select * into v_current
    from public.sales_team_memberships
   where workspace_id    = v_ws
     and user_profile_id = p_user_profile_id
     and status = 'active'::public.sales_team_membership_status
     for update;

  if found then
    if v_current.sales_team_id = p_team_id then
      return 'already_in_this_team';
    end if;
    if p_confirm_transfer is not true then
      return 'transfer_not_confirmed';
    end if;
    /* Revalidation. A membership that changed between the confirmation and
       this statement is a different fact from the one the person agreed to. */
    if p_expected_source is null or p_expected_source <> v_current.id then
      return 'source_changed';
    end if;

    /*
     * §163.4: "If the salesperson is the Team Lead of the former team, the
     * transfer cannot complete until a replacement Team Lead is designated or
     * the former team is explicitly deactivated." Refused here rather than
     * resolved: the creation and membership forms carry no source-team
     * controls, by design.
     */
    if exists (
      select 1
        from public.sales_team_lead_periods p
        join public.sales_teams t
          on t.workspace_id = p.workspace_id and t.id = p.sales_team_id
       where p.workspace_id  = v_ws
         and p.membership_id = v_current.id
         and p.ended_at is null
         and t.status = 'active'::public.sales_team_status
    ) then
      return 'leads_source_team';
    end if;

    /* Any open period on an INACTIVE source team ends with the membership:
       leadership can never outlive the membership that carried it. */
    update public.sales_team_lead_periods
       set ended_at = greatest(clock_timestamp(), started_at),
         ended_by_user_profile_id = v_actor
     where workspace_id  = v_ws
       and membership_id = v_current.id
       and ended_at is null;

    update public.sales_team_memberships
       set status = 'ended'::public.sales_team_membership_status,
           ended_at = greatest(clock_timestamp(), joined_at),
           ended_by_user_profile_id = v_actor
     where id = v_current.id;
  else
    if p_expected_source is not null then
      /* The caller believed there was a source membership and there is none.
         Same class of fault as naming the wrong one. */
      return 'source_changed';
    end if;
  end if;

  /* A NEW period, always. §163.2: an ended membership is never reopened. */
  insert into public.sales_team_memberships
    (workspace_id, sales_team_id, user_profile_id, joined_by_user_profile_id)
  values (v_ws, p_team_id, p_user_profile_id, v_actor)
  returning id into v_new_id;

  insert into public.sales_team_activities
    (workspace_id, sales_team_id, kind, actor_user_profile_id,
     subject_user_profile_id, from_sales_team_id, to_sales_team_id)
  values (
    v_ws, p_team_id,
    case when v_current.id is null
      then 'member_added'::public.sales_team_activity_kind
      else 'member_transferred'::public.sales_team_activity_kind
    end,
    v_actor, p_user_profile_id, v_current.sales_team_id, p_team_id
  );

  return 'ok';
end
$fn$;

-- ---------------------------------------------------------------------------
-- Create a team, its first member and its first Team Lead — atomically
-- ---------------------------------------------------------------------------
-- §163.1 and §163.3 cannot all hold at any intermediate step: a team has no
-- members when it is created, and an active team needs a lead who is a member.
-- They are therefore satisfied TOGETHER, in one transaction, with the shape
-- constraint deferred to COMMIT. The team is Active from the start; no
-- inactive-first draft state is required.
create or replace function app.create_sales_team(
  p_name             text,
  p_description      text,
  p_lead_profile_id  uuid,
  p_expected_source  uuid,
  p_confirm_transfer boolean
)
returns table (outcome text, team_id uuid)
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $fn$
declare
  v_ws      uuid;
  v_actor   uuid;
  v_name    text;
  v_team    uuid;
  v_placed  text;
  v_member  uuid;
begin
  if not app.current_user_is_owner_admin() then
    return query select 'not_permitted'::text, null::uuid;
    return;
  end if;

  v_ws    := app.current_workspace_id();
  v_actor := app.current_user_profile_id();
  v_name  := btrim(coalesce(p_name, ''));

  if v_name = '' then
    return query select 'invalid_name'::text, null::uuid;
    return;
  end if;
  if char_length(v_name) > 60 then
    return query select 'name_too_long'::text, null::uuid;
    return;
  end if;
  if p_description is not null and char_length(p_description) > 500 then
    return query select 'description_too_long'::text, null::uuid;
    return;
  end if;
  if p_lead_profile_id is null then
    return query select 'team_lead_required'::text, null::uuid;
    return;
  end if;

  if not app.lock_sales_team_prelude() then
    return query select 'not_permitted'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.sales_teams
     where workspace_id = v_ws and lower(name) = lower(v_name)
  ) then
    return query select 'name_taken'::text, null::uuid;
    return;
  end if;

  insert into public.sales_teams
    (workspace_id, name, description, status,
     created_by_user_profile_id, updated_by_user_profile_id)
  values (v_ws, v_name, nullif(btrim(coalesce(p_description, '')), ''),
          'active'::public.sales_team_status, v_actor, v_actor)
  returning id into v_team;

  v_placed := app.sales_team_place_member(
    v_team, p_lead_profile_id, p_expected_source, p_confirm_transfer);

  if v_placed <> 'ok' then
    /* Nothing is half-done: the team insert above is rolled back with this. */
    raise exception using errcode = 'P0001', message = v_placed;
  end if;

  select id into v_member
    from public.sales_team_memberships
   where workspace_id = v_ws
     and sales_team_id = v_team
     and user_profile_id = p_lead_profile_id
     and status = 'active'::public.sales_team_membership_status;

  insert into public.sales_team_lead_periods
    (workspace_id, sales_team_id, membership_id, started_by_user_profile_id)
  values (v_ws, v_team, v_member, v_actor);

  insert into public.sales_team_activities
    (workspace_id, sales_team_id, kind, actor_user_profile_id, detail)
  values (v_ws, v_team, 'team_created'::public.sales_team_activity_kind,
          v_actor, v_name);

  insert into public.sales_team_activities
    (workspace_id, sales_team_id, kind, actor_user_profile_id,
     subject_user_profile_id)
  values (v_ws, v_team, 'team_lead_designated'::public.sales_team_activity_kind,
          v_actor, p_lead_profile_id);

  return query select 'ok'::text, v_team;
exception
  when sqlstate 'P0001' then
    /* The placement refusals travel back as outcomes, not as errors: they are
       answers the screen has wording for. Anything else still raises. */
    if sqlerrm in ('unknown_member', 'member_not_active', 'already_in_this_team',
                   'transfer_not_confirmed', 'source_changed', 'leads_source_team') then
      return query select sqlerrm::text, null::uuid;
      return;
    end if;
    raise;
  when unique_violation then
    /* Two requests racing to create the same name, or to place the same
       person. Both are real outcomes rather than faults. */
    return query select 'conflict'::text, null::uuid;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Rename, add or transfer, remove, designate, deactivate, reactivate
-- ---------------------------------------------------------------------------
create or replace function app.rename_sales_team(
  p_team_id     uuid,
  p_name        text,
  p_description text
)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $fn$
declare
  v_ws    uuid;
  v_actor uuid;
  v_name  text;
  v_old   text;
begin
  if not app.current_user_is_owner_admin() then return 'not_permitted'; end if;

  v_ws    := app.current_workspace_id();
  v_actor := app.current_user_profile_id();
  v_name  := btrim(coalesce(p_name, ''));

  if v_name = '' then return 'invalid_name'; end if;
  if char_length(v_name) > 60 then return 'name_too_long'; end if;
  if p_description is not null and char_length(p_description) > 500 then
    return 'description_too_long';
  end if;

  if not app.lock_sales_team_prelude() then return 'not_permitted'; end if;

  select name into v_old
    from public.sales_teams
   where workspace_id = v_ws and id = p_team_id
     for update;
  if not found then return 'unknown_team'; end if;

  if exists (
    select 1 from public.sales_teams
     where workspace_id = v_ws and id <> p_team_id
       and lower(name) = lower(v_name)
  ) then
    return 'name_taken';
  end if;

  update public.sales_teams
     set name = v_name,
         description = nullif(btrim(coalesce(p_description, '')), ''),
         updated_by_user_profile_id = v_actor
   where workspace_id = v_ws and id = p_team_id;

  /* History keeps the wording it had, so an audit trail still reads. */
  insert into public.sales_team_activities
    (workspace_id, sales_team_id, kind, actor_user_profile_id, detail)
  values (v_ws, p_team_id, 'team_renamed'::public.sales_team_activity_kind,
          v_actor, v_old);

  return 'ok';
exception
  when unique_violation then return 'conflict';
end
$fn$;

create or replace function app.add_or_transfer_team_member(
  p_team_id          uuid,
  p_user_profile_id  uuid,
  p_expected_source  uuid,
  p_confirm_transfer boolean
)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $fn$
declare
  v_ws     uuid;
  v_placed text;
begin
  if not app.current_user_is_owner_admin() then return 'not_permitted'; end if;
  v_ws := app.current_workspace_id();

  if not app.lock_sales_team_prelude() then return 'not_permitted'; end if;

  perform 1 from public.sales_teams
   where workspace_id = v_ws and id = p_team_id
     for update;
  if not found then return 'unknown_team'; end if;

  v_placed := app.sales_team_place_member(
    p_team_id, p_user_profile_id, p_expected_source, p_confirm_transfer);

  return v_placed;
exception
  when unique_violation then return 'conflict';
end
$fn$;

create or replace function app.remove_team_member(
  p_team_id         uuid,
  p_user_profile_id uuid
)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $fn$
declare
  v_ws      uuid;
  v_actor   uuid;
  v_member  uuid;
  v_status  public.sales_team_status;
begin
  if not app.current_user_is_owner_admin() then return 'not_permitted'; end if;

  v_ws    := app.current_workspace_id();
  v_actor := app.current_user_profile_id();

  if not app.lock_sales_team_prelude() then return 'not_permitted'; end if;

  select status into v_status
    from public.sales_teams
   where workspace_id = v_ws and id = p_team_id
     for update;
  if not found then return 'unknown_team'; end if;

  select id into v_member
    from public.sales_team_memberships
   where workspace_id    = v_ws
     and sales_team_id   = p_team_id
     and user_profile_id = p_user_profile_id
     and status = 'active'::public.sales_team_membership_status
     for update;
  if not found then return 'not_a_member'; end if;

  /* §163.3: a team must not be left active without a Team Lead. Replacing
     first is the caller's move, not a silent one taken here. */
  if v_status = 'active'::public.sales_team_status and exists (
    select 1 from public.sales_team_lead_periods
     where workspace_id = v_ws and membership_id = v_member and ended_at is null
  ) then
    return 'is_team_lead';
  end if;

  update public.sales_team_lead_periods
     set ended_at = greatest(clock_timestamp(), started_at),
         ended_by_user_profile_id = v_actor
   where workspace_id = v_ws and membership_id = v_member and ended_at is null;

  update public.sales_team_memberships
     set status = 'ended'::public.sales_team_membership_status,
         ended_at = greatest(clock_timestamp(), joined_at),
         ended_by_user_profile_id = v_actor
   where id = v_member;

  insert into public.sales_team_activities
    (workspace_id, sales_team_id, kind, actor_user_profile_id,
     subject_user_profile_id)
  values (v_ws, p_team_id, 'member_removed'::public.sales_team_activity_kind,
          v_actor, p_user_profile_id);

  return 'ok';
end
$fn$;

create or replace function app.designate_team_lead(
  p_team_id         uuid,
  p_user_profile_id uuid
)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $fn$
declare
  v_ws      uuid;
  v_actor   uuid;
  v_member  uuid;
  v_open    uuid;
begin
  if not app.current_user_is_owner_admin() then return 'not_permitted'; end if;

  v_ws    := app.current_workspace_id();
  v_actor := app.current_user_profile_id();

  if not app.lock_sales_team_prelude() then return 'not_permitted'; end if;

  perform 1 from public.sales_teams
   where workspace_id = v_ws and id = p_team_id
     for update;
  if not found then return 'unknown_team'; end if;

  /* §163.3: "The Team Lead must be an active member of that same team.
     Selecting a user who is not an active member of the team is invalid." */
  select id into v_member
    from public.sales_team_memberships
   where workspace_id    = v_ws
     and sales_team_id   = p_team_id
     and user_profile_id = p_user_profile_id
     and status = 'active'::public.sales_team_membership_status
     for update;
  if not found then return 'not_a_member'; end if;

  select id into v_open
    from public.sales_team_lead_periods
   where workspace_id = v_ws and sales_team_id = p_team_id and ended_at is null
     for update;

  if v_open is not null then
    if exists (
      select 1 from public.sales_team_lead_periods
       where id = v_open and membership_id = v_member
    ) then
      return 'already_team_lead';
    end if;

    update public.sales_team_lead_periods
       set ended_at = greatest(clock_timestamp(), started_at),
         ended_by_user_profile_id = v_actor
     where id = v_open;

    insert into public.sales_team_activities
      (workspace_id, sales_team_id, kind, actor_user_profile_id,
       subject_user_profile_id)
    select v_ws, p_team_id, 'team_lead_ended'::public.sales_team_activity_kind,
           v_actor, m.user_profile_id
      from public.sales_team_lead_periods p
      join public.sales_team_memberships m
        on m.workspace_id = p.workspace_id and m.id = p.membership_id
     where p.id = v_open;
  end if;

  /* A NEW period. The former one keeps its own row, which is how leadership
     that changed hands during one membership stays visible (§163.15). */
  insert into public.sales_team_lead_periods
    (workspace_id, sales_team_id, membership_id, started_by_user_profile_id)
  values (v_ws, p_team_id, v_member, v_actor);

  insert into public.sales_team_activities
    (workspace_id, sales_team_id, kind, actor_user_profile_id,
     subject_user_profile_id)
  values (v_ws, p_team_id, 'team_lead_designated'::public.sales_team_activity_kind,
          v_actor, p_user_profile_id);

  return 'ok';
exception
  when unique_violation then return 'conflict';
end
$fn$;

-- §163.1's team deactivation, in full and in one transaction.
create or replace function app.deactivate_sales_team(p_team_id uuid)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $fn$
declare
  v_ws     uuid;
  v_actor  uuid;
  v_status public.sales_team_status;
begin
  if not app.current_user_is_owner_admin() then return 'not_permitted'; end if;

  v_ws    := app.current_workspace_id();
  v_actor := app.current_user_profile_id();

  if not app.lock_sales_team_prelude() then return 'not_permitted'; end if;

  select status into v_status
    from public.sales_teams
   where workspace_id = v_ws and id = p_team_id
     for update;
  if not found then return 'unknown_team'; end if;
  if v_status = 'inactive'::public.sales_team_status then return 'ok'; end if;

  /*
   * §163.1 asks for five things. Three are below. The other two — deactivate
   * every rule targeting the team, and empty its rotation pool — are NO-OPS
   * because neither a rule table nor rotation state exists yet (Milestone 5).
   * Written here rather than omitted, so the place to add them is named.
   */
  update public.sales_teams
     set status = 'inactive'::public.sales_team_status,
         updated_by_user_profile_id = v_actor
   where workspace_id = v_ws and id = p_team_id;

  update public.sales_team_lead_periods
     set ended_at = greatest(clock_timestamp(), started_at),
         ended_by_user_profile_id = v_actor
   where workspace_id = v_ws and sales_team_id = p_team_id and ended_at is null;

  update public.sales_team_memberships
     set status = 'ended'::public.sales_team_membership_status,
         ended_at = greatest(clock_timestamp(), joined_at),
         ended_by_user_profile_id = v_actor
   where workspace_id  = v_ws
     and sales_team_id = p_team_id
     and status = 'active'::public.sales_team_membership_status;

  /*
   * Nothing above touches `leads`, `lead_activities` or any ownership column.
   * §163.1: "Deactivating a team must not change any Lead's Record Owner,
   * reassign any existing record, or delete membership history, Team Lead
   * history, rule history, stored rotation state, Lead assignment history or
   * the failure history of Leads in Assignment Required."
   */
  insert into public.sales_team_activities
    (workspace_id, sales_team_id, kind, actor_user_profile_id)
  values (v_ws, p_team_id, 'team_deactivated'::public.sales_team_activity_kind,
          v_actor);

  return 'ok';
end
$fn$;

-- §163.12's guarded reactivation. A separate, validating operation — never a
-- toggle. It restores nothing: members and the Team Lead must have been put
-- in place first, each as a NEW period, and this only checks and flips.
create or replace function app.reactivate_sales_team(p_team_id uuid)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $fn$
declare
  v_ws      uuid;
  v_actor   uuid;
  v_status  public.sales_team_status;
  v_leads   integer;
  v_stale   integer;
begin
  if not app.current_user_is_owner_admin() then return 'not_permitted'; end if;

  v_ws    := app.current_workspace_id();
  v_actor := app.current_user_profile_id();

  if not app.lock_sales_team_prelude() then return 'not_permitted'; end if;

  select status into v_status
    from public.sales_teams
   where workspace_id = v_ws and id = p_team_id
     for update;
  if not found then return 'unknown_team'; end if;
  if v_status = 'active'::public.sales_team_status then return 'ok'; end if;

  /* §163.12: "A team may become Active only when it has exactly one active
     Team Lead and every active member is an active workspace user." Both are
     checked HERE, with the rows locked, and applied in the same statement —
     so the team is never exposed as Active without a lead. */
  select count(*) into v_leads
    from public.sales_team_lead_periods p
    join public.sales_team_memberships m
      on m.workspace_id = p.workspace_id and m.id = p.membership_id
   where p.workspace_id  = v_ws
     and p.sales_team_id = p_team_id
     and p.ended_at is null
     and m.status = 'active'::public.sales_team_membership_status;

  if v_leads <> 1 then return 'team_lead_required'; end if;

  select count(*) into v_stale
    from public.sales_team_memberships m
    join public.workspace_memberships w
      on w.workspace_id = m.workspace_id and w.user_profile_id = m.user_profile_id
   where m.workspace_id  = v_ws
     and m.sales_team_id = p_team_id
     and m.status = 'active'::public.sales_team_membership_status
     and w.status <> 'active'::public.workspace_membership_status;

  if v_stale > 0 then return 'inactive_members'; end if;

  /* §163.12 step 5 — "select which Lead assignment rules to reactivate. None
     is reactivated automatically." A NO-OP: no rule table exists yet. */

  update public.sales_teams
     set status = 'active'::public.sales_team_status,
         updated_by_user_profile_id = v_actor
   where workspace_id = v_ws and id = p_team_id;

  insert into public.sales_team_activities
    (workspace_id, sales_team_id, kind, actor_user_profile_id)
  values (v_ws, p_team_id, 'team_reactivated'::public.sales_team_activity_kind,
          v_actor);

  return 'ok';
end
$fn$;

-- ---------------------------------------------------------------------------
-- §160, extended: deactivating a workspace member
-- ---------------------------------------------------------------------------
-- The body below is 20261016090000's, UNCHANGED down to the UPDATE, with two
-- rules added after it. Its authority check, its post-lock re-check, its lock
-- order and its last-Owner/Admin rule are preserved exactly; nothing that
-- protected a workspace before this file protects it less.
--
-- WHAT IS ENFORCED WHERE, AND WHY IT DIFFERS
--
-- §160's "reassign active work first" precondition for LEADS lives in the
-- gateway (`deactivateMember`), which calls this routine and then
-- `app.count_leads_owned_by` in the SAME transaction and rolls back when the
-- count is non-zero — or when it is NULL, which means the count refused and
-- is deliberately not read as zero. That stays exactly where it is.
--
-- The Team Lead rule is different in kind. It is a STRUCTURAL invariant —
-- §163.3's "a team must not be left active without a Team Lead" — and must
-- hold however the status is changed, including a call that does not come
-- through the gateway. So it lives HERE, in the routine. The deferred
-- constraint trigger added above is the third line: it refuses at COMMIT if
-- any path at all leaves an active team membership attached to a deactivated
-- workspace member.
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
  v_actor        uuid;
  v_member       uuid;
  v_team         uuid;
begin
  if not app.current_user_is_owner_admin() then
    return 'not_permitted';
  end if;

  v_ws    := app.current_workspace_id();
  v_actor := app.current_user_profile_id();

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

  -- Re-check the CALLER, now that the locks are held. (Unchanged: see the
  -- original routine for why a VOLATILE function must re-read this.)
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

  -- §160: the last active Owner/Admin cannot be deactivated. Unchanged.
  if v_status = 'inactive'::public.workspace_membership_status
     and v_role = 'owner_admin'::public.workspace_role
     and v_current = 'active'::public.workspace_membership_status
     and v_owner_count <= 1 then
    return 'last_owner_admin';
  end if;

  if v_status = 'inactive'::public.workspace_membership_status then
    /*
     * §160 and §163.3: "If the user is a Team Lead, a replacement Team Lead
     * must be designated, or the team explicitly deactivated, before
     * deactivation is completed." Refused, not resolved — choosing a
     * successor is an administrative decision, never a side effect.
     */
    select m.id, m.sales_team_id into v_member, v_team
      from public.sales_team_memberships m
     where m.workspace_id    = v_ws
       and m.user_profile_id = p_user_profile_id
       and m.status = 'active'::public.sales_team_membership_status
       for update;

    if v_member is not null and exists (
      select 1
        from public.sales_team_lead_periods p
        join public.sales_teams t
          on t.workspace_id = p.workspace_id and t.id = p.sales_team_id
       where p.workspace_id  = v_ws
         and p.membership_id = v_member
         and p.ended_at is null
         and t.status = 'active'::public.sales_team_status
    ) then
      return 'leads_sales_team';
    end if;

    /*
     * §160: deactivation "ends their active Sales Team membership, which is
     * retained as history". Ended, never deleted, and never reopened by a
     * later reactivation — §160 again: "Reactivating the user does not
     * automatically restore … previous Sales Team membership".
     */
    if v_member is not null then
      update public.sales_team_lead_periods
         set ended_at = greatest(clock_timestamp(), started_at),
         ended_by_user_profile_id = v_actor
       where workspace_id = v_ws and membership_id = v_member and ended_at is null;

      update public.sales_team_memberships
         set status = 'ended'::public.sales_team_membership_status,
             ended_at = greatest(clock_timestamp(), joined_at),
             ended_by_user_profile_id = v_actor
       where id = v_member;

      insert into public.sales_team_activities
        (workspace_id, sales_team_id, kind, actor_user_profile_id,
         subject_user_profile_id)
      values (v_ws, v_team, 'member_removed'::public.sales_team_activity_kind,
              v_actor, p_user_profile_id);
    end if;
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
alter function app.lock_sales_team_prelude()                       owner to limenzy_teams;
alter function app.sales_team_place_member(uuid, uuid, uuid, boolean) owner to limenzy_teams;
alter function app.create_sales_team(text, text, uuid, uuid, boolean) owner to limenzy_teams;
alter function app.rename_sales_team(uuid, text, text)             owner to limenzy_teams;
alter function app.add_or_transfer_team_member(uuid, uuid, uuid, boolean) owner to limenzy_teams;
alter function app.remove_team_member(uuid, uuid)                  owner to limenzy_teams;
alter function app.designate_team_lead(uuid, uuid)                 owner to limenzy_teams;
alter function app.deactivate_sales_team(uuid)                     owner to limenzy_teams;
alter function app.reactivate_sales_team(uuid)                     owner to limenzy_teams;

revoke all on function app.lock_sales_team_prelude()                       from public;
revoke all on function app.sales_team_place_member(uuid, uuid, uuid, boolean) from public;
revoke all on function app.create_sales_team(text, text, uuid, uuid, boolean) from public;
revoke all on function app.rename_sales_team(uuid, text, text)             from public;
revoke all on function app.add_or_transfer_team_member(uuid, uuid, uuid, boolean) from public;
revoke all on function app.remove_team_member(uuid, uuid)                  from public;
revoke all on function app.designate_team_lead(uuid, uuid)                 from public;
revoke all on function app.deactivate_sales_team(uuid)                     from public;
revoke all on function app.reactivate_sales_team(uuid)                     from public;

-- The two internal helpers are NOT granted to limenzy_app: they assume locks
-- their callers hold and authority their callers established.
grant execute on function app.create_sales_team(text, text, uuid, uuid, boolean) to limenzy_app;
grant execute on function app.rename_sales_team(uuid, text, text)             to limenzy_app;
grant execute on function app.add_or_transfer_team_member(uuid, uuid, uuid, boolean) to limenzy_app;
grant execute on function app.remove_team_member(uuid, uuid)                  to limenzy_app;
grant execute on function app.designate_team_lead(uuid, uuid)                 to limenzy_app;
grant execute on function app.deactivate_sales_team(uuid)                     to limenzy_app;
grant execute on function app.reactivate_sales_team(uuid)                     to limenzy_app;

comment on function app.create_sales_team(text, text, uuid, uuid, boolean) is
  'Spec §163.1–§163.4. Creates a team, its first membership period and its '
  'first Team Lead period in one transaction, optionally transferring the '
  'lead from another team when the caller has confirmed that exact source.';
comment on function app.deactivate_sales_team(uuid) is
  'Spec §163.1. Ends every active membership and the Team Lead period, and '
  'changes no Lead, no Record Owner and no history.';
comment on function app.reactivate_sales_team(uuid) is
  'Spec §163.12. Validates and activates atomically. Restores no membership, '
  'no Team Lead and no eligibility.';
comment on function app.set_member_status(uuid, text) is
  'Spec §159, §160, §163.3. Switches a membership on or off. Refuses to '
  'deactivate the last active Owner/Admin, or a user who leads an active '
  'Sales Team; otherwise ends their team membership as history.';

revoke create on schema app from limenzy_teams;

-- ---------------------------------------------------------------------------
-- Assertions — what this migration claims, checked rather than trusted
-- ---------------------------------------------------------------------------
do $$
begin
  -- Append-only history: the absence of the privilege IS the mechanism.
  if has_table_privilege('limenzy_app', 'public.sales_team_activities', 'UPDATE')
     or has_table_privilege('limenzy_app', 'public.sales_team_activities', 'DELETE')
     or has_table_privilege('limenzy_teams', 'public.sales_team_activities', 'UPDATE')
     or has_table_privilege('limenzy_teams', 'public.sales_team_activities', 'DELETE')
  then
    raise exception 'Sales Team history is not append-only';
  end if;

  -- No application role may write a team or a membership directly.
  if has_table_privilege('limenzy_app', 'public.sales_teams', 'INSERT')
     or has_table_privilege('limenzy_app', 'public.sales_teams', 'UPDATE')
     or has_table_privilege('limenzy_app', 'public.sales_team_memberships', 'INSERT')
     or has_table_privilege('limenzy_app', 'public.sales_team_memberships', 'UPDATE')
  then
    raise exception 'the runtime role can write Sales Teams outside a routine';
  end if;

  -- A membership can never be moved to another workspace, team or person.
  if has_column_privilege('limenzy_teams', 'public.sales_team_memberships', 'workspace_id', 'UPDATE')
     or has_column_privilege('limenzy_teams', 'public.sales_team_memberships', 'sales_team_id', 'UPDATE')
     or has_column_privilege('limenzy_teams', 'public.sales_team_memberships', 'user_profile_id', 'UPDATE')
  then
    raise exception 'a Sales Team membership can be moved rather than ended';
  end if;

  -- The lock-only privilege really is lock-only.
  if has_column_privilege('limenzy_teams', 'public.workspace_memberships', 'role', 'UPDATE')
  then
    raise exception 'limenzy_teams can change a workspace role';
  end if;

  -- limenzy_teams is never reachable from the runtime role.
  if pg_has_role('limenzy_app', 'limenzy_teams', 'USAGE') then
    raise exception 'limenzy_app can assume limenzy_teams';
  end if;
end
$$;
