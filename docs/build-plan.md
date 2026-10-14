# Build Plan

Milestone sequence for Limenzy CRM. Each milestone is a review gate: it is
implemented, verified and approved before the next one starts.

Approved decisions and interpretations live in
[architecture-decisions.md](./architecture-decisions.md). Functionality is
governed by `CRM_SaaS_Product_Spec_V1.md` (180 sections plus decimal
sub-sections).

**Specification baseline.** This plan implements checkpoint `4c633b3` —
_docs: finalize production-ready CRM specification_.

- `docs/CRM_SaaS_Product_Spec_V1.md` is **authoritative**.
- `docs/CRM_SaaS_Product_Spec_V1.docx` is its **synchronized client-readable
  counterpart**, not a second source of truth.
- Wireframes remain **presentation artefacts**. Where an older wireframe
  conflicts with the specification, the specification governs; a wireframe is
  never implemented as authority over it.
- A milestone may refine how something is built, never what the specification
  requires.

---

## Development before company Supabase access

Work starts now, locally. Waiting for company Supabase and provider credentials
is not a reason to stall the foundation.

- Run the **local Supabase stack** for PostgreSQL, Auth, Storage emulation and
  local email testing.
- Keep **every schema change in a version-controlled migration**. No manual
  changes to a database that a migration cannot reproduce.
- Use **seed data that contains no client-sensitive information** — synthetic
  names, numbers and addresses only. No real customer or lead data in a
  fixture, and nothing belonging to any client project.
- **Database suites remove the rows they create**, each in its own `afterAll`.
  The strength of that cleanup is **not** uniform, and the difference matters
  when reading a local row count:
  - `schema.test.ts` and `workspace-names.db.test.ts` record the ids they
    insert, delete in foreign-key-safe order, **read back** to confirm the rows
    are gone, and **fail the run** if anything survives or a delete errors.
  - The other seven suites delete their fixtures best-effort: each `catch` is
    swallowed and nothing is read back, so a failed cleanup leaves rows behind
    without failing the run.
  - Memberships are deleted through their **tracked parent ids** — the
    workspace ids and profile ids the suite created — not by tracking each
    membership's own primary key.
  - This stops **new** leakage from the suites that verify. Synthetic rows left
    behind by earlier runs were deliberately not deleted, so local counts still
    include that historical residue.
- Keep provider integrations **behind interfaces/adapters** (§81.1, §116.19,
  §176.1), so the provider decisions in §180.1 stay open without blocking work.
- Where external credentials are unavailable, use **local or fake provider
  implementations** behind those adapters.
- **Never invent production credentials**, and never commit one.
- **Never place a service-role or secret key in a browser-exposed variable.**
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the only Supabase key that may carry
  the prefix; `src/lib/env.ts` rejects an `sb_secret_` value there, and also
  rejects a legacy `anon`/`service_role` JWT.

Setup, daily commands and troubleshooting live in
[local-development.md](./local-development.md).

**Local emulation proves the code, not the deployment.** Passing locally does
not demonstrate that production provider configuration is correct. A separate
**integration-verification gate** runs once company Supabase and provider
credentials are supplied, and the RLS proof gate
([architecture-decisions.md §6.1](./architecture-decisions.md)) must be repeated
against the real environment before tenant data is introduced.

---

## Milestone 1 — Application foundation (split into four gates)

### 1A — Project foundation and visual app shell ✅ complete

Project initialisation, code-quality tooling, the light/dark design-token
system, and a responsive app shell with placeholder routes.

No authentication, no database, no permissions, no business modules.

### 1B — Supabase authentication and workspace onboarding ✅ complete

- `@supabase/ssr` clients: browser, Server Component (read-only cookies),
  Route Handler / Server Action (writable cookies), admin (secret key,
  `server-only`).
- Current Supabase key model: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for
  anything browser-reachable, `SUPABASE_SECRET_KEY` server-only. The legacy
  `anon` / `service_role` JWTs are not supported under any name.
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

Landed. The onboarding screen itself was completed inside 1C (Phase 4C-3) once
the workspace tables existed to write to, and now lives at
`src/app/(account)/setup/`. Screens §8–§14 remain unbuilt, and nothing in the
product claims they are done.

### 1C — Drizzle foundation, tenant context and focused RLS proof

- Drizzle config scoped to the `public` schema; migration role and runtime role
  kept genuinely separate.
- Foundation schema: `user_profiles`, `workspaces`, `workspace_memberships`,
  `workspace_invitations`, `workspace_modules`, `workspace_role_permissions`.

Progress:

- **1C-A — local Supabase and Drizzle tooling: done.** Pinned CLI and Drizzle,
  `supabase/config.toml`, the single migration history, safe seed, `db:*`
  scripts and [local-development.md](./local-development.md).
- **1C-B — multi-tenant foundation schema: done.** `workspaces`,
  `user_profiles` and `workspace_memberships`, with the three specification
  roles (§2, §159), Active/Inactive membership status (§159), deactivate-never-
  delete foreign keys (§159, §160), and RLS enabled with **no policies** so the
  tables are deny-by-default. `workspace_invitations`, `workspace_modules` and
  `workspace_role_permissions` are deliberately **not** in 1C-B: invitations
  belong with the Settings → Users flow, and module and permission tables with
  Milestone 1D's gating work.
