import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq, isNotNull } from 'drizzle-orm';
import { venues } from '@/db/schema';
import { OrsError, type LatLng, type WalkingRoute } from '@/lib/ors';
import { backfillRoutes } from '@/lib/route-backfill';
import { closeTestDb, createVenue, resetTestDb, skipIntegration, testDb } from './db';

describe('route backfill (database)', { skip: skipIntegration }, () => {
  beforeEach(async () => {
    await resetTestDb();
    // 30 estimated venues (two Matrix batches), one already routed, one without a location.
    for (let index = 0; index < 30; index += 1) {
      await createVenue(`Venue ${String(index).padStart(2, '0')}`, { distanceMiles: '0.50', walkingTimeMin: 11 });
    }
    await createVenue('Already Routed', { distanceMiles: '0.20', walkingTimeMin: 4, routeUpdatedAt: new Date('2026-10-01T00:00:00Z') });
    await createVenue('No Location', { latitude: null, longitude: null });
  });

  after(closeTestDb);

  const walk: WalkingRoute = { distanceMetres: 1609.344, durationSeconds: 1200 };
  const fast = { delayMs: 0, sleep: async () => {} };
  const routedCount = async () => (await (await testDb()).select().from(venues).where(isNotNull(venues.routeUpdatedAt))).length;

  it('routes every estimated venue through Matrix batches, leaving routed venues and venues without a location alone', async () => {
    const db = await testDb();
    const batches: number[] = [];
    const result = await backfillRoutes(db, {
      ...fast,
      matrix: async (destinations: LatLng[]) => {
        batches.push(destinations.length);
        return destinations.map(() => walk);
      },
      route: async () => assert.fail('Directions should not be needed'),
    });
    assert.deepEqual(batches, [25, 5]);
    assert.deepEqual({ todo: result.todo, routed: result.routed, failed: result.failed, stopped: result.stopped }, { todo: 30, routed: 30, failed: [], stopped: null });
    const [venue] = await db.select().from(venues).where(eq(venues.name, 'Venue 00'));
    assert.deepEqual({ miles: venue.distanceMiles, minutes: venue.walkingTimeMin }, { miles: '1.00', minutes: 20 });
    const [routed] = await db.select().from(venues).where(eq(venues.name, 'Already Routed'));
    assert.equal(routed.walkingTimeMin, 4);
    assert.equal(await routedCount(), 31);
  });

  it('falls back to Directions for venues Matrix cannot route, and for a failed batch', async () => {
    const db = await testDb();
    let matrixCalls = 0;
    const directions: LatLng[] = [];
    const result = await backfillRoutes(db, {
      ...fast,
      matrix: async (destinations) => {
        matrixCalls += 1;
        if (matrixCalls === 2) throw new OrsError('unavailable', 'down');
        return destinations.map((_, index) => (index === 0 ? null : walk));
      },
      route: async (to) => {
        directions.push(to);
        return walk;
      },
    });
    assert.equal(result.routed, 30);
    assert.equal(directions.length, 1 + 5, 'one Matrix gap plus the whole failed second batch');
  });

  it('stops on a rate limit, keeps what it saved, and a rerun finishes the rest', async () => {
    const db = await testDb();
    const first = await backfillRoutes(db, {
      ...fast,
      matrix: async (destinations) => {
        if (destinations.length === 5) throw new OrsError('rate_limited', 'quota');
        return destinations.map(() => walk);
      },
    });
    assert.equal(first.routed, 25);
    assert.match(first.stopped!, /quota/);
    assert.equal(first.remaining, 5);

    const second = await backfillRoutes(db, { ...fast, matrix: async (destinations) => destinations.map(() => walk) });
    assert.deepEqual({ todo: second.todo, routed: second.routed }, { todo: 5, routed: 5 });
    assert.equal(await routedCount(), 31);
  });

  it('records venues that cannot be routed at all and leaves them for a rerun', async () => {
    const db = await testDb();
    const result = await backfillRoutes(db, {
      ...fast,
      noMatrix: true,
      route: async () => {
        throw new OrsError('no_result', 'no route');
      },
    });
    assert.equal(result.routed, 0);
    assert.equal(result.failed.length, 30);
    const [venue] = await db.select().from(venues).where(eq(venues.name, 'Venue 00'));
    assert.equal(venue.walkingTimeMin, 11, 'the old estimate stays until a route is found');
  });

  it('a dry run calls nothing and writes nothing', async () => {
    const db = await testDb();
    const lines: string[] = [];
    const result = await backfillRoutes(db, {
      dryRun: true,
      log: (line) => lines.push(line),
      matrix: async () => assert.fail('no ORS calls in a dry run'),
    });
    assert.equal(result.todo, 30);
    assert.equal(lines.length, 30);
    assert.equal(await routedCount(), 1);
  });

  it('--all recomputes venues that were already routed', async () => {
    const result = await backfillRoutes(await testDb(), { ...fast, all: true, matrix: async (destinations) => destinations.map(() => walk) });
    assert.equal(result.todo, 31);
  });
});
