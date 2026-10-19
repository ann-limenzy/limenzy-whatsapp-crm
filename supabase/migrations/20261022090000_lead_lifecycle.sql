-- ---------------------------------------------------------------------------
-- Milestone 3C — Lead editing, stage changes and activity history
-- Spec §27, §28, §33, §37, §39, §45, §48, §130.1, §162, §162.1
-- ---------------------------------------------------------------------------
--
-- 3B could create a Lead and read it back. This is the slice where a Lead
-- CHANGES, which brings three problems the create path did not have: two
-- people editing the same record, an outcome that is more than a stage, and a
-- history that has to be true.
--
-- HOW WON AND LOST ARE REPRESENTED
--
--   A Lead's outcome IS its stage. Marking it Won or Lost points `stage_id`
--   at the workspace's `won` or `lost` row, found by the immutable `kind` and
--   never by the label — §34 lets a workspace rename those rows, and a lookup
--   by name would break the moment someone did.
--
--   Verified against the schema before it was built: the only stage rule on
--   `leads` is the composite foreign key, which accepts any stage; `kind`
--   cannot change (the 3A guard refuses it); and the partial unique indexes
--   guarantee exactly one `won` and one `lost` per workspace, so "the
--   workspace's outcome row" is never ambiguous.
--
--   §34 calls Lost "a closed outcome rather than an active pipeline column"
--   and has it chosen from the actions menu. That is a rule about what the
--   PIPELINE VIEW renders, not about where the Lead points, so nothing here
--   conflicts with it; §48's "remove it from the active pipeline" is exactly
--   what moving the stage achieves.
--
--   The occupancy rule therefore already counts only ordinary-stage Leads: a
--   Won Lead has left the ordinary stage. The predicate below says so out
--   loud rather than relying on the reader working it out — it is a
--   clarification, not a change of behaviour.
--
-- WHY A REVISION COLUMN AND NOT `updated_at`
--
--   The stale-edit token has to survive a round trip through the browser
--   exactly. `updated_at` is a `timestamptz` with microsecond precision, and
--   the driver hands it back as a JavaScript `Date` in one runtime and as a
--   string in another — 3B found that the hard way. A `Date` holds
--   milliseconds, so two saves inside the same millisecond become
--   indistinguishable and a comparison starts passing when it should fail.
--   An integer cannot lose precision, so `revision` is the token.
--
-- WHY HISTORY IS THE DATABASE'S JOB AND NOT THE GATEWAY'S
--
--   An earlier draft had the application write every §39 entry beside the
--   change it describes. Measured against the runtime role, that left two
--   open paths: `limenzy_app` could INSERT a Lead with no creation entry and
--   UPDATE any column it holds a grant on with no entry at all. Nothing was
--   privileged about either — they needed only a code path that forgot, and
--   "a history that has to be true" cannot rest on remembering.
--
--   So the table carries its own guarantee, in the smallest form that still
--   leaves authorship with the actor:
--
--     * creation is written BY A TRIGGER, so no Lead can exist without the
--       entry saying where it came from — whatever role inserted it;
--     * every entry is STAMPED with the Lead revision it describes, by a
--       trigger, from the Lead row. No role holds a grant on that column, so
--       it cannot be set, held still or back-dated by a caller;
--     * a material change is checked AT COMMIT against that stamp. An update
--       that moved the revision without leaving an entry for it aborts the
--       whole transaction, which is also what keeps the pair atomic.
--
--   The kinds other than creation are still chosen by the gateway, because
--   `marked_won` and `stage_changed` differ by INTENT rather than by what the
--   row shows. The database checks that an entry exists and belongs to the
--   change; it does not second-guess which one.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT CONTAIN
--
--   * No conversion (§46). There is no `customers` table, so Won offers no
--     Convert button: a control that cannot work is worse than its absence.
--   * No follow-up cancellation (§48). There are no follow-ups to cancel.
--   * No owner reassignment, archive or sharing.
--   Both omissions are recorded as dependencies in
--   `src/server/auth/lead-lifecycle-dependencies.ts`, guarded the way the
--   §160 responsibility registry is guarded.

