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
[development.md](./development.md).

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
  scripts and [development.md](./development.md).
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

#### 1E — what is still pending, and why

Nothing below is passed, and none of it blocks unrelated business-feature work:
these gate claims about installed behaviour, not development.

**Pending, but testable locally — no deployment required.** `localhost` is a
secure context, so a production build served locally can register a service
worker and be installed from desktop Chrome. These are outstanding because no
browser run has been performed, not because they need a deployed origin. The
earlier note that no browser automation is installed is no longer the reason:
Milestone 2A drove Google Chrome over the DevTools Protocol with nothing
installed, so the same approach is available here. **These remain outstanding
— none of them has been run:**

- **In-browser registration.** The worker's logic is executed and asserted in
  Node against a stubbed scope, and the file is served correctly by a local
  production server, but `navigator.serviceWorker.register` actually resolving
  has not been observed.
- **A genuine offline navigation.** The fallback is proved by dispatching a
  failed fetch at the worker; a real network-down navigation in a browser has
  not been watched.
- **Desktop installability** — the install affordance, the launcher entry and
  the splash screen, all of which Chrome offers from `localhost`.
- **The update cycle.** `/sw.js` is served `max-age=0` so the browser
  re-fetches it, and `activate` provably deletes every non-current cache. Two
  successive local production builds with a bumped cache version would
  demonstrate the swap end to end.

**Pending and genuinely requiring a deployed HTTPS origin.** A phone cannot
reach `localhost`, and the `Secure` attribute cannot be exercised over HTTP:

- **Real-device installation** on Android Chrome and iPhone Safari, which the
  1E scope lists explicitly.
- **Standalone launch and session behaviour on a device** — whether the
  installed window inherits the browser session, and how sign-out behaves
  inside it. This is the highest-risk item in 1E and the reason it was
  sequenced after 1B.
- **HTTPS `Secure` cookie behaviour**, still open from earlier milestones. The
  flag's derivation is unit-tested and is correctly `false` over local HTTP.

A deployed **HTTP** origin would be worse than localhost, not better: the
worker would silently fail to register.

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

### 2A — Business Settings (§158)

The eight fields §158 gives an Owner/Admin, as one section of the existing
Settings screen. **Applied locally and to the hosted development project on
2026-10-15.**

**What onboarding actually stored.** Checked rather than assumed, in
`20260921064437_workspace_bootstrap.sql`: `app.create_initial_workspace` inserts
exactly `(id, name, business_type, country, currency, time_zone)`. Business
Phone, Business Email and Address have never been captured or stored anywhere,
so `20261015090000_workspace_business_contact.sql` adds three genuinely new
columns — nothing is renamed and there is no data to migrate.

**Required and optional.** §158 lists the fields without saying which are
required, so this follows what the product already enforces rather than
inventing a rule. Name, Country, Currency and Time Zone are required: all four
are `NOT NULL` in Phase 1 and all four are collected at onboarding. Business
Type, Phone, Email and Address are optional, because requiring a field that is
collected nowhere would make every existing workspace invalid the moment the
screen appeared. A cleared optional field stores NULL, never an empty string —
the convention `business_type` already follows, enforced by a check constraint
so a future caller that forgets cannot introduce a second spelling of "not
provided".

**Authorisation, in three independent layers.** The Server Action resolves the
membership for the request and checks `configure_crm_settings` (§162,
Owner/Admin) before parsing anything, so a Manager learns that they may not do
this and nothing about which fields exist. `workspaces_owner_admin_update`
restricts the UPDATE to an active owner_admin of the selected workspace. The
runtime grant is column-scoped, so a column that was never named is unwritable
regardless of policy. Neither data-access function takes a workspace identifier:
the context decides which row is visible, so there is no parameter through which
a caller could reach another workspace.

**The workspace the form was rendered for.** `require-workspace.ts` sets out
the rule: a workspace id from the browser is untrusted and must never select
the target, but it may be compared against the resolved workspace to detect a
page rendered before a switch. That matters more here than for a permission
toggle — the saved preference is a cookie shared by every tab, so opening
Business Settings for one workspace, switching elsewhere and then saving would
otherwise overwrite all eight fields of the second workspace with the first
one's details, and report it as saved. The form carries the id, the action
compares it, a mismatch refuses, and the write still goes to the context the
gate resolved. Authorisation is checked first, so the role question is settled
before anything the browser sent is consulted.

**A zero-row UPDATE is a refusal, not a success.** A write that row-level
security declines affects no rows and raises nothing, so `updateBusinessSettings`
returns `{ ok: false, reason: "not_permitted" }` from an empty `returning`
rather than reporting a save that never happened.

**Evidence.** 59 validation tests, 23 Server Action authorization tests and 16
real-database checks in `settings-isolation.db.test.ts` — an owner_admin saving
their own workspace, a Manager, a staff_sales member and an inactive
owner-level membership all refused, a cross-workspace context refused, and a
write under workspace B leaving workspace A untouched. Both new functions are
registered in the tenant-access contract test. The not-blank and email-shape
constraints are exercised from the tooling connection, which bypasses RLS
entirely, so they are proved as a backstop rather than as a second copy of the
parser.

**Three pre-existing gaps closed on the way.** The Drizzle schema was missing
the three Milestone 1D columns (`enabled_modules`, `permissions_granted`,
`manager_record_scope`), and their four check constraints with them; the
`roles.test.ts` column-grant list and `schema.test.ts` nullability list had
never been updated for those columns either. All are now aligned, and the test
that keeps the `permissions_granted` closed set in step with the §162 matrix
now covers the Drizzle declaration as well as the migration — nothing compared
constraint definitions before, which is why this drifted silently.

**One module moved.** `workspace-options.ts` — the country, currency and
time-zone pickers — moved from `src/app/(account)/setup/` to `src/lib/`. A
local-tooling guard forbids anything outside `/setup` from reaching into that
route, and a second screen needing those pickers is the evidence that they were
never setup-specific data. The guard still holds, unweakened.

#### 2A hosted application

**Hosted migration applied.** `20261015090000_workspace_business_contact.sql`
was applied to `limenzy-crm-dev` on 2026-10-15 through the migration runner, so
the history records the version rather than the schema drifting ahead of it. It
adds three nullable `text` columns — `business_phone`, `business_email`,
`address` — four check constraints, and extends the column-scoped UPDATE grant
for `limenzy_app` to all eleven writable columns. No table, policy or row
changed, and none of the three columns has a default, so no existing row was
rewritten.

The run used the prepared script, which refuses unless the SQL still hashes to
the approved value, the committed blob at `e180c8d` hashes to the same value and
is an ancestor of HEAD, the target is the expected project, and exactly one
migration is pending. The administrator password was typed at a hidden prompt
into a short-lived `0600` passfile outside the repository, removed by a trap.

Approved SHA-256:
`0febdf7a5a744c85741d6532e4d917f6eb1104b71b11a833124666395e88e775`.

**Post-migration verification: 14 passed, 0 failed.** The version is recorded in
`supabase_migrations.schema_migrations`; all three columns exist, nullable, as
`text`, with no default; all four check constraints exist and the eight from
earlier milestones are untouched; `limenzy_app` holds column UPDATE on exactly
the eleven intended columns, with `id` and `updated_at` excluded and no
table-wide INSERT, DELETE, UPDATE or TRUNCATE; `workspaces_owner_admin_update`
is still the policy and no new one appeared; existing development records are
preserved; every existing workspace holds NULL for all three new columns, so
nothing was invented for rows that predate the screen; module and permission
settings are unchanged; each constraint refuses an empty, blank or malformed
value with `23514` while a legitimate value is still accepted, every such write
inside a transaction that was rolled back, and nothing survived the rollbacks.

**The runtime read path passed.** The application's own `businessSettingsFor`
was exercised through the real tenant gateway against hosted, with a synthetic
context so row-level security matches nothing and no stored record is read.
What it proves is that `limenzy_app` can read the three new columns. The same
probe run _before_ the migration failed with `42703`, so it is sensitive to
exactly what the migration changes and does not pass vacuously.

#### 2A hosted browser walkthrough — user-reported

Against the hosted development project, the developer reports that saving,
reloading, renaming and clearing optional fields all worked.

These are **reported by the developer, not independently observed** by the pass
that recorded them, and they are quoted rather than re-measured. They confirm
against hosted what the local run below measured directly; they are not a
second measurement of it.

#### 2A browser verification — observed, not reported

Run against a temporary dev server on port 3457, configured entirely from the
process environment: the local Supabase stack for both the database
(`127.0.0.1:54322`, runtime and tooling matched) and authentication
(`127.0.0.1:54321`). `.env.local`, which points the runtime at the hosted
project, was not read for any of those values and not modified. The browser was
Google Chrome driven over the DevTools Protocol — no automation package is
installed, and none was installed for this.

Fixtures: one workspace and three people (Owner/Admin, Manager, staff_sales),
each a real local Supabase account signing in through the application's own
sign-in screen. All ten rows were removed afterwards and read back to confirm
absence; the 171 workspaces, 91 profiles, 81 memberships and 2 auth users of
existing development data were untouched, before and after.

**18 of 18 checks passed.**

| Area                            | Observed                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner/Admin access              | The section renders, pre-filled from the stored row.                                                                                                                                              |
| Edit and save                   | All eight fields saved; confirmation shown; all eight columns verified from the tooling connection, which bypasses RLS.                                                                           |
| Persistence                     | Values identical after a full reload.                                                                                                                                                             |
| Clearing                        | Business type, phone, email and address cleared — stored as NULL, still empty after reload.                                                                                                       |
| Invalid input                   | Summary plus per-field messages, `aria-invalid` set, and the stored row byte-identical to before.                                                                                                 |
| Workspace name                  | The renamed business appears in the app shell's account menu.                                                                                                                                     |
| Stale form                      | A form carrying another workspace's id is refused with a reload prompt, and nothing is written.                                                                                                   |
| Desktop (1280)                  | No horizontal overflow; phone and email share a row, tops aligned.                                                                                                                                |
| Phone (375)                     | No horizontal overflow; fields stack; Save reachable; nothing exceeds the viewport.                                                                                                               |
| Manager / staff_sales           | Neither is offered the heading or the form.                                                                                                                                                       |
| Manager / staff_sales operation | The Owner's own submission, replayed verbatim from each of their sessions, changed nothing. The same replay from the Owner succeeded, so the difference is authorisation and not a broken replay. |

**Three defects were found by the browser run and fixed.**

1. **Line endings.** A browser submits a textarea with CRLF, so an address
   typed in the browser stored `\r\n` while the same text from any other
   client stored `\n`. The parser now normalises to `\n` before the length
   check, so one address is one stored value however it arrived.
2. **A stale server message.** Correcting a field the server had rejected left
   the old message under an input that was already valid. The newer verdict now
   wins: the server's until the field is re-checked, the client's after.
3. **Misaligned pair.** Side-by-side fields were stretched to the taller of the
   two, so the inputs sat five pixels apart whenever one hint wrapped.
   `content-start` packs the rows.

**Not included, deliberately.** Users (§159, §160), record sharing (§162.1
grants), and any further §157–§174 settings surface.

**What this slice does not close.** Two gaps predate it and remain open, and
nothing above should be read as progress on either:

- **The 1E PWA checks** listed under "1E — what is still pending, and why".
  None has been run. Business Settings is an ordinary authenticated screen and
  says nothing about installed or offline behaviour.
- **Business-record isolation.** Criterion 5 of Milestone 1D still stands: the
  tenant-access contract test enumerates the tenancy foundation, and the
  business inventory is empty, which proves nothing. `businessSettingsFor` and
  `updateBusinessSettings` are registered there with real database evidence,
  but they are workspace settings, not business records. The first Leads or
  Customers repository will fail that test until it is registered with evidence
  of its own, which is the point of it.

### 2B — Users (§159, §160)

Settings → Users: the list, Change Role, Deactivate and Reactivate, for
Owner/Admins only. **Applied locally and to the hosted development project on
2026-10-15.** Inviting people is deliberately not here — see 2C below.

**Why this is routines and not policies.** The obvious implementation is a
co-member SELECT policy for `limenzy_app`: "you may read a membership row when
you hold an active owner_admin membership in the same workspace". That
predicate has to read `workspace_memberships` to learn the reader's own role,
and a policy on that table which reads that table re-applies itself —
PostgreSQL raises `42P17`, infinite recursion. Routing through
`public.workspaces` does not help, because `workspaces_member_select` already
reads memberships, so the cycle closes one table further out.

So user management follows the boundary the Phase 4C-1 bootstrap routine
established: three SECURITY DEFINER routines owned by `limenzy_members`, a new
NOLOGIN NOBYPASSRLS role that owns nothing else and to which nothing can
connect. It is still constrained by row-level security — it is not the table
owner, and FORCE applies to the owner anyway — so its statements are filtered
by three narrow policies. `limenzy_app` receives EXECUTE on the three
functions and **no new table privilege of any kind**; its four existing
policies are untouched, and self-access behaves exactly as before.

