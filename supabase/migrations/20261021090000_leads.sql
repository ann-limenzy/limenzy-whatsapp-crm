-- ---------------------------------------------------------------------------
-- Milestone 3B — Leads: creation, list and detail
-- Spec §26, §30, §31, §32, §35–§37, §130.1, §162, §162.1
-- ---------------------------------------------------------------------------
--
-- The first BUSINESS RECORD table in this application. Everything before it
-- was tenancy, membership or workspace configuration; this is the first table
-- whose rows belong to a person inside a workspace and whose visibility is
-- decided by §162.1 rather than by membership alone.
--
-- WHAT THIS MIGRATION CLOSES
--
--   The 3A gap. `20261020090000` created the pipeline and said, in its header
--   and in src/server/db/schema/lead-pipeline.ts, that §34's rule — a stage
--   holding active Leads cannot be deactivated — could not be enforced
--   because no Leads existed. They exist now, so the guard trigger on
--   `workspace_lead_stages` is replaced here to enforce it, and the locking
--   contract the gateway already documents is what keeps the two sides from
--   racing. See "THE OCCUPANCY RULE" below.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT CONTAIN
--
--   * No `interested_in`. §32's "Product / Service Interested In" is a
--     reference to Products & Services (§166), which does not exist. A text
--     column here would be a different field wearing its name, and would have
--     to be migrated into a reference later.
--   * No explicit record shares. §162.1 defines them; there is no table, so
--     `isExplicitlyShared` is false everywhere and the policies below grant
--     nothing on that basis. Nothing here should be read as sharing support.
--   * No assignment, Sales Teams or Assignment Required. §32 defers the
--     Record Owner default to §163's rules, which depend on unresolved client
--     decision 1 (§163.18). Until those land, the Record Owner is the creator
--     and nothing else can set it — there is no UPDATE grant on that column.
--   * No archive, conversion, follow-ups, custom fields or activity table.
--     The §27 "record created" entry the Lead Detail screen shows is DERIVED
--     from `created_at` and `created_by_user_profile_id`; inventing a
--     timeline table for one derivable row would imply a timeline exists.
--
-- THE OCCUPANCY RULE, AND WHAT IT DEPENDS ON
--
--   `workspace_lead_stages_guard_row` now refuses to deactivate a stage that
--   any Lead occupies. It is SECURITY INVOKER, so it counts the Leads the
--   CALLER can see — which is sound only because deactivating a stage
--   requires `configure_crm_settings`, and §162 gives that to Owner/Admin
--   alone, whose Lead policy covers every Lead in the workspace. If that row
--   of the matrix ever becomes configurable for Managers, a Manager scoped to
--   "Own, Assigned and Explicitly Shared" could see fewer Leads than exist
--   and the check would under-count. `src/lib/permissions.test.ts` asserts
--   that row stays Owner/Admin-only so the coupling cannot break quietly.
--
--   The write side of the contract is in
--   src/server/auth/workspace-leads.ts: before writing `leads.stage_id` it
--   takes `select … for update` on the stage row, which is the same row lock
--   the deactivating UPDATE takes. One of the two waits, and whichever runs
--   second sees the other's committed state.
--
--   "Occupied" is every Lead in the stage, because no Lead can be archived
--   yet. When archive (§50) arrives this predicate narrows to active Leads,
--   and the trigger is where that change belongs.

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id) on delete restrict,

  -- §32: Lead Name is the one required field.
  name text not null,

  /*
   * §130.1 keeps the entered value and the comparison value apart: "The
   * user-entered phone number is preserved for display and audit. A separate
   * normalized comparison value is derived from it." Same for email. A stored
   * contact value must never change because the normalisation rules changed,
   * so the display columns are written once from what the person typed.
   */
  phone text,
  phone_normalised text,
  /*
   * §130.1: "A number that cannot be normalized reliably is flagged for
   * review rather than silently rewritten." This is that flag. It is set when
   * a phone number was given but could not be reduced to E.164 safely — this
   * application has no dial-code table, so only an already-international
   * number normalises, and a national-format number is kept verbatim and
   * marked. Such a Lead takes part in duplicate detection by email only.
   */
  phone_needs_review boolean not null default false,
  email text,
  email_normalised text,

  notes text,

  stage_id uuid not null,
  source_id uuid,

  /*
   * §26: Lead and Customer records use RECORD OWNER. Not "assigned to" —
   * that word belongs to follow-ups and conversations, and conflating them is
   * how operational assignment turns into hidden record sharing (§162.1).
   */
  record_owner_user_profile_id uuid not null,
  created_by_user_profile_id uuid not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /* The composite key anything referencing a Lead will point at. */
  constraint leads_workspace_id_key unique (workspace_id, id),

  /*
   * WORKSPACE-SAFE REFERENCES.
   *
   * Every one of these is a COMPOSITE foreign key carrying `workspace_id`,
   * so a Lead in one workspace referring to another workspace's stage,
   * source, owner or creator is unrepresentable — not merely refused by a
   * policy that someone could later write differently. The source key is
   * MATCH SIMPLE, so a NULL `source_id` is simply unconstrained; `stage_id`
   * is NOT NULL and therefore always checked.
   */
  constraint leads_stage_fkey
    foreign key (workspace_id, stage_id)
    references public.workspace_lead_stages (workspace_id, id)
    on delete restrict,
  constraint leads_source_fkey
    foreign key (workspace_id, source_id)
    references public.workspace_lead_sources (workspace_id, id)
    on delete restrict,
  /*
   * The owner and creator are keyed to the MEMBERSHIP, not to the profile:
   * `unique (workspace_id, user_profile_id)` on workspace_memberships makes
   * "this person belongs to this workspace" the thing being referenced. A
   * Lead owned by someone who is not a member of its workspace cannot exist.
   */
  constraint leads_record_owner_fkey
    foreign key (workspace_id, record_owner_user_profile_id)
    references public.workspace_memberships (workspace_id, user_profile_id)
    on delete restrict,
  constraint leads_created_by_fkey
    foreign key (workspace_id, created_by_user_profile_id)
    references public.workspace_memberships (workspace_id, user_profile_id)
    on delete restrict,

  constraint leads_name_not_blank
    check (name = btrim(name) and btrim(name) <> ''),
  constraint leads_name_length check (char_length(name) <= 120),

  /* §32: "At least one contact method — Phone Number or Email — must be
     provided." Enforced here as well as in the parser, because the parser is
     one caller and this is the record. */
  constraint leads_contact_required
    check (phone is not null or email is not null),

  constraint leads_phone_not_blank
    check (phone is null or (phone = btrim(phone) and btrim(phone) <> '')),
  constraint leads_phone_length
    check (phone is null or char_length(phone) <= 40),
  /* E.164: a leading '+', a non-zero country digit, 7 to 15 digits in all. */
  constraint leads_phone_normalised_shape
    check (phone_normalised is null
           or phone_normalised ~ '^\+[1-9][0-9]{6,14}$'),
  /* A normalised value cannot exist without the value it came from, and a
     number that normalised cannot also be awaiting review. */
  constraint leads_phone_normalised_requires_phone
    check (phone_normalised is null or phone is not null),
  constraint leads_phone_review_requires_phone
    check (not phone_needs_review or phone is not null),
  constraint leads_phone_review_excludes_normalised
    check (not phone_needs_review or phone_normalised is null),

  constraint leads_email_not_blank
    check (email is null or (email = btrim(email) and btrim(email) <> '')),
  constraint leads_email_length
    check (email is null or char_length(email) <= 254),
  /* §130.1: trimmed, lowercased, basic structure. No provider-specific
     transformation — dots are kept and a +tag is not stripped, because
     treating them as equivalent would merge distinct addresses. */
  constraint leads_email_normalised_shape
    check (email_normalised is null
           or (email_normalised = lower(btrim(email_normalised))
               and email_normalised ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  constraint leads_email_normalised_requires_email
    check (email_normalised is null or email is not null),

  constraint leads_notes_length
    check (notes is null or char_length(notes) <= 4000)
);

/*
 * NOT unique. §130.1 warns about duplicates and never prevents them: "The
 * system warns about duplicates rather than silently creating them", and a
 * genuinely shared number may be retained after authorized review. These
 * exist so the duplicate lookup and the §31 search are index reads.
 */
create index if not exists leads_phone_normalised_idx
  on public.leads (workspace_id, phone_normalised)
  where phone_normalised is not null;
create index if not exists leads_email_normalised_idx
  on public.leads (workspace_id, email_normalised)
  where email_normalised is not null;
create index if not exists leads_name_search_idx
  on public.leads (workspace_id, lower(name));
/* The My Leads filter and the Staff default view. */
create index if not exists leads_record_owner_idx
  on public.leads (workspace_id, record_owner_user_profile_id);
/* The occupancy check, which asks "does any Lead sit in this stage". */
create index if not exists leads_stage_idx
  on public.leads (workspace_id, stage_id);

comment on table public.leads is
  'Spec §30–§32, §35–§37. Leads, owned by a Record Owner (§26) and visible '
  'per §162.1. Contact values are stored as entered with a separate '
  'normalised comparison value (§130.1).';

-- ---------------------------------------------------------------------------
-- The duplicate override record — §130.1
-- ---------------------------------------------------------------------------
-- §130.1: "Each override records the acting user, the timestamp, the
-- candidate records shown, the fields that matched, any explanation given and
-- the resulting new record." All six, and nothing else: this is an audit
-- record, not a workflow.

create table if not exists public.lead_duplicate_overrides (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id) on delete restrict,

  /* The resulting new record. */
  lead_id uuid not null,
  /* The acting user. */
  overridden_by_user_profile_id uuid not null,
  /* The candidate records shown, as they were shown. */
  candidate_lead_ids uuid[] not null,
  /* The fields that matched: 'phone', 'email', or both. */
  matched_fields text[] not null,
  /* Any explanation given. Optional, per §130.1. */
  explanation text,
  /* The timestamp. */
  created_at timestamptz not null default now(),

  constraint lead_duplicate_overrides_lead_fkey
    foreign key (workspace_id, lead_id)
    references public.leads (workspace_id, id) on delete restrict,
  constraint lead_duplicate_overrides_actor_fkey
    foreign key (workspace_id, overridden_by_user_profile_id)
    references public.workspace_memberships (workspace_id, user_profile_id)
    on delete restrict,

  constraint lead_duplicate_overrides_candidates_present
    check (array_length(candidate_lead_ids, 1) >= 1),
  constraint lead_duplicate_overrides_fields_known
    check (matched_fields <@ array['phone', 'email']
           and array_length(matched_fields, 1) >= 1),
  constraint lead_duplicate_overrides_explanation_length
    check (explanation is null or char_length(explanation) <= 1000)
);

