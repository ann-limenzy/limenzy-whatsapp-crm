-- Milestone 2C — workspace invitations (spec §159 "Add User").
--
-- NOT APPLIED to the hosted project by the change that introduced it.
--
-- NO EMAIL IS SENT BY THE APPLICATION, AND NONE CAN BE
--
-- The application has no mail dependency and no mail code; every message the
-- product sends today — confirmation, password reset — is sent by Supabase
-- Auth. The Email provider is an unresolved §180.1 CTO decision (D12), so
-- choosing one here would pre-empt it. An invitation therefore produces a
-- copyable one-time link, which the Owner/Admin sends through whatever
-- channel they already use. When the provider decision lands, emailing the
-- same link is additive: nothing here changes.
--
-- THE TOKEN IS THE CAPABILITY, AND THE EMAIL IS THE BINDING
--
-- The token is 32 random bytes. Only its SHA-256 hash is stored, so the
-- database never holds anything that can be redeemed; the plaintext exists
-- once, in the response that created it. Acceptance additionally requires a
-- signed-in, email-VERIFIED user whose address equals the invited one, so a
-- leaked link alone does not confer membership — it has to reach the person
-- it was addressed to.
--
-- Stated honestly: the email comparison is made by trusted server code from
-- verified token claims and re-checked here against the value it passes in.
-- That re-check catches a coding mistake, not a forged caller. The same trust
-- boundary applies to `app.create_initial_workspace`, and the identity itself
-- always comes from the transaction's GUC, never from an argument.
--
-- WHY ADMINISTRATION IS POLICIES AND ACCEPTANCE IS A ROUTINE
--
-- Milestone 2B had to use routines because a co-member policy on
-- workspace_memberships would read the table it guards and recurse (42P17).
-- That does not apply to a NEW table: a policy on workspace_invitations may
-- read workspace_memberships, whose own limenzy_app policy reads
-- user_profiles and terminates. Depth 2, acyclic. So creating, listing,
-- revoking and regenerating are ordinary grants and policies.
--
-- Acceptance cannot be, for a different reason: it runs for someone who has
-- no membership and may have no profile, so there is no tenant context to
-- scope a policy by, and it must create rows in two tables the runtime role
-- must never be able to write. It follows the boundary
-- `app.create_initial_workspace` established — one SECURITY DEFINER routine
-- owned by a NOLOGIN, NOBYPASSRLS role that owns nothing else.
--
-- WHAT limenzy_app GAINS, AND WHAT IT STILL MUST NOT HAVE
--
-- Its first INSERT: on this table only, column-scoped, and only for the
-- workspace the request resolved. It gains NO INSERT on user_profiles or
-- workspace_memberships — those remain reachable only through a definer
-- routine, which is the property the Phase 4C-1 header argues for and this
-- file does not weaken. Recorded in architecture-decisions §9.

begin;

-- ---------------------------------------------------------------------------
-- The role that owns acceptance
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'limenzy_invites') then
    create role limenzy_invites
      nologin nocreatedb nocreaterole noreplication noinherit;
  end if;
end
$$;

-- SUPERUSER and BYPASSRLS are deliberately not named in either direction:
-- a non-superuser may not alter them, CREATE ROLE defaults both off, and the
-- verification block at the end asserts they stayed off.
alter role limenzy_invites nologin nocreatedb nocreaterole noreplication noinherit;

comment on role limenzy_invites is
  'Owns app.accept_workspace_invitation() and app.pending_invitations_for() '
  'and nothing else. NOLOGIN, NOBYPASSRLS, not a table owner, so row-level '
  'security applies to it in full. Never granted to limenzy_app.';

grant limenzy_invites to current_user with set option;

-- Temporary, revoked at the end of this file.
grant create on schema app to limenzy_invites;
grant usage  on schema app to limenzy_invites;

grant execute on function app.current_auth_user_id() to limenzy_invites;
grant execute on function app.current_workspace_id()  to limenzy_invites;
/* Only reachable from the issuer-guard trigger, and only on a path this role
   cannot take — it holds no grant on `created_by`. Granted so that if it ever
   did reach there, the guard would REFUSE rather than fail confusingly: the
   setting is never established in an acceptance transaction, so the function
   returns NULL and NULL is distinct from any new value. */
