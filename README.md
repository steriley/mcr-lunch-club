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

Built on **Astro 7** (server output on Vercel) with targeted **Vue 3 islands** hydrated only where interactive client state is required. Venue and Hall of Shame content lives in **Neon Postgres** and is edited by the Chairs in the admin area (`/admin`); public pages only ever show published rows and are cached at Vercel's CDN (`s-maxage=60, stale-while-revalidate=300`), so a published change appears within about a minute.

- **Pages (`.astro`)**:
  - `/` — The interactive Leaflet Ledger Map
  - `/venues/[slug]` — Dossiers for every published establishment
  - `/tiers/[tier]` — Registry classifications (`approved`, `under-consideration`, `to-be-assessed`, `if-we-must`, `rejected`, `gone-but-not-forgotten`)
  - `/hall-of-shame` — The Bribery & Improper Benefit Attempt Record
  - `/manifesto` — The Constitutional Articles of Governance
  - `/inspections` — The Complete Chronological Audit Log (still read from `src/data/inspections.json`)
  - `/api/venues.json` — Published venues as JSON
  - `/api/suggestions` — Public "Suggest a Venue" endpoint (same-origin only, rate limited)
  - `/admin/*` — The Chairs' Area (sign-in required; see below)
- **Vue 3 Islands (`src/components/islands/`)**:
  - `LunchMap.vue` (`client:load`) — Leaflet map with custom tier pins, rank badges, walking isochrones, and the 2.5-mile boundary.
  - `FilterBar.vue` (`client:load`) — Search, tier badges, cost (`£`/`££`/`£££`), walking time slider, and recency filter.
  - `VenueSheet.vue` (`client:load`) — Slide-up dossier sheet with official manifesto wording and "Eat Like Us" prescribed orders.
  - `NearMeMap.vue` (`client:only`) — Full-screen "Near Me" mode ranking venues by distance from the user.
  - `WhereToday.vue` (`client:idle`) — The 12:25 decision oracle and stalemate resolver.
  - `SuggestModal.vue` (`client:idle`) — Member petition form; suggestions go to the Chairs' Area inbox (`/admin/suggestions`), never straight onto the site.
- **State Management**:
  - `nanostores` with `@nanostores/vue` for cross-island reactive filtering and modal state.
  - `src/stores/ledger.ts` holds the published venues the server embeds in the page (`LedgerCanon.astro`) and the inspection log.
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
| `BETTER_AUTH_URL` | Site origin: `http://localhost:4321` locally, the production URL (e.g. `https://mcrlunchclub.com`) on Vercel. Also the only trusted origin in production. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for venue image uploads. Created when you connect a Blob store to the project; without it the form accepts image URLs only. |
| `SEED_CHAIR_EMAIL` / `SEED_CHAIR_NAME` / `SEED_CHAIR_PASSWORD` | Only for `pnpm db:seed`. Remove them from your machine afterwards. |
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
| `pnpm db:studio` | Open Drizzle Studio. |
| `pnpm db:seed` | Create (or re-promote) the first Chair from `SEED_CHAIR_*`. Idempotent; refuses to run with `NODE_ENV=production` unless `--force` is passed. `--reset-password` resets an existing Chair's password. Prints the email only. |
| `pnpm db:import` | Import `src/data/venues.json` and `src/data/incidents.json`. Idempotent (venues match on slug, records on title + date); existing rows are left alone. `--dry-run` reports without writing; `--update` overwrites existing venues from the files. |
| `pnpm auth:generate` | Regenerate `src/db/auth-schema.ts` with the Better Auth CLI matching the installed version. Follow with `pnpm db:generate`. |
| `pnpm check:security [url]` | Check that every `/admin` page and `/api/admin` route refuses anonymous and cross-origin requests, and that sign-up is disabled. Defaults to `http://localhost:4321`; pass the production URL after a deploy. |

### Deploying to Vercel (runbook)

1. **Database**: add Neon from the Vercel Marketplace to the project so
   `DATABASE_URL` / `DATABASE_URL_UNPOOLED` are provisioned.
2. **Env vars**: set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` (the production
   domain) for Production, and separate values for Preview if you use it.
3. **Blob (optional)**: create a Blob store under **Storage** and connect it to
   the project, which adds `BLOB_READ_WRITE_TOKEN`.
4. **Migrations are a manual, explicit step**; they do not run on build. From a
   trusted machine with the production direct URL in the environment:
   ```bash
   DATABASE_URL_UNPOOLED='<production direct url>' pnpm db:migrate
   ```
   Run this before deploying code that needs the new schema.
5. **First Chair** (once): with production env vars set locally,
   ```bash
   NODE_ENV=production SEED_CHAIR_EMAIL=… SEED_CHAIR_NAME=… SEED_CHAIR_PASSWORD=… pnpm db:seed --force
   ```
   then delete the `SEED_CHAIR_*` values from that machine. Add further Chairs
   from **Chairs' Area → Users**.
6. **Content** (once, if the database is empty): `pnpm db:import`.
7. **Verify**: `pnpm check:security https://<your-domain>`.

### Operating notes

- **Chairs**: create accounts, deactivate (ban) them and set temporary
  passwords from `/admin/users`. Deactivating signs the user out everywhere.
  There is no email sending, so share initial/temporary passwords securely.
  Chairs change their own password and sign out other devices at `/admin/account`.
- **Suggestions**: the public "Suggest a Venue" form stores petitions in the
  database for review at `/admin/suggestions`. "Create draft venue" turns one
  into an unpublished *To Be Assessed* venue to finish and publish. The form is
  limited to 3 per sender per hour and 50 a day overall; senders' IPs are only
  kept as a keyed hash for that limit.
- **Publishing**: venues are drafts until published; drafts and hidden Hall of
  Shame records never appear publicly. Every venue save, publish and unpublish
  stores a snapshot, viewable from the venue's **History** page.
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
│   │   ├── LedgerCanon.astro  # Embeds the published venues for the islands
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
│   ├── seed-chair.ts          # pnpm db:seed
│   ├── import-existing-content.ts  # pnpm db:import
│   └── check-admin-security.ts     # pnpm check:security
├── manchester_lunch_venues.csv     # The club's original list of lunch spots (reference only)
└── astro.config.mjs
```
