import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asc, eq } from 'drizzle-orm';
import { goldenCut, venues } from '@/db/schema';
import { db as appDb } from '@/lib/db';
import { listGoldenCut, saveGoldenCut } from '@/lib/golden-cut';
import { getGoldenCut } from '@/lib/public-data';
import { closeTestDb, createAdmin, createVenue, resetTestDb, skipIntegration, testDb, violates, type TestAdmin } from './db';

describe('the Golden Cut (database)', { skip: skipIntegration }, () => {
  let sam: TestAdmin;
  let alex: TestAdmin;
  let ids: string[];

  beforeEach(async () => {
    await resetTestDb();
    sam = await createAdmin('sam', 'Sam');
    alex = await createAdmin('alex', 'Alex');
    ids = [];
    for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']) ids.push(await createVenue(name, { tier: 'approved' }));
  });

  after(closeTestDb);

  const stored = async () =>
    (await (await testDb()).select().from(goldenCut).orderBy(asc(goldenCut.position))).map((row) => [row.venueId, row.position]);

  it('saves, reorders and clears the list', async () => {
    const db = await testDb();
    assert.deepEqual(await saveGoldenCut(db, [ids[0], ids[1], ids[2]].map((venueId) => ({ venueId, puffPiece: null, anchorDish: null })), sam), { ok: true });
    assert.deepEqual(await stored(), [[ids[0], 1], [ids[1], 2], [ids[2], 3]]);

    await saveGoldenCut(db, [ids[2], ids[0]].map((venueId) => ({ venueId, puffPiece: null, anchorDish: null })), alex);
    assert.deepEqual(await stored(), [[ids[2], 1], [ids[0], 2]]);
    assert.deepEqual((await listGoldenCut(db)).map((entry) => entry.venueName), ['Charlie', 'Alpha']);

    await saveGoldenCut(db, [], sam);
    assert.deepEqual(await stored(), []);
  });

  it('refuses a venue that is not Approved and keeps the old list', async () => {
    const db = await testDb();
    await saveGoldenCut(db, [{ venueId: ids[0], puffPiece: null, anchorDish: null }], sam);
    await db.update(venues).set({ tier: 'if_we_must' }).where(eq(venues.id, ids[1]));
    const result = await saveGoldenCut(db, [{ venueId: ids[1], puffPiece: null, anchorDish: null }], sam);
    assert.equal(result.ok, false);
    assert.deepEqual(await stored(), [[ids[0], 1]]);
  });

  it('enforces five positions and one row per venue in the database too', async () => {
    const db = await testDb();
    await assert.rejects(db.insert(goldenCut).values({ venueId: ids[0], position: 6 }), violates('golden_cut_position_range'));
    await db.insert(goldenCut).values({ venueId: ids[0], position: 1 });
    await assert.rejects(db.insert(goldenCut).values({ venueId: ids[1], position: 1 }), violates('golden_cut_position_idx'));
  });

  it('two Chairs saving at once both succeed, and one list wins whole', async () => {
    const db = await testDb();
    const first = [ids[0], ids[1], ids[2]].map((venueId) => ({ venueId, puffPiece: null, anchorDish: null }));
    const second = [ids[3], ids[4]].map((venueId) => ({ venueId, puffPiece: null, anchorDish: null }));
    const results = await Promise.all([saveGoldenCut(db, first, sam), saveGoldenCut(db, second, alex)]);
    assert.deepEqual(results, [{ ok: true }, { ok: true }]);
    const venueIds = (await stored()).map(([venueId]) => venueId);
    assert.ok(
      JSON.stringify(venueIds) === JSON.stringify(first.map((entry) => entry.venueId)) ||
        JSON.stringify(venueIds) === JSON.stringify(second.map((entry) => entry.venueId)),
      `got a mix: ${venueIds}`
    );
  });

  it('the home page skips a venue that left Approved, and deleting a venue removes its entry', async () => {
    const db = await testDb();
    await saveGoldenCut(db, [ids[0], ids[1], ids[2]].map((venueId) => ({ venueId, puffPiece: null, anchorDish: null })), sam);
    await db.update(venues).set({ tier: 'rejected' }).where(eq(venues.id, ids[0]));
    await db.delete(venues).where(eq(venues.id, ids[2]));

    const original = (appDb as any).select;
    (appDb as any).select = (...args: unknown[]) => (db as any).select(...args);
    try {
      assert.deepEqual((await getGoldenCut()).map((item) => item.venue.name), ['Bravo']);
    } finally {
      (appDb as any).select = original;
    }
    assert.deepEqual((await listGoldenCut(db)).map((entry) => [entry.venueName, entry.notShownReason]), [['Alpha', 'No longer Approved'], ['Bravo', null]]);
  });
});
