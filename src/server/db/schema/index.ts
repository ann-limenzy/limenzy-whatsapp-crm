/**
 * Application schema barrel.
 *
 * Milestone 1C-A establishes tooling only, so there are deliberately no tables
 * here yet. Workspaces, memberships and every other tenant entity arrive in
 * 1C-B, and their row-level security policies in 1C-C.
 *
 * When tables are added, export them from this file: it is the entry point
 * `drizzle.config.ts` reads, and the single place the typed schema is assembled.
 *
 * Reminder on process (see `docs/local-development.md`): Drizzle may *generate*
 * candidate SQL from these definitions, but the reviewed SQL must land in
 * `supabase/migrations/`, which is the one authoritative applied history.
 */

export {};