-- ---------------------------------------------------------------------------
-- The Lost reason — §48, with §33's list
-- ---------------------------------------------------------------------------
-- §48 requires a reason; §33 shows five. Fixed rather than configurable: a
-- configurable list is a Settings screen and a sixth table, and making it
-- configurable later migrates no data because the column keeps whatever was
-- chosen. `other` carries the short note §33 asks for.
do $$
begin
  if not exists (
    select 1 from pg_type t
     where t.typnamespace = 'public'::regnamespace
       and t.typname = 'lead_lost_reason'
  ) then
    create type public.lead_lost_reason as enum (
      'not_interested', 'price', 'chose_competitor', 'unable_to_contact',
      'other'
    );
  end if;
end
$$;

alter type public.lead_lost_reason owner to limenzy_owner;

-- ---------------------------------------------------------------------------
-- What a Lead gains
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists revision integer not null default 1,
  add column if not exists lost_reason public.lead_lost_reason,
  add column if not exists lost_reason_note text;

alter table public.leads
  drop constraint if exists leads_lost_reason_note_length;
alter table public.leads
  add constraint leads_lost_reason_note_length
  check (lost_reason_note is null or char_length(lost_reason_note) <= 500);

/* A note explaining the reason cannot exist without the reason. */
alter table public.leads
  drop constraint if exists leads_lost_reason_note_requires_reason;
alter table public.leads
  add constraint leads_lost_reason_note_requires_reason
  check (lost_reason_note is null or lost_reason is not null);

alter table public.leads
  drop constraint if exists leads_revision_positive;
alter table public.leads
  add constraint leads_revision_positive check (revision > 0);

comment on column public.leads.revision is
  'Spec §37. The stale-edit token: an integer because a timestamp cannot '
  'survive a round trip through a browser without losing precision.';
comment on column public.leads.lost_reason is
  'Spec §48, §33. Set only while the Lead sits in its workspace''s lost '
  'stage; cleared when it is reopened, and kept in activity history either way.';

-- ---------------------------------------------------------------------------
-- The activity history — §27, §39
-- ---------------------------------------------------------------------------
-- §39: "Notes form part of the Lead's permanent activity history." Permanent
-- means append-only: no application role may update or delete a row here, so
-- a history cannot be rewritten by the person it describes.
--
-- Only the kinds this slice can actually emit. §27 lists more — calls,
-- WhatsApp, email, follow-ups, conversion — and each arrives with the feature
-- that produces it. A kind nothing can write would imply coverage that does
-- not exist.
do $$
begin
  if not exists (
    select 1 from pg_type t
     where t.typnamespace = 'public'::regnamespace
       and t.typname = 'lead_activity_kind'
  ) then
    create type public.lead_activity_kind as enum (
      'record_created',
      'details_edited',
      'stage_changed',
      'marked_won',
      'marked_lost',
      'reopened',
      'note_added'
    );
  end if;
end
$$;

alter type public.lead_activity_kind owner to limenzy_owner;

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id) on delete restrict,

  lead_id uuid not null,

  kind public.lead_activity_kind not null,

  /*
   * §39 requires an author. Nullable only for the backfilled creation
   * entries of Leads whose creator is no longer resolvable — never for a row
   * this application writes, which the policy below enforces by requiring it
   * to equal the acting profile.
   */
  actor_user_profile_id uuid,

  /* §39: stage changes show what changed, so both ends are kept. */
  from_stage_id uuid,
  to_stage_id uuid,

  /*
   * Which fields an edit touched — never their old values. The feed is
   * visible to everyone who can see the Lead, and a previous phone number is
   * contact data, not history anyone needs on screen.
   */
  changed_fields text[],

  /* §39's note content, and §48's optional explanation. */
  note text,

  lost_reason public.lead_lost_reason,

  occurred_at timestamptz not null default now(),

  /*
   * Which version of the Lead this entry describes. Set by a trigger from
   * the Lead row, never by a caller — no role holds a grant on it — and read
   * at COMMIT by the completeness check below. It is what makes "this change
   * has its entry" an exact question rather than a guess about timing.
   */
  lead_revision integer not null,

  constraint lead_activities_lead_fkey
    foreign key (workspace_id, lead_id)
    references public.leads (workspace_id, id) on delete restrict,
  constraint lead_activities_actor_fkey
    foreign key (workspace_id, actor_user_profile_id)
    references public.workspace_memberships (workspace_id, user_profile_id)
    on delete restrict,
  constraint lead_activities_from_stage_fkey
    foreign key (workspace_id, from_stage_id)
    references public.workspace_lead_stages (workspace_id, id)
    on delete restrict,
  constraint lead_activities_to_stage_fkey
    foreign key (workspace_id, to_stage_id)
    references public.workspace_lead_stages (workspace_id, id)
    on delete restrict,

  /*
   * A note is a timeline entry, not a document. 2000 characters is roughly
   * four screens on a phone, which is past the point where the next note is
   * the better answer; the Lead's own `notes` field remains 4000 for standing
   * information about the person.
   */
  constraint lead_activities_note_length
    check (note is null or char_length(note) <= 2000),
  constraint lead_activities_note_not_blank
    check (note is null or btrim(note) <> ''),

  /* Each kind carries what it means, and nothing it does not. */
  constraint lead_activities_note_requires_kind
    check (note is null or kind in ('note_added', 'marked_lost')),
  constraint lead_activities_note_added_has_note
    check (kind <> 'note_added' or note is not null),
  constraint lead_activities_stage_move_has_both_ends
    check (
      kind not in ('stage_changed', 'marked_won', 'marked_lost', 'reopened')
      or (from_stage_id is not null and to_stage_id is not null)
    ),
  constraint lead_activities_lost_reason_only_when_lost
    check (lost_reason is null or kind = 'marked_lost'),
  constraint lead_activities_marked_lost_has_reason
    check (kind <> 'marked_lost' or lost_reason is not null),
  constraint lead_activities_changed_fields_only_on_edit
    check (
      changed_fields is null
      or (kind = 'details_edited' and array_length(changed_fields, 1) >= 1)
    ),
  constraint lead_activities_edit_names_fields
    check (kind <> 'details_edited' or changed_fields is not null)
);

