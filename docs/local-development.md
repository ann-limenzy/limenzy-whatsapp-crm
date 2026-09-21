# Local Development

How to run Limenzy CRM's database and authentication stack on your own machine,
with no company Supabase credentials and no hosted project.

Everything here is local. Nothing in this guide connects to a hosted
environment, and no command in `package.json` can target one.

---

## Prerequisites

| Requirement    | Version                   | Notes                                               |
| -------------- | ------------------------- | --------------------------------------------------- |
| Node           | ≥ 20.19.0 (`engines`)     | Verified on 20.20.2                                 |
| npm            | 10.x                      | Verified on 10.8.2. npm only — no yarn, pnpm or bun |
| Docker Desktop | Running before `db:start` | The Supabase stack is twelve containers             |
| Disk           | ~3 GB free                | First start downloads the official Supabase images  |

The Supabase CLI and Drizzle Kit are **repository dependencies**, pinned to
exact versions in `package.json`. Do not install a global Supabase CLI — the
npm scripts resolve `supabase` from `node_modules/.bin`, so everyone runs the
same version.

```bash
npm install
```

---

## Daily commands

| Command                 | What it does                                                              |
| ----------------------- | ------------------------------------------------------------------------- |
| `npm run db:start`      | Starts the local Supabase stack                                           |
| `npm run db:status`     | Shows service status and local URLs and keys                              |
| `npm run db:stop`       | Stops the stack, preserving local data                                    |
| `npm run db:reset`      | **Destroys local data**, replays migrations, re-runs the seed             |
| `npm run db:migrate`    | Applies pending migrations to the local database                          |
| `npm run db:role:local` | Enables the `limenzy_app` runtime login locally and writes `DATABASE_URL` |
| `npm run test:db`       | Runs the live schema tests; fails if the database is unavailable          |

Local endpoints:

| Service         | URL                      |
| --------------- | ------------------------ |
| API gateway     | `http://127.0.0.1:54321` |
| PostgreSQL      | `127.0.0.1:54322`        |
| Studio          | `http://127.0.0.1:54323` |
| Email (Mailpit) | `http://127.0.0.1:54324` |
| Analytics       | `http://127.0.0.1:54327` |

Local sign-up requires email confirmation, matching the production flow. The
confirmation email is not delivered anywhere real — open **Mailpit** at
`http://127.0.0.1:54324` and click the link there.

### `db:reset` is destructive

It drops and recreates the **local** database: every local user, every row, all
of it. It only ever affects the container on your machine — `--local` is
explicit in the script, and this repository is not linked to a hosted project.
There is nothing to recover afterwards, so do not reach for it to fix a
migration you have not yet written down.

---

## Environment files

`npm run db:start` prints the local URL and keys. Copy them into `.env.local`,
which is git-ignored:

```
NEXT_PUBLIC_SUPABASE_URL=              # the printed API URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=  # the printed sb_publishable_... key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
DRIZZLE_TOOLING_DATABASE_URL=          # the printed DB URL — tooling only
```

Rules that the code enforces, not just convention:

- Only the **publishable** key (`sb_publishable_…`) may live in a
  `NEXT_PUBLIC_` variable. `src/lib/env.ts` rejects an `sb_secret_` value there
  and fails the build rather than inlining it into the browser bundle.
- The **legacy `anon` / `service_role` JWTs are not supported** under any
  variable name, and are rejected too. The local stack still prints them for
  backwards compatibility; ignore them.
- `DRIZZLE_TOOLING_DATABASE_URL` is for local Drizzle Kit commands only. It is
  **not** the application's runtime connection, and pointing application code
  at it would be a mistake. Real runtime/migration role separation arrives in
  Milestone 1C-C and does not exist yet.
- Never commit `.env.local`. Never paste a real key into `.env.example`, this
  guide, a commit message or a test.

---

## Tenant security: what exists today

The database enforces tenant scoping for the application's runtime role. This is
the second of the two layers spec §177 requires — it does **not** replace
server-side authorization, and it is **not** finished.

**Roles.** `limenzy_owner` owns the objects and never logs in.
`limenzy_bootstrap` is reserved for a later phase and owns nothing.
**`limenzy_app`** is the application's only connection: a non-owner,
non-superuser, `NOBYPASSRLS` role, so row-level security applies to it in full.

