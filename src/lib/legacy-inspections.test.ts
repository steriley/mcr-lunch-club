import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normaliseVenueName, planLegacyImport, type LegacyEntry } from './legacy-inspections';

describe('normaliseVenueName', () => {
  it('folds case, spacing, accents and curly quotes', () => {
    assert.equal(
      normaliseVenueName('  Mick Hucknall’s   Rustik Bites '),
      "mick hucknall's rustik bites"
    );
    assert.equal(
      normaliseVenueName('Fazenda “Fogo de Chão“'),
      normaliseVenueName('Fazenda "Fogo de Chão"')
    );
    assert.equal(normaliseVenueName('Fazenda “Fogo de Chão“'), 'fazenda "fogo de chao"');
  });
});

describe('planLegacyImport', () => {
  const venues = [
    { id: '1', name: 'Crazy Pedro’s' },
    { id: '2', name: 'Fat Pat’s' },
    { id: '3', name: 'Wing Stop' },
    { id: '4', name: 'Not On The List' },
  ];

  it('matches names, separates never-inspected venues and reports the rest as unmatched', () => {
    const entries: LegacyEntry[] = [
      { venue: "Crazy Pedro's", date: '2026-07-22' },
      { venue: "Fat Pat's", date: null },
      { venue: 'Wingstop', date: '2026-07-28' }, // via alias
      { venue: 'Nowhere Diner', date: '2026-01-01' },
    ];
    const plan = planLegacyImport(entries, venues);
    assert.deepEqual(plan.matched, [
      { venueId: '1', venueName: 'Crazy Pedro’s', date: '2026-07-22' },
      { venueId: '3', venueName: 'Wing Stop', date: '2026-07-28' },
    ]);
    assert.deepEqual(plan.never, [{ venueId: '2', venueName: 'Fat Pat’s' }]);
    assert.deepEqual(plan.unmatched, ['Nowhere Diner']);
  });

  it('refuses ambiguous names', () => {
    const plan = planLegacyImport(
      [{ venue: 'Twin', date: '2026-01-01' }],
      [
        { id: 'a', name: 'Twin' },
        { id: 'b', name: 'twin' },
      ]
    );
    assert.deepEqual(plan.unmatched, ['Twin (matches 2 venues)']);
  });

  it('matches every name in the committed list against the original venue data', () => {
    const { inspections } = JSON.parse(
      readFileSync('drizzle/data/legacy-inspections.json', 'utf8')
    ) as { inspections: LegacyEntry[] };
    const original = JSON.parse(readFileSync('src/data/venues.json', 'utf8')) as {
      slug: string;
      name: string;
    }[];
    assert.equal(inspections.length, 29);
    const plan = planLegacyImport(
      inspections,
      original.map((venue) => ({ id: venue.slug, name: venue.name }))
    );
    assert.deepEqual(plan.unmatched, []);
    assert.equal(plan.never.length, 4);
    assert.ok(
      inspections.every((entry) => entry.date === null || /^\d{4}-\d{2}-\d{2}$/.test(entry.date))
    );
  });
});
