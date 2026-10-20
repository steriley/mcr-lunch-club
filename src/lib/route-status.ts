/**
 * Location state of a venue, shown as admin badges. Kept free of server
 * imports so islands can use it too.
 *
 *   needs_location  no coordinates yet (hidden from the public site)
 *   route_pending   coordinates, but the walking route from HQ is not known yet
 *   estimated       an old straight-line estimate from before ORS routing;
 *                   `pnpm routes:backfill` or Re-route replaces it
 *   routed          distance and walking time from an ORS walking route
 */
export type RouteStatus = 'needs_location' | 'route_pending' | 'estimated' | 'routed';

export interface RouteStatusFields {
  latitude: string | number | null;
  longitude: string | number | null;
  distanceMiles: string | number | null;
  walkingTimeMin: number | null;
  routeUpdatedAt: Date | string | null;
}

export function routeStatus(venue: RouteStatusFields): RouteStatus {
  if (venue.latitude === null || venue.longitude === null) return 'needs_location';
  if (venue.distanceMiles === null || venue.walkingTimeMin === null) return 'route_pending';
  return venue.routeUpdatedAt === null ? 'estimated' : 'routed';
}

export const ROUTE_STATUS_LABELS: Record<Exclude<RouteStatus, 'routed'>, string> = {
  needs_location: 'Needs location',
  route_pending: 'Route pending',
  estimated: 'Estimated, not routed',
};
