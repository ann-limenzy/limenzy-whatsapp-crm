-- Milestone 3A — Lead Pipeline and Lead Sources (spec §34, §164, §165, §172).
--
-- Settings only. There is no `leads` table yet and this file does not create
-- one; it creates the two configuration tables a Lead will later point at.
--
-- WHAT IS DELIBERATELY NOT ENFORCED HERE, AND MUST BE
--
-- §34 and §165 require that "a stage containing active Leads cannot be
-- deactivated until those Leads are moved". That cannot be enforced or tested
-- while no Leads exist, and nothing below pretends otherwise. The Lead slice
-- MUST add it, and the design below is arranged so that it can be added in one
-- place rather than retrofitted:
--
--   * `workspace_lead_stages` carries a UNIQUE (workspace_id, id) purely so a
--     future `leads` table can declare
--         foreign key (workspace_id, stage_id)
--           references public.workspace_lead_stages (workspace_id, id)
--     A single-column reference would let a Lead in one workspace point at
--     another workspace's stage; the composite one makes that unrepresentable
--     rather than merely forbidden. Same for sources.
--   * Deactivation already takes a row lock (see THE LOCKING CONTRACT below),
--     so the occupancy check has a place to live where it cannot race.
--
-- THE LOCKING CONTRACT — what future Lead writes must follow
--
-- Deactivating a stage and assigning a Lead to one are a classic check-then-act
-- pair: a Lead may be written against a stage that a concurrent transaction is
-- in the middle of closing. The contract, which BOTH sides must honour:
--
--   1. Any write that sets or changes `leads.stage_id` must FIRST take
--        select 1 from public.workspace_lead_stages
--         where workspace_id = <ws> and id = <stage> for update;
--      in the same transaction, and then re-read `is_active` from that locked
--      row. A stage read without the lock may already be on its way out.
--   2. Deactivating a stage is an UPDATE of that row, which takes the same
--      row lock as part of doing the write. No extra routine is needed, and
--      the future occupancy check belongs in a BEFORE UPDATE trigger, which
--      runs once that lock is already held.
--
-- Because both sides lock the same row, one of them waits; under READ
-- COMMITTED the waiter then re-reads the committed row and sees the other's
-- decision. Neither ordering can produce an active Lead in a deactivated
-- stage. This mirrors the ordering argument recorded for acceptance in
-- architecture-decisions §6.5.
--
-- WHY NO NEW DEFINER ROLE
--
-- None is needed, and adding one would be privilege for its own sake:
--
--   * Administration is three ordinary policies for limenzy_app. A policy on
--     a NEW table may read workspace_memberships — whose own limenzy_app
--     policy reads user_profiles and stops — so the 42P17 recursion that
--     forced routines in Milestone 2B does not arise here.
--   * The cross-row invariants (exactly one Won and one Lost, Won last, at
--     least one active ordinary stage) are enforced by DEFERRED CONSTRAINT
--     TRIGGERS owned by the table owner, which need no role of their own and
--     cannot be bypassed by any caller.
--   * Seeding a new workspace reuses limenzy_bootstrap, which exists for
--     exactly this — creating a workspace's initial rows — and gains INSERT on
--     these two tables and nothing else.

begin;

-- ---------------------------------------------------------------------------
-- The stage kind
-- ---------------------------------------------------------------------------
-- 'active' is an ordinary pipeline column. 'won' is the final column and an
-- outcome; 'lost' is an outcome that is NOT a column (§34: "Lost is treated as
-- a closed outcome rather than an active pipeline column").
do $$
begin
  if not exists (select 1 from pg_catalog.pg_type where typname = 'lead_stage_kind') then
    create type public.lead_stage_kind as enum ('active', 'won', 'lost');
  end if;
end
$$;

/* Every type in `public` belongs to the schema owner, like the two enums the
   foundation migration created. */
alter type public.lead_stage_kind owner to limenzy_owner;

-- ---------------------------------------------------------------------------
-- Stages
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_lead_stages (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id) on delete restrict,

  name text not null,

  /* Pipeline order. Named `sort_order` rather than `position`, which the
     parser reads as the position() function in some contexts. Every row
     carries one, including 'lost', which is simply never rendered. */
  sort_order integer not null,

  kind public.lead_stage_kind not null default 'active',

  /* Deactivate, never delete (§29, §34, §165): "historical stage information
     must be retained", and a Lead will reference this row by foreign key. */
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workspace_lead_stages_name_not_blank
    check (name = btrim(name) and btrim(name) <> ''),
  constraint workspace_lead_stages_name_length
    check (char_length(name) <= 60),
  constraint workspace_lead_stages_sort_order_positive
    check (sort_order > 0),
  /* An outcome is always available to move a Lead to (§34: "The system must
     always retain a Won outcome and a Lost outcome"). */
  constraint workspace_lead_stages_outcome_always_active
    check (kind = 'active' or is_active),

  /* The composite key a future `leads` table references. See the header. */
  constraint workspace_lead_stages_workspace_id_key unique (workspace_id, id)
);

