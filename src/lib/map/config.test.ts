import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_COORDINATES,
  BASE_LAT_LNG,
  CARTO_VOYAGER_TILE_CONFIG,
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
    assert.deepEqual(radii, [...radii].sort((a, b) => a - b));
  });

  it('derives the walking rings from the shared 80 m/min pace', () => {
    assert.equal(WALKING_METRES_PER_MINUTE, 80);
    for (const ring of WALKING_ISOCHRONES.filter((entry) => entry.label.endsWith('min walk'))) {
      assert.equal(ring.radius, Number.parseInt(ring.label, 10) * WALKING_METRES_PER_MINUTE, ring.label);
    }
    assert.deepEqual(
      WALKING_ISOCHRONES.map((ring) => ring.radius),
      [400, 800, 1200, 1600, 2000, 4023]
    );
  });

  it('builds tile URLs with and without an API key', () => {
    assert.ok(!CARTO_VOYAGER_TILE_CONFIG.getUrl().includes('key='));
    assert.ok(CARTO_VOYAGER_TILE_CONFIG.getUrl('a b&c').endsWith('?key=a%20b%26c'));
  });

  it('createTileLayer passes the URL and options to Leaflet', () => {
    const calls: unknown[][] = [];
    const L = { tileLayer: (...args: unknown[]) => (calls.push(args), 'layer') };
    assert.equal(createTileLayer(L, 'k'), 'layer');
    const [url, options] = calls[0] as [string, Record<string, unknown>];
    assert.ok(url.endsWith('?key=k'));
    assert.equal(options.maxZoom, 19);
    assert.equal(options.subdomains, 'abcd');
  });
});
