import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineMetres,
  formatDistance,
  hasOriginMovedSignificantly,
  rankVenues,
  estimateWalkMinutes,
  resolveRankingOrigin,
  FAR_FROM_BASE_METRES,
  toggleNearMeTier,
} from './ranking';
import { BASE_COORDINATES } from './config';
import type { Venue } from '@/types';

// Mock helper to create venue fixtures
function createMockVenue(overrides: Partial<Venue>): Venue {
  return {
    id: 'test-venue',
    name: 'Test Venue',
    slug: 'test-venue',
    tier: 'approved',
    lat: 53.48,
    lng: -2.25,
    distanceMiles: 0.1,
    walkingTimeMin: 2,
    cost: '££',
    cuisine: 'British',
    eatLikeUs: 'House special',
    lastInspectionDate: '2026-09-01',
    address: 'Manchester',
    mapSearchLink: '',
    ...overrides,
  };
}

describe('haversineMetres', () => {
  const spinningfields = { lat: 53.47985, lng: -2.25105 };
  const manchesterCathedral = { lat: 53.4851, lng: -2.2443 };
  const londonCharingCross = { lat: 51.508, lng: -0.1281 };

  test('returns 0 for identical coordinates', () => {
    assert.equal(haversineMetres(spinningfields, spinningfields), 0);
  });

  test('is symmetric (dist(A, B) === dist(B, A))', () => {
    const d1 = haversineMetres(spinningfields, manchesterCathedral);
    const d2 = haversineMetres(manchesterCathedral, spinningfields);
    assert.equal(Math.round(d1), Math.round(d2));
  });

  test('accurately calculates known distance within Manchester (~737m)', () => {
    const distance = haversineMetres(spinningfields, manchesterCathedral);
    assert.ok(distance >= 730 && distance <= 745, `Expected ~737m, got ${distance.toFixed(1)}m`);
  });

  test('accurately calculates known long distance to London (~262km)', () => {
    const distance = haversineMetres(spinningfields, londonCharingCross);
    assert.ok(
      distance >= 261000 && distance <= 263000,
      `Expected ~262km, got ${(distance / 1000).toFixed(1)}km`
    );
  });
});

describe('formatDistance', () => {
  test('formats small distances (< 100m) rounded to nearest 5m', () => {
    assert.equal(formatDistance(0), '0 m');
    assert.equal(formatDistance(12), '10 m');
    assert.equal(formatDistance(14), '15 m');
    assert.equal(formatDistance(47), '45 m');
    assert.equal(formatDistance(88), '90 m');
  });

  test('formats intermediate distances (100m to 999m) rounded to nearest 10m', () => {
    assert.equal(formatDistance(104), '100 m');
    assert.equal(formatDistance(156), '160 m');
    assert.equal(formatDistance(737), '740 m');
    assert.equal(formatDistance(994), '990 m');
  });

  test('formats distances 1km and above in kilometres with 1 decimal place', () => {
    assert.equal(formatDistance(1000), '1.0 km');
    assert.equal(formatDistance(1249), '1.2 km');
    assert.equal(formatDistance(1250), '1.3 km');
    assert.equal(formatDistance(4023), '4.0 km');
    assert.equal(formatDistance(10500), '10.5 km');
  });
});

describe('hasOriginMovedSignificantly', () => {
  const origin = { lat: 53.47985, lng: -2.25105 };

  test('returns true when there is no previous origin', () => {
    assert.equal(hasOriginMovedSignificantly(null, origin), true);
  });

  test('returns false when movement is under threshold (< 18m)', () => {
    // ~5 metres away
    const smallMove = { lat: 53.47989, lng: -2.25105 };
    assert.equal(hasOriginMovedSignificantly(origin, smallMove), false);
  });

  test('returns true when movement meets or exceeds threshold (>= 18m)', () => {
    // ~30 metres away
    const largeMove = { lat: 53.48012, lng: -2.25105 };
    assert.equal(hasOriginMovedSignificantly(origin, largeMove), true);
  });
});