grant execute on function app.current_user_profile_id() to limenzy_invites;

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null
    references public.workspaces (id) on delete restrict,

  /* Normalised on the way in, and the check below refuses anything else, so
     one address is one row however it was typed. */
  email text not null,

  role public.workspace_role not null,

  /* §11 collects a name with the invitation. It is used ONLY when the invitee
     has no profile yet and no name of their own; it never overwrites one. */
  invited_name text,

  /* SHA-256 of the token, lowercase hex. The plaintext is never stored. */
  token_hash text not null,

  expires_at timestamptz not null,

  /* Who issued it. Their authority is re-checked at acceptance, because an
     Owner/Admin who has since been demoted or deactivated must not still be
     able to add people through a link they left behind. */
  created_by uuid not null
    references public.user_profiles (id) on delete restrict,

  revoked_at  timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid references public.user_profiles (id) on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint workspace_invitations_email_normalised
    check (email = lower(btrim(email)) and btrim(email) <> ''),
  constraint workspace_invitations_email_shape
    check (email like '%_@_%._%' and email not like '% %'),
  constraint workspace_invitations_invited_name_not_blank
    check (invited_name is null or btrim(invited_name) <> ''),
  /* 64 lowercase hex characters, so a plaintext token cannot be stored here
     by mistake and be mistaken for a hash. */
  constraint workspace_invitations_token_hash_shape
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint workspace_invitations_expires_after_creation
    check (expires_at > created_at),
  constraint workspace_invitations_redeemed_together
    check ((redeemed_at is null) = (redeemed_by is null))
);

comment on table public.workspace_invitations is
  'Spec §159 Add User. One pending invitation per workspace and normalised '
  'email. Holds only the SHA-256 of the token; the plaintext is shown once '
  'and never stored. Acceptance additionally requires a verified signed-in '
  'address equal to `email`.';

/*
 * One pending invitation per workspace and address.
 *
 * "Pending" here is "neither revoked nor redeemed" and deliberately does NOT
 * exclude expired rows: an index predicate must be immutable and now() is
 * not. Expiry is handled where it can be — the creation routine supersedes an
 * expired row before inserting, so an expired invitation never blocks a fresh
 * one, and the index still guarantees there is only ever one live row.
 */
create unique index if not exists workspace_invitations_pending_key
  on public.workspace_invitations (workspace_id, email)
  where revoked_at is null and redeemed_at is null;

/* Acceptance looks an invitation up by hash and by nothing else. */
create unique index if not exists workspace_invitations_token_hash_key
  on public.workspace_invitations (token_hash);

create index if not exists workspace_invitations_workspace_id_idx
  on public.workspace_invitations (workspace_id);

alter table public.workspace_invitations owner to limenzy_owner;

drop trigger if exists set_updated_at on public.workspace_invitations;
create trigger set_updated_at
  before update on public.workspace_invitations
  for each row execute function public.set_updated_at();

alter table public.workspace_invitations enable row level security;
alter table public.workspace_invitations force row level security;

/*
 * Deny the Data API roles outright.
 *
 * Supabase grants new tables in `public` to anon, authenticated and
 * service_role by default. Phase 1 revoked the default for anon and
 * authenticated but not for service_role, so the three Phase-1 tables still
 * carry service_role's grants — a pre-existing condition this file does not
 * change for them.
 *
 * It is revoked HERE because the situation changed in Milestone 2D: the
 * application server now holds a secret key, which authenticates as
 * service_role on the Data API and bypasses row-level security. One module
 * uses it for one Auth call and tests assert it never touches the Data API —
 * but a table of invitation hashes and addresses should not be reachable that
 * way even in principle.
 */
revoke all on public.workspace_invitations from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Administration: the runtime role, scoped to its own workspace
-- ---------------------------------------------------------------------------
-- Column-scoped throughout. created_at and updated_at belong to the database;
-- redeemed_at and redeemed_by are written only by the acceptance routine, and
-- the runtime role cannot write them at all.
grant select on public.workspace_invitations to limenzy_app;
grant insert (id, workspace_id, email, role, invited_name, token_hash,
              expires_at, created_by)
  on public.workspace_invitations to limenzy_app;