**Recursion, checked rather than argued.** `rls.test.ts` now builds the policy
dependency graph **per role**, which is the accurate model: a policy applies
only to the roles it is scoped to, so a subquery re-applies policies for the
same role. Collapsed across roles the graph looks cyclic from 2B onward —
`limenzy_app` reads memberships via a policy that subqueries profiles, while
`limenzy_members` reads profiles via a policy that subqueries memberships. Per
role each is a straight line, and neither evaluation can reach the other's
policy. The test asserts each role's shape, runs cycle detection per role, and
checks no policy expression calls any table-reading routine.

**The last-Owner/Admin rule is atomic.** §159 requires at least one active
Owner/Admin to remain, and §160 forbids deactivating the last one. Both
routines take `FOR UPDATE` on every active owner_admin row of the workspace,
**in `user_profile_id` order**, _before_ counting. The ordering is not
cosmetic: `FOR UPDATE` locks rows as the plan returns them, so without a total
order two callers can take the same rows in opposite orders and deadlock.
Under READ COMMITTED a second transaction re-evaluates those rows once the
first commits, so a row that stopped being an active Owner/Admin drops out of
both the lock set and the count. Two concurrent demotions therefore end with
exactly one success, and a concurrent demotion and deactivation likewise —
both are asserted against a real database.

**Authorisation is re-checked after the locks.** A pre-commit review found a
genuine TOCTOU and reproduced it: each statement inside a VOLATILE function
takes a fresh snapshot under READ COMMITTED, so a concurrent transaction can
demote or deactivate the caller between the check at the top of a routine and
its locks — and when it does, the caller's row drops out of the lock set, so
the caller never blocks and the stale decision stays in force. With a delay
injected at that point, a demoted actor completed a role change. Both routines
now repeat `app.current_user_is_owner_admin()` immediately after acquiring the
locks. After that point the answer is stable for the rest of the transaction:
a caller who is still an active Owner/Admin holds a lock on their own row.

**Transaction and isolation assumptions.** The routines are written for READ
COMMITTED, which is what the pool uses, and the last-Owner rule depends on its
re-evaluation behaviour. Under REPEATABLE READ or SERIALIZABLE the locking
statement raises `40001` instead — safe, nothing is written, but an exception
rather than one of the words a routine returns. A genuine deadlock raises
`40P01` and aborts likewise. The gateway turns both into the ordinary
`unavailable` result, exposes no database detail, and **does not retry**: a
membership change is not idempotent from the person's point of view, so
re-running one they did not re-request is worse than telling them it did not
save. Every other SQLSTATE propagates, because a missing routine or a wrong
grant is a fault to surface, not an outcome to report as "could not save".

**Product decisions implemented.** Self-demotion and self-deactivation are
allowed only while another active Owner/Admin remains, which falls out of the
same rule rather than being a second code path. Both warn before acting and
require a second, differently-labelled click; the role warning says the
section will disappear, because a successful self-demotion re-renders this
screen away and there is nowhere left to show a confirmation. Deactivation
affects the workspace membership only — not the person's account, and not a
membership of another workspace — and nothing is deleted, so history keeps
the name.

#### 2B — the email decision, escalated rather than worked around

**Superseded by 2D, which implemented it.** The account below is kept because
it records why the obvious route was refused, and that reasoning still governs
what may be granted. §159's Email column was not implemented at the 2B
checkpoint, and the screen said so rather than showing a blank.

`auth.users` has ROW LEVEL SECURITY ENABLED WITH NO POLICIES and is owned by
`supabase_auth_admin`. A non-owner role therefore reads zero rows from it
however it is granted — a column-scoped `GRANT SELECT (id, email)` changes
nothing. Verified against the local stack: the migration role is not a member
of `supabase_auth_admin`, cannot `SET ROLE` to it and cannot take ownership of
the table; it reads `auth.users` only through `pg_read_all_data`.

Making email readable would need one of:

1. **`pg_read_all_data` membership** for a new role — read every row in the
   database, including every tenant's. Enormous blast radius for one column.
2. **`BYPASSRLS`** — excluded by the Phase 1 role design, which asserts by
   test that no limenzy role has it.
3. **A new policy on Supabase's own `auth.users`** — modifying infrastructure
   this project does not own, which Supabase may alter or reset, and which
   would affect every role that reads that table.

None is a routine implementation choice, so none was taken. The screen shows
the signed-in person's own address — which the server already holds from their
verified session, at no database privilege — and discloses that other
addresses are unavailable and why.

**What 2C then settled.** `workspace_invitations` does store an address — the
first in the product's own schema — but it is one an Owner/Admin typed, so it
required no new read of `auth.users` and no change to this answer. 2B's
resolution (§6.4: one server-only module, one Auth Admin operation, after a
`manage_users` check) stands unchanged.

#### 2B — the §160 reassignment precondition

None of the five record types §160 names exists: no Leads, Customers,
Follow-ups, Renewals or WhatsApp conversations table. So the precondition is
not passing, it is **vacuous** — nothing can be owned, so deactivation cannot
strand anything.

`src/server/auth/deactivation-responsibilities.ts` declares the sources rather
than inferring them, and returns `no_sources_exist` — deliberately a different
answer from "counted, and found none", so no caller can report "checked and
clear" about a check that never ran. Registering a source without implementing
its count throws rather than permitting a deactivation.

`src/test/deactivation-responsibilities.test.ts` compares that declaration
against the tables the Drizzle schema defines and **fails the build** when a
table is neither registered as a responsibility source nor explicitly recorded
as carrying none. A new Leads table will fail it until somebody decides.

**What the guard does not cover**, recorded here and in the module:

- it detects **tables, not columns** — adding `assigned_to` to an already
  classified table creates a responsibility it will not notice;
- it **cannot judge meaning**; it knows a table appeared, and the failure is a
  request for a human decision;
- it reads the **declared schema, not a database**;
- it is **not the reassignment workflow** — offering a target user and moving
  the work is Milestone 3 and later.

#### 2B verification

**Local database, matched runtime/tooling pair, process-scoped.** 275 database
tests, none skipped, including 37 new ones: co-member visibility; a context
naming workspace B seeing nothing of A; a reader whose profile setting names
another person seeing nothing; Manager, staff_sales and an inactive membership
all refused both the list and every mutation; an owner_admin of another
workspace refused; the runtime role refused `UPDATE` on memberships with
`42501` at the grant, before any policy; `auth.users` unreachable from both
`limenzy_app` and `limenzy_members`; a deactivation in A leaving the same
person's membership of B untouched; and the last-Owner rule under two
concurrent demotions and under a concurrent demotion and deactivation.

Four of those cover the TOCTOU specifically, made deterministic without
touching the routines: a separate transaction takes exactly the locks they
want, removes the actor's authority while holding them, and releases only once
the actor's call is demonstrably waiting. The fourth is a control proving the
routines still succeed when the actor keeps their authority, so a routine that
refused everything after a lock wait could not pass. The other three were
confirmed to FAIL against the pre-fix routine before being accepted.

**Focused unit tests.** 21 gateway tests covering outcome mapping and aborted
transactions — `40001` and `40P01` become `unavailable` with no retry and no
database detail in the result, every other SQLSTATE propagates, an unknown
outcome word is never read as success, and a failure in the read path is not
absorbed into an empty workspace. Plus 38 Server Action authorization tests
and 32 validation tests: Owner/Admin-only, role taken from the membership and never the form,
authorization checked before anything the browser sent, the stale-workspace
guard failing closed, every refusal mapped, and `selfAffected` decided from the
resolved membership rather than the payload.

**Browser walkthrough — observed, 27 of 27.** Chrome over the DevTools
Protocol against a temporary dev server on port 3461, configured entirely from
the process environment: the local stack for both database and authentication.
`.env.local` was neither read for those values nor modified. Fixtures: one
workspace and four people including two Owner/Admins; all removed afterwards
and read back absent, with the 171 workspaces, 91 profiles, 81 memberships and
2 auth users of development data untouched.

| Area                     | Observed                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List                     | All six §159 columns; four rows; own email shown, **other members' email still not implemented** and disclosed as unavailable; Sales Team disclosed as not implemented. |
| Change Role              | Saved, reached the database, survived a reload.                                                                                                                         |
| Deactivate / Reactivate  | Stored, and the person stayed listed as Inactive with a Reactivate action.                                                                                              |
| Last Owner/Admin         | The second could be deactivated; the last could not, and nothing changed.                                                                                               |
| Self-actions             | Both warn and need a second click; self-demotion succeeded and the section disappeared immediately, without a manual reload.                                            |
| Manager / staff_sales    | Neither is offered the screen, and the Owner's own submission replayed from their sessions changed nothing — the same replay from an Owner/Admin succeeded.             |
| Desktop 1280 / phone 375 | No horizontal page overflow at either; at 375 the table scrolls itself rather than the page.                                                                            |

**One defect found by the browser run and fixed**: a self-demotion re-rendered
the screen away with no explanation, because the actor is no longer an
Owner/Admin. The role form now carries the same confirmation the deactivate
action had, and says the section will disappear.

`tsc`, `eslint`, `prettier` and `git diff --check` clean, apart from the
pre-existing `public/sw.js` formatting warning, which is left untouched.

**Not included, deliberately.** Add User and invitations (2C), Sales Team
membership and Team Lead (Milestone 4), and the §160 reassignment workflow.

#### 2B and 2D — hosted application

**Both migrations applied and recorded on 2026-10-15**, in order, through the
migration runner, so `supabase_migrations.schema_migrations` carries both
versions rather than the schema drifting ahead of its history:

1. `20261016090000_workspace_users.sql` — SHA-256
   `f586bc5a…42853f11`
2. `20261018090000_workspace_members_auth_id.sql` — SHA-256
   `4879126e…68b9b999`

The second drops and recreates a routine the first creates, so the order was
not optional and the apply script refused unless exactly those two were
pending in exactly that order.

**Hosted verification: 17 passed, 0 failed.** Both versions in the history;
`limenzy_members` present as NOLOGIN, NOBYPASSRLS with no administrative
attributes; `limenzy_app` not a member of it; **no role gained USAGE on schema
`auth`** and no `limenzy*` role holds BYPASSRLS; the four `app` routines
present with the intended owners and definer flags, each pinning an empty
`search_path`; `workspace_members()` carrying the recreated six-column shape,
which is what proves the second migration took effect and not merely the
first; EXECUTE on it restored to `limenzy_app` alone with PUBLIC and the Data
API roles excluded; the three new policies scoped to `limenzy_members`; the
four Phase 2 policies untouched and still `{limenzy_app}`; `limenzy_app`
holding no write privilege on memberships; `limenzy_members` holding SELECT on
two tables, column `UPDATE (role, status)` only and no CREATE on schema `app`;
the routines refusing a caller with no tenant context; development records
preserved; no membership row altered; and the runtime role still refused a
direct membership write with `42501`, rolled back.

**The Users runtime read path passed** against hosted: `workspaceMembers()`
through the real tenant gateway with a synthetic context returns no rows, the
catalogue reports the expected return shape, both mutations refuse an
unauthorised caller, and `auth.users` remains unreachable from the runtime
role. The same probe fails with `42883` before the migrations, so it is
sensitive to what they change rather than passing vacuously.

One tooling defect was found and fixed during the attempt: the shared
pre-apply target check had the Milestone 2A expectations hard-coded, so it
refused the Users run because the §158 columns existed — which is exactly what
2A was meant to leave behind. The check now takes its expectations from the
caller and refuses a caller that declares none.

#### 2B and 2D — hosted walkthrough, user-reported

Against the hosted development project, the developer reports that:

- name, email, role and status all display correctly;
- the last active Owner/Admin cannot demote themselves, and cannot deactivate
  themselves;
- a reload confirms the membership is still Active and still Owner/Admin.

These are **reported by the developer, not independently observed** by the
pass that recorded them, and they are quoted rather than re-measured. That the
Email column shows addresses at all also evidences that
`SUPABASE_SECRET_KEY` is configured for this project.

**Scope of the hosted walkthrough.** It exercised a single-member workspace.
**Multi-member behaviour was verified locally, not here** — co-member
visibility, cross-workspace refusal, Manager and staff_sales refusal, role
changes and deactivation of other people, the concurrency cases, and another
member's address being shown all rest on the local database suite and the
local browser run recorded above.

#### 2B — what remains outstanding

Everything below is open after this checkpoint. None of it is started, and
nothing above should be read as progress on any of it.

- **Add User and invitations** — 2C. Since built; see the 2C section below.
  Applied to hosted development, with invitations emailed by the application
  through an SMTP adapter. §11's onboarding invite screen remains pending.
- **Sales Team integration** — the §159 column renders "Not available" until
  Sales Teams exist (Milestone 4), including Team Lead designation and the
  §163.3 replacement rule that §160 defers to.
- **The §160 responsibility checks AND the reassignment enforcement** — the
  registry is empty because no business module exists; its guard fails the
  build when the first table appears, and the workflow that offers a target
  user and moves the work is Milestone 3 and later. Nothing today blocks a
  deactivation on outstanding work, because no work can exist.
