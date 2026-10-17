# MCR Lunch Club — Admin Area & Authentication Build Spec

**Audience:** GitHub Copilot (Agent mode) working in this repository.
**Goal:** Add authentication (Better Auth) and a protected admin area so the Chairs can create, edit and publish venue content, backed by a Neon Postgres database, deployed on Vercel's free (Hobby) tier.

---

## 0. How to work (read first)

1. **Work one phase at a time** (Section 12). At the end of each phase: run the type check and a production build, summarise what changed, list any decisions you made, and **stop for review**. Do not start the next phase until told to.
2. **Inspect before you build.** Phase 0 is read-only reconnaissance. Do not write code until you've reported what you found.
3. **Do not guess library APIs.** Better Auth, Astro, Drizzle and `@vercel/blob` all change between versions. Check the installed versions in `package.json` and consult their current documentation (use any docs/MCP tool available, or the official docs sites) before writing integration code. Where this spec shows code, it is a _sketch of intent_, not copy-paste truth.
4. **Do not break the public site.** Existing public pages, branding, styles and routes must keep working throughout. Do not redesign anything public.
5. **Match existing conventions:** TypeScript, existing folder layout, existing CSS approach, existing Vue island patterns. Don't introduce a new UI/component library or CSS framework unless the repo already uses one.
6. **Never commit secrets.** No keys, tokens, connection strings or passwords in source, logs, comments or example files (use placeholders in `.env.example`).
7. **Ask rather than assume** when something is genuinely ambiguous. Otherwise make a sensible choice and record it in the phase summary.

---

## 1. Project context

- **Site:** MCR Lunch Club — a map-based site for a Manchester lunch club run by "Chairs". Content comes from the club's document and is organised into venue tiers (see Section 5).
- **Stack (existing):** Astro with Vue islands. Runs locally at `http://localhost:4321`.
- **Hosting:** Vercel, Hobby plan.
- **New:** Better Auth for authentication, Neon Postgres (added via the Vercel Marketplace) for data, Drizzle ORM, optional Vercel Blob for images.
- **Users:** A small number of trusted Chairs/editors. **There is no public registration.** Public visitors browse without logging in.
- **Branding:** Header reads "MCR Lunch Club". Do not add "Manchester" to the strapline or title. Use the existing header/logo in the admin area. Label the admin section **"Chairs' Area"** (placeholder, easy to rename in one place).

---

## 2. Architecture decisions

| Concern    | Decision                                                                                                                                                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering  | Keep public pages as they are today where possible. Admin pages and all API routes are **server-rendered** (`export const prerender = false`). Use the `@astrojs/vercel` adapter. Check the Astro version's rules for mixing static and on-demand routes and configure `astro.config.*` accordingly.                             |
| Auth       | Better Auth, email + password, **sign-up disabled**, secure cookie sessions. Roles via Better Auth's admin plugin (or equivalent): `admin` = Chair with full access.                                                                                                                                                             |
| Database   | Neon Postgres via `DATABASE_URL` (injected by the Vercel–Neon integration).                                                                                                                                                                                                                                                      |
| ORM        | Drizzle ORM + drizzle-kit migrations.                                                                                                                                                                                                                                                                                            |
| DB driver  | Prefer node-postgres (`pg`) with Neon's **pooled** connection string (host contains `-pooler`) and a small pool size. If you use Neon's serverless driver instead, use the WebSocket/Pool variant, **not** the HTTP variant, because the HTTP variant does not support transactions. Explain your choice in the Phase 1 summary. |
| Validation | Zod on every API input, shared with the Vue forms where practical.                                                                                                                                                                                                                                                               |
| Admin UI   | Astro pages (shell/layout) + Vue islands for interactive pieces (forms, tables, dialogs).                                                                                                                                                                                                                                        |
| Images     | Optional, Phase 6: `@vercel/blob`.                                                                                                                                                                                                                                                                                               |

---

## 3. Dependencies

Add only what's needed, pinned by the package manager the repo already uses:

- `better-auth`
- `drizzle-orm`, `drizzle-kit` (dev)
- `pg` and `@types/pg` (or Neon serverless driver, see Section 2)
- `zod`
- `@astrojs/vercel`
- `@vercel/blob` (Phase 6 only)
- `dotenv` or `tsx` (dev) only if needed for the seed/migration scripts

Do not add anything else without noting why.

---

## 4. Environment variables

Create `.env.example` (committed, placeholders only) and ensure `.env` / `.env.local` are in `.gitignore`.