/* Reordering renumbers several rows in one statement, so uniqueness is checked
   at COMMIT rather than per row — otherwise any swap would collide with
   itself halfway through. */
alter table public.workspace_lead_stages
  drop constraint if exists workspace_lead_stages_sort_order_key;
alter table public.workspace_lead_stages
  add constraint workspace_lead_stages_sort_order_key
  unique (workspace_id, sort_order) deferrable initially deferred;

/* §164/§165 are silent on duplicate names, but two stages called the same
   thing are indistinguishable on screen. Scoped to ACTIVE rows so a name may
   be reused after deactivation, and case-insensitive so "New" and "new" do not
   both exist. */
create unique index if not exists workspace_lead_stages_active_name_key
  on public.workspace_lead_stages (workspace_id, lower(name))
  where is_active;

/* Exactly one Won and one Lost per workspace. */
create unique index if not exists workspace_lead_stages_won_key
  on public.workspace_lead_stages (workspace_id) where kind = 'won';
create unique index if not exists workspace_lead_stages_lost_key
  on public.workspace_lead_stages (workspace_id) where kind = 'lost';

create index if not exists workspace_lead_stages_workspace_idx
  on public.workspace_lead_stages (workspace_id, sort_order);

comment on table public.workspace_lead_stages is
  'Spec §34, §165. Configurable pipeline stages. Won is the final column and '
  'Lost is an outcome outside the pipeline; both are permanent. Rows are '
  'deactivated, never deleted, so Lead history keeps its stage.';

-- ---------------------------------------------------------------------------
-- Sources
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_lead_sources (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id) on delete restrict,

  name text not null,

  /* §164: "Deactivating a source prevents future selection but retains
     existing Lead history." */
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workspace_lead_sources_name_not_blank
    check (name = btrim(name) and btrim(name) <> ''),
  constraint workspace_lead_sources_name_length
    check (char_length(name) <= 60),

  constraint workspace_lead_sources_workspace_id_key unique (workspace_id, id)
);

create unique index if not exists workspace_lead_sources_active_name_key
  on public.workspace_lead_sources (workspace_id, lower(name))
  where is_active;

create index if not exists workspace_lead_sources_workspace_idx
  on public.workspace_lead_sources (workspace_id);

comment on table public.workspace_lead_sources is
  'Spec §164. Configurable Lead sources. Deactivated rather than deleted, so '
  'existing Lead history keeps its source.';

-- ---------------------------------------------------------------------------
-- Ownership, row-level security and the Data API
-- ---------------------------------------------------------------------------
alter table public.workspace_lead_stages  owner to limenzy_owner;
alter table public.workspace_lead_sources owner to limenzy_owner;

drop trigger if exists set_updated_at on public.workspace_lead_stages;
create trigger set_updated_at
  before update on public.workspace_lead_stages
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.workspace_lead_sources;
create trigger set_updated_at
  before update on public.workspace_lead_sources
  for each row execute function public.set_updated_at();

alter table public.workspace_lead_stages  enable row level security;
alter table public.workspace_lead_stages  force row level security;
alter table public.workspace_lead_sources enable row level security;
alter table public.workspace_lead_sources force row level security;

/* Supabase grants new tables in `public` to the Data API roles by default. */
revoke all on public.workspace_lead_stages
  from anon, authenticated, service_role;
