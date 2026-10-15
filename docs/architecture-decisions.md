# Architecture Decisions

Decisions that govern how Limenzy CRM is built. Each is approved unless marked
otherwise. Superseding one requires an explicit decision recorded here.

The product specification (`docs/CRM_SaaS_Product_Spec_V1.md`, 180 numbered
sections plus decimal sub-sections) is the authority on functionality. This file
records _engineering_ decisions and the approved _interpretations_ of ambiguous
specification points.

**Specification baseline.** The current implementation baseline is checkpoint
`4c633b3` — _docs: finalize production-ready CRM specification_.

- `docs/CRM_SaaS_Product_Spec_V1.md` is **authoritative**.
- `docs/CRM_SaaS_Product_Spec_V1.docx` is its **synchronized client-readable
  counterpart**, not a second source of truth. If the two are ever read
  differently, the Markdown governs.
- Wireframes and screenshots are **presentation artefacts**. They illustrate
  layout and flow; they do not define production behaviour. Where an older
  wireframe conflicts with the specification, the specification governs and the
  wireframe is treated as out of date.
- A decision recorded here may refine _how_ something is built. It must never
  contradict, weaken, replace or silently expand what the specification
  requires.

---

## 1. Fixed platform decisions (CTO)

| Decision                                                | Note                                                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js App Router for frontend and backend             | No separate Express/Nest application                                                                                                         |
| PostgreSQL                                              | Via Supabase managed Postgres                                                                                                                |
| Supabase                                                | Auth and managed Postgres (selected foundation). Object storage is the leading implementation choice but **not** finally approved — see §1.1 |
| Drizzle ORM                                             | Schema, queries, migrations                                                                                                                  |
| Tailwind CSS · shadcn/ui · Radix · Lucide · next-themes | UI stack                                                                                                                                     |
| Zod · React Hook Form                                   | Validation and complex forms                                                                                                                 |
| Vitest · React Testing Library · Playwright             | Testing                                                                                                                                      |
| Vercel                                                  | Provisional deployment target, not a finally approved production platform (§180.1)                                                           |

### 1.1 Provider choices that are not yet final

Spec §180.1 keeps a defined set of deployment decisions open under
`CTO approval required`. Until each is approved:

- **PostgreSQL and Supabase Auth** remain the selected application foundation.
- **Object storage** must satisfy the provider-neutral requirements of §176.1 —
  private encrypted storage, unpredictable object identifiers, no public bucket
  and no permanent public URL, a permission check on every view or download, and
  signed links valid for no more than five minutes. Supabase Storage is the
  leading, provisional implementation and must not be described as approved.
- **WhatsApp, Email, monitoring/alerting and backup** providers stay behind the
  adapter contracts in §81.1, §116.19 and §177. Work proceeds against the
  documented contract using local or test doubles.
- **Vercel** remains a provisional deployment target.

A provider choice must never leak into product behaviour. Domain logic carries
no provider-specific assumption, and replacing a provider must not change what
the specification says the product does. No provider is swapped without a
decision recorded here.

## 2. Approved product and security decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | A user may belong to **multiple workspaces**.                                                                                                                                                                                                                                                                                                                                                                                              |
| D2  | V1 authentication is **email + password with email verification**.                                                                                                                                                                                                                                                                                                                                                                         |
| D3  | **Self-service signup** is allowed and creates a workspace through onboarding (spec §7).                                                                                                                                                                                                                                                                                                                                                   |
| D4  | Additional users join by **invitation** (spec §11, §159). Owners never create or handle user passwords.                                                                                                                                                                                                                                                                                                                                    |
| D5  | "Configurable" permissions (spec §162) are **workspace-level settings for the three fixed roles**. No custom roles, no per-user permissions, no field-level permissions.                                                                                                                                                                                                                                                                   |
| D6  | Manager **"Own Records"** means records personally owned by that Manager. No team hierarchy in V1.                                                                                                                                                                                                                                                                                                                                         |
| D7  | **Staff** see records they own, plus the minimum related record information needed for work explicitly assigned to them.                                                                                                                                                                                                                                                                                                                   |
| D8  | **Staff cannot import or export.** §162 and §162.1 are the permission authorities; §141 now states the same denial explicitly, so there is no longer a documented conflict to resolve. Permissions are **denied unless explicitly granted or configured**, and this denial is not one a workspace may relax.                                                                                                                               |
| D9  | Custom field values use **typed storage**, not one unrestricted JSONB blob. Documented now, implemented later.                                                                                                                                                                                                                                                                                                                             |
| D10 | §177 requires tenant isolation in **both** server-side authorization and, independently, the database layer. GUC-based PostgreSQL RLS is the intended database-layer implementation and remains **unproven until the Milestone 1C gate passes** (see §6.1).                                                                                                                                                                                |
| D11 | Notifications are **in-app only** in V1 (spec §175).                                                                                                                                                                                                                                                                                                                                                                                       |
| D12 | **Partly settled, not wholly deferred.** Import limits (§119.1) and document limits (§176.1) now have specification-approved V1 defaults — see §2.1. Still open: the WhatsApp provider, the Email provider, the private object-storage provider, the background-job mechanism, and the final production/retention values listed in §180.1. Implementation defaults must match the specification until an approved change is recorded here. |

### 2.1 Specification-approved V1 defaults (import and documents)

These are no longer open questions. The specification states them, so the
implementation's **default configuration must match these values**. They belong
in configuration rather than scattered hard-coded constants, but a configured
value may differ from the specification only after an approved change is
recorded here.

**Import — spec §119.1**

| Default                           | Value                          |
| --------------------------------- | ------------------------------ |
| Maximum uploaded file size        | 10 MB                          |
| Maximum data rows                 | 10,000                         |
| Maximum columns                   | 200                            |
| Accepted formats                  | UTF-8 CSV and `.xlsx`          |
| Worksheets imported per job       | Exactly one, chosen explicitly |
| Original upload retention         | 24 hours                       |
| Result and error-report retention | 30 days                        |

§119.1 also requires extension, MIME and file-signature validation with the
browser-supplied MIME type treated as untrusted, rejection of macros, embedded
executables and password-protected files, formulas never executed, private
temporary storage, and a malware scan before parsing.