create index if not exists lead_duplicate_overrides_lead_idx
  on public.lead_duplicate_overrides (workspace_id, lead_id);

comment on table public.lead_duplicate_overrides is
  'Spec §130.1. One row per Create Anyway: who, when, which candidates were '
  'shown, which fields matched, any explanation, and the Lead created.';

-- ---------------------------------------------------------------------------
-- Nothing reaches these through the Data API
-- ---------------------------------------------------------------------------
/* Owned by limenzy_owner like every other table here. Ownership is what
   FORCE ROW LEVEL SECURITY is forcing against, so it is not a formality. */
alter table public.leads                    owner to limenzy_owner;
alter table public.lead_duplicate_overrides owner to limenzy_owner;

revoke all on public.leads from anon, authenticated, service_role;
revoke all on public.lead_duplicate_overrides
  from anon, authenticated, service_role;

alter table public.leads enable row level security;
alter table public.leads force row level security;
alter table public.lead_duplicate_overrides enable row level security;
alter table public.lead_duplicate_overrides force row level security;

drop trigger if exists set_updated_at on public.leads;
create trigger set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- The two predicates the policies share
-- ---------------------------------------------------------------------------
-- Both are SECURITY INVOKER and read tables, exactly like
-- `app.current_user_is_owner_admin()` from Milestone 2B. They are accounted
-- for in the policy dependency graph in src/server/db/rls.test.ts rather than
-- treated as leaves, because a policy that CALLS a table-reading function
-- reaches those tables just as surely as an inline subquery does.