- **The 1E PWA checks** remain pending; none has been run.
- **Business-record isolation** remains open. The three new functions are
  registered in the tenant-access contract with real database evidence, but
  they are membership administration, not business records; the inventory that
  would prove record isolation is still empty, which proves nothing.

### 2D — Member email addresses (§159)

The Email column, filled for every member of the selected workspace, active
and inactive alike. **Applied locally and to the hosted development project on
2026-10-15.**

**The database route is closed, and that is not a matter of effort.**
`auth.users` has row-level security with no policies and is owned by
`supabase_auth_admin`. A dedicated `BYPASSRLS` role was designed, built and
applied locally before the real gate surfaced: the migration role holds
`USAGE` on schema `auth` **without grant option**, so granting that USAGE on
emits `WARNING: no privileges were granted` and silently does nothing — while
the column grants on `auth.users` succeed, which makes it easy to miss. That
attempt was fully reverted. The remaining database routes each widened
privilege far beyond one column and were refused.

**So the address comes from the Auth Admin API, server-side.** The cost is
recorded in [architecture-decisions §6.4](./architecture-decisions.md): the
application server now holds a project-wide privileged credential. The
database-role separation is unchanged and still governs every CRM read and
write — and it does **not** constrain this credential. What constrains it is
the single module that holds it, the single operation it performs, and the
order the page does things in: `manage_users` first, then the
workspace-scoped routine, then a lookup of only the ids that routine
returned, for only the page being displayed.

**One migration**, `20261018090000_workspace_members_auth_id.sql`: adds
`auth_user_id` to `app.workspace_members()` so the server has something to
look up. No new role, no new grant, no new policy. The routine is dropped and
recreated because the return type changes, and its ownership and exact
EXECUTE grants are restored — a dropped function takes its ACL with it, and
PostgreSQL grants EXECUTE on a new function to PUBLIC by default.

**Paged, not capped.** Each displayed address is one Auth request, so the list
shows 25 per page and resolves only that page. There is no member-count
cutoff: a large workspace is paged, never truncated, and a test walks every
page asserting no member is lost or repeated.

**States the screen shows.** Addresses where resolved; a dash where the
account has none; "Unavailable" for one that could not be read; and a notice
when the lookup was partial, unavailable, or the key is not configured in that
environment. The list always renders — email never takes the screen down.

**Verified.** 42 database tests including the recreated routine's grants,
ownership and workspace-scoped ids; 17 tests on the Auth boundary covering
every state, bounded concurrency, cancellation bound to the client's own
`fetch`, and the operations it must never perform; 17 paging tests; 11
structural tests on the call order and on what crosses to the browser; and a
browser run of 11 checks confirming another member's address is shown, that it
is re-read when Auth changes, and that no Auth user id appears in the
delivered HTML.

**Setup, now done for hosted development.** Both migrations are applied and
`SUPABASE_SECRET_KEY` is configured for that project, which the hosted
walkthrough evidences by showing addresses rather than the not-configured
notice.

For any **other** environment the same two steps apply, in this order: apply
both migrations, then set `SUPABASE_SECRET_KEY` from the same project as
`NEXT_PUBLIC_SUPABASE_URL`. No deployment platform has been chosen, and the
local application runs against hosted Supabase, so the key lives in the
git-ignored `.env.local` beside the hosted URL and publishable key. Until
both are done the Email column shows the not-configured notice and everything
else on the screen works normally.

### 2C — Invitations (§159 Add User) — applied to hosted development

Settings → Users now carries an Invitations section where an Owner/Admin
creates, copies, regenerates and revokes invitations, and an invitee joins
from a link at `/invitations`.

**Three separate mail paths. Do not confuse them.**

| Path                 | Sent by                    | Configured in                                           | Covers                               |
| -------------------- | -------------------------- | ------------------------------------------------------- | ------------------------------------ |
| Hosted Auth email    | Supabase Auth (GoTrue)     | Supabase **dashboard** → Authentication → Emails → SMTP | Sign-up confirmation, password reset |
| Local Auth email     | Supabase Auth, local stack | `supabase/config.toml` → Mailpit on 54324               | The same messages, in development    |
| **Invitation email** | **This application**       | `SMTP_*` / `EMAIL_FROM` in the app environment          | Workspace invitations only           |

Configuring one does **not** configure another. The application's adapter
needs its own host, port, credentials and sender even if Auth already has
identical ones, because the Auth service reads its settings and we read ours.

**A correction to an earlier claim in this plan.** It previously said the CRM
had "no mail provider connected" and that "the Mailtrap entry in the
environment file was checked and is not wired to anything the application
sends through". The second half was true and the first half was not: that
check covered **repository code only**, where there was indeed no mail
dependency and no SMTP. Hosted Supabase Auth SMTP is configured in the
dashboard, which that check never looked at. The maintainer reports hosted
confirmation and password-reset mail arriving in **Mailtrap**, which is
consistent with a custom Auth SMTP configured there. **Mailtrap must not be
described as unused.** What is accurate: no _application_ mail path existed
before this slice, and §180.1's D12 — the production provider for application
mail — is still open.

**Invitations are now emailed by the application**, through a small SMTP
adapter (`src/server/email/`), with the copyable link kept as a secondary
option on the screen. Verified locally against Mailpit. Whether the existing
Mailtrap endpoint can also carry these depends on which Mailtrap product it
is — a testing sandbox never delivers to real recipients — and that is a
question for the dashboard, not for this repository.

**What it does.**

- Create invitation / Copy link / Send a new link / Cancel invitation.
  The last two were renamed from "Regenerate link" and "Revoke" in a UX pass:
  the people using this screen are not administrators by trade, and "revoke"
  and "regenerate" are words from our vocabulary rather than theirs.
- One link is on screen at a time. Creating or replacing one puts it in a
  single place, and cancelling takes it away immediately — not when the
  server finishes re-rendering — with a confirmation naming the person.
- Settings may invite at any of the three roles (§162 lets an Owner/Admin
  promote someone the moment they join, so withholding it here only adds a
  step). §11's onboarding screen keeps its Manager/Staff pair — see below.
- Seven-day expiry; 256-bit tokens from `crypto.getRandomValues`; **only a
  SHA-256 digest is stored**; the link is shown exactly once and never
  recoverable afterwards.
- One live invitation per workspace and normalised address, enforced by a
  partial unique index. An **expired** one never blocks a fresh one.
- Regeneration replaces the digest and restarts the seven days, so the
  previous link stops working.
- Inviting an existing **active** member is refused at creation. An
  **inactive** member may be invited, and acceptance reactivates them at the
  invited role.
- Acceptance re-reads membership inside the locked transaction: an active
  membership keeps its current role and status and the invitation answers
  "already a member". An optional invited name never overwrites a name the
  person already has.
- Viewing a link redeems nothing — joining is an explicit press. The link's
  Route Handler touches no database.
- A signed-in person whose link was lost sees their pending invitations at
  `/invitations`, and `/setup` offers the invitation instead of quietly
  starting a second, empty workspace.

**Database.** One migration, `20261019090000_workspace_invitations.sql`. It
adds the `workspace_invitations` table, the `limenzy_invites` definer-owner
role, eleven policies and two `app` routines. It is the first table the
runtime role may `INSERT` into; it gains **no** `INSERT` on profiles or
memberships, and the migration's own verification block refuses to apply if
that ever changes. Full reasoning in architecture-decisions §6.5.

**Automated verification.** As of the commit that completes this slice:

- **1731 unit tests** pass; the 11 live-database files skip, loudly, because
  `.env.local` points the application at hosted development (see
  docs/development.md — a skip is not a pass).
- **323 database tests** pass against the local stack via
  `npm run test:db:local`, none skipped.
- **36 browser checks** covering the whole surface, and a later **16-check
  smoke run** of the three journeys that matter after the concurrency work:
  create-and-accept; regenerate an invitation whose issuer lost authority and
  join with the replacement; revoke and be refused. Both were driven through
  a real Chrome against a dev server on matched local configuration, in an
  isolated copy of the source so the developer's own `next dev` and its
  `.next` directory were untouched. Fixtures were removed by recorded id and
  left no residue.
- Later passes added **19 UX and continuation checks** (welcome page, one link
  at a time, cancellation failure, signup through confirmation to Join,
  ordinary signup still reaching `/setup`) and **19 email checks** across two
  dev servers — one pointed at the local Mailpit, one at a dead port — proving
  the message arrives, the failure path stays recoverable, and a retry
  re-issues rather than duplicating. No message left the machine; every
  recipient was an `@example.com` fixture.

**Applied to hosted development.** `20261019090000_workspace_invitations.sql`
is applied and recorded there, and the post-migration verification reported
**39 checks passed, 0 failed** — table shape, constraints, indexes, both
triggers, forced row-level security, the column-scoped grants, the definer
role's attributes, function ownership and pinned `search_path`, all eleven
new policies, and the seven earlier ones intact. The migration file itself is
unchanged since review; its SHA-256 is still
`3c03448e989ec79a5a2280bf89c28350c25fb12bff523cf9d5287e7bfc00bcce`.

**Manual walkthrough — user-reported.** The maintainer completed the
invitation journey end to end against hosted development: an invitation was
created and emailed, the invitee signed up from the link, confirmed their
address, and joined the workspace at the invited role. One invitee reached
"Set up your company" instead; read-only inspection showed the cause was an
address mismatch — the invitation had been created for a `.com` address while
the account was registered on `.test`, and that invitation had since been
cancelled. Not a defect in the flow, but it is what prompted the guidance
described below.

**The confirmation email template, fixed in the same pass.** Supabase's
default template links to its own `/auth/v1/verify` endpoint, which confirms
the address and then redirects carrying no `token_hash` — while this
application confirms server-side with `verifyOtp({ token_hash, type })`. Every
new account therefore landed on "That link isn't valid" _after_ its address
had been confirmed, and anyone arriving from an invitation lost their way
there. `supabase/templates/confirmation.html` now links at `/auth/confirm`
with the token, and `buildCallbackUrl` always emits a query string so the
template can append to it. This was a pre-existing defect in the sign-up flow,
not something invitations introduced.

**Hosted needs the same template, and now has it.** It is configured in
`supabase/config.toml` for local development; a hosted project uses the
template set in its dashboard, which the maintainer has applied there
(user-reported). The two are configured separately and must be kept in step —
a repository change does not reach hosted.

### 2C — invitation email

Invitations are now **sent by the application**, through a small SMTP adapter
(`src/server/email/`): `smtp.ts` holds the transport behind a one-operation
`MailAdapter` interface, `invitation-email.ts` builds the message. Plain SMTP
and no provider-specific code, so choosing a provider later is configuration
rather than a rewrite.

**Accepted is not delivered.** `sendMail` resolving means the server returned
250 and says nothing about arrival, so the screen says the mail server
accepted it and keeps **Copy link** underneath as the thing that definitely
works. A failed send never rolls the invitation back: it reports "Invitation
created, but the email could not be sent", offers the link, and offers
another attempt.

**Retry is a re-issue, because only a digest is stored.** The plaintext of a
token that failed to send cannot be recovered from the database by design, so
another attempt mints a new token on the SAME invitation row — nobody is
invited twice, the one-pending-per-address rule is never strained, and the
previous link dies the moment its digest is replaced. The screen says so
before the button is pressed.

A send failure logs exactly three fields — `code`, `responseCode`, `command`
— and nothing else. The server's own reply text and the envelope are
deliberately excluded: the first can quote a username back, the second names
the recipient, and the body carries a live link. That logging was added after
a misconfigured mailer failed with nothing recorded anywhere, which made the
cause invisible until the transport was rebuilt by hand outside the
application.

**Mailtrap is development testing, not production delivery.** Hosted Supabase
Auth is configured to send its confirmation and password-reset mail through a
Mailtrap **sandbox** inbox, and the application's invitation mail can use the
same endpoint. A sandbox captures messages and **never delivers them to a real
recipient**: it is the right target for development and staging and cannot be
the production answer. Production delivery still needs the §180.1 D12
decision — a sending domain with SPF and DKIM, credentials for it, and a
`NEXT_PUBLIC_SITE_URL` that is publicly reachable. Note also that Auth's mail
and the application's mail are configured in two different places and do not
share settings.

### 2C — a simpler invitation and signup experience

A UX pass aimed at people who are not administrators by trade:

- **Settings → Users → Invitations**: Send invitation / Copy link / Send a new
  invitation / Cancel invitation. One link is on screen at a time; cancelling
  removes it along with the row and confirms by naming the person, and only
  once the server has actually done it — a failure leaves the row where it was
  and says why. When no mail is configured the buttons say they create a link,
  because they do.
- **The invitation link** opens a welcome for a signed-out visitor — "Create
  account and join" as the primary action, "Already have an account? Sign in"
  as the secondary — rather than a bare sign-in form. Someone signed in with
  the right address goes straight to an explicit Join. Every dead end (used,
  cancelled, expired, wrong address) is one understandable screen.
