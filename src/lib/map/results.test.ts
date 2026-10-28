import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resultsCountLabel, sortResults } from './results';
import type { Inspection, Venue } from '@/types';

function venue(slug: string, name: string, walkingTimeMin: number | null): Venue {
  return {
    id: slug,
    name,
    slug,
    tier: 'approved',
    lat: 53.48,
    lng: -2.25,
    distanceMiles: 0.3,
    walkingTimeMin,
    cost: '££',
    cuisine: 'British',
    eatLikeUs: '',
    lastInspectionDate: '',
    address: '',
    mapSearchLink: '',
  };
}

function inspection(venueSlug: string, date: string): Inspection {
  return {
    id: `${venueSlug}-${date}`,
    venueSlug,
    venueName: venueSlug,
    date,
    kind: 'verified',
    outcome: 'satisfactory',
    chairs: [],
  };
}

const venues = [
  venue('c', 'Cafe', 12),
  venue('a', 'Alpha', null),
  venue('b', 'bistro', 4),
  venue('d', 'Deli', 12),
];
const names = (list: Venue[]) => list.map((v) => v.name);

describe('sortResults', () => {
  it('puts the nearest first, unknown walks last, ties by name', () => {
    assert.deepEqual(names(sortResults(venues, 'nearest', [])), [
      'bistro',
      'Cafe',
      'Deli',
      'Alpha',
    ]);
  });

  it('sorts by name regardless of case', () => {
    assert.deepEqual(names(sortResults(venues, 'name', [])), ['Alpha', 'bistro', 'Cafe', 'Deli']);
  });

  it('puts the most recently inspected first, uninspected last by name', () => {
    const inspections = [
      inspection('c', '2026-03-01'),
      inspection('b', '2026-09-01'),
      inspection('c', '2026-01-01'),
    ];
    assert.deepEqual(names(sortResults(venues, 'inspected', inspections)), [
      'bistro',
      'Cafe',
      'Alpha',
      'Deli',
    ]);
  });

  it('does not change the list it is given', () => {
    const before = names(venues);
    sortResults(venues, 'name', []);
    assert.deepEqual(names(venues), before);
  });
});

describe('resultsCountLabel', () => {
  it('counts venues', () => {
    assert.equal(resultsCountLabel(56), '56 venues');
    assert.equal(resultsCountLabel(1), '1 venue');
    assert.equal(resultsCountLabel(0), '0 venues');
  });
});