```
DATABASE_URL=            # Neon pooled connection string
DATABASE_URL_UNPOOLED=   # Neon direct connection string, for migrations (if provided by the integration)
BETTER_AUTH_SECRET=      # long random string (openssl rand -base64 32)
BETTER_AUTH_URL=         # http://localhost:4321 locally; production URL on Vercel
BLOB_READ_WRITE_TOKEN=   # Phase 6 only
SEED_CHAIR_EMAIL=        # used only by the seed script
SEED_CHAIR_NAME=         # used only by the seed script
SEED_CHAIR_PASSWORD=     # used only by the seed script; never commit
```

Notes:

- Access env vars the Astro-appropriate way (`import.meta.env` / `astro:env`, depending on version). Server-only vars must never reach client bundles.
- Document in `README` (a short "Admin setup" section) how to create a Neon dev branch for local development so local work never touches production data.

---

## 5. Data model

First, **inspect how venue content is currently stored** (markdown, JSON, content collections, hard-coded arrays, etc.) and report it in Phase 0. The schema below is the target; reconcile it with existing fields so nothing is lost. If the existing content has fields not listed here, add them.

### Tiers (enum)

Use exactly these labels from the club's document, stored as snake_case values with display labels:

| Value                    | Display label          |
| ------------------------ | ---------------------- |
| `approved`               | Approved               |
| `under_consideration`    | Under Consideration    |
| `to_be_assessed`         | To Be Assessed         |
| `rejected`               | Rejected               |
| `if_we_must`             | If We Must             |
| `gone_but_not_forgotten` | Gone But Not Forgotten |

Keep tier values and labels in **one shared module** used by the DB schema, the API validation, the admin UI and the public site.

### Tables (application)

**`venues`**

- `id` uuid pk
- `slug` text unique, not null (auto-generated from name, editable, unique-checked)
- `name` text not null
- `tier` tier enum not null
- `address` text
- `latitude`, `longitude` numeric, nullable (for the map)
- `summary` text (short blurb, shown on cards and map popups)
- `verdict` text (long-form write-up, markdown allowed; sanitise when rendering)
- `pull_quote` text, nullable (displayed prominently on the venue page)
- `lunch_special` text, nullable (e.g. an "Eat Like Us" entry such as a set deal)
- `website_url` text, nullable
- `image_url` text, nullable
- `published` boolean not null default false
- `sort_order` integer default 0
- `created_at`, `updated_at` timestamptz
- `updated_by` text, nullable, references the auth user id