/*
 * `created_by` is updatable, and that is a deliberate decision rather than an
 * oversight.
 *
 * Acceptance re-checks the ISSUER's authority, so an invitation issued by
 * someone since demoted can never be redeemed. Without a way to change the
 * issuer, such an invitation would be permanently dead while still looking
 * live: regenerating it would hand out a fresh link that is guaranteed to
 * fail. An Owner/Admin must be able to take it over.
 *
 * Regeneration is therefore a RE-ISSUE — a new token, a new seven days, and
 * the regenerating administrator recorded as the issuer. Revoking is not: it
 * leaves `created_by` alone, so the record of who invited whom survives
 * (§177), and a demoted issuer's invitation can still be withdrawn by
 * anybody who holds the authority.
 *
 * What stops this becoming "attribute an invitation to a colleague" is the
 * trigger below, which is where OLD and NEW can be compared — a row-level
 * WITH CHECK sees only NEW and so cannot tell a change from a value left
 * alone.
 */
grant update (token_hash, expires_at, revoked_at, invited_name, role,
              created_by)
  on public.workspace_invitations to limenzy_app;

-- No DELETE: an invitation is revoked, never removed, so the record of who
-- invited whom survives (spec §177).

create or replace function public.workspace_invitations_guard_issuer()
returns trigger
language plpgsql
set search_path = ''
as $trg$
begin
  /*
   * `created_by` may be left alone, or set to the caller. It may never be set
   * to anybody else, so an invitation cannot be attributed to a colleague who
   * did not send it — which matters precisely because acceptance treats that
   * column as the authority being relied upon.
   *
   * NESTED, not one `and`. A trigger runs as the INVOKING role, and that is
   * `limenzy_invites` when acceptance marks an invitation redeemed. PL/pgSQL
   * does not promise to short-circuit `and`, so a single condition called
   * `app.current_user_profile_id()` on every update and acceptance died with
   * "permission denied for function". Nested IFs are sequential, so the
   * lookup happens only when the column actually changed — which the
   * acceptance routine never does, and could not: its grant covers
   * `redeemed_at` and `redeemed_by` and nothing else.
   */
  if new.created_by is distinct from old.created_by then
    if new.created_by is distinct from app.current_user_profile_id() then
      raise exception
        'an invitation may only be re-issued in the caller''s own name'
        using errcode = '42501';
    end if;
  end if;
  return new;
end
$trg$;

alter function public.workspace_invitations_guard_issuer()
  owner to limenzy_owner;

comment on function public.workspace_invitations_guard_issuer() is
  'Spec §159. Lets an Owner/Admin take over an invitation whose issuer lost '
  'authority, by re-issuing it in their own name — and only their own name.';

drop trigger if exists guard_issuer on public.workspace_invitations;
create trigger guard_issuer
  before update on public.workspace_invitations
  for each row execute function public.workspace_invitations_guard_issuer();

/*
 * Every policy requires the caller to be an ACTIVE owner_admin of the
 * selected workspace, re-derived from stored rows, with the profile setting
 * agreeing with the authenticated one.
 *
 * Termination: this reads workspace_memberships and user_profiles, whose
 * limenzy_app policies read user_profiles and nothing respectively. Depth 2,
 * acyclic — no policy here reads workspace_invitations.
 */
drop policy if exists workspace_invitations_owner_admin_select on public.workspace_invitations;
create policy workspace_invitations_owner_admin_select on public.workspace_invitations
  for select to limenzy_app
  using (
    workspace_id = app.current_workspace_id()
    and app.current_user_is_owner_admin()
  );

drop policy if exists workspace_invitations_owner_admin_insert on public.workspace_invitations;
create policy workspace_invitations_owner_admin_insert on public.workspace_invitations
  for insert to limenzy_app
  with check (
    workspace_id = app.current_workspace_id()
    and app.current_user_is_owner_admin()
    /* The issuer recorded must be the caller, not anyone they name. */
    and exists (
      select 1 from public.user_profiles p
       where p.id = created_by
         and p.id = app.current_user_profile_id()
         and p.auth_user_id = app.current_auth_user_id()
    )
  );