- **1C-C — tenant isolation: built, gate passed.** The §6.1 proof gate passed
  in full against the hosted development project on 2026-10-14 (run
  `fab69fd8`), which closes the two checks that could not be demonstrated
  locally. The pattern may now be propagated across the schema. In detail:
  - **Policies and roles (done).** `limenzy_owner` owns the objects and never
    logs in; `limenzy_app` is the runtime login, non-owner and NOBYPASSRLS;
    `limenzy_bootstrap` is NOLOGIN and exists only for the initial-workspace
    routine. All three tables carry forced row-level security, and
    UPDATE/INSERT grants are column-scoped. The nine policies are split by
    role: four **runtime** policies `TO limenzy_app` (own profile, own
    memberships and the selected workspace for SELECT, plus owner/admin UPDATE
    of that workspace), and five **bootstrap** policies `TO limenzy_bootstrap`
    (SELECT and INSERT on `user_profiles` and `workspace_memberships`, INSERT
    on `workspaces`) used only by the initial-workspace routine.
  - **Session context (done).** `withTenant()` opens one transaction and issues
    three `set_config(..., true)` settings, so the context is transaction-local
    and cannot leak to the next request on a pooled connection. A context can
    only be produced by `createTenantContext()`, and only
    `server/auth/workspace-context.ts` may call it.
  - **Identity and selection (done).** `resolveVerifiedIdentity()` reads the
    profile and active memberships under RLS; `resolveWorkspaceContext()`
    validates an optional, untrusted candidate against them; the committed
    `requireWorkspaceContext()` re-resolves identity **and** active membership
    on every request, with no caching of any kind.
  - **Naming.** The helper is `requireWorkspaceContext()` as planned, but it
    returns the implemented branded `TenantContext` rather than a type called
    `WorkspaceContext`. The earlier name in this plan and in
    architecture-decisions.md §6 describes the same object.
  - **Onboarding and selection (done).** Workspace creation, the chooser, the
    access-unavailable screen, the saved preference and its recovery — see
    “1C-C Phase 4D” below.
  - **The RLS proof gate — all 10 checks demonstrated.** Checks 1–8 were
    exercised against a real local PostgreSQL and re-demonstrated hosted.
    **Check 9 (the Supabase transaction pooler with the Drizzle driver) and
    check 10 (migration and runtime credentials genuinely separate in a hosted
    project) both passed** against `limenzy-crm-dev` on 2026-10-14. Neither was
    waived or reinterpreted. See “Hosted verification” below and
    architecture-decisions.md §6.1 for the evidence.
  - **Two tenant gateways.** `withTenant()` (tagged-template SQL) and
    `withTenantDb()` (Drizzle), both on the same restricted runtime pool, both
    setting the same three transaction-local settings before any caller
    statement. Nesting one inside the other is refused in both directions.
    architecture-decisions.md §6.3 records the design and the parser contract
    that comes with it.

#### 1C-C Phase 4D — workspace routing and selection (implemented)

Committed. What exists, precisely:

- **Account surfaces** under `src/app/(account)/` — setup, the workspace
  chooser and the access-unavailable screen. They require authentication and
  deliberately **not** a workspace, because they are the screens that answer
  “which workspace?”.
- **Application surfaces** under `src/app/(app)/`. The layout resolves a
  workspace, and every page beneath it calls `requireWorkspaceContext()` again
  for itself, because a layout is not re-executed on client-side navigation
  between sibling routes.
- **The root route resolves and routes** rather than assuming `/dashboard`,
  which is what spec §179.1 requires of an installed application's `start_url`.
- **A saved workspace preference**: one workspace id in an `HttpOnly`,
  `SameSite=Lax`, path-wide cookie with no `Domain`, written only by the
  chooser's Server Action, cleared on sign-out and by the reset Route Handler.
  It is a selection hint and never authorization — every request re-validates
  it against active memberships under RLS.
- **Stale-preference recovery** through `GET /workspace/reset`, which expires
  the cookie and returns a root-relative `Location`, so the browser keeps its
  own scheme, host and port and the session survives.
- **Chooser names** read one workspace at a time through `withTenant()`, since
  the policy grants a `workspaces` row only when it matches the selected
  workspace. No policy change, tooling credential or service-role bypass.
- **Not built**: a second workspace for an existing member, invitations, and
  every CRM business module. The module routes under `(app)` are still
  placeholder screens that say so, and the navigation lists destinations that
  are not implemented.

#### Verification status at this checkpoint

**Previously reported** for commit `90db9e4` (“feat: connect workspace
onboarding and selection”), by the verification pass that preceded it. These
figures are quoted, not re-measured by later documentation passes:

| What ran                   | Result                                                                       |
| -------------------------- | ---------------------------------------------------------------------------- |
| `npm test`                 | 924 passed, none failed, none skipped                                        |
| `npm run test:db` (strict) | 203 passed, none skipped — 198 database-backed plus 5 independent            |
| format · lint · typecheck  | passed                                                                       |
| `npm run build`            | passed                                                                       |
| `git diff --check`         | passed                                                                       |
| Browser flows              | the listed workspace flows passed against a local production build over HTTP |

The 5 independent tests are the fixture-cleanup runner cases in
`src/server/db/schema.test.ts`, which use test doubles and need no database;
they are counted by the strict runner because they live in a gated file.

**Local only.** Every figure above comes from the local Supabase stack. It is
not evidence about a hosted project. The two hosted gaps it left — §6.1 checks 9
and 10 — have since been closed by the hosted run recorded below. One gap
remains open and is **not** a §6.1 check:

- **HTTPS `Secure` cookie behaviour in a browser is unverified.** The flag's
  derivation is covered by unit tests and was observed as `false` over local
  HTTP, which is correct there; no HTTPS origin was available to confirm the
  browser receives it as `Secure` in a deployed environment. This needs a
  deployed HTTPS origin, which is a deployment task, not a 1C-C requirement.

#### Hosted verification (2026-10-14, run `fab69fd8`)

Against the hosted development project `limenzy-crm-dev`.

