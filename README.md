# Limenzy CRM

A lightweight multi-tenant SaaS CRM for small businesses: leads, customers,
follow-ups, renewals and WhatsApp communication.

**Status: Milestone 1A — project foundation and visual app shell.**
There is no authentication, database, or business functionality yet. Screens for
unbuilt modules say so explicitly rather than showing placeholder data.

## Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

Requires **Node >= 20.19**. See `docs/architecture-decisions.md` §8 for why the
toolchain is pinned below some current majors on Node 20.

## Scripts

| Script               | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `npm run dev`        | Development server                          |
| `npm run build`      | Production build                            |
| `npm run start`      | Serve the production build                  |
| `npm run lint`       | ESLint                                      |
| `npm run typecheck`  | `next typegen` then `tsc --noEmit` (strict) |
| `npm run test`       | Vitest                                      |
| `npm run test:watch` | Vitest in watch mode                        |
| `npm run format`     | Prettier write                              |
| `npm run verify`     | lint → typecheck → test → build             |

`typecheck` runs `next typegen` first because Next.js 16 generates the global
route types (`LayoutProps`, `PageProps`) that the app relies on.

## Layout

```
brand/           Approved logo assets (source of truth — do not edit)
design/          Approved dashboard visual references
docs/            Specification + architecture decisions + build plan
public/brand/    Logos served to the browser (copies of brand/)
src/
  app/           App Router. (app) route group = the authenticated shell
  components/
    app-shell/   Sidebar, top bar, drawer, mobile bottom bar
    brand/       Logo
    data/        Status badge, empty state, placeholders
    theme/       next-themes provider and theme control
    ui/          shadcn/ui primitives (Radix)
  config/        navigation.ts — the single navigation source of truth
  lib/           Shared utilities
  test/          Test setup and cross-cutting tests
```

## Key conventions

- **Navigation comes from one typed config**, `src/config/navigation.ts`.
  Desktop sidebar, tablet drawer and mobile bottom bar all derive from it.
- **No hard-coded theme colours in components.** Everything resolves to the
  semantic tokens in `src/app/globals.css`. Enforced by
  `src/test/design-tokens.test.ts`.
- **Three surface tiers** — `.surface-glass` (navigation, summary surfaces,
  selected emphasis), `.surface-elevated` (section panels), `.surface-solid`
  (tables, forms, dialogs, menus — opaque, no blur).
- **The ambient gradient is painted once** by the app shell (`.app-ambient`).
  Components never carry their own gradient.
- **Status never depends on colour alone** — `StatusBadge` always pairs an icon
  and a text label with the colour.
- **Light and dark are the same layout.** Switching themes changes token values
  only; a test asserts the dark theme introduces no token the light theme lacks.

`/design-preview` is an internal reference page for checking tokens, surface
tiers and status treatments in both themes. It is not linked from the navigation
and contains no business data.

## Documentation

- [`docs/CRM_SaaS_Product_Spec_V1.md`](docs/CRM_SaaS_Product_Spec_V1.md) —
  authoritative functional specification (180 sections)
- [`docs/architecture-decisions.md`](docs/architecture-decisions.md) — approved
  decisions, interpretations, verified version constraints
- [`docs/build-plan.md`](docs/build-plan.md) — milestone sequence