drop policy if exists workspace_invitations_owner_admin_update on public.workspace_invitations;
create policy workspace_invitations_owner_admin_update on public.workspace_invitations
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
-- Acceptance: what limenzy_invites may touch, and nothing more
-- ---------------------------------------------------------------------------
grant select on public.workspace_invitations to limenzy_invites;
grant update (redeemed_at, redeemed_by) on public.workspace_invitations to limenzy_invites;
grant select on public.workspaces to limenzy_invites;

grant select on public.user_profiles to limenzy_invites;
grant insert (id, auth_user_id, full_name) on public.user_profiles to limenzy_invites;

grant select on public.workspace_memberships to limenzy_invites;
grant insert (id, workspace_id, user_profile_id, role, status)
  on public.workspace_memberships to limenzy_invites;
/* UPDATE on exactly the two columns a reactivation writes. Without it,
   ON CONFLICT DO UPDATE is refused; with it, nothing else can be changed —
   a membership can never be moved to another workspace or person. */
grant update (role, status) on public.workspace_memberships to limenzy_invites;

-- Policies TO limenzy_invites. The routine is reached only through EXECUTE
-- granted to limenzy_app, and it looks an invitation up by token hash alone,
-- so these are scoped by the verified identity rather than by a workspace the
-- caller does not yet have.
drop policy if exists workspace_invitations_invites_select on public.workspace_invitations;
create policy workspace_invitations_invites_select on public.workspace_invitations
  for select to limenzy_invites
  using (app.current_auth_user_id() is not null);

drop policy if exists workspace_invitations_invites_update on public.workspace_invitations;
create policy workspace_invitations_invites_update on public.workspace_invitations
  for update to limenzy_invites
  using (app.current_auth_user_id() is not null)
  with check (app.current_auth_user_id() is not null);

drop policy if exists workspaces_invites_select on public.workspaces;
create policy workspaces_invites_select on public.workspaces
  for select to limenzy_invites
  using (app.current_auth_user_id() is not null);

drop policy if exists user_profiles_invites_select on public.user_profiles;
create policy user_profiles_invites_select on public.user_profiles
  for select to limenzy_invites
  using (auth_user_id = app.current_auth_user_id());

drop policy if exists user_profiles_invites_insert on public.user_profiles;
create policy user_profiles_invites_insert on public.user_profiles
  for insert to limenzy_invites
  with check (auth_user_id = app.current_auth_user_id());

/*
 * Memberships of the workspace the invitation names, and no other.
 *
 * The routine needs two rows: the accepting person's, to decide between
 * joining and reactivating, and the ISSUER's, to re-check that whoever sent
 * the invitation is still an Owner/Admin. The second is not the caller's own
 * row, so a policy scoped to "rows belonging to the current auth user" cannot
 * see it.
 *
 * The workspace is not taken from the caller. The routine sets
 * `app.workspace_id` ITSELF, from the invitation it has already located by
 * token hash and locked — so this predicate is scoped by something derived
 * from the token, never from an argument.
 */
drop policy if exists workspace_memberships_invites_select on public.workspace_memberships;
create policy workspace_memberships_invites_select on public.workspace_memberships
  for select to limenzy_invites
  using (workspace_id = app.current_workspace_id());

drop policy if exists workspace_memberships_invites_insert on public.workspace_memberships;
create policy workspace_memberships_invites_insert on public.workspace_memberships
  for insert to limenzy_invites
  with check (
    workspace_id = app.current_workspace_id()
    and status = 'active'
    and exists (
      select 1 from public.user_profiles p
       where p.id = user_profile_id
         and p.auth_user_id = app.current_auth_user_id()
    )
  );

