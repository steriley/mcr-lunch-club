# MCR Lunch Club: notes for agents and new contributors

Astro 7 (server output, Vercel adapter) + Vue islands + Drizzle on Postgres + Better Auth. The README has the detail; this is what you need before touching anything.

## Get a working checkout

```bash
pnpm install
pnpm db:local        # Postgres 16, databases lunch + lunch_test, migrated, 90 venues imported, a Chair seeded, .env.local written
pnpm build           # needs the database: the public pages are prerendered from it
pnpm check:built     # browser smoke test of the real build output
```

- `pnpm db:local` is idempotent and never overwrites an existing `.env.local`. It uses installed Postgres binaries (the cloud container has no Docker); `pnpm db:local -- --docker` uses `docker-compose.yml` instead.
- **The build reads the database.** Without `pnpm db:local` first, `pnpm build` fails or builds a site with no venues.
- Local Chair: `chair@lunch.test` / `local-chair-password` (local-only, from `.env.local`).

## Verify against the build, not `pnpm dev`

- The Content-Security-Policy exists only in built output. `pnpm dev` does not apply it, so a CSP bug never shows there. Verify with `pnpm build && pnpm check:built`.
- `astro preview` does not work with the Vercel adapter. `pnpm serve:build` serves `.vercel/output` (static files plus the built function) and is what `check:built` drives.
- Sign in locally through `pnpm serve:build` or `pnpm dev`, and **on the port in `BETTER_AUTH_URL`** (default 4321). Any other origin fails with `Invalid origin`.
- `pnpm check:built` fails on any `securitypolicyviolation` event or uncaught page error. Chromium does not log CSP violations to the console, so listen for the DOM event (`e2e/fixtures.ts`).
- `SMOKE_BASE_URL=https://… pnpm check:built` tests a deployment instead (see README, "Smoke test a Preview").

## Rules that are easy to break

- **CSP.** Astro hashes `is:inline` scripts only on prerendered pages. On-demand pages (sign-in, the Chairs' Area) send their policy before a component can add a hash, so an inline script there needs its hash in `astro.config.mjs` (see `src/lib/theme-script.ts`). Any new third-party script, style, image or API host goes in `security.csp` in `astro.config.mjs`. The Chairs' Area adds `'wasm-unsafe-eval'` for the WebP encoder and sets Zod `jitless` (no eval probe); keep both.
- **Tiers.** `venues.tier` changes only through two-Chair proposals (`src/lib/tier-proposals.ts`), never through `venueInputSchema` or an admin edit. The one exception is `pnpm db:import`, the bootstrap path, which sets the tier of *new* venues; `--update` leaves existing tiers alone and `--update-tiers` is the explicit opt-in. A venue with no tier is hidden.
- Domain modules in `src/lib` never import `admin-api` or `auth` (`src/test/layering.test.ts`).

## Before you push

```bash
pnpm test && pnpm typecheck && pnpm test:db     # test:db reads TEST_DATABASE_URL from .env.local
pnpm build && pnpm check:bundle && pnpm check:built
```

CI runs the same sequence (`.github/workflows/ci.yml`). Playwright is pinned to the version whose Chromium the cloud container already has; bump it deliberately.