create index if not exists lead_activities_lead_idx
  on public.lead_activities (workspace_id, lead_id, occurred_at desc);

comment on table public.lead_activities is
  'Spec §27, §39. Append-only history for one Lead: who did what, when. No '
  'application role may update or delete a row.';

-- Owned like every other application table, not by whoever ran the
-- migration: the grant model and FORCE ROW LEVEL SECURITY are both stated
-- in terms of limenzy_owner.
alter table public.lead_activities owner to limenzy_owner;

revoke all on public.lead_activities from anon, authenticated, service_role;
alter table public.lead_activities enable row level security;
alter table public.lead_activities force row level security;

-- ---------------------------------------------------------------------------
-- The Lead guard: the rules a row must satisfy whoever writes it
-- ---------------------------------------------------------------------------
create or replace function public.leads_guard_row()
returns trigger
language plpgsql
set search_path = ''
as $trg$
declare
  v_kind public.lead_stage_kind;
begin
  /* The workspace is the one thing about a Lead that can never change. */
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'a lead cannot move to another workspace'
      using errcode = '23514';
  end if;

  /*
   * The Lost reason belongs to the lost STATE, which is the stage's kind —
   * and a kind cannot be expressed in a row-level CHECK, because it lives in
   * another table. Hence a trigger.
   */
  select s.kind into v_kind
    from public.workspace_lead_stages s
   where s.workspace_id = new.workspace_id and s.id = new.stage_id;

  if v_kind = 'lost'::public.lead_stage_kind then
    if new.lost_reason is null then
      raise exception 'a lost lead must record why'
        using errcode = '23514', constraint = 'lost_reason_required';
    end if;
  elsif new.lost_reason is not null then
    raise exception 'only a lost lead carries a lost reason'
      using errcode = '23514', constraint = 'lost_reason_not_allowed';
  end if;

  /*
   * The revision is the stale-edit token, so the database owns it. A caller
   * cannot set it, hold it still, or move it backwards.
   */
  if tg_op = 'UPDATE' then
    new.revision := old.revision + 1;
  end if;

  return new;
end
$trg$;

alter function public.leads_guard_row() owner to limenzy_owner;

drop trigger if exists guard_row on public.leads;
create trigger guard_row
  before insert or update on public.leads
  for each row execute function public.leads_guard_row();

-- ---------------------------------------------------------------------------
-- History completeness: the three triggers that make §39 true by construction
-- ---------------------------------------------------------------------------

/*
 * Stamp each entry with the Lead revision it describes.
 *
 * Read from the Lead row rather than taken from the caller, so the link
 * cannot be forged: an entry written after an UPDATE carries that update's
 * new revision, and an entry written for a change that never happened
 * carries a revision no check is waiting for.
 */
create or replace function public.lead_activities_stamp_revision()
returns trigger
language plpgsql
set search_path = ''
as $trg$
declare
  v_revision integer;