/*
 * USING decides which rows may be LOCKED and targeted; WITH CHECK decides
 * what may be written. They are deliberately different here.
 *
 * `SELECT ... FOR UPDATE` applies the UPDATE policy's USING clause on top of
 * the SELECT policy, so a USING scoped to "the accepting person's own row"
 * made the authority lock below return ZERO ROWS — measured, not assumed.
 * Acceptance has to lock the workspace's Owner/Admin rows to make its
 * authority check binding, and it must never write them.
 *
 * So USING is the workspace, and WITH CHECK stays the accepting person's own
 * row and 'active'. `user_profile_id` is not in the column grant either, so a
 * row targeted here cannot be re-pointed at somebody else to slip past it.
 */
drop policy if exists workspace_memberships_invites_update on public.workspace_memberships;
create policy workspace_memberships_invites_update on public.workspace_memberships
  for update to limenzy_invites
  using (workspace_id = app.current_workspace_id())
  with check (
    workspace_id = app.current_workspace_id()
    and status = 'active'
    and exists (
      select 1 from public.user_profiles p
       where p.id = user_profile_id
         and p.auth_user_id = app.current_auth_user_id()
    )
  );

-- ---------------------------------------------------------------------------
-- Acceptance
-- ---------------------------------------------------------------------------
-- Returns a word, never an identifier:
--   joined                  a new membership was created
--   reactivated             an inactive membership was restored at the role
--   already_member          an ACTIVE membership existed; it was left exactly
--                           as it was, and the invitation was still used up
--   invalid                 unknown, revoked, redeemed or expired
--   email_mismatch          the verified address is not the invited one
--   inviter_not_permitted   whoever issued it is no longer an Owner/Admin
--   unauthenticated         no verified identity in this transaction
-- An earlier draft of this file took (text, text, text). CREATE OR REPLACE
-- cannot change a signature — it would leave both functions in the schema —
-- so the older one is dropped explicitly. Harmless where it never existed.
drop function if exists app.accept_workspace_invitation(text, text, text);

-- Two ways in, and the SAME binding governs both.
--
--   p_token_hash  the ordinary path: the link the invitee was sent.
--   p_invitation_id  the recovery path, used only when the continuation was
--                    lost — a confirmation link opened in another browser,
--                    say. An invitation id is not a secret, but it confers
--                    nothing on its own: acceptance still requires a signed-in
--                    identity whose VERIFIED address equals the invited one,
--                    which is the binding that matters. Someone who controls
--                    that address is the person the invitation was for, and
--                    they could have asked for a fresh link regardless.
--
-- Exactly one is used: the hash when it is given, the id otherwise.
create or replace function app.accept_workspace_invitation(
  p_token_hash    text,
  p_invitation_id uuid,
  p_email         text,
  p_full_name     text
)
returns text
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $fn$
declare
  v_auth        uuid;
  v_inv         public.workspace_invitations%rowtype;
  v_profile_id  uuid;
  v_name        text;
  v_inserted    boolean;
