/** Public wording for a venue's walk from HQ; the route can be pending (null). */

/** Caption shown under a dash when the walking route is not known yet. */
export const ROUTE_PENDING_LABEL = 'Route pending';

/** Caption shown under a dash when a venue has no inspection date. */
export const NOT_INSPECTED_LABEL = 'Not yet inspected';

export function walkText(walkingTimeMin: number | null, unit = 'min walk'): string {
  return walkingTimeMin === null ? 'Walk time pending' : `${walkingTimeMin} ${unit}`;
}

export function milesText(distanceMiles: number | null, unit = 'miles'): string {
  return distanceMiles === null ? 'Distance pending' : `${distanceMiles.toFixed(2)} ${unit}`;
}

export interface RouteStat {
  /** The stat itself, or null when it is missing (the page shows an em dash). */
  value: string | null;
  /** Muted caption under the stat: the usual one, or "Route pending" when the value is missing. */
  caption: string;
}

/**
 * The venue page's walk and distance stats. When both are missing they collapse
 * into one `combined` cell; otherwise each keeps its own slot so a lone missing
 * value reads as a dash, not a sentence.
 */
export function routeStats(
  walkingTimeMin: number | null,
  distanceMiles: number | null,
): { combined: true } | { combined: false; walk: RouteStat; distance: RouteStat } {
  if (walkingTimeMin === null && distanceMiles === null) return { combined: true };
  return {
    combined: false,
    walk: {
      value: walkingTimeMin === null ? null : walkText(walkingTimeMin, 'mins'),
      caption: walkingTimeMin === null ? ROUTE_PENDING_LABEL : 'from Spinningfields Base',
    },
    distance: {
      value: distanceMiles === null ? null : milesText(distanceMiles),
      caption: distanceMiles === null ? ROUTE_PENDING_LABEL : 'walking route',
    },
  };
}
