import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { inspections, venues } from '@/db/schema';
import { getVisitStatus, latestVerifiedInspection, recordVisit } from '@/lib/inspections';
import {
  closeTestDb,
  createAdmin,
  createVenue,
  resetTestDb,
  skipIntegration,
  testDb,
  violates,
  type TestAdmin,
} from './db';

describe('dual-verified inspections (database)', { skip: skipIntegration }, () => {
  let sam: TestAdmin;
  let alex: TestAdmin;
  let jo: TestAdmin;
  let venueId: string;

  // 12:00 London time on 21 Oct 2026 (BST).
  const noon = new Date('2026-10-21T11:00:00Z');
  const lateEvening = new Date('2026-10-21T22:59:00Z'); // 23:59 London
  const justAfterMidnight = new Date('2026-10-21T23:01:00Z'); // 00:01 on 22 Oct, London

  beforeEach(async () => {
    await resetTestDb();
    sam = await createAdmin('sam', 'Sam');
    alex = await createAdmin('alex', 'Alex');
    jo = await createAdmin('jo', 'Jo');
    venueId = await createVenue();
  });

  after(closeTestDb);

  const rows = async () =>
    (await testDb()).select().from(inspections).where(eq(inspections.venueId, venueId));
  const lastInspected = async () =>
    (
      await (
        await testDb()
      )
        .select({ date: venues.lastInspectionDate })
        .from(venues)
        .where(eq(venues.id, venueId))
    )[0].date;

  it('a first press waits for a second admin', async () => {
    const db = await testDb();
    const outcome = await recordVisit(db, venueId, sam, 'satisfactory', noon);
    assert.equal(outcome.result, 'waiting');
    const [row] = await rows();
    assert.deepEqual(
      { status: row.status, date: row.inspectionDate, first: row.firstAdminName },
      { status: 'pending', date: '2026-10-21', first: 'Sam' }
    );
    assert.equal(await lastInspected(), null);

    const pendingFor = async (adminId: string) => {
      const { firstAdminName, byMe, firstAt } = (await getVisitStatus(db, venueId, adminId, noon))
        .pending!;
      assert.ok(!Number.isNaN(Date.parse(firstAt)), 'pending carries when the first Chair pressed');
      return { firstAdminName, byMe };
    };
    assert.deepEqual(await pendingFor(sam.id), { firstAdminName: 'Sam', byMe: true });
    assert.deepEqual(await pendingFor(alex.id), { firstAdminName: 'Sam', byMe: false });
  });

  it('two different admins on the same London day confirm one verified inspection', async () => {
    const db = await testDb();
    await recordVisit(db, venueId, sam, 'satisfactory', noon);
    const outcome = await recordVisit(db, venueId, alex, 'satisfactory', lateEvening);
    assert.equal(outcome.result, 'confirmed');
    assert.equal(outcome.result === 'confirmed' && outcome.confirmedNow, true);

    const [row] = await rows();
    assert.equal(row.status, 'confirmed');
    assert.equal(row.kind, 'verified');
    assert.equal(row.firstAdminId, 'sam');
    assert.equal(row.secondAdminId, 'alex');
    assert.equal(row.secondAdminName, 'Alex');
    assert.ok(row.confirmedAt);
    assert.equal(await lastInspected(), '2026-10-21');
    assert.equal((await latestVerifiedInspection(db, venueId))?.id, row.id);
    const { firstAdminName, secondAdminName, confirmedAt } = (
      await getVisitStatus(db, venueId, jo.id, noon)
    ).confirmed!;
    assert.deepEqual(
      { firstAdminName, secondAdminName },
      { firstAdminName: 'Sam', secondAdminName: 'Alex' }
    );
    assert.ok(confirmedAt, 'confirmed carries when the second Chair pressed');
  });

  it('the first press sets the outcome and the cosigner affirms it', async () => {
    const db = await testDb();
    await recordVisit(db, venueId, sam, 'below_par', noon);
    assert.equal((await getVisitStatus(db, venueId, alex.id, noon)).pending?.outcome, 'below_par');

    const confirmed = await recordVisit(db, venueId, alex, undefined, lateEvening);
    assert.equal(confirmed.result, 'confirmed');
    const [row] = await rows();
    assert.equal(row.outcome, 'below_par');
    assert.equal((await getVisitStatus(db, venueId, jo.id, noon)).confirmed?.outcome, 'below_par');
    assert.equal((await latestVerifiedInspection(db, venueId))?.outcome, 'below_par');
  });

  it('a cosigner may repeat the outcome but cannot name a different one', async () => {
    const db = await testDb();
    await recordVisit(db, venueId, sam, 'satisfactory', noon);
    const mismatch = await recordVisit(db, venueId, alex, 'below_par', noon);
    assert.equal(mismatch.result, 'outcome_mismatch');
    const [pending] = await rows();
    assert.deepEqual(
      { status: pending.status, outcome: pending.outcome, second: pending.secondAdminId },
      { status: 'pending', outcome: 'satisfactory', second: null }
    );

    assert.equal((await recordVisit(db, venueId, alex, 'satisfactory', noon)).result, 'confirmed');
    assert.equal((await rows())[0].outcome, 'satisfactory');
  });

  it('a first press without an outcome is refused and records nothing', async () => {
    const db = await testDb();
    assert.equal((await recordVisit(db, venueId, sam, undefined, noon)).result, 'outcome_required');
    assert.deepEqual(await rows(), []);
  });

  it('the same admin pressing again cannot change the outcome', async () => {
    const db = await testDb();
    await recordVisit(db, venueId, sam, 'satisfactory', noon);
    assert.equal((await recordVisit(db, venueId, sam, 'below_par', noon)).result, 'waiting');
    assert.equal((await rows())[0].outcome, 'satisfactory');
  });

  it('the database requires an outcome on every verified inspection but not on legacy ones', async () => {
    const db = await testDb();
    await assert.rejects(
      db.insert(inspections).values({
        venueId,
        inspectionDate: '2026-10-21',
        status: 'pending',
        kind: 'verified',
        firstAdminId: 'sam',
      }),
      violates('inspections_verified_has_outcome')
    );
    await db
      .insert(inspections)
      .values({ venueId, inspectionDate: '2026-07-01', status: 'confirmed', kind: 'legacy' });
    assert.equal((await rows())[0].outcome, null);
  });

  it('the same admin pressing twice never confirms', async () => {
    const db = await testDb();
    await recordVisit(db, venueId, sam, 'satisfactory', noon);
    const again = await recordVisit(db, venueId, sam, 'satisfactory', lateEvening);
    assert.equal(again.result, 'waiting');
    const all = await rows();
    assert.equal(all.length, 1);
    assert.equal(all[0].status, 'pending');
    assert.equal(all[0].secondAdminId, null);
  });

  it('the database itself rejects one admin confirming their own press', async () => {
    const db = await testDb();
    await recordVisit(db, venueId, sam, 'satisfactory', noon);
    await assert.rejects(
      db
        .update(inspections)
        .set({ status: 'confirmed', secondAdminId: 'sam' })
        .where(eq(inspections.venueId, venueId)),
      violates('inspections_two_different_admins')
    );
  });

  it('allows only one pending inspection per venue', async () => {
    const db = await testDb();
    await recordVisit(db, venueId, sam, 'satisfactory', noon);
    await assert.rejects(
      db.insert(inspections).values({
        venueId,
        inspectionDate: '2026-10-21',
        status: 'pending',
        outcome: 'satisfactory',
        firstAdminId: 'alex',
      }),
      violates('inspections_one_pending_per_venue')
    );
  });

  it('a first press nobody confirms lapses at London midnight; a press after midnight starts afresh', async () => {
    const db = await testDb();
    await recordVisit(db, venueId, sam, 'satisfactory', lateEvening);
    assert.equal(
      (await getVisitStatus(db, venueId, alex.id, justAfterMidnight)).pending,
      null,
      'yesterday’s press no longer shows'
    );

    const outcome = await recordVisit(db, venueId, alex, 'satisfactory', justAfterMidnight);
    assert.equal(
      outcome.result,
      'waiting',
      'Alex starts a new pending inspection instead of confirming Sam’s'
    );
    const all = (await rows()).sort((a, b) => a.inspectionDate.localeCompare(b.inspectionDate));
    assert.deepEqual(
      all.map((row) => [row.inspectionDate, row.status, row.firstAdminId]),
      [
        ['2026-10-21', 'lapsed', 'sam'],
        ['2026-10-22', 'pending', 'alex'],
      ]
    );
    assert.equal(await lastInspected(), null);
  });

  it('works across the GMT/BST change', async () => {
    const db = await testDb();
    // 25 Oct 2026: clocks go back at 02:00 BST. 00:30 BST and 23:30 GMT are the same London day.
    await recordVisit(db, venueId, sam, 'satisfactory', new Date('2026-10-24T23:30:00Z'));
    const outcome = await recordVisit(
      db,
      venueId,
      alex,
      'satisfactory',
      new Date('2026-10-25T23:30:00Z')
    );
    assert.equal(outcome.result, 'confirmed');
    assert.equal((await rows())[0].inspectionDate, '2026-10-25');
  });

  it('a later press on an already confirmed day changes nothing', async () => {
    const db = await testDb();
    await recordVisit(db, venueId, sam, 'satisfactory', noon);
    await recordVisit(db, venueId, alex, 'satisfactory', noon);
    const third = await recordVisit(db, venueId, jo, 'satisfactory', lateEvening);
    assert.equal(third.result, 'confirmed');
    assert.equal(third.result === 'confirmed' && third.confirmedNow, false);
    assert.equal((await rows()).length, 1);
  });

  it('near-simultaneous presses by two admins give exactly one confirmed inspection', async () => {
    const db = await testDb();
    for (let round = 0; round < 10; round += 1) {
      await resetTestDb();
      await createAdmin('sam', 'Sam');
      await createAdmin('alex', 'Alex');
      venueId = await createVenue(`Race ${round}`);
      const results = await Promise.all([
        recordVisit(db, venueId, sam, 'satisfactory', noon),
        recordVisit(db, venueId, alex, 'satisfactory', noon),
      ]);
      assert.deepEqual(results.map((result) => result.result).sort(), ['confirmed', 'waiting']);
      const all = await rows();
      assert.equal(all.length, 1);
      assert.equal(all[0].status, 'confirmed');
      assert.notEqual(all[0].firstAdminId, all[0].secondAdminId);
    }
  });

  it('a third admin racing a confirmation still leaves one inspection', async () => {
    const db = await testDb();
    await recordVisit(db, venueId, sam, 'satisfactory', noon);
    await Promise.all([
      recordVisit(db, venueId, alex, 'satisfactory', noon),
      recordVisit(db, venueId, jo, 'satisfactory', noon),
    ]);
    const confirmed = (await rows()).filter((row) => row.status === 'confirmed');
    assert.equal(confirmed.length, 1);
    assert.equal((await rows()).length, 1);
  });

  it('keeps history when an admin account is deleted', async () => {
    const db = await testDb();
    await recordVisit(db, venueId, sam, 'satisfactory', noon);
    await recordVisit(db, venueId, alex, 'satisfactory', noon);
    const { user } = await import('@/db/auth-schema');
    await db.delete(user).where(eq(user.id, 'sam'));
    const [row] = await db
      .select()
      .from(inspections)
      .where(and(eq(inspections.venueId, venueId), eq(inspections.status, 'confirmed')));
    assert.equal(row.firstAdminId, null);
    assert.equal(row.firstAdminName, 'Sam');
  });

  it('404s for an unknown venue', async () => {
    const outcome = await recordVisit(
      await testDb(),
      '3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f',
      sam,
      'satisfactory',
      noon
    );
    assert.equal(outcome.result, 'not_found');
  });
});