describe('rankVenues', () => {
  const origin = { lat: 53.47985, lng: -2.25105 }; // Spinningfields

  const venueClose = createMockVenue({
    id: 'close',
    name: 'Close Venue',
    tier: 'approved',
    lat: 53.4802,
    lng: -2.251, // ~40m away
  });

  const venueMedium = createMockVenue({
    id: 'medium',
    name: 'Medium Venue',
    tier: 'approved',
    lat: 53.483,
    lng: -2.248, // ~400m away
  });

  const venueFar = createMockVenue({
    id: 'far',
    name: 'Far Venue',
    tier: 'under_consideration',
    lat: 53.489,
    lng: -2.24, // ~1.2km away
  });

  const venueOutsideJurisdiction = createMockVenue({
    id: 'outer',
    name: 'Outer Limits Venue',
    tier: 'approved',
    lat: 53.55,
    lng: -2.2, // ~8.5km away (> 4023m)
  });

  const venueRejected = createMockVenue({
    id: 'rejected',
    name: 'Rejected Venue',
    tier: 'rejected',
    lat: 53.4801,
    lng: -2.251,
  });

  const venueGone = createMockVenue({
    id: 'gone',
    name: 'Gone Venue',
    tier: 'gone_but_not_forgotten',
    lat: 53.4801,
    lng: -2.251,
  });

  const venueNoCoords = createMockVenue({
    id: 'no-coords',
    name: 'No Coords Venue',
    lat: null,
    lng: null,
  });

  test('sorts venues strictly ascending by distance', () => {
    const results = rankVenues({
      origin,
      venues: [venueMedium, venueFar, venueClose],
    });

    assert.equal(results.length, 3);
    assert.equal(results[0].venue.id, 'close');
    assert.equal(results[1].venue.id, 'medium');
    assert.equal(results[2].venue.id, 'far');
    assert.ok(results[0].distanceMetres < results[1].distanceMetres);
    assert.ok(results[1].distanceMetres < results[2].distanceMetres);
  });

  test('tier filtering: filters by specified tiers', () => {
    const results = rankVenues({
      origin,
      venues: [venueClose, venueFar],
      tiers: ['under_consideration'],
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].venue.id, 'far');
  });

  test('tier filtering: strictly excludes Rejected and Gone But Not Forgotten', () => {
    const results = rankVenues({
      origin,
      venues: [venueClose, venueRejected, venueGone],
      tiers: ['approved', 'rejected', 'gone_but_not_forgotten' as any],
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].venue.id, 'close');
  });

  test('ignores venues lacking coordinates', () => {
    const results = rankVenues({
      origin,
      venues: [venueClose, venueNoCoords],
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].venue.id, 'close');
  });

  test('respects the limit argument', () => {
    const results = rankVenues({
      origin,
      venues: [venueClose, venueMedium, venueFar],
      limit: 2,
    });

    assert.equal(results.length, 2);
    assert.equal(results[0].venue.id, 'close');
    assert.equal(results[1].venue.id, 'medium');
  });

  test('tie breaking: breaks identical distance ties by alphabetical name', () => {
    const tie1 = createMockVenue({
      id: 'tie-1',
      name: 'Beta Diner',
      lat: 53.48,
      lng: -2.25,
    });
    const tie2 = createMockVenue({
      id: 'tie-2',
      name: 'Alpha Diner',
      lat: 53.48,
      lng: -2.25,
    });
    const tie3 = createMockVenue({
      id: 'tie-3',
      name: 'Gamma Diner',
      lat: 53.48,
      lng: -2.25,
    });

    const results = rankVenues({
      origin,
      venues: [tie3, tie1, tie2],
    });

    assert.equal(results[0].venue.id, 'tie-2'); // 'Alpha Diner'
    assert.equal(results[1].venue.id, 'tie-1'); // 'Beta Diner'
    assert.equal(results[2].venue.id, 'tie-3'); // 'Gamma Diner'
  });

  test('empty results: returns [] when input list has no valid matching venues', () => {
    const resultsEmpty = rankVenues({ origin, venues: [] });
    assert.deepEqual(resultsEmpty, []);

    const resultsOnlyRejected = rankVenues({
      origin,
      venues: [venueRejected, venueGone],
    });
    assert.deepEqual(resultsOnlyRejected, []);
  });

  test('far away fallback: returns single closest venue flagged isFarAway: true if all matching are beyond threshold', () => {
    const results = rankVenues({
      origin,
      venues: [venueOutsideJurisdiction],
      tiers: ['approved'],
      nearbyThresholdMetres: 4023,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].venue.id, 'outer');
    assert.equal(results[0].isFarAway, true);
  });
});

describe('estimateWalkMinutes', () => {
  test('allows for a detour and a 24 minute mile', () => {
    // A mile as the crow flies is 1.2 miles on foot: about 29 minutes.
    assert.equal(estimateWalkMinutes(1609.344), 29);
    assert.equal(estimateWalkMinutes(800), 14);
  });

  test('never returns less than one minute', () => {
    assert.equal(estimateWalkMinutes(0), 1);
    assert.equal(estimateWalkMinutes(20), 1);
    assert.equal(estimateWalkMinutes(-50), 1);
  });
});

describe('resolveRankingOrigin', () => {
  test('ranks from Spinningfields when there is no position', () => {
    assert.deepEqual(resolveRankingOrigin(null), {
      origin: { ...BASE_COORDINATES },
      fromBase: true,
    });
  });

  test('ranks from the user when they are in Manchester', () => {
    const position = { lat: 53.4794, lng: -2.2453 };
    assert.deepEqual(resolveRankingOrigin(position), { origin: position, fromBase: false });
  });

  test('falls back to Spinningfields when the user is far away', () => {
    const london = { lat: 51.5072, lng: -0.1276 };
    assert.ok(haversineMetres(london, BASE_COORDINATES) > FAR_FROM_BASE_METRES);
    assert.deepEqual(resolveRankingOrigin(london), {
      origin: { ...BASE_COORDINATES },
      fromBase: true,
    });
  });
});

describe('toggleNearMeTier', () => {
  test('adds a tier that is off and removes one that is on', () => {
    assert.deepEqual(toggleNearMeTier(['approved'], 'if_we_must'), ['approved', 'if_we_must']);
    assert.deepEqual(toggleNearMeTier(['approved', 'if_we_must'], 'approved'), ['if_we_must']);
  });

  test('never removes the last selected tier', () => {
    assert.deepEqual(toggleNearMeTier(['approved'], 'approved'), ['approved']);
  });
});
