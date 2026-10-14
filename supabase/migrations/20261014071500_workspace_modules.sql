-- Milestone 1D — workspace module configuration.
--
-- Specification sections this implements:
--   §8   First-Time Onboarding  — the recommended setup enables all six modules
--   §171 Modules & Features     — the six switchable modules; Customer
--                                 Management is core and is NOT one of them
--   §172 Module Dependencies    — Renewals & Reminders requires Products &
--                                 Services, and the change is blocked rather
--                                 than silently cascading
--
-- NOT APPLIED to any database by the change that introduced it. The hosted
-- development project is unmigrated, and the application reads this column
-- defensively: a workspace whose `enabled_modules` is NULL — including every
-- row that exists before this migration runs — behaves exactly as §8's
-- recommended setup, with all six modules enabled.

begin;

-- ---------------------------------------------------------------------------
-- The column
-- ---------------------------------------------------------------------------
-- Nullable on purpose. NULL means "never configured", which §8 answers with
-- the recommended setup; it is not the same as an empty array, which means
-- "every switchable module is off" and is a legitimate configuration.
--
-- text[] rather than an enum array: the module set is product configuration
-- that §171 may extend, and widening a check constraint is a cheaper, safer
-- migration than altering an enum type that columns and functions depend on.
alter table public.workspaces
  add column if not exists enabled_modules text[];

comment on column public.workspaces.enabled_modules is
  'Switchable modules enabled for this workspace (spec §171). NULL means never '
  'configured, which the application reads as §8''s recommended setup. Customer '
  'Management is core and never appears here.';

-- ---------------------------------------------------------------------------
-- Only recognised modules, and no duplicates
-- ---------------------------------------------------------------------------
-- The application already drops unrecognised entries when reading, but the
-- database is the layer that cannot be bypassed by a future caller that
-- forgets to.
alter table public.workspaces
  drop constraint if exists workspaces_enabled_modules_known;
alter table public.workspaces
  add constraint workspaces_enabled_modules_known check (
    enabled_modules is null
    or enabled_modules <@ array[
      'leads',
      'customer_followups',
      'products_services',
      'renewals_reminders',
      'whatsapp',
      'email'
    ]::text[]
  );

-- Duplicates are deliberately NOT constrained here. PostgreSQL rejects a
-- subquery in a CHECK (SQLSTATE 0A000), and expressing "no duplicates" over an
-- array without one needs a helper function, which a CHECK can only reference
-- unsafely — a function body can change afterwards while the constraint keeps
-- claiming to be validated. Duplicates are harmless in any case: the
-- application reads this column through `resolveEnabledModules`, which builds a
-- Set, and every write goes through `applyModuleChange`, which emits the
-- canonical order exactly once per module. The constraints that matter --
-- recognised keys and the §172 dependency -- are both expressible and enforced.

-- ---------------------------------------------------------------------------
-- §172 dependency, enforced in the database as well as the application
-- ---------------------------------------------------------------------------
-- "Renewals & Reminders requires Products & Services." A row that enables the
-- first without the second is not a state the product has a meaning for, so it
-- is rejected rather than interpreted.
alter table public.workspaces
  drop constraint if exists workspaces_enabled_modules_dependencies;
alter table public.workspaces
  add constraint workspaces_enabled_modules_dependencies check (
    enabled_modules is null
    or not ('renewals_reminders' = any (enabled_modules))
    or ('products_services' = any (enabled_modules))
  );

-- ---------------------------------------------------------------------------
-- Runtime grant
-- ---------------------------------------------------------------------------
-- The runtime role's UPDATE on workspaces is column-scoped, so a new column is
-- unwritable until it is named here. That is the independent layer the Phase-2
-- migration describes: even a mistaken policy cannot write a column that was
-- never granted. `grant update (…)` adds to the existing column set rather
-- than replacing it, and the existing columns are restated so this file reads
-- as the complete, current grant.
grant update (name, business_type, country, currency, time_zone, enabled_modules)
  on public.workspaces to limenzy_app;

-- No new policy. `workspaces_owner_admin_update` already restricts UPDATE on
-- this table to an active owner_admin of the selected workspace, which is
-- exactly who §171 says may change modules. Adding a second policy would
-- widen access, because policies of the same command are OR-ed.

commit;
