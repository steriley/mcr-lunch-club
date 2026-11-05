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
- **Tiers.** `venues.tier` changes only through two-Chair proposals (`src/lib/tier-proposals.ts`), never through `venueInputSchema` or an admin edit. The one exception is `pnpm db:import`, the bootstrap path, which sets the tier of _new_ venues; `--update` leaves existing tiers alone and `--update-tiers` is the explicit opt-in. A venue with no tier is hidden.
- **Publishing.** The public pages are prerendered, so a domain operation that changes the public site returns `published: { action, venueId, when }` in its `Outcome` (`src/lib/outcome.ts`), and `adminRoute` records it (`'queue'`) or records and fires the hook with `waitUntil` (`'now'`); it never awaits the Deploy Hook. The operation names the venue it changed, so a route does not declare one. Only `POST /api/admin/publish` waits on it. Pending changes are cleared by `pnpm publish:settle` at the end of a production build, never by the hook's response, so keep `publish:mark` first and `publish:settle` last in the `vercel.json` `buildCommand`. Logic is in `src/lib/publishing.ts`.
- **Offline / PWA.** `pnpm build` ends by writing `/sw.js` into `.vercel/output/static` (`scripts/build-sw.ts`, Workbox `injectManifest`), so it stays before `publish:settle`. `/admin/**`, `/api/**` and non-GET requests are never cached or queued (`src/lib/pwa/routing.ts`); a new `is:inline` script, or any change to `worker-src` / `manifest-src` in `astro.config.mjs`, needs `pnpm check:built` (see `e2e/offline.spec.ts`). Kill switch: `PWA_KILL_SWITCH=1` (README, "Offline mode").
- **Push notifications.** An admin action notifies Chairs with `notifyChairs` (`src/lib/push/dispatch.ts`) only after its transaction has returned successfully, never inside it and never awaited. Payloads never carry decline reasons, notes or suggestion text (`src/lib/push/messages.ts`). Without all three `VAPID_*` variables the feature is off; `pnpm push:keys` makes a pair.
- **Visits and field notes** are Chairs-only. No public page, component or `public-data.ts` touches `venue_visits` / `visit_notes` or their modules (`src/test/public-safety.test.ts`); only the visit's own Chair writes a note (`src/lib/field-notes.ts`); their operations never return `published` for notes (a visit press does, as it can confirm an inspection); the `visit_notes_internal_only` check stays until a reviewed public release.
- **Outcomes.** A domain operation returns an `Outcome` with a domain error code, never an HTTP status or message: `ERROR_HTTP` in `src/lib/admin-api.ts` is the one code-to-response table (`src/test/layering.test.ts` forbids `*_STATUS` exports in `src/lib`). Every operation on a venue is in `src/lib/venue-lifecycle.ts`; route tests stub one `venueLifecycle` function (`stubLifecycle`) and behaviour is tested in `pnpm test:db`.
- Domain modules in `src/lib` never import `admin-api` or `auth` (`src/test/layering.test.ts`).

## Merging

Merge PRs with **rebase**. Squash and merge commits are disabled on this repo (the API answers 405), so go straight to `rebase`.

## Before you push

```bash
pnpm lint && pnpm format:check && pnpm knip && pnpm test && pnpm typecheck && pnpm test:db     # test:db reads TEST_DATABASE_URL from .env.local
pnpm build && pnpm check:bundle && pnpm check:built
```

CI runs the same sequence (`.github/workflows/ci.yml`). Playwright is pinned to the version whose Chromium the cloud container already has; bump it deliberately.
