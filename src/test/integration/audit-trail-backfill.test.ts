import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asc, eq } from 'drizzle-orm';
import { inspections, tierProposals, venueEvents, venues } from '@/db/schema';
import { backfillAuditTrail, BackfillError, type BackfillData } from '@/lib/audit-trail-backfill';
import { latestVerifiedInspection } from '@/lib/inspections';
import { closeTestDb, createAdmin, createVenue, resetTestDb, skipIntegration, testDb } from './db';

describe('audit trail backfill (database)', { skip: skipIntegration }, () => {
  let zaap: string;
  let pho: string;
  let dated: string;
  let mews: string;
  let feeder: string;

  beforeEach(async () => {
    await resetTestDb();
    await createAdmin('ste', 'Ste Riley');
    await createAdmin('tommy', 'Tommy Clark');
    zaap = await createVenue('Zaap Thai Street Food');
    pho = await createVenue('Pho Cue');
    dated = await createVenue('Already Dated', { lastInspectionDate: '2026-02-01' });
    mews = await createVenue('The Mews');
    feeder = await createVenue('Bearded Feeder', { tier: 'gone_but_not_forgotten' });
    await (await testDb()).insert(inspections).values({ venueId: dated, inspectionDate: '2026-02-01', status: 'confirmed', kind: 'legacy' });
  });

  after(closeTestDb);

  const data: BackfillData = {
    chairs: { first: 'Ste Riley', second: 'Tommy Clark' },
    inspections: [
      { venue: 'Zaap Thai Street Food', date: '2026-06-03', outcome: 'below_par' },
      { venue: 'Zaap Thai Street Food', date: '2026-06-16', outcome: 'satisfactory' },
      { venue: 'Pho Cue', date: '2026-06-03', outcome: 'below_par' },
      { venue: 'Already Dated', date: '2026-07-01', outcome: 'satisfactory' },
    ],
    addedDates: [{ venue: 'The Mews', date: '2026-04-29' }],
    closures: [{ venue: 'Bearded Feeder', date: '2026-04-07', fromTier: 'approved', toTier: 'gone_but_not_forgotten' }],
  };
  const venue = async (id: string) => (await (await testDb()).select().from(venues).where(eq(venues.id, id)))[0];

  it('writes inspections, added dates and closures, skips what is recorded, and is idempotent', async () => {
    const db = await testDb();
    const first = await backfillAuditTrail(db, data);
    assert.equal(first.inserted.length, 3);
    assert.deepEqual(first.skipped.map((row) => row.name), ['Already Dated']);
    assert.equal((await venue(zaap)).lastInspectionDate, '2026-06-16');
    assert.equal((await venue(pho)).lastInspectionDate, '2026-06-03');
    assert.equal((await venue(dated)).lastInspectionDate, '2026-02-01');

    const rows = await db.select().from(inspections).where(eq(inspections.venueId, zaap)).orderBy(asc(inspections.inspectionDate));
    assert.deepEqual(
      rows.map((row) => [row.inspectionDate, row.status, row.kind, row.outcome, row.firstAdminId, row.secondAdminName, row.confirmedAt]),
      [
        ['2026-06-03', 'confirmed', 'verified', 'below_par', 'ste', 'Tommy Clark', null],
        ['2026-06-16', 'confirmed', 'verified', 'satisfactory', 'ste', 'Tommy Clark', null],
      ]
    );
    assert.equal((await latestVerifiedInspection(db, zaap))?.inspectionDate, '2026-06-16');

    const mewsRow = await venue(mews);
    assert.equal(mewsRow.createdAt.toISOString(), '2026-04-29T12:00:00.000Z');
    assert.equal(mewsRow.lastInspectionDate, null, 'joining the list is not an inspection');

    const feederRow = await venue(feeder);
    assert.deepEqual([feederRow.closedAt?.toISOString(), feederRow.closedBy, feederRow.tier], ['2026-04-07T12:00:00.000Z', 'ste', 'gone_but_not_forgotten']);
    assert.equal(feederRow.lastInspectionDate, null);
    const [event] = await db.select().from(venueEvents).where(eq(venueEvents.venueId, feeder));
    assert.deepEqual([event.kind, event.actorName, event.createdAt.toISOString()], ['closed', 'Ste Riley', '2026-04-07T12:00:00.000Z']);
    const [proposal] = await db.select().from(tierProposals).where(eq(tierProposals.venueId, feeder));
    assert.deepEqual(
      [proposal.fromTier, proposal.proposedTier, proposal.status, proposal.proposedByName, proposal.decidedByName, proposal.decidedAt?.toISOString()],
      ['approved', 'gone_but_not_forgotten', 'approved', 'Ste Riley', 'Tommy Clark', '2026-04-07T12:00:00.000Z']
    );

    const second = await backfillAuditTrail(db, data);
    assert.deepEqual([second.inserted.length, second.skipped.length, second.addedDates.length, second.closed.length], [0, 3, 0, 0]);
    assert.deepEqual(second.alreadyClosed, ['Bearded Feeder']);
    assert.equal((await db.select().from(inspections)).length, 4);
    assert.equal((await db.select().from(tierProposals)).length, 1);
  });

  it('a dry run reports the changes and writes nothing', async () => {
    const db = await testDb();
    const result = await backfillAuditTrail(db, data, { dryRun: true });
    assert.deepEqual([result.inserted.length, result.changedDates.length, result.addedDates.length, result.closed.length], [3, 2, 1, 1]);
    assert.equal((await venue(zaap)).lastInspectionDate, null);
    assert.equal((await venue(feeder)).closedAt, null);
    assert.equal((await db.select().from(inspections)).length, 1);
    assert.equal((await db.select().from(tierProposals)).length, 0);
  });

  it('aborts without writing when a venue or Chair cannot be found, or a closure tier does not match', async () => {
    const db = await testDb();
    const ghost = { venue: 'Ghost Kitchen', date: '2026-01-01' };
    await assert.rejects(backfillAuditTrail(db, { ...data, addedDates: [...data.addedDates, ghost] }), BackfillError);
    await assert.rejects(backfillAuditTrail(db, { ...data, chairs: { first: 'Ste Riley', second: 'Nobody' } }), BackfillError);
    await assert.rejects(backfillAuditTrail(db, { ...data, chairs: { first: 'Ste Riley', second: 'Ste Riley' } }), BackfillError);
    await assert.rejects(backfillAuditTrail(db, { ...data, closures: [{ ...data.closures[0], toTier: 'rejected' }] }), BackfillError);
    assert.equal((await db.select().from(inspections)).length, 1);
    assert.equal((await venue(feeder)).closedAt, null);
  });
});
