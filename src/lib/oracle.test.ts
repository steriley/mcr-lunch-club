import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ORACLE_TIERS, oraclePool } from './oracle';
import type { Venue } from '@/types';

const venue = (id: string, overrides: Partial<Venue> = {}): Venue => ({
  id, slug: id, name: id, tier: 'approved', lat: 53.48, lng: -2.25, distanceMiles: 0.4, walkingTimeMin: 9,
  cost: '££', cuisine: 'British', eatLikeUs: '', lastInspectionDate: '2026-10-15', address: '', mapSearchLink: '',
  ...overrides,
});
const ids = (venues: Venue[]) => venues.map((v) => v.id).sort();

describe('oraclePool', () => {
  it('draws from Approved, Under Consideration and To Be Assessed only', () => {
    assert.deepEqual([...ORACLE_TIERS], ['approved', 'under_consideration', 'to_be_assessed']);
    const venues = [
      venue('a', { tier: 'approved' }),
      venue('u', { tier: 'under_consideration' }),
      venue('t', { tier: 'to_be_assessed' }),
      venue('w', { tier: 'if_we_must' }),
      venue('r', { tier: 'rejected' }),
      venue('g', { tier: 'gone_but_not_forgotten' }),
    ];
    assert.deepEqual(ids(oraclePool(venues, 15, 'any')), ['a', 't', 'u']);
  });

  it('keeps to the walking time and the budget', () => {
    const venues = [venue('near', { walkingTimeMin: 5, cost: '£' }), venue('far', { walkingTimeMin: 20, cost: '£' }), venue('dear', { walkingTimeMin: 5, cost: '£££' })];
    assert.deepEqual(ids(oraclePool(venues, 10, '£')), ['near']);
  });

  it('skips venues with no walking time yet', () => {
    assert.deepEqual(ids(oraclePool([venue('pending', { walkingTimeMin: null }), venue('ok')], 15, 'any')), ['ok']);
  });

  it('relaxes the budget, then the walk, rather than come back empty', () => {
    const venues = [venue('a', { walkingTimeMin: 5, cost: '££' }), venue('b', { walkingTimeMin: 40, cost: '£' })];
    assert.deepEqual(ids(oraclePool(venues, 10, '£££')), ['a']);
    assert.deepEqual(ids(oraclePool(venues, 2, 'any')), ['a', 'b']);
  });

  it('is empty only when no venue is in its tiers', () => {
    assert.deepEqual(oraclePool([venue('r', { tier: 'rejected' })], 15, 'any'), []);
  });
});