| What ran            | Result                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------- |
| Hosted §6.1 harness | **46 passed, 0 failed, 0 skipped, exit 0**                                              |
| Gateways exercised  | `withTenant()` (SQL) and `withTenantDb()` (Drizzle)                                     |
| Runtime connection  | `limenzy_app` through the transaction pooler, port 6543, verified TLS                   |
| Tooling connection  | `postgres`, port 5432, fixtures and baselines only                                      |
| Fixture cleanup     | every recorded identifier confirmed absent; all four table counts back to baseline zero |

Both gateways passed workspace isolation, transaction-local context, rollback
and concurrent-context separation. Runtime/tooling authority separation passed,
with every permission denial required to be SQLSTATE 42501 specifically. The
negative TLS controls — wrong CA, mismatched server name, no pinned CA — each
failed the connection; verification was never disabled.

**Configuration.** The harness is outside the repository and set `DATABASE_URL`
and `DATABASE_CA_CERT` inside its own process only. **`.env.local` was not
switched** and no hosted credential was exported to a parent shell or written to
disk; both passwords were typed at hidden terminal prompts.

**Still placeholders.** Every CRM business module remains a placeholder screen.
This gate is a database-layer proof and says nothing about business
functionality.

### 1D — Permissions, module gates and tenant-isolation test suite

**Progress — permission policy slice (implemented).** `src/lib/permissions.ts`
holds the §162 matrix as typed, reusable policy: 67 actions × 3 roles, with
"Configurable", "Decision required" and Team-Lead-conditional cells kept
distinct rather than flattened to booleans. `evaluateRecordAccess()` implements
§162.1 separately, because a role permission is never authority over a record.
Evaluation is deterministic and database-free; unknown roles and actions,
unconfigured workspace toggles, an unset Manager record scope and unverified
conditions all deny. `src/lib/permissions.test.ts` checks it against a
hand-transcribed reading of §162 (230 tests).

**Not implemented by this slice**: module gating and the §172 dependency engine,
record-access enforcement, the workspace settings that supply the toggles and
the Manager scope, Sales Teams, explicit record shares, the two-workspace
fixture and the tenant-isolation contract test. The policy helpers decide; no
server operation consults them yet.

**Progress — module gating slice (implemented).** `src/lib/modules.ts` holds the
§171 registry: the six switchable modules, §8's recommended-setup default and
the §172 dependency rules, all as pure functions. A workspace's configuration
is read through the restricted tenant gateway by
`src/server/auth/workspace-modules.ts`; navigation renders only enabled modules
in the sidebar, drawer and mobile bar, and each module route re-checks for
itself with `requireModule()`, so a disabled module is 404 by URL and not merely
unlinked. Settings → Modules & Features lets an Owner/Admin change one module at
a time; the role is re-checked on the server through the §162 policy, §172
blocks a dependent change with the specification's own wording instead of
cascading, and row-level security refuses the write for anyone else.

An unconfigured workspace — `enabled_modules IS NULL`, which is every workspace
until someone changes a setting — reads as §8's recommended setup. Absence of
the column is detected by asking `information_schema` first rather than by
catching `42703`: PostgreSQL marks a transaction failed after that error and the
driver re-raises it once the callback resolves, so catching it does not work.
Nothing else is absorbed, so a permission or connection failure surfaces instead
of silently enabling every module.

**Hosted migration applied.** `20261014071500_workspace_modules.sql` was applied
to `limenzy-crm-dev` through the migration runner, so the history records it. It
adds a nullable `workspaces.enabled_modules text[]`, a known-keys check, the
§172 dependency check and a column-scoped UPDATE grant for `limenzy_app`; no
table, policy or row changed. Confirmed afterwards by a read-only check: the
column is present on hosted and the application's own read path succeeds against
it.

**Browser checks — user-reported.** Against `http://localhost:3001` in the
"Test Business" workspace, the developer reports that:

- disabling Leads removed it from navigation;
- `/leads` then returned 404 when typed directly, so the route refuses rather
  than merely being unlinked;
- re-enabling Leads restored both the navigation entry and access;
- disabling Products & Services while Renewals & Reminders was enabled was
  blocked, which is the §172 dependency behaviour.

These are **reported by the developer, not independently observed** by the
verification pass that recorded them, and they are quoted rather than
re-measured. They cover the behaviour a user sees; they are not a substitute
for the automated checks above.

**Not implemented by this slice**: record-access enforcement, the workspace-level
"Configurable" toggles the §162 matrix reads, the Manager visibility setting,
Sales Teams, explicit record shares, the §172 dependencies that are about
configuration rather than modules (an active WhatsApp connection, a verified
email sender, an eligible template), §172.1 in-flight work, the two-workspace
fixture and the tenant-isolation contract test. Module gating decides whether a
module is available; it is not a permission and does not enforce one.

**Progress — permission settings slice (implemented).** The §162 cells a
workspace may decide, and the §162.1 Manager record scope, are now persisted and
configurable. `CONFIGURABLE_PERMISSIONS` is derived from the matrix itself
rather than written out, so it lists exactly the 19 "Configurable" cells — 17
Manager, 2 Staff/Sales, none for Owner/Admin — and a "Decision required" rule
cannot appear in it. `src/server/auth/workspace-permissions.ts` reads the
configuration through the tenant gateway and feeds it to the existing evaluator;
Settings → Roles & Permissions exposes both settings to an Owner/Admin, with the
role re-checked on the server through §162 and row-level security refusing the
write for anyone else.

Neither setting has a specification-defined default. §162 says "Configurable"
without naming one, and §162.1 says the workspace "configures" the scope without
saying what it starts as. Inventing one would be inventing product policy, so an
unconfigured workspace keeps the fail-closed behaviour — every configurable cell
denied, Manager record access denied — and the settings screen says plainly that
a decision is needed rather than looking like a workspace where everything
happens to be off.