**Customer Documents — spec §176.1**

| Default              | Value                                                |
| -------------------- | ---------------------------------------------------- |
| Maximum file size    | 10 MB per document                                   |
| Permitted types      | PDF, JPG/JPEG, PNG, DOCX, XLSX                       |
| Storage              | Private, encrypted object storage — no public bucket |
| Validation           | Extension, MIME **and** signature must agree         |
| Malware scanning     | Required, and **fails closed**                       |
| Signed download link | Expires in no more than five minutes                 |
| Permission check     | On every view and download (§162, §162.1)            |

**No per-workspace storage quota is defined.** The specification does not state
one, so the implementation must not invent one. A production quota, and any
permanent retention or deletion period, require CTO and legal approval under
§180.1 and §176.1.

**Still requiring CTO approval (§180.1):** final production import limits after
load testing, the private object-storage provider, backup retention, and the
legal data-retention and deletion policy. Until each is approved, the V1
defaults above apply.

### 2.2 One applied migration history (Milestone 1C-A)

`supabase/migrations/` is the **single authoritative applied migration
history**. The Supabase CLI applies and resets from it; nothing else applies SQL
to a shared environment.

Drizzle's role is narrower: `src/server/db/schema/` holds the typed schema, and
`drizzle-kit generate` may produce **candidate** SQL into the git-ignored
`./drizzle` directory for review. Reviewed SQL is then committed into
`supabase/migrations/`.

Consequently `drizzle-kit migrate` is never run against a database the Supabase
CLI migrates, and `drizzle-kit push` is not a migration mechanism — it mutates a
database without leaving a reviewable, replayable file. Neither has an npm
script. The reasoning and the day-to-day commands are in
[development.md](./development.md).

## 3. Approved interpretations of ambiguous specification points

### 3.1 Follow-ups module gating (spec §43, §171, §172, §25)

The specification lists "Customer Follow-ups" as a toggleable module but also
defines one combined Follow-ups screen covering leads and customers. Approved
interpretation:

- The **Customer Follow-ups** setting governs follow-ups whose subject is a
  **Customer**.
- **Lead follow-ups remain available** whenever the **Leads** module is enabled,
  regardless of the Customer Follow-ups setting.
- The main **Follow-ups screen shows whichever sources are currently enabled**:
  lead follow-ups when Leads is on, customer follow-ups when Customer Follow-ups
  is on.
- The Follow-ups navigation entry is hidden **only when neither source is
  enabled**.
- Per §25, when **Leads is disabled** the mobile bottom-bar slot that Leads would
  have occupied is taken by **Follow-ups**.

Implemented as pure functions in `src/config/navigation.ts`
(`resolveFollowUpsVisibility`, `resolveVisibleNav`, `resolveMobileNav`) and
covered by `src/config/navigation.test.ts`. Later milestones must not implement
conflicting behaviour.

### 3.2 Renewal assignment (spec §65)

`assigned_to_user_id` is stored **explicitly** on renewal work/cycles.

- It **may default** to the related Customer's Record Owner when the work is
  created.
- It is a **snapshot, not a derived value**. Changing the Customer's Record Owner
  later must **not** silently reassign existing renewal work.
- Authorized users may explicitly reassign it (spec §65, §162 `work.reassign`).

This preserves the §26/§177 rule that Record Owner and Assigned To are distinct,
and keeps §150's Staff Activity Report attributable.

### 3.3 Overdue is derived, never stored

Follow-up and renewal "Overdue" is computed from the due date/time relative to
now, not persisted and flipped by a job. Spec §44 requires that the system never
automatically completes or cancels an overdue follow-up; deriving the state makes
that true by construction and keeps the value correct without a running job.

## 4. Next.js 16 conventions

Verified against the official documentation for the installed version
(nextjs.org/docs, doc version 16.3.4) on 2026-09-11.

- **`proxy.ts`, not `middleware.ts`.** The `middleware` file convention is
  deprecated and was renamed to `proxy` in **v16.0.0**. The file exports a
  function named `proxy` (or a default export) plus an optional `config`
  with a `matcher`. Proxy defaults to the **Node.js runtime**, and the
  `runtime` route-segment option is not available in proxy files.
- **Proxy is not an authorization boundary.** The docs state that Server
  Functions are handled as POST requests to the route where they are used, so a
  matcher change or a refactor can silently remove proxy coverage:

  > Always verify authentication and authorization inside each Server Function
  > rather than relying on Proxy alone.

  This matches our rule that every Server Action and Route Handler re-checks
  authentication, permission and tenant scope.

- A `matcher` must exclude static assets, or proxy runs on every request
  including `_next/static` and `public/`.

## 5. Supabase SSR (Milestone 1B) — current official guidance

Verified against supabase.com/docs/guides/auth/server-side/nextjs on 2026-09-11.

- Use **`@supabase/ssr`**. Do **not** use the deprecated auth-helpers packages,
  and do not copy older middleware examples.
- The cookie adapter uses **`getAll()` / `setAll(cookiesToSet, headers)`**.
  `setAll` must apply cache headers (`Cache-Control`, `Expires`, `Pragma`) so a
  CDN never caches a session.
- **Never trust `getSession()` for authorization in server code.** The docs are
  explicit: it "isn't guaranteed to revalidate the Auth token."
- Current guidance: use **`getClaims()`** to verify identity when protecting
  pages and data, `getUser()` when an up-to-date user record from the Auth
  server is needed, and `getSession()` only when the raw tokens are needed.
  _(This supersedes the earlier plan, which named `getUser()` as the default
  identity check.)_
- The **Proxy** refreshes the auth token and passes it to Server Components, so
  they do not each attempt a refresh. Server Components cannot write cookies, so
  refresh must happen in `proxy.ts`.

## 6. Tenant isolation (foundation implemented — Milestone 1C; propagation 1D)