revoke all on public.workspace_lead_sources
  from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The cross-row invariants
-- ---------------------------------------------------------------------------
-- DEFERRED, so a reorder may renumber freely inside its transaction and is
-- judged only on the state it commits. Owned by the table owner, so no caller
-- can route around them.
create or replace function public.workspace_lead_stages_check_shape()
returns trigger
language plpgsql
/*
 * SECURITY INVOKER, deliberately. It has to COUNT rows, and the obvious fix —
 * running as the table owner — would need a policy naming limenzy_owner, and
 * Phase 1's rule is that NO policy ever does: FORCE ROW LEVEL SECURITY is
 * what subjects the owner to policies in the first place, so a blanket one
 * would partly undo it. Each caller reads through its own policy instead:
 * limenzy_app sees its own workspace, limenzy_bootstrap sees the workspace it
 * is in the middle of creating.
 *
 * That has a consequence worth stating. A DEFERRED trigger runs at COMMIT, as
 * whichever role commits — not necessarily the one that wrote the rows. For
 * workspace creation those differ: limenzy_bootstrap writes the rows inside
 * app.create_initial_workspace, and limenzy_app commits. So that routine ends
 * by forcing this constraint immediate while it still holds the bootstrap
 * role; see the comment there.
 *
 * The failure direction is safe either way: a role that cannot see the rows
 * counts zero outcomes and the first test below refuses the transaction. An
 * invisible pipeline can never read as a valid one.
 */
set search_path = ''
as $trg$
declare
  v_workspace uuid := coalesce(new.workspace_id, old.workspace_id);
  v_won_order integer;
  v_active_ordinary integer;
  v_outcomes integer;
begin
  /*
   * A workspace whose stages have ALL been removed has nothing left to keep
   * in shape, and the invariant is about what a workspace keeps. Without this
   * the table could never be emptied for a workspace at all — not by a later
   * migration, and not by a test tearing its fixtures down.
   *
   * It is not a hole in the rule. No application role can delete from this
   * table: limenzy_app holds SELECT, INSERT and UPDATE only, limenzy_bootstrap
   * holds SELECT and INSERT, and retiring a stage is `is_active = false`,
   * which is an UPDATE and still faces every test below. Reaching this branch
   * takes a DELETE, which only the owner of the table can issue.
   */
  if tg_op = 'DELETE' and not exists (
    select 1 from public.workspace_lead_stages
     where workspace_id = v_workspace
  ) then
    return null;
  end if;

  select count(*) into v_outcomes
    from public.workspace_lead_stages
   where workspace_id = v_workspace and kind <> 'active'::public.lead_stage_kind;
  if v_outcomes <> 2 then
    raise exception 'a workspace must keep exactly one Won and one Lost stage'
      using errcode = '23514';
  end if;

  /* §34: Won is the final pipeline column, so no ordinary column may sit
     after it. Lost is not a column and is not compared. */
  select sort_order into v_won_order
    from public.workspace_lead_stages
   where workspace_id = v_workspace and kind = 'won'::public.lead_stage_kind;

  if exists (
    select 1 from public.workspace_lead_stages
     where workspace_id = v_workspace
       and kind = 'active'::public.lead_stage_kind
       and sort_order >= v_won_order
  ) then
    raise exception 'Won must stay the last stage in the pipeline'
      using errcode = '23514';
  end if;

  /* An empty pipeline would leave a new Lead nowhere to start (§32: the stage
     defaults to the first active stage). */
  select count(*) into v_active_ordinary
    from public.workspace_lead_stages
   where workspace_id = v_workspace
     and kind = 'active'::public.lead_stage_kind
     and is_active;
  if v_active_ordinary = 0 then
    raise exception 'a workspace must keep at least one active pipeline stage'
      using errcode = '23514';
  end if;

  return null;
end
$trg$;

alter function public.workspace_lead_stages_check_shape() owner to limenzy_owner;

drop trigger if exists check_shape on public.workspace_lead_stages;
create constraint trigger check_shape
  after insert or update or delete on public.workspace_lead_stages
  deferrable initially deferred
  for each row execute function public.workspace_lead_stages_check_shape();

/* Row-local rules, refused immediately rather than at COMMIT: a stage's kind
   is fixed for life, and Won and Lost can never be renamed out of existence
   or deactivated. */