A "Decision required" cell is kept out by four independent layers: it is absent
from the derived list the screen is built from, the Server Action refuses it
before the database is touched, the column's check constraint rejects it, and
the evaluator would ignore a stored value anyway. The second and third were
confirmed against a real database — `manage_sales_teams` and `manage_users` are
both refused with SQLSTATE 23514.

Validated against a matched local runtime/tooling pair (15/15): the constraints
reject unknown, Decision-required and fixed cells and an invalid scope; stored
configuration reaches the evaluator; an Owner/Admin may change a cell while a
Manager of the same workspace and an Owner/Admin of another workspace are both
refused by row-level security; and the two workspaces keep separate
configurations.

**Not implemented by this slice**: any business operation that consults the
evaluator. `permissionFor()` and `recordAccess()` are available and tested, and
nothing calls them — there is no Leads or Customers operation to call them from.
The scope conditions a granted cell still requires are the caller's to verify;
no caller exists yet.

**Hosted permission migration applied.** `20261014140000_workspace_permissions.sql`
was applied to `limenzy-crm-dev` through the migration runner. Verification
passed 10 of 10 checks: the history entry, both nullable columns, both check
constraints, the permission constraint listing exactly the 19 §162 Configurable
cells, the scope constraint limited to the two §162.1 values, the runtime role's
UPDATE grants being exactly the eight intended columns and not `id`, the
existing account, workspace, profile and membership all preserved, module
configuration untouched, every workspace starting NULL on both new columns, and
the constraints refusing a Decision-required cell, a fixed cell and an invalid
scope with SQLSTATE 23514 inside rolled-back transactions. The application's own
permission-settings read path succeeded afterwards, and the temporary credential
file was removed.

**Browser persistence check — user-reported.** In the "Test Business" workspace
at `http://localhost:3001`, the developer reports that a Manager record
visibility choice and a configurable permission were saved and both survived a
page reload. **Reported by the developer, not independently observed** by the
pass that recorded it.

#### Milestone 1D acceptance criteria — status

Measured against the six criteria listed above, not against a wider reading:

| #   | Criterion                                                                      | Status                                                             |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| 1   | §162 matrix as executable data, with the workspace "Configurable" toggles (D5) | done                                                               |
| 2   | §162.1 visibility resolution, Manager scope per workspace (D6, D7, D8)         | resolution done; no operation consults it                          |
| 3   | Module gating and the §172 dependency engine, replacing `ALL_MODULES_ENABLED`  | done                                                               |
| 4   | Two-workspace, multi-role fixture including a member of both                   | **done** — `src/test/fixtures/tenant-fixture.ts`                   |
| 5   | Tenant-isolation contract test enumerating every repository function           | **structure done**; business inventory empty, which proves nothing |
| 6   | RLS backstop test with no GUC and with a wrong GUC                             | **done** — `rls.test.ts` 1–3, 9, 10 + settings columns             |

**Criterion 4.** `createTenantFixture()` builds two workspaces and four people,
including a user who is an **active member of both** with a different role in
each — staff_sales in A, owner_admin in B — plus an inactive membership, because
an inactive membership must behave as no membership rather than as a missing
row. Every identifier is recorded as it is created and `cleanupTenantFixture()`
removes exactly those, reading each back to confirm absence. It is written for a
tooling connection, which is why a fixture is never itself evidence: the proof
comes from reading the result back through the restricted runtime role.

**Criterion 6.** Already satisfied by `rls.test.ts`, which issues raw SQL as
`limenzy_app` with no tenant settings (item 1), empty settings (2), a non-UUID
setting (3), a wrong workspace (9) and an inactive membership (10).
Re-implementing it would add a second place to keep correct. The Milestone 1D
settings columns are new surface on the same table, so they are covered in
`settings-isolation.db.test.ts`: no tenant settings reads nothing and writes
nothing, a mismatched workspace reads nothing, and a profile setting naming
another person reads nothing.

**Criterion 5 — structure, with an honest gap.**
`src/test/tenant-access-contract.test.ts` discovers every exported server
function in a file that reaches the tenant gateways or the runtime pool, and
fails unless each is registered with the suite that demonstrates its isolation.
Thirteen functions are registered today, eleven with database evidence. The
registry rejects an unregistered function, a stale entry, an evidence file that
does not exist, and an entry claiming database evidence from a suite that is not
a database suite.

**There are no business repositories yet**, and the test says so in its own
header and asserts that the statement is still there. Everything recorded as
isolation evidence anywhere in this plan is **foundation** evidence — identity,
workspace selection, names, module settings and permission settings. None of it
is evidence about Leads, Customers, Follow-ups, Renewals, WhatsApp or documents,
because no such data access exists to be evidence about. No Leads, Customers,
Follow-ups, Renewals or WhatsApp data access exists, so **nothing here is
evidence that business records are isolated**. The contract is the mechanism
that makes the first such repository fail the suite until it is registered with
real evidence.

A design point found while writing these tests: a membership row is visible to
the person it belongs to **regardless of the selected workspace**, because
`workspace_memberships_self_select` is keyed on the profile with no workspace
predicate. That is deliberate — the workspace chooser must list every workspace
you belong to — and `rls.test.ts` item 5 already asserted it. The scoped thing is
the `workspaces` row. A first draft of the new suite asserted the opposite and
was wrong.

Sales Teams, explicit record shares, messaging and reminder workflows, the
§172.1 in-flight rules and the §163.18 decisions are **not** 1D criteria. They
appear in the notes above only as things a slice did not do, and adding them
here would widen the milestone.

