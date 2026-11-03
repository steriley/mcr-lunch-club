# Spec: Visit field notes

Status: draft for Chairs' review · Date: 2026-11-03 (revision 3)

## 1. Summary

Today an inspection records a date, an outcome (satisfactory or below par) and the two Chairs who verified it. It records nothing about _what the Chairs saw_, and it only knows about visits that led to a dual-verified inspection. This feature adds:

1. **Visits**: a record that one Chair visited one venue on one day. Every "Visited today" press creates one; Chairs can also log a visit directly. A venue can have any number of visits.
2. **Field notes**: free-text notes a Chair writes about **their own visit**, at any time.

Rules that shape everything below:

1. **A note belongs to an individual visit**, and only the Chair who made the visit can write or change it.
2. **A note can be recorded at any time**: days or weeks later, and whether or not the visit ever became part of a confirmed inspection.
3. **Every active Chair can read every note, by any Chair, on any visit.** Writing is restricted to the visit's own Chair; reading is not restricted at all.
4. **Visits are not limited to two per venue.** An inspection is still two Chairs' "Visited today" presses on the same day, but a venue can be visited a third, fourth or tenth time, with or without a new inspection.

V1 is **Chairs-only and internal**. The data model and code boundaries are chosen so notes can later be opened to the public without a rewrite or a leak risk.

## 2. Goals and non-goals

**Goals**

- Capture a Chair's observations about a specific visit (food, service, price, queue, atmosphere, anything that justified the outcome).
- Let Chairs see each other's notes, so a deciding Chair has all the evidence.
- Record further visits when the Chairs decide not to promote a venue yet, without forcing a new inspection.
- Keep the record attributable and dated, with edits visible.
- Make a future public release a deliberate, reviewable step.

**Non-goals for v1**

- Anything public: no public page, API field, structured data, OG card or search index may include a visit or a note.
- A Chair writing or editing a note on someone else's visit.
- Photos or attachments, rich text or Markdown, notifications, @mentions, threading.
- Changing how inspections are verified or how tiers move. Visits and notes never gate either, and standalone visits never change `last_inspection_date`.
- Visits for legacy inspections (their Chairs were not recorded).

## 3. Users and permissions

| Who                                        | Can                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Active Chair (admin role, not deactivated) | **Read every visit and every note on every venue, whoever wrote it.** Log their own visit. Add, edit and delete notes on **their own** visits, at any time. |
| Deactivated Chair                          | Nothing (already refused by `adminRoute`). Their existing visits and notes stay readable by active Chairs, attributed by name snapshot. |
| Public / signed-out                        | Nothing, in v1.                                                                                              |

Notes need no countersign. They are commentary, not a decision, and attribution is the safeguard.

## 4. Behaviour

### 4.1 Visits

A **visit** is one Chair at one venue on one London calendar day. Visits come from two places:

- **"Visited today"** (existing button). In the same transaction that records the press, the actor's visit for today is created (or, if they already logged one today, linked to the inspection). Pressing again changes nothing. The visit stores the inspection it belongs to, if any.
- **"Log a visit"** (new, dossier). A Chair records that they visited, with a date (today or a past day, never the future). The visit has **no inspection**: it does not start, confirm or count towards one, does not touch `last_inspection_date`, and has no effect on tiers or on anything public.

This is the answer to "we visited twice and decided not to promote; how do we record a third?": each Chair logs a visit (or presses Visited today, which on a later day starts a fresh inspection exactly as it does now), then writes a note. Nothing about the first two visits limits the number that follow.

One visit per Chair per venue per day. A Chair who visits twice in a day uses a second note on the same visit.

### 4.2 Notes

- A note belongs to one visit and is written by that visit's Chair, **at any time after the visit** and regardless of the inspection's state (pending, confirmed, lapsed, or none). A lapsed lone press is still a real visit.
- Plain text, 1 to 4,000 characters after trimming, rendered escaped; newlines preserved.
- Several notes per visit are allowed, listed oldest first.
- The author can **edit or delete their own note at any time.** Edited notes show "edited" with the time of the last edit. No revision history in v1 (open question 1).
- Each note shows the visit date, the visitor, the time written, and "written N days after the visit" when applicable.
- Visitor names are snapshotted so history survives account deletion; `visitor_id` is `set null` on delete.

### 4.3 Where it appears (admin)

