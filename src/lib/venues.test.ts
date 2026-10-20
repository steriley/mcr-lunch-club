import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  distanceFromBaseMiles,
  estimateWalkingMinutes,
  isSlugTaken,
  listVenueRevisions,
  recordVenueRevision,
  serializeVenue,
  venueValues,
} from './venues';
import type { Database } from './db-client';
import { renderSql } from '../test/route-helpers';
import { BASE_LAT, BASE_LNG } from './map/config';
import { venueInputSchema, type VenueInput } from './venue-schema';
import type { VenueRow } from '@/db/schema';

function input(overrides: Record<string, unknown> = {}): VenueInput {
  return venueInputSchema.parse({ name: 'Chip Shop', slug: 'chip-shop', tier: 'approved', cost: '££', ...overrides });
}

describe('distanceFromBaseMiles', () => {
  it('is zero at the base', () => {
    assert.equal(distanceFromBaseMiles(BASE_LAT, BASE_LNG), 0);
  });

  it('rounds to two decimal places', () => {
    // 0.01 degrees of latitude is about 1.11km, or 0.69 miles
    assert.equal(distanceFromBaseMiles(BASE_LAT + 0.01, BASE_LNG), 0.69);
  });
});

describe('estimateWalkingMinutes', () => {
  it('returns at least one minute', () => {
    assert.equal(estimateWalkingMinutes(0), 1);
    assert.equal(estimateWalkingMinutes(-1), 1);
    assert.equal(estimateWalkingMinutes(0.01), 1);
  });

  it('adds a longer buffer beyond half a mile', () => {
    assert.equal(estimateWalkingMinutes(0.5), 11); // 9.75 + 1
    assert.equal(estimateWalkingMinutes(1), 22); // 19.5 + 2
  });
});

describe('venueValues', () => {
  it('derives distance and walking time from coordinates when blank', () => {
    const values = venueValues(input({ latitude: BASE_LAT + 0.01, longitude: BASE_LNG }), 'user-1');
    assert.equal(values.distanceMiles, '0.69');
    assert.equal(values.walkingTimeMin, 15); // round(0.69 * 19.5 + 2)
    assert.equal(values.updatedBy, 'user-1');
  });

  it('keeps explicitly supplied distance and walking time', () => {
    const values = venueValues(input({ latitude: 53.48, longitude: -2.25, distanceMiles: 2, walkingTimeMin: 5 }), null);
    assert.equal(values.distanceMiles, '2.00');
    assert.equal(values.walkingTimeMin, 5);
    assert.equal(values.updatedBy, null);
  });

  it('leaves derived fields null without coordinates and formats coordinates to six places', () => {
    const blank = venueValues(input(), null);
    assert.equal(blank.latitude, null);
    assert.equal(blank.distanceMiles, null);
    assert.equal(blank.walkingTimeMin, null);

    const located = venueValues(input({ latitude: 53.5, longitude: -2.25 }), null);
    assert.equal(located.latitude, '53.500000');
    assert.equal(located.longitude, '-2.250000');
  });

  it('derives walking time from a supplied distance', () => {
    assert.equal(venueValues(input({ distanceMiles: 1 }), null).walkingTimeMin, 22);
  });
});

describe('serializeVenue', () => {
  it('converts decimals to numbers and dates to ISO strings', () => {
    const row = {
      id: 'id',
      latitude: '53.480000',
      longitude: null,
      distanceMiles: '0.50',
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      updatedAt: new Date('2026-02-03T04:05:06.000Z'),
    } as unknown as VenueRow;
    const result = serializeVenue(row);
    assert.equal(result.latitude, 53.48);
    assert.equal(result.longitude, null);
    assert.equal(result.distanceMiles, 0.5);
    assert.equal(result.createdAt, '2026-01-02T03:04:05.000Z');
    assert.equal(result.updatedAt, '2026-02-03T04:05:06.000Z');
  });
});

/** Records each builder call and resolves to `rows` at the end of the chain. */
function fakeDb(rows: unknown[] = []) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: any = new Proxy(
    {},
    {
      get: (_target, method: string) => {
        if (method === 'then') return undefined;
        return (...args: unknown[]) => {
          calls.push({ method, args });
          return method === 'limit' || method === 'values' ? Promise.resolve(rows) : chain;
        };
      },
    }
  );
  return { db: chain as Database, calls };
}

describe('isSlugTaken', () => {
  it('is true when a venue already uses the slug', async () => {
    assert.equal(await isSlugTaken(fakeDb([{ id: 'x' }]).db, 'chip-shop'), true);
  });

  it('matches on the slug alone when no id is excluded', async () => {
    const { db, calls } = fakeDb([]);
    await isSlugTaken(db, 'chip-shop');
    const { sql, params } = renderSql(calls.find((call) => call.method === 'where')!.args[0]);
    assert.match(sql, /"slug" = \$1/);
    assert.doesNotMatch(sql, /<>/);
    assert.deepEqual(params, ['chip-shop']);
  });

  it('ignores the venue being edited when an id is excluded', async () => {
    const { db, calls } = fakeDb([]);
    await isSlugTaken(db, 'chip-shop', 'own-id');
    const { sql, params } = renderSql(calls.find((call) => call.method === 'where')!.args[0]);
    assert.match(sql, /"slug" = \$1 and "venues"\."id" <> \$2/);
    assert.deepEqual(params, ['chip-shop', 'own-id']);
  });

  it('is false when nothing matches, with or without an excluded id', async () => {
    assert.equal(await isSlugTaken(fakeDb([]).db, 'chip-shop'), false);
    assert.equal(await isSlugTaken(fakeDb([]).db, 'chip-shop', 'own-id'), false);
  });
});

describe('recordVenueRevision', () => {
  it('stores a serialised snapshot with the editor id', async () => {
    const { db, calls } = fakeDb();
    const row = {
      id: 'venue-1',
      latitude: '53.480000',
      longitude: '-2.250000',
      distanceMiles: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    } as unknown as VenueRow;

    await recordVenueRevision(db, row, 'user-1');
    const values = calls.find((call) => call.method === 'values')!.args[0] as any;
    assert.equal(values.venueId, 'venue-1');
    assert.equal(values.changedBy, 'user-1');
    assert.equal(values.snapshot.latitude, 53.48);
    assert.equal(values.snapshot.updatedAt, '2026-01-02T00:00:00.000Z');
  });
});

describe('listVenueRevisions', () => {
  it('returns at most 100 revisions', async () => {
    const revisions = [{ id: 'r1' }];
    const { db, calls } = fakeDb(revisions);
    assert.equal(await listVenueRevisions(db, 'venue-1'), revisions);
    assert.deepEqual(calls.find((call) => call.method === 'limit')!.args, [100]);
  });
});
