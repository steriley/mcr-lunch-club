# Spec: Visit field notes

Status: draft for Chairs' review · Date: 2026-11-03 (revised)

## 1. Summary

Today an inspection records a date, an outcome (satisfactory or below par) and the two Chairs who verified it. It records nothing about _what the Chairs saw_. This feature adds **field notes**: free-text notes a Chair writes against **their own visit** to a venue, so the reasoning behind an outcome (and a later tier decision) is kept.

Two rules shape everything below:

1. **A note belongs to an individual visit.** One Chair's "Visited today" press is one visit; a confirmed inspection is two visits (the first and second Chair). Each Chair writes their own account of their own visit.
2. **A note can be recorded at any time.** Not just on the day: a Chair can add to or amend their notes days or weeks later, and whether or not the inspection was ever confirmed.

V1 is **Chairs-only and internal**. The data model and code boundaries are chosen so notes can later be opened to the public without a rewrite or a leak risk.

## 2. Goals and non-goals

**Goals**

- Capture a Chair's observations about a specific visit (food, service, price, queue, atmosphere, anything that justified the outcome).
- Keep the record attributable and dated, with edits visible.
- Surface the notes where Chairs already work: the venue's admin page, and next to a tier proposal that cites the inspection.
- Make a future public release a deliberate, reviewable step.

**Non-goals for v1**

