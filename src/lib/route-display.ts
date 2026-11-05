/** Public wording for a venue's walk from HQ; the route can be pending (null). */

export function walkText(walkingTimeMin: number | null, unit = 'min walk'): string {
  return walkingTimeMin === null ? 'Walk time pending' : `${walkingTimeMin} ${unit}`;
}

export function milesText(distanceMiles: number | null, unit = 'miles'): string {
  return distanceMiles === null ? 'Distance pending' : `${distanceMiles.toFixed(2)} ${unit}`;
}

/** Beyond this many minutes' walk from HQ a venue is routed (and linked) by car instead. */
const DRIVE_ABOVE_WALKING_MIN = 30;

export type RouteMode = 'walk' | 'drive';

/** Walk up to DRIVE_ABOVE_WALKING_MIN minutes, drive beyond. A pending walk time is treated as a walk. */
export function routeModeFor(walkingTimeMin: number | null): RouteMode {
  return walkingTimeMin !== null && walkingTimeMin > DRIVE_ABOVE_WALKING_MIN ? 'drive' : 'walk';
}