1. **Venue edit page, dossier: a Visits section.** All the venue's visits, newest first, from **every** Chair, each with all of its notes visible to the viewing Chair. A visit that is part of an inspection shows the inspection's outcome and status ("Pending", "Confirmed: below par", "Unconfirmed"); a standalone visit shows "Visit only". The current Chair sees "Add field note" on their own visits and "Log a visit" at the top.
2. **After "Visited today".** A dismissible "Add a field note about this visit?" prompt; never required, never blocks the press.
3. **Venue timeline (`venue-history`).** "Visit logged by Sam on 3rd Nov 26" and "Field note added by Sam on 4th Nov 26", text only, no note body.
4. **Tier proposals.** For a proposal that cites an inspection (`tier_proposals.inspection_id`), the approving Chair sees every note on the visits belonging to that inspection in the proposal panel and on `/admin/pending`, with a link to the venue's full Visits section.

An admin-wide "recent notes" feed is deferred (open question 3).

## 5. Data model

Two new tables, both separate from `inspections`. This matters: inspection rows are embedded in public pages (`LedgerCanon`, `listConfirmedInspections`), so visit or note columns there would be one `select *` away from leaking. The existing `inspections` columns (`first_admin_id`, `second_admin_id`, ...) are **unchanged**; they remain the verification record. Nothing in the new tables encodes "first" or "second".

```ts
export const noteVisibilityEnum = pgEnum('note_visibility', ['internal', 'public']);

/** One Chair at one venue on one London day. */
export const venueVisits = pgTable(
  'venue_visits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    visitDate: date('visit_date').notNull(),
    // Null for a standalone visit. Survives only as null if the inspection is ever deleted.
    inspectionId: uuid('inspection_id').references(() => inspections.id, { onDelete: 'set null' }),
    visitorId: text('visitor_id').references(() => user.id, { onDelete: 'set null' }),
    visitorName: text('visitor_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One visit per Chair per venue per day; keeps the Visited today press idempotent.
    uniqueIndex('venue_visits_one_per_chair_day')
      .on(t.venueId, t.visitorId, t.visitDate)
      .where(sql`${t.visitorId} is not null`),
    index('venue_visits_venue_date_idx').on(t.venueId, t.visitDate),
    index('venue_visits_inspection_idx').on(t.inspectionId),
  ]
);

/** What a Chair wrote about their own visit. */
export const visitNotes = pgTable(
  'visit_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    visitId: uuid('visit_id')
      .notNull()
      .references(() => venueVisits.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    visibility: noteVisibilityEnum('visibility').notNull().default('internal'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
  },
  (t) => [
    index('visit_notes_visit_idx').on(t.visitId, t.createdAt),
    check('visit_notes_body_length', sql`char_length(trim(${t.body})) between 1 and 4000`),
    // V1 safety rail: nothing may be public until the public release lands.
    check('visit_notes_internal_only', sql`${t.visibility} = 'internal'`),
  ]
);
```

Notes on the model:

- **No ordinal, no pairing.** Any number of visits per venue; an inspection links to the visits that made it up (normally two, via `venue_visits.inspection_id`) but nothing in the schema caps or requires that.
- **Authorship is the visit's visitor.** A note carries no separate author columns: write, edit and delete require `visit.visitor_id = actor.id`, checked in the domain module, so the note cannot drift from the visit.
- **Visibility.** `visibility` exists now so going public later is a per-note data decision. The `internal_only` check blocks `public` in v1 and is dropped by the public-release migration.
- **Deleting an inspection** (not a normal operation) leaves its visits in place with a null `inspection_id`.
- **Migration** `0016_visits_and_notes.sql` (Drizzle-generated, journal updated) creates the enum and both tables, then **backfills visits** from existing `kind = 'verified'` inspections: one visit for `first_admin_id` and, where present, one for `second_admin_id`, dated `inspection_date`, with the name snapshots and `inspection_id` set; duplicates skipped by the unique index. Legacy inspections get none. Idempotent.

## 6. Code layout

Follows the repo's existing conventions (see `CLAUDE.md`).

- `src/lib/visits.ts`: `ensureVisit(tx, venueId, actor, date, inspectionId?)` (insert, or link an existing standalone visit to the inspection; no-op on repeat), `logVisit`, `listVisitsForVenue`.
- `src/lib/inspections.ts`: `recordVisit` calls `ensureVisit` inside its existing transaction, so a press and its visit commit together and the existing row lock still serialises them. No other change to inspection logic.
- `src/lib/field-notes.ts`: `addNote`, `editNote`, `deleteNote`, `listNotesForVenue`, with result unions like `recordVisit` (`added`, `not_found`, `not_your_visit`, ...). Neither module may import `admin-api` or `auth` (`src/test/layering.test.ts`).
- `src/lib/field-notes-schema.ts`: shared Zod schemas (note body; visit date, today or earlier, London clock).
- Routes, all `adminRoute` with **no `publish` option** (internal records change nothing on prerendered pages, so no pending-changes marker and no Deploy Hook):
  - `POST /api/admin/venues/[id]/visits`: log a standalone visit.
  - `POST /api/admin/visits/[id]/notes`: add a note to your own visit.
  - `PATCH` and `DELETE /api/admin/notes/[id]`.
  - Reading needs no new route: the dossier page loads visits and notes server-side for any active Chair.
