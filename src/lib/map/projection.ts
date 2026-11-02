import type { LatLng } from './ranking';

/**
 * Web Mercator, the projection Leaflet's default CRS (EPSG:3857) uses: where a
 * point sits in world pixels at a zoom, and back. The map never sets another
 * CRS, so these agree with Leaflet's own `project` and `unproject` and let the
 * map's maths run without it.
 */

/** A map tile's side in px; the whole world is this wide at zoom 0. */
export const TILE_PX = 256;

/** A position in world pixels at some zoom: x grows east, y grows south. */
export interface WorldPoint {
  x: number;
  y: number;
}

/** Longitude as a share of the world's width, 0 at the antimeridian in the west. */
export const mercatorX = (lng: number) => (lng + 180) / 360;

/** Latitude as a share of the world's height, 0 at the top. */
export const mercatorY = (lat: number) => {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
};

export const lngFromMercatorX = (x: number) => x * 360 - 180;

export const latFromMercatorY = (y: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/** The world's width (and height) in px at `zoom`. */
export const worldPx = (zoom: number) => TILE_PX * 2 ** zoom;

/** Where a point sits in world pixels at `zoom` (Leaflet's `map.project`). */
export function project(point: LatLng, zoom: number): WorldPoint {
  const scale = worldPx(zoom);
  return { x: mercatorX(point.lng) * scale, y: mercatorY(point.lat) * scale };
}

/** The point at a world pixel position at `zoom` (Leaflet's `map.unproject`). */
export function unproject(point: WorldPoint, zoom: number): LatLng {
  const scale = worldPx(zoom);
  return { lat: latFromMercatorY(point.y / scale), lng: lngFromMercatorX(point.x / scale) };
}
