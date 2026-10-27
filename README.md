# MCR Lunch Club — The Chairs' Official Ledger 🏛️⚖️

> *"A map of Manchester where every pin is a verdict. Formal, a bit pompous, and actually useful at 11:59 when someone asks 'where are we going?'"*

Welcome to the official repository of the **Manchester Lunch Club Map App**.

---

## 🏛️ Concept & Articles of Governance

- **The Base Datum**: Crown Square / Hardman Square, Spinningfields (`53.478997°N, -2.252024°W`).
- **Walking-Time Rings**: 5, 10, 15, 20, and 25-minute pedestrian rings and the 2.5-mile boundary, in one quiet grey with their minutes printed on the ring. A switch under the map's zoom buttons hides them, and the choice is remembered.
- **The 2.5-Mile Boundary**: Delineates the maximum authorized perimeter for civilized municipal dining (with Butty's Booth and Rusholme Chippy marking the frontier at 2.2 miles).
- **The Sacred Two-Visit Rule**: No venue may enter **Approved** on a single visit. Two distinct, satisfactory audits conducted under peak duress are required.
- **The Guillotine Clause**: A single sub-par inspection triggers swift demotion to **Rejected** or **If We Must**.
- **No Member Voting**: The Chairs maintain impartial authority. Members may petition and suggest, but verdicts belong strictly to the tribunal.
- **The Hall of Shame**: Incorruptible register tracking attempted bribery (e.g. unsolicited chicken tenders or illicit cold San Pellegrino cans).

---

## 🛠️ Architecture

Built on **Astro 7** on Vercel (functions in `lhr1`, next to the Neon database in London) with targeted **Vue 3 islands** hydrated only where interactive client state is required. Venue and Hall of Shame content lives in **Neon Postgres** and is edited by the Chairs in the admin area (`/admin`); public pages only show venues that pass the visibility rule in `src/lib/visibility.ts` (an approved tier and a location).

The public pages are **prerendered**: they read the database when the site is built and are served as static files, so visitors never wait on Neon. Admin saves that change what the public sees (each `adminRoute` declares `publishes`) call a Vercel Deploy Hook (`src/lib/rebuild.ts`), and the change is live once that build finishes, usually within two minutes. A Vercel Cron job rebuilds the site on Wednesday evenings for the new weekly bulletin (`src/pages/api/cron/weekly-bulletin.ts`). Only the Chairs' Area, `/api/*` and the sign-in page run on demand.

Every public page carries a canonical URL and Open Graph / Twitter card tags (`src/layouts/Layout.astro`), so links shared in a chat show a preview: venue pages use their photo, everything else `public/brand/og-default.png`. Venue pages also carry schema.org `Restaurant` JSON-LD (`src/lib/structured-data.ts`) for search results, and `public/manifest.webmanifest` lets the site be added to a phone's home screen, with Where to today? and Near Me as shortcuts. `@astrojs/sitemap` writes `/sitemap-index.xml` at build time, and `vercel.json` sets the security headers (`nosniff`, no framing, referrer and permissions policies; geolocation stays allowed for Near Me).
- **Content-Security-Policy**: `security.csp` in `astro.config.mjs`. Astro hashes every script and style it emits, so an injected inline script won't run; images may come only from the site, CARTO tiles and Vercel Blob, and fonts from Google Fonts. Prerendered pages carry it as a `<meta>` tag, on-demand pages as a header. Inline `style` attributes are allowed (Vue renders tier colours with them). The theme script's hash is added from `src/lib/theme-script.ts`, the Chairs' Area adds `'wasm-unsafe-eval'` for the WebP encoder and turns off Zod's eval probe (`AdminLayout.astro`), and `frame-ancestors` stays in `vercel.json` because a `<meta>` policy cannot set it. A new third-party script, image host or API needs adding there, and CSP is not applied by `pnpm dev`: check with `pnpm build` and the browser console.

- **Pages (`.astro`)**:
  - `/` — The interactive Leaflet Ledger Map
  - `/venues/[slug]` — Dossiers for every public establishment
  - `/verdicts/[tier]` — Registry verdicts (the old `/tiers/…` URLs redirect here) (`approved`, `under-consideration`, `to-be-assessed`, `if-we-must`, `rejected`, `gone-but-not-forgotten`)
  - `/hall-of-shame` — The Bribery & Improper Benefit Attempt Record
  - `/manifesto` — The Constitutional Articles of Governance
  - `/inspections` — The Complete Chronological Audit Log: every confirmed inspection (dual-verified or legacy) of a public venue
  - `/api/suggestions` — Public "Suggest a Venue" endpoint (same-origin only, rate limited)
  - `/api/weather/[step]` — Weather forecast for the home page card
  - `/api/cron/weekly-bulletin` — Vercel Cron: rebuilds the site when the Wednesday bulletin goes out
  - `/admin/*` — The Chairs' Area (sign-in required; see below)
- **Styles**: the public site and the Chairs' Area each have their own stylesheet (`src/styles/global.css`, `src/styles/admin.css`), and Tailwind scans only that side's files, so visitors never download admin styles. Both import `theme.css` (the colour tokens) and `map.css`. A new admin component goes in `src/components/admin/`; a new public page directory is picked up by `global.css` automatically.
- **Dark mode**: `ThemeScript.astro` (in both layouts' `<head>`) sets `data-theme` on `<html>` before the page paints, from the visitor's saved choice or their system setting, and keeps following the system (and other tabs) while nothing is saved; `ThemeToggle.astro` (a Light / System / Dark switch in both footers) saves the choice, with System clearing it, and fires `mcr:themechange` (`src/lib/theme.ts`). The dark palette is the `:root[data-theme="dark"]` block in `theme.css`. Tokens ending `-fixed` (and `surface`, the `*-ink` text tokens) exist so brand fills and the text on them stay put while surfaces and text flip; Leaflet path colours go through `themeColor()`, and tile layers swap to CARTO Dark Matter on their own.
- **Vue 3 Islands (`src/components/islands/`)**:
  - `LunchMap.vue` (`client:load`) — Leaflet map with tier pins, walking rings (thin and grey, labelled on the ring, with a remembered on/off switch), and the 2.5-mile boundary. Leaflet starts once the browser is idle (a grey box until then), or straight away for a `/?venue=` link. Each pin carries its tier's glyph (`glyph` in `src/lib/tiers.ts`) as well as its colour, so tier reads without colour. Pins that would touch merge into clusters (`src/lib/map/clusters.ts`: a ring split by tier share, tap or Enter to zoom; venues sharing a building fan out at street level), and the map frames every venue the filters match (`src/lib/map/framing.ts`), reframing after a filter change only if a match is off screen. From zoom 16 each pin's name and price sit beside it (`src/lib/map/labels.ts`: Approved first, then nearest to Base; a name that would touch a pin, a cluster or another name is left out), and any pin shows its name on hover or keyboard focus at any zoom. The button under the zoom buttons resets the view; a filter that matches nothing says so, with a Reset filters button. Keyboard: Tab follows the markers top to bottom, Enter or Space on a pin moves focus into its card and Escape returns it to the pin, and a "Skip the map" link goes straight to the list.
  - `VenueResults.vue` (`client:idle`) — Every venue the filters match, as a list that stays in step with the map (sort by nearest, name or last inspected). It is the "All venues" tab on the bench beside the map on wide screens, and a "56 venues · Show list" disclosure under the map on a phone; it renders in one place only, and works if the map never loads. Picking a row flies the map to its pin and shows the card; picking a pin selects and scrolls to its row; hovering or focusing a row lights up its pin (`src/stores/results.ts` carries the selection, hover and sort between them).
  - `BenchTabs.vue` (`client:load`) — The bench's two tabs, The Golden Cut and All venues, as an ARIA tab list that switches the server-rendered panels beside it.
  - `FilterBar.vue` (`client:load`) — Search, tier badges, cost (`£`/`££`/`£££`), walking time slider, and recency filter.
  - `NearMeMap.vue` — Full-screen "Near Me" mode ranking venues by distance from the user. Loaded by `NearMeLoader.vue` (`client:only`) the first time Near Me opens (or for a `#near-me` link), and prefetched once the page is idle. Its pieces live in `islands/near-me/` (status banner, location notice, map controls, collapsed summary, venue list, plus the `useNearMeLeaflet`, `useBottomSheet` and `useNearMeHistory` composables); the pure rules (status banner priority, sheet heights, price filter, focus trap) are in `src/lib/near-me/` with their tests.
  - `WhereToday.vue` (`client:idle`) — The 11:59 decision oracle and stalemate resolver.
  - `SuggestModal.vue` (`client:idle`) — Member petition form; suggestions go to the Chairs' Area inbox (`/admin/suggestions`), never straight onto the site.
- **State Management**:
  - `nanostores` with `@nanostores/vue` for cross-island reactive filtering and modal state.
  - `src/stores/ledger.ts` holds the public venues and confirmed inspections the server embeds in the page (`LedgerCanon.astro`).
- **Data Validation**:
  - Zod schemas in `src/lib/venue-schema.ts`, `src/lib/bribery-schema.ts`, `src/lib/suggestion-schema.ts` and `src/lib/user-schema.ts`, shared by the APIs and the forms.
- **Shared modules** (one place for each rule):
  - `src/lib/tiers.ts` — every per-tier fact (label, URL slug, colours, banner, mottos, rule), keyed by the stored value.
  - `src/lib/venues.ts` — the venue store: `updateVenue()` writes a venue row and its revision in one transaction; `saveVenue()` and `rerouteVenue()` add the slug check and the ORS walking route.
  - `src/lib/admin-api.ts` — `adminRoute(spec, handler)` wraps every `/api/admin` handler (session, role, ban, origin, params, body, error mapping). `src/test/routes/admin-auth.test.ts` calls every admin route signed out, as a non-admin, as a banned admin and from a foreign origin.
  - `src/lib/api-fetch.ts` — `apiFetch()`, the browser side of the `{ error, fields }` error shape, used by the islands.
  - `src/lib/roles.ts` — who counts as an active Chair; shared by sign-in, `requireAdmin` and the two-Chair counts.
  - Domain modules in `src/lib` never import `admin-api` or `auth` (`src/test/layering.test.ts`). Islands may use `import type` from server modules; `pnpm check:bundle` inspects the real built output.

---

## 🚀 Getting Started

```bash
pnpm install
pnpm db:local                # local Postgres 16 + migrated, imported database + a Chair + .env.local
pnpm dev                     # http://localhost:4321
pnpm build                   # production build (Vercel output); reads the database
pnpm serve:build             # serve that build locally (static pages + the built function, CSP included)
pnpm check:built             # browser smoke test of the build: CSP violations, page errors, sign-in
pnpm test                    # unit tests
pnpm typecheck               # astro check + vue-tsc
pnpm test:db                 # database integration tests (TEST_DATABASE_URL comes from .env.local)
```

`pnpm db:local` needs installed Postgres 16 binaries, or Docker with `pnpm db:local -- --docker`.
To use your own database instead (a Neon branch, say), copy `.env.example` to `.env.local` and fill it in;
see "Admin setup". More in [CLAUDE.md](CLAUDE.md).

### Local environment

`pnpm db:local` is safe to run again. It:

1. starts Postgres 16 on `127.0.0.1:5432` (`LUNCH_PGPORT` to change). With installed binaries the data lives in
   `$XDG_DATA_HOME/mcr-lunch-club/pgdata` (`~/.local/share/...`; `/var/lib/postgresql/mcr-lunch-club` when run as root,
   as in the cloud container), or set `LUNCH_PGDATA`. With `--docker` it uses the `mcr-lunch-club-pgdata` volume;
2. creates the `lunch` (dev) and `lunch_test` (integration tests) databases;
3. migrates `lunch`, imports the venues and bribery record (tiers included, so every venue is public) and seeds a Chair,
   always against the local database whatever `.env.local` says;
4. writes `.env.local` with the local `DATABASE_URL`, `TEST_DATABASE_URL`, auth settings and Chair, unless one already exists
   (it then just prints the URLs).

The local Chair is `chair@lunch.test` / `local-chair-password` (override with `SEED_CHAIR_EMAIL` / `SEED_CHAIR_PASSWORD`).
These are local-only credentials; never reuse them anywhere real.

### Smoke test the build (`pnpm check:built`)

Playwright drives the built site (`pnpm build` first; it starts `pnpm serve:build` itself, or reuses one already running).
It visits every public page type, uses the map, theme toggle, Where to today?, Near Me (location granted) and the suggest
form, signs in as the seeded Chair, loads every Chairs' Area page and runs the WebP encoder. It fails on any
`securitypolicyviolation` event or uncaught page error, and asserts that injected inline `<script>` / `<style>` are
blocked, WebAssembly is blocked on public pages and allowed in the Chairs' Area, and venue JSON-LD parses.

First time on a laptop: `pnpm exec playwright install chromium`.

Prerendered pages hash their own inline scripts (Astro does it), so an unhashed inline script is caught on the
on-demand pages: sign-in and the Chairs' Area (the theme-script and Zod bugs fixed in #50 were both of that kind).

#### Smoke test a Preview

`SMOKE_BASE_URL=https://<preview-url> SMOKE_CHAIR_EMAIL=… SMOKE_CHAIR_PASSWORD=… pnpm check:built` runs the same checks
against a deployment. The suggest request is always stubbed (it is rate-limited per sender, and a smoke test shouldn't file petitions). Behind Deployment
Protection also set `VERCEL_AUTOMATION_BYPASS_SECRET`. Previews copy production data, including Chairs, so use a dedicated
smoke-test Chair that exists in production; the test only reads and signs in (the photo upload is stubbed).

`.github/workflows/preview-smoke.yml` does this automatically for every successful Preview deployment. It is
**off until you opt in**: add the secrets `SMOKE_CHAIR_EMAIL`, `SMOKE_CHAIR_PASSWORD` and
`VERCEL_AUTOMATION_BYPASS_SECRET`, then set the repository variable `PREVIEW_SMOKE_ENABLED` to `true`.

---

## Admin setup

The Chairs' Area lives at `/admin`. Authentication is Better Auth (email and
password, **no public sign-up**), data is Neon Postgres through Drizzle ORM, and
venue photos go to Vercel Blob. The section name ("Chairs' Area") is set once in
`src/lib/admin-config.ts`.

### Environment variables

Copy `.env.example` to `.env.local` locally. On Vercel, keep the Neon
integration's variable names and add the rest in **Project → Settings →
Environment Variables**. Never commit real values.

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` | Pooled Neon connection (host contains `-pooler`) used by the running site. Set by the Vercel–Neon integration. |
| `DATABASE_URL_UNPOOLED` | Direct Neon connection for migrations and scripts; falls back to `DATABASE_URL`. |
| `DATABASE_DRIVER` | `pg` (default, node-postgres over TCP, supports transactions). Set `neon-http` only where outbound Postgres connections (port 5432) are blocked, e.g. a sandboxed cloud dev environment; it sends queries over HTTPS and has no transactions. |
| `BETTER_AUTH_SECRET` | Signing/encryption secret, at least 32 characters (`openssl rand -base64 32`). Different per environment. |
| `BETTER_AUTH_URL` | Main site origin: `http://localhost:4321` locally, `https://mcrlunchclub.com` on Vercel Production. Not needed for Preview, which uses its own Vercel URL. See *Signing in on more than one domain* below. |
| `BETTER_AUTH_ALLOWED_HOSTS` | Optional, comma-separated: extra hosts the Chairs' Area works on, e.g. the production `mcr-lunch-club.vercel.app` alias. |
| `PRODUCTION_DATABASE_HOST` | Preview builds: the production Neon host (e.g. `ep-calm-river-123456.eu-west-2.aws.neon.tech`, pooled or direct). Preview builds refuse to migrate a database on that endpoint. See *Preview deployments* below. |
| `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID` | Vercel Blob credentials for venue photo uploads. Connecting a Blob store to the project adds one or the other: older stores set the token, newer stores set `BLOB_STORE_ID` and authenticate with the deployment's OIDC token (no secret to manage). Either works; without both the photo section is read-only. Server-only: `pnpm check:bundle` fails if it reaches the browser bundle. |
| `SEED_CHAIR_EMAIL` / `SEED_CHAIR_NAME` / `SEED_CHAIR_PASSWORD` | Only for `pnpm db:seed`. Remove them from your machine afterwards. |
| `ORS_API_KEY` | [OpenRouteService](https://openrouteservice.org) key, **server-only** (never prefix it with `PUBLIC_`). Powers the admin venue location search and the walking distance and time from HQ. Without it venues still save, but the location must be entered manually and routes stay "pending". `OPENROUTESERVICE_API_KEY` is accepted as an alternative name. Free Standard plan: 2,000 directions a day (40 a minute); Matrix has its own lower daily quota. Visitors never trigger requests, only admin saves and the backfill. |
| `METOFFICE_API_KEY`, `PUBLIC_MAP_API_KEY` | Optional weather and map tile keys. |
| `DEPLOY_HOOK_URL` | **Production only.** A Vercel Deploy Hook for `main` (**Settings → Git → Deploy Hooks**). Admin saves POST to it so the prerendered public pages pick up the change. Unset, saves still work but the public site only changes on the next deploy. Treat the URL as a secret. Never set it for Preview: a preview save would rebuild production. |
| `CRON_SECRET` | **Production only.** Random string (`openssl rand -hex 32`). Vercel Cron sends it to `/api/cron/weekly-bulletin`, which refuses requests without it. |

### Local development with a Neon branch

Use a Neon **branch** so local work never touches production data:

1. In the Neon console open the project, go to **Branches → New branch**,
   branch from `main` (or "schema only" for an empty copy) and name it e.g. `dev`.
2. Copy the branch's pooled and direct connection strings into `.env.local`
   as `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. Run `pnpm db:migrate`, then `pnpm db:seed` to create your Chair, then
   `pnpm db:import` if the branch has no content yet.

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm db:generate` | Generate a migration in `drizzle/` after changing `src/db/schema.ts`. Commit it. |
| `pnpm db:migrate` | Apply committed migrations (uses `DATABASE_URL_UNPOOLED`). |
| `pnpm db:migrate:deploy` | Runs in the Vercel build after the tests and before `pnpm build` (which reads the database). Production builds migrate production; Preview builds migrate their own Neon branch; anywhere else it does nothing. |
| `pnpm db:studio` | Open Drizzle Studio. |
| `pnpm db:seed` | Create (or re-promote) the first Chair from `SEED_CHAIR_*`. Idempotent; refuses to run with `NODE_ENV=production` unless `--force` is passed. `--reset-password` resets an existing Chair's password. Prints the email only. |
| `pnpm db:local` | One-command local database: see *Local environment* above. |
| `pnpm serve:build` | Serve the build output (`.vercel/output`) locally on the port of `BETTER_AUTH_URL`: prerendered pages from disk, everything else through the built function. |
| `pnpm check:built` | Playwright smoke test of the build: see *Smoke test the build* above. |
| `pnpm db:import` | Import `src/data/venues.json` and `src/data/incidents.json`. Idempotent (venues match on slug, records on title + date); existing rows are left alone. New venues get their tier from the file, so they are public at once. `--dry-run` reports without writing; `--update` overwrites existing venues' details but never their tier (tiers change only through two-Chair proposals); `--update-tiers` also overwrites tiers, bypassing that rule, so use it deliberately. |
| `pnpm auth:generate` | Regenerate `src/db/auth-schema.ts` with the Better Auth CLI matching the installed version. Follow with `pnpm db:generate`. |
| `pnpm routes:backfill` | Replace distance and walking time with ORS walking routes for venues that have coordinates but no ORS route yet (the old straight-line estimates). Uses ORS Matrix, 25 venues per request, falling back to one Directions request per venue; throttled (`--delay-ms=2000`), resumable, stops cleanly on a rate limit. `--dry-run` lists venues without calling ORS; `--all` recomputes every venue; `--no-matrix` skips Matrix. Needs `ORS_API_KEY`. |
| `pnpm inspections:import-legacy` | One-off: import the corrected inspection dates in `drizzle/data/legacy-inspections.json` as legacy inspections and rebuild every venue's "last inspected" date. Venues not on the list lose their old date unless `--keep-unlisted` is passed. Aborts if any name cannot be matched; idempotent; `--dry-run` shows the changes first. |
| `pnpm inspections:backfill-verified` | One-off: add the dual-verified inspections in `drizzle/data/verified-inspections-backfill.json` (dated tier moves from the Chairs' audit trail, with outcome and both Chairs) to venues that have no confirmed inspection yet, and update their "last inspected" date. Venues already inspected are skipped, so it is idempotent; aborts if a venue or Chair cannot be found; `--dry-run` shows the changes first. Rebuild the site afterwards. |
| `pnpm test:db` | Integration tests for the transactional rules (inspections, proposals) against `TEST_DATABASE_URL`, a throwaway **local** database whose name contains `test` (tables are truncated). |
| `pnpm check:bundle` | After `pnpm build`: fail if the browser bundle contains `ORS_API_KEY` (name or value) or calls ORS directly. |
| `pnpm check:security [url]` | Check that every `/admin` page and `/api/admin` route refuses anonymous and cross-origin requests, and that sign-up is disabled. Defaults to `http://localhost:4321`; pass the production URL after a deploy. |

### Deploying to Vercel (runbook)

1. **Database**: add Neon from the Vercel Marketplace to the project so
   `DATABASE_URL` / `DATABASE_URL_UNPOOLED` are provisioned.
2. **Env vars**: set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` (the production
   domain) for Production, plus `BETTER_AUTH_ALLOWED_HOSTS` if you use the
   `vercel.app` address too. For Preview set a different `BETTER_AUTH_SECRET`
   and `PRODUCTION_DATABASE_HOST` (see *Preview deployments* below).
3. **Blob (optional)**: create a Blob store under **Storage** and connect it to
   the project, which adds `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` (Production and Preview).
   Keys are prefixed `prod/`, `preview/` or `dev/` by environment, so local and
   preview uploads never mix with production. Mind the Hobby plan's Blob limit:
   going over loses access to Blob rather than billing.
4. **Migrations run automatically** in every Vercel build
   (`pnpm db:migrate:deploy && pnpm build`), before the build, which reads the
   database to prerender the public pages:
   - **Production** (merging to `main`) migrates the production database before
     the new deployment goes live.
   - **Preview** migrates that preview's own Neon branch (see below).

   The old deployment keeps serving while the new one builds after the
   migration (and for good if that build fails), so keep migrations backwards
   compatible: add columns and tables first, and remove old ones in a later
   pull request once no deployed code uses them. Instant Rollback in Vercel
   rolls back code, and the public pages as they were when that deployment was
   built, but not the schema. To migrate by hand, e.g. the first time:
   ```bash
   DATABASE_URL_UNPOOLED='<production direct url>' pnpm db:migrate
   ```
5. **Rebuilds** (once): create a Deploy Hook for `main` under **Settings →
   Git → Deploy Hooks** and save its URL as `DEPLOY_HOOK_URL`, and set
   `CRON_SECRET`, both for Production only. Then redeploy. The Wednesday
   cron in `vercel.json` runs at 18:00 UTC, at or after the bulletin's 18:00
   London issue time all year.
6. **First Chair** (once): with production env vars set locally,
   ```bash
   NODE_ENV=production SEED_CHAIR_EMAIL=… SEED_CHAIR_NAME=… SEED_CHAIR_PASSWORD=… pnpm db:seed --force
   ```
   then delete the `SEED_CHAIR_*` values from that machine. Add further Chairs
   from **Chairs' Area → Users**.
7. **Content** (once, if the database is empty): `pnpm db:import`.
8. **Verify**: `pnpm check:security https://<your-domain>`.
9. **CI** (once): the tests no longer run inside the Vercel build, so a Deploy
   Hook rebuild doesn't re-test an unchanged commit. `.github/workflows/ci.yml`
   runs them on every pull request and push to `main` instead: unit tests,
   typecheck, the database integration tests against a Postgres service, a
   build and `pnpm check:bundle`. In **GitHub → Settings → Branches**, protect
   `main` and make **checks** (the CI workflow's job) a required status check, so nothing reaches
   production (or its database migrations) untested.

### Preview deployments (a Neon branch per pull request)

Every pull request gets a Vercel Preview deployment with its own Neon branch,
`preview/<git-branch>`, copied from production when the branch is first
deployed. Changes made on a preview (signing in, editing venues) never touch
production, and the preview build applies the pull request's migrations to its
branch so the schema matches the code.

One-off setup:

1. **Turn on Preview branching** in the Neon integration. Vercel-managed
   (Marketplace) integration: **Vercel → Storage → your database → Settings /
   Connect Project**, tick **Preview** under *Deployments Configuration*, and
   turn on **Resource must be active before deployment** so the build waits for
   the branch. Neon-managed integration: **Neon Console → Integrations → Vercel →
   Manage** and enable preview branches (and *Automatically delete obsolete Neon
   branches*). The branch's `DATABASE_URL` / `DATABASE_URL_UNPOOLED` are
   injected into that deployment only, so they never show in Vercel's
   environment variable settings.
2. **Vercel → Settings → Environment Variables, Preview environment**:
   - `BETTER_AUTH_SECRET`: a different secret from production. Production
     sessions don't carry over; sign in again on the preview with your normal
     Chair details (they are copied with the data).
   - `PRODUCTION_DATABASE_HOST`: the production Neon host, from the production
     `DATABASE_URL`. This is the safety catch: if Preview branching is ever off,
     the preview build sees the production database, and `pnpm db:migrate:deploy`
     fails the build rather than apply an unmerged migration to production.
   - `BETTER_AUTH_URL` is not needed; previews use `VERCEL_BRANCH_URL` /
     `VERCEL_URL` and allow both. Keep **Automatically expose System
     Environment Variables** on (the default).
3. **Deployment Protection** stays on as normal; sign in to Vercel to view a
   preview.

Notes:

- The branch is created from production the first time a git branch deploys and
  reused for later pushes, so it keeps any data you add on the preview. Delete
  the `preview/<git-branch>` branch in the Neon Console to start afresh on the
  next deployment.
- Merging the pull request migrates production automatically in the
  production build; the preview branch is not merged back, only the code is.
- Vercel-managed integration: preview branches are removed when their
  deployments are (6 months by default). Delete old ones in the Neon Console if
  you get near the branch limit.

### Signing in on more than one domain

Better Auth works out its URL from each request's host, from an allow-list, so
the Chairs' Area works on `mcrlunchclub.com` and on the Vercel addresses at the
same time. On Production the list is the `BETTER_AUTH_URL` host, the project's
production domain and the deployment's own Vercel URLs, plus anything in
`BETTER_AUTH_ALLOWED_HOSTS`. To use the production `*.vercel.app` alias, add it
there, e.g. `BETTER_AUTH_ALLOWED_HOSTS=mcr-lunch-club.vercel.app` (comma-separate
several). Avoid a bare `*.vercel.app` wildcard: every allowed host is also a
trusted origin, and anyone can deploy to `vercel.app`.

Sign-in cookies belong to one host, so signing in on `mcrlunchclub.com` does
not sign you in on the `vercel.app` address; sign in on each separately.

### Operating notes

- **Chairs**: create accounts, deactivate (ban) them and set temporary
  passwords from `/admin/users`. Deactivating signs the user out everywhere.
  There is no email sending, so share initial/temporary passwords securely.
  Chairs change their own password and sign out other devices at `/admin/account`.
- **Suggestions**: the public "Suggest a Venue" form stores petitions in the
  database for review at `/admin/suggestions`. **Accept…** opens the new-venue
  form prefilled with the name and cost band only: the suggested address just
  seeds the location search (a real location must be picked or entered), and
  the suggested cuisine, order and reasons are shown for reference. Saving
  creates a hidden venue with a To Be Assessed proposal for a different Chair
  to approve, and marks the suggestion accepted; leaving the form changes
  nothing. The form is
  limited to 3 per sender per hour and 50 a day overall; senders' IPs are only
  kept as a keyed hash for that limit.
- **Visibility**: there is no publish toggle. A venue is public when it has an
  approved tier and coordinates (`src/lib/visibility.ts`); the admin list labels
  hidden venues with the reason. Hidden Hall of Shame records never appear
  publicly. Every venue save stores a snapshot, viewable from the venue's
  **History** page.
- **Location**: the venue form searches OpenRouteService (up to five results
  around Greater Manchester) and fills the address and coordinates from the
  pick; "Enter manually" is there for when search finds nothing (UK
  coordinates only). Distance and walking time are always worked out on the
  server from an ORS foot-walking route from HQ, never typed in. If ORS is
  down or rate limited the venue still saves: without coordinates it is
  hidden ("Needs location"); with coordinates but no route it shows, listed
  last, with a "Route pending" badge and a **Retry** button. Values from
  before ORS routing are labelled "Estimated, not routed" until the backfill
  or **Re-route** replaces them; saving such a venue also tries to route it,
  keeping the estimate if ORS is unavailable. Routed times are credited to
  openrouteservice.org and OpenStreetMap in the site footer. Near Me and the
  map's walking rings stay straight-line at one shared pace, 80 m a minute
  (`WALKING_METRES_PER_MINUTE` in `src/lib/map/config.ts`).
- **Tier changes need two Chairs**: a venue's tier is never edited directly.
  Any Chair proposes a change from the venue page (a new venue's form takes a
  "Proposed tier"); a **different** Chair approves or declines it from the
  venue page or **Pending** (`/admin/pending`). Declining needs a reason,
  which is internal and never public. One pending proposal per venue: only
  its proposer can withdraw or replace it. Until approval the public site
  keeps the last approved tier, and a new venue stays hidden. Moving a venue
  into Approved needs a dual-verified inspection. With only one active Chair
  nothing can be approved; there is no override. No notifications are sent.
  (`pnpm db:import` still seeds tiers directly, for bootstrapping an empty
  database only.)
- **Inspections**: a venue's "last inspected" date can't be typed in. Each
  Chair presses **Visited today** on the venue's page; an inspection counts
  once two different Chairs press it on the same UK calendar day (server
  clock, `Europe/London`). The first Chair also says how it went,
  **Satisfactory** or **Below par**; the second Chair cosigns that outcome and
  cannot choose a different one. A lone press lapses at midnight. The page lists the
  inspection history: "Verified by A and B, below par" or legacy records imported from
  the Chairs' old records (which show as "last inspected", have no outcome,
  and never count as verified). Deactivated Chairs can't press it.
  Public pages (`/inspections`, venue pages, the home page) show the same
  confirmed records; pending and lapsed presses never appear.
- **The Golden Cut**: up to five Approved venues the Chairs pick for the top
  of the home page, edited at `/admin/golden-cut` (drag or use the arrows to
  reorder, then save; any Chair, no countersign). #01 gets the hero card and
  its puff piece in full; #02 to #05 show a short hook. Blank text falls back
  to the venue's pull quote and lunch special. A venue that leaves Approved,
  closes or loses its location drops off the home page (the next one moves
  up) and is flagged in the editor. With nothing picked, the home page shows
  the five nearest Approved venues instead.
- **Permanently closed**: a flag, not a tier. Any Chair can mark a venue
  closed (with a confirmation) or reopen it from its edit page; no second
  Chair is needed, and both are logged on the **History** page. Closed venues
  never appear on the map or in Near Me. A closed venue whose tier is Gone But
  Not Forgotten stays on that tier page and its own page, labelled
  "Permanently closed"; any other closed venue is hidden (its page 404s).
- **Public ordering**: tiers are listed in the order of the filter chips
  (Approved, Under Consideration, To Be Assessed, If We Must, Rejected, Gone But
  Not Forgotten; `TIERS` in `src/lib/tiers.ts`). Within a tier, venues are
  listed by walking time (unknown times last), then name; Rejected and Gone But
  Not Forgotten are alphabetical (`src/lib/venue-order.ts`).
- **Security**: sessions last 7 days with daily sliding refresh (`SESSION_SETTINGS`
  in `src/lib/auth-config.ts`). Sign-in is limited to 5 attempts per minute per
  IP, stored in the database so it holds across serverless invocations. Admin
  pages send `Cache-Control: no-store` and `noindex`; admin API writes must come
  from the site's own origin.
- **Venue photos** (`venue_images`): up to 5 per venue, added from the venue's
  edit page (not the create form) and applied immediately, separately from the
  form's Save button. Any Chair can add, delete, caption, set the focal point
  or change the primary photo; adds, removals and primary changes are logged in
  the venue history as text. The browser converts each photo to two WebP files
  (1600px at quality 80, stepping down to 65 then 50 if it exceeds 800 KB, and 640px at quality 75; constants in
  `src/lib/image-upload.ts`) with `@jsquash/webp`, one photo at a time, which
  strips EXIF/GPS. There is no unoptimised fallback: a format the browser cannot
  read (e.g. HEIC on desktop Chrome or Firefox) shows an error with Retry. The
  server re-checks both files really are WebP and within 800 KB / 1600px and
  150 KB / 640px. The public site shows only the primary photo: the thumbnail
  in lists, map popups, the venue sheet and Near Me; the full image on the
  venue page and The Golden Cut, cropped at the focal point. A venue with no
  photo shows no image area. Photos migrated from the old single image link
  have no thumbnail and use the full image.
- **Hosting plan**: Vercel's Hobby plan is for personal, non-commercial use. If
  the site ever takes payments, sponsorship or ads, move to a Pro plan.

## 📁 Project Structure

```text
mcr-lunch-club/
├── src/
│   ├── components/
│   │   ├── admin/             # Chairs' Area components (dossier/: the venue form's cards)
│   │   ├── islands/           # Vue 3 interactive islands for the public site (near-me/: Near Me's pieces)
│   │   ├── LedgerCanon.astro  # Embeds the public venues for the islands
│   │   └── WeatherCard.vue
│   ├── data/                  # Original datasets: import source; inspections still read from here
│   ├── db/                    # Drizzle schema (app + Better Auth)
│   ├── lib/                   # Auth, database, validation, public data, map and admin helpers (see Shared modules)
│   ├── layouts/               # Public and admin page shells
│   ├── pages/
│   │   ├── index.astro        # Sovereign Map view
│   │   ├── hall-of-shame.astro
│   │   ├── inspections.astro
│   │   ├── manifesto.astro
│   │   ├── 404.astro
│   │   ├── admin/             # Chairs' Area
│   │   ├── api/               # Public, admin and weather endpoints
│   │   ├── verdicts/[tier].astro # Verdict pages
│   │   └── venues/[slug].astro# Venue dossiers
│   ├── stores/                # Nanostores: filters, modal state and the venue ledger
│   ├── styles/
│   │   ├── theme.css          # Colour tokens (@theme) and base styles, shared
│   │   ├── map.css            # Leaflet pins, HQ marker and popups, shared
│   │   ├── global.css         # The public site (Layout.astro); Tailwind scans public files only
│   │   └── admin.css          # The Chairs' Area (AdminLayout.astro); Tailwind scans admin files only
│   └── types/index.ts         # Shared TypeScript interfaces
├── drizzle/                   # Committed SQL migrations
├── scripts/
│   ├── migrate.ts             # pnpm db:migrate
│   ├── migrate-deploy.ts      # pnpm db:migrate:deploy (Vercel builds)
│   ├── seed-chair.ts          # pnpm db:seed
│   ├── import-existing-content.ts  # pnpm db:import
│   ├── import-legacy-inspections.ts # pnpm inspections:import-legacy
│   ├── backfill-verified-inspections.ts # pnpm inspections:backfill-verified
│   ├── backfill-routes.ts     # pnpm routes:backfill
│   ├── check-admin-security.ts     # pnpm check:security
│   ├── check-client-bundle.ts      # pnpm check:bundle
│   ├── db-local.sh            # pnpm db:local
│   ├── serve-build.ts         # pnpm serve:build
│   └── test-db.ts             # pnpm test:db
├── e2e/                       # Playwright smoke test of the build (pnpm check:built)
├── docker-compose.yml         # Postgres 16 for pnpm db:local -- --docker
├── manchester_lunch_venues.csv     # The club's original list of lunch spots (reference only)
└── astro.config.mjs
```
