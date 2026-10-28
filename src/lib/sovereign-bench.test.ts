import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSovereignBench, toCard } from './sovereign-bench';
import type { GoldenCutVenue, PublicVenue } from './public-data';
import type { Inspection } from '@/types';

function venue(slug: string, overrides: Partial<PublicVenue> = {}): PublicVenue {
  return {
    id: slug,
    name: `Venue ${slug}`,
    slug,
    tier: 'approved',
    lat: 53.48,
    lng: -2.25,
    distanceMiles: 0.4,
    walkingTimeMin: 9,
    cost: '££',
    cuisine: 'Chips',
    eatLikeUs: '',
    lastInspectionDate: 'Awaiting Assessment',
    address: '1 High St',
    mapSearchLink: 'https://maps.example/x',
    image: null,
    closed: false,
    ...overrides,
  };
}

function pick(slug: string, overrides: Partial<GoldenCutVenue> = {}, venueOverrides: Partial<PublicVenue> = {}): GoldenCutVenue {
  return { venue: venue(slug, venueOverrides), puffPiece: null, anchorDish: null, ...overrides };
}

function inspection(venueSlug: string, date: string, kind: Inspection['kind'] = 'verified'): Inspection {
  return { id: `${venueSlug}-${date}-${kind}`, venueSlug, venueName: venueSlug, date, kind, outcome: null, chairs: [] };
}

const slugs = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('buildSovereignBench: Golden Cut mode', () => {
  it('uses the first five picks in order: hero, then four pillars', () => {
    const bench = buildSovereignBench(slugs.map((slug) => pick(slug)), [venue('nearby')], []);
    assert.equal(bench.mode, 'golden-cut');
    assert.equal(bench.hero?.slug, 'a');
    assert.deepEqual(bench.pillars.map((card) => card.slug), ['b', 'c', 'd', 'e']);
    assert.equal(bench.hero?.href, '/venues/a');
  });

  it('shows a partial Golden Cut as it is, without padding from nearby venues', () => {
    const nearby = [venue('n1'), venue('n2'), venue('n3')];
    const two = buildSovereignBench([pick('a'), pick('b')], nearby, []);
    assert.equal(two.mode, 'golden-cut');
    assert.equal(two.hero?.slug, 'a');
    assert.deepEqual(two.pillars.map((card) => card.slug), ['b']);

    const one = buildSovereignBench([pick('a')], nearby, []);
    assert.equal(one.hero?.slug, 'a');
    assert.deepEqual(one.pillars, []);
  });
});

describe('buildSovereignBench: fallback mode', () => {
  it('uses the five nearest Approved venues in order, skipping the rest', () => {
    const venues = [
      venue('a'),
      venue('x', { tier: 'under_consideration' }),
      venue('b'),
      venue('c'),
      venue('y', { tier: 'rejected' }),
      venue('d'),
      venue('e'),
      venue('f'),
    ];
    const bench = buildSovereignBench([], venues, []);
    assert.equal(bench.mode, 'nearest');
    assert.equal(bench.hero?.slug, 'a');
    assert.deepEqual(bench.pillars.map((card) => card.slug), ['b', 'c', 'd', 'e']);
  });

  it('shows only what there is when fewer than five are Approved', () => {
    const bench = buildSovereignBench([], [venue('a'), venue('x', { tier: 'rejected' }), venue('b')], []);
    assert.equal(bench.hero?.slug, 'a');
    assert.deepEqual(bench.pillars.map((card) => card.slug), ['b']);
  });

  it('has no hero and no pillars, and does not throw, when nothing is Approved', () => {
    for (const venues of [[], [venue('x', { tier: 'rejected' })]]) {
      const bench = buildSovereignBench([], venues, []);
      assert.equal(bench.mode, 'nearest');
      assert.equal(bench.hero, null);
      assert.deepEqual(bench.pillars, []);
    }
  });
});

describe('buildSovereignBench: inspections', () => {
  it('counts verified and legacy inspections of that venue only', () => {
    const bench = buildSovereignBench(
      [pick('a'), pick('b')],
      [],
      [inspection('a', '2026-03-01'), inspection('a', '2025-01-01', 'legacy'), inspection('b', '2026-02-02'), inspection('other', '2026-04-04')]
    );
    assert.equal(bench.hero?.inspectionCount, 2);
    assert.equal(bench.pillars[0].inspectionCount, 1);
  });

  it('shows the newest date, whatever order the inspections arrive in, through formatDate', () => {
    const bench = buildSovereignBench(
      [pick('a')],
      [],
      [inspection('a', '2025-12-02', 'legacy'), inspection('a', '2026-03-31'), inspection('a', '2026-01-15')]
    );
    assert.equal(bench.hero?.lastInspection, '31st Mar 26');
  });

  it('does not use the venue lastInspectionDate, and has no date or count without inspections', () => {
    const bench = buildSovereignBench([pick('a', {}, { lastInspectionDate: '2026-06-01' })], [], []);
    assert.equal(bench.hero?.inspectionCount, 0);
    assert.equal(bench.hero?.lastInspection, null);
  });
});

