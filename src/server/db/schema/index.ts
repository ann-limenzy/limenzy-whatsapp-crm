/**
 * Application schema barrel — the entry point `drizzle.config.ts` reads.
 *
 * Milestone 1C-B adds the multi-tenant foundation only: workspaces, the people
 * who use them, and the membership that ties the two together. Business
 * entities (Leads, Customers, Sales Teams and the rest) arrive in their own
 * milestones, and the row-level security policies that enforce tenant
 * isolation arrive in 1C-C — the tables below are created with RLS enabled and
 * **no policies**, so nothing reaches them until those policies exist.
 *
 * Process reminder (see `docs/local-development.md`): Drizzle may *generate*
 * candidate SQL from these definitions, but the reviewed SQL must land in
 * `supabase/migrations/`, which is the one authoritative applied history.
 */

export * from "./enums";
export * from "./user-profiles";
export * from "./workspace-memberships";
export * from "./workspaces";
