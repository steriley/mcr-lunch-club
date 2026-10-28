import {
  OrsError,
  routeToVenueValues,
  walkingRouteFromBase,
  type LatLng,
  type WalkingRoute,
} from '@/lib/ors';

/**
 * Distance and walking time from HQ for a venue being saved. They are only
 * ever computed here, from an ORS foot-walking route, never typed in. A
 * failed lookup never blocks a save: the venue keeps its coordinates and the
 * route stays pending (null) until a retry succeeds.
 */

export interface RouteValues {
  distanceMiles: number | null;
  walkingTimeMin: number | null;
  /** Set when ORS just supplied the route, null when there is none, undefined to leave as stored. */
  routeUpdatedAt?: Date | null;
}

export interface ResolvedRoute extends RouteValues {
  /** Set when ORS was needed but failed. */
  error: OrsError | null;
}

export interface StoredLocation {
  latitude: string | null;
  longitude: string | null;
  distanceMiles: string | null;
  walkingTimeMin: number | null;
  /** Null for an old straight-line estimate that has not been routed yet. */
  routeUpdatedAt: Date | null;
}

type RouteLookup = (to: LatLng) => Promise<WalkingRoute>;

const NO_ROUTE: RouteValues = { distanceMiles: null, walkingTimeMin: null, routeUpdatedAt: null };

/** Coordinates as stored (numeric(9,6)), so edits compare like for like. */
export function storedCoordinate(value: number): string {
  return value.toFixed(6);
}

export function sameCoordinates(
  input: { latitude: number | null; longitude: number | null },
  stored: { latitude: string | null; longitude: string | null }
): boolean {
  if (input.latitude === null || input.longitude === null)
    return stored.latitude === null && stored.longitude === null;
  if (stored.latitude === null || stored.longitude === null) return false;
  return (
    storedCoordinate(input.latitude) === Number(stored.latitude).toFixed(6) &&
    storedCoordinate(input.longitude) === Number(stored.longitude).toFixed(6)
  );
}

/** Calls ORS for the route to `to`, turning any failure into a pending route. */
export async function computeRoute(
  to: LatLng,
  lookup: RouteLookup = walkingRouteFromBase
): Promise<ResolvedRoute> {
  try {
    return { ...routeToVenueValues(await lookup(to)), routeUpdatedAt: new Date(), error: null };
  } catch (error) {
    const orsError =
      error instanceof OrsError
        ? error
        : new OrsError('unavailable', 'Walking route lookup failed.');
    return { ...NO_ROUTE, error: orsError };
  }
}

/**
 * Route values for a save. Recomputes when the coordinates are new or
 * changed, or the stored route is missing; otherwise keeps what is stored.
 * An old straight-line estimate at unchanged coordinates is upgraded to a
 * route when ORS answers, and kept as it is when ORS does not.
 */
export async function resolveRoute(
  input: { latitude: number | null; longitude: number | null },
  existing: StoredLocation | null,
  lookup: RouteLookup = walkingRouteFromBase
): Promise<ResolvedRoute> {
  if (input.latitude === null || input.longitude === null) return { ...NO_ROUTE, error: null };

  if (
    existing &&
    sameCoordinates(input, existing) &&
    existing.distanceMiles !== null &&
    existing.walkingTimeMin !== null
  ) {
    const kept: ResolvedRoute = {
      distanceMiles: Number(existing.distanceMiles),
      walkingTimeMin: existing.walkingTimeMin,
      error: null,
    };
    if (existing.routeUpdatedAt !== null) return kept;
    const upgraded = await computeRoute({ lat: input.latitude, lng: input.longitude }, lookup);
    return upgraded.error ? { ...kept, error: upgraded.error } : upgraded;
  }
  return computeRoute({ lat: input.latitude, lng: input.longitude }, lookup);
}

/**
 * Admin-facing note when ORS could not supply the route; null when nothing
 * went wrong. `save` words it as the outcome of a save; `reroute` as the
 * outcome of a retry, which saves nothing.
 */
export function routeWarning(
  route: ResolvedRoute,
  context: 'save' | 'reroute' = 'save'
): string | null {
  if (!route.error) return null;
  const reason =
    route.error.kind === 'rate_limited'
      ? 'the route service is rate limited'
      : route.error.kind === 'not_configured'
        ? 'the route service is not configured'
        : route.error.kind === 'no_result'
          ? 'no walking route was found'
          : 'the route service is unavailable';
  if (context === 'reroute')
    return `The walking route is pending because ${reason}. Use Retry later.`;
  if (route.distanceMiles !== null)
    return `Saved. The walk is still a straight-line estimate because ${reason}. Use Re-route later.`;
  return `Saved, but the walking route is pending because ${reason}. Use Retry later.`;
}
