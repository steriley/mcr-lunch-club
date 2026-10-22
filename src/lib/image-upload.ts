/**
 * Shared venue image settings (#35). Browser-safe: no server imports, so the
 * admin optimiser, the server routes and the public pages all read the same
 * numbers. Tune the sizes and qualities here.
 */

/** Server-enforced cap on photos per venue. */
export const MAX_IMAGES_PER_VENUE = 5;

/** Longest edge, in pixels, of each WebP variant. Both are uncropped. */
export const FULL_MAX_EDGE = 1600;
export const THUMB_MAX_EDGE = 640;

/**
 * WebP encoder quality (0 to 100) for each variant. The full variant starts at
 * the first quality and steps down the list until it fits MAX_FULL_BYTES, so a
 * noisy photo still uploads instead of failing the same way on every retry.
 */
export const FULL_QUALITIES = [80, 65, 50] as const;
export const THUMB_QUALITY = 75;

/** Largest accepted upload for each variant. */
export const MAX_FULL_BYTES = 800 * 1024;
export const MAX_THUMB_BYTES = 150 * 1024;

/** Caption length; the caption doubles as alt text. */
export const CAPTION_MAX = 200;

export interface FocalPoint {
  focalX: number | null;
  focalY: number | null;
}

/** CSS `object-position` for an image cropped with `object-cover`; centre when unset. */
export function focalStyle(image: FocalPoint): string {
  if (image.focalX === null || image.focalY === null) return '50% 50%';
  return `${image.focalX}% ${image.focalY}%`;
}

/** A venue photo as JSON, for admin islands and API responses. */
export interface SerializedVenueImage extends FocalPoint {
  id: string;
  venueId: string;
  fullUrl: string;
  /** Null for photos migrated from the old single image link. */
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  caption: string | null;
  isPrimary: boolean;
  createdAt: string;
}
