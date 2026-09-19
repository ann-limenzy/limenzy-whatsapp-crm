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

| Command              | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `npm run db:start`   | Starts the local Supabase stack                                  |
| `npm run db:status`  | Shows service status and local URLs and keys                     |
| `npm run db:stop`    | Stops the stack, preserving local data                           |
| `npm run db:reset`   | **Destroys local data**, replays migrations, re-runs the seed    |
| `npm run db:migrate` | Applies pending migrations to the local database                 |
| `npm run test:db`    | Runs the live schema tests; fails if the database is unavailable |

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
npm run test:db
npm run db:stop
```

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
