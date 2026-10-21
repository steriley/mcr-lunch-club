# MCR Lunch Club — The Chairs' Official Ledger 🏛️⚖️

> *"A map of Manchester where every pin is a verdict. Formal, a bit pompous, and actually useful at 12:25 when someone asks 'where are we going?'"*

Welcome to the official repository of the **Manchester Lunch Club Map App**.

---

## 🏛️ Concept & Articles of Governance

- **The Base Datum**: Crown Square / Hardman Square, Spinningfields (`53.47985°N, -2.25105°W`).
- **Walking-Time Rings**: 5, 10, 15, 20, and 25-minute pedestrian isochrones.
- **The 2.5-Mile Boundary**: Delineates the maximum authorized perimeter for civilized municipal dining (with Butty's Booth and Rusholme Chippy marking the frontier at 2.2 miles).
- **The Sacred Two-Visit Rule**: No venue may enter **Approved** on a single visit. Two distinct, satisfactory audits conducted under peak duress are required.
- **The Guillotine Clause**: A single sub-par inspection triggers swift demotion to **Rejected** or **If We Must**.
- **No Member Voting**: The Chairs maintain impartial authority. Members may petition and suggest, but verdicts belong strictly to the tribunal.
- **The Hall of Shame**: Incorruptible register tracking attempted bribery (e.g. unsolicited chicken tenders or illicit cold San Pellegrino cans).

---

## 🛠️ Architecture

Built on **Astro 7** (server output on Vercel) with targeted **Vue 3 islands** hydrated only where interactive client state is required. Venue and Hall of Shame content lives in **Neon Postgres** and is edited by the Chairs in the admin area (`/admin`); public pages only show venues that pass the visibility rule in `src/lib/visibility.ts` (an approved tier and a location) and are cached at Vercel's CDN (`s-maxage=60, stale-while-revalidate=300`), so a change appears within about a minute.

- **Pages (`.astro`)**:
  - `/` — The interactive Leaflet Ledger Map
  - `/venues/[slug]` — Dossiers for every public establishment
  - `/tiers/[tier]` — Registry classifications (`approved`, `under-consideration`, `to-be-assessed`, `if-we-must`, `rejected`, `gone-but-not-forgotten`)
  - `/hall-of-shame` — The Bribery & Improper Benefit Attempt Record
  - `/manifesto` — The Constitutional Articles of Governance
  - `/inspections` — The Complete Chronological Audit Log: every confirmed inspection (dual-verified or legacy) of a public venue
  - `/api/venues.json` — Public venues as JSON
  - `/api/suggestions` — Public "Suggest a Venue" endpoint (same-origin only, rate limited)
  - `/admin/*` — The Chairs' Area (sign-in required; see below)
- **Vue 3 Islands (`src/components/islands/`)**:
  - `LunchMap.vue` (`client:load`) — Leaflet map with custom tier pins, walking isochrones, and the 2.5-mile boundary.
  - `FilterBar.vue` (`client:load`) — Search, tier badges, cost (`£`/`££`/`£££`), walking time slider, and recency filter.
  - `VenueSheet.vue` (`client:load`) — Slide-up dossier sheet with official manifesto wording and "Eat Like Us" prescribed orders.
  - `NearMeMap.vue` (`client:only`) — Full-screen "Near Me" mode ranking venues by distance from the user.
  - `WhereToday.vue` (`client:idle`) — The 12:25 decision oracle and stalemate resolver.
  - `SuggestModal.vue` (`client:idle`) — Member petition form; suggestions go to the Chairs' Area inbox (`/admin/suggestions`), never straight onto the site.
- **State Management**:
  - `nanostores` with `@nanostores/vue` for cross-island reactive filtering and modal state.
  - `src/stores/ledger.ts` holds the public venues and confirmed inspections the server embeds in the page (`LedgerCanon.astro`).
- **Data Validation**:
  - Zod schemas in `src/lib/venue-schema.ts`, `src/lib/bribery-schema.ts`, `src/lib/suggestion-schema.ts` and `src/lib/user-schema.ts`, shared by the APIs and the forms.

---

## 🚀 Getting Started

```bash
pnpm install
cp .env.example .env.local   # then fill it in; see "Admin setup"
pnpm dev                     # http://localhost:4321
pnpm build                   # production build (Vercel output)
pnpm test                    # unit tests
pnpm test:db                 # database integration tests (needs TEST_DATABASE_URL, see Scripts)
```

---

## Admin setup

The Chairs' Area lives at `/admin`. Authentication is Better Auth (email and
password, **no public sign-up**), data is Neon Postgres through Drizzle ORM, and
images go to Vercel Blob. The section name ("Chairs' Area") is set once in
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
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for venue image uploads. Created when you connect a Blob store to the project; without it the form accepts image URLs only. |
| `SEED_CHAIR_EMAIL` / `SEED_CHAIR_NAME` / `SEED_CHAIR_PASSWORD` | Only for `pnpm db:seed`. Remove them from your machine afterwards. |
| `ORS_API_KEY` | [OpenRouteService](https://openrouteservice.org) key, **server-only** (never prefix it with `PUBLIC_`). Powers the admin venue location search and the walking distance and time from HQ. Without it venues still save, but the location must be entered manually and routes stay "pending". `OPENROUTESERVICE_API_KEY` is accepted as an alternative name. Free Standard plan: 2,000 directions a day (40 a minute); Matrix has its own lower daily quota. Visitors never trigger requests, only admin saves and the backfill. |
| `METOFFICE_API_KEY`, `PUBLIC_MAP_API_KEY` | Optional weather and map tile keys. |

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
| `pnpm db:migrate:deploy` | Last step of the Vercel build. Production builds migrate production; Preview builds migrate their own Neon branch; anywhere else it does nothing. |
| `pnpm db:studio` | Open Drizzle Studio. |
| `pnpm db:seed` | Create (or re-promote) the first Chair from `SEED_CHAIR_*`. Idempotent; refuses to run with `NODE_ENV=production` unless `--force` is passed. `--reset-password` resets an existing Chair's password. Prints the email only. |
| `pnpm db:import` | Import `src/data/venues.json` and `src/data/incidents.json`. Idempotent (venues match on slug, records on title + date); existing rows are left alone. `--dry-run` reports without writing; `--update` overwrites existing venues from the files. |
| `pnpm auth:generate` | Regenerate `src/db/auth-schema.ts` with the Better Auth CLI matching the installed version. Follow with `pnpm db:generate`. |
| `pnpm routes:backfill` | Replace distance and walking time with ORS walking routes for venues that have coordinates but no ORS route yet (the old straight-line estimates). Uses ORS Matrix, 25 venues per request, falling back to one Directions request per venue; throttled (`--delay-ms=2000`), resumable, stops cleanly on a rate limit. `--dry-run` lists venues without calling ORS; `--all` recomputes every venue; `--no-matrix` skips Matrix. Needs `ORS_API_KEY`. |
| `pnpm inspections:import-legacy` | One-off: import the corrected inspection dates in `drizzle/data/legacy-inspections.json` as legacy inspections and rebuild every venue's "last inspected" date. Venues not on the list lose their old date unless `--keep-unlisted` is passed. Aborts if any name cannot be matched; idempotent; `--dry-run` shows the changes first. |
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
   the project, which adds `BLOB_READ_WRITE_TOKEN`.
4. **Migrations run automatically** as the last step of every Vercel build
   (`pnpm test && pnpm build && pnpm db:migrate:deploy`), so they only run
   once the tests and build have passed:
   - **Production** (merging to `main`) migrates the production database before
     the new deployment goes live.
   - **Preview** migrates that preview's own Neon branch (see below).

   The old deployment keeps serving for the few seconds between the migration
   and the new one going live, so keep migrations backwards compatible: add
   columns and tables first, and remove old ones in a later pull request once
   no deployed code uses them. Instant Rollback in Vercel rolls back code, not
   the schema. To migrate by hand, e.g. the first time:
   ```bash
   DATABASE_URL_UNPOOLED='<production direct url>' pnpm db:migrate
   ```
5. **First Chair** (once): with production env vars set locally,
   ```bash
   NODE_ENV=production SEED_CHAIR_EMAIL=… SEED_CHAIR_NAME=… SEED_CHAIR_PASSWORD=… pnpm db:seed --force
   ```
   then delete the `SEED_CHAIR_*` values from that machine. Add further Chairs
   from **Chairs' Area → Users**.
6. **Content** (once, if the database is empty): `pnpm db:import`.
7. **Verify**: `pnpm check:security https://<your-domain>`.

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
  clock, `Europe/London`). A lone press lapses at midnight. The page lists the
  inspection history: "Verified by A and B" or legacy records imported from
  the Chairs' old records (which show as "last inspected" but never count as
  verified). Deactivated Chairs can't press it.