begin
  select l.revision into v_revision
    from public.leads l
   where l.workspace_id = new.workspace_id and l.id = new.lead_id;

  if v_revision is null then
    /* The composite foreign key makes this unreachable through SQL; it is
       here so a future change that weakens the key fails loudly. */
    raise exception 'no such lead in this workspace'
      using errcode = '23503';
  end if;

  new.lead_revision := v_revision;
  return new;
end
$trg$;

alter function public.lead_activities_stamp_revision() owner to limenzy_owner;

drop trigger if exists stamp_revision on public.lead_activities;
create trigger stamp_revision
  before insert on public.lead_activities
  for each row execute function public.lead_activities_stamp_revision();

/*
 * Every Lead gets its creation entry, written here rather than by whoever
 * inserted it.
 *
 * The author is the Lead's own `created_by_user_profile_id`, which the insert
 * policy already pins to the acting profile for `limenzy_app` — so this
 * satisfies the actor policy without widening it, and a Lead seeded by
 * privileged tooling still gets an honest entry naming its creator.
 *
 * INVOKER rights, deliberately: the entry goes in under the inserting role's
 * own grants and policies, so this trigger can never become a way to write
 * history that the role could not have written itself. That is also why
 * `occurred_at` is left to its default — no application role may set it, and
 * a trigger that named it would be refused. The backfill below sets it
 * explicitly because it runs as the migration role and is dating entries to
 * Leads that already existed.
 */
create or replace function public.leads_record_creation()
returns trigger
language plpgsql
set search_path = ''
as $trg$
begin
  insert into public.lead_activities
    (workspace_id, lead_id, kind, actor_user_profile_id)
  values (new.workspace_id, new.id, 'record_created',
          new.created_by_user_profile_id);
  return null;
end
$trg$;

alter function public.leads_record_creation() owner to limenzy_owner;

drop trigger if exists record_creation on public.leads;
create trigger record_creation
  after insert on public.leads
  for each row execute function public.leads_record_creation();

/*
 * A material change must leave an entry for the revision it produced.
 *
 * DEFERRED, so the gateway may update the Lead and then write its entry in
 * the usual order; the pair is checked once, at COMMIT, and a change that
 * left no entry takes the whole transaction down with it. That is the
 * atomicity guarantee stated as a constraint rather than as a convention.
 *
 * `note_added` is excluded deliberately: a note is something somebody wrote,
 * not a description of a change, so it must not be able to stand in for the
 * entry a change owes.
 */
create or replace function public.leads_require_history()
returns trigger
language plpgsql
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

alter function public.leads_require_history() owner to limenzy_owner;

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
  )
  execute function public.leads_require_history();

-- ---------------------------------------------------------------------------
-- The occupancy rule, said out loud
-- ---------------------------------------------------------------------------
-- Unchanged in behaviour. A Won or Lost Lead's `stage_id` points at the
-- outcome row, so it has already left the ordinary stage and cannot hold it
-- open; and an outcome stage can never be deactivated, which the rule above
-- it refuses first. The join simply makes that visible, and gives the archive
-- rule (§50) an obvious place to land.
create or replace function public.workspace_lead_stages_guard_row()
returns trigger
language plpgsql
set search_path = ''
as $trg$
begin
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

  /*
   * §34, §165: a stage holding active Leads cannot be deactivated. "Active"
   * means sitting in an ORDINARY stage — a Won or Lost Lead has moved to its
   * outcome row and no longer occupies this one. The `kind = 'active'` test
   * is on the stage being closed, which is already known not to be an
   * outcome, so it documents the rule rather than narrowing it; when archive
   * (§50) arrives, this is the predicate it changes.
   */
  if old.is_active and not new.is_active then
    if exists (
      select 1
        from public.leads l
        join public.workspace_lead_stages s
          on s.workspace_id = l.workspace_id and s.id = l.stage_id
       where l.workspace_id = old.workspace_id
         and l.stage_id     = old.id
         and s.kind         = 'active'::public.lead_stage_kind
    ) then
      raise exception
        'this stage still has leads in it — move them to another active stage first'
        using errcode = '23514', constraint = 'stage_has_leads';
    end if;
  end if;

  return new;
end
$trg$;

alter function public.workspace_lead_stages_guard_row() owner to limenzy_owner;

-- ---------------------------------------------------------------------------
-- Duplicate candidates, now able to ignore the Lead being edited
-- ---------------------------------------------------------------------------
-- Editing a Lead's phone to the value it already has must not report the Lead
-- as its own duplicate. The exclusion is a parameter rather than a filter in
-- the caller, so the routine cannot be used to probe whether a particular id
-- matches: an excluded id simply never appears.
drop function if exists app.lead_duplicate_candidates(text, text);