- **Sign-up and verification** no longer tell an invitee they are creating an
  owner account for a business they are not setting up. `next` is carried
  through sign-up, the confirmation email and a resent confirmation, so the
  journey survives all three.
- **Specification references, milestone badges and Auth/database explanations
  were removed** from the Settings screens, along with the obsolete "adding
  people comes next" note.
- **`/setup` now explains an address mismatch.** When the lookup succeeds and
  finds nothing, it names the address the visitor is signed in as and explains
  that an invitation only works for the exact address it was sent to. When the
  lookup _fails_ it says so — previously an empty result and a failed lookup
  were indistinguishable, so somebody holding a valid invitation could be
  handed a form for building a second, empty workspace with nothing on the
  page or in any log to explain it.

**What the smoke run established, precisely.** An old link is dead as a
_token_ — after regeneration its digest matches no invitation anywhere, which
is what makes the previous link unusable. It is deliberately not a dead end
for the invited person: they are still invited, so `/invitations` offers them
the invitation that is actually live, by id, bound to their verified address.
Stranding somebody who was legitimately invited is not the behaviour the
revocation path is for — revoking is, and a revoked link offers no way to
join at all.

**Three defects this verification caught and closed**, each of which only
appears in a browser:

1. A hydration mismatch — a date formatted with the environment's own locale
   renders differently on the server and the client, and React discarded the
   tree, taking the one-time link with it. Dates are now formatted on the
   server in the workspace's §158 time zone.
2. `NextResponse.redirect()` normalises the host, so the link answered
   `Location: http://localhost:…` for a request to `127.0.0.1`. The
   host-scoped session cookie was not sent onward and a freshly signed-in
   invitee was asked to sign in again — in the one flow whose whole purpose is
   to survive sign-in. Now a root-relative `Location`, the fix
   `/workspace/reset` already documented.
3. A leftover invitation cookie shadowed the recovery list: the page offered
   "Join", the action preferred the dead cookie token, and a perfectly valid
   acceptance was reported as invalid. An offered invitation id now takes
   precedence over the cookie.

**Four more, from the pre-commit security review of the migration and the
acceptance path:**

5. **Concurrent profile creation raised 23505.** `user_profiles.auth_user_id`
   is UNIQUE; two acceptances for the same new person at once — two
   invitations in two tabs, or an acceptance racing
   `app.create_initial_workspace` — both found no profile and both inserted.
   Now `on conflict (auth_user_id) do nothing` followed by a re-read.
   `DO NOTHING` rather than `DO UPDATE`, because `limenzy_invites` holds no
   UPDATE on `user_profiles` and must not: an existing name is never touched.
6. **A half-finished acceptance could commit.** If the UPDATE that marks the
   invitation redeemed had ever matched no row, the routine returned
   `'invalid'` _after_ creating the membership — access granted, invitation
   still live. It now raises, which rolls the whole transaction back.
7. **The recovery path disclosed that an invitation existed.** An invitation
   id is not a secret, so answering `email_mismatch` for one somebody simply
   supplied would let anyone probe for live invitations. The id path now
   returns the same single `invalid` as a miss; the token path still says
   `email_mismatch`, because holding the token already proves that much.
8. **Creation guessed when it could not check.** Refusing to invite an
   existing active member needs addresses out of Auth, and that lookup can be
   absent or fail. Treating either as "not a member" quietly invited people
   who already had access. It now refuses with a configuration result and
   creates nothing.

9. **The inviter-authority race is closed, not accepted.** The issuer's
   authority was read from a snapshot, so a demotion committing a moment later
   left that reading in force and the membership was still granted. Acceptance
   now takes the same Owner/Admin lock set Milestone 2B takes — every active
   Owner/Admin row of the workspace, `FOR UPDATE`, `ORDER BY user_profile_id`
   — before any other membership row, and re-checks the issuer while holding
   it. Lock order across acceptance, 2B, revoke and regenerate is set out in
   architecture-decisions §6.5; there is no cycle, and 40001/40P01 are
   absorbed into the ordinary refusal with the transaction rolled back and
   **no automatic retry**. Proved by negative control: with the lock removed,
   both race tests fail with "acceptance did not wait for the Owner/Admin
   lock"; with it, they pass.
10. **Regeneration now re-issues.** An invitation whose issuer was demoted was
    permanently unredeemable, and regenerating it produced a fresh link
    guaranteed to fail. Regeneration sets `created_by` to the administrator
    doing it; a trigger refuses attributing an invitation to anybody else;
    revocation still leaves the original issuer on the record (§177).

A further one, found while running the suites, was not in this feature at all:
`.env.local` points `DATABASE_URL` at **hosted development**, and
`vitest.config.mts` passed it straight through, so a plain `npx vitest run`
ran the live-database suites against hosted. `scripts/test-db.mjs` already
refused that mismatch, but nothing stopped the plain runner.

**What the guard does now.** `resolveTestTargets()` in
`scripts/database-target.mjs` decides from the connection strings alone —
before any suite loads and long before a fixture could exist — and refuses a
non-loopback target, a mismatched loopback pair, or an unreadable string.
A refusal replaces both urls with an unreachable sentinel (`127.0.0.1:1`,
where nothing listens) rather than clearing them, so the unit tests that only
need a well-formed string still get one while no suite can reach a database.
The refusal is announced as a banner, repeated inside the run, and passed on
as `LIMENZY_DB_TARGET_REFUSED` so `npm run test:db` fails with the real reason
instead of reporting the sentinel. Skipped database checks are therefore never
mistakable for passed ones. `npm run test:db:local` is the safe way to run
them: it provisions a local-only `limenzy_app` password process-scoped and
never touches `.env.local`. The gateway suite also probes its runtime
connection now instead of assuming a present string works, and
`scripts/test-db.mjs` had its two targets labelled the wrong way round in the
mismatch message — it detected the problem but named the wrong half as hosted.

**What was attempted on hosted, and what is still unverified.** The runtime
half issued reads and four `DELETE` statements (`roles.test.ts` asserts they
are refused); three were refused with _permission denied_ and the fourth with
_relation "public.workspace_invitations" does not exist_. The runtime role
holds no INSERT grant on hosted, so the only row-creating path was
`app.create_initial_workspace` — and that was reproduced locally: with an
auth user id that exists in no `auth.users` row, it fails with **23503** on
`user_profiles_auth_user_id_fkey` and rolls back entirely, leaving nothing
behind. Every fixture auth user was created through the tooling connection,
which was local throughout.

**The read-only hosted check has since been run** (`verify-hosted-2c-incident.ts`,
by the maintainer, 2026-10-16). Result: **no persistent fixture creation
detected**. The nine expected migrations are present; 2C and all of its
objects are absent; no workspace, profile, membership or Auth row was created
on or after 2026-10-15. Its two fixture-pattern matches are the pre-existing
`Ann Sebastian` profile and `ann.dev@example.com` account, both created
2026-10-14 — before the incident, legitimate, and left untouched.

**What that does NOT establish.** The check looks for rows that were
_created_. It does not compare field values against a prior snapshot, and none
was taken, so it cannot show that no existing row was _modified_. The argument
that none could be is the privilege and foreign-key analysis above, not this
check. Treated as unverified in that respect.

### §11 onboarding invitations — still pending

Spec §11's onboarding invite screen is **not** part of 2C and remains to be
built. Its specified roles are unchanged: Manager and Staff/Sales only. It
will reuse these records and routines; nothing in 2C changes what §11
specifies.

### 2C — remaining limitations and deferred work

**Limitations, as the slice stands:**

- **No production email delivery.** The configured endpoint is a Mailtrap
  sandbox, which captures mail and delivers it to nobody. §180.1 D12 — the
  production provider, a sending domain with SPF and DKIM, and a publicly
  reachable `NEXT_PUBLIC_SITE_URL` — is still open.
- **"Sent" means accepted by the mail server**, not delivered. Bounces,
  greylisting and spam filing are invisible to the product; the copyable link
  is the fallback for all of them.
- **An invitation matches the invited address exactly.** Case and surrounding
  whitespace are normalised; aliases are not — `a.b@x` and `ab@x` are
  different addresses, as are different top-level domains. `/setup` now
  explains this, but nothing prevents the mistake at the point of invitation.
- **Auth mail and application mail are configured in two places** — the
  Supabase dashboard and the application environment — and do not share
  settings. Keeping them in step is manual.
- **The email template exists twice**, in `supabase/config.toml` for local
  development and in the hosted dashboard. A repository change does not reach
  hosted.
- **A verified address is assumed when the claim is absent.**
  `readEmailVerified` returns `true` for a token carrying no
  `email_verified` claim, which is the usual case, so that gate is effectively
  inert. It is not relied upon for authorisation — acceptance re-derives
  everything from stored rows — but it is weaker than it reads.
- **The Settings screen shows only invitations waiting to be accepted.**
  Cancelled and redeemed ones are invisible, so an Owner/Admin cannot see that
  an invitation went to the wrong address or was later withdrawn. This is what
  made the `.com`/`.test` mismatch above hard to diagnose from the product.
- **The inviter-authority race is closed by a lock, not by serialisable
  isolation.** Deadlock and serialization aborts are absorbed into the
  ordinary refusal with no automatic retry.

**Deferred, and deliberately not started here:**

- §11's onboarding invite screen (above).
- Invitation history in Settings — cancelled and redeemed rows, so the
  mismatch case is self-evident without database access.
- A production mail adapter behind the same `MailAdapter` interface, once D12
  lands. Switching from SMTP to a provider API is one implementation, not a
  redesign.
- Showing a pending invitee in the Users list, which §159 mentions and which
  these records now make possible.

## Milestone 3 — Leads, lifecycle and manual assignment

Spec §30–§51, §26, §27, §29, §163.10, §163.11.

Leads list, add, profile, edit, lifecycle and status transitions, Record Owner
(distinct from Assigned To), **manual** assignment only — plus the **global
activity timeline primitive** (§27) that every later module emits into.

Automatic assignment is not part of this milestone.

### 3A — Lead Pipeline and Lead Sources (§34, §164, §165) — applied to hosted development

Settings → Leads carries two sections an Owner/Admin configures for the
workspace: the **Lead Pipeline** and its **Lead Sources**. Both require the
Leads module to be on, checked server-side in every action. No Lead records,
assignment, sharing, timeline, archive, custom fields or Products & Services
are part of this slice.

Two tables, `workspace_lead_stages` and `workspace_lead_sources`, each with
`UNIQUE (workspace_id, id)` so a future `leads` table can carry a
**workspace-safe composite foreign key** and no Lead can ever reference another
tenant's stage. Neither table grants DELETE to any application role: retiring
a stage or a source is `is_active = false`, as §29 and §50 require.

**Outcome labels are editable; outcome meanings are fixed.** §34 requires a
workspace to RETAIN a Won outcome and a Lost outcome, and treats Lost as a
closed outcome rather than an active pipeline column; its default order ends
`… → Won`. That **Won is fixed as the final column, and non-deactivatable, is
our approved product decision** rather than something the specification spells
out — it is one of the decisions taken before this slice was implemented, and
it is recorded here as a decision so a later reader does not go looking for a
clause that says it.

None of those rules — the specification's or ours — is about the label, and
the schema agrees: `'Won'` and `'Lost'` appear only as default seed names,
while the partial unique indexes that keep exactly one of each key on `kind`.
So Won and Lost carry the ordinary rename control, and the screen says in one
line that renaming changes the label only. What stays fixed, in the database
rather than in the UI: a stage cannot change kind, cannot move to another
workspace, cannot be deactivated if it is an outcome, and Won cannot stop
being last.

An earlier revision of this slice withheld renaming from the outcomes. That
was an implementation choice presented as a requirement; the specification
does not ask for it.

**Defaults reach every workspace, old and new, from one place.**
`app.lead_stage_defaults()` and `app.lead_source_defaults()` are the single
source, read by both the bootstrap routine and the migration's backfill, so
the two cannot drift. Seeding is idempotent: the backfill keys on "this
workspace has no rows at all", so a workspace that renamed, reordered,
deactivated or added anything is never overwritten.

**A defect found and fixed during verification.** `check_shape` is a DEFERRED
constraint trigger and runs at COMMIT **as whichever role commits**, which for
workspace creation is `limenzy_app` — not the `limenzy_bootstrap` role that
wrote the rows inside `app.create_initial_workspace`. `limenzy_app` reads
stages through `workspace_id = app.current_workspace_id()`, unset during
setup, so the check saw no rows and refused every new workspace. The routine
now ends with `set constraints public.check_shape immediate;`, which runs the
check inside the routine while the bootstrap role is still current. The
failure direction is safe either way: a role that cannot see the rows counts
zero outcomes and the transaction is refused, so an invisible pipeline can
never read as a valid one.

**Verified by an isolated migration replay, not by assertion.** A disposable
database was built beside the development one — never replacing it — with the
real `auth` schema dumped into it, the ten predecessor migrations applied
through `supabase migration up`, three workspaces created through the real
pre-3A bootstrap path, and then 3A applied by the same runner:

