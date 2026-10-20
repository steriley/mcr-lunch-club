import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { inspections, venues } from '@/db/schema';
import { latestVerifiedInspection } from '@/lib/inspections';
import { importLegacyInspections, UnmatchedVenuesError } from '@/lib/legacy-inspections';
import { closeTestDb, createVenue, resetTestDb, skipIntegration, testDb } from './db';

describe('legacy inspection import (database)', { skip: skipIntegration }, () => {
  let pedro: string;
  let pat: string;
  let other: string;

  beforeEach(async () => {
    await resetTestDb();
    pedro = await createVenue('Crazy Pedro’s', { lastInspectionDate: '2026-09-18' });
    pat = await createVenue('Fat Pat’s', { lastInspectionDate: '2026-09-25' });
    other = await createVenue('Unlisted Cafe', { lastInspectionDate: '2026-01-10' });
  });

  after(closeTestDb);

  const entries = [
    { venue: "Crazy Pedro's", date: '2026-07-22' },
    { venue: "Fat Pat's", date: null },
  ];
  const lastDate = async (id: string) => (await (await testDb()).select({ d: venues.lastInspectionDate }).from(venues).where(eq(venues.id, id)))[0].d;

  it('imports confirmed legacy rows, clears never-inspected and unlisted venues, and is idempotent', async () => {
    const db = await testDb();
    const first = await importLegacyInspections(db, entries);
    assert.equal(first.inserted, 1);
    assert.equal(await lastDate(pedro), '2026-07-22');
    assert.equal(await lastDate(pat), null);
    assert.equal(await lastDate(other), null);
    assert.deepEqual(first.changedDates.filter((change) => change.after === null).map((change) => change.name), ['Fat Pat’s', 'Unlisted Cafe']);

    const [row] = await db.select().from(inspections).where(eq(inspections.venueId, pedro));
    assert.deepEqual({ status: row.status, kind: row.kind, first: row.firstAdminId, second: row.secondAdminId }, { status: 'confirmed', kind: 'legacy', first: null, second: null });
    assert.equal(await latestVerifiedInspection(db, pedro), null, 'legacy rows never count as verified');

    const second = await importLegacyInspections(db, entries);
    assert.equal(second.inserted, 0);
    assert.deepEqual(second.changedDates, []);
    assert.equal((await db.select().from(inspections)).length, 1);
  });

  it('can leave unlisted venues alone', async () => {
    await importLegacyInspections(await testDb(), entries, { keepUnlisted: true });
    assert.equal(await lastDate(other), '2026-01-10');
    assert.equal(await lastDate(pat), null);
  });

  it('a dry run reports the changes and writes nothing', async () => {
    const db = await testDb();
    const result = await importLegacyInspections(db, entries, { dryRun: true });
    assert.equal(result.inserted, 1);
    assert.equal(result.changedDates.length, 3);
    assert.equal(await lastDate(pedro), '2026-09-18');
    assert.equal((await db.select().from(inspections)).length, 0);
  });

  it('aborts without writing when a listed venue cannot be matched', async () => {
    const db = await testDb();
    await assert.rejects(importLegacyInspections(db, [...entries, { venue: 'Ghost Kitchen', date: '2026-01-01' }, { venue: 'Nowhere', date: null }]), (error) => {
      assert.ok(error instanceof UnmatchedVenuesError);
      assert.deepEqual(error.names, ['Ghost Kitchen', 'Nowhere']);
      return true;
    });
    assert.equal(await lastDate(pedro), '2026-09-18');
    assert.equal((await db.select().from(inspections)).length, 0);
  });
});