- The spec §162 permission matrix as executable data, with the workspace-level
  "Configurable" toggles (D5).
- Visibility resolution against the specification's own wording (§162.1), not a
  shorthand. The Manager scope is configured per workspace as either **All
  Records** or **Own, Assigned and Explicitly Shared Records** (D6) — the
  second is not “own only”, because it also covers records assigned to them and
  records explicitly shared with them. Staff/Sales may access the Leads and
  Customers they own, operational items assigned to them once the
  related-record permission has been validated, and Leads and Customers
  explicitly shared with them (D7, D8). Sales Team membership alone grants
  access to nothing. **Resolution is implemented** — see the permission
  settings slice below — but no business operation consults it yet, because no
  Leads or Customers operation exists to consult it.
- Module gating and the §172 dependency engine, replacing
  `ALL_MODULES_ENABLED` in the navigation config with the workspace's real
  module set.
- Two-workspace, multi-role test fixture, including a user who is a member of
  both workspaces.
- Tenant-isolation contract test enumerating every repository function.
- RLS backstop test issuing raw SQL with no GUC and with a wrong GUC.

### 1E — PWA Foundation

Spec §179.1, plus §25, §175, §178, §179 and §180.

Deliberately small, and deliberately placed here. It follows **1B**
because the highest-risk item is session behaviour in standalone
display, which cannot be verified without real authentication. It
follows **1D** because the offline screen and install help are shell
surfaces inside the permission- and module-gated layout. It precedes
**Milestone 2** so that every feature screen built afterwards inherits
correct safe-area behaviour, a verified standalone layout and the
caching prohibition, instead of having them retrofitted across dozens of
screens.

- `app/manifest.ts` — name, short name, `start_url: "/"`, `scope: "/"`,
  `display: "standalone"`, theme and background colours.
- Application icons derived from the approved Limenzy chevron symbol —
  normal and maskable, with safe-zone padding. The original SVG assets
  are preserved and never edited.
- `viewportFit: "cover"` and safe-area tokens. **This fixes a live
  defect**: the shell already uses `env(safe-area-inset-bottom)` in
  three places, but without `viewport-fit=cover` those insets resolve to
  0 on iOS.
- Correct the `themeColor` values, which no longer match the tokens
  after the ambient-field revision, and derive the manifest colours from
  the same source.
- Apple web-app metadata (`capable`, `title`, `statusBarStyle`).
- Standalone-mode detection where useful.
- Install help for Android and iPhone, including the note that the
  installed application may or may not inherit an existing session.
- Branded offline fallback showing no workspace content.
- A service worker restricted to non-sensitive static assets and the
  offline page. It exists only for the offline fallback, not as an
  installation requirement.
- Update strategy for newly deployed versions.
- HTTPS requirement documented for deployed environments.
- Tests, and real-device installation verification on Android Chrome and
  iPhone Safari.

Not in scope: Web Push, background sync, offline mutations, offline CRM
data, workspace-specific branding, app-store packaging.

#### 1E progress — foundation implemented

Everything in 1E that can be verified without a deployed HTTPS origin is done.

**Installable manifest.** `src/app/manifest.ts` with `start_url: "/"` and
`scope: "/"`, `display: "standalone"` and `display_override: ["minimal-ui",
"standalone"]`. `start_url` is the root rather than `/dashboard` because
§179.1 requires an installed launch to _resolve_ where the user belongs: a
launch after sign-out reaches sign-in, and one with no workspace selected
reaches the chooser. No `shortcuts`, `share_target`, `protocol_handlers` or
`file_handlers` — a shortcut is an unauthenticated launcher entry point, and
pointing one at a workspace screen would advertise structure and strand a
signed-out user on a redirect.

**Icons.** `scripts/generate-app-icons.mjs` derives them from
`public/brand/limenzy-glass-logo-light.svg`, which it reads and never writes.
The chevron is isolated by rendering and cropping rather than by parsing path
geometry, then composited at two safe zones: 78% for `purpose: "any"` and 60%
for `maskable`, so an aggressive circular or squircle mask cannot clip the
symbol. Five files under `public/icons/`, plus an Apple touch icon.

**The safe-area defect is fixed.** `viewportFit: "cover"` is now set, and the
served HTML carries `viewport-fit=cover`. Without it the three existing
`env(safe-area-inset-bottom)` paddings — the mobile bar, the drawer footer and
the main column — resolved to 0 on iOS, so the bottom bar sat under the home
indicator.

**Theme colours corrected.** The literals in the root layout had drifted from
the tokens during the ambient-field revision: `#fafbfe`/`#0b0f1a` against a
`--background` that converts to `#f5fafe`/`#0f1728`. Both now come from
`src/lib/brand-colors.ts`, and a test converts the oklch tokens and compares,
so the next drift fails a check rather than waiting to be noticed.

**Offline screen.** `/offline`, static, showing no workspace content — no name,
no counts, no cached records, not even whether anyone is signed in. That is
structural rather than promised: the page performs no data access at all, which
matters because the precached copy is shared by everyone using the browser
profile and outlives a sign-out.

**Install guidance.** `/install`, public and static, covering Android Chrome
and iOS Safari separately rather than flattening them, and stating that the
installed app may or may not inherit the browser session — on iOS it usually
does not.

**Service worker.** `public/sw.js`, registered only in production and only from
a secure context. Its one job is the offline fallback.

