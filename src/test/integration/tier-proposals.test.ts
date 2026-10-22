import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import { inspections, tierProposals, venueRevisions, venues } from '@/db/schema';
import { recordVisit } from '@/lib/inspections';
import { approveProposal, countActiveAdmins, declineProposal, proposeTier, withdrawProposal } from '@/lib/tier-proposals';
import { createVenueWithProposal } from '@/lib/venue-create';
import { venueInputSchema } from '@/lib/venue-schema';
import { getPublicVenue } from '@/lib/public-data';
import { closeTestDb, createAdmin, createVenue, resetTestDb, skipIntegration, testDb, violates, type TestAdmin } from './db';

describe('tier proposals (database)', { skip: skipIntegration }, () => {
  let sam: TestAdmin;
  let alex: TestAdmin;
  let jo: TestAdmin;
  let venueId: string;

  beforeEach(async () => {
    await resetTestDb();
    sam = await createAdmin('sam', 'Sam');
    alex = await createAdmin('alex', 'Alex');
    jo = await createAdmin('jo', 'Jo');
    venueId = await createVenue('Chip Shop', { tier: 'under_consideration' });
  });

  after(closeTestDb);

  const tierOf = async (id = venueId) => (await (await testDb()).select({ tier: venues.tier }).from(venues).where(eq(venues.id, id)))[0].tier;
  const proposalsOf = async (id = venueId) => (await testDb()).select().from(tierProposals).where(eq(tierProposals.venueId, id));
  const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: string }): T => {
    if (!result.ok) assert.fail(`expected ok, got ${result.error}`);
    return result.value;
  };

  it('a proposal changes nothing until a different admin approves it', async () => {
    const db = await testDb();
    const proposal = unwrap(await proposeTier(db, venueId, 'if_we_must', sam));
    assert.equal(proposal.fromTier, 'under_consideration');
    assert.equal(proposal.proposedByName, 'Sam');
    assert.equal(await tierOf(), 'under_consideration');

    assert.deepEqual(await approveProposal(db, proposal.id, sam), { ok: false, error: 'own_proposal' });
    assert.equal(await tierOf(), 'under_consideration');

    const approved = unwrap(await approveProposal(db, proposal.id, alex));
    assert.equal(approved.status, 'approved');
    assert.equal(approved.decidedByName, 'Alex');
    assert.equal(await tierOf(), 'if_we_must');
    const revisions = await db.select().from(venueRevisions).where(eq(venueRevisions.venueId, venueId));
    assert.equal((revisions.at(-1)!.snapshot as { tier: string }).tier, 'if_we_must');
  });

  it('the database refuses a decider who is the proposer', async () => {
    const db = await testDb();
    const proposal = unwrap(await proposeTier(db, venueId, 'if_we_must', sam));
    await assert.rejects(
      db.update(tierProposals).set({ status: 'approved', decidedBy: 'sam' }).where(eq(tierProposals.id, proposal.id)),
      violates('tier_proposals_decider_not_proposer')
    );
  });

  it('declining needs a reason, keeps the tier, and stores the reason', async () => {
    const db = await testDb();
    const proposal = unwrap(await proposeTier(db, venueId, 'rejected', sam));
    assert.deepEqual(await declineProposal(db, proposal.id, alex, '   '), { ok: false, error: 'reason_required' });
    assert.deepEqual(await declineProposal(db, proposal.id, sam, 'nope'), { ok: false, error: 'own_proposal' });
    const declined = unwrap(await declineProposal(db, proposal.id, alex, '  Only one bad visit.  '));
    assert.equal(declined.status, 'declined');
    assert.equal(declined.declineReason, 'Only one bad visit.');
    assert.equal(await tierOf(), 'under_consideration');
    await assert.rejects(
      db.insert(tierProposals).values({ venueId, proposedTier: 'rejected', status: 'declined', declineReason: ' ' }),
      violates('tier_proposals_decline_reason')
    );
  });

  it('rejects proposing the current tier or the tier already pending', async () => {
    const db = await testDb();
    assert.deepEqual(await proposeTier(db, venueId, 'under_consideration', sam), { ok: false, error: 'same_as_current' });
    unwrap(await proposeTier(db, venueId, 'if_we_must', sam));
    assert.deepEqual(await proposeTier(db, venueId, 'if_we_must', sam), { ok: false, error: 'same_as_pending' });
  });

  it('one pending proposal per venue: the proposer replaces it, others must decide it first', async () => {
    const db = await testDb();
    const first = unwrap(await proposeTier(db, venueId, 'if_we_must', sam));
    assert.deepEqual(await proposeTier(db, venueId, 'rejected', alex), { ok: false, error: 'pending_by_other' });
    const second = unwrap(await proposeTier(db, venueId, 'rejected', sam));
    const all = await proposalsOf();
    assert.equal(all.find((row) => row.id === first.id)!.status, 'superseded');
    assert.equal(all.find((row) => row.id === second.id)!.status, 'pending');
    assert.equal(all.filter((row) => row.status === 'pending').length, 1);
    await assert.rejects(
      db.insert(tierProposals).values({ venueId, proposedTier: 'approved', status: 'pending', proposedBy: 'jo' }),
      violates('tier_proposals_one_pending_per_venue')
    );
  });

  it('only the proposer can withdraw', async () => {
    const db = await testDb();
    const proposal = unwrap(await proposeTier(db, venueId, 'if_we_must', sam));
    assert.deepEqual(await withdrawProposal(db, proposal.id, alex), { ok: false, error: 'not_proposer' });
    assert.equal(unwrap(await withdrawProposal(db, proposal.id, sam)).status, 'withdrawn');
    assert.deepEqual(await approveProposal(db, proposal.id, alex), { ok: false, error: 'not_pending' });
    assert.equal(await tierOf(), 'under_consideration');
  });

  it('moving into Approved needs a dual-verified inspection; legacy dates do not count', async () => {
    const db = await testDb();
    await db.insert(inspections).values({ venueId, inspectionDate: '2026-07-01', status: 'confirmed', kind: 'legacy' });
    assert.deepEqual(await proposeTier(db, venueId, 'approved', sam), { ok: false, error: 'needs_verified_inspection' });

    // A lone press is not enough either.
    await recordVisit(db, venueId, sam, 'satisfactory', new Date('2026-10-21T11:00:00Z'));
    assert.deepEqual(await proposeTier(db, venueId, 'approved', sam), { ok: false, error: 'needs_verified_inspection' });

    await recordVisit(db, venueId, alex, 'satisfactory', new Date('2026-10-21T12:00:00Z'));
    const proposal = unwrap(await proposeTier(db, venueId, 'approved', sam));
    const [inspection] = await db.select().from(inspections).where(eq(inspections.kind, 'verified'));
    assert.equal(proposal.inspectionId, inspection.id);
    unwrap(await approveProposal(db, proposal.id, jo));
    assert.equal(await tierOf(), 'approved');
  });

  it('a new venue stays hidden until its first proposal is approved', async () => {
    const db = await testDb();
    const input = venueInputSchema.parse({ name: 'New Place', slug: 'new-place', cost: '££', latitude: 53.48, longitude: -2.25 });
    const { venue, proposal } = await createVenueWithProposal(db, input, 'to_be_assessed', sam, { distanceMiles: 0.2, walkingTimeMin: 4 });
    assert.equal(venue.tier, null);
    assert.ok(proposal);

    const { db: appDb } = await import('@/lib/db');
    const original = (appDb as any).select;
    (appDb as any).select = (...args: unknown[]) => (db as any).select(...args);
    try {
      assert.equal(await getPublicVenue('new-place'), null);
      unwrap(await approveProposal(db, proposal!.id, alex));
      assert.equal((await getPublicVenue('new-place'))?.tier, 'to_be_assessed');
    } finally {
      (appDb as any).select = original;
    }
  });

  it('a proposal survives its proposer being banned or deleted, and another admin can decide it', async () => {
    const db = await testDb();
    const proposal = unwrap(await proposeTier(db, venueId, 'if_we_must', sam));
    await db.update(user).set({ banned: true }).where(eq(user.id, 'sam'));
    await db.delete(user).where(eq(user.id, 'sam'));
    const [stored] = await proposalsOf();
    assert.equal(stored.proposedBy, null);
    assert.equal(stored.proposedByName, 'Sam');
    unwrap(await approveProposal(db, proposal.id, alex));
    assert.equal(await tierOf(), 'if_we_must');
  });

  it('two admins deciding at once yields exactly one decision', async () => {
    const db = await testDb();
    for (let round = 0; round < 10; round += 1) {
      const id = await createVenue(`Race ${round}`, { tier: 'to_be_assessed' });
      const proposal = unwrap(await proposeTier(db, id, 'rejected', sam));
      const results = await Promise.all([approveProposal(db, proposal.id, alex), declineProposal(db, proposal.id, jo, 'Disagree')]);
      assert.equal(results.filter((result) => result.ok).length, 1, `round ${round}`);
      assert.deepEqual(results.filter((result) => !result.ok).map((result) => !result.ok && result.error), ['not_pending']);
      const [stored] = await proposalsOf(id);
      assert.ok(['approved', 'declined'].includes(stored.status));
      assert.equal(await tierOf(id), stored.status === 'approved' ? 'rejected' : 'to_be_assessed');
    }
  });

  it('two approvals at once apply once', async () => {
    const db = await testDb();
    const proposal = unwrap(await proposeTier(db, venueId, 'if_we_must', sam));
    const results = await Promise.all([approveProposal(db, proposal.id, alex), approveProposal(db, proposal.id, jo)]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    const revisions = await db.select().from(venueRevisions).where(eq(venueRevisions.venueId, venueId));
    assert.equal(revisions.length, 1);
  });

  it('counts only active admins', async () => {
    const db = await testDb();
    assert.equal(await countActiveAdmins(db), 3);
    await db.update(user).set({ banned: true }).where(eq(user.id, 'jo'));
    await createAdmin('member', 'Member', { role: 'user' });
    assert.equal(await countActiveAdmins(db), 2);
  });
});