create or replace function public.workspace_lead_stages_guard_row()
returns trigger
language plpgsql
set search_path = ''
as $trg$
begin
  /* 23514 (check_violation), not 42501: a rule refusing a change is not the
     same as row-level security refusing a caller, and the gateway maps the
     two to different words. Raising 42501 here made "Won cannot be
     deactivated" read as "you do not have permission". */
  if new.kind is distinct from old.kind then
    raise exception 'a stage cannot change kind' using errcode = '23514';
  end if;
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'a stage cannot move to another workspace'
      using errcode = '23514';
  end if;
  if old.kind <> 'active'::public.lead_stage_kind and not new.is_active then
    raise exception 'the Won and Lost stages cannot be deactivated'
      using errcode = '23514';
  end if;
  return new;
end
$trg$;

alter function public.workspace_lead_stages_guard_row() owner to limenzy_owner;

drop trigger if exists guard_row on public.workspace_lead_stages;
create trigger guard_row
  before update on public.workspace_lead_stages
  for each row execute function public.workspace_lead_stages_guard_row();

create or replace function public.workspace_lead_sources_guard_row()
returns trigger
language plpgsql
set search_path = ''
as $trg$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'a source cannot move to another workspace'
      using errcode = '23514';
  end if;
  return new;
end
$trg$;

alter function public.workspace_lead_sources_guard_row() owner to limenzy_owner;

drop trigger if exists guard_row on public.workspace_lead_sources;
create trigger guard_row
  before update on public.workspace_lead_sources
  for each row execute function public.workspace_lead_sources_guard_row();

-- ---------------------------------------------------------------------------
-- The runtime role: read for members, write for Owner/Admin
-- ---------------------------------------------------------------------------
-- SELECT is deliberately every active member, not just Owner/Admin: a Lead
-- form has to render the stage and source a Lead is in, and §162.1 governs
-- which LEADS a user sees, not which configuration vocabulary exists.
grant select on public.workspace_lead_stages  to limenzy_app;
grant select on public.workspace_lead_sources to limenzy_app;

grant insert (id, workspace_id, name, sort_order, kind)
  on public.workspace_lead_stages to limenzy_app;
grant update (name, sort_order, is_active)
  on public.workspace_lead_stages to limenzy_app;

grant insert (id, workspace_id, name) on public.workspace_lead_sources to limenzy_app;
grant update (name, is_active) on public.workspace_lead_sources to limenzy_app;

-- No DELETE on either: deactivate, never delete.

drop policy if exists workspace_lead_stages_member_select on public.workspace_lead_stages;
create policy workspace_lead_stages_member_select on public.workspace_lead_stages
  for select to limenzy_app
  using (workspace_id = app.current_workspace_id());

drop policy if exists workspace_lead_stages_owner_admin_insert on public.workspace_lead_stages;
create policy workspace_lead_stages_owner_admin_insert on public.workspace_lead_stages
  for insert to limenzy_app
  with check (
    workspace_id = app.current_workspace_id()
    and app.current_user_is_owner_admin()
    /* Only ordinary columns may be added. The two outcomes are created with
       the workspace and are never added again. */
    and kind = 'active'::public.lead_stage_kind
  );

drop policy if exists workspace_lead_stages_owner_admin_update on public.workspace_lead_stages;
create policy workspace_lead_stages_owner_admin_update on public.workspace_lead_stages
  for update to limenzy_app
  using (
    workspace_id = app.current_workspace_id()
    and app.current_user_is_owner_admin()
  )
  with check (
    workspace_id = app.current_workspace_id()
    and app.current_user_is_owner_admin()
  );

drop policy if exists workspace_lead_sources_member_select on public.workspace_lead_sources;
create policy workspace_lead_sources_member_select on public.workspace_lead_sources
  for select to limenzy_app
  using (workspace_id = app.current_workspace_id());

drop policy if exists workspace_lead_sources_owner_admin_insert on public.workspace_lead_sources;
create policy workspace_lead_sources_owner_admin_insert on public.workspace_lead_sources
  for insert to limenzy_app
  with check (
    workspace_id = app.current_workspace_id()
    and app.current_user_is_owner_admin()
  );