- the three existing workspaces each received 5 stages (one Won, one Lost)
  and 5 sources, in `New → Contacted → Interested → Won` order;
- a new workspace created through `app.create_initial_workspace`, as
  `limenzy_app` under the tenant GUCs, was seeded the same way;
- the migration's own verification block passed, which the runner's success
  is: the block is inside the migration;
- after customising a workspace through `limenzy_app` (rename, add, reorder,
  deactivate a stage; rename, add, deactivate a source), the migration was
  re-applied through the runner and the rows came back **byte-identical** —
  same ids, names, sort orders and flags, no duplicates anywhere.

A catalogue comparison between that database and the development one found
**identical** function definitions (15), trigger definitions (11), policies
(32), constraints (45), indexes (21), RLS flags (6), enums (3) and owners
(24). The only differences were 125 `service_role` grants on the three
Phase-1 tables, none on either 3A table and none for any other grantee: the
`postgres` database carries Supabase's `ALTER DEFAULT PRIVILEGES … TO
service_role`, which is per-database and so absent from a freshly created
one. On the hosted apply that rule is in force, and the migration's explicit
`revoke all … from anon, authenticated, service_role` is what strips it.

**Applied to hosted development on 2026-10-17.**
`20261020090000_lead_pipeline.sql` is applied and recorded on
`limenzy-crm-dev`, through the Supabase migration runner, by the tooling in
`~/Limenzy-dev-tools/hosted-3a`. The file is unchanged since review; its
SHA-256 is still
`efcdd3f0ddf80c2c9b9651762de323e7060b66c8424e8ec6581c3ff1b7708c02`, and the
apply confirmed that hash against both the working tree and the committed
blob at `614acbf` before it did anything.

The **preflight reported 29 passed, 0 failed, 29 total.** It established, in
this order: the artifact; then the transport, from the client — the endpoint
answered PostgreSQL's SSLRequest, the chain verified against the pinned CA at
TLSv1.3 / TLS_AES_256_GCM_SHA384 with leaf `CN=*.pooler.supabase.com` issued
by `CN=Supabase Intermediate 2021 CA`, and the two negative controls, a
mismatched server name and an unrelated CA, were both refused; then identity
at each layer — the pooler login `postgres.<project-ref>` and the backend role
`postgres` it resolves to, on PostgreSQL 17.11; then the ten predecessor
migrations recorded, exactly `20261020090000` pending, the prerequisite
objects and roles present, and all of 3A's own objects absent.

**`pg_stat_ssl` reported `ssl=false`, and that is not a finding.** Behind
Supavisor it describes the pooler-to-database hop inside Supabase's network,
not the client's transport. An earlier revision of the tooling read it as the
client's and failed a correct connection over it; it is now printed as
labelled context with no verdict, and the client's own handshake is what is
checked. The identity check made the mirror-image mistake — comparing the
backend's `current_user` against the pooler login, which are two different
layers' names — and now checks each against what it is actually expected to
be. Neither was relaxed to make the other pass.

**No aggregate apply total was captured**, so none is claimed here. Every
check the apply printed passed, individually:

- the runner reported success and the history table shows **11 recorded,
  latest `20261020090000`**, with no other migration recorded by that run;
- schema — both tables with exactly their designed columns, the
  `lead_stage_kind` enum carrying `active,won,lost`, both composite
  `UNIQUE (workspace_id, id)` keys, the `UNIQUE (workspace_id, sort_order)
DEFERRABLE INITIALLY DEFERRED` ordering constraint, the four partial unique
  indexes, and all five triggers including the deferred `check_shape`;
- row-level security enabled **and** forced on both tables, the nine designed
  policies each scoped to a single role, none reaching a browser role, the
  owner or PUBLIC;
- grants — table-wide SELECT only to the two roles that need it,
  `limenzy_app` able to update only `name`, `sort_order` and `is_active`, no
  column grant on the timestamps, no DELETE or TRUNCATE for any application
  role, and nothing at all for the Data API roles;
- routine ownership and security — an empty `search_path` pinned on all six,
  both default-vocabulary functions IMMUTABLE, invoker and owned by
  `limenzy_owner` with EXECUTE to `limenzy_bootstrap` alone, the three trigger
  routines SECURITY INVOKER, and `app.create_initial_workspace` still SECURITY
  DEFINER owned by `limenzy_bootstrap` with EXECUTE to `limenzy_app` alone;
- default seeding — the workspace has a pipeline, exactly one Won and one
  Lost, an active ordinary stage and sources, and the seeded rows are exactly
  what `app.lead_stage_defaults()` and `app.lead_source_defaults()` return.

**Existing records were unchanged, in all four tables.** The fingerprint taken
before the apply and recomputed after it is identical, digest for digest:
`workspaces` 1 row `394a4867e737…`, `user_profiles` 5 rows `eb6eb83c588f…`,
`workspace_memberships` 5 rows `99010f601bfb…`, `workspace_invitations` 9 rows
`fa6fc06b4182…`. The digests are computed server-side over every column of
every row in order, so an edited value would show even where a count would
not. The two tables this migration creates are deliberately outside that
fingerprint — it is supposed to add configuration rows to them — and that they
received the right ones is the seeding check above.

**The application's own read path works against hosted.** `leadStages()`
returned `1:New(active) → 2:Contacted(active) → 3:Interested(active) →
4:Won(won) → 5:Lost(lost)` through `withTenant()`, with Won last among the
stages the pipeline shows, and `leadSources()` returned `Campaign, Other,
Referral, Walk-in, Website`. The probe reads a workspace and an Owner/Admin
the project already had; it creates no fixture and changes no setting.

**Manual walkthrough — user-reported.** The maintainer reports that the
Settings → Leads walkthrough passed against hosted development. Nothing
further about it is recorded here, because nothing further was witnessed.

**Stage occupancy is still unenforced on hosted, exactly as it is locally.**
Applying this migration changed nothing about that: there is no `leads` table
on hosted either, so §34's and §165's rule that a stage holding active Leads
cannot be deactivated is neither implemented nor checked anywhere. It remains
a dependency of the Lead slice, described below.

**Fixture teardown, fixed and measured.** Seeding a pipeline with every
workspace broke teardowns that deleted the workspace without its stages, and
two suites hid the failure behind `.catch(() => {})` with no read-back.
Measured before the fix: `bootstrap.test.ts` alone leaked **11 workspaces a
run**, the full database suite **9**. `tenant-fixture.ts`, `schema.test.ts`,
`bootstrap.test.ts` and `create-initial-workspace.db.test.ts` now delete
stages and sources first, report failures instead of discarding them, and
read back. Measured after: a full `npm run test:db:local` leaves the
workspace count **unchanged — zero leak** — with 348 tests passing and no
cleanup problems printed. Two pre-existing leaks in the shared fixture were
fixed along the way: memberships written by an accepted invitation, and
invitation rows, neither of which the teardown had ever removed.

**Remaining local residue.** 65 workspaces and 36 membership-less profiles
from runs before the teardown fixes, whose ids were never printed, are still
in the local development database. They were left alone deliberately —
provenance could not be established from recorded output, and a name or a
timestamp is not provenance. Their only effect is that the migration's two
**coverage** checks ("every workspace has a Won stage", "every workspace has
sources") fail against that database; every structural check passes, and the
isolated replay shows the whole block passing on a clean apply. 28 workspaces
and 4 profiles whose ids WERE recorded verbatim in test output were removed,
in the corrected teardown order, and verified absent.

**Stage occupancy is still unenforced, and must stay on the Lead slice's
list.** §34 and §165 require that a stage holding active Leads cannot be
deactivated until those Leads move. There is no `leads` table yet, so nothing
checks it and nothing tests it — the isolation suite asserts
`to_regclass('public.leads')` is null so the gap cannot read as coverage. The
locking contract a future `leads.stage_id` write must follow is written down
in `src/server/auth/workspace-lead-pipeline.ts` and
`src/server/db/schema/lead-pipeline.ts`: take the stage's row lock with
`select … for update` before referencing it, re-read `is_active`, and put the
occupancy check in a BEFORE UPDATE trigger.

**Verification reused for this slice:** one local browser pass over sign-in,
workspace creation, the seeded pipeline and sources, add/rename/reorder,
duplicate-name refusal, switch off and on, the last-active-stage refusal, and
source add/duplicate/switch; the live-database isolation suite (20 tests,
including a rename of both outcomes that leaves kind, position and active
flag untouched); and the focused component test for the controls each row
offers.

### 3B — Leads: creation, list and detail (§30–§32, §35–§37) — applied to hosted development

The first BUSINESS RECORD in this application. Everything before it was
tenancy or workspace configuration; a Lead belongs to one person inside a
workspace, and who may see it is decided by §162.1 rather than by membership.

**What it does.** Add Lead (§32) with Lead Name required and at least one of
phone or email; Stage defaults to the first active ordinary stage and Lead
Source is optional, both taken from 3A's configuration. The Lead list (§31)
with search over name, phone and email and the All / My Leads quick filters —
Staff/Sales default to My Leads, because anyone who cannot see every record is
only ever shown their own. Lead Detail (§35–§37) with the header, the
information panel, click-to-call (§27.1) and the one §27 activity this slice
can honestly show. Record Owner is the creator, and nothing can change it:
there is **no UPDATE grant on that column at all**.

**Workspace-safe by construction.** Stage, source, Record Owner and creator
are all composite foreign keys carrying `workspace_id`. The owner and creator
key to `workspace_memberships (workspace_id, user_profile_id)`, so a Lead
owned by someone who is not a member of its workspace is unrepresentable
rather than merely refused. No application role may DELETE either table.

**The 3A occupancy gap is closed.** The stage guard refuses to deactivate a
stage any Lead occupies, and the Lead write takes the stage row lock first, so
the two cannot race. Its refusal has its own message, told apart from "that
would leave no active stage" by a named constraint rather than by matching
text.

#### What the work turned up

Four things that were not in the plan, each found by a check rather than by
reading:

1. **`SELECT … FOR UPDATE` requires the UPDATE privilege** — measured, not
   assumed. `limenzy_app` holds that grant on stages but its UPDATE policy
   admits only Owner/Admin, so an inline lock returned no rows for a
   Staff/Sales user and **they could not create a Lead at all**. Locking now
   goes through `app.lock_lead_stage()`, owned by a NOLOGIN
   `limenzy_lead_support` role whose UPDATE policy carries `with check