/* Temporary, revoked below: a role cannot be given ownership of a function
   in a schema it cannot create in. 3A and 3B do the same for their own
   roles, for the same reason. */
grant create on schema app to limenzy_lead_support;

create or replace function app.lead_duplicate_candidates(
  p_phone_normalised text,
  p_email_normalised text,
  p_exclude_lead_id uuid default null
)
returns table (lead_id uuid, matched_fields text[])
language sql
stable
security definer
set search_path = ''
as $$
  select l.id,
         array_remove(array[
           case when p_phone_normalised is not null
                 and l.phone_normalised = p_phone_normalised
                then 'phone' end,
           case when p_email_normalised is not null
                 and l.email_normalised = p_email_normalised
                then 'email' end
         ], null)
    from public.leads l
   where l.workspace_id = app.current_workspace_id()
     and (p_exclude_lead_id is null or l.id <> p_exclude_lead_id)
     and (
       (p_phone_normalised is not null
        and l.phone_normalised = p_phone_normalised)
       or (p_email_normalised is not null
           and l.email_normalised = p_email_normalised)
     )
     and exists (
       select 1
         from public.workspace_memberships me
         join public.user_profiles mp on mp.id = me.user_profile_id
        where me.workspace_id    = app.current_workspace_id()
          and me.user_profile_id = app.current_user_profile_id()
          and me.status          = 'active'::public.workspace_membership_status
          and mp.auth_user_id    = app.current_auth_user_id()
     )
   order by l.created_at
$$;

alter function app.lead_duplicate_candidates(text, text, uuid)
  owner to limenzy_lead_support;
revoke all on function app.lead_duplicate_candidates(text, text, uuid)
  from public;
grant execute on function app.lead_duplicate_candidates(text, text, uuid)
  to limenzy_app;

revoke create on schema app from limenzy_lead_support;

comment on function app.lead_duplicate_candidates(text, text, uuid) is
  'Spec §130.1. Workspace-wide duplicate matching that returns only ids and '
  'matched fields, optionally ignoring the Lead being edited.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- The two new Lead columns are writable; `revision` is NOT, because the
-- trigger owns it and a caller that could set it could defeat the stale-edit
-- check by holding it still.
grant update (lost_reason, lost_reason_note) on public.leads to limenzy_app;

grant select on public.lead_activities to limenzy_app;
grant insert (id, workspace_id, lead_id, kind, actor_user_profile_id,
              from_stage_id, to_stage_id, changed_fields, note, lost_reason)
  on public.lead_activities to limenzy_app;
-- No UPDATE and no DELETE: §39's "permanent" is a grant, not a convention.

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
/*
 * History is visible exactly where the Lead is. The EXISTS re-applies the
 * Lead's own policy rather than restating §162.1, so the two can never
 * disagree — if a Lead stops being visible, its history does too.
 */
drop policy if exists lead_activities_record_access_select
  on public.lead_activities;
create policy lead_activities_record_access_select on public.lead_activities
  for select to limenzy_app
  using (
    workspace_id = app.current_workspace_id()
    and exists (
      select 1 from public.leads l
       where l.workspace_id = lead_activities.workspace_id
         and l.id = lead_activities.lead_id
    )
  );

/*
 * An entry names its author, and the author is whoever is acting. Nobody can
 * write history for somebody else, and the actor column cannot be null on a
 * row this application writes — only on a backfilled creation entry.
 */
drop policy if exists lead_activities_actor_insert on public.lead_activities;
create policy lead_activities_actor_insert on public.lead_activities
  for insert to limenzy_app
  with check (
    workspace_id = app.current_workspace_id()
    and actor_user_profile_id = app.current_user_profile_id()
    and exists (
      select 1 from public.leads l
       where l.workspace_id = lead_activities.workspace_id
         and l.id = lead_activities.lead_id
    )
  );

-- ---------------------------------------------------------------------------
-- Backfill: every Lead that already exists gets its creation entry
-- ---------------------------------------------------------------------------
-- Runs as the migration role, which bypasses row-level security, so no policy
-- is widened for a one-off. Idempotent: keyed on the Lead having no creation
-- entry, so a replay adds nothing.
-- `lead_revision` is set by the stamping trigger, from each Lead's own row.
insert into public.lead_activities
  (workspace_id, lead_id, kind, actor_user_profile_id, occurred_at)