describe('buildSovereignBench: text', () => {
  it('trims the quote and turns a blank one into null', () => {
    const bench = buildSovereignBench(
      [pick('a', { puffPiece: '  Lovely.  ' }), pick('b', { puffPiece: '   ' }), pick('c', { puffPiece: null })],
      [],
      []
    );
    assert.equal(bench.hero?.quote, 'Lovely.');
    assert.equal(bench.pillars[0].quote, null);
    assert.equal(bench.pillars[1].quote, null);
  });

  it('uses the anchor dish for Eat Like Us, then the lunch special, then null', () => {
    const bench = buildSovereignBench(
      [
        pick('a', { anchorDish: ' Pie ' }, { eatLikeUs: 'Special' }),
        pick('b', { anchorDish: '  ' }, { eatLikeUs: ' Special ' }),
        pick('c', { anchorDish: null }, { eatLikeUs: '   ' }),
      ],
      [],
      []
    );
    assert.equal(bench.hero?.eatLikeUs, 'Pie');
    assert.equal(bench.pillars[0].eatLikeUs, 'Special');
    assert.equal(bench.pillars[1].eatLikeUs, null);
  });

  it('only gives Approved venues an Eat Like Us order', () => {
    const verdicts = ['approved', 'under_consideration', 'to_be_assessed', 'if_we_must', 'rejected', 'gone_but_not_forgotten'] as const;
    for (const tier of verdicts) {
      const card = toCard({ venue: venue('x', { tier, eatLikeUs: 'Pie' }), puffPiece: null, anchorDish: 'Chef special' }, []);
      assert.equal(card.eatLikeUs, tier === 'approved' ? 'Chef special' : null, tier);
    }
  });

  it('uses the lunch special in fallback mode, where there is no quote', () => {
    const bench = buildSovereignBench([], [venue('a', { eatLikeUs: 'Sunday roast' })], []);
    assert.equal(bench.hero?.quote, null);
    assert.equal(bench.hero?.eatLikeUs, 'Sunday roast');
  });
});

describe('buildSovereignBench: walk', () => {
  it('links to Google walking directions at the venue coordinates', () => {
    const walk = buildSovereignBench([pick('a', {}, { lat: 53.4808, lng: -2.2426, walkingTimeMin: 12, distanceMiles: 0.6 })], [], []).hero!.walk!;
    assert.equal(walk.label, '12 min walk (0.60 mi)');
    assert.equal(walk.lat, 53.4808);
    assert.equal(walk.lng, -2.2426);
    assert.equal(walk.directionsUrl, 'https://www.google.com/maps/dir/?api=1&destination=53.4808,-2.2426&travelmode=walking');
  });

  it('has no walk at all when the walking time is null', () => {
    const { walk } = buildSovereignBench([pick('a', {}, { walkingTimeMin: null, distanceMiles: null })], [], []).hero!;
    assert.equal(walk, null);
  });

  it('has no link when the venue has no coordinates', () => {
    const walk = buildSovereignBench([pick('a', {}, { lat: null, lng: null })], [], []).hero!.walk!;
    assert.equal(walk.label, '9 min walk (0.40 mi)');
    assert.equal(walk.directionsUrl, null);
  });
});

describe('buildSovereignBench: images and cost', () => {
  it('carries the primary photo, or null when the venue has none', () => {
    const image = { url: 'https://img.example/a.jpg', thumbUrl: 'https://img.example/a-t.jpg', width: 1600, height: 1200, alt: 'A', focalX: null, focalY: null };
    const bench = buildSovereignBench([pick('a', {}, { image }), pick('b')], [], []);
    assert.deepEqual(bench.hero?.image, image);
    assert.equal(bench.pillars[0].image, null);
  });

  it('carries the cost band', () => {
    assert.equal(buildSovereignBench([pick('a', {}, { cost: '£££' })], [], []).hero?.cost, '£££');
  });
});