> **Status.** The mechanism below is built and committed for the three
> foundation tables, and 8 of the 10 checks in §6.1 have been demonstrated
> against a real local PostgreSQL. **Checks 9 and 10 need a hosted environment
> and remain unverified, so Milestone 1C-C is not complete** and the pattern is
> not yet propagated across the schema. The implemented branded type is called
> `TenantContext`; where this section says `WorkspaceContext`, it means that
> same object, produced by `createTenantContext()` inside
> `server/auth/workspace-context.ts` and required by `withTenant()`.

**The product requirement (spec §177).** Every application read and write is
scoped to the acting user's workspace. Isolation must be enforced in
server-side authorization **and**, independently, at the database layer through
row-level security, so a fault in one layer does not expose another workspace's
data. **Neither layer replaces the other**, and server-side authorization
remains required even where database enforcement exists.

**The engineering gate (Milestone 1C).** The requirement above is settled. What
is _not_ settled is whether the specific mechanism below — GUC-based RLS over a
pooled Drizzle connection — holds up. That must be proved by the gate in §6.1
before tenant data is introduced. If the session-context mechanism cannot be
demonstrated safe, the answer is to choose another safe design, never to weaken
or drop the requirement.

Two independent layers.

**Layer 1 — application.** Every repository function takes a branded
`WorkspaceContext` that can only be produced by `requireWorkspaceContext()`,
which re-verifies an active membership row on every request. A `workspaceId`
from the browser is never trusted. An ESLint restriction keeps the Drizzle
client importable only from `server/db/**` and `server/repositories/**`.

**Layer 2 — PostgreSQL RLS (unproven — D10).** Policies key on a
transaction-local GUC, not `auth.uid()`, because a direct Drizzle connection
carries no JWT. Every tenant query runs inside a transaction that issues
`set_config('app.workspace_id', …, true)`.

> `SET LOCAL` / `set_config(..., true)` is **transaction-scoped**. A plain `SET`
> would leak the workspace id to the next request borrowing the same pooled
> connection — a cross-tenant data leak, and the single most dangerous mistake
> available in this architecture.

### 6.1 RLS proof gate (blocking for Milestone 1C)

The pattern must **not** be propagated across the schema until a focused
integration test demonstrates all of the following against the real Supabase
environment:

1. The runtime database role can connect.
2. It does **not** own the application tables.
3. It does **not** have `BYPASSRLS`.
4. `FORCE ROW LEVEL SECURITY` behaves as expected.
5. An **unset** tenant GUC fails closed (zero rows).
6. A **wrong** workspace GUC returns zero rows.
7. `set_config(..., true)` remains transaction-local.
8. Sequential transactions on a pooled connection do not leak workspace context.
9. The selected Supabase transaction pooler and the Drizzle driver work together.
10. Migration credentials and runtime credentials are genuinely separate.

If any step cannot be demonstrated, stop and report the exact failure. Do not
weaken the test and do not describe the protection as working.

**Status of each check at commit `90db9e4`.** Checks 1–8 were demonstrated by
the live suites in `src/server/db/` and `src/server/auth/` against the local
Supabase stack; the figures are the ones quoted in build-plan.md and were not
re-measured by this documentation pass.

| #   | Check                                       | Status               | Where                                                            |
| --- | ------------------------------------------- | -------------------- | ---------------------------------------------------------------- |
| 1   | Runtime role can connect                    | demonstrated locally | `roles.test.ts`                                                  |
| 2   | Does not own the application tables         | demonstrated locally | `roles.test.ts`; owner is `limenzy_owner`                        |
| 3   | No `BYPASSRLS`                              | demonstrated locally | `roles.test.ts`                                                  |
| 4   | `FORCE ROW LEVEL SECURITY` behaves          | demonstrated locally | `rls.test.ts` — constrains the table owner too                   |
| 5   | Unset tenant GUC fails closed               | demonstrated locally | `rls.test.ts`                                                    |
| 6   | Wrong workspace GUC returns zero rows       | demonstrated locally | `rls.test.ts`                                                    |
| 7   | `set_config(..., true)` stays transactional | demonstrated locally | `tenant.test.ts`                                                 |
| 8   | No context leak across pooled transactions  | demonstrated locally | `tenant.test.ts`, `workspace-context.db.test.ts`                 |
| 9   | Supabase transaction pooler + Drizzle       | **not verified**     | local pooler disabled; never in the connection path              |
| 10  | Migration and runtime credentials separate  | **locally only**     | `limenzy_owner` is NOLOGIN locally; hosted separation unverified |

Checks 9 and 10 are **not waived, reinterpreted or moved to a later
milestone**. They are blocked on a hosted project existing, and 1C-C stays open
until they pass.

**Hosted status: the gate is passed.** Run `fab69fd8` on 2026-10-14 against the
hosted development project `limenzy-crm-dev` completed **46 passed, 0 failed, 0
skipped, exit 0**. The runtime role connected as `limenzy_app` through the
Supabase transaction pooler on port 6543 with verified TLS; the tooling role
connected as `postgres` on 5432 and was used only to create, read and remove
fixtures. An earlier run, `c29c8e63`, established checks 1–8 and 10 by the same
method; `fab69fd8` repeated them and added the Drizzle gateway.

| #   | Check                                                                                                             | Status                  |
| --- | ----------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1–8 | Connection, ownership, BYPASSRLS, FORCE RLS, unset and wrong GUC, transaction-locality, pooled-connection leakage | demonstrated hosted     |
| 9   | Supabase transaction pooler + Drizzle                                                                             | **demonstrated hosted** |
| 10  | Migration and runtime credentials separate                                                                        | **demonstrated hosted** |

**Check 9.** Exercised through the real `withTenantDb()` gateway of §6.3 over
the 6543 pooler: the Drizzle query builder returned only the context workspace;
an `owner_admin` `UPDATE … RETURNING` affected exactly one row and the stored
value was confirmed by the tooling connection; a `staff_sales` `UPDATE` affected
zero rows and left the stored value unchanged; a cross-workspace context
returned zero rows; a thrown callback rolled its `UPDATE` back; the setting was
absent after the transaction; and sequential and concurrent transactions each
saw only their own workspace. The same isolation was demonstrated through the
raw-SQL `withTenant()` gateway in the same run, and nesting one gateway inside
the other was refused in both directions with `TenantGatewayConflict`.

