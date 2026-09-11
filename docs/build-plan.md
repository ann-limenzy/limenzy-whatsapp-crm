# Build Plan

Milestone sequence for Limenzy CRM. Each milestone is a review gate: it is
implemented, verified and approved before the next one starts.

Approved decisions and interpretations live in
[architecture-decisions.md](./architecture-decisions.md). Functionality is
governed by `CRM_SaaS_Product_Spec_V1.md` (180 sections).

---

## Milestone 1 — Application foundation (split into four gates)

### 1A — Project foundation and visual app shell ✅ complete

Project initialisation, code-quality tooling, the light/dark design-token
system, and a responsive app shell with placeholder routes.

No authentication, no database, no permissions, no business modules.

### 1B — Supabase authentication and workspace onboarding — _next_

- `@supabase/ssr` clients: browser, Server Component (read-only cookies),
  Route Handler / Server Action (writable cookies), admin (service-role,
  `server-only`).
- `proxy.ts` (**not** `middleware.ts` — Next 16 convention) refreshing the auth
  token, with a matcher that excludes static assets.
- Email + password signup, email verification, sign-in, sign-out, password
  reset (D2, D3). No placeholder auth.
- `requireUser()` using `getClaims()` for identity verification — never
  `getSession()` for authorization.
- Environment-variable validation (Zod, server/client split, fails fast).
- Onboarding Screen 1 only (spec §7): create the business workspace — name,
  type, country, timezone, currency. Screens §8–§14 are later.
- Real user identity replaces the "Not signed in" presentation in the top bar.

### 1C — Drizzle foundation, tenant context and focused RLS proof

- Drizzle config scoped to the `public` schema; migration role and runtime role
  kept genuinely separate.
- Foundation schema: `user_profiles`, `workspaces`, `workspace_memberships`,
  `workspace_invitations`, `workspace_modules`, `workspace_role_permissions`.
- `WorkspaceContext` (branded type) and `requireWorkspaceContext()`, which
  re-verifies active membership on every request.
- `withTenant()` transaction helper issuing `set_config(..., true)`.
- **The RLS proof gate** — all ten checks in architecture-decisions.md §5.1 must
  pass before the pattern is propagated across the schema. If any fails, stop
  and report the exact failure.

### 1D — Permissions, module gates and tenant-isolation test suite

- The spec §162 permission matrix as executable data, with the workspace-level
  "Configurable" toggles (D5).
- Visibility resolution: Manager `all` vs `own` (D6), Staff own-only (D7, D8).
- Module gating and the §172 dependency engine, replacing
  `ALL_MODULES_ENABLED` in the navigation config with the workspace's real
  module set.
- Two-workspace, multi-role test fixture, including a user who is a member of
  both workspaces.
- Tenant-isolation contract test enumerating every repository function.
- RLS backstop test issuing raw SQL with no GUC and with a wrong GUC.

---

## Milestone 2 — Workspace administration and access control

Spec §157–§162, §158–§160, §171–§172.

Business Settings · Users (invite, edit, change role, deactivate/reactivate with
the §160 reassignment precondition and last-Owner guard) · Roles & Permissions
toggles · Modules & Features with dependency blocking.

Built before any CRM module because every module screen consults permissions,
visibility and module state on its first line.

## Milestone 3 — Customers core

Spec §52–§58, §55, §78, §26, §27, §29.

Customers list, add, profile, edit, Record Owner, duplicate warning, archive and
restore — plus the **global activity timeline primitive** (§27) that every later
module emits into.

Customers first because it is the one module that can never be disabled (§171)
and everything else attaches to it.

---

## Later milestones (order, not yet scoped)

1. Products & Services (§59–§62, §166)
2. Follow-ups (§40–§44)
3. Renewals & Reminders (§63–§75, §168)
4. Leads and conversion (§30–§51)
5. WhatsApp (§81–§116) — needs the provider decision and a background-job mechanism
6. Import / Export (§117–§143)
7. Reports (§144–§156)

Reports is last because it aggregates over every other module's terminal states.

---

## Deferred decisions

| Decision                                                            | Needed by                                                                         |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| WhatsApp provider (Meta Cloud API direct vs a BSP)                  | WhatsApp milestone; affects webhooks, templates, session windows, delivery status |
| Background-job mechanism                                            | Renewals & Reminders (§102) and Import (§134)                                     |
| Document limits — max size, allowed MIME types, per-workspace quota | Documents (§77, §176)                                                             |
| Import limits — max file size and row cap                           | Import (§117–§136)                                                                |
| Node 22 LTS upgrade                                                 | Optional; unlocks current majors of Vitest, jsdom and jest-dom                    |

## Definition of done (every milestone)

Server-side authentication · server-side authorization · tenant-isolation checks ·
input validation · loading, empty, error and permission-restricted states ·
responsive behaviour · accessibility · tests for important business rules ·
regression tests · clean lint · clean strict type-check · passing tests ·
successful production build · an honest report of incomplete work, warnings and
assumptions.

A feature is not complete because its happy path renders.
