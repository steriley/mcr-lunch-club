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

Built on **Astro 5** (static by default) with targeted **Vue 3 islands** hydrated only where interactive client state is required:

- **Static Pages (`.astro`)**:
  - `/` — The interactive Leaflet Ledger Map
  - `/venues/[slug]` — Statically generated dossiers for all 90 enrolled establishments
  - `/tiers/[tier]` — Registry classifications (`approved`, `under-consideration`, `to-be-assessed`, `if-we-must`, `rejected`, `gone-but-not-forgotten`)
  - `/hall-of-shame` — The Bribery & Improper Benefit Attempt Record
  - `/manifesto` — The Constitutional Articles of Governance
  - `/inspections` — The Complete Chronological Audit Log
  - `/api/venues.json` — Static JSON endpoint
- **Vue 3 Islands (`src/components/islands/`)**:
  - `LunchMap.vue` (`client:load`) — Leaflet map with custom tier pins, rank badges, walking isochrones, and the 2.5-mile boundary.
  - `FilterBar.vue` (`client:load`) — Search, tier badges, cost (`£`/`££`/`£££`), walking time slider, and recency filter.
  - `VenueSheet.vue` (`client:load`) — Slide-up dossier sheet with official manifesto wording and "Eat Like Us" prescribed orders.
  - `WhereToday.vue` (`client:idle`) — The 12:25 decision oracle and stalemate resolver.
  - `InspectionModal.vue` (`client:idle`) — Chairs' quick-audit log for mobile/desktop.
  - `SuggestModal.vue` (`client:idle`) — Member petition form placing candidates into *To Be Assessed*.
- **State Management**:
  - `nanostores` with `@nanostores/vue` for cross-island reactive filtering and modal state.
  - `src/stores/ledger.ts` providing local storage persistence for live tier promotions/demotions and inspection audits.
- **Data Validation**:
  - Zod schemas in `src/content.config.ts` enforcing strict typing across `venues`, `inspections`, and `incidents`.

---

## 🚀 Getting Started

```bash
# Navigate to project directory
cd /Users/steriley/.gemini/antigravity/scratch/mcr-lunch-club

# Start development server
npm run dev

# Build production static site
npm run build

# Preview production build locally
npm run preview
```

---

## Admin setup

Copy `.env.example` to `.env.local` for local development and set the required
values. In Vercel, keep the Neon integration's variable names unchanged and add
the Better Auth variables in project settings.

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` | Pooled Neon connection used by the running application. |
| `DATABASE_URL_UNPOOLED` | Direct Neon connection used by Drizzle Kit, migrations, and database scripts; falls back to `DATABASE_URL` if unset. |
| `BETTER_AUTH_SECRET` | Better Auth signing/encryption secret; must be at least 32 characters. |
| `BETTER_AUTH_URL` | Application origin used by Better Auth (for example, `http://localhost:4321` locally or the production site URL). |
| `SEED_CHAIR_EMAIL` | Email for the first Chair created by `pnpm db:seed`. |
| `SEED_CHAIR_PASSWORD` | Initial password for that Chair; use at least 12 characters. |
| `SEED_CHAIR_NAME` | Optional name for the seeded Chair; defaults to `Chair`. |

Run `pnpm db:generate` when schema changes need a migration, then
`pnpm db:migrate` to apply migrations. Run `pnpm db:seed` to create or promote
the configured first Chair; use `--force` only when intentionally seeding in
production. The application uses only the pooled connection at runtime.

Optional integrations use `METOFFICE_API_KEY` (or `WEATHER_API_KEY`) for server
weather requests and `PUBLIC_MAP_API_KEY` for the public CARTO map tile key.
`BLOB_READ_WRITE_TOKEN` is reserved for the later image-upload phase.

## 📁 Project Structure

```text
mcr-lunch-club/
├── src/
│   ├── components/
│   │   └── islands/           # Vue 3 interactive islands
│   │       ├── FilterBar.vue
│   │       ├── InspectionModal.vue
│   │       ├── LunchMap.vue
│   │       ├── SuggestModal.vue
│   │       ├── VenueSheet.vue
│   │       └── WhereToday.vue
│   ├── content/
│   │   ├── venues/            # 90 individual JSON files validated by Zod
│   │   ├── inspections/       # Audit inspection logs
│   │   └── incidents/         # Bribery and impropriety records
│   ├── data/                  # Consolidated datasets for fast client load
│   ├── layouts/
│   │   └── Layout.astro       # Authoritative header, seal, and archival footer
│   ├── pages/
│   │   ├── index.astro        # Sovereign Map view
│   │   ├── hall-of-shame.astro
│   │   ├── inspections.astro
│   │   ├── manifesto.astro
│   │   ├── api/venues.json.ts # JSON API endpoint
│   │   ├── tiers/[tier].astro # Dynamic tier pages
│   │   └── venues/[slug].astro# Static dossiers for all venues
│   ├── stores/
│   │   ├── filters.ts         # Nanostores filters & modal states
│   │   └── ledger.ts          # Reactive mutations & local storage
│   ├── styles/
│   │   └── global.css         # Tailwind CSS & Leaflet custom rules
│   ├── types/
│   │   └── index.ts           # TypeScript interfaces
│   └── content.config.ts      # Astro 5 Content Collections Zod schemas
├── scripts/
│   └── seed-data.mjs          # CSV parsing & data generation script
└── astro.config.mjs
```
