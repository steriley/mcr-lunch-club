# Spec: Inspection field notes

Status: draft for Chairs' review · Date: 2026-11-03

## 1. Summary

Today an inspection records a date, an outcome (satisfactory or below par) and the two Chairs who verified it. It records nothing about _what the Chairs saw_. This feature adds **field notes**: free-text notes written by a Chair against a specific inspection, so the reasoning behind an outcome (and a later tier decision) is kept.

V1 is **Chairs-only and internal**. The data model and code boundaries are chosen so notes can later be opened to the public without a rewrite or a leak risk.

## 2. Goals and non-goals

**Goals**

- Capture observations about a specific inspection (food, service, price, queue, atmosphere, anything that justified the outcome).
- Keep the record trustworthy: attributable, dated, hard to quietly rewrite.
- Surface the notes where Chairs already work: the venue's admin page, and next to a tier proposal that cites the inspection.
- Make a future public release a deliberate, reviewable step.

**Non-goals for v1**

- Anything public: no public page, API field, structured data, OG card or search index may include a note.
- Photos or file attachments (the existing venue image pipeline can be reused later).
- Rich text or Markdown; notes are plain text.
- Notifications, @mentions, threading or comments on notes.
- Notes on anything other than inspections (venue-level notes are a separate idea).
- Changing how inspections are verified or how tiers move. Notes never gate either.

## 3. Users and permissions

| Who                                       | Can                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Active Chair (admin role, not deactivated) | Read all notes. Add a note to a pending or confirmed inspection. Edit or delete **their own** note on the day it was written. Add an addendum to anyone's note after that. |
| Deactivated Chair                         | Nothing (already refused by `adminRoute`).                                                         |
| Public / signed-out                       | Nothing, in v1.                                                                                    |

Notes need no countersign. They are commentary, not a decision, and attribution is the safeguard.

## 4. Behaviour

### 4.1 What a note attaches to

A note belongs to one **inspection** (`inspections.id`), not to a venue and not to a date. Reasons: the inspection is already the unit the Chairs verify, tier proposals already reference it, and the "Visited today" flow gives a natural moment to write.

- **Pending** inspection (one Chair has pressed Visited today): either Chair may add notes. This is the moment people have fresh observations, and the second Chair may not have pressed yet.
- **Confirmed** inspection (verified or legacy): notes allowed. Legacy rows have no outcome but may still carry notes (e.g. back-filling what the Chairs remember).
- **Lapsed** inspection (nobody cosigned): existing notes are kept and shown greyed as "Unconfirmed visit"; no new notes. Rationale: lapsed rows are not part of the record, but deleting a Chair's written observations silently would be worse.

### 4.2 Writing and editing

- A note is plain text, 1 to 4,000 characters after trimming. Rendered escaped as text only (Vue default); newlines preserved.
- Any number of notes per inspection, and several per Chair (a Chair can add a second note later).
- The **author may edit or delete their own note until the end of the Europe/London day it was created** (same clock and rule as Visited today, `londonDate`). After that it is locked.
- After locking, corrections are **addenda**: a new note by any active Chair with `replies_to` pointing at the original. Addenda show indented under the original, with their own author and timestamp. Addenda are themselves subject to the same-day edit window and cannot be addended further (one level only, to avoid threading).
- Edited notes show "edited" with the time of the last edit. No revision history in v1; the same-day window keeps the rewrite risk small.
- Author names are snapshotted (as in `inspections`, `tier_proposals`, `venue_events`) so notes survive account deletion; `author_id` is `set null` on delete.

### 4.3 Where it appears (admin)

1. **Venue edit page → dossier.** Each inspection in the history shows its notes beneath it, with an "Add field note" control. Pending/today's inspection is expanded by default.
2. **After "Visited today".** Once a Chair presses the button, the control offers "Add a field note about this visit?" (dismissible; never required, never blocks the press).
3. **Venue timeline (`venue-history`).** Adding a note appears as an entry ("Field note added by Sam on 3rd Nov 26"), text only, with no note body in the timeline row.
4. **Tier proposals.** When a proposal cites an inspection (`tier_proposals.inspection_id`), the approving Chair sees that inspection's notes in the proposal panel and on `/admin/pending`. This is the main reason notes exist: the second Chair sees the evidence.

An admin-wide "recent field notes" feed is deferred (open question 3).

## 5. Data model

New table, separate from `inspections`. This matters: inspection rows are embedded in public pages (`LedgerCanon`, `listConfirmedInspections`), so a notes column on that table would be one `select *` away from leaking.

```ts
export const noteVisibilityEnum = pgEnum('note_visibility', ['internal', 'public']);

export const inspectionNotes = pgTable(
  'inspection_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    inspectionId: uuid('inspection_id')
      .notNull()
      .references(() => inspections.id, { onDelete: 'cascade' }),
    // Denormalised for per-venue listing and the venue cascade.
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    repliesTo: uuid('replies_to'), // addendum parent; self-reference, same inspection
    body: text('body').notNull(),
    visibility: noteVisibilityEnum('visibility').notNull().default('internal'),
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
    authorName: text('author_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // London calendar day of creation: the edit window is `noteDate = today`.
    noteDate: date('note_date').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
  },
  (t) => [
    index('inspection_notes_inspection_idx').on(t.inspectionId, t.createdAt),
    index('inspection_notes_venue_idx').on(t.venueId, t.createdAt),
    check('inspection_notes_body_length', sql`char_length(trim(${t.body})) between 1 and 4000`),
    // V1 safety rail: nothing may be public until the public release lands.
    check('inspection_notes_internal_only', sql`${t.visibility} = 'internal'`),
  ]
);
```