begin
  v_auth := app.current_auth_user_id();
  if v_auth is null then
    return 'unauthenticated';
  end if;

  if p_token_hash is not null and p_token_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;
  if p_token_hash is null and p_invitation_id is null then
    return 'invalid';
  end if;

  /*
   * Lock the invitation first and hold it for the whole transaction. This is
   * what makes acceptance single-use under concurrency: a second request
   * blocks here, and once the first commits it re-reads a row whose
   * redeemed_at is set and returns 'invalid'. It also serialises against a
   * concurrent revoke or regenerate, both of which take the same row lock.
   */
  select * into v_inv
    from public.workspace_invitations
   where case
           when p_token_hash is not null then token_hash = p_token_hash
           else id = p_invitation_id
         end
     for update;

  if not found
     or v_inv.revoked_at is not null
     or v_inv.redeemed_at is not null
     or v_inv.expires_at <= pg_catalog.now() then
    return 'invalid';
  end if;

  /*
   * Scope this transaction's reads to the workspace the TOKEN names.
   *
   * Derived from the row just locked, never from an argument, so the caller
   * cannot point the routine at another workspace. It is transaction-local
   * and this transaction exists only to accept an invitation.
   */
  perform pg_catalog.set_config('app.workspace_id', v_inv.workspace_id::text, true);

  /*
   * The binding to a person, compared against the normalised stored value.
   *
   * The ANSWER differs by path, deliberately. Reaching here by token hash
   * proves possession of the link, so 'email_mismatch' tells the holder
   * something they already know and is the message that actually helps —
   * "you opened this while signed in as the wrong account". Reaching here by
   * invitation id proves nothing: an id is not a secret, so distinguishing
   * "exists but is not yours" from "does not exist" would let anyone probe
   * for live invitations. That path gets the same single word as a miss.
   */
  if p_email is null or pg_catalog.lower(pg_catalog.btrim(p_email)) <> v_inv.email then
    if p_token_hash is not null then
      return 'email_mismatch';
    end if;
    return 'invalid';
  end if;

  /*
   * ---------------------------------------------------------------------
   * THE WORKSPACE'S OWNER/ADMIN LOCK — the same one Milestone 2B takes
   * ---------------------------------------------------------------------
   *
   * Without this, the issuer's authority was read from a snapshot and a
   * demotion committing a moment later left that reading in force: the
   * membership was still granted by a link whose issuer no longer had the
   * authority to grant it.
   *
   * `app.set_member_role` and `app.set_member_status` open with exactly this
   * statement — every active Owner/Admin row of the workspace, FOR UPDATE,
   * ORDER BY user_profile_id — so acceptance and every role or status change
   * now queue behind one another on one lock set instead of racing.
   *
   * ORDER BY is not cosmetic: FOR UPDATE locks rows in the order the plan
   * returns them, and without a total order two callers can take the same two
   * rows in opposite orders and deadlock.
   *
   * Under READ COMMITTED a row that stopped being an active Owner/Admin drops
   * OUT of this set when it is re-evaluated, so a demoted issuer is simply
   * not locked — and the check immediately below, taking a fresh snapshot,
   * sees the demotion and refuses. An issuer who is still an active
   * Owner/Admin is locked, so nothing can demote or deactivate them until
   * this transaction ends. Either way the answer is binding.
   *
   * LOCK ORDER, and why there is no cycle:
   *
   *   acceptance  invitation row -> owner/admin set (ordered) -> the
   *               accepting person's membership row
   *   2B          owner/admin set (ordered) -> the target membership row
   *   revoke,     the invitation row only; their policies READ memberships,
   *   regenerate  and a read takes no row lock
   *
   * Acceptance takes the owner/admin set BEFORE any other membership row, so
   * while it holds that set no 2B call can hold a membership row at all —
   * every one of them is still blocked on its own first statement. And no
   * transaction anywhere holds a membership lock while waiting for an
   * invitation lock, so the invitation row cannot be part of a cycle either.
   */
  perform 1
     from public.workspace_memberships
    where workspace_id = v_inv.workspace_id
      and role   = 'owner_admin'::public.workspace_role
      and status = 'active'::public.workspace_membership_status
    order by user_profile_id
      for update;

  /*
   * The issuer's authority, now rather than when they issued it, and now
   * stable for the rest of the transaction. An Owner/Admin who has since been
   * demoted or deactivated must not still be adding people through a link
   * they left behind. Deliberately NOT redeemed in this case: the invitation
   * stays pending so somebody who does hold the authority can revoke it or
   * regenerate it in their own name.
   */
  if not exists (
    select 1 from public.workspace_memberships m
     where m.workspace_id = v_inv.workspace_id
       and m.user_profile_id = v_inv.created_by
       and m.role = 'owner_admin'::public.workspace_role
       and m.status = 'active'::public.workspace_membership_status
  ) then
    return 'inviter_not_permitted';
  end if;

  select p.id, p.full_name into v_profile_id, v_name
    from public.user_profiles p
   where p.auth_user_id = v_auth;

  if v_profile_id is null then
    -- Their own name first, then the one the invitation suggested, then the
    -- address's local part so the NOT NULL check always has something real.
    -- COALESCE and NULLIF are SQL constructs rather than functions, so they
    -- cannot be schema-qualified — and need no protection from an empty
    -- search_path, because the parser resolves them and nothing can shadow
    -- them. Every actual function call here stays qualified.
    v_name := coalesce(
      nullif(pg_catalog.btrim(p_full_name), ''),
      nullif(pg_catalog.btrim(v_inv.invited_name), ''),
      pg_catalog.split_part(v_inv.email, '@', 1)
    );
    /*
     * ON CONFLICT, because this is a genuine race.
     *
     * `auth_user_id` is UNIQUE, and two acceptances for the same person at
     * once — two invitations open in two tabs, or an acceptance alongside
     * `app.create_initial_workspace` — would both find no profile and both
     * insert. The loser previously raised 23505 out of a SECURITY DEFINER
     * routine, which surfaced as an unexplained failure rather than as one of
     * this routine's words.
     *
     * DO NOTHING rather than DO UPDATE: limenzy_invites holds no UPDATE on
     * user_profiles, and must not — an existing profile's name is never
     * touched. It waits for the conflicting transaction, and the re-read then
     * takes a fresh statement snapshot that sees the committed row.
     */
    insert into public.user_profiles (id, auth_user_id, full_name)
    values (pg_catalog.gen_random_uuid(), v_auth, v_name)
        on conflict (auth_user_id) do nothing
    returning id into v_profile_id;

    if v_profile_id is null then
      select p.id into v_profile_id
        from public.user_profiles p
       where p.auth_user_id = v_auth;
    end if;

    if v_profile_id is null then
      -- Neither inserted nor found: something is wrong that must not be
      -- reported as a successful join.
      raise exception 'could not establish a profile for the accepting user';
    end if;
  end if;
  -- An existing profile's name is never touched: the invitation's name is a
  -- suggestion for someone who has none, not an instruction.

  /*
   * Create or reactivate, in one statement.
   *
   * The WHERE on the conflict target is what preserves an ACTIVE membership:
   * an old invitation must never rewrite a role or status somebody holds now.
   * `xmax = 0` distinguishes the insert from the update; no row at all means
   * the conflict was excluded by that WHERE, which is the already-active
   * case.
   */
  insert into public.workspace_memberships (id, workspace_id, user_profile_id, role, status)
  values (pg_catalog.gen_random_uuid(), v_inv.workspace_id, v_profile_id,
          v_inv.role, 'active'::public.workspace_membership_status)
      on conflict (workspace_id, user_profile_id) do update
         set role = excluded.role,
             status = 'active'::public.workspace_membership_status
       where public.workspace_memberships.status
             = 'inactive'::public.workspace_membership_status
  returning (xmax = 0) into v_inserted;

  update public.workspace_invitations
     set redeemed_at = pg_catalog.now(), redeemed_by = v_profile_id
   where id = v_inv.id;

  /*
   * The row is locked by this transaction and the policy above admits it, so
   * this cannot miss. If it ever does, the membership has already been
   * created and returning a word would COMMIT a half-finished acceptance —
   * access granted, invitation still live. Raising rolls the whole thing
   * back, which is the only safe answer to an impossible state.
   */
  if not found then
    raise exception 'invitation % could not be marked redeemed', v_inv.id;
  end if;

  if v_inserted is null then
    return 'already_member';
  elsif v_inserted then
    return 'joined';
  else
    return 'reactivated';
  end if;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Recovery: what is pending for this verified address
