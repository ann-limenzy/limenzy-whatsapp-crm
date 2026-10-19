-- ---------------------------------------------------------------------------
-- Milestone 3D — the §39 activity kind for a Record Owner change
-- Spec §26, §49, §162, §163.10, §163.13
-- ---------------------------------------------------------------------------
--
-- ONE STATEMENT, ON PURPOSE.
--
-- PostgreSQL will not let a new enum value be USED in the transaction that
-- added it, and the Supabase migration runner wraps each file in exactly one
-- transaction. Everything that references `owner_changed` — the check
-- constraints, the reassignment routine — therefore lives in the next file,
-- which runs in a transaction of its own after this one has committed.
--
-- Splitting it is not a style choice. Putting the constraint beside the
-- value fails with "unsafe use of new value of enum type", and it fails at
-- apply time rather than at review time.

alter type public.lead_activity_kind add value if not exists 'owner_changed';