Notes on `visibility`:

- The column exists now so going public later is a data decision per note, not a schema change. The `inspection_notes_internal_only` check makes it impossible to set `public` in v1; the public release drops that check in its own migration.
- A migration `0016_inspection_notes.sql` (Drizzle-generated, journal updated) adds the enum and table. No backfill.
- Addendum rules (parent exists, same inspection, parent is not itself an addendum) are enforced in the domain module inside a transaction; a trigger is unnecessary at this scale.

## 6. Code layout

Follows the repo's existing conventions (see `CLAUDE.md`).

- `src/lib/field-notes.ts`: domain module. `addNote`, `editNote`, `deleteNote`, `listNotesForInspections`, `listNotesForVenue`. Takes `db` and an `Actor`, returns result unions like `recordVisit` (`{ result: 'locked' | 'not_found' | 'not_author' | ... }`). **Must not import `admin-api` or `auth`** (`src/test/layering.test.ts`).
- `src/lib/field-notes-schema.ts`: Zod schema (`body` trimmed 1..4000, `repliesTo` optional uuid) shared by the route and the form.
- `src/pages/api/admin/inspections/[id]/notes.ts`: `POST` add note.
- `src/pages/api/admin/notes/[id].ts`: `PATCH` edit, `DELETE` delete.
- All wrapped in `adminRoute` with **no `publish` option**. Internal notes change nothing on the prerendered public pages, so they must not mark the site as having pending changes or trigger a Deploy Hook.
- `src/lib/venue-events.ts`: add `field_note_added` to `VenueEventKind` and `EVENT_VERBS` so it appears in the timeline; the event `detail` holds `{ inspectionId, noteId }` only, never the body.
- UI: a `FieldNotes.vue` component under `src/components/admin/dossier/`, used by the dossier on `src/pages/admin/venues/[id].astro` and by `TierProposalPanel.vue`. `[id].astro` loads notes with the other dossier data and passes them in serialised.

## 7. Public-safety requirements (v1)

These are tests, not intentions:

1. Extend `src/test/public-safety.test.ts` so no public page, public component or `public-data.ts` references `inspection_notes`, `inspectionNotes` or `field-notes`. Name the new admin component (`FieldNotes`) in that test's admin-only filename exclusion list, as with `VisitedToday` and `Proposal`.
2. Extend `src/test/client-bundle-safety.test.ts` so note text cannot reach a public client bundle.
3. A DB-backed test that `toPublicVenue`/ledger serialisation never includes note data even when a venue has notes.
4. The `internal_only` check constraint is covered by a `test:db` test that an insert with `visibility = 'public'` fails.

## 8. Testing

- Unit (`pnpm test`): schema validation; London-day window logic with an injected `now`; result-union mapping in the routes (see `src/test/routes/inspections.test.ts` for the pattern).
- Integration (`pnpm test:db`): add on pending and confirmed; refuse on lapsed; author-only edit and delete; locking after the London day boundary; addendum rules; author name survives user deletion; cascade when inspection or venue is deleted.
- Layering and public-safety tests as in section 7.
- `pnpm build && pnpm check:built`: the admin pages are on-demand and have a CSP, so confirm no `securitypolicyviolation` from the new component (it adds no scripts or hosts).
- README: add a **Field notes** bullet under the Inspections operating notes; add the new routes to the project structure tree.

## 9. Path to public release (not in v1)

Opening notes up should need no schema change, only these decisions and steps:

1. **Who decides what is public.** Recommendation: a note is publishable only after a _different_ Chair approves it, mirroring the two-Chair rule for tiers. The author proposes "make public"; another Chair approves.
2. **Edit freeze.** A public note is immutable apart from takedown (back to internal). Corrections go via a public addendum.
3. **Publishing mechanics.** Public pages are prerendered, so approving or retracting a public note is a `publish: 'queue'` action (never awaiting the Deploy Hook), like other publishing changes.
4. **Public selection.** One explicit query (`WHERE visibility = 'public'`) in `public-data.ts`, covered by tests, and the only place that reads the table publicly.
5. **Attribution.** Decide whether public notes show Chair names or just "The Chairs" (open question 5).
6. **Legal/tone review.** Public text about a business is a defamation and fairness risk; Chairs should agree a style guide (factual, first-hand, dated) before launch.

## 10. Open questions for the Chairs

1. **Edit window.** Is "same London day" right, or should notes lock when the inspection is confirmed? Same-day is simpler and matches Visited today; confirmation-based is stricter.
2. **Legacy inspections.** Should Chairs be able to back-fill notes on legacy rows, or is that clutter?
3. **A notes feed.** Is a `/admin/notes` page of recent notes across venues wanted in v1, or is the per-venue and per-proposal view enough?
4. **Required for below par?** Should a "below par" outcome prompt (still not force) a note, given a below-par inspection can trigger demotion?
5. **Public attribution.** Named Chairs, or anonymous "The Chairs"? Affects whether `author_name` is ever exposed.
6. **Structure.** Plain free text, or a few optional prompts (food, service, price, atmosphere)? Prompts make future public display more consistent but make writing slower. Recommendation: free text only in v1.

## 11. Suggested delivery order

1. Migration, schema, `field-notes.ts` + unit/DB tests, public-safety tests.
2. API routes + route tests.
3. Dossier UI (`FieldNotes.vue`) and the post-"Visited today" prompt.
4. Timeline event and tier-proposal panel integration.
5. README updates; full pre-push sequence from `CLAUDE.md`.