(false)`: it may take the lock and can never write.
2. **§130.1 and §162.1 pull opposite ways.** Duplicate matching must cover the
   whole workspace; a record the actor may not access must not be revealed.
   `app.lead_duplicate_candidates()` returns ids and matched fields only, and
   the gateway re-reads those ids through the ordinary policy — so an
   inaccessible match is counted, never described.
3. **The driver returns `timestamptz` as a string inside Next and a `Date` in
   plain Node**, which made every Lead Detail render "Invalid time value". The
   gateway coerces rather than trusting the driver.
4. **React resets a form after an action**, so the duplicate warning appeared
   over an empty form and Save Anyway submitted nothing. The fields are
   controlled, and the post-save navigation is a server redirect rather than a
   client push that raced `revalidatePath`.

#### Security review, and what it changed

A focused review after the slice was complete found three material issues and
one piece of drift. All are fixed:

- **Inaccessible candidate ids and matched fields were reaching the browser.**
  The action put the gateway's candidate list straight into state, which
  `useActionState` serialises — so ids of Leads the actor may not access, and
  which field matched on each, crossed the boundary even though the screen
  drew only a count. The response now carries described candidates and a bare
  `hiddenMatches` count.
- **A posted `override=true` was treated as approval.** The permission was
  checked but nothing established that a warning had been SHOWN, so a client
  that always sent the flag never showed one. Create Anyway now also requires
  an acknowledgement this server issued — an HMAC over the workspace, the
  actor and a fingerprint of the normalised submission, valid fifteen
  minutes. **Changed data requires another warning**, because the fingerprint
  covers every value that would be written. The key derives one-way from
  `DATABASE_URL`, the one secret the application cannot run without;
  `SUPABASE_SECRET_KEY` is optional and degradable and would have made a core
  feature fail where it is absent.
- **The §160 responsibility count was incomplete and not atomic.** It ran
  through the actor's own policy — correct only while §162 keeps user
  management with Owner/Admin — and it ran in a different transaction from the
  status change, so a Lead created between the two left someone deactivated
  and still owning work. The foreign key's own lock does not help: an insert
  takes FOR KEY SHARE on the membership row and `update … set status` takes
  FOR NO KEY UPDATE, and **those two do not conflict**. Now
  `app.count_leads_owned_by()` is a definer routine covering every Lead in the
  workspace and **refusing with null** for anyone who is not an active
  Owner/Admin, and `deactivateMember()` changes the status and counts in ONE
  transaction. The lock order is stage → membership on the Lead side and
  membership alone on the deactivation side, so no cycle exists. Concurrency
  aborts return the existing `unavailable` result and are **not retried**.
- **Drift:** the development database carried a stale `limenzy_dedupe` role
  from an earlier revision of this migration, holding SELECT on `leads`.
  Roles are cluster-level, so both a file-built database and the development
  one inherited it and every catalogue comparison was blind to it. It is
  dropped, and `roles.test.ts` now names the six reserved roles exactly.

#### Verification

- **381 → 387 live-database tests**, none skipped, no fixture leak. The new
  `leads-isolation.db.test.ts` covers §162.1 for all three roles including an
  unconfigured Manager scope, cross-workspace invisibility by id, the
  composite-key refusals, a hand-written cross-tenant insert refused 42501,
  §162's add permission, §130.1 across the workspace with and without
  visibility, override records that cannot be forged, the occupancy rule, and
  three races driven with real concurrent transactions: create versus stage
  deactivation, create versus member deactivation, and §130.1's mandatory
  fourth checkpoint.
- Unit coverage for validation, the action gates, the acknowledgement and the
  controls each list row offers.
- **One browser walkthrough**: empty state, add, detail, list, duplicate
  warning with fields preserved and Save Anyway, contact-required, a
  national-format number stored verbatim and flagged, search, the no-match
  empty state, My Leads, and the occupancy refusal leaving the stage on.
- The final migration was **replayed on a disposable database with its eleven
  predecessors**, and the membership-lock routine, its policy, ownership and
  grants verified against the intended state — 16 checks, all passing. A
  catalogue comparison against the development database found functions,
  policies, constraints, indexes, triggers and owners identical, with only the
  per-database `service_role` default privileges differing, as in 3A.

#### Applied to hosted development on 2026-10-17

`20261021090000_leads.sql` is applied and recorded on `limenzy-crm-dev`,
through the Supabase migration runner, by the tooling in
`~/Limenzy-dev-tools/hosted-3b`. The file is unchanged since review; its
SHA-256 is still
`0da6998265d3a8c28033142565a65caab7eb4dd2dd4d17e8700a3ab55b171d00`, and both
the working tree and the committed blob at `b915aa9` were checked against it
before anything ran.

**Preflight: 34 passed, 0 failed. Apply: 58 passed, 0 failed.** Both totals
come from the run's own summary files rather than from a terminal, which is
why they can be quoted here at all — 3A's were lost to scrollback and had to
be asked for. The migration runner reported success, the history table shows
**12 recorded, latest `20261021090000`**, and no other migration was recorded
by that run.

**All six existing-table fingerprints came back unchanged**, digest for
digest: `workspaces` 1 row, `user_profiles` 5, `workspace_memberships` 5,
`workspace_invitations` 9, `workspace_lead_stages` 6, `workspace_lead_sources` 5. Unlike 3A this migration adds no row to anything that already exists — it
creates two empty tables — so identical was the only acceptable answer, and
the apply confirmed both new tables hold nothing.

**The runtime gateway probes passed**, through the restricted `limenzy_app`
connection on the transaction pooler: `listLeads()` read the workspace through
`withTenant()`, the My Leads filter narrowed rather than widened, search ran
server-side, `recordOwnerNames()` resolved five co-member names for §31's
column, `leadDetail()` answered null for an id that is not a Lead there — the
same answer §162.1 gives for one out of scope — and the §160 count answered
rather than refusing for an Owner/Admin.

**Manual walkthrough — user-reported.** The maintainer reports that the
walkthrough passed against hosted development. Nothing further about it is
recorded here, because nothing further was witnessed.

#### Limitations — all still open

- **National-format numbers take no part in phone duplicate detection.**
  §130.1 forbids inventing a country code and there is no dial-code table, so
  only an already-international number normalises. Anything else is stored
  exactly as typed, flagged for review, and matched on email alone. The Lead
  Detail screen says so.
- **No explicit record sharing.** §162.1 defines it; there is no table, so
  `isExplicitlyShared` is false everywhere and a Manager scoped to "Own,
  Assigned and Explicitly Shared" sees only what they own.
- **No reassignment of a Record Owner**, so deactivating someone who owns
  Leads is refused with no remedy offered. That is the order this plan has
  always described — refuse first, build the workflow next — and it is a real
  restriction from today.
- **An unconfigured Manager record scope shows a Manager no Leads**, which is
  what §162.1 requires of an unmade choice, and worth knowing before testing
  as a Manager.
- **Deferred as scoped:** Product / Service Interested In (a §166 reference,
  not a text field), custom fields, the pipeline view, §31's other filters and
  row actions, editing a Lead, assignment and Sales Teams, archive,
  conversion, and the rest of the §27 timeline — the detail screen shows the
  derived "record created" entry only.
- **Applied to hosted development**, see below. The limitations above are
  unchanged by that: none of them is a deployment question.

### 3C — Lead editing, stage changes and activity history (§37, §39, §45, §48) — applied to hosted development

3B could create a Lead and read it back. This is the slice where a Lead
CHANGES, which brings three problems the create path did not have: two people
editing the same record, an outcome that is more than a stage, and a history
that has to be true.

**What it does.** Editing the §37 fields — name, phone, email, notes and
source — gated by §162's `edit_permitted_records`, with which Lead decided by
the existing §162.1 policies rather than restated. Ordinary stage changes.
Mark as won (§45) and Mark as lost (§48) with one of §33's five fixed reasons
and a required explanation for "Something else". Reopen, which clears the
reason from the record and leaves it permanently in the history. Notes, capped
at 2000 characters in the validation layer and in a CHECK constraint. §28 is
followed: no confirmation for a standard edit or a note.

**Won and Lost are the workspace's own stage rows, found by immutable `kind`.**
§34 lets a workspace rename them, so a lookup by label would break the day
someone did. The ordinary stage picker refuses outcome stages, so neither can
be reached without its reason and its history entry. §34's occupancy rule
therefore already counts only ordinary-stage Leads — a won Lead has left the
column it was in — and the predicate now says so out loud.

**Stale edits are caught by an integer `revision` the database owns.**
`updated_at` was rejected: the driver hands a `timestamptz` back as a
JavaScript `Date` in one runtime and a string in another, and a `Date` loses
microseconds, so two saves inside one millisecond stop being distinguishable.
The trigger increments `revision`; `limenzy_app` holds no grant on the column
and so cannot hold it still. Every control carries it, the UPDATE carries it
in its WHERE clause, and whoever saves second is told rather than silently
overwriting work they never saw.

#### History is enforced by the database, not by the gateway

An earlier draft had the application write every §39 entry beside the change
it describes. **Measured against the runtime role, that left two open paths:**
`limenzy_app` — not privileged tooling — could insert a Lead with no creation
entry, and update any column it holds a grant on with no entry at all. Nothing
was privileged about either; they needed only a code path that forgot. A
history that has to be true cannot rest on remembering.

Three triggers close it, in the smallest form that still leaves authorship
with the actor:

- `record_creation` — AFTER INSERT on `leads`, writes the creation entry
  itself, attributed to `created_by_user_profile_id`. Invoker rights, so it
  can never write history the inserting role could not have written. No Lead
  can exist without one, whatever inserted it.
- `stamp_revision` — BEFORE INSERT on `lead_activities`, stamps each entry
  with the Lead revision it describes, read from the Lead row. No role holds a
  grant on `lead_revision`, so it cannot be set, held still or back-dated.
- `require_history` — a DEFERRABLE INITIALLY DEFERRED constraint trigger. At
  COMMIT, a material change must have an entry stamped with the revision it
  produced, or the whole transaction goes. That is the atomicity guarantee
  stated as a constraint rather than as a convention. It fires only when a
  material column actually changed, and `note_added` is excluded: a note is
  something somebody wrote, not a description of a change, and must not stand
  in for the entry a change owes.

The history itself is append-only by GRANT — no UPDATE, no DELETE, and
`occurred_at` is not insertable — visible exactly where its Lead is, through
an EXISTS that re-applies the Lead's own policy instead of restating §162.1 in
a second place. That costs one more hop in the policy graph (four rather than
three), which is recorded as a decision in `rls.test.ts` rather than left to
be discovered.

**Duplicate detection on an edit.** Re-run only when a normalised contact
value CHANGES, through a three-argument matcher that excludes the Lead being
edited. The §130.1 acknowledgement now binds the Lead id as well as actor,
workspace and normalised submission, so a warning answered on one Lead cannot
be replayed against another.

**Lock order is unchanged:** stage row, then the acting member's row.
Deactivation takes the membership only and stage deactivation the stage only,
so no cycle exists. Authority is rechecked after every lock that may have
waited, and 40001/40P01 map to a safe failure with rollback and no automatic
retry.

#### Verification

- **Database suites: 244 passed**, seven files, against the local stack —
  including eleven new tests that drive the tables directly, bypassing the
  gateway, to prove the completeness guarantee lives in the database.
- **Unit and component suites: 219 passed**, eight files.
- **Migration replay: 13/13 applied** from their files on a disposable local
  database, twelve state checks passed, database dropped afterwards. The
  replay is what caught the missing `alter table ... owner to limenzy_owner`
  on `lead_activities`, which left the table owned by the migration role.
- **Final migration SHA-256:**
  `e696df21930a5d8a61de95844102d84f0c1bb36de56ee463bffc08ba644d2208`.

#### Local browser walkthrough — 26 of 26 steps, witnessed

Real Chrome driven over the DevTools Protocol, against an isolated production
build on its own port with local Auth and database supplied through the
process environment. Not user-reported: each step asserts against the rendered
page and the database together, and the run was repeated three times from a
clean seed with the same result.

Sign-in · list · timeline · edit saving with no confirmation and surviving a
reload · a stale save refused with nothing overwritten · **a stage change
whose picker and record agree WITHOUT a reload** · Won pointing at the
workspace's `won` row · Lost refused with no reason, refused again for
"Something else" with no explanation, then recorded · Reopen showing the
stage it reopened into, again without a reload, and clearing the reason from
the record while the history keeps it · note · the whole nine-entry timeline
after a reload · the duplicate warning retaining both typed fields and then
writing the override row · 320px with no horizontal overflow, every control
present, and the edit sheet open and usable.

Four accommodations were needed, all properties of the harness rather than of
the product, and all recorded with it: dev-mode hydration never completes in
this headless Chrome, so the walkthrough runs against a production build;
Radix opens its triggers on pointerdown, so clicks are real input events;
React reverts a controlled input it never saw as a genuine edit, so text is
typed through `Input.insertText`; and this renderer does not advance CSS
animations, which would leave a sheet at its off-screen start. The harness and
its screenshots are kept outside the repository, at
`~/Limenzy-dev-tools/hosted-3c/local-verification`.

#### Dependencies and limitations — all still open

- **No conversion (§45, §46).** There is no `customers` table. No Convert
  control is drawn, no choice is offered, and the screen says nothing about
  conversion — a control that cannot run is worse than its absence, and a
  sentence about when it will arrive is worse than both.
- **No follow-up cancellation (§48).** There are no follow-ups to cancel.
- Both are declared in `src/server/auth/lead-lifecycle-dependencies.ts` and
  written up in `docs/dependencies.md`, and
  `src/test/lead-lifecycle-dependencies.test.ts` fails the build the day
  either table appears. A `TODO` would have kept passing.
- **The timeline shows only the kinds this application can emit** — creation,
  edits, stage moves, outcomes and notes. Calls, WhatsApp, email and follow-up
  activity arrive with the features that produce them, and the screen does not
  list what it cannot do.
- **`outcome_missing` is unreachable** while §34's shape check holds a Won and
  a Lost row in every workspace, so that branch exists for a database
  corrupted by hand and is not exercised by any test.
- **Still out of scope, unchanged from 3B:** owner reassignment, archive,
  sharing, assignment and Sales Teams, and national-format phone duplicate
  detection.
- **Applied to hosted development**, see below. None of the limitations above
  is changed by that: none of them is a deployment question.

#### Applied to hosted development — 2026-10-19

Through the tooling in `~/Limenzy-dev-tools/hosted-3c`, adapted from the
validated 3B tooling and locally validated first on a disposable database
built to the same state (preflight 39, apply 67, both clean, plus four
negative controls). Totals below are read from the saved summaries, not from
scrollback.

- **Preflight: 44 passed, 0 failed.** TLSv1.3 to
  `aws-0-ap-northeast-2.pooler.supabase.com`, chain verified against the
  pinned CA, certificate naming the host, and both negative controls — a
  mismatched server name and an unrelated CA — refused. Login
  `postgres.<ref>` for the intended project, backend role `postgres`,
  PostgreSQL 17.11. **Twelve predecessors recorded and exactly this migration
  pending.**
- **Apply: 67 passed, 0 failed.** Thirteen migrations recorded afterwards and
  nothing else brought along.
- **The intended data changes, accounted for separately.** All seven
  fingerprinted tables came back byte-identical. `leads` was digested over
  its fifteen PRE-EXISTING columns and came back identical too — then checked
  separately for having gained exactly `revision`, `lost_reason` and
  `lost_reason_note` and lost nothing. An intended addition could not stand
  as the explanation for an unintended change, which is the reason the two
  were ever separated.
- **The backfill, checked per Lead.** Four Leads existed; four creation
  entries were written, one each, every one carrying its own Lead's creator,
  creation time and revision — dated **2026-10-17**, when those Leads were
  made, not the moment of the apply. The digest matched what the preflight
  recorded beforehand. No Lead was left without an entry, no entry was
  orphaned, every Lead is still at revision 1, and none was given a Lost
  reason.
- **The completeness guarantee, verified on the target.** All three history
  triggers present and enabled, `require_history` confirmed DEFERRABLE
  INITIALLY DEFERRED, the history append-only by grant, and neither revision
  column writable by the runtime role.
- **Runtime read probes passed**, through `limenzy_app` on the transaction
  pooler — the role and endpoint the application itself uses. `listLeads()`
  saw four Leads, `leadDetail()` and `leadActivity()` answered nothing for an
  id that is not a Lead there, `leadForEdit()` returned the revision every
  control carries, and the backfilled timeline read back with its creation
  entry naming the Lead's own creator at the Lead's own time. Nothing was
  written.

#### Follow-up: three UI defects found in use, and closed

Reported after the hosted walkthrough. The slice's behaviour was correct;
what it looked like, and what clock it was on, were not.

- **The stage picker went stale after a save.** The record updated and the
  picker showed the previous stage until the page was reloaded. The cause was
  not the server: React resets a form once its action has run, and while the
  picker sat inside that form the reset put its posted value back to the
  stage the server had rendered, which the control then reported as though a
  person had chosen it. **Measured in a browser, not reasoned about** — two
  earlier attempts at this looked right and did not hold. The picker now sits
  OUTSIDE its form and posts through a hidden field, so the reset cannot
  reach it; and it holds a CHOICE rather than a value, dropped when the
  submission settles or when the server confirms a different stage. A refused
  save therefore snaps back to the stage the Lead really has instead of
  leaving the attempt on screen, and an unrelated action such as adding a
  note leaves a selection in progress alone. Move and Reopen both.
- **A shared, themed Select, and controls with a hierarchy.** There was no
  Select in `components/ui`; a native one cannot be themed, because its popup
  belongs to the operating system — it ignored the colour tokens, the focus
  ring and dark mode, and opened a system wheel on a phone. The new one is
  built on the same `radix-ui` package and tokens as `dropdown-menu.tsx`, so
  the popup, focus, keyboard and touch behaviour match what was already
  here. The "Update this lead" area is now one card: the stage picker with
  its primary action, a rule, then the secondary row. The note composer is
  two rows with its button alongside, and the timeline is a rule with dots
  rather than nine bordered boxes.
- **Timestamps are in the workspace's §158 clock.** They were printed in UTC,
  so a team in Kolkata read 04:34 for something they did at 10:04.
  `src/lib/workspace-time.ts` formats on the server in the workspace's stored
  IANA zone, following the pattern `invitation-display.ts` already set, and
  the Activity section names the zone once rather than on every line. No
  offset is written down anywhere: the label is asked of `Intl` for the
  instant, so the same workspace reads BST in July and GMT in January. A
  stored zone this runtime cannot use falls back to UTC **and says UTC**, so
  a reader is never shown an hour under the wrong clock.

**Focused results:** 194 tests across seven affected suites, including six new
for the picker and ten for the time zone. The picker tests were checked
against the broken code and against a half-fix, and fail on both. Two defects
in the work itself were found and fixed on the way: a component declared
during render, and a test harness in which all six action doubles were the
same `vi.fn`, so calls and stubs leaked between tests and the suite was
intermittently green for the wrong reason. The browser walkthrough was
re-run against the shipped build — **26 of 26**, with three new steps
asserting that the picker and the record agree without a reload.

**No migration change.** These are application-only fixes; the applied
migration is untouched and its SHA-256 is unchanged at
`e696df21930a5d8a61de95844102d84f0c1bb36de56ee463bffc08ba644d2208`.

### 3D — Manual Record Owner reassignment (§26, §49, §160, §162, §162.1, §163.10, §163.13) — applied to hosted development

A Lead can now be handed from one member to another, by hand. Automatic
assignment and round robin are **not** in this slice.

**Who may do it.** §162's Change Record Owner, enforced **independently of
edit permission**. Owner/Admin always; a Manager only where the workspace has
configured it; Staff/Sales never — refused even through a direct runtime call
that never passes the action layer. `limenzy_app` holds no grant on
`record_owner_user_profile_id` at all, so a dedicated SECURITY DEFINER routine,
`app.reassign_lead_owner`, is the only path there is.

**Who may receive it.** Active members of the workspace, nothing else. The
picker is fed by `app.assignable_member_names()`, which returns nothing to a
caller who does not hold the permission — so the list cannot be used to
enumerate members. Won and Lost Leads may be handed on.

**Access after the transfer is a result, not a failure.** §162.1 is checked
**before** the transfer, so a narrow-scope Manager who may act does act. If the
transfer then costs them sight of the record — which it does, for a Manager
scoped to their own — the server redirects to the Leads list with a plain
success message rather than rendering a page they can no longer read.

**Ownership history is atomic.** The §163.13 `owner_changed` entry carries
`from_owner_user_profile_id` and `to_owner_user_profile_id`, both constrained
to real memberships and both required on a transfer and forbidden elsewhere.
It is written inside the same transaction from the same variables as the
update, so the entry cannot name owners other than the ones that moved.
Choosing the current owner changes nothing and writes no event. 3C's
`require_history` now covers the owner column and became SECURITY DEFINER,
owned by `limenzy_lead_support` — as an invoker-rights check it read history
through the committing actor's policy, and a Manager who has just handed a Lead
on can no longer see it, so a correct transfer failed at COMMIT.

#### Concurrency: three coordinations, each measured in both orders

- **Recipient deactivation (§160).** A concurrent deactivation must not leave
  an inactive person newly owning a Lead. The routine takes the active
  Owner/Admin set ascending — the same set, in the same order, that
  `app.set_member_status` and `app.accept_workspace_invitation` already take —
  then the three rows it needs, ascending. Transfer first: the deactivation
  waits and then refuses. Deactivation first: the transfer refuses. Sorting
  ids alone was **not** relied on; the whole lock graph was inspected.
- **Permission revocation (§162).** A Manager's authority lives on the
  workspace row, so a transfer has to be _serialised_ against a change to it,
  not merely checked close to it. The routine takes `FOR SHARE` on its
  workspace row as its first statement, holds it to commit, and **re-reads the
  permission after acquiring it**. PostgreSQL refuses a row lock to a role
  without UPDATE, so the lock is bought with a **lock-only privilege**: an
  UPDATE grant on `time_zone` alone, under a policy whose `WITH CHECK` is
  `false`. Permissive policies are OR'd, so that restriction was audited
  rather than assumed — the only other UPDATE policy on `workspaces` is scoped
  to a different role, and measured as the role itself the lock is takeable
  while all four write shapes are refused with 42501. The permission predicate
  is also carried inside the UPDATE, as defence in depth.
- **The stage/history deadlock, found in review and closed.** `moveStage` and
  the pipeline path could take two stage rows in opposite orders and deadlock.
  Every transition that writes from/to-stage history now locks the old and the
  target stage through one helper, deduplicated and ascending, before the
  mutation. The conflict is reproduced deterministically in
  `lead-stage-locking.db.test.ts`.

Deadlock and serialization aborts roll back, surface as `unavailable`, and are
**never retried automatically**.

#### Verification

- **467 database tests, 17 files, none skipped**, against the matched local
  pair. Two earlier figures reported for this slice — 412 and 452 — were both
  wrong.
- **`scripts/test-db.mjs` carries an explicit suite list, and three suites were
  missing from it**: both 3D files and 3C's `lead-lifecycle.db.test.ts`. So
  `npm run test:db` was silently not running 75 tests. All three are now
  registered, which is what reconciles the count exactly: 462 gated tests
  skipped in a plain `vitest run`, plus the 5 in `schema.test.ts` that need no
  database, is 467.
- Unit suite 1911 passed; lint and typecheck clean. The two contended
  revocation tests were checked against a lock-free copy of the routine
  installed in the database and **fail on their own assertions without the
  lock**; the stage-locking regression was checked the same way.
- **Applied to hosted development**, see below. Migration SHA-256:
  `865124efad056bba4d313845ddfdc98b9fe97c18fc75874e5e7f27a73163c424` and
  `cc1c59f5df1dfa8187b432dd8f4b275348450071f9cdd526830e4e981329fd5d`, both
  unchanged by the application. Two files, and the split is load-bearing: a
  new enum value cannot be used in the transaction that added it.

#### Applied to hosted development — 2026-10-19

Through the tooling in `~/Limenzy-dev-tools/hosted-3d`, adapted from the
validated 3C tooling and locally validated first on a disposable database
built to the same state — the thirteen predecessors applied **and recorded**,
and representative existing data seeded through the real routines (two
workspaces, four roles plus a deactivated member, three Leads, and §39 history
written by 3C's own triggers). Totals below are read from the saved
summaries, not from scrollback.

- **Preflight: 59 passed, 0 failed.** The local validation of the same
  tooling reported 54, and the five are accounted for rather than waved at: a
  non-loopback target adds the TLS offer, the chain against the pinned CA,
  the certificate naming the host, both TLS negative controls and the
  host-belongs-to-this-project check, and drops the one loopback note that
  stands in for them. 54 − 1 + 6 = 59.
- **Apply: 64 passed, 0 failed.** Both migrations recorded, in the designed
  order, with fifteen recorded in total — so the run brought nothing else
  with it.
- **Existing records unchanged.** Unlike 3C, this slice backfills nothing, so
  it could make the strongest claim available and did: all **eight** tables
  byte-identical, `lead_activities` byte-identical over its pre-existing
  columns, exactly the two intended columns added and none removed, the
  history counts unmoved by kind, and **no `owner_changed` entry** anywhere —
  the tooling transfers no hosted Lead, and a migration that invented a
  transfer would be inventing a fact about who owns a customer relationship.
- **Runtime probes passed**, through `limenzy_app` on the transaction pooler
  — the role and endpoint the application itself uses. §163.10's recipient
  lookup answered an authorized caller, every member it offered was confirmed
  against the catalogue as an active member of that workspace, and it
  returned identifiers and names only. The same lookup came back **empty**
  for a caller §162 denies, and `reassignLead()` refused that caller outright.
  Nothing was written: the one `reassignLead()` call was made by an
  unauthorized caller against an id that is not a Lead.
- **`limenzy_app` still cannot update the Record Owner column** on the
  target, asserted after the apply as well as before it. The lock-only
  workspace privilege verified as one column — UPDATE on `time_zone` — under
  a policy whose `WITH CHECK` is `false`, with the permissive-OR audit
  measured as the role itself rather than read off the catalogue.
- **Manual reassignment walkthrough passed — user-reported.** Exercised
  against hosted development after the apply. This one is recorded as
  reported rather than as measured here: it was not run by, or observed in,
  this session, and the saved summaries do not cover it.

#### Hosted limitations, unchanged by the apply

- **Team-dependent rules remain deferred.** Applying the migrations does not
  implement §163.5 or the team-scoped parts of §163.10 and §163.13, and
  recipients on hosted development are workspace-wide for the same reason
  they are everywhere else: Sales Teams do not exist yet.
- **The partial-application path was exercised locally, not hosted.** The
  tooling reports a half-applied slice and offers a guarded `--resume-partial`
  continuation; that was forced and verified on the disposable database. The
  hosted run applied both files in one pass and never entered that state.

#### Deferred and separate follow-ups

- **Team-dependent rules are deferred, not implemented.** §163.5, §163.10's
  team-scoped eligibility and the §163.13 team rules wait on Milestone 4.
  Nothing here claims to enforce them, and recipients are workspace-wide
  because Sales Teams do not exist yet.
- **Separate follow-up — concurrent permission edits can overwrite each other.**
  `setPermissionGranted` and `setManagerRecordScope` are read-modify-write on
  the workspace row with no lock of their own, so two administrators editing
  the §162 matrix at the same time can have one edit silently lost. This is
  **pre-existing**, is not caused by this slice, and was deliberately **not**
  fixed here — the reassignment lock coordinates a transfer against a
  committed permission change, which is a different problem. It needs its own
  slice. **Closed for `setPermissionGranted` in the correctness slice below;
  `setManagerRecordScope` never needed it, being a single statement.**
- **Other paths that read workspace configuration mid-transaction are
  unreviewed**, not closed. This coordination is scoped to reassignment.
- **Still out of scope, unchanged from 3C:** archive, sharing, conversion,
  automatic assignment, Sales Teams, and national-format duplicate detection.

### Correctness slice — Lead paging, history continuation and serialized permission edits

Three faults found by the status audit, fixed together because each one is a
record that the product holds but cannot show. **No migration is required**:
`limenzy_app` already holds column-level `UPDATE` on `public.workspaces`, and a
column-level grant is sufficient to take a row lock — the same fact §163's
`lock_lead_stage` already relies on.

- **Lead list pagination with an accurate total (§30, §31).** `listLeads` was
  `limit 200` with no offset, no total and no page control, so a workspace with
  more than 200 Leads could not reach the oldest of them by any route and the
  screen reported 200 as if it were the count. It now returns
  `{ items, total, page, pageSize, pageCount }` at 50 a page. The total comes
  from `count(*) over ()` on the same statement as the rows, so the page and
  the number printed beside it come from one snapshot. Tenant and record
  access, scope and search are all applied **before** the page is cut, so a
  page is a window onto what §162.1 already allows and never a way to widen it.
  Ordering carries a unique tie-breaker, `created_at desc, id desc`; without
  the second key two Leads created in the same instant can swap places between
  requests, and on an offset page that means one is served twice and another
  never at all. The page lives in the URL beside the scope and the search term,
  and changing either resets it.
- **Out-of-range pages land somewhere that exists.** A page past the end used
  to come back empty, which reads as "no matches" when the list says 55 match.
  It now fetches the real total and serves the **last** page, reporting the
  clamped number so the pager and the "showing x to y" line describe what is on
  the screen. Found in the browser, not by a test; the test was added
  afterwards.
- **Older activity entries are reachable (§27, §39).** `leadActivity` had the
  same flat `limit 200`, which truncated the permanent history §27 promises at
  the screen's edge. A new `leadActivityPage` pages it with a **keyset**, not
  an offset: the cursor is the row `(occurred_at, id)`, compared as a row.
  `occurred_at` alone is not unique — a stage change and the note explaining it
  are written together and share a timestamp to the microsecond — and the
  cursor key travels as text at full precision, because a `Date` round trip
  rounds to milliseconds and silently skips everything written inside that
  window. An entry added while a reader is paging is newer than the cursor, so
  it disturbs nothing. `leadActivity` remains as a thin wrapper over the newest
  page. A read-only Server Action serves the older pages behind a "Show older
  activity" control, gated on the Leads module; §162.1 is left to the policies,
  and a cursor is a position rather than a capability.
- **Concurrent §162 permission edits no longer erase each other.** The read in
  `setPermissionGranted` takes the workspace row `for update`, inside the
  transaction it already opened. Two administrators toggling two different
  cells used to read the same array and the second write erased the first,
  which on a revocation can **resurrect a permission that was just taken away**.
  NULL and empty-array semantics are unchanged: NULL still means "no choice has
  been made", and revoking the last grant still stores an explicit empty array.
  Compatible with 3D: `app.reassign_lead_owner` takes the same row `for share`
  before reading permissions, `for update` conflicts with that share by design,
  and no cycle is possible because this routine takes the workspace row and
  then waits on nothing else.

**Verification (already completed; not to be repeated).**

- Two new database suites, both registered in `scripts/test-db.mjs` so they
  cannot be silently omitted: `lead-pagination.db.test.ts` (16) covering page
  boundaries, cross-workspace and cross-record visibility, totals per scope and
  history continuation; `permission-concurrency.db.test.ts` (8) covering grant,
  revoke and mixed pairs under a deterministic race.
- A focused unit suite for the new Server Action's gates (7), including that
  the cursor is passed through unrounded.
- Affected existing suites re-run and passing: 167 database tests across seven
  files, 144 unit tests across seven files. Lint, typecheck and formatting
  clean.
- **Negative controls.** Removing the lock fails 4 concurrency tests; removing
  the history tie-breaker fails 2. Removing the list tie-breaker first failed
  nothing — the test was too weak — so an explicit total-order assertion over
  the concatenated pages was added, and removing it now fails 3.
- **Browser walkthrough on matched local configuration**, against the loopback
  stack with a real account, workspace, 55 Leads and 55 activity entries all
  created through the product's own forms. List: 50 + 5 rows, zero overlap,
  union 55, correct order; `?page=2` works from a pasted URL; `?page=99` lands
  on page 2. History: one press loads exactly the remaining 5, 55 distinct
  entries and no duplicates. Measured at 1440 and 390 with `mobile: false`;
  `documentElement.scrollWidth` equals `innerWidth` at both, so no horizontal
  overflow. Fixtures removed afterwards.

#### Deferred and separate follow-ups

- **Unresolved: the clamp tests fail intermittently under full-suite load.**
  `serves the last page when the requested one is past the end` and `lands on