/*
 * §162.1 record visibility, reduced to the one question a policy can ask:
 * may this actor see every record in this workspace?
 *
 *   Owner/Admin — yes, always.
 *   Manager     — only where the workspace scope is All Records. An UNSET
 *                 scope is NO: §162.1 offers two settings and names no
 *                 default, so an unconfigured workspace denies rather than
 *                 guessing. That is the same answer evaluateRecordAccess()
 *                 gives in src/lib/permissions.ts.
 *   Staff/Sales — no.
 *
 * Everyone else falls through to the ownership test in the policy itself.
 * Assignment and explicit sharing are NOT here: there is no table for either,
 * and §162.1 requires a validated related-record permission before an
 * assignment confers access at all.
 */
create or replace function app.current_user_may_access_all_records()
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
      join public.workspaces w on w.id = m.workspace_id
     where m.workspace_id    = app.current_workspace_id()
       and m.user_profile_id = app.current_user_profile_id()
       and m.status          = 'active'::public.workspace_membership_status
       and p.auth_user_id    = app.current_auth_user_id()
       and (
         m.role = 'owner_admin'::public.workspace_role
         or (m.role = 'manager'::public.workspace_role
             and w.manager_record_scope = 'all_records')
       )
  )
$$;

alter function app.current_user_may_access_all_records()
  owner to limenzy_owner;
revoke all on function app.current_user_may_access_all_records() from public;
grant execute on function app.current_user_may_access_all_records()
  to limenzy_app;
/*
 * `app.workspace_member_names()` is SECURITY DEFINER owned by limenzy_members
 * and calls this predicate, so that role needs EXECUTE on it — and the
 * predicate reads the workspace's Manager scope, so it needs to reach that
 * column.
 *
 * COLUMN-SCOPED, deliberately. `public.workspaces` also carries the §158
 * business settings — phone, email, address — and limenzy_members has no
 * business seeing those. Two columns is the whole of what the predicate
 * reads, and the policy below keeps even those to the caller's own workspace.
 */
grant execute on function app.current_user_may_access_all_records()
  to limenzy_members;
grant select (id, manager_record_scope) on public.workspaces
  to limenzy_members;