select l.workspace_id, l.id, 'record_created',
       l.created_by_user_profile_id, l.created_at
  from public.leads l
 where not exists (
   select 1 from public.lead_activities a
    where a.workspace_id = l.workspace_id
      and a.lead_id = l.id
      and a.kind = 'record_created'
 );

-- ---------------------------------------------------------------------------
-- Verify rather than assume
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  -- History is append-only for every application role.
  if has_table_privilege('limenzy_app', 'public.lead_activities', 'UPDATE')
     or has_table_privilege('limenzy_app', 'public.lead_activities', 'DELETE')
     or has_table_privilege('limenzy_app', 'public.lead_activities', 'TRUNCATE')
  then
    raise exception 'lead history is not append-only';
  end if;

  -- The revision is the database's, not a caller's — on both tables.
  if has_column_privilege('limenzy_app', 'public.leads', 'revision', 'UPDATE')
     or has_column_privilege('limenzy_app', 'public.leads', 'revision', 'INSERT')
  then
    raise exception 'the runtime role can set a lead revision';
  end if;

  if has_column_privilege('limenzy_app', 'public.lead_activities',
                          'lead_revision', 'INSERT')
     or has_column_privilege('limenzy_app', 'public.lead_activities',
                             'lead_revision', 'UPDATE')
  then
    raise exception 'the runtime role can stamp a history entry itself';
  end if;

  -- The three triggers that make history complete rather than remembered.
  select count(*) into v_count
    from pg_trigger
   where not tgisinternal
     and (
       (tgrelid = 'public.leads'::regclass
        and tgname in ('record_creation', 'require_history'))
       or (tgrelid = 'public.lead_activities'::regclass
           and tgname = 'stamp_revision')
     );
  if v_count <> 3 then
    raise exception 'expected three history triggers, found %', v_count;
  end if;

  -- The completeness check must be DEFERRED, or the gateway could never
  -- write the entry after the change it describes.
  select count(*) into v_count
    from pg_trigger
   where tgrelid = 'public.leads'::regclass and tgname = 'require_history'
     and tgdeferrable and tginitdeferred;
  if v_count <> 1 then
    raise exception 'the history check is not deferred to commit';
  end if;

  -- Owned by limenzy_owner, like every other application table.
  if (select pg_catalog.pg_get_userbyid(c.relowner)
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'lead_activities')
     <> 'limenzy_owner'
  then
    raise exception 'lead history is not owned by limenzy_owner';
  end if;

  -- Nothing for the Data API roles.
  select count(*) into v_count
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'lead_activities'
     and grantee in ('anon', 'authenticated', 'service_role');
  if v_count <> 0 then
    raise exception 'the Data API roles hold % grant(s) on lead history', v_count;
  end if;

  -- Forced row-level security.
  select count(*) into v_count
    from pg_class
   where relnamespace = 'public'::regnamespace and relname = 'lead_activities'
     and relrowsecurity and relforcerowsecurity;
  if v_count <> 1 then
    raise exception 'row-level security is not forced on lead history';
  end if;

  -- Every reference carries the workspace.
  select count(*) into v_count
    from pg_constraint
   where conrelid = 'public.lead_activities'::regclass and contype = 'f'
     and pg_get_constraintdef(oid) like 'FOREIGN KEY (workspace_id,%';
  if v_count <> 4 then
    raise exception 'expected four composite foreign keys on lead history, found %',
      v_count;
  end if;

  -- Every existing Lead has its creation entry.
  select count(*) into v_count
    from public.leads l
   where not exists (
     select 1 from public.lead_activities a
      where a.workspace_id = l.workspace_id and a.lead_id = l.id
        and a.kind = 'record_created'
   );
  if v_count <> 0 then
    raise exception '% lead(s) have no creation entry', v_count;
  end if;

  -- The occupancy rule still consults Leads, and still names its refusal.
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'workspace_lead_stages_guard_row'
     and p.prosrc like '%stage_has_leads%'
     and p.prosrc like '%public.leads%';
  if v_count <> 1 then
    raise exception 'the stage guard lost its occupancy rule';
  end if;

  /*
   * 3B's own policies are untouched: four on `leads` — record access,
   * add, edit and the support role's read — and two on the override audit.
   */
  select count(*) into v_count from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
   where c.relname in ('leads', 'lead_duplicate_overrides');
  if v_count <> 6 then
    raise exception 'expected 3B''s six Lead policies intact, found %', v_count;
  end if;
end
$$;