the last page of a longer list, not an empty one` failed together in one of
  three consecutive full database runs, and passed in the other two and in
  every targeted run. Both exercise the two-statement path `listLeads` takes
  only for an out-of-range page — a count, then a second read — so a window
  between them is the obvious suspect, but that is a hypothesis and not a
  diagnosis. Recorded during the Milestone 4 review and deliberately NOT
  investigated there. It needs its own slice.
- **An index for deep pages is a performance follow-up, not a correctness one.**
  `leads (workspace_id, created_at desc, id desc)` would match the list's sort
  key. Paging is correct without it; a deep `OFFSET` is simply slower than it
  needs to be. Not measured and not added here.
- **Settings overflows horizontally at phone width, and has since 2B.**
  Measured at 390: `document.documentElement.scrollWidth` is 485 while
  `body.scrollWidth` is 390. The source is the Users table, which carries
  `min-w-[46rem]` inside an `overflow-x-auto` wrapper; Milestone 4's own
  Sales Teams section measures 374 and contributes nothing. Milestone 4 does
  widen that table by about 16px, because the §159 Sales Team column now
  holds a team name instead of a fixed phrase — a table already far wider
  than the viewport. Not fixed here: the markup is 2B's and the fix is a
  layout decision about that table, not about teams.
- **Suspected: the dev server's HMR WebSocket is proxied.** `src/proxy.ts`'s
  matcher excludes `_next/static` and `_next/image` but not `_next/hmr`, so the
  upgrade request appears to be answered with an ordinary HTTP response and the
  handshake fails. Observed while preparing the walkthrough, where a dev server
  started from a copy of the tree never hydrated; a production build in the
  same copy was fully interactive, which is what the walkthrough used.
  **Not investigated and not fixed** — it is a development-environment concern,
  touches no product behaviour, and needs its own slice to confirm the cause.
- **Still out of scope, unchanged:** archive, sharing, conversion, automatic
  assignment, Sales Teams, the Kanban board and the Lead UI refresh, which
  stay on their own branch.

## Milestone 4 — Sales Teams and Team membership foundation — applied locally

Spec §163.1–§163.4, §163.12, §163.14, §163.15.

Sales Teams, membership (a salesperson belongs to **only one active Sales Team
at a time**), the Team Lead **responsibility** — which is not a role and does not
appear in the Roles list — team transfer, team settings, and historical
integrity.

Structure and administration only. No assignment behaviour.

### What was built

Settings → Sales Teams, **Owner/Admin only**: create, rename, deactivate,
guarded reactivation, add or transfer a member, remove a member, and designate
or replace the Team Lead. One migration,
`20261026090000_sales_teams.sql`, adding four tables, three enums, a definer
role and nine routines.

**A team is created with its first Team Lead, atomically.** §163.1 wants
exactly one active Team Lead and §163.3 wants that lead to be a member of the
team, so the team row, the membership period and the leadership period are
written in one transaction with the shape constraint deferred to COMMIT. No
inactive-first draft state is required, and there is no moment at which another
transaction could observe an active team with no lead.

**A transfer is named, confirmed and revalidated.** §163.2 allows one active
membership per person, so adding someone who already belongs to a team moves
them. The screen shows where each person is now; the server refuses until it
receives both the confirmation and the exact membership period that was shown,
and compares that id with what it finds **under lock**. A confirmation given
about one team can therefore never take effect against another. If the person
leads another active team, §163.4 refuses outright — the creation and
membership forms carry no controls over the source team, because fixing one
team's leadership from inside another team's form is how an administrator
changes something they did not mean to.

### The shapes that are not what they first look like

- **A membership row is a PERIOD.** §163.2 forbids reopening an ended
  membership, so the key is a fresh `id` each time and a person may hold many
  ended rows for the same team. Keying on (team, user) would have made the
  second spell unrepresentable.
- **Team Lead is a table of periods, not a flag.** Leadership can change hands
  twice inside one unbroken membership, and §163.15 requires the former
  responsibility to remain visible. A boolean can say who leads now; it cannot
  say that anyone ever did. A test hands leadership over and back and asserts
  three periods against one membership row.
- **The invariants are split between constraints and a deferred check.**
  Partial unique indexes carry "at most one active membership per person" and
  "at most one open lead period per team". The other half — every ACTIVE team
  has at least one, and an active membership belongs to an active workspace
  member — is a DEFERRED CONSTRAINT TRIGGER, because creation writes three rows
  and no ordering of them is valid at every intermediate step.

### Where §160 is enforced, and why it differs

The Lead precondition stays in the **gateway**: `deactivateMember` calls
`app.set_member_status` and `app.count_leads_owned_by` in one transaction and
rolls back when the count is non-zero **or NULL** — NULL meaning the count
refused, which is deliberately not read as zero. That is unchanged.

The Team Lead rule is a **structural** invariant (§163.3) and must hold however
the status is changed, so it lives in the routine: deactivating the active Team
Lead of an active team is refused until a replacement is designated or the team
is deactivated. Otherwise the person's active team membership is ended and kept
as history. A third line, the deferred constraint on `workspace_memberships`,
refuses at COMMIT if **any** path leaves an active team membership attached to a
deactivated workspace member — which is the difference between the gateway
enforcing a rule and the database doing it.

### The lock order, measured rather than argued

The order in force is unchanged and extended at the end:

    workspaces row → stage row → active owner_admin memberships, asc
                   → any other membership row, asc → sales_teams, asc
                   → sales_team_memberships, asc → sales_team_lead_periods

Every routine takes the active owner_admin set first, unconditionally, through
one shared prelude. That is required because each locks **two or more**
membership rows once helper calls are counted — `app.lock_actor_membership()`
takes the actor's row and the target's is taken separately — and 3D's audit
records the deadlock shape for exactly that case. A routine that locked only
one row would not need it; none here qualifies.

No routine takes the **workspace** row. 3D takes it `for share` to hold a
_configurable_ §162 cell still while reading it; every Sales Team cell is a
fixed Owner/Admin "Yes", so there is nothing to stabilise. **If §163.18
decision 5 is ever approved and Manager administration becomes configurable,
these routines must take that lock first**, and the migration says so where it
would be needed.

### Verification

- `sales-teams.db.test.ts` (28) — creation, authority re-derived by the
  database for Manager, Staff/Sales and an inactive membership alike, workspace
  isolation, the cardinality and leadership rules, deactivation and guarded
  reactivation, §160, and the §162.1 non-grant: a teammate's Lead stays
  invisible after joining the same team and after taking the lead of it.
- `sales-teams-concurrency.db.test.ts` (9) — two placements of one person at
  once, two confirmed transfers naming the same source, two creations of one
  name, two designations on one team, deactivation racing designation, atomic
  rollback, and the lock order run against user deactivation in both directions
  for eight rounds plus a deterministic hold-and-release.
- Full database suite green: **540 tests across 21 files**. Unit suites green:
  **1,731 across 67 files**. Lint, typecheck and formatting clean.
- Two defects were found by the project's own guards and fixed, not worked
  around: a PL/pgSQL `CASE` that resolved a field the record type lacks, and
  `now()` used for event timestamps — the transaction clock, which let a
  transaction that began earlier close a leadership period _before_ the period
  it was closing had started. The check constraint caught the second; both
  event timestamps now use `clock_timestamp()` and every close takes
  `greatest(clock_timestamp(), <start>)`.

### Deferred, and deliberately not started here

- **No eligibility.** §163.5's Eligible/Paused is Milestone 5, and the column
  is deferred with it rather than added as a placeholder nothing writes. The
  consequence is visible: Settings → Sales Teams shows **Active members** and
  not Eligible or Paused counts. The screen says nothing about why — that is
  recorded here, not in the product.
- **No My Team (§163.6), no assignment rules (§163.7), no rotation (§163.8),
  no Assignment Required (§163.9), no assignment audit history (§163.13).**
- **§163.1's "deactivate every rule targeting the team" and §163.12's "select
  which rules to reactivate" are explicit no-ops**, written into the routines
  with a comment rather than silently omitted, because no rule table exists.
- **Manager administration stays denied.** Every Sales Team row in §162 is
  Owner/Admin-fixed and a Manager's is Decision required (§163.18 #5). Nothing
  in this slice asserts that denial — the matrix does — so the day decision 5
  is approved and configured, the actions do not have to change to honour it.
- **`src/server/auth/lead-lifecycle-dependencies.ts` was re-blocked honestly.**
  Teams existing retired "no table" as the excuse for three rules at once. Two
  of them were never waiting on a table — §163.18 decisions 4 and 5 — and now
  say so; the third waits on §163.7's rule table. The guard that makes the
  deferral expire keeps its teeth.

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