drop policy if exists workspaces_members_select on public.workspaces;
create policy workspaces_members_select on public.workspaces
  for select to limenzy_members
  using (
    exists (
      select 1
        from public.workspace_memberships m
        join public.user_profiles p on p.id = m.user_profile_id
       where m.workspace_id    = workspaces.id
         and m.user_profile_id = app.current_user_profile_id()
         and m.status          = 'active'::public.workspace_membership_status
         and p.auth_user_id    = app.current_auth_user_id()
    )
  );

/*
 * §162's `add_leads_customers` row: Owner/Admin ALLOW, Manager ALLOW,
 * Staff/Sales CONFIGURABLE. A configurable permission is granted by listing
 * it in `workspaces.permissions_granted`; an unset array grants nothing,
 * which is what the Settings screen means by "every permission below is
 * denied until it is granted here".
 */
create or replace function app.current_user_may_add_leads()
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
      join public.workspaces w on w.id = m.workspace_id
     where m.workspace_id    = app.current_workspace_id()
       and m.user_profile_id = app.current_user_profile_id()
       and m.status          = 'active'::public.workspace_membership_status
       and p.auth_user_id    = app.current_auth_user_id()
       and (
         m.role in ('owner_admin'::public.workspace_role,
                    'manager'::public.workspace_role)
         or (m.role = 'staff_sales'::public.workspace_role
             and 'add_leads_customers' = any (
               coalesce(w.permissions_granted, array[]::text[])))
       )
  )
$$;

alter function app.current_user_may_add_leads() owner to limenzy_owner;
revoke all on function app.current_user_may_add_leads() from public;
grant execute on function app.current_user_may_add_leads() to limenzy_app;

-- ---------------------------------------------------------------------------
-- Record Owner names — §31's table column
-- ---------------------------------------------------------------------------
-- §31 lists Record Owner in the Lead table, which means a NAME, and
-- `limenzy_app` deliberately cannot read another person's profile: its
-- `user_profiles_self_select` policy returns the actor's own row and nothing
-- else. Milestone 2B solved the same problem for Settings → Users with the
-- `limenzy_members` role, whose policies already grant co-member visibility
-- inside one workspace. This is that door, opened exactly as wide as the Lead
-- list needs and no wider.
--
-- WHY A DEFINER ROUTINE RATHER THAN A WIDER POLICY. Widening
-- `user_profiles_self_select` would let every runtime query everywhere read
-- co-member profiles, for all time, as a side effect of a list column. A
-- routine keeps the widening to one call with its own authority test, and
-- `app.workspace_members()` from 2B is the precedent.
--
-- WHAT IT REFUSES. A caller who may not see every record gets their own row
-- only — which is all a Staff/Sales user needs, because every Lead they can
-- see is one they own. No argument selects the workspace: it comes from the
-- transaction, so there is no parameter through which another tenant could be
-- named.
/* Temporary, and revoked a few lines below: a role cannot be given ownership
   of a function in a schema it cannot create in. Milestone 2B does the same
   dance for the same role. */
grant create on schema app to limenzy_members;

create or replace function app.workspace_member_names()
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
     and exists (
       select 1
         from public.workspace_memberships me
         join public.user_profiles mp on mp.id = me.user_profile_id
        where me.workspace_id    = app.current_workspace_id()
          and me.user_profile_id = app.current_user_profile_id()
          and me.status          = 'active'::public.workspace_membership_status
          and mp.auth_user_id    = app.current_auth_user_id()
     )
     and (
       app.current_user_may_access_all_records()
       or p.id = app.current_user_profile_id()
     )
$$;

alter function app.workspace_member_names() owner to limenzy_members;
revoke all on function app.workspace_member_names() from public;
grant execute on function app.workspace_member_names() to limenzy_app;

/* The routine exists and is owned; limenzy_members creates nothing again. */
revoke create on schema app from limenzy_members;

comment on function app.workspace_member_names() is
  'Spec §31. Record Owner names for the current workspace. Definer-owned by '
  'limenzy_members, which already sees co-members; returns the caller''s own '
  'row unless they may access every record.';

-- ---------------------------------------------------------------------------
-- Grants — column-scoped, and no DELETE anywhere
-- ---------------------------------------------------------------------------
grant select on public.leads to limenzy_app;
grant insert (id, workspace_id, name, phone, phone_normalised,
              phone_needs_review, email, email_normalised, notes,
              stage_id, source_id, record_owner_user_profile_id,
              created_by_user_profile_id)
  on public.leads to limenzy_app;
/*
 * No `record_owner_user_profile_id` and no `created_by_user_profile_id`.
 * Changing a Record Owner is §162's `change_record_owner` and §26's
 * reassignment rules, which this slice does not implement; withholding the
 * grant means it cannot happen by accident through an edit form.
 */
