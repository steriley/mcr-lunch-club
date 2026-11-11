import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import { venuePublicScoreHistory, venuePublicScores, venues } from '@/db/schema';
import { londonDate } from '@/lib/london-date';
import { memberInspectionInputSchema } from '@/lib/member-inspection-rules';
import { memberInspectionsApi as api } from '@/lib/member-inspections';
import { refreshAllScores, swingChips, theCount, venueSwing } from '@/lib/public-scores';
import { closeTestDb, createAdmin, createVenue, resetTestDb, skipIntegration, testDb } from './db';

/** The Swing-o-meter's data (#138): stored aggregates, quorum, tiers, and the daily refresh. */

const DAY = 24 * 60 * 60 * 1000;
const NOON = new Date('2026-11-11T12:00:00Z');
const MEMBERS = ['a', 'b', 'c', 'd', 'e'];

async function createMember(id: string) {
  const db = await testDb();
  const joined = new Date('2026-01-01T00:00:00Z');
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    role: 'user',
    createdAt: joined,
    updatedAt: joined,
  });
}

async function log(memberId: string, venueId: string, now: Date, verdictVote = 'approve') {
  const saved = await api.create(
    await testDb(),
    memberId,
    memberInspectionInputSchema.parse({
      venueId,
      visitDate: londonDate(now),
      dish: 'Steak pie',
      cost: '££',
      verdictVote,
      pullQuote: null,
    }),
    now
  );
  assert.ok(saved.ok, `log for ${memberId}: ${!saved.ok && saved.error}`);
  return saved.value;
}

/** Each named member logs twice (two days), so their logs are eligible. */
async function eligibleVotes(
  venueId: string,
  ids: string[],
  verdictVote = 'approve',
  startDay = 0
) {
  for (const id of ids) {
    await log(id, venueId, new Date(NOON.getTime() + startDay * DAY), verdictVote);
    await log(id, venueId, new Date(NOON.getTime() + (startDay + 1) * DAY), verdictVote);
  }
}