drop policy if exists workspace_lead_sources_owner_admin_update on public.workspace_lead_sources;
create policy workspace_lead_sources_owner_admin_update on public.workspace_lead_sources
  for update to limenzy_app
  using (
    workspace_id = app.current_workspace_id()
    and app.current_user_is_owner_admin()
  )
  with check (
    workspace_id = app.current_workspace_id()
    and app.current_user_is_owner_admin()
  );

-- ---------------------------------------------------------------------------
-- The defaults, in one place
-- ---------------------------------------------------------------------------
-- Declared as functions so the backfill below and the bootstrap routine cannot
-- drift apart. Pure data: they read no table and need no privilege.
create or replace function app.lead_stage_defaults()
returns table (name text, sort_order integer, kind public.lead_stage_kind)
language sql
immutable
parallel safe
set search_path = ''
as $$
  /* §34: New -> Contacted -> Interested -> Won, with Lost as an outcome
     outside the pipeline. Won is last, and Lost sits after it so the position
     column stays unique and NOT NULL without being rendered. */
  values ('New', 1, 'active'::public.lead_stage_kind),
         ('Contacted', 2, 'active'::public.lead_stage_kind),
         ('Interested', 3, 'active'::public.lead_stage_kind),
         ('Won', 4, 'won'::public.lead_stage_kind),
         ('Lost', 5, 'lost'::public.lead_stage_kind)
$$;

create or replace function app.lead_source_defaults()
returns table (name text)
language sql
immutable
parallel safe
set search_path = ''
as $$
  /* §164. */
  values ('Website'), ('Referral'), ('Walk-in'), ('Campaign'), ('Other')
$$;

alter function app.lead_stage_defaults()  owner to limenzy_owner;
alter function app.lead_source_defaults() owner to limenzy_owner;

revoke all on function app.lead_stage_defaults()  from public;
revoke all on function app.lead_source_defaults() from public;
grant execute on function app.lead_stage_defaults()  to limenzy_bootstrap;
grant execute on function app.lead_source_defaults() to limenzy_bootstrap;

-- ---------------------------------------------------------------------------
-- Seeding a NEW workspace
-- ---------------------------------------------------------------------------
-- limenzy_bootstrap is reused rather than joined by a new role: it exists to
-- create a workspace's initial rows, which is exactly this. It gains INSERT on
-- these two tables and nothing else — no SELECT, no UPDATE, no DELETE.
grant insert (id, workspace_id, name, sort_order, kind)
  on public.workspace_lead_stages to limenzy_bootstrap;
grant insert (id, workspace_id, name)
  on public.workspace_lead_sources to limenzy_bootstrap;

/* The same predicate, and the same reasoning, as `workspaces_bootstrap_insert`
   in 20260921064437: there is nothing identity-shaped on these rows to key on,
   limenzy_bootstrap is NOLOGIN and unreachable except through
   app.create_initial_workspace, and that routine refuses unless the caller has
   no profile at all. The rows it writes are the fixed default set. */
drop policy if exists workspace_lead_stages_bootstrap_insert on public.workspace_lead_stages;
create policy workspace_lead_stages_bootstrap_insert on public.workspace_lead_stages
  for insert to limenzy_bootstrap
  with check (app.current_auth_user_id() is not null);

/*
 * SELECT, solely so the deferred invariant check above can count the rows
 * this role just inserted. Scoped by membership rather than left open: during
 * `app.create_initial_workspace` the claiming membership is written before
 * the seeding, so this matches the new workspace and nothing else. The role
 * is NOLOGIN and reachable only through that routine.
 */
grant select on public.workspace_lead_stages to limenzy_bootstrap;

drop policy if exists workspace_lead_stages_bootstrap_select on public.workspace_lead_stages;
create policy workspace_lead_stages_bootstrap_select on public.workspace_lead_stages
  for select to limenzy_bootstrap
  using (
    exists (
      select 1
        from public.workspace_memberships m
        join public.user_profiles p on p.id = m.user_profile_id
       where m.workspace_id = workspace_lead_stages.workspace_id
         and p.auth_user_id = app.current_auth_user_id()
    )
  );