**Check 10.** The two connections authenticate as different roles; the runtime
role holds no membership of `limenzy_owner`, `limenzy_bootstrap`, `postgres`,
`service_role`, `supabase_admin` or `pg_read_all_data` (`MEMBER`, `USAGE` and
`SET` all false); `SET ROLE` to the privileged roles is refused with SQLSTATE
42501; the migration history is unreadable to it; and only the tooling role
holds `BYPASSRLS`. Every permission-denial assertion requires SQLSTATE 42501
specifically, so a missing object or a constraint violation cannot be mistaken
for access control.

**Negative TLS controls.** A wrong certificate authority, a mismatched server
name and the absence of a pinned CA each failed the connection. Verification was
never disabled, for any check.

**Fixtures and cleanup.** The run created synthetic fixtures only — two
`auth.users` rows, two profiles, three workspaces and four memberships,
including an inactive membership — each recorded by primary key as it was
created. Cleanup ran in a `finally` block, deleted only those recorded
identifiers in foreign-key-safe order, re-read each one individually to confirm
absence, and compared both row counts and the pre-existing identifier sets
against baselines captured before the fixtures existed. All four table counts
returned to their baseline of zero and no pre-existing row was touched. No
`TRUNCATE`, prefix match or reset was used at any point.

**How the hosted run was configured.** The harness lives outside the repository
and set `DATABASE_URL` and `DATABASE_CA_CERT` **inside its own process only**.
`.env.local` was neither read nor switched, no hosted credential was exported to
a parent shell or written to disk, and both passwords were typed at hidden
terminal prompts. The repository's own configuration is unchanged.

**What this gate does not cover.** It is a database-layer proof. HTTPS `Secure`
cookie behaviour in a browser remains unverified — no HTTPS origin was
available — and the CRM business modules remain placeholder screens. Neither is
a §6.1 check; both are tracked in `docs/build-plan.md`.

### 6.2 Workspace routing and selection (implemented, Milestone 1C-C)

How a request gets from a verified person to a workspace. This records what the
committed code does; it changes no decision above.

**Two groups of routes.** `src/app/(account)/` holds setup, the workspace
chooser and the access-unavailable screen: they require authentication and
deliberately **not** a workspace, because they exist to answer “which
workspace?”. `src/app/(app)/` holds the application, where a workspace is
required.

**The gate runs per page, not only per layout.** `requireWorkspaceContext()` is
called by the `(app)` layout and again by every page beneath it, and must be
called again by every Server Action that writes. A layout is not re-executed on
client-side navigation between sibling routes, so a layout-only check can be
stale by the time a page renders; and the proxy is explicitly not the
authorization boundary. Nothing is cached — no `cache()`, no module state, no
role in a cookie.

**The saved workspace is a preference, never authorization.** The cookie holds
one workspace id and nothing else — no role, no profile id, no context. Every
request hands it to the resolver as an untrusted candidate, which checks it
against memberships read under RLS for the verified identity, so a stale,
revoked, foreign or forged value is refused identically.

It is unsigned. Signing would only establish that this server wrote the value;
it would say nothing about whether the person still has an active membership in
that workspace, which is the question that actually decides access. Because
membership is re-read on every request, the outcome is the same whether the
preference is signed or not — a tampered id is refused by the membership check,
not by a signature.

**Explicit workspace parameters: one route only.** `?workspace=<id>` is read
**only** by the chooser at `/select-workspace`, where a value that is not an
active membership produces a 404, matching the standing cross-tenant rule in
§9. No other route reads the parameter: on an application route it is an
unknown query parameter and selects nothing, so the saved preference still
decides what is rendered.

The specification does not require a workspace identifier in a URL anywhere.
What it does say about addressing is §179.1: the installed application must
start at `/` and "must not start at a workspace-specific or permission-specific
address", and the root route runs the authentication, onboarding and
workspace-selection flow — which is what the implementation does. There is no
specification conflict here and no decision pending; this paragraph records
behaviour, not an open question.

**Cookie mutation happens in exactly three places**, because the platform
forbids it during rendering: the chooser's Server Action writes it, sign-out
clears it, and `GET /workspace/reset` clears it during recovery. The reset
handler returns a **root-relative** `Location`, so the browser keeps its own
scheme, host and port and the session cookie travels with it; deriving an
origin from a `Host` or forwarded header is specifically rejected.

**Chooser names come through the ordinary gateway.** `public.workspaces` grants
a row only when it matches the selected workspace and an active membership
exists, so names are read one workspace at a time inside `withTenant()`, each
under a context minted from that membership. A workspace whose row is no longer
readable is dropped from the list rather than shown. No tooling credential, no
secret key, no `SECURITY DEFINER` and no policy change is involved.

**Runtime and tooling credentials stay separate.** `DATABASE_URL` is the
application's `limenzy_app` connection — non-owner, NOBYPASSRLS, used only
through `withTenant()`. `DRIZZLE_TOOLING_DATABASE_URL` is a local superuser
connection for Drizzle Kit, migrations and test fixtures; it bypasses RLS, is
never used by application code, and proving access with it would prove nothing.
Two independent mechanisms keep that boundary: `eslint.config.mjs` restricts
the driver, raw-client and context-constructor imports per directory and
forbids naming the tooling connection outside the places that may, and a
contract test in `src/test/local-tooling.test.ts` enumerates the exact files
allowed each exemption, so a new file cannot quietly acquire one.

### 6.3 Tenant query gateways (implemented, Milestone 1C-C)

Two gateways, one contract. Both open a transaction on the same restricted
runtime pool (`limenzy_app`, no `BYPASSRLS`, verified TLS, `prepare: false`),
establish the same three transaction-local settings before any caller statement
runs, and leave the rest to the fail-closed policies.

| Gateway                                         | Handle the callback receives | Use it for                             |
| ----------------------------------------------- | ---------------------------- | -------------------------------------- |
| `withTenant()` — `src/server/db/tenant.ts`      | postgres.js `TransactionSql` | tagged-template SQL                    |
| `withTenantDb()` — `src/server/db/tenant-db.ts` | Drizzle transaction          | Drizzle query builder and `.execute()` |

