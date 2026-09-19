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
  names, numbers and addresses only. No real customer, lead or A&S Fincare data
  in a fixture.
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

### 1B — Supabase authentication and workspace onboarding — _next_

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

### 1C — Drizzle foundation, tenant context and focused RLS proof

- Drizzle config scoped to the `public` schema; migration role and runtime role
  kept genuinely separate.
- Foundation schema: `user_profiles`, `workspaces`, `workspace_memberships`,
  `workspace_invitations`, `workspace_modules`, `workspace_role_permissions`.
- `WorkspaceContext` (branded type) and `requireWorkspaceContext()`, which
  re-verifies active membership on every request.
- `withTenant()` transaction helper issuing `set_config(..., true)`.
- **The RLS proof gate** — all ten checks in architecture-decisions.md §6.1 must
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