describe('public scores (database)', { skip: skipIntegration }, () => {
  let venue: string;

  beforeEach(async () => {
    await resetTestDb();
    await createAdmin('chair', 'Chair');
    for (const id of MEMBERS) await createMember(id);
    venue = await createVenue('Chip Shop', { tier: 'approved' });
  });

  after(closeTestDb);

  it('is empty before anyone logs, and polls are open', async () => {
    const swing = await venueSwing(await testDb(), 'chip-shop');
    assert.equal(swing?.quorate, false);
    assert.equal(swing?.eligibleMembers, 0);
    assert.equal(swing?.chairsBand, 'approved');
  });

  it('counts a member only after their second day, and shows no bar below quorum', async () => {
    const db = await testDb();
    await log('a', venue, NOON);
    assert.equal((await venueSwing(db, 'chip-shop'))?.eligibleMembers, 0);
    await eligibleVotes(venue, ['b', 'c', 'd']);
    const swing = await venueSwing(db, 'chip-shop');
    assert.equal(swing?.eligibleMembers, 3);
    assert.equal(swing?.quorate, false);
    assert.equal(swing?.position, null);
    assert.equal(swing?.headline, null);
  });

  it('reaches quorum at five distinct members and concurs when they approve', async () => {
    const db = await testDb();
    await eligibleVotes(venue, MEMBERS);
    const swing = await venueSwing(db, 'chip-shop');
    assert.equal(swing?.quorate, true);
    assert.equal(swing?.eligibleLogs, 10);
    assert.equal(swing?.headline?.kind, 'concur');
    assert.equal(swing?.peopleBand, 'approved');
    assert.deepEqual(swing?.verdictCounts, { approve: 10, if_we_must: 0, reject: 0 });
  });

  it('recomputes when a Chair removes a log and drops below quorum', async () => {
    const db = await testDb();
    await eligibleVotes(venue, MEMBERS);
    const [row] = await db
      .select()
      .from(venuePublicScores)
      .where(eq(venuePublicScores.venueId, venue));
    assert.equal(row.eligibleMembers, 5);
    const ids = (await api.listOwn(db, 'e')).map((entry) => entry.id);
    for (const id of ids) {
      assert.ok((await api.remove(db, { id, actorId: 'chair', reason: 'Spam' })).ok);
    }
    const swing = await venueSwing(db, 'chip-shop');
    assert.equal(swing?.eligibleMembers, 4);
    assert.equal(swing?.quorate, false);
  });

  it('recomputes when a member deletes a log', async () => {
    const db = await testDb();
    await eligibleVotes(venue, MEMBERS);
    const second = (await api.listOwn(db, 'a'))[0];
    assert.ok((await api.delete(db, 'a', second.id, new Date(NOON.getTime() + DAY))).ok);
    // Back to one day, so none of their logs counts any more.
    const swing = await venueSwing(db, 'chip-shop');
    assert.equal(swing?.eligibleLogs, 8);
    assert.equal(swing?.eligibleMembers, 4);
  });

  it('leaves out a banned member until the daily refresh runs', async () => {
    const db = await testDb();
    await eligibleVotes(venue, MEMBERS);
    await db.update(user).set({ banned: true }).where(eq(user.id, 'a'));
    await refreshAllScores(db, new Date(NOON.getTime() + 2 * DAY));
    const swing = await venueSwing(db, 'chip-shop');
    assert.equal(swing?.eligibleMembers, 4);
    assert.equal(swing?.quorate, false);
  });

  it('puts the People in another band when they disagree with the Chairs', async () => {
    const db = await testDb();
    // Five members with full weight, so they outweigh the prior.
    const others = await Promise.all(
      ['p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y'].map(async (id) => {
        await createMember(id);
        return id;
      })
    );
    const spare: string[] = [];
    for (let index = 0; index < 9; index += 1) {
      spare.push(await createVenue(`Spare ${index}`, { tier: 'approved' }));
    }
    for (const id of others.slice(0, 5)) {
      // Ten different venues makes the member's weight 1.
      for (let index = 0; index < 9; index += 1) {
        await log(id, spare[index], new Date(NOON.getTime() - (index + 1) * DAY));
      }
    }
    await eligibleVotes(venue, others.slice(0, 5), 'reject');
    const swing = await venueSwing(db, 'chip-shop');
    assert.equal(swing?.quorate, true);
    assert.equal(swing?.headline?.kind, 'dissent');
    assert.notEqual(swing?.peopleBand, 'approved');
  });

  it('follows a tier change without a recompute', async () => {
    const db = await testDb();
    await eligibleVotes(venue, MEMBERS);
    await db.update(venues).set({ tier: 'rejected' }).where(eq(venues.id, venue));
    const swing = await venueSwing(db, 'chip-shop');
    assert.equal(swing?.chairsBand, 'rejected');
    assert.equal(swing?.headline?.kind, 'dissent');
  });

  it('runs a Straw Poll for holding venues and nothing for closed ones', async () => {
    const db = await testDb();
    const holding = await createVenue('Pie Shop', { tier: 'under_consideration' });
    await eligibleVotes(holding, MEMBERS);
    const swing = await venueSwing(db, 'pie-shop');
    assert.equal(swing?.chairsBand, null);
    assert.equal(swing?.headline?.kind, 'straw_poll');

    await createVenue('Old Cafe', { tier: 'gone_but_not_forgotten' });
    assert.equal(await venueSwing(db, 'old-cafe'), null);
    assert.equal(await venueSwing(db, 'nowhere'), null);
  });

  it('keeps Straw Polls out of The Count and the chips', async () => {
    const db = await testDb();
    const holding = await createVenue('Pie Shop', { tier: 'under_consideration' });
    await eligibleVotes(holding, MEMBERS);
    await eligibleVotes(venue, MEMBERS, 'approve', 2);
    const count = await theCount(db);
    assert.equal(count.quorateVenues, 2);
    assert.equal(count.approvalRating?.quorate, 1);
    assert.equal(count.approvalRating?.percent, 100);
    assert.deepEqual(await swingChips(db), { 'chip-shop': 'The People Concur' });
  });

  it('writes one history point a day for quorate venues, and prunes old ones', async () => {
    const db = await testDb();
    await eligibleVotes(venue, MEMBERS);
    const later = new Date(NOON.getTime() + 3 * DAY);
    await refreshAllScores(db, later);
    await refreshAllScores(db, later);
    const rows = await db.select().from(venuePublicScoreHistory);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].eligibleMembers, 5);

    await db.insert(venuePublicScoreHistory).values({
      venueId: venue,
      day: '2025-01-01',
      position: 50,
      eligibleMembers: 5,
    });
    await refreshAllScores(db, later);
    assert.equal((await db.select().from(venuePublicScoreHistory)).length, 1);
  });
});