**`bribery_records`** (the club's Bribery / Improper Benefit Attempt Record)

- `id` uuid pk
- `venue_id` uuid nullable fk → `venues.id` (on delete set null)
- `venue_name_text` text nullable (for venues not in the system)
- `incident_date` date nullable
- `description` text not null
- `outcome` text nullable
- `published` boolean not null default true
- `created_by` text, `created_at`, `updated_at`

**`venue_revisions`** (audit trail, Phase 6)

- `id` uuid pk, `venue_id` fk, `changed_by` text, `changed_at` timestamptz, `snapshot` jsonb

### Tables (Better Auth)

Generate the schema with Better Auth's CLI for Drizzle (`@better-auth/cli generate` or the current equivalent) so it matches the installed version and the enabled plugins (admin plugin adds fields such as role/banned). Put it alongside the app schema and manage everything through drizzle-kit migrations.

Commit generated migrations. Add package.json scripts: `db:generate`, `db:migrate`, `db:studio`, `db:seed`, `auth:generate`.

---

## 6. Authentication requirements

**Server config (`src/lib/auth.ts` or the repo's equivalent location):**

- Better Auth with the Drizzle adapter (Postgres provider), using the shared DB client.
- `emailAndPassword` enabled, **public sign-up disabled** (verify the exact option name in current docs, e.g. `disableSignUp`). Minimum password length 12.
- Admin plugin enabled with role support. Default role for any created user is a non-privileged role; Chairs get `admin`.
- `baseURL` and `secret` from env. Set `trustedOrigins` to the local and production origins only.
- Secure, httpOnly, sameSite cookies in production.
- **Rate limiting:** enable Better Auth's rate limiter and configure it to use **database storage** (in-memory limits don't persist across serverless invocations). Stricter limits on sign-in. Verify the option names in current docs.
- Session lifetime: 7 days with sliding refresh is fine. Allow the setting to be changed in one place.
- Generic login errors ("Invalid email or password") — never reveal whether an email exists.

**Route handler:** mount the Better Auth handler at `src/pages/api/auth/[...all].ts` with `prerender = false`, handling all methods the library needs.

**Client:** create the Vue-compatible Better Auth client (`better-auth/vue`) in one shared module, configured with the correct base URL.

**First Chair (bootstrap):**

- Because sign-up is disabled, write `scripts/seed-chair.ts` that creates the first admin user from `SEED_CHAIR_*` env vars.
- It must hash the password using Better Auth's own hashing (e.g. via its internal context/adapter or another supported server-side creation path in the installed version) so the user can log in normally. Do not store plaintext or invent your own hashing.
- It must be idempotent (re-running must not create duplicates) and must refuse to run if `NODE_ENV=production` unless an explicit `--force` flag is passed.
- Print the created email only. Never print the password.

**Chair management:** an admin-only Users page (Phase 4) to create other Chairs/editors, deactivate (ban) accounts, and force a password reset. Users can change their own password at `/admin/account`.

---

## 7. Route protection

Implement **defence in depth**:

1. **Astro middleware (`src/middleware.ts`)**
   - Resolve the session from request headers via Better Auth on every request to `/admin/*` and `/api/admin/*` (skip static assets and public routes).
   - No session → redirect to `/admin/login?next=<path>` for pages, `401` JSON for API calls.
   - Session present but role not permitted → `403`.
   - Put the user on `Astro.locals.user` and `Astro.locals.session` (and update `env.d.ts` types).
   - `/admin/login` and `/api/auth/*` are the only unauthenticated admin-adjacent routes.
2. **Every API handler re-checks** authentication and role itself. Never rely on middleware alone.
3. **Mutating requests** (`POST/PUT/PATCH/DELETE`): reject if the `Origin` header doesn't match the site's origin.
4. **Admin pages are never cached**: send `Cache-Control: no-store` and `noindex` headers/meta on all `/admin/*` pages. Add `/admin` to `robots.txt` disallow.

---

## 8. Admin area — pages and features

Layout: a shared `AdminLayout.astro` with the existing site header/branding, a "Chairs' Area" nav (Venues, Bribery Record, Users, Account), signed-in user name, and a sign-out button. Responsive and keyboard accessible. Match the site's existing visual style.

| Route                | Purpose                                                                                                                          |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/admin/login`       | Email + password form (Vue island). Shows generic errors. Redirects to `next` or `/admin` on success.                            |
| `/admin`             | Dashboard: counts of venues per tier, drafts awaiting publication, recently edited venues.                                       |
| `/admin/venues`      | Table of all venues: search by name, filter by tier and published/draft, sortable. Row actions: edit, publish/unpublish, delete. |
| `/admin/venues/new`  | Create venue form.                                                                                                               |
| `/admin/venues/[id]` | Edit venue form. Shows last updated time/user.                                                                                   |
| `/admin/bribery`     | List/create/edit/delete Bribery / Improper Benefit Attempt Record entries.                                                       |
| `/admin/users`       | Admin-only: list, create, deactivate users; trigger password reset.                                                              |
| `/admin/account`     | Change own password; sign out of other sessions.                                                                                 |

**Venue form (Vue island `VenueForm.vue`):**

- Fields per Section 5. Tier is a select using the shared tier list.
- Slug auto-fills from name until manually edited; uniqueness validated server-side with a clear error.
- Latitude/longitude inputs with validation (UK-plausible ranges are fine, but don't hard-fail elsewhere). Optional: a small map picker if a map component already exists in the repo; otherwise plain inputs.
- Markdown textarea for `verdict` with a simple preview toggle.
- `pull_quote` and `lunch_special` clearly labelled.
- Save as draft vs publish. Dirty-state warning when navigating away.
- Inline field errors from Zod; toast/inline success message.
- Delete requires a confirmation dialog (`ConfirmDialog.vue`).

**Other Vue islands:** `LoginForm.vue`, `VenueTable.vue`, `TierBadge.vue`, `ConfirmDialog.vue`, `BriberyForm.vue`, `UserForm.vue`, `ImageUpload.vue` (Phase 6). Use `client:load` for forms and `client:only="vue"` only where SSR isn't sensible.

---

## 9. API endpoints

All under `src/pages/api/admin/`, JSON in/out, `prerender = false`, auth + role check + Zod validation in each handler, consistent error shape `{ error: string, fields?: Record<string,string> }`.

- `GET/POST /api/admin/venues`
- `GET/PUT/DELETE /api/admin/venues/[id]`
- `POST /api/admin/venues/[id]/publish` and `/unpublish` (or a `published` field on PUT)
- `GET/POST /api/admin/bribery`, `GET/PUT/DELETE /api/admin/bribery/[id]`
- User management: use Better Auth's admin plugin API for create/ban/reset rather than writing your own.
- Phase 6: `POST /api/admin/upload` (Blob client-upload token handler).

Return appropriate status codes (400 validation, 401, 403, 404, 409 slug conflict). Never leak stack traces or DB errors to the client; log server-side without sensitive data.

---

## 10. Public site changes (Phase 5)

- Move the public site's venue data source from the existing static content to the database, **only after** the seed/import works. Keep the public URLs and page designs unchanged.
- Only `published = true` venues and bribery records appear publicly.
- Prefer on-demand rendering of public venue/map pages with CDN caching (e.g. `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`) so Neon's scale-to-zero cold start is rarely user-visible. If the Astro version offers a better-supported approach (e.g. ISR on the Vercel adapter), propose it in the phase summary before using it.
- Render `verdict` markdown safely (sanitised HTML).
- Venue page shows `pull_quote` and `lunch_special` when present.
- **Import script:** `scripts/import-existing-content.ts` reads the existing content, maps it to the schema, and inserts it as **draft or published as it currently appears**. It must be idempotent (match on slug) and support `--dry-run`.

---

## 11. Security checklist (verify at the end of Phase 6)

- [ ] No secrets in the repo, git history of this work, logs or client bundles
- [ ] Sign-up endpoint is disabled and confirmed unusable
- [ ] Every `/admin/*` page and `/api/admin/*` endpoint returns 401/403 when unauthenticated (write a simple script or test that checks this)
- [ ] Mutating requests with a foreign `Origin` are rejected
- [ ] Login rate limiting works and persists across invocations
- [ ] Admin pages send `no-store` and `noindex`
- [ ] User-supplied markdown/HTML is sanitised on render
- [ ] Image uploads restricted to image MIME types and a size cap (e.g. 4 MB)
- [ ] Production `BETTER_AUTH_URL` and `trustedOrigins` correct for the Vercel domain
- [ ] Dependencies have no known high-severity advisories (`npm audit` or equivalent)

---

## 12. Phases and acceptance criteria

### Phase 0 — Recon (no code changes)

Report: Astro/Vue/Node versions, package manager, current adapter/output mode, how venue data is stored and its fields, existing layout/header components and styling approach, existing Vue island patterns, any existing API routes or middleware, and any conflicts with this spec. Propose adjustments, then wait.

**Done when:** I've reviewed the report.

### Phase 1 — Infrastructure

Install dependencies, configure the Vercel adapter, create the DB client, Drizzle config, app schema and generated Better Auth schema, `.env.example`, and npm scripts. Generate and apply migrations to the local/dev Neon branch.

**Done when:** `astro check` and a production build pass; migrations apply cleanly to an empty database; the public site is unchanged.

### Phase 2 — Authentication

`auth.ts`, route handler, Vue client, `/admin/login`, middleware, `Astro.locals` typing, sign-out, seed-chair script, `/admin` placeholder dashboard, `/admin/account` password change.

**Done when:** Seeded Chair can log in and out; unauthenticated requests to `/admin` redirect to login; `/api/admin/*` returns 401 without a session; sign-up is unusable; rate limit demonstrably triggers after repeated failed logins.

### Phase 3 — Venue management

Venue API, list page, create/edit forms, publish/unpublish, delete with confirmation, shared tier module, slug handling, import script (with `--dry-run`).

**Done when:** A Chair can create, edit, publish, unpublish and delete a venue entirely from the admin UI; validation errors display per field; existing content imports cleanly and idempotently.

### Phase 4 — Bribery record and user management

Bribery record CRUD; Users page using Better Auth's admin plugin (create, ban/unban, reset password); dashboard counts.

**Done when:** A Chair can add/edit/remove record entries and add a second Chair who can log in; a banned user cannot log in.

### Phase 5 — Public site reads from the database

Switch public pages to DB-backed data with caching; only published items shown; markdown sanitised; pull quote and lunch special rendered.

**Done when:** Public pages look and behave exactly as before, but changes published in the admin appear on the public site within the cache window; drafts never appear publicly.

### Phase 6 — Images, audit trail, hardening

Vercel Blob uploads (`ImageUpload.vue` + token route), `venue_revisions` snapshots on every save with a simple "History" view per venue, complete the Section 11 checklist, update the README with setup/deploy/runbook notes (creating a Neon branch, running migrations, seeding the first Chair, required Vercel env vars).

**Done when:** Every item in Section 11 is ticked and the README is accurate.

---

## 13. Deployment notes (Vercel)

- Add the Neon integration from the Vercel Marketplace to the project so `DATABASE_URL` is provisioned.
- Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (production domain) and, in Phase 6, `BLOB_READ_WRITE_TOKEN` in Vercel project settings.
- Run production migrations as an explicit, documented step (not silently on every build). Document the command in the README.
- Seed the first production Chair once via the seed script with `--force`, run from a trusted machine with production env vars, then remove the seed env vars from that machine.
- Hobby plan is for personal, non-commercial use. Note this in the README so it's not forgotten if the site ever monetises.

---

## 14. Out of scope (don't build unless asked)

Public user accounts, social login, email sending/verification flows, comments, payments, multi-language support, redesigning public pages.