**Why two.** Drizzle's `drizzle()` factory writes type parsers to
`client.options`, and a postgres.js `TransactionSql` has no `options` — it is
built by an inner `Sql(handler)` that assigns only `types`, `typed`, `unsafe`,
`notify`, `array`, `json` and `file`. So a Drizzle handle **cannot** be
constructed over a transaction `withTenant()` already opened. What Drizzle does
support is opening the transaction itself: its `transaction()` calls postgres.js
`begin()` and builds its session over the resulting transaction client.
`withTenantDb()` uses that supported path, which is why it owns its transaction
rather than borrowing one. No `.options` is fabricated, no `TransactionSql` is
cast into `drizzle()`, and no driver internals are copied.

**Nesting.** Both gateways share one `AsyncLocalStorage` scope in
`src/server/db/tenant-scope.ts`, which no other module may import. A nested call
with an identical context reuses the running transaction; a differing context
throws `TenantContextConflict`; a call made while the _other_ gateway owns the
transaction throws `TenantGatewayConflict`. All three decisions happen **before**
any statement runs. Two separate scopes would each be blind to the other, so a
`withTenantDb()` inside a `withTenant()` would open a second transaction on a
second pooled connection — two tenant contexts in flight at once, which is the
failure this design exists to prevent.

#### The parser contract

`drizzle()` replaces the pool's type parsers and serializers as a side effect:
transparent parsers for OIDs 1184, 1082, 1083, 1114, 1182, 1185, 1115 and 1231,
and serializers for 114 and 3802. The practical effect is that **timestamp
columns come back as raw strings rather than `Date`** — `"2026-10-14 03:00:00+00"`
instead of a `Date` object.

This applies to **raw SQL on the runtime pool**, including `withTenant()`
callbacks. Drizzle's own schema-defined columns are unaffected: it maps them
through the schema, which is why the transparent parsers are installed in the
first place.

The side effect is accepted deliberately, and made deterministic:
`createRuntimePool()` builds the Drizzle handle **as it creates the pool**, so
the contract is a fixed property of every runtime pool from its first statement,
identical for both gateways, in every process. Deferring it to first use would
mean the raw-SQL path behaved one way before the first `withTenantDb()` call and
another way after it — a behaviour change that moves with traffic.

No current raw-SQL caller selects a timestamp column
(`workspace-names.ts`, `identity.ts`, `create-initial-workspace.ts` read
`name`, `id`, `workspace_id`, `role` and `outcome`), so nothing needed
converting. A future raw-SQL caller that wants a `Date` must parse the string
itself, or read that column through Drizzle. `client-drizzle.unit.test.ts`
pins this contract so it cannot change unnoticed.

Each pool gets exactly one Drizzle handle, held in a `WeakMap` keyed by the pool,
so a handle can never outlive the pool it is bound to or be served for a pool
that has been closed and replaced.

### 6.4 Member email addresses and the Auth Admin credential (Milestone 2B)

**What changed.** The application server now holds `SUPABASE_SECRET_KEY`, a
project-wide privileged Supabase credential. This is a real widening of what a
compromise of the application server would yield, and it is recorded here
rather than buried in a module comment.

**Why the database could not do it.** §159 lists Email in the Users table. It
lives in `auth.users`, which has row-level security enabled with **no
policies** and is owned by `supabase_auth_admin`, so no role is able to read it
unless it bypasses RLS. A dedicated `BYPASSRLS` role was designed, built and
applied locally — and then abandoned, because the gate is elsewhere: the
migration role holds `USAGE` on schema `auth` **without grant option**, so
`GRANT USAGE ON SCHEMA auth TO <role>` emits `WARNING: no privileges were
granted` and silently does nothing, while the column grants on `auth.users`
succeed and make the failure easy to miss. The migration role is not a member
of `supabase_admin`, so it cannot obtain grant option. The remaining database
routes — `pg_read_all_data`, `BYPASSRLS` on a widely-granted role, or a policy
on a Supabase-managed table — were each far larger than one column is worth,
and were refused.

**What the credential can do, stated plainly.** The secret key can administer
every Auth user in the project and bypasses row-level security on the Data
API. **The database-role separation remains exactly as it was — and it does
not constrain this credential.** `limenzy_app` is still non-owner,
NOBYPASSRLS, column-scoped and policy-bound, and every CRM read and write
still goes through it via `withTenant()`. None of that applies to an HTTPS
call to the Auth Admin API. §6.1 Check 10 is unaffected and remains true: it
asserts the runtime **database** role holds no privileged membership, and the
secret key is not a database role.

**What constrains it instead**, and what the tests pin:

- one module reads the key, and it is `server-only`;
- one operation, `auth.admin.getUserById`. No project-wide user listing, no
  `.from()`, `.rpc()` or `.storage`, no user creation, update, deletion or
  link generation;
- `manage_users` is checked **first**, so an unauthorised request never
  reaches the credential;
- the ids come **only** from `app.workspace_members()`, which re-derives
  Owner/Admin from stored rows and returns only the selected workspace's
  members. The helper is handed ids and nothing else — it has no workspace to
  check them against, so where they come from is the whole of its safety;
- only the displayed page is looked up, bounded concurrency (6), and timeouts
  bound to the client's own `fetch` so an abort cancels the HTTP request
  rather than abandoning a promise;
- nothing is cached. A privileged result must not outlive the authorisation
  that justified reading it;
- the Auth user id stays on the server; the browser receives display data.

**The cost accepted.** The workspace filter is now enforced by our code
passing the right id set, rather than by a policy that cannot be bypassed.
That is a genuine step down from the rest of the system, and it is why the
ordering is asserted structurally rather than left to review.

**Operationally.** Each displayed address is one Auth Admin request, so the
Users list is paged (25 per page) and only the current page is resolved. There
is no member-count cutoff — a large workspace is paged, never truncated.

## 7. Decisions taken during Milestone 1A

