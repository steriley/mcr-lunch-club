# MCR Lunch Club — The Chairs' Official Ledger 🏛️⚖️

> _"A map of Manchester where every pin is a verdict. Formal, a bit pompous, and actually useful at 11:59 when someone asks 'where are we going?'"_

Welcome to the official repository of the **Manchester Lunch Club Map App**.

**Contents:** [Concept](#️-concept--articles-of-governance) · [Architecture](#️-architecture) ·
[Getting started](#-getting-started) · [Admin setup](#admin-setup) · [Deploying](#deploying-to-vercel-runbook) ·
[Offline mode](#offline-mode-and-installing-the-app) · [Push notifications](#push-notifications-for-chairs) ·
[Operating notes](#operating-notes) · [Project structure](#-project-structure)

---

## 🏛️ Concept & Articles of Governance

- **The Base Datum**: Crown Square / Hardman Square, Spinningfields (`53.478997°N, -2.252024°W`).
- **Walking-Time Rings**: 5, 10, 15, 20, and 25-minute pedestrian rings and the 2.5-mile boundary, in one quiet grey with their minutes printed on the ring. A switch under the map's zoom buttons hides them, and the choice is remembered.
- **The 2.5-Mile Boundary**: Delineates the maximum authorized perimeter for civilized municipal dining (Rusholme Chippy, about two miles out as the crow flies, currently marks the frontier).
- **The Sacred Two-Visit Rule** (Manifesto, Article II): No venue may enter **Approved** on a single visit. It must be visited on at least two separate occasions and deliver satisfactory outcomes on both. Consistency is king.
- **The Guillotine Clause**: A single sub-par inspection triggers swift demotion to **Rejected** or **If We Must**.
- **No Member Voting**: The Chairs maintain impartial authority. Members may petition and suggest, but verdicts belong strictly to the tribunal.
- **The Hall of Shame**: Incorruptible register tracking attempted bribery (e.g. unsolicited chicken tenders or illicit cold San Pellegrino cans).

---

## 🛠️ Architecture

Built on **Astro 7** on Vercel (functions in `lhr1`, next to the Neon database in London) with targeted **Vue 3 islands** hydrated only where interactive client state is required. Venue and Hall of Shame content lives in **Neon Postgres** and is edited by the Chairs in the admin area (`/admin`); public pages only show venues that pass the visibility rule in `src/lib/visibility.ts`: a tier (set by an approved proposal), coordinates, and not permanently closed, unless the tier is Gone But Not Forgotten.

The public pages are **prerendered**: they read the database when the site is built and are served as static files, so visitors never wait on Neon. Admin saves that change what the public sees (the operation returns the public change it made, and `adminRoute` records it) do not rebuild straight away: they **record a pending change** (`src/lib/publishing.ts`), and a bar across the Chairs' Area lists what is unpublished with a **Publish now** button that calls the Vercel Deploy Hook (`src/lib/rebuild.ts`). Closing or reopening a venue publishes at once. A pending change clears only when a production build completes, whatever started it (the button, a cron or a push to `main`): `vercel.json` runs `pnpm publish:mark` first, which records the build's start by the database's clock, and `pnpm publish:settle` last, which deletes the changes saved before that time. A change saved during a build stays pending, and a failed build leaves everything pending. A nightly cron (05:00 UTC, `src/pages/api/cron/publish-pending.ts`) publishes anything still waiting, and another rebuilds the site at 00:00 UTC on Thursdays, just after the weekly bulletin's 23:59 Wednesday issue (`src/pages/api/cron/weekly-bulletin.ts`). Without a `DEPLOY_HOOK_URL` (local runs) changes stay pending, since only a production build clears them. Only the Chairs' Area (sign-in included) and `/api/*` run on demand.

Every public page carries a canonical URL and Open Graph / Twitter card tags (`src/layouts/Layout.astro`), so links shared in a chat show a preview: a venue page uses its photo, or a card drawn at build time (`/og/venues/<slug>.png`, `src/lib/og-card.ts`) when it has none; everything else uses `public/brand/og-default.png`. Venue pages also carry schema.org `Restaurant` JSON-LD (`src/lib/structured-data.ts`) for search results, and `public/manifest.webmanifest` makes the site an installable app that works offline (see "Offline mode and installing the app"), with Near Me and the Chairs' Area as shortcuts. `@astrojs/sitemap` writes `/sitemap-index.xml` at build time, and `vercel.json` sets the security headers (`nosniff`, no framing, referrer and permissions policies; geolocation stays allowed for Near Me).

- **Content-Security-Policy**: `security.csp` in `astro.config.mjs`. Astro hashes every script and style it emits, so an injected inline script won't run; images may come only from the site, CARTO tiles and Vercel Blob, and fonts only from the site itself (self-hosted WOFF2 in `public/fonts/`, icons as inline SVG from `src/lib/icons.ts`). `worker-src 'self'` and `manifest-src 'self'` let the service worker and the web app manifests load. Prerendered pages carry it as a `<meta>` tag, on-demand pages as a header. Inline `style` attributes are allowed (Vue renders tier colours with them). The theme script's hash is added from `src/lib/theme-script.ts`, the Chairs' Area adds `'wasm-unsafe-eval'` for the WebP encoder and turns off Zod's eval probe (`AdminLayout.astro`), and `frame-ancestors` stays in `vercel.json` because a `<meta>` policy cannot set it. A new third-party script, image host or API needs adding there. `pnpm dev` does not apply the CSP, so check with `pnpm build && pnpm check:built`: Chromium does not log violations to the console, so the smoke test listens for `securitypolicyviolation` events instead (`e2e/fixtures.ts`).

- **Pages (`.astro`)**:
  - `/` — The interactive Leaflet Ledger Map
  - `/venues/[slug]` — Dossiers for every public establishment
  - `/verdicts/[tier]` — Registry verdicts (`approved`, `under-consideration`, `to-be-assessed`, `if-we-must`, `rejected`, `gone-but-not-forgotten`). The old URLs redirect with a 301: `/tiers` to `/verdicts/approved`, `/tiers/[tier]` to `/verdicts/[tier]` (`redirects` in `astro.config.mjs`)
  - `/hall-of-shame` — The Bribery & Improper Benefit Attempt Record
  - `/manifesto` — The Constitutional Code (Preamble, Articles I–XVIII, Codex of Verdicts, Schedule A, Oath)
  - `/faqs` — Questions and answers (copy in `src/data/faqs.ts`)
  - `/contact` — Contact the Chairs (#132): a static shell whose form island asks `GET /api/contact` whether it is open
  - `/inspections` — The Complete Chronological Audit Log: every confirmed inspection (dual-verified or legacy) of a public venue
  - `/offline`, `/chairs-offline` — What the service worker shows offline for a page that isn't saved, and for the Chairs' Area (left out of the sitemap)
  - `/og/venues/[slug].png` — Social cards for venues without a photo, drawn at build time
  - `/api/suggestions` — Public "Suggest a Venue" endpoint (same-origin only, rate limited)
  - `/api/contact` — Public contact form (#132): `GET` says whether it is open and issues its time-trap token; `POST` stores a message for the Chairs' inbox (`/admin/contact`). Same-origin JSON only, honeypot, time trap, 3/hour and 10/day per sender, 50/day site-wide, repeats silently dropped. Never sends email
  - `/api/weather` — Compact Manchester forecast for the home page card (fetches the Met Office hourly and daily forecasts, normalises them in `src/lib/weather.ts`)
  - `/api/flags/snow` — Whether the Christmas snowfall is on (the `snow` flag; see `FLAGS` below)
  - `/api/cron/weekly-bulletin` — Vercel Cron (00:00 UTC Thursday): rebuilds the site for the new weekly bulletin
  - `/api/cron/publish-pending` — Vercel Cron (05:00 UTC): publishes pending changes, if there are any
  - `/api/cron/contact-retention` — Vercel Cron (02:40 UTC): deletes contact messages older than 90 days
  - `/api/auth/*` — Better Auth (sign-in, sessions)
  - `/api/admin/*` — The Chairs' Area API, every handler wrapped by `adminRoute` (see Shared modules). `/api/admin/publish`: `POST` publishes the pending changes (debounced for 60s); `GET` is the bar's state
  - `/admin/*` — The Chairs' Area (sign-in at `/admin/login`; see below)
- **Styles**: the public site and the Chairs' Area each have their own stylesheet (`src/styles/global.css`, `src/styles/admin.css`), and Tailwind scans only that side's files, so visitors never download admin styles. Both import `theme.css` (the colour tokens) and `map.css`. A new admin component goes in `src/components/admin/`; a new public page directory is picked up by `global.css` automatically.
- **Dark mode**: `ThemeScript.astro` (in both layouts' `<head>`) sets `data-theme` on `<html>` before the page paints, from the visitor's saved choice or their system setting, and keeps following the system (and other tabs) while nothing is saved; `ThemeToggle.astro` (a Light / System / Dark switch in both footers) saves the choice, with System clearing it, and fires `mcr:themechange` (`src/lib/theme.ts`). The dark palette is the `:root[data-theme="dark"]` block in `theme.css`. Tokens ending `-fixed` (and `surface`, the `*-ink` text tokens) exist so brand fills and the text on them stay put while surfaces and text flip; Leaflet path colours go through `themeColor()`, and tile layers swap to CARTO Dark Matter on their own.
- **Vue 3 Islands (`src/components/islands/`)**:
  - `LunchMap.vue` (`client:load`) — Leaflet map with tier pins, walking rings (thin and grey, labelled on the ring, with a remembered on/off switch), and the 2.5-mile boundary. Leaflet starts once the browser is idle (a grey box until then), or straight away for a `/?venue=` link. What the map shows is decided by the Ledger Map scene (`src/lib/map/scene.ts`, no Leaflet, tested in `scene.test.ts`); `LunchMap.vue` draws its frames, and both maps draw pins through `src/lib/map/pin-layer.ts`. Each pin carries its tier's glyph (`glyph` in `src/lib/tiers.ts`) as well as its colour, so tier reads without colour. Pins that would touch merge into clusters (`src/lib/map/clusters.ts`: a ring split by tier share, tap or Enter to zoom; venues sharing a building fan out at street level), and the map frames every venue the filters match (`src/lib/map/framing.ts`), reframing after a filter change only if a match is off screen. From zoom 16 each pin's name and price sit beside it (`src/lib/map/labels.ts`: Approved first, then nearest to Base; a name that would touch a pin, a cluster or another name is left out), and any pin shows its name on hover or keyboard focus at any zoom. A map narrower than 640px frames Base and the matches inside the 25-minute ring (or the 8 nearest); a "N more further out · Show all" pill, on any width, counts the matches out of view and frames them all; a filter that matches nothing says so, with a Reset filters button. Keyboard: Tab follows the markers top to bottom, Enter or Space on a pin moves focus into its card and Escape returns it to the pin, and a "Skip the map" link goes straight to the list.
  - `VenueResults.vue` (`client:idle`) — Every venue the filters match, as a list that stays in step with the map (sort by nearest, name or last inspected). It is the "All venues" tab on the bench beside the map on wide screens, and a "56 venues · Show list" disclosure under the map on a phone; it renders in one place only, and works if the map never loads. Picking a row flies the map to its pin and shows the card; picking a pin selects and scrolls to its row; hovering or focusing a row lights up its pin (`src/stores/results.ts` carries the selection, hover and sort between them).
  - `BenchTabs.vue` (`client:load`) — The bench's two tabs, The Golden Cut and All venues, as an ARIA tab list that switches the server-rendered panels beside it.
  - `FilterBar.vue` (`client:load`) — Search, tier badges, cost (`£`/`££`/`£££`), walking time slider, and recency filter.
  - `NearMeMap.vue` — Full-screen "Near Me" mode ranking venues by distance from the user. Loaded by `NearMeLoader.vue` (`client:only`) the first time Near Me opens (or for a `#near-me` link), and prefetched once the page is idle. Its pieces live in `islands/near-me/` (status banner, location notice, map controls, collapsed summary, venue list, plus the `useNearMeLeaflet`, `useBottomSheet` and `useNearMeHistory` composables); the pure rules (status banner priority, sheet heights, price filter, focus trap) are in `src/lib/near-me/` with their tests.
  - `WhereToday.vue` (`client:idle`) — The 11:59 decision oracle and stalemate resolver.
  - `SuggestModal.vue` (`client:idle`) — Member petition form; suggestions go to the Chairs' Area inbox (`/admin/suggestions`), never straight onto the site.
- **State Management**:
  - `nanostores` with `@nanostores/vue` for cross-island reactive filtering and modal state.
  - `src/stores/ledger.ts` holds the public venues and confirmed inspections the server embeds in the page (`LedgerCanon.astro`).
  - `src/stores/online.ts` (connection state), `pwa.ts` (install prompt, update notice, saved copy) and `publish.ts` (the Chairs' unpublished-changes bar).
- **Data Validation**:
  - Zod schemas in `src/lib/venue-schema.ts`, `src/lib/bribery-schema.ts`, `src/lib/suggestion-schema.ts`, `src/lib/golden-cut-schema.ts`, `src/lib/field-notes-schema.ts` and `src/lib/user-schema.ts`, shared by the APIs and the forms. Schemas that ship to the browser import Zod through `src/lib/zod-browser.ts`, which turns on `jitless` (no eval, so no CSP violation).
- **Shared modules** (one place for each rule):
  - `src/lib/tiers.ts` — every per-tier fact (label, URL slug, colours, banner, mottos, rule), keyed by the stored value.
  - `src/lib/venue-lifecycle.ts` — every operation on a venue (create, update, reroute, close, reopen, delete, add/update/remove a photo). Routes parse the request and call one function; photo files go through a `PhotoStore` (`src/lib/venue-image-storage.ts`: Vercel Blob in production, `src/test/memory-photo-store.ts` in `pnpm test:db`). The caption and focal-point rules live only here.
  - `src/lib/venues.ts` — the venue store: `writeVenue()` writes a venue row and its revision in one transaction.
  - `src/lib/outcome.ts` — the one `Outcome` type every domain operation returns: `{ ok: true, value, published? }` or `{ ok: false, error }` with a domain error code. `published` is the public change the operation made. `adminRoute` maps both once: codes to a status and message through `ERROR_HTTP` in `src/lib/admin-api.ts` (a route can override a code with `errors`), and `published` to a pending change, the `X-Unpublished-Changes` header and, for `'now'`, the Deploy Hook.
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

`pnpm preview` (`astro preview`) does not work with the Vercel adapter; use `pnpm serve:build`. Sign in on the port in
`BETTER_AUTH_URL` (4321 by default): any other origin fails with `Invalid origin`.

### Before you push

CI (`.github/workflows/ci.yml`) runs the same sequence, so run it locally first:

```bash
pnpm lint && pnpm format:check && pnpm knip && pnpm test && pnpm typecheck && pnpm test:db
```

```bash
pnpm build && pnpm check:bundle && pnpm check:built
```

`pnpm lint:fix` and `pnpm format` fix what they can. `pnpm knip` reports unused files, exports and dependencies.

### Local environment

`pnpm db:local` is safe to run again. It:

1. starts Postgres 16 on `127.0.0.1:5432` (`LUNCH_PGPORT` to change). With installed binaries the data lives in
   `$XDG_DATA_HOME/mcr-lunch-club/pgdata` (`~/.local/share/...`; `/var/lib/postgresql/mcr-lunch-club` when run as root,
   as in the cloud container), or set `LUNCH_PGDATA`. With `--docker` it uses the `mcr-lunch-club-pgdata` volume;
2. creates the `lunch` (dev) and `lunch_test` (integration tests) databases;
3. migrates `lunch`, imports the venues and bribery record (tiers included, so every venue is public) and seeds a Chair,
   always against the local database whatever `.env.local` says;
4. writes `.env.local` with the local `DATABASE_URL`, `TEST_DATABASE_URL`, auth settings, Chair and local VAPID keys
   (so the notification settings show), unless one already exists (it then just prints the URLs).

Two local logins, side by side:

| Login       | Email / password                              | Role    | Override with                                                     |
| ----------- | --------------------------------------------- | ------- | ----------------------------------------------------------------- |
| Chair       | `chair@lunch.test` / `local-chair-password`   | `admin` | `SEED_CHAIR_EMAIL` / `SEED_CHAIR_PASSWORD`                        |
| Test member | `member@lunch.test` / `local-member-password` | `user`  | `SEED_MEMBER_EMAIL` / `SEED_MEMBER_PASSWORD` / `SEED_MEMBER_NAME` |

The test member is never a Chair: it is bounced from `/admin/**` and gets 403 from `/api/admin/**`,
which is what `pnpm check:built` checks. Members have no passwords anywhere real, so a member's
password sign-in is refused whenever `NODE_ENV` is production (every Vercel deployment); the test
member's password only works locally and in CI. An `.env.local` written before the member existed
needs the two `SEED_MEMBER_*` lines that `pnpm db:local` prints.
These are local-only credentials; never reuse them anywhere real.

### Smoke test the build (`pnpm check:built`)

Playwright drives the built site (`pnpm build` first; it starts `pnpm serve:build` itself, or reuses one already running).
`e2e/built.spec.ts` visits every public page type, uses the map, theme toggle, Where to today?, the weather card, Near Me
(location granted) and the suggest form, signs in as the seeded Chair, loads every Chairs' Area page, runs the WebP
encoder and logs a visit with a field note (writes stubbed). It fails on any `securitypolicyviolation` event or uncaught
page error, and asserts that injected inline `<script>` / `<style>` are blocked, WebAssembly is blocked on public pages
and allowed in the Chairs' Area, and venue JSON-LD parses. The other specs cover offline mode (`offline.spec.ts`, see
"Offline mode"), the home map and Near Me on a phone (`home-map-mobile.spec.ts`, `near-me-mobile.spec.ts`) and 44×44px
tap targets (`tap-targets.spec.ts`).

First time on a laptop: `pnpm exec playwright install chromium`.

Prerendered pages hash their own inline scripts (Astro does it), so an unhashed inline script is caught on the
on-demand pages: sign-in and the Chairs' Area (the theme-script and Zod bugs fixed in #50 were both of that kind).

#### Smoke test a Preview

`SMOKE_BASE_URL=https://<preview-url> SMOKE_CHAIR_EMAIL=… SMOKE_CHAIR_PASSWORD=… pnpm check:built` runs the same checks
against a deployment. The suggest request is always stubbed (it is rate-limited per sender, and a smoke test shouldn't file petitions). Behind Deployment
Protection also set `VERCEL_AUTOMATION_BYPASS_SECRET`. Previews copy production data, including Chairs, so use a dedicated
smoke-test Chair that exists in production; the test only reads and signs in (the photo upload, visit and note are stubbed).

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

| Variable                                                          | Used for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                    | Pooled Neon connection (host contains `-pooler`) used by the running site. Set by the Vercel–Neon integration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `DATABASE_URL_UNPOOLED`                                           | Direct Neon connection for migrations and scripts; falls back to `DATABASE_URL`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `DATABASE_DRIVER`                                                 | `pg` (default, node-postgres over TCP, supports transactions). Set `neon-http` only where outbound Postgres connections (port 5432) are blocked, e.g. a sandboxed cloud dev environment; it sends queries over HTTPS and has no transactions.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `BETTER_AUTH_SECRET`                                              | Signing/encryption secret, at least 32 characters (`openssl rand -base64 32`). Different per environment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `BETTER_AUTH_URL`                                                 | Main site origin: `http://localhost:4321` locally, `https://mcrlunchclub.com` on Vercel Production. Not needed for Preview, which uses its own Vercel URL. See _Signing in on more than one domain_ below.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `BETTER_AUTH_ALLOWED_HOSTS`                                       | Optional, comma-separated: extra hosts the Chairs' Area works on, e.g. the production `mcr-lunch-club.vercel.app` alias.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `PASSKEY_ORIGIN` / `PASSKEY_RP_ID`                                | Optional. Where Chairs' passkeys work. Default to `BETTER_AUTH_URL` and its host name, which is right when that is the custom domain. Passkeys are bound to this one domain, so Previews and `vercel.app` addresses use passwords. See "Passkeys for Chairs".                                                                                                                                                                                                                                                                                                                                                                                                |
| `MEMBERS_FLAG`                                                    | Local and CI only: `on` or `off` forces the `members` flag (Vercel Flags) anywhere but Vercel, local builds included. Deployments always read Vercel Flags. Off when unset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `RESEND_API_KEY` / `RESEND_EMAIL_DOMAIN`                          | Set by the Resend integration. Sign-in email is sent only from the Production deployment; everywhere else (Previews included) the message is logged instead.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`                     | Cloudflare Turnstile keys for the member sign-in form. Read only on the Production deployment (secret key: sensitive, server-only); Previews and local use Cloudflare's test keys. With either missing in Production the form is closed.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `MAIL_FROM`                                                       | Optional sender, e.g. `MCR Lunch Club <noreply@mail.example.com>`. Defaults to `noreply@` the `RESEND_EMAIL_DOMAIN`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `MEMBER_SIGNUP_ENABLED`                                           | Kill switch: `false` stops member sign-in emails without a deploy (the request answers 503). On by default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `MEMBER_SIGNIN_DAILY_CAP`                                         | Optional site-wide limit on sign-in emails per day. Default 80, below Resend's free 100 a day.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `PRODUCTION_DATABASE_HOST`                                        | Preview builds: the production Neon host (e.g. `ep-calm-river-123456.eu-west-2.aws.neon.tech`, pooled or direct). Preview builds refuse to migrate a database on that endpoint. See _Preview deployments_ below.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `BLOB_READ_WRITE_TOKEN` / `BLOB_STORE_ID`                         | Vercel Blob credentials for venue photo uploads. Connecting a Blob store to the project adds one or the other: older stores set the token, newer stores set `BLOB_STORE_ID` and authenticate with the deployment's OIDC token (no secret to manage). Either works; without both the photo section is read-only. Server-only: `pnpm check:bundle` fails if it reaches the browser bundle.                                                                                                                                                                                                                                                                     |
| `SEED_CHAIR_EMAIL` / `SEED_CHAIR_NAME` / `SEED_CHAIR_PASSWORD`    | Only for `pnpm db:seed`. Remove them from your machine afterwards.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `SEED_MEMBER_EMAIL` / `SEED_MEMBER_NAME` / `SEED_MEMBER_PASSWORD` | Local and CI only: the test member for `pnpm db:seed:member` (`pnpm db:local` sets them). Never set them on Vercel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `ORS_API_KEY`                                                     | [OpenRouteService](https://openrouteservice.org) key, **server-only** (never prefix it with `PUBLIC_`). Powers the admin venue location search and the walking distance and time from HQ. Without it venues still save, but the location must be entered manually and routes stay "pending". `OPENROUTESERVICE_API_KEY` is accepted as an alternative name. Free Standard plan: 2,000 directions a day (40 a minute); Matrix has its own lower daily quota. Visitors never trigger requests, only admin saves and the backfill.                                                                                                                              |
| `METOFFICE_API_KEY`, `PUBLIC_MAP_API_KEY`                         | Optional weather and map tile keys.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `DEPLOY_HOOK_URL`                                                 | **Production only.** A Vercel Deploy Hook for `main` (**Settings → Git → Deploy Hooks**). Publishing (the bar's button, the nightly cron, closing or reopening a venue) POSTs to it so the prerendered public pages pick up the changes. Unset, saves still work but the public site only changes on the next deploy. Treat the URL as a secret. Never set it for Preview: a preview save would rebuild production.                                                                                                                                                                                                                                          |
| `CRON_SECRET`                                                     | **Production only.** Random string (`openssl rand -hex 32`). Vercel Cron sends it as a bearer token to `/api/cron/weekly-bulletin` and `/api/cron/publish-pending`, which refuse requests without it.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `PWA_KILL_SWITCH`                                                 | Emergency only. `1` makes the build ship a service worker that deletes every cache and unregisters itself (see _Offline mode_). Remove it once the bad worker is gone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `FLAGS`                                                           | Optional. A Vercel Flags SDK key, only for reading flags outside Vercel (on Vercel the deployment's OIDC token is used, so leave it unset there). The boolean `snow` flag (Vercel dashboard, **Flags**) switches the Christmas snowfall on or off live, per environment, with no redeploy; off, missing or unreadable means no snow. Add `?snow` to a URL to preview. The boolean `contact` flag is the contact form's kill switch and fails **open**: only a readable `false` closes the form (the page shows a fallback, `POST /api/contact` answers 503); unset, missing or unreadable leaves it on. Off Vercel, `CONTACT_FORM=on` or `off` overrides it. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`        | Chairs' push notifications (see _Push notifications for Chairs_). `pnpm push:keys` prints a pair; the subject is a `mailto:` for the club. All three set turns them on; with any missing the settings are hidden and nothing is sent, so local dev and Previews work without them. The private key is server-only.                                                                                                                                                                                                                                                                                                                                           |

### Local development with a Neon branch

Use a Neon **branch** so local work never touches production data:

1. In the Neon console open the project, go to **Branches → New branch**,
   branch from `main` (or "schema only" for an empty copy) and name it e.g. `dev`.
2. Copy the branch's pooled and direct connection strings into `.env.local`
   as `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. Run `pnpm db:migrate`, then `pnpm db:seed` to create your Chair, then
   `pnpm db:import` if the branch has no content yet.

### Scripts

| Command                                | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:generate`                     | Generate a migration in `drizzle/` after changing `src/db/schema.ts`. Commit it.                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm db:migrate`                      | Apply committed migrations (uses `DATABASE_URL_UNPOOLED`).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm db:migrate:deploy`               | Runs in the Vercel build after `publish:mark` and before `pnpm build` (which reads the database). Production builds migrate production; Preview builds migrate their own Neon branch; anywhere else it does nothing.                                                                                                                                                                                                                                                       |
| `pnpm db:studio`                       | Open Drizzle Studio.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `pnpm db:seed`                         | Create (or re-promote) the first Chair from `SEED_CHAIR_*`. Idempotent; refuses to run with `NODE_ENV=production` unless `--force` is passed. `--reset-password` resets an existing Chair's password. Prints the email only.                                                                                                                                                                                                                                               |
| `pnpm db:seed:member`                  | Create (or reset to `user`) the test member from `SEED_MEMBER_*`: verified, with a password that only works outside production. Idempotent; refuses to run with `NODE_ENV=production` unless `--force` is passed.                                                                                                                                                                                                                                                          |
| `pnpm db:local`                        | One-command local database: see _Local environment_ above.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm serve:build`                     | Serve the build output (`.vercel/output`) locally on the port of `BETTER_AUTH_URL`: prerendered pages from disk, everything else through the built function.                                                                                                                                                                                                                                                                                                               |
| `pnpm check:built`                     | Playwright smoke test of the build: see _Smoke test the build_ above.                                                                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm db:import`                       | Import `src/data/venues.json` and `src/data/incidents.json`. Idempotent (venues match on slug, records on title + date); existing rows are left alone. New venues get their tier from the file, so they are public at once. `--dry-run` reports without writing; `--update` overwrites existing venues' details but never their tier (tiers change only through two-Chair proposals); `--update-tiers` also overwrites tiers, bypassing that rule, so use it deliberately. |
| `pnpm auth:generate`                   | Regenerate `src/db/auth-schema.ts` with the Better Auth CLI matching the installed version. Follow with `pnpm db:generate`.                                                                                                                                                                                                                                                                                                                                                |
| `pnpm routes:backfill`                 | Replace distance and walking time with ORS walking routes for venues that have coordinates but no ORS route yet (the old straight-line estimates). Uses ORS Matrix, 25 venues per request, falling back to one Directions request per venue; throttled (`--delay-ms=2000`), resumable, stops cleanly on a rate limit. `--dry-run` lists venues without calling ORS; `--all` recomputes every venue; `--no-matrix` skips Matrix. Needs `ORS_API_KEY`.                       |
| `pnpm routes:geometry`                 | Store the route line drawn on each venue page's "Getting there" map: the walking path from HQ, or the driving path for venues more than 30 minutes' walk away (decided by the stored `walking_time_min`). One Directions request per venue, plus a driving one for far venues; throttled, resumable, stops cleanly on a rate limit. Distance and walking time are untouched. `--dry-run`, `--all`, `--delay-ms=`. Needs `ORS_API_KEY`; publish afterwards.                 |
| `pnpm publish:mark` / `publish:settle` | Run by the Vercel build (`vercel.json`), production builds only: `mark` writes the build's start time to `.publish-cut`, `settle` clears the pending changes saved before it.                                                                                                                                                                                                                                                                                              |
| `pnpm inspections:import-legacy`       | One-off: import the corrected inspection dates in `drizzle/data/legacy-inspections.json` as legacy inspections and rebuild every venue's "last inspected" date. Venues not on the list lose their old date unless `--keep-unlisted` is passed. Aborts if any name cannot be matched; idempotent; `--dry-run` shows the changes first.                                                                                                                                      |
| `pnpm venues:backfill-audit-trail`     | One-off: apply the Chairs' audit trail in `drizzle/data/audit-trail-backfill.json`: dual-verified inspections (with outcome and both Chairs) for venues that have no confirmed inspection yet, the date newly listed venues joined, and closures with their tier move. Anything already recorded is skipped, so it is idempotent; aborts if a venue or Chair cannot be found; `--dry-run` shows the changes first. Rebuild the site afterwards.                            |
| `pnpm test:db`                         | Integration tests for the transactional rules (inspections, proposals) against `TEST_DATABASE_URL`, a throwaway **local** database whose name contains `test` (tables are truncated).                                                                                                                                                                                                                                                                                      |
| `pnpm check:bundle`                    | After `pnpm build`: fail if the browser bundle contains `ORS_API_KEY` (name or value) or calls ORS directly.                                                                                                                                                                                                                                                                                                                                                               |
| `pnpm check:security [url]`            | Check that every `/admin` page and `/api/admin` route refuses anonymous and cross-origin requests, and that sign-up is disabled. Defaults to `http://localhost:4321`; pass the production URL after a deploy.                                                                                                                                                                                                                                                              |
| `pnpm push:keys`                       | Print a new VAPID key pair as `VAPID_PUBLIC_KEY=` / `VAPID_PRIVATE_KEY=` lines (see _Push notifications for Chairs_).                                                                                                                                                                                                                                                                                                                                                      |
| `pnpm pwa:kill-switch`                 | Over a local build, replace `/sw.js` with the worker that clears every cache and unregisters itself. On Vercel use `PWA_KILL_SWITCH=1` instead.                                                                                                                                                                                                                                                                                                                            |
| `pnpm test:coverage`                   | The unit tests with Node's coverage report.                                                                                                                                                                                                                                                                                                                                                                                                                                |

### Deploying to Vercel (runbook)

1. **Database**: add Neon from the Vercel Marketplace to the project so
   `DATABASE_URL` / `DATABASE_URL_UNPOOLED` are provisioned.
2. **Env vars**: set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` (the production
   domain) for Production, plus `BETTER_AUTH_ALLOWED_HOSTS` if you use the
   `vercel.app` address too. For Preview set a different `BETTER_AUTH_SECRET`
   and `PRODUCTION_DATABASE_HOST` (see _Preview deployments_ below).
3. **Blob (optional)**: create a Blob store under **Storage** and connect it to
   the project, which adds `BLOB_READ_WRITE_TOKEN` or `BLOB_STORE_ID` (Production and Preview).
   Keys are prefixed `prod/`, `preview/` or `dev/` by environment, so local and
   preview uploads never mix with production. Mind the Hobby plan's Blob limit:
   going over loses access to Blob rather than billing.
4. **Migrations run automatically** in every Vercel build. The `buildCommand`
   in `vercel.json` is
   `pnpm publish:mark && pnpm db:migrate:deploy && pnpm build && pnpm publish:settle`,
   so the database is migrated before the build reads it to prerender the
   public pages (keep `publish:mark` first and `publish:settle` last):
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
   `CRON_SECRET`, both for Production only. Then redeploy. `vercel.json` has
   two crons: the weekly bulletin rebuild at 00:00 UTC on Thursday, after the
   bulletin's 23:59 Wednesday London issue time all year (Hobby crons fire at
   some point in the scheduled hour, so it can't be set to the issue minute
   itself), and the pending-changes publish at 05:00 UTC daily.
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
   runs them on every pull request and push to `main` instead: lint, format
   check, knip, unit tests, typecheck, the database integration tests against
   a Postgres service, a build (which fails on any CSP warning),
   `pnpm check:bundle` and `pnpm check:built`. In **GitHub → Settings → Branches**, protect
   `main` and make **checks** (the CI workflow's job) a required status check, so nothing reaches
   production (or its database migrations) untested.

### Offline mode and installing the app

The public site is an installable PWA that keeps working with no signal. It is prerendered, so caching a page caches
its data. The Chairs' Area stays **online-only**, and nothing is ever queued for later: tier proposals, "Visited today",
suggestions and admin saves are all live requests (the server's Europe/London day and the two-Chair rules need it).

- **Manifest and install:** `public/manifest.webmanifest` (icons, maskable icon, shortcuts for Near Me and the Chairs'
  Area). The Chairs' Area has its own `public/chairs.webmanifest` (`id`, `scope` and `start_url` all `/admin`), linked
  from `AdminLayout.astro`, so adding `/admin` to the Home Screen installs a separate Chairs app that opens at the
  Chairs' Area rather than the public map. The footer offers "Install app" through `beforeinstallprompt` on Chrome/Android and a "Share → Add to Home
  Screen" hint on iOS Safari; neither appears once installed, and there is never an automatic pop-up. Standalone mode
  has no browser back button, so a Back strip (`StandaloneBack.astro`) shows only there.
- **Worker:** `src/sw/sw.ts`, bundled with esbuild and given its precache list by Workbox `injectManifest` over
  `.vercel/output/static` (`scripts/build-sw.ts`, the last step of `pnpm build`, so before `publish:settle`). It is
  served from `/sw.js` with `Cache-Control: no-cache` (`vercel.json`) and registered by `src/pwa/register.ts` in
  production builds only, so `pnpm dev` never registers one; `pnpm serve:build` and Previews do.
- **What is cached:** the shell pages and hashed assets are precached. Public HTML is network-first (3 s) then the
  device's copy, then `/offline`. Venue pages are saved as visited and warmed while the browser is idle. Venue photo
  thumbnails are cache-first (200 entries, 30 days), CARTO tiles cache-first (1,500 tiles, 30 days, requested with CORS);
  a full-size photo is network-only and falls back to its saved thumbnail. Offline Near Me works from the saved page and
  GPS, and the map keeps its pins on a plain background where tiles are missing.
  `/admin/**`, `/api/**`, `/og/**` and anything but GET are never intercepted for content; a failed navigation into the
  Chairs' Area shows the static `/chairs-offline` page. The rules live in `src/lib/pwa/routing.ts` (unit tested), and
  `e2e/offline.spec.ts` asserts no `/admin` or `/api` URL ever reaches Cache Storage.
- **Freshness:** a page served from the device carries `data-saved-copy` on `<html>`, and the bar at the top reads
  "Offline · verdicts as of …" from the `mcr-built-at` meta tag. A new worker waits: public pages offer "New verdicts
  published · Refresh"; the Chairs' Area never reloads over a form, and the worker takes over on the next cold launch.
- **Not planned:** bulk pre-download of map tiles ("Save map for offline"). Tiles are saved only as they are viewed.
- **Kill switch:** if a bad worker gets stuck in browsers, set `PWA_KILL_SWITCH=1` on the Vercel project and redeploy.
  The build then writes a worker that deletes every cache and unregisters itself instead of the real one (visitors pick
  it up on their next visit). `pnpm pwa:kill-switch` does the same over a local build. Remove the variable afterwards.
- **Cache versions:** bump `VERSION` in `src/sw/sw.ts` to discard every saved cache; older `mcr-*` caches are deleted on
  activate. `mcrlunchclub.com` and `mcr-lunch-club.vercel.app` are separate origins with separate workers and caches.
- **Manual checks** (not in CI; repeat after changing the worker, manifests or layouts): install on an iPhone (Home
  Screen) and on Android, switch to airplane mode, open the app, use Near Me, and check Back everywhere; run
  Lighthouse's installability audit.

### Push notifications for Chairs

A Chair can opt in, per device, to a Web Push notification when something waits for them: a verdict proposal to
countersign (including a new venue or an accepted suggestion), a decision on their own proposal, a "Visited today" to
countersign (or their own visit countersigned), and, if they switch it on, new public suggestions. Tapping one opens the
item in the Chairs' Area, which shows its live state: a notification can be stale by then, and that is fine.

- **Setup:** run `pnpm push:keys` once and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` in Vercel
  (Production; Preview too if you want to test there). Pushes are signed with these keys and sent with `web-push` from
  the functions in `lhr1`, straight to each browser's push service: no third-party push provider. `pnpm db:local` writes
  local keys into a new `.env.local`; CI generates throwaway ones per run.
- **Rotating keys** invalidates every subscription. Each device notices the new key on its next Chairs' Area visit and
  resubscribes silently (`src/pwa/push-client.ts`).
- **Who gets what:** never the Chair who acted, only active Chairs, only events they have on (account-wide, at
  `/admin/account`; suggestions are off by default). Decisions and countersigns go to the one Chair concerned.
  Deactivating a Chair deletes their devices; deleting the user cascades. Rules: `src/lib/push/messages.ts`.
- **When:** after the action's transaction commits, with `waitUntil`, never awaited (`notifyChairs` in
  `src/lib/push/dispatch.ts`). A failed push never fails the action, and a refused or rolled-back action sends nothing.
- **Payloads** carry the event, venue, who acted, a tag and the target URL, never decline reasons, notes or suggestion
  text: they show on lock screens. They stay under 3 KB (unit tested).
- **Delivery:** 404/410 delete the subscription; 429/5xx get one retry after a short backoff; everything else is logged.
  "Visited today" pushes are `high` urgency and expire at London midnight; suggestions are `low` and collapse into one
  rolling notification, at most one per Chair every ten minutes.
- **Platforms:** iPhone and iPad (iOS 16.4+) only from the app added to the Home Screen; Safari tabs get the "Add to Home
  Screen" steps instead. Android and desktop browsers work in the browser or installed. The permission prompt only
  appears after a tap on "Enable notifications". The service worker shows the notification and sets the app badge
  (items the Chair can act on); it caches nothing for them, so the Chairs' Area stays uncached.
- **Manual checks** (Playwright cannot receive a push): on an installed iPhone, Android Chrome and desktop Chrome or
  Safari, have one Chair propose and check another is notified; tap through to the right page; tap after it was decided
  and see the decided state; tap a "Visited today" push after midnight and see it lapsed.

### Preview deployments (a Neon branch per pull request)

Every pull request gets a Vercel Preview deployment with its own Neon branch,
`preview/<git-branch>`, copied from production when the branch is first
deployed. Changes made on a preview (signing in, editing venues) never touch
production, and the preview build applies the pull request's migrations to its
branch so the schema matches the code.

One-off setup:

1. **Turn on Preview branching** in the Neon integration. Vercel-managed
   (Marketplace) integration: **Vercel → Storage → your database → Settings /
   Connect Project**, tick **Preview** under _Deployments Configuration_, and
   turn on **Resource must be active before deployment** so the build waits for
   the branch. Neon-managed integration: **Neon Console → Integrations → Vercel →
   Manage** and enable preview branches (and _Automatically delete obsolete Neon
   branches_). The branch's `DATABASE_URL` / `DATABASE_URL_UNPOOLED` are
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

### Member sign-in (#136)

Members sign in by email: one request sends one email with a magic link and a 6-digit code (for
reading the email on another device). Everything is behind the `members` Vercel Flags flag, which
fails closed and is checked on the server. Turnstile (below) is in place, so Production can turn it on.

- **Requests** go only through `POST /api/member/sign-in` (`GET` hands the form its time-trap
  token): the flag, the `MEMBER_SIGNUP_ENABLED` kill switch, a trusted origin, the honeypot and
  time trap, the Turnstile check, then rate limits per email, per IP and site-wide (`src/lib/members/sign-in.ts`, table
  `member_sign_in_requests`, hashes only, two days' history). The answer never says whether an
  email has an account.
- **Turnstile** guards the request form. The form loads Cloudflare's widget (only on
  `/members/sign-in`) and sends its single-use token; the route checks it with `siteverify`
  (`src/lib/members/turnstile.ts`) after the free checks and before any rate limit is used. An
  unreachable Cloudflare or a missing secret refuses the request (503), never lets it through.
  Production uses `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`; everywhere else (local, CI,
  Previews) uses Cloudflare's always-pass test keys, so no real challenge is needed. The widget's
  hostname list in the Cloudflare dashboard must include the production host.
  `challenges.cloudflare.com` is in `script-src`, `frame-src` and `connect-src` (`security.csp`).
- **Better Auth's own request endpoints are closed to the web**, and so is every email-code
  endpoint the club doesn't use, password reset by email included (`src/lib/members/auth-paths.ts`).
  Verifying a link (`/api/auth/magic-link/verify`) or code (`/api/auth/sign-in/email-otp`) is
  open while the flag is on.
- **Chairs never sign in by email.** No link or code is made for a Chair's address, and a session
  created by email for a Chair is refused (`databaseHooks` in `src/lib/auth-config.ts`).
- **Links and codes** work once, for 10 minutes; a code allows 5 wrong guesses. Both are stored
  hashed.
- **Member passkeys** can be added only within five minutes of an email sign-in, while the flag is
  on. Chairs still confirm their password.
- **Email** goes through Resend from the Production deployment only (`src/lib/mail/send.ts`), never
  awaited. Locally, in CI and on Previews the message is logged, so the link and code appear in the
  server log.
- A readable `signed_in=1` cookie follows the session, so public pages can tell whether to ask the
  server who is signed in (epic #135, "Performance budget").

Locally: `MEMBERS_FLAG=on pnpm dev`, sign in at `/members/sign-in`, and copy the link or code
from the terminal.

### Member accounts and the Members list (#136)

- **Pages** (on demand, behind the flag): `/members/sign-in` (email, then link or code; or a
  passkey), `/members/me` (display name, privacy, passkeys, sign out) and `/members/me/data`
  (download a JSON copy, delete the account). The middleware sends a signed-out visitor from
  `/members/me/**` to sign in, and a Chair to `/admin`. `/api/member/**` has the admin API's
  origin check on writes and `no-store`; its routes use `memberRoute` (`src/lib/member-api.ts`).
- **Profiles** are `member_profiles`, one row per member, created on first visit. Display names
  are 2–30 characters, unique ignoring case (`src/lib/members/display-name.ts`) and checked on the
  server by a profanity filter (`obscenity`, `src/lib/members/display-name-filter.ts`, never in the
  browser). Names are private until the member turns on "Show my name publicly".
- **Moderation** is the Chairs' Members list (`/admin/members`): when each member joined, their
  display name and its state, no email addresses. A Chair can hide a name (it stays taken, by
  everyone: `member_reserved_names`), let a member whose second name was hidden choose again, or
  ban the account (Better Auth's ban). Every action is logged in `member_events`. A member whose
  name is hidden may choose one new name; if that is hidden too, only a Chair can unlock it.
- **Deleting an account** needs a sign-in in the last ten minutes (`freshAge` is `0`, so this is
  checked explicitly). It deletes the account and every member-owned row by cascade, including
  `member_events`, plus the member's sign-in rate-limit hashes and any unused link, code or passkey
  grant. Nothing is kept: a banned member who deletes their account can join again. Tables added
  later for member-owned data must cascade the same way (the rule is above `memberProfiles` in
  `src/db/schema.ts`).
- **The member link** (`src/components/MemberHeader.astro`) is the last item of the nav: at the far right of the pill on wide screens, at the bottom of the burger menu on phones. It is rendered only while the flag is
  on. Prerendered pages read the flag when they are built, so turning the flag on in Vercel shows
  "Sign in" on them from the next deployment. The island asks `/api/member/session` who is signed
  in only when the `signed_in` hint cookie is set, and that route clears a hint that outlived its
  session. A Chair sees a link to the Chairs' Area.
- **Testing locally:** the seeded test member (`member@lunch.test`) has a display name. Build and
  serve with `MEMBERS_FLAG=on` to see the header on prerendered pages; `MEMBERS_FLAG=on pnpm
check:built e2e/member-accounts.spec.ts` runs the member pages in a browser (CI does this after
  the main `check:built`, against the same build).

### Passkeys for Chairs

Chairs can sign in with a passkey (#153), with their password as the fallback.
A Chair signs in with their password, opens **Account → Passkeys**, confirms
their password and follows the browser's prompt; synced passkeys (iCloud
Keychain, Google Password Manager) then work on their other devices, and
"use a phone" in the browser prompt signs in on a computer that has none.

- **One domain.** A passkey belongs to the domain it was made on: the
  `BETTER_AUTH_URL` host (or `PASSKEY_ORIGIN` / `PASSKEY_RP_ID`) in Production,
  `localhost` locally. Elsewhere, including Previews, the passkey button is
  hidden and Chairs use their password.
- **Adding one needs the password**, checked by
  `POST /api/admin/account/passkey-grant` (five wrong passwords in 15 minutes
  lock the check). The grant lasts five minutes and allows one passkey, so a
  stolen session cookie alone cannot add a passkey.
- **Recovery removes passkeys.** Resetting a Chair's password, deactivating them,
  or **Remove passkeys** on `/admin/users` deletes every passkey on the account
  and signs them out everywhere.
- The Chair gets a push notification whenever a passkey is added to their
  account (always on, whatever their notification settings).
- Every Chair keeps a password. Logic: `src/lib/passkeys.ts` and the hooks in
  `src/lib/auth-config.ts`.

### Operating notes

- **Chairs**: create accounts, deactivate (ban) them and set temporary
  passwords from `/admin/users`. Deactivating signs the user out everywhere.
  There is no email sending, so share initial/temporary passwords securely.
  Chairs change their own password, sign out other devices and set up
  notifications at `/admin/account`.
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
  map's walking rings stay straight-line, at 24 minutes a mile allowing for a
  1.2× detour over the straight line, about 56 m a minute
  (`WALKING_METRES_PER_MINUTE` in `src/lib/map/config.ts`). Stored walking
  times use the same 24 minutes a mile over the routed distance.
- **Tier changes need two Chairs**: a venue's tier is never edited directly.
  Any Chair proposes a change from the venue page (a new venue's form takes a
  "Proposed tier"); a **different** Chair approves or declines it from the
  venue page or **Pending** (`/admin/pending`). Declining needs a reason,
  which is internal and never public. One pending proposal per venue: only
  its proposer can withdraw or replace it. Until approval the public site
  keeps the last approved tier, and a new venue stays hidden. Moving a venue
  into Approved follows the manifesto's Two-Visit Rule: two separate
  satisfactory visits. **Temporary exception:** while legacy venues whose
  earlier visits went unrecorded are being assessed, the code
  (`src/lib/tier-proposals.ts`) asks for only one dual-verified inspection.
  Restore the full rule in code once they have all been assessed. With only one active Chair
  nothing can be approved; there is no override. Chairs who have turned on
  push notifications are told about proposals to countersign and decisions on
  their own (see _Push notifications for Chairs_).
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
- **Visits and field notes** (Chairs only, never public): a visit is one Chair
  at one venue on one UK day. Every **Visited today** press records the
  presser's visit, linked to the inspection it started or confirmed; **Log a
  visit** on the venue page records one for today or an earlier day with no
  inspection, so a venue can be visited a third or tenth time without a new
  inspection. A visit on its own never changes "last inspected", an
  inspection or a tier, and nothing is queued for publishing. A Chair writes
  **field notes** (plain text, up to 4,000 characters) on their **own**
  visits at any time, and can edit (shown as "edited") or delete them; every
  active Chair reads every note on every visit. The venue page's **Visits &
  Field Notes** section lists them all, and a motion that cites an
  inspection shows its visits' notes on the venue page and on **Pending**.
  The timeline says "Visit logged" and "Field note added", never the text.
  Visits and notes live in `venue_visits` and `visit_notes`
  (`src/lib/visits.ts`, `src/lib/field-notes.ts`), apart from `inspections`;
  a database check keeps every note `internal` until a public release, and
  `src/test/public-safety.test.ts` keeps public code away from them.
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
│   │   ├── PwaStatus.vue, InstallApp.vue, StandaloneBack.astro  # Offline bar, update notice, install control, Back strip
│   │   └── WeatherCard.vue
│   ├── data/                  # Import source (venues.json, incidents.json) and the FAQ copy (faqs.ts)
│   ├── db/                    # Drizzle schema (app + Better Auth)
│   ├── lib/                   # Auth, database, validation, public data and admin helpers (see Shared modules)
│   │   ├── map/               # Leaflet config, scene, pins, clusters, framing, labels
│   │   ├── near-me/           # Near Me's pure rules
│   │   ├── push/              # Chairs' push notifications: messages, dispatch, delivery
│   │   └── pwa/               # Service worker routing rules, install and offline helpers
│   ├── layouts/               # Public and admin page shells
│   ├── pages/
│   │   ├── index.astro        # Sovereign Map view
│   │   ├── hall-of-shame.astro, inspections.astro, manifesto.astro, faqs.astro, 404.astro
│   │   ├── offline.astro, chairs-offline.astro  # Offline fallbacks served by the service worker
│   │   ├── admin/             # Chairs' Area
│   │   ├── api/               # Public, admin, auth, cron, flag and weather endpoints
│   │   ├── og/venues/[slug].png.ts # Social cards for venues without a photo
│   │   ├── verdicts/[tier].astro # Verdict pages
│   │   └── venues/[slug].astro# Venue dossiers
│   ├── pwa/                   # Browser side: worker registration, push subscription
│   ├── sw/                    # The service worker (sw.ts) and the kill-switch worker
│   ├── stores/                # Nanostores: filters, results, venue ledger, online, PWA and publish state
│   ├── styles/
│   │   ├── theme.css          # Colour tokens (@theme) and base styles, shared
│   │   ├── map.css            # Leaflet pins, HQ marker and popups, shared
│   │   ├── global.css         # The public site (Layout.astro); Tailwind scans public files only
│   │   └── admin.css          # The Chairs' Area (AdminLayout.astro); Tailwind scans admin files only
│   └── types/index.ts         # Shared TypeScript interfaces
├── drizzle/                   # Committed SQL migrations (data/: one-off import files)
├── public/                    # Static files: manifests, icons, brand images, self-hosted fonts
├── scripts/
│   ├── migrate.ts             # pnpm db:migrate
│   ├── migrate-deploy.ts      # pnpm db:migrate:deploy (Vercel builds)
│   ├── seed-chair.ts          # pnpm db:seed
│   ├── seed-member.ts         # pnpm db:seed:member
│   ├── import-existing-content.ts  # pnpm db:import
│   ├── import-legacy-inspections.ts # pnpm inspections:import-legacy
│   ├── backfill-audit-trail.ts # pnpm venues:backfill-audit-trail
│   ├── backfill-routes.ts     # pnpm routes:backfill
│   ├── backfill-route-geometry.ts # pnpm routes:geometry
│   ├── check-admin-security.ts     # pnpm check:security
│   ├── check-client-bundle.ts      # pnpm check:bundle
│   ├── build-sw.ts            # last step of pnpm build: writes /sw.js
│   ├── kill-switch-sw.ts      # pnpm pwa:kill-switch
│   ├── generate-vapid-keys.ts # pnpm push:keys
│   ├── publish-mark.ts, publish-settle.ts # pnpm publish:mark / publish:settle (Vercel builds)
│   ├── db-local.sh            # pnpm db:local
│   ├── serve-build.ts         # pnpm serve:build
│   └── test-db.ts             # pnpm test:db
├── e2e/                       # Playwright smoke test of the build (pnpm check:built)
├── .github/workflows/         # ci.yml (every PR and push to main), preview-smoke.yml (opt-in)
├── docker-compose.yml         # Postgres 16 for pnpm db:local -- --docker
├── vercel.json                # Build command, crons, headers
└── astro.config.mjs
```
