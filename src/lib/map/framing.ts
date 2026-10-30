/**
 * Framing the map on the venues the filters match: the centre and zoom that fit
 * them all on screen. Pure Web Mercator maths, so it needs no Leaflet and can be
 * tested on its own.
 */

import { WALKING_ISOCHRONES } from './config';
import { haversineMetres, type LatLng } from './ranking';

export type { LatLng };

export interface FrameOptions {
  /** The map's size in px. */
  width: number;
  height: number;
  /** Room to keep clear inside the map, in px: the Near Me button above, a pin card below. */
  padding: { top: number; right: number; bottom: number; left: number };
  minZoom: number;
  maxZoom: number;
}

export interface Frame extends LatLng {
  zoom: number;
}

const TILE_PX = 256;

const mercatorX = (lng: number) => (lng + 180) / 360;

const mercatorY = (lat: number) => {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
};

const latFromMercatorY = (y: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/**
 * The centre and whole-number zoom that put every point inside the map's padded
 * area, zoomed in as far as `maxZoom` and out as far as `minZoom`. Null for no
 * points. The zoom is rounded down, so the fit is never a pixel short.
 */
export function frameFor(points: readonly LatLng[], options: FrameOptions): Frame | null {
  if (points.length === 0) return null;
  const { width, height, padding, minZoom, maxZoom } = options;

  const xs = points.map((point) => mercatorX(point.lng));
  const ys = points.map((point) => mercatorY(point.lat));
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];

  const availableWidth = Math.max(width - padding.left - padding.right, 1);
  const availableHeight = Math.max(height - padding.top - padding.bottom, 1);
  // World size in px at zoom z is TILE_PX * 2^z, so the points fit while span * TILE_PX * 2^z <= available.
  const zoomForX = maxX > minX ? Math.log2(availableWidth / ((maxX - minX) * TILE_PX)) : Infinity;
  const zoomForY = maxY > minY ? Math.log2(availableHeight / ((maxY - minY) * TILE_PX)) : Infinity;
  const fit = Math.min(zoomForX, zoomForY);
  const zoom = Math.min(
    Math.max(Number.isFinite(fit) ? Math.floor(fit) : maxZoom, minZoom),
    maxZoom
  );

  // The map centre sits half the padding difference away from the points' centre,
  // so the points centre in the padded area rather than in the whole map.
  const worldPx = TILE_PX * 2 ** zoom;
  const centreX = (minX + maxX) / 2 - (padding.left - padding.right) / 2 / worldPx;
  const centreY = (minY + maxY) / 2 - (padding.top - padding.bottom) / 2 / worldPx;

  return { lat: latFromMercatorY(centreY), lng: centreX * 360 - 180, zoom };
}

export interface ViewBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** True when any point lies outside the map's current view. */
export function anyOutsideView(points: readonly LatLng[], view: ViewBounds): boolean {
  return points.some(
    (point) =>
      point.lat < view.south ||
      point.lat > view.north ||
      point.lng < view.west ||
      point.lng > view.east
  );
}

/** A map narrower than this (its measured width, not a media query) frames the core of the venues, not all of them. */
export const NARROW_MAP_MAX_WIDTH = 640;

/** The outer walking ring: the venues inside it are the core of a narrow map's first view. */
const CORE_RING_METRES = WALKING_ISOCHRONES.find((ring) => ring.shortLabel === '25 min')!.radius;
/** Fewer matches than this inside the ring and the core is the nearest few instead. */
const CORE_MIN_INSIDE_RING = 5;
const CORE_NEAREST_COUNT = 8;

/**
 * The venues a narrow map frames: those within the 25-minute ring around `base`. When fewer than
 * five are, the eight nearest instead, so outliers alone still get framed. Never empty for any venues.
 */
export function coreVenues<T extends LatLng>(venues: readonly T[], base: LatLng): T[] {
  const byDistance = venues
    .map((venue) => ({ venue, metres: haversineMetres(base, venue) }))
    .sort((a, b) => a.metres - b.metres);
  const inside = byDistance.filter((entry) => entry.metres <= CORE_RING_METRES);
  const chosen =
    inside.length >= CORE_MIN_INSIDE_RING ? inside : byDistance.slice(0, CORE_NEAREST_COUNT);
  return chosen.map((entry) => entry.venue);
}

/** How many points lie outside the map's current view. */
export function countOutsideView(points: readonly LatLng[], view: ViewBounds): number {
  return points.filter((point) => anyOutsideView([point], view)).length;
}
