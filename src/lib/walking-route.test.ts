import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OrsError } from './ors';
import { computeRoute, resolveRoute, routeWarning, sameCoordinates } from './walking-route';
import { routeModeFor } from './route-display';
import { routeStatus } from './route-status';

const ROUTED_AT = new Date('2026-10-01T00:00:00Z');
const stored = {
  latitude: '53.480000',
  longitude: '-2.250000',
  distanceMiles: '0.40',
  walkingTimeMin: 9,
  routeUpdatedAt: ROUTED_AT as Date | null,
};

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
    assert.equal(
      sameCoordinates({ latitude: null, longitude: null }, { latitude: null, longitude: null }),
      true
    );
    assert.equal(
      sameCoordinates({ latitude: 53.48, longitude: -2.25 }, { latitude: null, longitude: null }),
      false
    );
  });
});

describe('resolveRoute', () => {
  it('has no route without coordinates and never calls ORS', async () => {
    const { fn, calls } = lookup({ distanceMetres: 1, durationSeconds: 1 });
    assert.deepEqual(await resolveRoute({ latitude: null, longitude: null }, stored, fn), {
      distanceMiles: null,
      walkingTimeMin: null,
      routeUpdatedAt: null,
      routeGeometry: null,
      routeMode: null,
      routeDurationMin: null,
      error: null,
    });
    assert.equal(calls.length, 0);
  });

  it('keeps the stored route when the coordinates are unchanged', async () => {
    const { fn, calls } = lookup({ distanceMetres: 1, durationSeconds: 1 });
    assert.deepEqual(await resolveRoute({ latitude: 53.48, longitude: -2.25 }, stored, fn), {
      distanceMiles: 0.4,
      walkingTimeMin: 9,
      error: null,
    });
    assert.equal(calls.length, 0);
  });

  it('computes the route for new venues, changed coordinates and missing route values', async () => {
    for (const existing of [null, stored, { ...stored, walkingTimeMin: null }]) {
      const { fn, calls } = lookup({ distanceMetres: 3218.688, durationSeconds: 2430 });
      const latitude = existing === stored ? 53.49 : 53.48;
      const { routeUpdatedAt, ...route } = await resolveRoute(
        { latitude, longitude: -2.25 },
        existing,
        fn,
        async () => ({ durationSeconds: 600, geometry: 'driveline' })
      );
      // 48 minutes' walk, so the line is a driving one.
      assert.deepEqual(route, {
        distanceMiles: 2,
        walkingTimeMin: 48,
        routeGeometry: 'driveline',
        routeMode: 'drive',
        routeDurationMin: 10,
        error: null,
      });
      assert.ok(routeUpdatedAt instanceof Date);
      assert.deepEqual(calls, [{ lat: latitude, lng: -2.25 }]);
    }
  });

  it('upgrades an old estimate at unchanged coordinates, and keeps it when ORS fails', async () => {
    const estimate = { ...stored, routeUpdatedAt: null };
    const ok = lookup({ distanceMetres: 1609.344, durationSeconds: 1200 });
    const upgraded = await resolveRoute({ latitude: 53.48, longitude: -2.25 }, estimate, ok.fn);
    assert.equal(ok.calls.length, 1);
    assert.deepEqual(
      { miles: upgraded.distanceMiles, minutes: upgraded.walkingTimeMin },
      { miles: 1, minutes: 24 }
    );
    assert.ok(upgraded.routeUpdatedAt instanceof Date);

    const failed = await resolveRoute(
      { latitude: 53.48, longitude: -2.25 },
      estimate,
      lookup(new OrsError('unavailable', 'down')).fn
    );
    assert.deepEqual(
      { miles: failed.distanceMiles, minutes: failed.walkingTimeMin, at: failed.routeUpdatedAt },
      { miles: 0.4, minutes: 9, at: undefined }
    );
    assert.match(routeWarning(failed)!, /still a straight-line estimate/);
  });

  it('turns failures into a pending route with the error attached', async () => {
    const route = await resolveRoute(
      { latitude: 53.49, longitude: -2.25 },
      stored,
      lookup(new OrsError('rate_limited', 'slow down')).fn
    );
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

describe('computeRoute line', () => {
  const to = { lat: 53.48, lng: -2.25 };
  // 1.0 mile is 24 minutes at the site pace, 1.5 miles is 36.
  const shortWalk = { distanceMetres: 1609.344, durationSeconds: 1200, geometry: 'walkline' };
  const longWalk = { distanceMetres: 2414.016, durationSeconds: 1800, geometry: 'walkline' };
  const drive = async () => ({ durationSeconds: 540, geometry: 'driveline' });

  it('keeps the walking line for a walk of 30 minutes or less', async () => {
    const route = await computeRoute(to, lookup(shortWalk).fn, async () => assert.fail('no drive'));
    assert.deepEqual(
      [route.routeMode, route.routeGeometry, route.routeDurationMin, route.walkingTimeMin],
      ['walk', 'walkline', 24, 24]
    );
  });

  it('draws the driving line instead for a longer walk, and keeps the walking time', async () => {
    const route = await computeRoute(to, lookup(longWalk).fn, drive);
    assert.deepEqual(
      [route.routeMode, route.routeGeometry, route.routeDurationMin, route.walkingTimeMin],
      ['drive', 'driveline', 9, 36]
    );
    assert.equal(route.error, null);
  });

  it('draws no line, never the walking one, when the driving route fails', async () => {
    const route = await computeRoute(to, lookup(longWalk).fn, async () => {
      throw new OrsError('unavailable', 'down');
    });
    assert.deepEqual(
      [route.routeMode, route.routeGeometry, route.routeDurationMin, route.walkingTimeMin],
      [null, null, null, 36]
    );
    assert.equal(route.error, null);
  });

  it('has no line when ORS returned no walking geometry', async () => {
    const { geometry: _geometry, ...bare } = shortWalk;
    const route = await computeRoute(to, lookup(bare).fn);
    assert.equal(route.routeGeometry, null);
  });
});

describe('routeModeFor', () => {
  it('walks up to 30 minutes and drives beyond', () => {
    assert.equal(routeModeFor(30), 'walk');
    assert.equal(routeModeFor(31), 'drive');
    assert.equal(routeModeFor(null), 'walk');
  });
});

describe('routeWarning', () => {
  it('is null when the route was fine', () => {
    assert.equal(routeWarning({ distanceMiles: 1, walkingTimeMin: 1, error: null }), null);
  });

  it('explains each failure', () => {
    const warn = (kind: OrsError['kind']) =>
      routeWarning({ distanceMiles: null, walkingTimeMin: null, error: new OrsError(kind, '') });
    assert.match(warn('rate_limited')!, /rate limited/);
    assert.match(warn('not_configured')!, /not configured/);
    assert.match(warn('no_result')!, /no walking route/);
    assert.match(warn('unavailable')!, /unavailable/);
  });

  it('words a failed retry as a retry, not a save', () => {
    const route = {
      distanceMiles: null,
      walkingTimeMin: null,
      error: new OrsError('rate_limited', ''),
    };
    assert.match(routeWarning(route)!, /^Saved, but the walking route is pending/);
    assert.equal(
      routeWarning(route, 'reroute'),
      'The walking route is pending because the route service is rate limited. Use Retry later.'
    );
  });
});

describe('routeStatus', () => {
  it('distinguishes needs location, route pending, estimated and routed', () => {
    const none = {
      latitude: null,
      longitude: null,
      distanceMiles: null,
      walkingTimeMin: null,
      routeUpdatedAt: null,
    };
    assert.equal(routeStatus(none), 'needs_location');
    assert.equal(routeStatus({ ...none, latitude: '53.48' }), 'needs_location');
    assert.equal(routeStatus({ ...stored, distanceMiles: null }), 'route_pending');
    assert.equal(routeStatus({ ...stored, walkingTimeMin: null }), 'route_pending');
    assert.equal(routeStatus({ ...stored, routeUpdatedAt: null }), 'estimated');
    assert.equal(routeStatus(stored), 'routed');
  });
});
