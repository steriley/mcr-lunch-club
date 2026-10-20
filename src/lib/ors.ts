import { getOrsApiKey } from '@/lib/env';
import { BASE_COORDINATES } from '@/lib/map/config';

/**
 * Server-only client for OpenRouteService (https://openrouteservice.org).
 * Geocoding finds venue addresses and coordinates; foot-walking directions
 * give the distance and walking time from HQ. The API key is read from
 * ORS_API_KEY and only ever sent in the Authorization header: never log it,
 * never put it in an error message, never import this module from an island.
 *
 * Endpoints (checked against the ORS docs and the official clients):
 *   GET  /geocode/search?text=&focus.point.lon=&focus.point.lat=&boundary.circle.*=&boundary.country=&size=
 *        -> GeoJSON FeatureCollection; coordinates are [lon, lat]
 *   POST /v2/directions/foot-walking  { coordinates: [[lon, lat], [lon, lat]] }
 *        -> { routes: [{ summary: { distance (m), duration (s) } }] }
 *   POST /v2/matrix/foot-walking  { locations, sources: [0], destinations, metrics, units: 'm' }
 *        -> { distances: [[m, ...]], durations: [[s, ...]] } (null where there is no route)
 * Free-plan quotas are per endpoint and per minute/day; a 429 means the
 * quota is spent, so callers stop rather than retry in a loop.
 */

export const ORS_BASE_URL = 'https://api.openrouteservice.org';
export const ORS_TIMEOUT_MS = 8000;
export const MAX_PLACE_RESULTS = 5;
/** Search radius around HQ that covers Greater Manchester. */
export const SEARCH_RADIUS_KM = 25;

const METRES_PER_MILE = 1609.344;

export type OrsErrorKind = 'not_configured' | 'rate_limited' | 'unavailable' | 'no_result';

