import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_COORDINATES,
  BASE_LAT_LNG,
  CARTO_VOYAGER_TILE_CONFIG,
  MINUTES_PER_MILE,
  WALKING_DETOUR_FACTOR,
  WALKING_ISOCHRONES,
  WALKING_METRES_PER_MINUTE,
  createTileLayer,
} from './config';

describe('map config', () => {
  it('keeps the base coordinate exports consistent', () => {
    assert.deepEqual(BASE_LAT_LNG, [BASE_COORDINATES.lat, BASE_COORDINATES.lng]);
  });

  it('orders isochrone rings by increasing radius', () => {
    const radii = WALKING_ISOCHRONES.map((ring) => ring.radius);
    assert.deepEqual(
      radii,
      [...radii].sort((a, b) => a - b)
    );
  });

  it('derives the walking rings from the shared straight-line pace', () => {
    // 24 min/mile, less a 1.2 detour: about 56 straight-line metres a minute.
    assert.equal(WALKING_METRES_PER_MINUTE, 1609.344 / MINUTES_PER_MILE / WALKING_DETOUR_FACTOR);
    for (const ring of WALKING_ISOCHRONES.filter((entry) => entry.label.endsWith('min walk'))) {
      assert.equal(
        ring.radius,
        Number.parseInt(ring.label, 10) * WALKING_METRES_PER_MINUTE,
        ring.label
      );
    }
    assert.deepEqual(
      WALKING_ISOCHRONES.map((ring) => Math.round(ring.radius)),
      [279, 559, 838, 1118, 1397, 4023]
    );
  });

  it("prints each ring's minutes on the ring, and the boundary in miles", () => {
    assert.deepEqual(
      WALKING_ISOCHRONES.map((ring) => ring.shortLabel),
      ['5 min', '10 min', '15 min', '20 min', '25 min', '2.5 mi']
    );
  });

  it('builds tile URLs with and without an API key', () => {
    assert.ok(!CARTO_VOYAGER_TILE_CONFIG.getUrl().includes('key='));
    assert.ok(CARTO_VOYAGER_TILE_CONFIG.getUrl('a b&c').endsWith('?key=a%20b%26c'));
    assert.ok(CARTO_VOYAGER_TILE_CONFIG.getUrl().includes('/rastertiles/voyager/'));
    assert.ok(CARTO_VOYAGER_TILE_CONFIG.getUrl(undefined, 'dark').includes('/dark_all/'));
  });

  it('createTileLayer passes the URL and options to Leaflet', () => {
    const calls: unknown[][] = [];
    const L = { tileLayer: (...args: unknown[]) => (calls.push(args), 'layer') };
    assert.equal(createTileLayer(L, 'k'), 'layer');
    const [url, options] = calls[0] as [string, Record<string, unknown>];
    assert.ok(url.endsWith('?key=k'));
    assert.equal(options.maxZoom, 18);
    assert.equal(options.subdomains, 'abcd');
  });
});
