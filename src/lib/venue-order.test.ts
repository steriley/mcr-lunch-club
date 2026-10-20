import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ALPHABETICAL_TIERS, compareByWalkingTime, sortForPublic, sortForTier } from './venue-order';
import type { TierValue } from './tiers';

const venue = (name: string, walkingTimeMin: number | null, tier: TierValue = 'approved') => ({ name, walkingTimeMin, tier });
const names = (venues: { name: string }[]) => venues.map((entry) => entry.name);

describe('sortForTier', () => {
  const mixed = [venue('Zed', 3), venue('alpha', 10), venue('Unknown', null), venue('Beta', 3), venue('Another unknown', null)];

  for (const tier of ['approved', 'under_consideration', 'to_be_assessed', 'if_we_must'] as const) {
    it(`orders ${tier} by walking time, unknown times last, then name`, () => {
      assert.deepEqual(names(sortForTier(tier, mixed)), ['Beta', 'Zed', 'alpha', 'Another unknown', 'Unknown']);
    });
  }

  for (const tier of ALPHABETICAL_TIERS) {
    it(`orders ${tier} alphabetically, ignoring walking time and case`, () => {
      assert.deepEqual(names(sortForTier(tier, mixed)), ['alpha', 'Another unknown', 'Beta', 'Unknown', 'Zed']);
    });
  }

  it('compares names case-insensitively, unlike a plain code-point sort', () => {
    assert.deepEqual(names(sortForTier('rejected', [venue('Banana', 1), venue('apple', 1), venue('Éclair', 1), venue('cherry', 1)])), [
      'apple', 'Banana', 'cherry', 'Éclair',
    ]);
  });

  it('does not mutate its input', () => {
    const input = [venue('B', 2), venue('A', 1)];
    sortForTier('approved', input);
    assert.deepEqual(names(input), ['B', 'A']);
  });

  it('keeps walking-time ties in name order', () => {
    assert.equal(compareByWalkingTime(venue('A', 5), venue('B', 5)) < 0, true);
    assert.equal(compareByWalkingTime(venue('B', 5), venue('A', 5)) > 0, true);
    assert.equal(compareByWalkingTime(venue('A', null), venue('A', null)), 0);
  });
});

describe('sortForPublic', () => {
  it('groups by tier in TIERS order and sorts within each tier', () => {
    const sorted = sortForPublic(
      [
        venue('Gone B', 1, 'gone_but_not_forgotten'),
        venue('Far', 20),
        venue('Rejected Z', 1, 'rejected'),
        venue('Gone A', 9, 'gone_but_not_forgotten'),
        venue('Near', 2),
        venue('Rejected A', 30, 'rejected'),
        venue('Considering', 4, 'under_consideration'),
      ],
      (entry) => entry.tier
    );
    assert.deepEqual(names(sorted), ['Near', 'Far', 'Considering', 'Rejected A', 'Rejected Z', 'Gone A', 'Gone B']);
  });
});