export class OrsError extends Error {
  constructor(
    readonly kind: OrsErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'OrsError';
  }
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlaceCandidate extends LatLng {
  label: string;
  address: string;
}

export interface WalkingRoute {
  distanceMetres: number;
  durationSeconds: number;
}

export interface OrsOptions {
  apiKey?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Stored route values: miles to two decimal places, whole minutes (at least one). */
export function routeToVenueValues(route: WalkingRoute): { distanceMiles: number; walkingTimeMin: number } {
  return {
    distanceMiles: Math.round((route.distanceMetres / METRES_PER_MILE) * 100) / 100,
    walkingTimeMin: Math.max(1, Math.round(route.durationSeconds / 60)),
  };
}

async function orsRequest(path: string, init: RequestInit, options: OrsOptions): Promise<unknown> {
  const apiKey = options.apiKey ?? getOrsApiKey();
  if (!apiKey) throw new OrsError('not_configured', 'Location lookup is not configured (ORS_API_KEY is missing).');

  const doFetch = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(`${ORS_BASE_URL}${path}`, {
      ...init,
      headers: { ...init.headers, Accept: 'application/json', Authorization: apiKey },
      signal: AbortSignal.timeout(options.timeoutMs ?? ORS_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new OrsError('unavailable', timedOut ? 'OpenRouteService did not respond in time.' : 'OpenRouteService could not be reached.');
  }

  if (response.status === 429) {
    throw new OrsError('rate_limited', 'OpenRouteService rate limit reached. Try again later.');
  }
  // ORS answers 404 when a request completed but found nothing (e.g. no route, point not found).
  if (response.status === 404) {
    throw new OrsError('no_result', 'OpenRouteService found no result.');
  }
  if (!response.ok) {
    throw new OrsError('unavailable', `OpenRouteService returned HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new OrsError('unavailable', 'OpenRouteService returned an unreadable response.');
  }
}

interface PeliasFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    label?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    postalcode?: string;
    locality?: string;
  };
}

/** "55 Bridge Street, M3 3BQ"-style address from Pelias properties, falling back to the label. */
function addressFrom(properties: NonNullable<PeliasFeature['properties']>): string {
  const street = [properties.housenumber, properties.street].filter(Boolean).join(' ');
  const parts = [street || null, properties.postalcode ?? null].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return properties.label ?? properties.name ?? '';
}

/** Up to five places matching `query`, biased to Greater Manchester. */
export async function searchPlaces(query: string, options: OrsOptions = {}): Promise<PlaceCandidate[]> {
  const params = new URLSearchParams({
    text: query,
    'focus.point.lon': String(BASE_COORDINATES.lng),
    'focus.point.lat': String(BASE_COORDINATES.lat),
    'boundary.circle.lon': String(BASE_COORDINATES.lng),
    'boundary.circle.lat': String(BASE_COORDINATES.lat),
    'boundary.circle.radius': String(SEARCH_RADIUS_KM),
    'boundary.country': 'GB',
    size: String(MAX_PLACE_RESULTS),
  });

  let body: unknown;
  try {
    body = await orsRequest(`/geocode/search?${params}`, { method: 'GET' }, options);
  } catch (error) {
    if (error instanceof OrsError && error.kind === 'no_result') return [];
    throw error;
  }

  const features = ((body as { features?: PeliasFeature[] })?.features ?? []).slice(0, MAX_PLACE_RESULTS);
  const candidates: PlaceCandidate[] = [];
  for (const feature of features) {
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    const properties = feature.properties ?? {};
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    candidates.push({ label: properties.label ?? properties.name ?? addressFrom(properties), address: addressFrom(properties), lat, lng });
  }
  return candidates;
}

/** Foot-walking route between two points. */
export async function walkingRoute(from: LatLng, to: LatLng, options: OrsOptions = {}): Promise<WalkingRoute> {
  const body = await orsRequest(
    '/v2/directions/foot-walking',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // ORS takes [lon, lat] pairs.
      body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]] }),
    },
    options
  );

  const summary = (body as { routes?: { summary?: { distance?: number; duration?: number } }[] })?.routes?.[0]?.summary;
  if (!summary) throw new OrsError('no_result', 'OpenRouteService found no walking route.');
  // A zero-length route (venue at HQ) comes back without distance/duration.
  return { distanceMetres: summary.distance ?? 0, durationSeconds: summary.duration ?? 0 };
}

/** Destinations per Matrix request; well inside the public API's per-request limits. */
export const MATRIX_BATCH_SIZE = 25;

/**
 * Walking routes from HQ to many venues in one ORS Matrix request (used by
 * the backfill). Entries are null where ORS found no route. Matrix has its
 * own, lower daily quota than Directions.
 */
export async function walkingMatrixFromBase(destinations: LatLng[], options: OrsOptions = {}): Promise<(WalkingRoute | null)[]> {
  if (!destinations.length) return [];
  if (destinations.length > MATRIX_BATCH_SIZE) throw new Error(`At most ${MATRIX_BATCH_SIZE} destinations per Matrix request.`);

  const body = await orsRequest(
    '/v2/matrix/foot-walking',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [[BASE_COORDINATES.lng, BASE_COORDINATES.lat], ...destinations.map((point) => [point.lng, point.lat])],
        sources: [0],
        destinations: destinations.map((_, index) => index + 1),
        metrics: ['distance', 'duration'],
        units: 'm',
      }),
    },
    options
  );

  const { distances, durations } = (body ?? {}) as { distances?: (number | null)[][]; durations?: (number | null)[][] };
  return destinations.map((_, index) => {
    const distance = distances?.[0]?.[index];
    const duration = durations?.[0]?.[index];
    return typeof distance === 'number' && typeof duration === 'number' ? { distanceMetres: distance, durationSeconds: duration } : null;
  });
}

/** Walking route from HQ (Spinningfields) to a venue. */
export function walkingRouteFromBase(to: LatLng, options: OrsOptions = {}): Promise<WalkingRoute> {
  return walkingRoute(BASE_COORDINATES, to, options);
}