| #   | Decision                                                                                                | Reason                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Reference assets moved to `docs/`, `design/`, `brand/`; contents unchanged (SHA-256 verified)           | Canonical layout requested; originals preserved byte-for-byte                                                                                                                                                                  |
| A2  | Logos served from `public/brand/` as `<img>` and swapped with CSS                                       | Both SVGs declare the same internal ids (`limenzyInk`, `limenzyAccent`, `glassDepth`); inlining both would make `url(#…)` resolve to the wrong theme's gradient. CSS switching also avoids a theme flash.                      |
| A3  | Three named surface tiers — `.surface-glass`, `.surface-elevated`, `.surface-solid`                     | Makes "glass for navigation, opaque for data" a system rule rather than a per-component decision, and keeps `backdrop-filter` off long scrolling lists                                                                         |
| A4  | Ambient gradient painted once by the app shell (`.app-ambient`)                                         | Prevents every component carrying its own gradient                                                                                                                                                                             |
| A5  | Colour tokens in OKLCH; contrast asserted by test                                                       | Perceptually even lightness ramps, and contrast regressions fail the suite rather than review                                                                                                                                  |
| A6  | `TopBar` is a Client Component                                                                          | It passes Lucide component references to client children; component references are not serializable across a Server→Client boundary. Server-resolved values in 1B/1C will be passed in from the `(app)` layout as plain props. |
| A7  | Unbuilt features render an explicit "Not available" control that explains itself, never a simulated one | No pretend search box, notification feed or signed-in user                                                                                                                                                                     |
| A8  | ESLint pinned to **9.39.5**, not 10.x                                                                   | ESLint 10 crashes with `eslint-config-next@16.3.4` (see §8)                                                                                                                                                                    |
| A9  | TypeScript pinned to **5.9.3**, not 7.x                                                                 | `typescript-eslint@8` (a dependency of `eslint-config-next`) declares `typescript >=4.8.4 <6.1.0`                                                                                                                              |
| A10 | Test toolchain pinned below current majors                                                              | Node 20.20.2 is installed; see §8                                                                                                                                                                                              |

## 7a. Ambient field revision (Milestone 1A, visual review)

The first ambient implementation was technically present but effectively
invisible. Four causes, all fixed:

1. **Alpha far too low** — 0.10–0.14 (light) and 0.16–0.30 (dark).
2. **Two of three sources centred off-canvas** (`at 8% -8%` and `at 42% 108%`),
   so most of each glow was clipped outside the viewport.
3. **`transparent 60%`** truncated the falloff early, shrinking each glow to a
   small area around its centre.
4. **The dark base was near-black** (`L 0.168`), leaving the glass tiers nothing
   to reveal.

Measured on the rendered page, large regions carried _zero_ ambient
contribution — light mid-canvas was pure `rgb(255,255,255)`, dark centre and
lower-right were both the flat base `rgb(10,15,25)`.

Not a cause: occlusion. No wrapper in the shell carries a background, and the
layer's `z-index: -1` correctly places it above the body background.

**The revision:**

| Change                          | Detail                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Four ambient sources            | indigo/lavender upper-left, blue-cyan upper-right, cyan lower-right, faint lavender lower-left                                  |
| Centres on canvas               | `18% 0%`, `92% 6%`, `78% 96%`, `2% 88%`                                                                                         |
| Viewport-relative sizes         | `92vw 62vh` etc., so the composition keeps its structure on a phone rather than one glow swelling into a flat field             |
| Three-stop falloff              | colour → `color-mix(… transparent 55%)` → transparent, which removes the hard circular edge a two-stop radial gradient produces |
| Dark base                       | `L 0.168 C 0.022` → `L 0.205 C 0.036` — deep navy, not near-black                                                               |
| Dark surfaces raised            | surface `0.222 → 0.248`, elevated `0.252 → 0.278`, so panels stay distinct from the lighter base                                |
| Glass more translucent          | light `0.72 → 0.60`, dark `0.58 → 0.48`                                                                                         |
| New `--surface-glass-strong`    | selected navigation, one step brighter than the panel it sits on                                                                |
| New `--surface-glass-highlight` | single inset hairline along the top edge of glass surfaces                                                                      |

Measured channel spread across the canvas roughly **doubled** in the previously
dead regions, and holds its structure at 1440px, 834px and 390px.

**Contrast consequence, handled not waived.** The stronger field pushed muted
text below 4.5:1 at two gradient peaks (light indigo 4.20:1, dark cyan 4.27:1).
The contrast suite now tests every backdrop — neutral base, each of the four
gradient peaks, and all of those seen through both glass tiers — and the
thresholds were left alone. `--muted-foreground` was corrected instead:
light `L 0.502 → 0.472`, dark `L 0.735 → 0.768`.

## 7b. Glass-surface revision (Milestone 1A, second visual review)

The ambient field was approved but the shell surfaces still read as flat
panels. Computed styles from the running page — not the declarations — showed
why:

| Surface           | Rendered before                                                                             | Problem                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar           | `rect 264x900 @ 0,0`, `radius 0`, **`border-width: 0px`**, fill `white / 0.60`              | Flush to the viewport, square, and the `border-y-0 border-l-0` utilities had zeroed the very hairlines that sell glass. No ambient visible around it. |
| Top bar           | `radius 0`, **`border-width: 0px`** (only the bottom edge survived `border-x-0 border-t-0`) | Same. Pinned flush, nothing scrolled beneath it.                                                                                                      |
| Selected nav item | fill `white / 0.82`                                                                         | Effectively an opaque white card.                                                                                                                     |
| Search            | `background: lab(100 0 0)`, `backdrop-filter: none`                                         | It was on the SOLID tier — a plain opaque field.                                                                                                      |

**The root cause, and it is worth stating plainly:** a backdrop blur only
produces a visible effect where there is _detail_ behind the surface. A
Gaussian blur applied to a smooth radial gradient is close to an identity
operation. Every shell surface was pinned flush against pure gradient, so
`blur(16px)` did nothing perceptible, and the edge hairlines that would
otherwise have communicated the material had been zeroed by utility classes.

Not a cause: stacking. `isolation: auto` everywhere, no `filter` or `opacity`
on ancestors, the ambient layer correctly at `z-index: -1`, and no wrapper in
the chain carried a background.

**The revision:**