**Context readers** (`app.current_auth_user_id()`,
`app.current_user_profile_id()`, `app.current_workspace_id()`) each read one
transaction setting — `app.auth_user_id`, `app.user_profile_id`,
`app.workspace_id` — and return `uuid` or NULL. They are `STABLE`,
`SECURITY INVOKER`, own no privilege, touch no table, and are executable only by
`limenzy_owner` and `limenzy_app`. An unset setting yields NULL, so every policy
comparison yields NULL and nothing is visible: **the resting state is deny**. A
malformed value raises rather than resolving to some other identity.

**Policies**, all scoped `TO limenzy_app`:

| Table                   | SELECT                                                                            | UPDATE                    | INSERT / DELETE |
| ----------------------- | --------------------------------------------------------------------------------- | ------------------------- | --------------- |
| `user_profiles`         | own profile, keyed on the auth setting                                            | —                         | none            |
| `workspace_memberships` | own rows, and the profile setting must match the auth setting against stored data | —                         | none            |
| `workspaces`            | the selected workspace, with an active membership                                 | active `owner_admin` only | none            |

Column privileges are an independent second layer: `limenzy_app` may update only
`name`, `business_type`, `country`, `currency` and `time_zone`. It holds no grant
on `id`, `created_at` or `updated_at`, so those cannot be written even if a
policy were wrong. `updated_at` is maintained by its trigger.

**`FORCE ROW LEVEL SECURITY`** is enabled on all three tables, so the owner is
subject to the policies too. Stated accurately: FORCE does **not** constrain a
superuser or a `BYPASSRLS` role — locally `postgres` holds `BYPASSRLS` and still
sees everything, which is what lets migrations and tooling work.

### The runtime gateway

Two database connections exist, and they are not interchangeable:

| Connection                     | Role            | Bypasses RLS? | Used by                                  |
| ------------------------------ | --------------- | ------------- | ---------------------------------------- |
| `DATABASE_URL`                 | `limenzy_app`   | **no**        | the application, through `withTenant()`  |
| `DRIZZLE_TOOLING_DATABASE_URL` | local superuser | **yes**       | `drizzle-kit`, migrations, test fixtures |

**Every tenant query must go through `withTenant()`** (`src/server/db/tenant.ts`):

```ts
await withTenant(context, async (tx) => {
  // every protected statement uses `tx`
});
```

It opens one transaction on the runtime pool and sets `app.auth_user_id`,
`app.user_profile_id` and `app.workspace_id` with
`set_config(name, value, true)` — the third argument makes each setting
**transaction-local**. A session-scoped `SET` would survive the transaction and
leak the tenant to whichever request borrowed the same pooled connection next.
The settings are gone at COMMIT and at ROLLBACK alike.

A query run outside the gateway sees no context, so the policies match nothing
and it returns zero rows. That is fail-closed, but it reads like an empty
database rather than like a mistake — which is why an ESLint rule and contract
tests stop application code importing the pool, the `postgres` driver, a Drizzle
client, or the context constructor.

A context is minted by `createTenantContext()`, which validates three UUIDs,
freezes the object and records it; `withTenant()` accepts nothing else. That
rejects accidental fabrication — a plain object built from request data, or a
copy that lost its provenance — but it is **not** a defence against deliberately
malicious server code, which could import the constructor directly. What closes
that gap is the import boundary, code review of the few modules allowed to call
it, and Phase 4's resolver, which will derive every value from verified Supabase
claims and a live membership read. Phase 3 reads no request, so no browser input
is authoritative anywhere in it.

Nested `withTenant()` calls with the same context reuse the outer transaction
(no second `BEGIN`, no second `set_config`). A nested call with a _different_
context throws `TenantContextConflict` before any statement runs.

To run the gateway's live proof:

```bash
npm run db:start && npm run db:reset && npm run db:role:local
npm run test:db
```

**What this does not prove.** The local stack runs a direct PostgreSQL
connection, not Supabase's hosted transaction pooler (`db.pooler` is disabled in
`supabase/config.toml`). The driver is configured with `prepare: false` in
anticipation of it, but hosted pooler compatibility — §6.1 gate check 9 —
remains unverified until company Supabase access.