-- ---------------------------------------------------------------------------
-- For the case where the continuation is lost — a confirmation link opened in
-- another browser, say. Returns only what the invited person may already see
-- from their own link, and only for live invitations addressed to them.
create or replace function app.pending_invitations_for(p_email text)
returns table (
  invitation_id  uuid,
  workspace_name text,
  member_role    text,
  expires_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, w.name, i.role::text, i.expires_at
    from public.workspace_invitations i
    join public.workspaces w on w.id = i.workspace_id
   where app.current_auth_user_id() is not null
     and p_email is not null
     and i.email = pg_catalog.lower(pg_catalog.btrim(p_email))
     and i.revoked_at is null
     and i.redeemed_at is null
     and i.expires_at > pg_catalog.now()
   order by i.created_at
$$;

alter function app.accept_workspace_invitation(text, uuid, text, text)
  owner to limenzy_invites;
alter function app.pending_invitations_for(text) owner to limenzy_invites;

comment on function app.accept_workspace_invitation(text, uuid, text, text) is
  'Spec §159. Redeems an invitation by token hash for the transaction''s '
  'verified identity, atomically creating a profile if needed and creating or '
  'reactivating the membership. An ACTIVE membership is left untouched. '
  'Returns a word, never an identifier.';
comment on function app.pending_invitations_for(text) is
  'Live invitations addressed to a verified email, for the recovery path when '
  'an invitation link''s continuation is lost. Returns no token and no '
  'identifier beyond the invitation''s own id.';

revoke all on function app.accept_workspace_invitation(text, uuid, text, text) from public;
revoke all on function app.pending_invitations_for(text) from public;
grant execute on function app.accept_workspace_invitation(text, uuid, text, text) to limenzy_app;
grant execute on function app.pending_invitations_for(text) to limenzy_app;

grant execute on function app.current_user_is_owner_admin() to limenzy_app;

revoke create on schema app from limenzy_invites;

-- ---------------------------------------------------------------------------
-- Verify rather than assume
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  perform 1 from pg_catalog.pg_roles
   where rolname = 'limenzy_invites'
     and (rolsuper or rolbypassrls or rolcreatedb or rolcreaterole
          or rolreplication or rolcanlogin or rolinherit);
  if found then
    raise exception 'limenzy_invites has unexpected attributes';
  end if;

  select count(*) into v_count
    from pg_catalog.pg_auth_members am
    join pg_catalog.pg_roles granted on granted.oid = am.roleid
    join pg_catalog.pg_roles grantee on grantee.oid = am.member
   where granted.rolname = 'limenzy_invites'
     and grantee.rolname in ('limenzy_app', 'limenzy_members', 'anon',
                             'authenticated', 'service_role');
  if v_count <> 0 then
    raise exception 'limenzy_invites was granted to a role that must not hold it';
  end if;

  -- The property this file must not weaken: the runtime role still cannot
  -- write a profile or a membership directly.
  select count(*) into v_count
    from information_schema.column_privileges
   where grantee = 'limenzy_app' and table_schema = 'public'
     and table_name in ('user_profiles', 'workspace_memberships')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if v_count <> 0 then
    raise exception 'limenzy_app gained a write privilege on profiles or memberships';
  end if;

  -- Its new INSERT is on this table only, and carries no DELETE.
  if has_table_privilege('limenzy_app', 'public.workspace_invitations', 'DELETE') then
    raise exception 'limenzy_app can delete an invitation';
  end if;

  -- Nothing reached the browser-facing roles.
  for v_count in
    select 1 from unnest(array['anon', 'authenticated', 'service_role']) as r(name)
     where has_table_privilege(r.name, 'public.workspace_invitations',
                               'SELECT, INSERT, UPDATE, DELETE')
  loop
    raise exception 'a Data API role holds a privilege on workspace_invitations';
  end loop;

  if has_schema_privilege('limenzy_invites', 'auth', 'USAGE') then
    raise exception 'limenzy_invites holds USAGE on schema auth';
  end if;
  if has_schema_privilege('limenzy_invites', 'app', 'CREATE') then
    raise exception 'limenzy_invites still holds CREATE on schema app';
  end if;

  -- The issuer guard is present: without it, `created_by` would be freely
  -- rewritable by any Owner/Admin of the workspace.
  if not exists (
    select 1 from pg_catalog.pg_trigger t
     where t.tgrelid = 'public.workspace_invitations'::regclass
       and t.tgname = 'guard_issuer'
       and not t.tgisinternal
  ) then
    raise exception 'the invitation issuer guard trigger is missing';
  end if;

  -- The earlier milestones' policies are untouched.
  select count(*) into v_count
    from pg_catalog.pg_policy
   where polname in ('user_profiles_self_select',
                     'workspace_memberships_self_select',
                     'workspaces_member_select',
                     'workspaces_owner_admin_update',
                     'workspace_memberships_members_select',
                     'workspace_memberships_members_update',
                     'user_profiles_members_select');
  if v_count <> 7 then
    raise exception 'an earlier policy is missing (found %)', v_count;
  end if;
end
$$;

commit;
