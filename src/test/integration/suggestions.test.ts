import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { tierProposals, venueSuggestions, venues } from '@/db/schema';
import { markSuggestionAccepted, SUGGESTION_PROPOSED_TIER } from '@/lib/suggestions';
import { approveProposal, declineProposal, proposeTier } from '@/lib/tier-proposals';
import { createVenueWithProposal, SuggestionUnavailable } from '@/lib/venue-create';
import { venueInputSchema } from '@/lib/venue-schema';
import { isPubliclyVisible } from '@/lib/visibility';
import { closeTestDb, createAdmin, resetTestDb, skipIntegration, testDb, type TestAdmin } from './db';

describe('accepting a suggestion (database)', { skip: skipIntegration }, () => {
  let sam: TestAdmin;
  let alex: TestAdmin;
  let suggestionId: string;
  const route = { distanceMiles: 0.3, walkingTimeMin: 6 };
  const input = venueInputSchema.parse({ name: 'Pasty Palace', slug: 'pasty-palace', cost: '£', latitude: 53.477, longitude: -2.247 });

  beforeEach(async () => {
    await resetTestDb();
    const db = await testDb();
    await db.delete(venueSuggestions);
    sam = await createAdmin('sam', 'Sam');
    alex = await createAdmin('alex', 'Alex');
    const [row] = await db
      .insert(venueSuggestions)
      .values({ name: 'Pasty Palace', address: '14 Peter Street', cuisine: 'Pasties', rationale: 'Cheap.' })
      .returning({ id: venueSuggestions.id });
    suggestionId = row.id;
  });

  after(closeTestDb);

  const accept = async (actor: TestAdmin) =>
    createVenueWithProposal(await testDb(), input, SUGGESTION_PROPOSED_TIER, actor, route, async (tx, venue) => {
      if (!(await markSuggestionAccepted(tx, suggestionId, venue.id, actor.id))) throw new SuggestionUnavailable();
    });
  const suggestion = async () => (await (await testDb()).select().from(venueSuggestions).where(eq(venueSuggestions.id, suggestionId)))[0];

  it('creates a hidden venue with a pending To Be Assessed proposal by the accepting admin, and links the suggestion', async () => {
    const { venue, proposal } = await accept(sam);
    assert.equal(venue.tier, null);
    assert.equal(isPubliclyVisible(venue), false);
    assert.equal(venue.cuisine, 'other', 'the suggested cuisine is never copied');
    assert.deepEqual({ tier: proposal?.proposedTier, by: proposal?.proposedBy, status: proposal?.status }, { tier: 'to_be_assessed', by: 'sam', status: 'pending' });

    const row = await suggestion();
    assert.equal(row.status, 'accepted');
    assert.equal(row.venueId, venue.id);
    assert.equal(row.reviewedBy, 'sam');
    assert.ok(row.reviewedAt);
  });

  it('cannot skip the countersign: the accepting admin cannot approve it, a different admin can', async () => {
    const db = await testDb();
    const { venue, proposal } = await accept(sam);
    assert.deepEqual(await approveProposal(db, proposal!.id, sam), { ok: false, error: 'own_proposal' });
    const [hidden] = await db.select().from(venues).where(eq(venues.id, venue.id));
    assert.equal(hidden.tier, null);

    assert.equal((await approveProposal(db, proposal!.id, alex)).ok, true);
    const [shown] = await db.select().from(venues).where(eq(venues.id, venue.id));
    assert.equal(shown.tier, 'to_be_assessed');
    assert.equal(isPubliclyVisible(shown), true);
  });

  it('declining leaves a hidden venue that can be proposed again; the suggestion stays accepted and linked', async () => {
    const db = await testDb();
    const { venue, proposal } = await accept(sam);
    assert.equal((await declineProposal(db, proposal!.id, alex, 'Too far.')).ok, true);
    const [row] = await db.select().from(venues).where(eq(venues.id, venue.id));
    assert.equal(row.tier, null);
    assert.equal((await suggestion()).status, 'accepted');
    assert.equal((await suggestion()).venueId, venue.id);
    assert.equal((await proposeTier(db, venue.id, 'to_be_assessed', sam)).ok, true);
  });

  it('rolls everything back when the suggestion was already accepted', async () => {
    const db = await testDb();
    await accept(sam);
    const otherInput = { ...input, slug: 'pasty-palace-2' };
    await assert.rejects(
      createVenueWithProposal(db, otherInput, SUGGESTION_PROPOSED_TIER, alex, route, async (tx, venue) => {
        if (!(await markSuggestionAccepted(tx, suggestionId, venue.id, alex.id))) throw new SuggestionUnavailable();
      }),
      SuggestionUnavailable
    );
    assert.equal((await db.select().from(venues)).length, 1);
    assert.equal((await db.select().from(tierProposals)).length, 1);
  });

  it('a suggestion nobody finishes accepting stays new', async () => {
    assert.equal((await suggestion()).status, 'new');
    assert.equal((await suggestion()).venueId, null);
  });
});