| Change                              | Detail                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell surfaces float                | `--shell-inset: 0.75rem` gutter on all sides; `--glass-radius: 1rem`                                                                                                                                           |
| Content scrolls beneath the top bar | It is inset at `lg` and up, so the blur finally has real detail to work on                                                                                                                                     |
| Directional edges                   | `border-top/left` = `--surface-glass-edge` (luminous), `border-bottom/right` = `--surface-glass-edge-soft`                                                                                                     |
| One inner highlight                 | `inset 0 1px 0 0 var(--surface-glass-highlight)`                                                                                                                                                               |
| Soft floating shadow                | wide, low opacity — separation without weight                                                                                                                                                                  |
| Fill made transmissive              | light `0.60 → 0.42`, dark `0.48 → 0.30`                                                                                                                                                                        |
| Selected nav                        | light `0.82 → 0.56`, dark `0.66 → 0.36` — 1.84x brighter than the sidebar, still translucent                                                                                                                   |
| New `.glass-control`                | search and utility capsules; no second backdrop blur stacked on the first                                                                                                                                      |
| Blur raised                         | `16px → 22px`, saturate `140% → 165%`                                                                                                                                                                          |
| Main offset                         | `lg:ps-[calc(var(--sidebar-width)+var(--shell-inset))]` plus a `lg:px-[var(--shell-inset)]` wrapper, so the sidebar/content gap equals the outer gutter and the page title stays aligned with the page heading |

Measured after: the top bar's colour shifts **29** (light) / **44** (dark)
channel units across its own width — the field transmitting through it. The
sidebar separates from the ambient beside it by **38** / **53**.

Deliberately unchanged: tables, forms, dialog bodies, dropdown menus and the
large empty-state panel remain fully opaque. The drawer (`SheetContent`) also
stays opaque — it is a modal panel over dimmed content, where readability
matters more than transmission, and §6 of the brief asks for dialog bodies to
stay near-opaque.

**Contrast consequence, handled not waived.** A brighter selected tier lightens
the worst-case backdrop in dark. The suite — now also compositing
ambient → glass → control for the capsules — failed at 4.42:1 for muted text
and 2.80:1 for the focus ring. Thresholds were left alone and the tokens were
corrected: dark `--muted-foreground` `L 0.768 → 0.816`, dark `--ring`
`L 0.68 → 0.74`.

## 7c. Glass-surface revision REVERTED

§7b (the floating glass shell) was **reverted at the reviewer's request**. The
approved visual direction is the state after §7a: the improved ambient field
with restrained, flush shell surfaces.

§7b is retained above as a record of the diagnosis — the finding that a
backdrop blur is close to a no-op over a smooth gradient, and that
`border-y-0` / `border-x-0` utilities were zeroing the glass hairlines, stays
true and is worth keeping should the question come up again.

**Reverted:** floating insets, `--shell-inset` / `--sidebar-width` /
`--glass-radius`, the large outer radius, directional (bright top/left vs soft
bottom/right) borders, `.glass-control` and its tokens, the heavier inner
highlight and wide floating shadows, `blur(22px)/saturate(165%)` → back to
`16px/140%`, and the more transmissive fills → back to `0.60/0.48` panels and
`0.82/0.66` selected.

**Restored:** flush full-height sidebar with a single right-hand divider, flush
top bar, the earlier selected-navigation treatment, and the solid search field.

**Deliberately kept from §7b** (not visual-direction changes):

- Dark `--muted-foreground` `L 0.816` and `--ring` `L 0.74`. These were raised
  for contrast and are strictly more accessible; they pass comfortably against
  the restored, more opaque tiers. The brief asked for accessibility work to be
  kept.
- The `/design-preview` "Backdrop transmission" section — an internal QA aid on
  a page that is not part of the product, not a shell surface.

The ambient field from §7a, all routes, navigation, typography, breakpoints,
placeholder behaviour, package versions and architecture are untouched.

## 7d. Progressive Web App delivery (approved, Milestone 1E)

The CRM is additionally delivered as an installable PWA. **One** Next.js
App Router codebase, one backend, one PostgreSQL database, one
multi-tenant product. No Flutter application, no React Native
application, no separate mobile repository.

> **Superseded — project boundary.** This section originally read “A&S Fincare
> uses the same product through its own isolated workspace”, and the sentence
> above ended “…, no A&S Fincare fork.” That framing is no longer correct and
> must not be relied on: **A&S Fincare is a separate client project with its
> own requirements, and is not a workspace of Limenzy CRM SaaS.** Nothing from
> that project — roles, business rules, database design, providers or stack
> decisions — is an input here. The original wording is quoted rather than
> deleted so the historical decision stays legible; the decisions in the table
> below are unaffected, because they concern Limenzy's own product identity.

| #   | Decision                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | V1 installs under the **Limenzy CRM** product identity. No individual business's branding appears in the manifest, icons or offline screen.                                                                                                                                                                                                       |
| P2  | `start_url: "/"` and `scope: "/"` — origin-relative. The root route runs the normal server-side authentication, onboarding and workspace-selection flow. The production hostname is deferred and not needed for 1E.                                                                                                                               |
| P3  | Application icons are **derived from the approved Limenzy chevron symbol**. Original SVG assets are preserved and never edited. The full wordmark is never placed inside a square icon. Separate normal and maskable icons, with maskable safe-zone padding.                                                                                      |
| P4  | A service worker is **not** treated as a universal installation requirement. It exists only to provide the restricted offline fallback. Manifest, HTTPS, icons and actual installation are validated independently. Automated tooling is a supporting check; real-device installation on Android Chrome and iPhone Safari is the acceptance test. |
| P5  | No Web Push, no background notifications, no offline mutations, no background sync, no conflict resolution, no offline CRM data in V1.                                                                                                                                                                                                            |
| P6  | Milestone 1E sits after 1D and before Milestone 2.                                                                                                                                                                                                                                                                                                |

### Caching rule

> Authentication responses, tokens, cookies and session values must never
> be written to Cache Storage or intentionally cached by the service
> worker. Normal secure browser cookie storage may be used according to
> the approved authentication and session policy.

