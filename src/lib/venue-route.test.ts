import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrsError } from './ors';
import { computeRoute, resolveRoute, routeWarning, sameCoordinates } from './venue-route';
import { routeStatus } from './route-status';

const ROUTED_AT = new Date('2026-10-01T00:00:00Z');
const stored = { latitude: '53.480000', longitude: '-2.250000', distanceMiles: '0.40', walkingTimeMin: 9, routeUpdatedAt: ROUTED_AT as Date | null };

function lookup(result: { distanceMetres: number; durationSeconds: number } | Error) {
  const calls: unknown[] = [];
  const fn = async (to: unknown) => {
    calls.push(to);
    if (result instanceof Error) throw result;
    return result;
  };
  return { fn, calls };
}

describe('sameCoordinates', () => {
  it('compares at the stored precision', () => {
    assert.equal(sameCoordinates({ latitude: 53.48, longitude: -2.25 }, stored), true);
    assert.equal(sameCoordinates({ latitude: 53.4800001, longitude: -2.25 }, stored), true);
    assert.equal(sameCoordinates({ latitude: 53.481, longitude: -2.25 }, stored), false);
    assert.equal(sameCoordinates({ latitude: null, longitude: null }, { latitude: null, longitude: null }), true);
    assert.equal(sameCoordinates({ latitude: 53.48, longitude: -2.25 }, { latitude: null, longitude: null }), false);
  });
});

describe('resolveRoute', () => {
  it('has no route without coordinates and never calls ORS', async () => {
    const { fn, calls } = lookup({ distanceMetres: 1, durationSeconds: 1 });
    assert.deepEqual(await resolveRoute({ latitude: null, longitude: null }, stored, fn), {
      distanceMiles: null,
      walkingTimeMin: null,
      routeUpdatedAt: null,
      error: null,
    });
    assert.equal(calls.length, 0);
  });

  it('keeps the stored route when the coordinates are unchanged', async () => {
    const { fn, calls } = lookup({ distanceMetres: 1, durationSeconds: 1 });
    assert.deepEqual(await resolveRoute({ latitude: 53.48, longitude: -2.25 }, stored, fn), { distanceMiles: 0.4, walkingTimeMin: 9, error: null });
    assert.equal(calls.length, 0);
  });

  it('computes the route for new venues, changed coordinates and missing route values', async () => {
    for (const existing of [null, stored, { ...stored, walkingTimeMin: null }]) {
      const { fn, calls } = lookup({ distanceMetres: 3218.688, durationSeconds: 2430 });
      const latitude = existing === stored ? 53.49 : 53.48;
      const { routeUpdatedAt, ...route } = await resolveRoute({ latitude, longitude: -2.25 }, existing, fn);
      assert.deepEqual(route, { distanceMiles: 2, walkingTimeMin: 41, error: null });
      assert.ok(routeUpdatedAt instanceof Date);
      assert.deepEqual(calls, [{ lat: latitude, lng: -2.25 }]);
    }
  });

  it('upgrades an old estimate at unchanged coordinates, and keeps it when ORS fails', async () => {
    const estimate = { ...stored, routeUpdatedAt: null };
    const ok = lookup({ distanceMetres: 1609.344, durationSeconds: 1200 });
    const upgraded = await resolveRoute({ latitude: 53.48, longitude: -2.25 }, estimate, ok.fn);
    assert.equal(ok.calls.length, 1);
    assert.deepEqual({ miles: upgraded.distanceMiles, minutes: upgraded.walkingTimeMin }, { miles: 1, minutes: 20 });
    assert.ok(upgraded.routeUpdatedAt instanceof Date);

    const failed = await resolveRoute({ latitude: 53.48, longitude: -2.25 }, estimate, lookup(new OrsError('unavailable', 'down')).fn);
    assert.deepEqual({ miles: failed.distanceMiles, minutes: failed.walkingTimeMin, at: failed.routeUpdatedAt }, { miles: 0.4, minutes: 9, at: undefined });
    assert.match(routeWarning(failed)!, /still a straight-line estimate/);
  });

  it('turns failures into a pending route with the error attached', async () => {
    const route = await resolveRoute({ latitude: 53.49, longitude: -2.25 }, stored, lookup(new OrsError('rate_limited', 'slow down')).fn);
    assert.equal(route.distanceMiles, null);
    assert.equal(route.walkingTimeMin, null);
    assert.equal(route.routeUpdatedAt, null);
    assert.equal(route.error?.kind, 'rate_limited');
  });
});

describe('computeRoute', () => {
  it('wraps unexpected errors as unavailable', async () => {
    const route = await computeRoute({ lat: 53.48, lng: -2.25 }, lookup(new Error('boom')).fn);
    assert.equal(route.error?.kind, 'unavailable');
  });
});

describe('routeWarning', () => {
  it('is null when the route was fine', () => {
    assert.equal(routeWarning({ distanceMiles: 1, walkingTimeMin: 1, error: null }), null);
  });

  it('explains each failure', () => {
    const warn = (kind: OrsError['kind']) => routeWarning({ distanceMiles: null, walkingTimeMin: null, error: new OrsError(kind, '') });
    assert.match(warn('rate_limited')!, /rate limited/);
    assert.match(warn('not_configured')!, /not configured/);
    assert.match(warn('no_result')!, /no walking route/);
    assert.match(warn('unavailable')!, /unavailable/);
  });
});

describe('routeStatus', () => {
  it('distinguishes needs location, route pending, estimated and routed', () => {
    const none = { latitude: null, longitude: null, distanceMiles: null, walkingTimeMin: null, routeUpdatedAt: null };
    assert.equal(routeStatus(none), 'needs_location');
    assert.equal(routeStatus({ ...none, latitude: '53.48' }), 'needs_location');
    assert.equal(routeStatus({ ...stored, distanceMiles: null }), 'route_pending');
    assert.equal(routeStatus({ ...stored, walkingTimeMin: null }), 'route_pending');
    assert.equal(routeStatus({ ...stored, routeUpdatedAt: null }), 'estimated');
    assert.equal(routeStatus(stored), 'routed');
  });
});
