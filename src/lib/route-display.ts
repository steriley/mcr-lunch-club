/** Public wording for a venue's walk from HQ; the route can be pending (null). */

export function walkText(walkingTimeMin: number | null, unit = 'min walk'): string {
  return walkingTimeMin === null ? 'Walk time pending' : `${walkingTimeMin} ${unit}`;
}

export function milesText(distanceMiles: number | null, unit = 'miles'): string {
  return distanceMiles === null ? 'Distance pending' : `${distanceMiles.toFixed(2)} ${unit}`;
}