The service worker caches only non-sensitive static assets and the
offline page, by allow-list. Customer, lead, renewal, email, document and
report content is never cached. This matters doubly on iOS, where an
installed application shares service-worker registration and Cache
Storage with Safari — so anything cached in one context is reachable from
the other. The cache must therefore be non-sensitive by construction, not
by context.

### Session behaviour in standalone display

Depending on the browser, operating-system version and installation flow,
the installed application may inherit the existing cookie session or may
require the user to sign in. **Both paths must be tested and handled
correctly.** Being asked to sign in once after installing is expected
platform behaviour, not an error, and the install help says so.

This reinforces the approved 1B design: session state lives in server-set
cookies via `@supabase/ssr`, never in `localStorage`.

### Two live defects 1E corrects

| Defect                       | Evidence                                                                                                                           | Consequence                                                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `viewport-fit=cover` missing | `src/app/layout.tsx` exports `viewport` with `themeColor` only, while the shell uses `env(safe-area-inset-bottom)` in three places | Safe-area insets resolve to **0 on iOS**; the bottom bar sits under the home indicator once installed. `viewportFit` is supported by Next's type (`extra-types.d.ts:52`) even though the docs page omits it. |
| `themeColor` values stale    | Meta declares `#fafbfe` / `#0b0f1a`; the tokens now compute to `#F5FAFE` / `#0F1728` after the ambient-field revision              | Installed status bar and splash do not match the application ground. Manifest colours must derive from the same source.                                                                                      |

### Why per-tenant installed branding is not V1

The manifest is fetched before authentication, so there is no session and
no workspace context to vary it by. A workspace-scoped `start_url` would
make a cached static file carry a permission decision. `manifest.ts` is a
cached Route Handler, so reading a request-time API to vary by tenant
makes it dynamic. And a device installs one icon per origin, so per-tenant
icons require per-tenant origins — a hosting and certificate decision,
deferred.

Workspace branding may later drive _in-application_ presentation (top-bar
name, in-app logo, accent colour) under Settings §157–§158 without
touching the manifest.

## 8. Verified version constraints

Determined empirically on 2026-09-11, not assumed.

| Constraint                                    | Evidence                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ESLint must be 9.x**                        | ESLint 10.10.0 aborts: `TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function`, from `eslint-plugin-react` bundled inside `eslint-config-next@16.3.4`. The official Next.js 16.3.4 template pins `eslint: ^9`. |
| **TypeScript must be < 6.1**                  | `typescript-eslint@8.x` peer: `typescript: ">=4.8.4 <6.1.0"`. TypeScript 7.0.2 is the current `latest` tag but is outside the range the Next.js lint stack supports.                                                                                               |
| **Vitest must be 4.x**                        | `vitest@5.0.0` engines: `node ^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`. Installed Node is **20.20.2**. `vitest@4.1.11` engines: `node ^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0`.                                                                                             |
| **jsdom must be 29.x**                        | `jsdom@30` requires `node ^22.22.2 \|\| ^24.15.0 \|\| >=26`. `jsdom@29.1.1` allows `^20.19.0`.                                                                                                                                                                     |
| **@testing-library/jest-dom must be ≤ 6.9.x** | 6.10.0 and 7.x require `node >=22`. 6.9.1 requires `node >=14`.                                                                                                                                                                                                    |
| **@vitejs/plugin-react must be 5.x**          | v6 peers `vite ^8` plus `oxc-transform-react`; v5.2.0 engines `^20.19.0 \|\| >=22.12.0`.                                                                                                                                                                           |

**Consequence:** upgrading the runtime to **Node 22 LTS** would unlock Vitest 5,
jsdom 30 and jest-dom 7. Recommended before the test suite grows, but not
required — the pinned set is fully stable and mutually compatible on Node 20.

## 9. Standing engineering rules

- Business logic lives in the service layer. Never in React components, never
  duplicated across Server Actions, Route Handlers and background jobs.
- Never trust `workspaceId`, role, permission, owner or assignment values from
  the browser. Derive them on the server, every request.
- Hiding a button is not authorization. Every mutation re-checks.
- A cross-tenant miss returns **404**, not 403 — a 403 confirms the record
  exists in another workspace.
- Deactivation restricts future use; it never deletes or rewrites history
  (spec §177).
- No hard-coded theme colours in components. Enforced by
  `src/test/design-tokens.test.ts`.
- No `any` to silence a type error. No weakened test to make a build pass.
- Never expose the Supabase secret key or a database URL to browser code.
  The publishable key is the only Supabase key that may carry a
  `NEXT_PUBLIC_` prefix; `src/lib/env.ts` rejects an `sb_secret_` value in
  that variable rather than inlining it into the browser bundle.
- **The application server holds a project-wide privileged credential**
  (`SUPABASE_SECRET_KEY`), used by exactly one module
  (`src/server/auth/member-emails.ts`) for exactly one operation
  (`auth.admin.getUserById`). See §6.4.

## 10. Open decisions — client (§163.18) versus CTO (§180.1)

Two separate groups. A client decision is never moved into the CTO list, and a
CTO decision is never presented to a workspace as configuration. None of them is
resolved here.

**Client product decisions — the five still open in §163.18**

1. How the target Sales Team is selected for a new Lead.
2. Whether imported Leads without a valid Record Owner enter team-scoped round
   robin.
3. What a Team Lead may see beyond the minimum My Team roster (§163.6).
4. Whether a Team Lead may manually reassign Leads within their own team
   (§163.10).
5. What Sales Team management and cross-team permissions Managers receive.

**CTO / deployment decisions — §180.1**

WhatsApp provider · Email provider · private object-storage provider · backup
retention · monitoring and alerting platform · on-call and incident process ·
support SLA · RTO · RPO · legal data-retention and deletion policy · final
production import limits after load testing · final WhatsApp and Email bulk
limits · provider-specific webhook and retry configuration.

**The rule while they stay open.** A capability that depends on an unresolved
decision **defaults to denied** (§162, §163.18): it is never enabled by default,
inferred from a role, granted by Sales Team membership or Team Lead
responsibility, or assumed because a user can reach the screen that offers it.
Unresolved decisions must not block unrelated foundation work — the schema,
tenant isolation, permissions plumbing, and every module that does not depend on
one of them proceeds normally.
