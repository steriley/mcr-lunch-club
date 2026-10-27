import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asc, eq } from 'drizzle-orm';
import { inspections, venues } from '@/db/schema';
import { backfillVerifiedInspections, BackfillError, type BackfillEntry } from '@/lib/inspection-backfill';
import { latestVerifiedInspection } from '@/lib/inspections';
import { closeTestDb, createAdmin, createVenue, resetTestDb, skipIntegration, testDb } from './db';

describe('verified inspection backfill (database)', { skip: skipIntegration }, () => {
  let zaap: string;
  let pho: string;
  let dated: string;

  beforeEach(async () => {
    await resetTestDb();
    await createAdmin('ste', 'Ste Riley');
    await createAdmin('tommy', 'Tommy Clark');
    zaap = await createVenue('Zaap Thai Street Food');
    pho = await createVenue('Pho Cue');
    dated = await createVenue('Already Dated');
    await (await testDb()).insert(inspections).values({ venueId: dated, inspectionDate: '2026-02-01', status: 'confirmed', kind: 'legacy' });
    await (await testDb()).update(venues).set({ lastInspectionDate: '2026-02-01' }).where(eq(venues.id, dated));
  });

  after(closeTestDb);

  const chairs = { first: 'Ste Riley', second: 'Tommy Clark' };
  const entries: BackfillEntry[] = [
    { venue: 'Zaap Thai Street Food', date: '2026-06-03', outcome: 'below_par' },
    { venue: 'Zaap Thai Street Food', date: '2026-06-16', outcome: 'satisfactory' },
    { venue: 'Pho Cue', date: '2026-06-03', outcome: 'below_par' },
    { venue: 'Already Dated', date: '2026-07-01', outcome: 'satisfactory' },
  ];
  const lastDate = async (id: string) => (await (await testDb()).select({ d: venues.lastInspectionDate }).from(venues).where(eq(venues.id, id)))[0].d;

  it('writes confirmed verified rows by both Chairs, skips dated venues, and is idempotent', async () => {
    const db = await testDb();
    const first = await backfillVerifiedInspections(db, entries, chairs);
    assert.equal(first.inserted.length, 3);
    assert.deepEqual(first.skipped.map((venue) => venue.name), ['Already Dated']);
    assert.equal(await lastDate(zaap), '2026-06-16');
    assert.equal(await lastDate(pho), '2026-06-03');
    assert.equal(await lastDate(dated), '2026-02-01');

    const rows = await db.select().from(inspections).where(eq(inspections.venueId, zaap)).orderBy(asc(inspections.inspectionDate));
    assert.deepEqual(
      rows.map((row) => [row.inspectionDate, row.status, row.kind, row.outcome, row.firstAdminId, row.secondAdminName, row.confirmedAt]),
      [
        ['2026-06-03', 'confirmed', 'verified', 'below_par', 'ste', 'Tommy Clark', null],
        ['2026-06-16', 'confirmed', 'verified', 'satisfactory', 'ste', 'Tommy Clark', null],
      ]
    );
    assert.equal((await latestVerifiedInspection(db, zaap))?.inspectionDate, '2026-06-16');

    const second = await backfillVerifiedInspections(db, entries, chairs);
    assert.equal(second.inserted.length, 0);
    assert.equal(second.skipped.length, 3);
    assert.equal((await db.select().from(inspections)).length, 4);
  });

  it('a dry run reports the changes and writes nothing', async () => {
    const db = await testDb();
    const result = await backfillVerifiedInspections(db, entries, chairs, { dryRun: true });
    assert.equal(result.inserted.length, 3);
    assert.equal(result.changedDates.length, 2);
    assert.equal(await lastDate(zaap), null);
    assert.equal((await db.select().from(inspections)).length, 1);
  });

  it('aborts without writing when a venue or Chair cannot be found', async () => {
    const db = await testDb();
    await assert.rejects(backfillVerifiedInspections(db, [...entries, { venue: 'Ghost Kitchen', date: '2026-01-01', outcome: 'satisfactory' }], chairs), BackfillError);
    await assert.rejects(backfillVerifiedInspections(db, entries, { first: 'Ste Riley', second: 'Nobody' }), BackfillError);
    await assert.rejects(backfillVerifiedInspections(db, entries, { first: 'Ste Riley', second: 'Ste Riley' }), BackfillError);
    assert.equal((await db.select().from(inspections)).length, 1);
  });
});
