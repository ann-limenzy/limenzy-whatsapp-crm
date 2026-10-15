-- Milestone 2 — Business Settings contact fields.
--
-- Specification §158 (Business Settings) lists eight fields an Owner/Admin may
-- manage. Five already exist on `public.workspaces`:
--
--     Business Name          -> name
--     Business Type/Industry -> business_type
--     Country                -> country
--     Currency               -> currency
--     Time Zone              -> time_zone
--
-- Three have never been captured or stored. The onboarding routine
-- `app.create_initial_workspace` inserts only the five above, so there is no
-- existing data to migrate and no column to rename — these are genuinely new.
--
--     Business Phone         -> business_phone
--     Business Email         -> business_email
--     Address                -> address
--
-- NOT APPLIED to the hosted project by the change that introduced it.
--
-- All three are nullable. §158 names them without saying which are required,
-- and the four fields the product already treats as required — name, country,
-- currency, time zone — are enforced NOT NULL by the Phase-1 migration and are
-- collected during onboarding. These three are not collected anywhere, so a
-- workspace that has never opened Business Settings has no value for them.
-- Making them required would make every existing workspace invalid.

begin;

alter table public.workspaces
  add column if not exists business_phone text,
  add column if not exists business_email text,
  add column if not exists address text;

comment on column public.workspaces.business_phone is
  'Spec §158 Business Phone. Optional and never collected at onboarding. NULL '
  'means not provided; an empty string is rejected, so "cleared" is always NULL.';
comment on column public.workspaces.business_email is
  'Spec §158 Business Email. Optional. Workspace contact detail only — it is '
  'not an identity, is never used to authenticate, and has no relationship to '
  'auth.users.email.';
comment on column public.workspaces.address is
  'Spec §158 Address. Optional, free text, multi-line permitted.';

-- ---------------------------------------------------------------------------
-- Cleared means NULL, never an empty string
-- ---------------------------------------------------------------------------
-- The same convention `business_type` already follows. Without it a column
-- would hold two different representations of "not provided", and every reader
-- would have to handle both. The application normalises blank input to NULL;
-- this is the layer that cannot be bypassed by a future caller that forgets.
alter table public.workspaces
  drop constraint if exists workspaces_business_phone_not_blank;
alter table public.workspaces
  add constraint workspaces_business_phone_not_blank check (
    business_phone is null or btrim(business_phone) <> ''
  );

alter table public.workspaces
  drop constraint if exists workspaces_business_email_not_blank;
alter table public.workspaces
  add constraint workspaces_business_email_not_blank check (
    business_email is null or btrim(business_email) <> ''
  );

alter table public.workspaces
  drop constraint if exists workspaces_address_not_blank;
alter table public.workspaces
  add constraint workspaces_address_not_blank check (
    address is null or btrim(address) <> ''
  );

-- A contact address, not an identity: the only shape rule enforced here is
-- that it looks like an address at all. Deliverability is not knowable from a
-- CHECK constraint, and a stricter pattern would reject valid addresses.
alter table public.workspaces
  drop constraint if exists workspaces_business_email_shape;
alter table public.workspaces
  add constraint workspaces_business_email_shape check (
    business_email is null
    or (business_email like '%_@_%._%' and business_email not like '% %')
  );

-- ---------------------------------------------------------------------------
-- Runtime grant
-- ---------------------------------------------------------------------------
-- The runtime role's UPDATE on workspaces is column-scoped, so a new column is
-- unwritable until it is named here. The existing columns are restated so this
-- file reads as the complete, current grant.
grant update (
  name,
  business_type,
  country,
  currency,
  time_zone,
  enabled_modules,
  permissions_granted,
  manager_record_scope,
  business_phone,
  business_email,
  address
) on public.workspaces to limenzy_app;

-- No new policy. `workspaces_owner_admin_update` already restricts UPDATE on
-- this table to an active owner_admin of the selected workspace, which is who
-- §158 allows to manage these settings.

commit;
