-- Milestone 1D — workspace permission configuration.
--
-- Specification sections this implements:
--   §162   Permission Matrix        — the cells marked "Configurable" are the
--                                     only ones a workspace may decide. Cells
--                                     marked "Decision required" are NOT here:
--                                     §163.18 denies them until approved, and
--                                     no stored value may reach them.
--   §162.1 Record Access            — the Manager record scope is configured
--                                     per workspace as either All Records, or
--                                     Own, Assigned and Explicitly Shared.
--
-- NOT APPLIED to the hosted project by the change that introduced it.
--
-- No default is specified for either setting. §162 says "Configurable" without
-- naming a default, and §162.1 says the workspace "configures" the scope
-- without saying what it starts as. So both columns are nullable, NULL means
-- never configured, and the application keeps its fail-closed behaviour:
-- an unconfigured permission is denied, and an unconfigured Manager scope
-- denies record access rather than guessing which of the two was meant.

begin;

-- ---------------------------------------------------------------------------
-- Which §162 "Configurable" cells this workspace has turned on
-- ---------------------------------------------------------------------------
-- NULL  — never configured. Every configurable cell is denied, and the
--         settings screen says configuration is needed.
-- '{}'  — configured, with nothing granted. A legitimate, deliberate state.
--
-- An allow-list rather than a pair of granted/denied sets: absence means "not
-- granted", which is the same answer the policy gives for an unconfigured
-- workspace, so there is no third per-cell state to represent or to disagree
-- with the application about.
alter table public.workspaces
  add column if not exists permissions_granted text[];

comment on column public.workspaces.permissions_granted is
  'Spec §162 "Configurable" cells this workspace has granted. NULL means never '
  'configured; the application denies every configurable cell until it is. '
  'Only cells whose §162 entry is Configurable may appear — a "Decision '
  'required" cell is rejected by the check constraint below and ignored by the '
  'policy regardless.';

-- The closed set of configurable cells, transcribed from §162. A key outside
-- it cannot be stored, so a renamed or invented action cannot silently grant
-- anything. Kept in step with CONFIGURABLE_PERMISSIONS by a test.
alter table public.workspaces
  drop constraint if exists workspaces_permissions_granted_known;
alter table public.workspaces
  add constraint workspaces_permissions_granted_known check (
    permissions_granted is null
    or permissions_granted <@ array[
      'view_all_leads_customers',
      'add_leads_customers',
      'change_record_owner',
      'reassign_follow_ups_renewals',
      'assign_whatsapp_conversations',
      'send_bulk_whatsapp_messages',
      'import_export',
      'send_manual_email_reminders',
      'send_controlled_bulk_email_reminders',
      'manually_assign_leads_within_team',
      'view_assigned_whatsapp_conversation',
      'archive_or_restore_lead',
      'archive_or_restore_customer',
      'grant_or_revoke_explicit_record_share',
      'manually_resolve_lead_in_assignment_required',
      'retry_automatic_assignment_for_waiting_lead',
      'bulk_reprocess_leads_in_assignment_required',
      'clear_undeliverable_email_address',
      'resolve_ambiguous_whatsapp_conversation_identity'
    ]::text[]
  );

-- ---------------------------------------------------------------------------
-- The Manager record scope — §162.1
-- ---------------------------------------------------------------------------
-- Exactly the two choices the specification names, and NULL for "not chosen".
-- "All Records" means all records in THIS workspace: it is not cross-workspace
-- authority, and tenant isolation is enforced separately and independently.
alter table public.workspaces
  add column if not exists manager_record_scope text;

comment on column public.workspaces.manager_record_scope is
  'Spec §162.1 Manager record scope: all_records, or own_assigned_shared. NULL '
  'means the workspace has not chosen, and record access for a Manager is '
  'denied until it does. "All Records" is scoped to this workspace only.';

alter table public.workspaces
  drop constraint if exists workspaces_manager_record_scope_known;
alter table public.workspaces
  add constraint workspaces_manager_record_scope_known check (
    manager_record_scope is null
    or manager_record_scope in ('all_records', 'own_assigned_shared')
  );

-- ---------------------------------------------------------------------------
-- Runtime grant
-- ---------------------------------------------------------------------------
-- The runtime role's UPDATE on workspaces is column-scoped, so these columns
-- are unwritable until named here. The existing columns are restated so this
-- file reads as the complete, current grant.
grant update (
  name,
  business_type,
  country,
  currency,
  time_zone,
  enabled_modules,
  permissions_granted,
  manager_record_scope
) on public.workspaces to limenzy_app;

-- No new policy. `workspaces_owner_admin_update` already restricts UPDATE on
-- this table to an active owner_admin of the selected workspace, which is who
-- §162 allows to configure the CRM. Policies of the same command are OR-ed, so
-- a second one could only widen access.

commit;