### What is proven locally

101 database tests run against the real local database on every `npm run test:db`
and none may skip. They cover absent, empty and malformed context; identity
resolution; cross-tenant attempts; inactive membership; role-gated updates;
column-level refusals; the browser roles; the owner under FORCE; and a
catalogue-based proof that the policy dependency graph
(`workspaces → workspace_memberships → user_profiles → context readers`) is
acyclic and references nothing outside those three tables.

### What is not done yet

- **Nothing in the application sets the context settings.** `withTenant()` —
  which will issue transaction-local `set_config(..., true)` — is a later phase,
  as are the database client and the workspace-context resolver.
- The initial-workspace routine, `/setup` and workspace selection do not exist.
- **Tenant isolation is therefore not complete.** What exists is a correct,
  tested database layer with no application integration above it.

### Still pending on hosted Supabase

Hosted role creation and ownership transfer, transaction-pooler behaviour with
the Drizzle driver, and genuinely separate hosted credentials. None of these can
be established locally, and no hosted compatibility is claimed.

## Migration source of truth

**`supabase/migrations/` is the single authoritative applied migration
history.** One history, applied by one tool.

- The Supabase CLI applies and resets the database from that directory.
- `src/server/db/schema/` holds the typed Drizzle schema definitions.
- `drizzle-kit generate` may produce **candidate** SQL into `./drizzle`, which
  is git-ignored scratch output for review only.
- Reviewed SQL is then committed into `supabase/migrations/`. Candidate output
  is never applied and never committed.

Two things must never happen, because both create a second, divergent history:

- **Never** run `drizzle-kit migrate` against a database the Supabase CLI also
  migrates.
- **Never** use `drizzle-kit push` as a migration mechanism. It mutates a
  database without leaving a reviewable, replayable file. There is deliberately
  no npm script for it.

The CLI prints `Skipping migration .gitkeep…` on start and reset — the
placeholder that keeps the directory tracked. That message is expected and
harmless.

### Verifying the schema against a real database

`src/server/db/schema.test.ts` checks the schema against the **real** local
database: it creates rows, violates constraints on purpose, and switches to the
`anon` and `authenticated` roles to confirm access is denied. It reads the
connection string from `DRIZZLE_TOOLING_DATABASE_URL` in `.env.local`.

Run the full verification with:

```bash
npm run db:start
npm run db:reset
npm run db:role:local
npm run test:db
npm run db:stop
```

### Why `db:role:local` is a separate step

The application connects as **`limenzy_app`** — a non-owner role with
`NOBYPASSRLS`, so row-level security applies to it in full. The migration
creates that role as `NOLOGIN` and gives it no password, because a password must
never live in a migration or in Git.

`npm run db:role:local` generates a local-only password, enables the login and
writes `DATABASE_URL` into `.env.local`. It prints nothing identifying, and the
file is rewritten atomically with mode `0600`, preserving every other entry.

**`npm run db:reset` returns the role to `NOLOGIN`** — verified, not assumed —
so provisioning must follow every reset. It is a separate step rather than being
chained into `db:reset` for two reasons: a reset should not silently rotate a
credential, and nesting npm scripts inside one another invites recursion. If you
forget it, `npm run test:db` fails immediately with a message naming the command
to run; nothing skips.

Re-running is always safe. If the database password is changed but the file
write then fails, the two disagree and the application cannot connect — the
recovery is simply to run `npm run db:role:local` again, which generates a fresh
password and rewrites the file. No manual database repair is ever needed.

The tooling connection (`DRIZZLE_TOOLING_DATABASE_URL`) is a superuser that
**bypasses RLS**. It is for `drizzle-kit` and test fixtures only, and runtime
code never falls back to it: `src/lib/env.ts` rejects a `DATABASE_URL` that
names a superuser or owner account.

**`npm test` does not replace `npm run test:db`.** With the stack stopped the
schema tests **skip themselves** and print a note, so the ordinary suite stays
green on a machine that has never started the database — which also means a
green `npm test` is no evidence that the schema was checked at all.

`npm run test:db` removes that tolerance. It runs only the schema suite, and
fails with a clear message and a non-zero exit when:

- `DRIZZLE_TOOLING_DATABASE_URL` is unavailable;
- PostgreSQL cannot be reached;
- the schema tests would otherwise have skipped;
- zero database tests executed, or any test was skipped or failed.

