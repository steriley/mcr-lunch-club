import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_COORDINATES,
  BASE_LAT_LNG,
  CARTO_VOYAGER_TILE_CONFIG,
  WALKING_ISOCHRONES,
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