- **Permanently closed**: a flag, not a tier. Any Chair can mark a venue
  closed (with a confirmation) or reopen it from its edit page; no second
  Chair is needed, and both are logged on the **History** page. Closed venues
  never appear on the map or in Near Me. A closed venue whose tier is Gone But
  Not Forgotten stays on that tier page and its own page, labelled
  "Permanently closed"; any other closed venue is hidden (its page 404s).
- **Public ordering**: within a tier, venues are listed by walking time (unknown
  times last), then name; Rejected and Gone But Not Forgotten are alphabetical
  (`src/lib/venue-order.ts`).
- **Security**: sessions last 7 days with daily sliding refresh (`SESSION_SETTINGS`
  in `src/lib/auth-config.ts`). Sign-in is limited to 5 attempts per minute per
  IP, stored in the database so it holds across serverless invocations. Admin
  pages send `Cache-Control: no-store` and `noindex`; admin API writes must come
  from the site's own origin. Image uploads accept JPEG, PNG, WebP, AVIF and GIF
  up to 4 MB.
- **Hosting plan**: Vercel's Hobby plan is for personal, non-commercial use. If
  the site ever takes payments, sponsorship or ads, move to a Pro plan.

## 📁 Project Structure

```text
mcr-lunch-club/
├── src/
│   ├── components/
│   │   ├── islands/           # Vue 3 interactive islands (public site and Chairs' Area)
│   │   ├── LedgerCanon.astro  # Embeds the public venues for the islands
│   │   └── WeatherCard.vue
│   ├── data/                  # Original datasets: import source; inspections still read from here
│   ├── db/                    # Drizzle schema (app + Better Auth)
│   ├── lib/                   # Auth, database, validation, public data, map and admin helpers
│   ├── layouts/               # Public and admin page shells
│   ├── pages/
│   │   ├── index.astro        # Sovereign Map view
│   │   ├── hall-of-shame.astro
│   │   ├── inspections.astro
│   │   ├── manifesto.astro
│   │   ├── 404.astro
│   │   ├── admin/             # Chairs' Area
│   │   ├── api/               # Public, admin and weather endpoints
│   │   ├── tiers/[tier].astro # Tier pages
│   │   └── venues/[slug].astro# Venue dossiers
│   ├── stores/                # Nanostores: filters, modal state and the venue ledger
│   ├── styles/global.css      # Tailwind CSS & Leaflet custom rules
│   └── types/index.ts         # Shared TypeScript interfaces
├── drizzle/                   # Committed SQL migrations
├── docs/                      # Build specs
├── scripts/
│   ├── migrate.ts             # pnpm db:migrate
│   ├── migrate-deploy.ts      # pnpm db:migrate:deploy (Vercel builds)
│   ├── seed-chair.ts          # pnpm db:seed
│   ├── import-existing-content.ts  # pnpm db:import
│   └── check-admin-security.ts     # pnpm check:security
├── manchester_lunch_venues.csv     # The club's original list of lunch spots (reference only)
└── astro.config.mjs
```