drop policy if exists workspace_lead_sources_bootstrap_insert on public.workspace_lead_sources;
create policy workspace_lead_sources_bootstrap_insert on public.workspace_lead_sources
  for insert to limenzy_bootstrap
  with check (app.current_auth_user_id() is not null);

-- ---------------------------------------------------------------------------
-- Seeding: the bootstrap routine, replaced
-- ---------------------------------------------------------------------------
-- The body below is 20260921064437's, unchanged, with one step added at the
-- end. Its SECURITY DEFINER owner, empty search_path, pg_catalog-qualified
-- calls, identity-from-GUC rule, three return words and generated identifiers
-- are all preserved; CREATE OR REPLACE keeps the same signature, owner and
-- grants, so nothing about who may call it changes.

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

  -- 6. The workspace's default Lead pipeline and sources (§34, §164), in the
  --    same transaction, so a workspace never exists without somewhere to put
  --    a Lead. The default sets come from app.lead_stage_defaults() and
  --    app.lead_source_defaults(), which the backfill below also uses, so the
  --    two cannot drift apart.
  --
  --    Nothing above this point changed. The identity check, the
  --    already-onboarded and access-unavailable answers, the generated
  --    identifiers and the pinned role and status are exactly as
  --    20260921064437 left them.
  insert into public.workspace_lead_stages (id, workspace_id, name, sort_order, kind)
  select pg_catalog.gen_random_uuid(), v_workspace_id, d.name, d.sort_order, d.kind
    from app.lead_stage_defaults() d;

  insert into public.workspace_lead_sources (id, workspace_id, name)
  select pg_catalog.gen_random_uuid(), v_workspace_id, d.name
    from app.lead_source_defaults() d;

  /*
   * Check the pipeline's shape HERE rather than at COMMIT.
   *
   * `check_shape` is a deferred constraint trigger and it is SECURITY
   * INVOKER, so it counts rows through the policies of whichever role is
   * current when it runs. At COMMIT that role is limenzy_app — the caller of
   * this routine — and limenzy_app reads stages through
   * `workspace_id = app.current_workspace_id()`, which is unset during setup
   * because the person has no workspace yet. The check would see no rows and
   * refuse a perfectly valid new workspace.
   *
   * Forcing it immediate runs it inside this routine, where current_user is
   * limenzy_bootstrap and `workspace_lead_stages_bootstrap_select` matches
   * through the membership written a few lines above. The constraint is named
   * rather than `ALL` so no other deferred constraint's timing changes.
   */
  set constraints public.check_shape immediate;

  return 'created';
end
$fn$;

-- Ownership and grants are restated because CREATE OR REPLACE keeps them, and
-- restating is cheap insurance against a replay against a database where they
-- were never set.
alter function app.create_initial_workspace(text, text, text, text, text, text)
  owner to limenzy_bootstrap;
revoke all on function app.create_initial_workspace(text, text, text, text, text, text) from public;
grant execute on function app.create_initial_workspace(text, text, text, text, text, text) to limenzy_app;

-- ---------------------------------------------------------------------------
-- Seeding: workspaces that already exist
-- ---------------------------------------------------------------------------
-- Runs as the migration role, which bypasses row-level security, so no policy
-- has to be widened for a one-off backfill.
--
-- IDEMPOTENT, and that is the point: `where not exists` keys on "this
-- workspace has no stage rows at all", so a workspace that has since been
-- configured — a renamed stage, a reordered pipeline, a deactivated source —
-- is skipped entirely. Re-running this file can never restore a default a
-- workspace deliberately changed.
insert into public.workspace_lead_stages (id, workspace_id, name, sort_order, kind)
select gen_random_uuid(), w.id, d.name, d.sort_order, d.kind
  from public.workspaces w
  cross join app.lead_stage_defaults() d
 where not exists (
   select 1 from public.workspace_lead_stages s where s.workspace_id = w.id
 );

insert into public.workspace_lead_sources (id, workspace_id, name)
select gen_random_uuid(), w.id, d.name
  from public.workspaces w
  cross join app.lead_source_defaults() d
 where not exists (
   select 1 from public.workspace_lead_sources s where s.workspace_id = w.id
 );