grant update (name, phone, phone_normalised, phone_needs_review,
              email, email_normalised, notes, stage_id, source_id)
  on public.leads to limenzy_app;

grant select on public.lead_duplicate_overrides to limenzy_app;
grant insert (id, workspace_id, lead_id, overridden_by_user_profile_id,
              candidate_lead_ids, matched_fields, explanation)
  on public.lead_duplicate_overrides to limenzy_app;

-- No DELETE and no TRUNCATE on either table, for any application role.

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

/*
 * §162.1, as a policy. Owner/Admin and All-Records Managers see the
 * workspace; everyone else sees what they own. `workspace_id =
 * app.current_workspace_id()` is first and applies to every branch, so no
 * widening below can reach another tenant.
 */
drop policy if exists leads_record_access_select on public.leads;
create policy leads_record_access_select on public.leads
  for select to limenzy_app
  using (
    workspace_id = app.current_workspace_id()
    and (
      app.current_user_may_access_all_records()
      or record_owner_user_profile_id = app.current_user_profile_id()
    )
  );

/*
 * §32 creation. The creator is pinned in the policy as well as in the
 * gateway: both the Record Owner and the creator must be the acting profile,
 * so a crafted form cannot file a Lead under someone else's name — which is
 * also why there is no owner picker in this slice.
 */
drop policy if exists leads_add_insert on public.leads;
create policy leads_add_insert on public.leads
  for insert to limenzy_app
  with check (
    workspace_id = app.current_workspace_id()
    and app.current_user_may_add_leads()
    and created_by_user_profile_id = app.current_user_profile_id()
    and record_owner_user_profile_id = app.current_user_profile_id()
  );

/*
 * §162 `edit_permitted_records` is ALLOW for all three roles, so the question
 * is purely §162.1 access — the same predicate as the read. The WITH CHECK
 * repeats it so a row cannot be edited out of the actor's own scope.
 */
drop policy if exists leads_edit_update on public.leads;
create policy leads_edit_update on public.leads
  for update to limenzy_app
  using (
    workspace_id = app.current_workspace_id()
    and (
      app.current_user_may_access_all_records()
      or record_owner_user_profile_id = app.current_user_profile_id()
    )
  )
  with check (
    workspace_id = app.current_workspace_id()
    and (
      app.current_user_may_access_all_records()
      or record_owner_user_profile_id = app.current_user_profile_id()
    )
  );

/* §130.1 override audit. Written by the actor, readable by those who can see
   every record — it is an audit trail, not part of anyone's working view. */
drop policy if exists lead_duplicate_overrides_insert on public.lead_duplicate_overrides;
create policy lead_duplicate_overrides_insert on public.lead_duplicate_overrides
  for insert to limenzy_app
  with check (
    workspace_id = app.current_workspace_id()
    and overridden_by_user_profile_id = app.current_user_profile_id()
  );

drop policy if exists lead_duplicate_overrides_select on public.lead_duplicate_overrides;
create policy lead_duplicate_overrides_select on public.lead_duplicate_overrides
  for select to limenzy_app
  using (
    workspace_id = app.current_workspace_id()
    and app.current_user_may_access_all_records()
  );

-- ---------------------------------------------------------------------------
-- Duplicate candidates — §130.1 checkpoints 3 and 4
-- ---------------------------------------------------------------------------
-- §130.1 requires matching "against existing workspace records", and again
-- "inside the final server-side create or import transaction". Workspace
-- records — not the records the actor happens to be allowed to see. A
-- Staff/Sales user whose policy shows them only their own Leads would
-- otherwise never be warned about a colleague's Lead with the same number,
-- which is the commonest duplicate there is.
--
-- §162.1 says the opposite thing about disclosure: a record the actor may not
-- access must not be revealed. Both hold, so this routine returns the
-- MINIMUM that lets the warning exist — the candidate's id and which fields
-- matched, and nothing else. The gateway then re-reads those ids through the
-- ordinary policy to describe the ones the actor may actually see; the rest
-- are counted, not shown.
--
-- WHY A NEW ROLE, AND HOW NARROW IT IS. No existing role can do this.
-- `limenzy_app` is scoped to the actor's own records by design, and widening
-- it would widen every Lead read in the application. `limenzy_owner` owns the
-- table and is under FORCE ROW LEVEL SECURITY, so it sees nothing without a
-- policy — and Phase 1's rule is that no policy ever names it.
-- `limenzy_members` exists for co-member IDENTITY and giving it Lead data
-- would blur what it means.
--
-- So: one NOLOGIN role for the two things a Lead write needs that §162.1
-- deliberately denies the acting user —
--
--   1. matching duplicates across the whole workspace (this routine), and
--   2. taking the stage row lock the locking contract requires, which
--      PostgreSQL only allows to a role holding UPDATE on the table. A
--      Staff/Sales user holds the grant but is filtered by the Owner/Admin
--      UPDATE policy, so `select … for update` returns nothing for them and
--      they could not create a Lead at all. See `app.lock_lead_stage()`.
--
-- Its UPDATE policy on stages carries `with check (false)`, so it can take
-- the lock and can never complete an update.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'limenzy_lead_support') then
    create role limenzy_lead_support nologin;
  end if;