- Anything public: no public page, API field, structured data, OG card or search index may include a note.
- Notes written by a Chair who did not make the visit (no commenting on someone else's visit).
- Notes on visits that were never recorded with "Visited today", and notes on legacy inspections (they have no recorded Chairs, so there is no visit to attach to).
- Photos or file attachments (the existing venue image pipeline can be reused later).
- Rich text or Markdown; notes are plain text.
- Notifications, @mentions, threading.
- Changing how inspections are verified or how tiers move. Notes never gate either.

## 3. Users and permissions

| Who                                        | Can                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Active Chair (admin role, not deactivated) | Read all notes. Add, edit and delete **their own** notes on a visit they made, at any time.                          |
| Deactivated Chair                          | Nothing (already refused by `adminRoute`). Their existing notes stay, attributed by name snapshot.                  |
| Public / signed-out                        | Nothing, in v1.                                                                                                      |

Notes need no countersign. They are commentary, not a decision, and attribution is the safeguard.

## 4. Behaviour

### 4.1 What a note attaches to

A note attaches to one **visit**: an inspection row plus the Chair's place on it (`first` or `second`). The existing `inspections` table already holds both visits as `first_admin_id` and `second_admin_id`, so no separate visits table is needed; the note stores which visit it is about.

- **Who can write:** only the Chair who made that visit. The first Chair writes against the `first` visit; the cosigning Chair against the `second` visit. A Chair who has not pressed Visited today for that inspection cannot write to it.
- **When:** any time after the press. Pending, confirmed and **lapsed** inspections all accept notes. A lone press that lapses is still a real visit by that Chair, and their observations are worth keeping. Lapsed visits are shown greyed as "Unconfirmed visit".
- **Legacy inspections:** excluded (no Chairs recorded, so no visit).
- **Several notes per visit:** a Chair may write more than one note about the same visit, for example a quick note on the day and a fuller one later. Notes list oldest first.

### 4.2 Writing and editing

- A note is plain text, 1 to 4,000 characters after trimming, rendered escaped as text only (Vue default); newlines preserved.
- The author can **edit or delete their own note at any time.** Since the record is not locked, edits are made visible: an edited note shows "edited" with the time of the last edit. V1 keeps no revision history (see open question 1).
- Each note shows its visit date, the author, the time written, and, when applicable, "written N days after the visit", so a late recollection is distinguishable from a same-day observation.
- Author names are snapshotted (as in `inspections`, `tier_proposals`, `venue_events`) so notes survive account deletion; `author_id` is `set null` on delete. The `visit` marker keeps the note tied to the first or second visit even after that.

### 4.3 Where it appears (admin)

1. **Venue edit page → dossier.** Each inspection in the history lists its visits, and each visit's notes beneath it. A Chair sees an "Add field note" control on the visits they made.
2. **After "Visited today".** Once a Chair presses the button, the control offers "Add a field note about this visit?" (dismissible; never required, never blocks the press). Because notes can be added any time, the same control stays available from the history afterwards.
3. **Venue timeline (`venue-history`).** Adding a note appears as an entry ("Field note added by Sam on 3rd Nov 26"), text only, with no note body in the timeline row.
4. **Tier proposals.** When a proposal cites an inspection (`tier_proposals.inspection_id`), the approving Chair sees that inspection's notes (both visits) in the proposal panel and on `/admin/pending`. This is the main reason notes exist: the second Chair sees the evidence.

An admin-wide "recent field notes" feed is deferred (open question 3).

## 5. Data model

New table, separate from `inspections`. This matters: inspection rows are embedded in public pages (`LedgerCanon`, `listConfirmedInspections`), so a notes column there would be one `select *` away from leaking.

```ts
export const noteVisibilityEnum = pgEnum('note_visibility', ['internal', 'public']);
export const noteVisitEnum = pgEnum('note_visit', ['first', 'second']);

export const inspectionNotes = pgTable(
  'inspection_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    // Which of the inspection's two visits this note is about.
    visit: noteVisitEnum('visit').notNull(),
    // Denormalised for per-venue listing.
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    visibility: noteVisibilityEnum('visibility').notNull().default('internal'),
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    authorName: text('author_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
  },
  (t) => [
    index('inspection_notes_inspection_idx').on(t.inspectionId, t.visit, t.createdAt),
    index('inspection_notes_venue_idx').on(t.venueId, t.createdAt),
    check('inspection_notes_body_length', sql`char_length(trim(${t.body})) between 1 and 4000`),
    // V1 safety rail: nothing may be public until the public release lands.
    check('inspection_notes_internal_only', sql`${t.visibility} = 'internal'`),
  ]
);
```

Notes on the model:

- **Authorisation is a domain rule, not a constraint.** `addNote` loads the inspection row and derives `visit` from the actor: `first` if `actor.id = first_admin_id`, `second` if `actor.id = second_admin_id`, otherwise refuse (`not_a_visitor`). The client never chooses the visit. Edit and delete require `note.author_id = actor.id`.
- **Kind:** `addNote` also refuses `kind = 'legacy'`.
- **`visibility`** exists now so going public later is a data decision per note, not a schema change. The `inspection_notes_internal_only` check makes `public` impossible in v1; the public release drops that check in its own migration.
- Migration `0016_inspection_notes.sql` (Drizzle-generated, journal updated) adds the enums and table. No backfill.

## 6. Code layout

Follows the repo's existing conventions (see `CLAUDE.md`).

- `src/lib/field-notes.ts`: domain module. `addNote`, `editNote`, `deleteNote`, `listNotesForInspections`, `listNotesForVenue`. Takes `db` and an `Actor`, returns result unions like `recordVisit` (`{ result: 'added' | 'not_found' | 'not_a_visitor' | 'legacy_inspection' | 'not_author' ... }`). **Must not import `admin-api` or `auth`** (`src/test/layering.test.ts`).
- `src/lib/field-notes-schema.ts`: Zod schema (`body` trimmed 1..4000) shared by the route and the form.
- `src/pages/api/admin/inspections/[id]/notes.ts`: `POST` add a note to the actor's own visit.
- `src/pages/api/admin/notes/[id].ts`: `PATCH` edit, `DELETE` delete.
- All wrapped in `adminRoute` with **no `publish` option**. Internal notes change nothing on the prerendered public pages, so they must not mark the site as having pending changes or trigger a Deploy Hook.
- `src/lib/venue-events.ts`: add `field_note_added` to `VenueEventKind` and `EVENT_VERBS` so it appears in the timeline; the event `detail` holds `{ inspectionId, noteId }` only, never the body.
- UI: a `FieldNotes.vue` component under `src/components/admin/dossier/`, used by the dossier on `src/pages/admin/venues/[id].astro` and by `TierProposalPanel.vue`. `[id].astro` loads notes with the other dossier data and passes them in serialised, with a flag for which visit (if any) the current Chair made.

## 7. Public-safety requirements (v1)

These are tests, not intentions:

1. Extend `src/test/public-safety.test.ts` so no public page, public component or `public-data.ts` references `inspection_notes`, `inspectionNotes` or `field-notes`. Name the new admin component (`FieldNotes`) in that test's admin-only filename exclusion list, as with `VisitedToday` and `Proposal`.
2. Extend `src/test/client-bundle-safety.test.ts` so note text cannot reach a public client bundle.
3. A DB-backed test that `toPublicVenue`/ledger serialisation never includes note data even when a venue has notes.
4. The `internal_only` check constraint is covered by a `test:db` test that an insert with `visibility = 'public'` fails.

## 8. Testing

- Unit (`pnpm test`): schema validation; result-union to HTTP mapping in the routes (see `src/test/routes/inspections.test.ts` for the pattern).
- Integration (`pnpm test:db`): the first Chair can write to the `first` visit and the cosigner to the `second`; a third Chair is refused; legacy inspections are refused; notes accepted on pending, confirmed **and lapsed** inspections; notes accepted and edited days after the visit (injected `now`); author-only edit and delete; `edited_at` set on edit; author name survives user deletion; cascade when the inspection or venue is deleted.
- Layering and public-safety tests as in section 7.
- `pnpm build && pnpm check:built`: the admin pages are on-demand and have a CSP, so confirm no `securitypolicyviolation` from the new component (it adds no scripts or hosts).
- README: add a **Field notes** bullet under the Inspections operating notes; add the new routes to the project structure tree.

## 9. Path to public release (not in v1)

Opening notes up should need no schema change, only these decisions and steps:

1. **Who decides what is public.** Recommendation: a note is publishable only after a _different_ Chair approves it, mirroring the two-Chair rule for tiers. The author proposes "make public"; another Chair approves.
2. **Edit freeze.** Because v1 notes stay editable forever, a public note must be frozen at the moment it is approved: immutable apart from takedown (back to internal). Corrections go via a new public note.
3. **Publishing mechanics.** Public pages are prerendered, so approving or retracting a public note is a `publish: 'queue'` action (never awaiting the Deploy Hook), like other publishing changes.
4. **Public selection.** One explicit query (`WHERE visibility = 'public'`) in `public-data.ts`, covered by tests, and the only place that reads the table publicly.
5. **Attribution.** Decide whether public notes show Chair names or just "The Chairs" (open question 5).
6. **Legal/tone review.** Public text about a business is a defamation and fairness risk; Chairs should agree a style guide (factual, first-hand, dated) before launch.

## 10. Open questions for the Chairs

1. **Revision history.** Notes are editable at any time, so should edits keep prior versions (a `inspection_note_revisions` table, visible to Chairs)? V1 only shows "edited"; history is the stronger audit answer if Chairs want it.
2. **Visits that were never pressed.** If a Chair visits and no one presses Visited today, there is no visit to attach to. Is that acceptable, or do Chairs want to record a visit-with-notes without starting an inspection? That would be a bigger change (a visits concept of its own).
3. **A notes feed.** Is a `/admin/notes` page of recent notes across venues wanted in v1, or is the per-venue and per-proposal view enough?
4. **Required for below par?** Should a "below par" outcome prompt (still not force) a note, given a below-par inspection can trigger demotion?
5. **Public attribution.** Named Chairs, or anonymous "The Chairs"? Affects whether `author_name` is ever exposed.
6. **Structure.** Plain free text, or a few optional prompts (food, service, price, atmosphere)? Recommendation: free text only in v1.

## 11. Suggested delivery order

1. Migration, schema, `field-notes.ts` + unit/DB tests, public-safety tests.
2. API routes + route tests.
3. Dossier UI (`FieldNotes.vue`) and the post-"Visited today" prompt.
4. Timeline event and tier-proposal panel integration.
5. README updates; full pre-push sequence from `CLAUDE.md`.