- `src/lib/venue-events.ts`: add `visit_logged` and `field_note_added` kinds; `detail` holds ids only, never a note body.
- UI: `VenueVisits.vue` under `src/components/admin/dossier/` (visits list, log-a-visit, notes), used by the dossier on `src/pages/admin/venues/[id].astro` and, read-only, by `TierProposalPanel.vue`.

## 7. Public-safety requirements (v1), as tests

1. Extend `src/test/public-safety.test.ts`: no public page, component or `public-data.ts` references `venue_visits`, `venueVisits`, `visit_notes`, `visitNotes`, `visits.ts` or `field-notes`; add `VenueVisits` to its admin-only filename exclusions.
2. Extend `src/test/client-bundle-safety.test.ts` so visit and note text cannot reach a public client bundle.
3. DB-backed test that public venue and ledger serialisation never includes visit or note data, even when a venue has both.
4. `test:db` test that inserting `visibility = 'public'` fails.

## 8. Testing

- Unit: schema validation (future date rejected); result-union to HTTP mapping in routes (pattern: `src/test/routes/inspections.test.ts`).
- Integration (`pnpm test:db`):
  - A Visited today press creates the actor's visit linked to the inspection; the cosigner's press creates the second; repeat presses create nothing.
  - A standalone visit logged earlier the same day is linked, not duplicated, when the Chair then presses Visited today.
  - A **third** visit by each Chair, with and without a new inspection, is recorded; standalone visits never change `last_inspection_date`, inspection status or tiers.
  - Notes on visits of pending, confirmed, lapsed and standalone kinds; add and edit days later (injected `now`).
  - **Any active Chair can read every note on every visit**, including on visits they were not part of.
  - Only the visit's Chair can add, edit or delete; another Chair is refused.
  - Backfill is idempotent and skips legacy inspections; visitor names survive user deletion; cascades from venue and visit.
- Layering and public-safety tests (section 7).
- `pnpm build && pnpm check:built`: no `securitypolicyviolation` from the new component.
- README: Visits and field notes bullet under Inspections operating notes; new routes in the structure tree.

## 9. Path to public release (not in v1)

1. **Who decides:** a note is publishable only after a _different_ Chair approves it (mirrors the two-Chair tier rule).
2. **Edit freeze:** v1 notes stay editable forever, so a public note must be frozen when approved; immutable apart from takedown. Corrections go via a new note.
3. **Publishing mechanics:** approve and retract are `publish: 'queue'` actions, never awaiting the Deploy Hook.
4. **Public selection:** one explicit `WHERE visibility = 'public'` query in `public-data.ts`, covered by tests, the only public reader of these tables. Visits themselves stay internal; a public note shows at most the visit date.
5. **Attribution:** named Chairs or "The Chairs" (open question 4).
6. **Legal/tone review:** agree a style guide (factual, first-hand, dated) before launch.

## 10. Open questions for the Chairs

1. **Revision history.** Notes are editable at any time; should edits keep prior versions (a `visit_note_revisions` table visible to Chairs)? V1 only shows "edited".
2. **Back-dating.** "Log a visit" allows any past date. Should there be a limit (for example 30 days), or a visible marker when a visit is logged long after its date?
3. **A notes feed.** `/admin/notes` of recent notes across venues in v1, or is per-venue and per-proposal enough?
4. **Public attribution.** Named Chairs or anonymous?
5. **Structure.** Free text, or optional prompts (food, service, price, atmosphere)? Recommendation: free text only in v1.
6. **Below-par prompt.** Should a "below par" outcome prompt (not force) a note?

## 11. Suggested delivery order

1. Migration with backfill, schema, `visits.ts` and `field-notes.ts` with unit and DB tests, public-safety tests.
2. Hook `ensureVisit` into `recordVisit`; routes and route tests.
3. Dossier Visits UI and the post-"Visited today" prompt.
4. Timeline events and tier-proposal panel integration.
5. README updates; full pre-push sequence from `CLAUDE.md`.
