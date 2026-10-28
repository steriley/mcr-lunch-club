import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicVenue } from './public-data';
import { nearbyAlternatives } from './nearby-venues';

function make(slug: string, lat: number | null, lng: number | null, overrides: Partial<PublicVenue> = {}): PublicVenue {
  return {
    id: slug, name: slug, slug, tier: 'approved', lat, lng, distanceMiles: null, walkingTimeMin: null, cost: '££', cuisine: 'Other',
    eatLikeUs: '', lastInspectionDate: 'Awaiting Assessment', address: '', mapSearchLink: '', image: null, closed: false, ...overrides,
  };
}

// Each 0.001 degrees of latitude is about 111 m.
const here = make('here', 53.48, -2.24);
const near = make('near', 53.481, -2.24);
const mid = make('mid', 53.483, -2.24, { tier: 'under_consideration' });
const far = make('far', 53.49, -2.24, { tier: 'to_be_assessed' });
const farther = make('farther', 53.5, -2.24);

describe('nearbyAlternatives', () => {
  it('orders by straight-line distance and caps at three', () => {
    const result = nearbyAlternatives(here, [farther, far, here, mid, near]);
    assert.deepEqual(result.map((v) => v.slug), ['near', 'mid', 'far']);
  });

  it('never includes the venue itself', () => {
    assert.equal(nearbyAlternatives(here, [here, near]).some((v) => v.slug === 'here'), false);
  });

  it('leaves out closed venues and tiers that are not suggestable', () => {
    const result = nearbyAlternatives(here, [
      make('closed', 53.4801, -2.24, { closed: true, tier: 'gone_but_not_forgotten' }),
      make('rejected', 53.4802, -2.24, { tier: 'rejected' }),
      make('if-we-must', 53.4803, -2.24, { tier: 'if_we_must' }),
      far,
    ]);
    assert.deepEqual(result.map((v) => v.slug), ['far']);
  });

  it('skips venues without coordinates', () => {
    assert.deepEqual(nearbyAlternatives(here, [make('nowhere', null, null), near]).map((v) => v.slug), ['near']);
  });

  it('is empty when the venue has no coordinates, and works for a closed venue', () => {
    assert.deepEqual(nearbyAlternatives(make('nowhere', null, null), [near]), []);
    const closedHere = make('closed-here', 53.48, -2.24, { closed: true, tier: 'gone_but_not_forgotten' });
    assert.deepEqual(nearbyAlternatives(closedHere, [near]).map((v) => v.slug), ['near']);
  });

  it('breaks distance ties by name', () => {
    const a = make('a', 53.481, -2.24);
    const b = make('b', 53.481, -2.24);
    assert.deepEqual(nearbyAlternatives(here, [b, a]).map((v) => v.slug), ['a', 'b']);
  });
});
