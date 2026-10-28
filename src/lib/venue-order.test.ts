import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALPHABETICAL_TIERS,
  compareByWalkingTime,
  sortByRecentInspection,
  sortForPublic,
  tierComparator,
} from './venue-order';
import type { TierValue } from './tiers';

const venue = (name: string, walkingTimeMin: number | null, tier: TierValue = 'approved') => ({
  name,
  walkingTimeMin,
  tier,
});
const names = (venues: { name: string }[]) => venues.map((entry) => entry.name);
const sortedFor = (tier: TierValue, venues: ReturnType<typeof venue>[]) =>
  [...venues].sort(tierComparator(tier));

describe('tierComparator', () => {
  const mixed = [
    venue('Zed', 3),
    venue('alpha', 10),
    venue('Unknown', null),
    venue('Beta', 3),
    venue('Another unknown', null),
  ];

  for (const tier of ['approved', 'under_consideration', 'to_be_assessed', 'if_we_must'] as const) {
    it(`orders ${tier} by walking time, unknown times last, then name`, () => {
      assert.deepEqual(names(sortedFor(tier, mixed)), [
        'Beta',
        'Zed',
        'alpha',
        'Another unknown',
        'Unknown',
      ]);
    });
  }

  for (const tier of ALPHABETICAL_TIERS) {
    it(`orders ${tier} alphabetically, ignoring walking time and case`, () => {
      assert.deepEqual(names(sortedFor(tier, mixed)), [
        'alpha',
        'Another unknown',
        'Beta',
        'Unknown',
        'Zed',
      ]);
    });
  }

  it('compares names case-insensitively, unlike a plain code-point sort', () => {
    assert.deepEqual(
      names(
        sortedFor('rejected', [
          venue('Banana', 1),
          venue('apple', 1),
          venue('Éclair', 1),
          venue('cherry', 1),
        ])
      ),
      ['apple', 'Banana', 'cherry', 'Éclair']
    );
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
    assert.deepEqual(names(sorted), [
      'Near',
      'Far',
      'Considering',
      'Rejected A',
      'Rejected Z',
      'Gone A',
      'Gone B',
    ]);
  });
});

describe('sortByRecentInspection', () => {
  const place = (name: string) => ({ name, slug: name.toLowerCase(), walkingTimeMin: 5 });
  const seen = (venueSlug: string, date: string) => ({ venueSlug, date });

  it('puts the most recently inspected first, then A to Z within a date', () => {
    const venues = [place('Delta'), place('alpha'), place('Charlie'), place('Bravo')];
    const inspections = [
      seen('delta', '2026-10-01'),
      seen('alpha', '2026-08-01'),
      seen('charlie', '2026-10-01'),
      seen('bravo', '2026-09-01'),
    ];
    assert.deepEqual(names(sortByRecentInspection(venues, inspections)), [
      'Charlie',
      'Delta',
      'Bravo',
      'alpha',
    ]);
  });

  it("uses a venue's latest inspection, whatever order they come in", () => {
    const venues = [place('Old'), place('New')];
    const inspections = [
      seen('new', '2026-03-01'),
      seen('old', '2026-09-01'),
      seen('old', '2026-01-01'),
      seen('new', '2026-02-01'),
    ];
    assert.deepEqual(names(sortByRecentInspection(venues, inspections)), ['Old', 'New']);
  });

  it('lists venues with no inspection after the inspected ones, by name', () => {
    const venues = [place('Zulu'), place('Mike'), place('Inspected'), place('Alpha')];
    assert.deepEqual(names(sortByRecentInspection(venues, [seen('inspected', '2026-05-05')])), [
      'Inspected',
      'Alpha',
      'Mike',
      'Zulu',
    ]);
  });

  it('leaves the input alone', () => {
    const venues = [place('B'), place('A')];
    sortByRecentInspection(venues, []);
    assert.deepEqual(names(venues), ['B', 'A']);
  });
});