-- ---------------------------------------------------------------------------
-- Verify rather than assume
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
  v_workspaces integer;
begin
  -- Every workspace now has a pipeline, and each has exactly one of each
  -- outcome.
  select count(*) into v_workspaces from public.workspaces;
  select count(*) into v_count
    from public.workspaces w
   where not exists (
     select 1 from public.workspace_lead_stages s
      where s.workspace_id = w.id
        and s.kind = 'won'::public.lead_stage_kind
   );
  if v_count <> 0 then
    raise exception '% workspace(s) have no Won stage', v_count;
  end if;

  select count(*) into v_count
    from public.workspaces w
   where not exists (
     select 1 from public.workspace_lead_sources s where s.workspace_id = w.id
   );
  if v_count <> 0 then
    raise exception '% workspace(s) have no Lead sources', v_count;
  end if;

  -- The runtime role may not delete either table, ever.
  if has_table_privilege('limenzy_app', 'public.workspace_lead_stages', 'DELETE')
     or has_table_privilege('limenzy_app', 'public.workspace_lead_sources', 'DELETE') then
    raise exception 'limenzy_app can delete pipeline configuration';
  end if;

  -- limenzy_bootstrap gained INSERT and nothing else.
  select count(*) into v_count
    from information_schema.table_privileges
   where grantee = 'limenzy_bootstrap'
     and table_schema = 'public'
     and table_name in ('workspace_lead_stages', 'workspace_lead_sources')
     and privilege_type in ('UPDATE', 'DELETE');
  if v_count <> 0 then
    raise exception 'limenzy_bootstrap gained UPDATE or DELETE on the new tables';
  end if;

  /* Its one SELECT is on stages only, for the deferred invariant check. */
  if has_table_privilege('limenzy_bootstrap', 'public.workspace_lead_sources', 'SELECT') then
    raise exception 'limenzy_bootstrap gained SELECT on lead sources';
  end if;

  -- Nothing reached the browser-facing roles.
  for v_count in
    select 1
      from unnest(array['anon', 'authenticated', 'service_role']) as r(name)
      cross join unnest(array['public.workspace_lead_stages',
                              'public.workspace_lead_sources']) as t(name)
     where has_table_privilege(r.name, t.name, 'SELECT, INSERT, UPDATE, DELETE')
  loop
    raise exception 'a Data API role holds a privilege on Lead configuration';
  end loop;

  -- The composite keys a future `leads` table needs in order to be
  -- workspace-safe.
  select count(*) into v_count
    from pg_catalog.pg_constraint
   where conname in ('workspace_lead_stages_workspace_id_key',
                     'workspace_lead_sources_workspace_id_key')
     and contype = 'u';
  if v_count <> 2 then
    raise exception 'the workspace-scoped composite keys are missing';
  end if;

  -- The invariant triggers exist; without them the cross-row rules are
  -- advisory rather than enforced.
  select count(*) into v_count
    from pg_catalog.pg_trigger t
   where t.tgrelid = 'public.workspace_lead_stages'::regclass
     and t.tgname in ('check_shape', 'guard_row')
     and not t.tgisinternal;
  if v_count <> 2 then
    raise exception 'a stage invariant trigger is missing (found %)', v_count;
  end if;

  -- The bootstrap routine is still SECURITY DEFINER, still owned by
  -- limenzy_bootstrap, and still pins an empty search_path.
  select count(*) into v_count
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and p.proname = 'create_initial_workspace'
     and p.prosecdef
     and pg_get_userbyid(p.proowner) = 'limenzy_bootstrap'
     and p.proconfig @> array['search_path=""'];
  if v_count <> 1 then
    raise exception 'the bootstrap routine lost its security properties';
  end if;

  -- Earlier milestones' policies are untouched.
  select count(*) into v_count
    from pg_catalog.pg_policy
   where polname in ('user_profiles_self_select',
                     'workspace_memberships_self_select',
                     'workspaces_member_select',
                     'workspaces_owner_admin_update',
                     'workspaces_bootstrap_insert');
  if v_count <> 5 then
    raise exception 'an earlier policy is missing (found %)', v_count;
  end if;

  raise notice 'lead pipeline seeded for % workspace(s)', v_workspaces;
end
$$;

commit;