It never prints the connection string. Use it before committing a schema
change, and treat it — not `npm test` — as the schema's verification gate.

---

## Seed data

`supabase/seed.sql` runs automatically at the end of `db:reset`. It is
committed, so treat it as public:

- synthetic data only — no real person, business, client or A&S Fincare record;
- no real email addresses or phone numbers (use `@example.com` and `555`-range
  numbers);
- no passwords, tokens, API keys or connection strings;
- no production UUIDs;
- deterministic, so `db:reset` produces the same state for everyone.

It is currently empty of data: no application table exists yet to seed.

---

## Troubleshooting

**`Cannot connect to the Docker daemon`** — Docker Desktop is not running.
Start it, wait for the whale icon to settle, then retry.

**A port is already in use (54321–54324, 54327)** — another Supabase project is
probably running. Find it and stop it from _its own_ directory:

```bash
docker ps --filter "label=com.supabase.cli.project"   # see which project owns it
cd /path/to/that/project && npx supabase stop
```

`supabase stop` only affects the project directory you run it from, so running
it here will not stop a different project's stack.

**First start is slow** — it downloads several hundred MB of images. Later
starts take seconds.

**No confirmation email arrives** — it never leaves your machine. Open Mailpit
at `http://127.0.0.1:54324`. Local auth is also rate-limited to 2 emails per
hour by default (`[auth.rate_limit] email_sent` in `supabase/config.toml`); if
you are testing repeatedly, `npm run db:reset` clears the local users.

**Studio returns 307** — that is a redirect, not an error. Open it in a browser.

---

## Local verification vs hosted verification

Passing locally proves the **code** works. It does not prove the deployment.

The local stack is a CLI-managed container set with its own generated keys and
a single superuser role. It is not the company's Supabase project, and it does
not exercise that project's pooler, roles, credentials, network configuration
or backups.

Still requiring company Supabase access:

- the integration-verification gate once real credentials are supplied;
- the RLS proof gate ([architecture-decisions.md §6.1](./architecture-decisions.md)) —
  checks 9 and 10 in particular name the selected transaction pooler and
  genuinely separate migration/runtime credentials, which local emulation
  cannot stand in for;
- backup and restore validation;
- anything depending on a CTO decision in specification §180.1, including the
  object-storage provider and the WhatsApp and Email providers.

Never describe a local pass as proof that production is configured correctly.

---

## Known local limitation: the stack is reachable from your network

The Supabase CLI publishes its container ports without specifying a host
address, so Docker Desktop for Mac forwards them on **all interfaces**. The
local API, database, Studio and mail UI are therefore reachable from other
machines on your network, not only from `localhost`.

This has been measured, not assumed:

- `docker inspect` reports `HostIp=0.0.0.0` for 54321, 54322, 54323, 54324 and
  54327;
- `lsof` shows `com.docker.backend` listening on `*:<port>`;
- the API answers on the machine's LAN address, and Postgres accepts a
  connection there.

### What does not fix it

Setting `{ "ip": "127.0.0.1" }` in **Settings → Docker Engine** does **not**
work on Docker Desktop for Mac. It was tried and verified: with that setting
applied and the daemon restarted, freshly created containers still bound to
`0.0.0.0`. The option configures the Linux daemon inside Docker Desktop's VM,
while the host-side forwarder (`com.docker.backend`) binds every interface
unless a port binding names an address explicitly. Supabase CLI 2.117.0 offers
no `config.toml` setting or `supabase start` flag to name one, and Docker
Desktop exposes no equivalent UI setting.

### What to do instead

- **Stop the stack when you are not using it**: `npm run db:stop`. This is the
  reliable control and costs a few seconds to restart.
- **Do not run it on an untrusted network** — a café, a client site, a
  conference. The local database has no password you chose and Studio has no
  authentication at all.
- Treat everything in the local stack as disposable. It holds only synthetic
  seed data, and `npm run db:reset` rebuilds it.

If this needs a stronger guarantee later, the options are a host firewall rule
or a Supabase CLI that lets the bind address be configured. Both are decisions
for the team rather than something this repository can set, which is why the
limitation is written down here rather than worked around silently.
