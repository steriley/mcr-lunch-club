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
- Local logins (local-only, from `.env.local`):
  - Chair: `chair@lunch.test` / `local-chair-password` (`admin`).
  - Test member: `member@lunch.test` / `local-member-password` (`user`, never a Chair; its password is refused whenever `NODE_ENV` is production).

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
- **Passkeys (Chairs only).** Registration needs a password grant (`src/lib/passkeys.ts`), enforced by the hooks in `src/lib/auth-config.ts`; that is why `session.freshAge` is `0`, so any new "fresh session" endpoint needs its own re-check. Password reset, ban and "Remove passkeys" delete a Chair's passkeys. The passkey domain is fixed (`getPasskeyEnvironment`), never the request host. Every Chair keeps a password.
- **Outcomes.** A domain operation returns an `Outcome` with a domain error code, never an HTTP status or message: `ERROR_HTTP` in `src/lib/admin-api.ts` is the one code-to-response table (`src/test/layering.test.ts` forbids `*_STATUS` exports in `src/lib`). Every operation on a venue is in `src/lib/venue-lifecycle.ts`; route tests stub one `venueLifecycle` function (`stubLifecycle`) and behaviour is tested in `pnpm test:db`.
- **Members vs Chairs.** Members are the `user` role. Anything that counts or notifies Chairs narrows in SQL with `roleMentionsAdmin` (`src/lib/chair-accounts.ts`) and then applies `isActiveChair`. The Users page lists Chairs (deactivated ones included) through Better Auth's `listUsers` with the same `contains admin` filter plus `hasAdminRole`, and its account actions are Chairs-only (`unlessChairAccount`). Public pages make no `/api/member/**` or `/api/auth/**` request for a signed-out visitor and stay within the venue-page JavaScript budget (`e2e/members.spec.ts`, epic #135 "Performance budget").
- **Member sign-in.** Everything member-facing is behind the `members` flag, checked on the server (`src/lib/members/flag.ts`, middleware, `src/pages/api/auth/[...all].ts`). Sign-in emails are requested only through `POST /api/member/sign-in`; Better Auth's own request endpoints and the unused email-code endpoints stay closed (`src/lib/members/auth-paths.ts`). Chairs never sign in by email. Email is sent only from the Production deployment (`src/lib/mail/send.ts`) and never logged there. The request form is guarded by Turnstile (`src/lib/members/turnstile.ts`), checked after the honeypot and time trap and before the rate limits; only Production uses the real `TURNSTILE_*` keys, other environments use Cloudflare's test keys, and a missing key or an unreachable Cloudflare refuses the request. `challenges.cloudflare.com` stays in `script-src`, `frame-src` and `connect-src`.
- **Member accounts.** Every member-owned table references `user.id` with `on delete cascade`, `member_events` included: deleting an account keeps nothing, not even a ban (rule above `memberProfiles` in `src/db/schema.ts`). Display names are checked on the server (`src/lib/members/profiles.ts`); the profanity filter never ships to the browser. A hidden name stays taken (`member_reserved_names`). Deleting an account needs a sign-in in the last ten minutes, checked explicitly (`freshAge` is `0`). Member operations are on `memberAccounts`, which route tests stub; `/api/member/**` routes use `memberRoute` (`src/lib/member-api.ts`), which refuses Chairs. The member link (last item in each nav, `MemberHeader.astro`) calls `/api/member/session` once, only when the `signed_in` hint is set. `MEMBERS_FLAG=on|off` overrides the flag anywhere but Vercel (local builds too).
- **People's Inspections (member lunch logs, #137).** `member_inspections` is apart from the Chairs' `inspections` and never touches tiers or publishing (only recording a stuffing attempt, which adds a bribery record, returns `published`). One log per member per London day (unique index plus a one-new-log-a-day check in `src/lib/member-inspections.ts`); pure rules and thresholds are in `src/lib/member-inspection-rules.ts`. The member's position is used for the 150 m check and never stored. The venue page fetches `/api/venues/<slug>/public-inspections` (flag-gated, outside `/api/member`), which carries no member id, email or position (`src/test/public-safety.test.ts`); its island imports `member-inspection-display.ts`, not the Zod rules, to stay within the JavaScript budget. `/log/**` is a member page (`isMemberAccountPage`).
- **The People's Verdict / Swing-o-meter (#138).** The Chairs give a verdict, not a score: three bands (`src/lib/swing.ts`, fixed cut-offs 0–30 / 30–65 / 65–100), no numeric swing, and holding venues get a Straw Poll with no headline of agreement. Gone But Not Forgotten and closed venues get no meter. Below the quorum (`SWING_QUORUM`, a constant in `src/lib/swing.ts`) the venue-page section stays hidden (the island reveals it) and "Recent inspections from the public" carries a note explaining why (`verdictPending` in the public feed). `venue_public_scores` stores aggregates only (no tier), recomputed by `recomputeVenueScore` inside every log write and moderation transaction (`src/lib/public-scores.ts`) and daily by `/api/cron/refresh-scores` (bans, deleted accounts, history); the score is finished against the current tier at read time, so a tier change needs no recompute. Everything is behind the `members` flag: the venue-page island, `/the-count`, `GET /api/public/venues/[slug]/swing`, `GET /api/public/the-count` and the cron. Nothing public carries a member id, email or position, and the section's explanation says it is a guide and the Chairs decide.
- Domain modules in `src/lib` never import `admin-api` or `auth` (`src/test/layering.test.ts`).

## Merging

Merge PRs with **rebase**. Squash and merge commits are disabled on this repo (the API answers 405), so go straight to `rebase`.

## Before you push

```bash
pnpm lint && pnpm format:check && pnpm knip && pnpm test && pnpm typecheck && pnpm test:db     # test:db reads TEST_DATABASE_URL from .env.local
pnpm build && pnpm check:bundle && pnpm check:built
```

CI runs the same sequence (`.github/workflows/ci.yml`). Playwright is pinned to the version whose Chromium the cloud container already has; bump it deliberately.