end
$$;

grant limenzy_lead_support to current_user with set option;
grant usage on schema app to limenzy_lead_support;
-- Temporary, revoked below, exactly as 2B does for limenzy_members.
grant create on schema app to limenzy_lead_support;

grant select on public.leads to limenzy_lead_support;

/* Workspace-scoped and nothing more. The routine supplies the authority
   test; this policy supplies the tenant boundary, so even a mistake in the
   routine cannot reach another workspace's Leads. */
drop policy if exists leads_support_select on public.leads;
create policy leads_support_select on public.leads
  for select to limenzy_lead_support
  using (workspace_id = app.current_workspace_id());

grant execute on function app.current_workspace_id() to limenzy_lead_support;
grant execute on function app.current_user_profile_id() to limenzy_lead_support;
grant execute on function app.current_auth_user_id() to limenzy_lead_support;
grant select on public.workspace_memberships to limenzy_lead_support;
grant select on public.user_profiles to limenzy_lead_support;

/* The membership check the routine makes needs to see the caller's own
   membership and profile, and nothing else. */
drop policy if exists workspace_memberships_support_select on public.workspace_memberships;
create policy workspace_memberships_support_select on public.workspace_memberships
  for select to limenzy_lead_support
  using (
    workspace_id = app.current_workspace_id()
    and user_profile_id = app.current_user_profile_id()
  );

drop policy if exists user_profiles_support_select on public.user_profiles;
create policy user_profiles_support_select on public.user_profiles
  for select to limenzy_lead_support
  using (auth_user_id = app.current_auth_user_id());

/*
 * Returns one row per candidate: its id, and which of phone/email matched.
 *
 * NOTHING ELSE. Not the name, not the contact value, not the owner — a
 * candidate the caller may not access must not be described, and the caller
 * is not told which ones those are by this routine. The gateway asks the
 * ordinary policy that question separately.
 *
 * A null argument matches nothing, so a Lead with only an email is compared
 * on email alone rather than matching every phone-less record.
 */
