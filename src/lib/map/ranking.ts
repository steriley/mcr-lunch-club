import type { Venue, TierStatus } from '@/types';
import { BASE_COORDINATES } from './config';
import { NEAR_ME_ELIGIBLE_TIERS } from './tiers';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RankedVenue {
  venue: Venue;
  distanceMetres: number;
  formattedDistance: string;
  isFarAway: boolean;
}

export interface RankVenuesOptions {
  origin: LatLng;
  venues: Venue[];
  tiers?: TierStatus[];
  limit?: number;
  nearbyThresholdMetres?: number;
}

/**
 * Official Central Manchester 2.5-Mile jurisdictional perimeter in metres.
 */
export const DEFAULT_NEARBY_THRESHOLD_METRES = 4023; // 2.5 miles

/**
 * Threshold for origin movement before recomputing ranking (anti-flicker).
 */
export const ORIGIN_MOVE_THRESHOLD_METRES = 18; // 15-20 metres

/**
 * Beyond this distance from Spinningfields the user is "outside Manchester",
 * and Near Me ranks from the base instead of from them.
 */
export const FAR_FROM_BASE_METRES = 30_000;

/** Typical city walking pace used for Near Me walk estimates. */
export const WALKING_METRES_PER_MINUTE = 80;

/**
 * Great-circle distance between two coordinates in metres using the Haversine formula.
 */
export function haversineMetres(a: LatLng, b: LatLng): number {
  if (a.lat === b.lat && a.lng === b.lng) {
    return 0;
  }

  const R = 6371000; // Earth radius in metres
  const toRad = Math.PI / 180;

  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const deltaLat = (b.lat - a.lat) * toRad;
  const deltaLng = (b.lng - a.lng) * toRad;

  const sinDeltaLat = Math.sin(deltaLat / 2);
  const sinDeltaLng = Math.sin(deltaLng / 2);

  const h =
    sinDeltaLat * sinDeltaLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDeltaLng * sinDeltaLng;

  const clampedH = Math.min(1, Math.max(0, h));
  const c = 2 * Math.atan2(Math.sqrt(clampedH), Math.sqrt(1 - clampedH));

  return R * c;
}

/**
 * Formats straight-line distance in metres:
 * - Under 1 km: rounded to nearest 5m or 10m (e.g., "45 m", "120 m", "850 m")
 * - 1 km and above: in kilometres with 1 decimal place (e.g., "1.2 km", "3.4 km")
 */
export function formatDistance(metres: number): string {
  if (metres < 0) metres = 0;

  if (metres < 1000) {
    let rounded: number;
    if (metres < 100) {
      rounded = Math.round(metres / 5) * 5;
    } else {
      rounded = Math.round(metres / 10) * 10;
    }
    return `${rounded} m`;
  }

  const km = (metres / 1000).toFixed(1);
  return `${km} km`;
}

/** Walking minutes for a straight-line distance; never less than one minute. */
export function estimateWalkMinutes(metres: number): number {
  return Math.max(1, Math.round(Math.max(0, metres) / WALKING_METRES_PER_MINUTE));
}

/**
 * The point Near Me ranks from: the user's position, or Spinningfields when
 * there is no position yet or the user is too far away for distances to mean anything.
 */
export function resolveRankingOrigin(position: LatLng | null): { origin: LatLng; fromBase: boolean } {
  if (!position || haversineMetres(position, BASE_COORDINATES) > FAR_FROM_BASE_METRES) {
    return { origin: { lat: BASE_COORDINATES.lat, lng: BASE_COORDINATES.lng }, fromBase: true };
  }
  return { origin: { lat: position.lat, lng: position.lng }, fromBase: false };
}

/**
 * Checks whether the origin has moved significantly (by default >= 18m)
 * to prevent list reordering flicker while walking.
 */
export function hasOriginMovedSignificantly(
  prevOrigin: LatLng | null,
  newOrigin: LatLng | null,
  thresholdMetres = ORIGIN_MOVE_THRESHOLD_METRES
): boolean {
  if (!prevOrigin || !newOrigin) return true;
  return haversineMetres(prevOrigin, newOrigin) >= thresholdMetres;
}

/**
 * Pure ranking function:
 * - Filters venues by selected eligible Near Me tiers (Rejected & Gone But Not Forgotten always excluded)
 * - Computes straight-line Haversine distance
 * - Sorts ascending by distance (with deterministic tie-breakers)
 * - Flags venues beyond the threshold as `isFarAway`
 * - If no venues are within the nearby threshold, still returns the single closest venue flagged as `isFarAway: true`
 */
export function rankVenues({
  origin,
  venues,
  tiers,
  limit,
  nearbyThresholdMetres = DEFAULT_NEARBY_THRESHOLD_METRES,
}: RankVenuesOptions): RankedVenue[] {
  if (!origin || !venues || venues.length === 0) {
    return [];
  }

  // 1. Determine active tiers (intersect requested tiers with eligible Near Me tiers)
  const allowedTierSet = new Set(NEAR_ME_ELIGIBLE_TIERS);
  const activeTiers = tiers === undefined
    ? NEAR_ME_ELIGIBLE_TIERS
    : tiers.filter((t) => allowedTierSet.has(t));

  if (activeTiers.length === 0) {
    return [];
  }

  const activeTierSet = new Set(activeTiers);

  // 2. Filter venues with valid coords in the selected tiers
  const validVenues = venues.filter(
    (v) => v.lat != null && v.lng != null && activeTierSet.has(v.status)
  );

  if (validVenues.length === 0) {
    return [];
  }

  // 3. Compute distance for all matching venues
  const calculated = validVenues.map((v) => {
    const distanceMetres = haversineMetres(origin, { lat: v.lat!, lng: v.lng! });
    return {
      venue: v,
      distanceMetres,
      formattedDistance: formatDistance(distanceMetres),
      isFarAway: distanceMetres > nearbyThresholdMetres,
    };
  });

  // 4. Sort ascending by distance, with deterministic tie-breaking
  calculated.sort((a, b) => {
    const diff = a.distanceMetres - b.distanceMetres;
    if (Math.abs(diff) > 0.01) {
      return diff;
    }
    // Tie-break: name alphabetical
    return a.venue.name.localeCompare(b.venue.name);
  });

  // 5. Check if any venue is within the nearby threshold
  const nearbyVenues = calculated.filter((item) => !item.isFarAway);

  if (nearbyVenues.length === 0) {
    // "If no venue matches the filter, still return the single closest venue
    // from the currently selected tiers, flagged as 'far away' so the UI can say so."
    const closest = calculated[0];
    return [{ ...closest, isFarAway: true }];
  }

  // If limit specified, truncate
  if (limit && limit > 0) {
    return calculated.slice(0, limit);
  }

  return calculated;
}
