/**
 * Generates walking directions URL for a venue destination.
 * Per spec:
 * - Default: https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=walking
 * - Apple devices: https://maps.apple.com/?daddr={lat},{lng}&dirflg=w
 *
 * Detection uses userAgent only (navigator.platform is deprecated).
 */
export function getWalkingDirectionsUrl(
  lat: number,
  lng: number,
  platformOverride?: string
): string {
  const isApple = platformOverride
    ? /Mac|iPhone|iPod|iPad/.test(platformOverride)
    : typeof navigator !== 'undefined' && /Macintosh|iPhone|iPad/.test(navigator.userAgent || '');

  if (isApple) {
    return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}
