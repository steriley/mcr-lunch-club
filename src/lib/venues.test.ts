import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSlugTaken,
  listVenueRevisions,
  recordVenueRevision,
  routeColumns,
  serializeVenue,
  updateVenue,
  venueValues,
} from './venues';
import type { Database } from './db-client';
import { renderSql } from '../test/route-helpers';
import { venueInputSchema, type VenueInput } from './venue-schema';
import type { VenueRow } from '@/db/schema';

function input(overrides: Record<string, unknown> = {}): VenueInput {
  return venueInputSchema.parse({
    name: 'Chip Shop',
    slug: 'chip-shop',
    tier: 'approved',
    cost: '££',
    ...overrides,
  });
}

describe('venueValues', () => {
  it('stores the resolved route, never values from the input', () => {
    const values = venueValues(
      input({ latitude: 53.48, longitude: -2.25, distanceMiles: 9, walkingTimeMin: 99 }),
      'user-1',
      {
        distanceMiles: 0.4,
        walkingTimeMin: 8,
      }
    );
    assert.equal(values.distanceMiles, '0.40');
    assert.equal(values.walkingTimeMin, 8);
    assert.equal(values.updatedBy, 'user-1');
  });

  it('keeps a pending route as null and formats coordinates to six places', () => {
    const blank = venueValues(input(), null, { distanceMiles: null, walkingTimeMin: null });
    assert.equal(blank.latitude, null);
    assert.equal(blank.distanceMiles, null);
    assert.equal(blank.walkingTimeMin, null);
    assert.equal(blank.updatedBy, null);

    const located = venueValues(input({ latitude: 53.5, longitude: -2.25 }), null, {
      distanceMiles: null,
      walkingTimeMin: null,
    });
    assert.equal(located.latitude, '53.500000');
    assert.equal(located.longitude, '-2.250000');
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

describe('routeColumns', () => {
  it('rounds distance to two places and only touches routeUpdatedAt when given', () => {
    const at = new Date('2026-10-22T09:00:00Z');
    assert.deepEqual(
      routeColumns({ distanceMiles: 0.4567, walkingTimeMin: 9, routeUpdatedAt: at }),
      { distanceMiles: '0.46', walkingTimeMin: 9, routeUpdatedAt: at }
    );
    assert.deepEqual(
      routeColumns({ distanceMiles: null, walkingTimeMin: null, routeUpdatedAt: null }),
      { distanceMiles: null, walkingTimeMin: null, routeUpdatedAt: null }
    );
    assert.deepEqual(routeColumns({ distanceMiles: 1, walkingTimeMin: 20 }), {
      distanceMiles: '1.00',
      walkingTimeMin: 20,
    });
  });
});

describe('updateVenue', () => {
  /** A db whose transaction runs on a recorder: update(...).returning() resolves to `rows`. */
  function transactionalDb(rows: unknown[]) {
    const calls: { method: string; args: unknown[] }[] = [];
    let transactions = 0;
    const chain: any = new Proxy(
      {},
      {
        get: (_target, method: string) => {
          if (method === 'then') return undefined;
          return (...args: unknown[]) => {
            calls.push({ method, args });
            return method === 'returning'
              ? Promise.resolve(rows)
              : method === 'values'
                ? Promise.resolve([])
                : chain;
          };
        },
      }
    );
    const db = {
      transaction: async (fn: (tx: unknown) => unknown) => ((transactions += 1), fn(chain)),
    } as unknown as Database;
    return { db, calls, transactions: () => transactions };
  }
  const row = {
    id: 'venue-1',
    latitude: null,
    longitude: null,
    distanceMiles: '0.40',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as VenueRow;

  it("stamps a Chair's change and records the revision as theirs, in one transaction", async () => {
    const { db, calls, transactions } = transactionalDb([row]);
    const now = new Date('2026-10-22T09:00:00Z');
    assert.equal(
      await updateVenue(db, 'venue-1', { tier: 'approved' }, { id: 'user-1' }, now),
      row
    );
    assert.deepEqual(calls.find((call) => call.method === 'set')!.args[0], {
      tier: 'approved',
      updatedBy: 'user-1',
      updatedAt: now,
    });
    assert.equal(
      (calls.find((call) => call.method === 'values')!.args[0] as any).changedBy,
      'user-1'
    );
    assert.equal(transactions(), 1);
  });

  it("leaves the editor stamp alone for a script's change", async () => {
    const { db, calls } = transactionalDb([row]);
    await updateVenue(db, 'venue-1', { walkingTimeMin: 9 }, null);
    assert.deepEqual(calls.find((call) => call.method === 'set')!.args[0], { walkingTimeMin: 9 });
    assert.equal((calls.find((call) => call.method === 'values')!.args[0] as any).changedBy, null);
  });

  it('returns null and records nothing when the venue does not exist', async () => {
    const { db, calls } = transactionalDb([]);
    assert.equal(await updateVenue(db, 'gone', { walkingTimeMin: 9 }, { id: 'user-1' }), null);
    assert.ok(!calls.some((call) => call.method === 'values'));
  });
});