> **Navigations are never cached.** They are network-only with the offline page
> as the fallback, so a real screen can never be stored and replayed to the next
> person at this device. Only GET is handled, cross-origin is untouched (which
> excludes every Supabase call), `/api/` and `/auth/` are refused outright, and
> the only cacheable prefixes are `/_next/static/` and `/icons/` — content-hashed
> build output and public branding. A response is stored only if it is `ok`,
> `basic` (so never opaque), carries no `Set-Cookie` and is not `no-store`.
> There is no push, sync or notification listener.

#### 1E checks performed

| Check                                          | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/pwa.test.ts`                          | 27 passed — manifest shape, icon files present and non-empty, caching-rule shape, offline-page data access, install guidance, safe-area fix, token-to-hex colour agreement                                                                                                                                                                                                                                                                                                                       |
| `src/app/sw-behaviour.test.ts`                 | 20 passed — the worker **executed** in a stubbed scope, not read: a navigation returns the live response and is **not** written to the cache, a failed navigation returns the precached offline page, POST / `/api/` / `/auth/` / `/_next/image` / cross-origin are left untouched, build output and icons are cached then served from cache, and a response is refused if it carries `Set-Cookie`, says `no-store`, is opaque or is an error. `activate` deletes every previous version's cache |
| Precache reachability                          | `/offline`, `/icons/icon-192.png` and `/manifest.webmanifest` all 200 on a production server, so `install()` succeeds rather than failing and leaving no fallback                                                                                                                                                                                                                                                                                                                                |
| Authenticated-route headers                    | `/`, `/dashboard` and `/settings` are served `private, no-cache, no-store, max-age=0, must-revalidate`, so no HTTP cache keeps them either — independent of the worker, which never caches a navigation at all                                                                                                                                                                                                                                                                                   |
| `/sw.js` headers                               | `Cache-Control: public, max-age=0`, so a new deployment's worker is revalidated on the next load rather than pinned                                                                                                                                                                                                                                                                                                                                                                              |
| `npm run build`                                | passed; `/offline`, `/install` and `/manifest.webmanifest` all build **static**, which is what keeps the precached copies user-independent                                                                                                                                                                                                                                                                                                                                                       |
| Production server smoke                        | manifest served with the expected fields and four icons; `/sw.js` served as `application/javascript`; `/offline` and `/install` reachable unauthenticated; all five icons served                                                                                                                                                                                                                                                                                                                 |
| Served HTML                                    | `viewport-fit=cover`, both `theme-color` values, Apple web-app metadata, `<link rel="manifest">`                                                                                                                                                                                                                                                                                                                                                                                                 |
| typecheck · lint · format · `git diff --check` | passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

#### 1E — what still needs an HTTPS deployment

None of the following can be completed locally, and none is claimed:

- **Installability.** A service worker needs a secure context. `localhost` is
  treated as secure, so registration works in local production; a deployed
  **HTTP** origin would silently not register. Confirming the install prompt,
  the launcher entry and the splash screen needs a real HTTPS origin.
- **Real-device installation** on Android Chrome and iPhone Safari, which the
  1E scope lists explicitly. This needs a URL a phone can reach.
- **Standalone launch and session behaviour** — whether the installed window
  inherits the browser session, and how sign-out behaves inside it. This is the
  highest-risk item in 1E and the reason it was sequenced after 1B.
- **HTTPS `Secure` cookie behaviour**, still open from earlier milestones. The
  flag's derivation is unit-tested and is correctly `false` over local HTTP.
- **Update strategy in practice** — that a new deployment replaces the previous
  worker and its cache. The mechanism is verified as far as it can be locally:
  `/sw.js` is served `max-age=0` so the browser re-fetches it, and `activate`
  provably deletes every non-current cache. Observing the cycle across two real
  deployments needs deployments.
- **In-browser registration and a genuine offline navigation.** The worker's
  logic is executed and asserted in Node, but no browser automation is installed
  here, so `navigator.serviceWorker.register` actually succeeding, and a real
  network-down navigation falling back, have not been observed.

**None of these is passed, and none of them blocks unrelated business-feature
work.** They gate claims about installed behaviour, not development: the
application runs, and every other milestone's checks are independent of them.

No deployment provider has been chosen and nothing has been deployed.

---

## Implementation sequence

The order below is the committed sequence. Each numbered step maps to a
milestone; the milestone sections that follow define the scope.

| #   | Step                                                         | Milestone                            |
| --- | ------------------------------------------------------------ | ------------------------------------ |
| 1   | Documentation baseline and local tooling                     | done at `4c633b3`; local stack above |
| 2   | Workspace, membership and tenant-isolation foundation        | 1C                                   |
| 3   | Database migrations, seed data and RLS verification          | 1C                                   |
| 4   | Roles, permissions and explicit record access (§162, §162.1) | 1D, 2                                |
| 5   | Leads, lifecycle and manual assignment                       | 3                                    |
| 6   | Sales Teams and Team membership foundation                   | 4                                    |
| 7   | Team-scoped Lead-assignment engine (**gated**)               | 5                                    |
| 8   | Customers and conversion                                     | 6                                    |
| 9   | Follow-ups                                                   | 7                                    |
| 10  | Products/services, Renewals and Reminders                    | 8                                    |
| 11  | Import / Export                                              | 9                                    |
| 12  | WhatsApp adapter and messaging flows                         | 10                                   |
| 13  | Email adapter and outbound email                             | 11                                   |
| 14  | Customer Documents and private storage                       | 12                                   |
| 15  | Reports, PWA hardening, security and production-readiness    | 13                                   |

Milestone 1B (authentication) precedes step 2 and is already the next gate;
Milestone 1E (PWA **foundation**) keeps its approved position after 1D and
before Milestone 2 (decision P6). Step 15's PWA work is the later **hardening**
pass, not a second foundation.

**Safe parallelism.** These may run alongside the main line without creating a
second dependency chain:

- The Sales Team **schema** (§163.1–§163.4, §163.12, §163.14) may be prepared
  before the client meeting, because the entities and relationships are settled.
- Provider **adapter contracts and test doubles** (§81.1, §116.19, §176.1) may be
  written at any point after step 4.
- Reporting **read models** may be designed while their source modules are built,
  but Reports itself stays last because it aggregates every module's terminal
  states.

**What must not run ahead.** No behaviour whose outcome depends on one of the
five unresolved client decisions in §163.18 may be implemented — rule-matched
team selection, imported-Lead routing, Team Lead visibility beyond the minimum
My Team roster, Team Lead manual reassignment, or Manager Sales Team authority.
Those stay denied until approved and configured.

## Milestone 2 — Workspace administration and access control

Spec §157–§162, §162.1, §158–§160, §171–§172.

Business Settings · Users (invite, edit, change role, deactivate/reactivate with
the §160 reassignment precondition and last-Owner guard) · Roles & Permissions
toggles · Modules & Features with dependency blocking · explicit record access
and sharing (§162.1).

Built before any CRM module because every module screen consults permissions,
visibility and module state on its first line. Permissions are denied unless
explicitly granted or configured (D8).

## Milestone 3 — Leads, lifecycle and manual assignment

Spec §30–§51, §26, §27, §29, §163.10, §163.11.

Leads list, add, profile, edit, lifecycle and status transitions, Record Owner
(distinct from Assigned To), **manual** assignment only — plus the **global
activity timeline primitive** (§27) that every later module emits into.

Automatic assignment is not part of this milestone.

## Milestone 4 — Sales Teams and Team membership foundation

Spec §163.1–§163.4, §163.12, §163.14, §163.15.

Sales Teams, membership (a salesperson belongs to **only one active Sales Team
at a time**), the Team Lead **responsibility** — which is not a role and does not
appear in the Roles list — team transfer, team settings, and historical
integrity.

Structure and administration only. No assignment behaviour.

## Milestone 5 — Team-scoped Lead-assignment engine (gated)

Spec §163.5–§163.9, §163.13, §163.16, §163.17.

Eligibility, My Team controls, assignment rules and their resolution order, the
rotation pool and stable rotation order, **Assignment Required**, and the
assignment audit history.

**Blocked until the five client decisions in §163.18 are confirmed.** Round
robin is **team-scoped**, never workspace-wide, and applies only to Leads —
never to Customers, Follow-ups, Renewals, conversations, activities, notes or
documents (§163.11).

## Milestone 6 — Customers and conversion

Spec §52–§58, §78, §29.1, §46.1.

Customers list, add, profile, edit, Record Owner, duplicate warning, archive and
restore (§29.1), and Lead → Customer conversion with the atomicity and
idempotency rules in §46.1.

Customers is the one module that can never be disabled (§171), and conversion
needs both sides to exist — which is why it follows Leads rather than preceding
them.

## Milestone 7 — Follow-ups

Spec §40–§44, §172.1.

Combined Follow-ups screen under the module-gating interpretation in
[architecture-decisions.md §3.1](./architecture-decisions.md), overdue derived
rather than stored (§3.3), follow-up transfer rules, and in-flight work when a
module is disabled (§172.1).

## Milestone 8 — Products & Services, Renewals and Reminders

Spec §59–§62, §63–§75, §166, §168, §67.1.

Products/services, important dates, renewal cycles with `assigned_to_user_id`
stored explicitly as a snapshot (§3.2), reminder settings, and the scheduling,
time-zone, missed-reminder and retry model in §67.1.

Needs the background-job mechanism.

## Milestone 9 — Import / Export

Spec §117–§143, §119.1, §130.1, §139, §141.

Import with the §119.1 V1 defaults and file-safety rules, duplicate matching
(§130.1), idempotent processing (§134), import history (§136), export format and
safety (§139), and the §141/§162 permission behaviour — Staff/Sales have no
import or export access.

## Milestone 10 — WhatsApp adapter and messaging flows

Spec §81–§116, §81.1.

Provider-independent adapter (§81.1) behind the contract, individual and
controlled bulk messaging, the lightweight shared inbox, conversation assignment
and status, delivery status, and signature-verified, idempotent, deduplicated
webhooks.

Templates are synchronized from the provider. The CRM does not create or approve
WhatsApp templates.

## Milestone 11 — Email adapter and outbound email

Spec §116.1–§116.19.

Workspace sender identity, composer, templates and variables, attachments,
recipient validation, individual and controlled bulk renewal reminders, email
status, and the §116.19 provider contract — including address-level
deliverability kept distinct from consent/opt-out.

**Outbound only.** V1 has no shared email inbox, no mailbox synchronization and
no reading of incoming replies inside the CRM; replies go to the configured
Reply-To address outside the CRM.

## Milestone 12 — Customer Documents and private storage

Spec §77, §176, §176.1.

Upload lifecycle (Uploading → Scanning → Available / Rejected → Archived),
10 MB per document, permitted types only, extension/MIME/signature agreement,
**fail-closed** malware scanning, private encrypted storage with no public
bucket or permanent public URL, signed links expiring within five minutes, and a
permission check on every view and download.

The object-storage provider is still a CTO decision (§180.1); the adapter keeps
it swappable.

## Milestone 13 — Reports, PWA hardening, security and production readiness

Spec §144–§156, §177, §179, §179.1, §180, §180.1.

Reports (last, because they aggregate every other module's terminal states),
PWA hardening on top of the 1E foundation, the §177 system-wide security
behaviour, and the production-readiness gates below.

---

## Deferred decisions

**Import and document limits are no longer undecided.** Spec §119.1 and §176.1
state the approved V1 defaults, and
[architecture-decisions.md §2.1](./architecture-decisions.md) records them:
10 MB / 10,000 rows / 200 columns, UTF-8 CSV and `.xlsx`, 24-hour original-upload
retention and 30-day result retention for import; 10 MB per Customer Document,
private encrypted storage, signature/MIME validation, fail-closed malware
scanning and five-minute signed links for documents. The implementation reads
these from configuration, and its **defaults must match the specification**. No
per-workspace storage quota is defined, so none is implemented.

What genuinely remains open:

| Decision                                                        | Needed by                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| WhatsApp provider (Meta Cloud API direct vs a BSP)              | WhatsApp milestone; affects webhooks, templates, session windows, delivery status. CTO approval — spec §180.1 |
| Email provider                                                  | Email milestone; adapter contract in §116.19. CTO approval — spec §180.1                                      |
| Private object-storage provider                                 | Customer Documents; must satisfy §176.1. Supabase Storage is provisional, not approved. CTO approval — §180.1 |
| Background-job mechanism                                        | Renewals & Reminders (§102), Import (§134), scheduling and retries (§67.1)                                    |
| Final production import limits, after load testing              | Before production sign-off; V1 defaults in §119.1 apply until then. CTO approval — §180.1                     |
| Final WhatsApp and Email bulk limits, after load testing        | Before production sign-off; defaults in §81.1 and §116.19 apply until then. CTO approval — §180.1             |
| Retention and deletion policy, and any production storage quota | Requires CTO **and legal** approval (§176.1, §180.1); not a client workflow decision                          |
| Backup retention, monitoring/alerting, on-call, SLA, RTO, RPO   | Production readiness. CTO approval — spec §180.1                                                              |
| Deployment platform                                             | Vercel is provisional, not a final approved production platform                                               |
| Node 22 LTS upgrade                                             | Optional; unlocks current majors of Vitest, jsdom and jest-dom                                                |
| Production hostname                                             | Deferred; not needed for 1E because start_url and scope are origin-relative                                   |
| Web Push provider                                               | Later milestone; explicitly outside V1 (spec §175, §179.1, §180)                                              |
| Workspace-level PWA branding                                    | Later milestone; would need per-workspace origins — a CTO hosting decision                                    |

**The five open client decisions in §163.18 are tracked separately** — see
[architecture-decisions.md §10](./architecture-decisions.md). They are product
decisions for the client, never CTO decisions, and a capability that depends on
one stays denied until it is approved and configured.

## Readiness and acceptance gates

Each gate is **documented here, not passed here.** A gate counts as met only
when its check has actually run and its evidence is recorded in the milestone
report. Documenting a gate never satisfies it.

| Gate                                  | What must be demonstrated                                                                                                              | Earliest         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Workspace isolation                   | Every read and write is workspace-scoped; a `workspaceId` from the browser is never trusted (§177)                                     | 1C               |
| Server authorization                  | Every Server Action and Route Handler re-checks authentication, permission and tenant scope; hiding a control is not authorization     | 1C               |
| Database-layer tenant isolation       | The ten checks of the RLS proof gate ([architecture-decisions.md §6.1](./architecture-decisions.md)); neither layer replaces the other | 1C               |
| Migration reproducibility             | A clean database rebuilt from migrations alone matches the expected schema                                                             | 1C               |
| Local seed-data safety                | Fixtures contain no client-sensitive information                                                                                       | 1C               |
| Membership and permission enforcement | The §162 matrix as executable data, with §162.1 record access; unresolved capabilities denied                                          | 1D               |
| Cross-workspace denial tests          | Two-workspace fixture; a cross-tenant miss returns **404**, not 403                                                                    | 1D               |
| Import idempotency                    | Re-running or resuming an import creates no duplicates (§134); §119.1 limits enforced                                                  | 9                |
| Webhook verification and dedup        | Signature-verified, invalid rejected, processed idempotently, safe when delivered twice or out of order (§81.1, §116.19)               | 10               |
| Background-job idempotency            | Scheduled, missed and retried work runs at-least-once without duplicate effects (§67.1)                                                | 8                |
| Private file access                   | No public bucket or permanent public URL; signed links expire within five minutes; permission re-checked per access (§176.1)           | 12               |
| Malware scanning                      | Scanning **fails closed** — an unavailable scanner never yields an Available file (§176.1)                                             | 12               |
| Audit history                         | Assignment, import, document and message audit trails are written and never rewritten (§163.13, §136, §176.1)                          | per module       |
| Provider-adapter boundaries           | No provider-specific assumption in domain logic; adapters swappable behind §81.1/§116.19/§176.1                                        | per module       |
| Secrets and environment validation    | Env validation fails fast; no service-role or secret key in a browser-exposed variable                                                 | 1B               |
| Production credential integration     | A separate verification pass once company Supabase and provider credentials exist — local emulation does not prove it                  | post-credentials |
| Backup / restore validation           | A restore is actually performed and verified, not assumed                                                                              | 13               |
| Monitoring and incident readiness     | Alerting, on-call and incident process in place (CTO decisions — §180.1)                                                               | 13               |
| The five client decisions             | §163.18 confirmed before any dependent behaviour ships; denied until then                                                              | before 5         |
| CTO approvals                         | Every §180.1 decision resolved before production sign-off                                                                              | 13               |

## Definition of done (every milestone)

Server-side authentication · server-side authorization · tenant-isolation checks ·
input validation · loading, empty, error and permission-restricted states ·
responsive behaviour · accessibility · tests for important business rules ·
regression tests · clean lint · clean strict type-check · passing tests ·
successful production build · an honest report of incomplete work, warnings and
assumptions.

A feature is not complete because its happy path renders.