create or replace function app.lead_duplicate_candidates(
  p_phone_normalised text,
  p_email_normalised text
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

alter function app.lead_duplicate_candidates(text, text) owner to limenzy_lead_support;
revoke all on function app.lead_duplicate_candidates(text, text) from public;
grant execute on function app.lead_duplicate_candidates(text, text)
  to limenzy_app;

/*
 * Take the stage row lock the locking contract requires, and report what the
 * stage is.
 *
 * `select … for update` needs the UPDATE privilege on the table — measured,
 * not assumed: a role with SELECT alone gets 42501, with or without an UPDATE
 * policy. limenzy_app holds that grant but its UPDATE policy admits only
 * Owner/Admin, so for everyone else the lock silently returns no rows. This
 * routine takes the lock as a role that may, under a policy that can never
 * let it write anything.
 *
 * The lock lives in the CALLER's transaction — a lock is transaction-scoped,
 * not role-scoped — so the Lead insert that follows is covered by it, and a
 * concurrent deactivation of the same stage waits.
 */
create or replace function app.lock_lead_stage(p_stage_id uuid)
returns table (stage_id uuid, is_active boolean, kind text)
language sql
security definer
set search_path = ''
as $$
  select s.id, s.is_active, s.kind::text
    from public.workspace_lead_stages s
   where s.id = p_stage_id
     and s.workspace_id = app.current_workspace_id()
     and exists (
       select 1
         from public.workspace_memberships me
         join public.user_profiles mp on mp.id = me.user_profile_id
        where me.workspace_id    = app.current_workspace_id()
          and me.user_profile_id = app.current_user_profile_id()
          and me.status          = 'active'::public.workspace_membership_status
          and mp.auth_user_id    = app.current_auth_user_id()
     )
     for update of s
$$;

alter function app.lock_lead_stage(uuid) owner to limenzy_lead_support;
revoke all on function app.lock_lead_stage(uuid) from public;
grant execute on function app.lock_lead_stage(uuid) to limenzy_app;

grant select on public.workspace_lead_stages to limenzy_lead_support;
/* The one column that exists only so the lock is privileged enough to take.
   The policy below refuses every actual update. */
grant update (is_active) on public.workspace_lead_stages
  to limenzy_lead_support;

drop policy if exists workspace_lead_stages_support_select
  on public.workspace_lead_stages;
create policy workspace_lead_stages_support_select
  on public.workspace_lead_stages
  for select to limenzy_lead_support
  using (workspace_id = app.current_workspace_id());

/* USING admits the lock; WITH CHECK (false) means no update can ever land. */
drop policy if exists workspace_lead_stages_support_lock
  on public.workspace_lead_stages;
create policy workspace_lead_stages_support_lock
  on public.workspace_lead_stages
  for update to limenzy_lead_support
  using (workspace_id = app.current_workspace_id())
  with check (false);

/*
 * Lock the ACTOR's own membership row, and say whether it is still active.
 *
 * §160 says a person's responsibilities must be reassigned before they are
 * deactivated. Counting Leads and deactivating the member is one decision, so
 * it has to be one transaction — and a Lead being created at that moment has
 * to meet it rather than slip past it.
 *
 * THE LOCK ORDER. A Lead write takes the STAGE row lock first (see
 * app.lock_lead_stage) and then this one; deactivation takes only this one,
 * through the UPDATE inside app.set_member_status. Nothing takes membership
 * before stage, so the two orders cannot form a cycle.
 *
 * Why it must be an explicit lock and not the foreign key's. Inserting a Lead
 * takes FOR KEY SHARE on the membership row through
 * `leads_record_owner_fkey`, and `update … set status` takes FOR NO KEY
 * UPDATE. Those two do NOT conflict, so without this the insert and the
 * deactivation would simply pass each other. FOR UPDATE conflicts with both.
 *
 * Scoped to the caller's OWN membership, which is all a Lead write needs:
 * in this milestone the Record Owner is always the creator. Owned by the
 * lock-only role, under an UPDATE policy whose WITH CHECK is `false`, so it
 * can take the lock and can never write.
 */
create or replace function app.lock_actor_membership()
returns text
language sql
security definer
set search_path = ''
as $$
  select m.status::text
    from public.workspace_memberships m
    join public.user_profiles p on p.id = m.user_profile_id
   where m.workspace_id    = app.current_workspace_id()
     and m.user_profile_id = app.current_user_profile_id()
     and p.auth_user_id    = app.current_auth_user_id()
     for update of m
$$;

alter function app.lock_actor_membership() owner to limenzy_lead_support;
revoke all on function app.lock_actor_membership() from public;
grant execute on function app.lock_actor_membership() to limenzy_app;

/* The one column that exists so the lock is privileged enough to take. */
grant update (status) on public.workspace_memberships
  to limenzy_lead_support;

drop policy if exists workspace_memberships_support_lock
  on public.workspace_memberships;
create policy workspace_memberships_support_lock
  on public.workspace_memberships
  for update to limenzy_lead_support
  using (
    workspace_id = app.current_workspace_id()
    and user_profile_id = app.current_user_profile_id()
  )
  with check (false);

comment on function app.lock_actor_membership() is
  'Spec §160. Locks the acting member''s own row so a Lead write and a '
  'deactivation cannot pass each other, and reports whether it is active.';

/*
 * §160's precondition: how many Leads is this person the Record Owner of?
 *
 * DEFINER, and not a query through the caller's own policy, because the
 * answer must cover EVERY Lead in the workspace — including ones the person
 * asking cannot see. A count taken through the asker's record scope would be
 * correct only for as long as the §162 matrix keeps user management with
 * Owner/Admin, and would under-count silently the day it did not. Under-
 * counting here means deactivating someone who still owns work, which is the
 * exact failure §160 exists to prevent.
 *
 * It refuses rather than narrows: only an active Owner/Admin of the current
 * workspace may ask, so this cannot become a way to probe who owns what. If
 * user management is ever widened, this starts REFUSING — a loud failure
 * instead of a quiet undercount.
 */
create or replace function app.count_leads_owned_by(p_user_profile_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1
        from public.workspace_memberships me
        join public.user_profiles mp on mp.id = me.user_profile_id
       where me.workspace_id    = app.current_workspace_id()
         and me.user_profile_id = app.current_user_profile_id()
         and me.status          = 'active'::public.workspace_membership_status
         and me.role            = 'owner_admin'::public.workspace_role
         and mp.auth_user_id    = app.current_auth_user_id()
    )
    then (
      select count(*)::integer
        from public.leads l
       where l.workspace_id = app.current_workspace_id()
         and l.record_owner_user_profile_id = p_user_profile_id
    )
    else null
  end
$$;

alter function app.count_leads_owned_by(uuid) owner to limenzy_lead_support;
revoke all on function app.count_leads_owned_by(uuid) from public;
grant execute on function app.count_leads_owned_by(uuid) to limenzy_app;

comment on function app.count_leads_owned_by(uuid) is
  'Spec §160. Every Lead in the workspace owned by one person, regardless of '
  'what the asker can see. NULL when the asker is not an active Owner/Admin, '
  'so a caller must refuse rather than read it as zero.';

revoke create on schema app from limenzy_lead_support;

comment on function app.lock_lead_stage(uuid) is
  'Spec §34 locking contract. Takes the stage row lock a Lead write needs, '
  'as a role whose UPDATE policy can never let it write.';

comment on function app.lead_duplicate_candidates(text, text) is
  'Spec §130.1 checkpoints 3 and 4. Workspace-wide duplicate matching that '
  'returns only ids and matched fields, so §162.1 disclosure stays with the '
  'ordinary Lead policy.';

-- ---------------------------------------------------------------------------
-- The 3A occupancy gap, closed
-- ---------------------------------------------------------------------------
-- The body below is 20261020090000's, unchanged, with one rule added. Its
-- SECURITY INVOKER choice, its owner and its empty search_path are preserved.

create or replace function public.workspace_lead_stages_guard_row()
returns trigger
language plpgsql
set search_path = ''
as $trg$
begin
  /* 23514 (check_violation), not 42501: a rule refusing a change is not the
     same as row-level security refusing a caller, and the gateway maps the
     two to different words. */
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
   * §34 and §165: "A stage containing active Leads cannot be deactivated
   * until those Leads are moved to another active stage." Milestone 3A could
   * not enforce this because no Leads existed; this is the rule it promised.
   *
   * BEFORE UPDATE on this row, so it runs holding the row lock the UPDATE has
   * already taken — the other half of the contract the Lead gateway keeps by
   * locking the stage row before it writes `leads.stage_id`. A Lead cannot be
   * filed into a stage that is being closed, and a stage cannot be closed
   * under a Lead that is being filed into it.
   *
   * Every Lead counts, because no Lead can be archived yet (§50 is a later
   * milestone). When archive arrives this predicate narrows to active Leads.
   */
  if old.is_active and not new.is_active then
    if exists (
      select 1 from public.leads l
       where l.workspace_id = old.workspace_id
         and l.stage_id     = old.id
    ) then
      /* A named constraint, so the gateway can tell this refusal apart from
         the other 23514 the pipeline raises — "that would leave no active
         stage" and "that stage still has leads in it" need different words
         on screen, and both arrive as check violations. */
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
-- Verify rather than assume
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  -- No application role may delete a Lead. §29/§50: archive, never delete.
  if has_table_privilege('limenzy_app', 'public.leads', 'DELETE')
     or has_table_privilege('limenzy_app', 'public.leads', 'TRUNCATE')
     or has_table_privilege('limenzy_app', 'public.lead_duplicate_overrides',
                            'DELETE') then
    raise exception 'the runtime role can delete lead data';
  end if;

  -- The runtime role must not be able to move a Lead to another owner.
  if has_column_privilege('limenzy_app', 'public.leads',
                          'record_owner_user_profile_id', 'UPDATE') then
    raise exception 'the runtime role can rewrite a Record Owner';
  end if;

  -- Nothing for the Data API roles, on either table.
  select count(*) into v_count
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('leads', 'lead_duplicate_overrides')
     and grantee in ('anon', 'authenticated', 'service_role');
  if v_count <> 0 then
    raise exception 'the Data API roles hold % grant(s) on lead data', v_count;
  end if;

  -- Row-level security forced on both.
  select count(*) into v_count
    from pg_class
   where relnamespace = 'public'::regnamespace
     and relname in ('leads', 'lead_duplicate_overrides')
     and relrowsecurity and relforcerowsecurity;
  if v_count <> 2 then
    raise exception 'row-level security is not forced on both lead tables';
  end if;

  -- Every workspace-safe composite foreign key is present.
  select count(*) into v_count
    from pg_constraint
   where conrelid = 'public.leads'::regclass
     and contype = 'f'
     and pg_get_constraintdef(oid) like 'FOREIGN KEY (workspace_id,%';
  if v_count <> 4 then
    raise exception 'expected four composite foreign keys on leads, found %',
      v_count;
  end if;

  -- The occupancy rule is actually in the trigger body.
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'workspace_lead_stages_guard_row'
     and p.prosrc like '%public.leads%';
  if v_count <> 1 then
    raise exception 'the stage guard does not check lead occupancy';
  end if;

  -- 3A's nine policies are intact, plus the two this migration adds for the
  -- lock-only role. Counted by name so a replacement cannot pass as an
  -- addition.
  select count(*) into v_count from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
   where c.relname in ('workspace_lead_stages', 'workspace_lead_sources')
     and pol.polname not like '%\_support\_%';
  if v_count <> 9 then
    raise exception 'expected 3A''s nine policies intact, found %', v_count;
  end if;

  -- Neither lock-only policy can ever let a write land.
  select count(*) into v_count from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
   where pol.polname in ('workspace_lead_stages_support_lock',
                         'workspace_memberships_support_lock')
     and pg_get_expr(pol.polwithcheck, pol.polrelid) = 'false';
  if v_count <> 2 then
    raise exception 'a lock-only policy does not refuse writes (% of 2)', v_count;
  end if;
end
$$;
