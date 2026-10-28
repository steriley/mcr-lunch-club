import { del, put } from '@vercel/blob';
import { blobEnvPrefix, isBlobConfigured } from '@/lib/env';
import { isOwnedBlobUrl } from '@/lib/venue-images';

/**
 * Vercel Blob storage for venue photos (#35). Server only.
 *
 * Keys: `{prod|preview|dev}/venues/{venueId}/{imageId}-{full|thumb}.webp`.
 * Every key is unique (the image id is a fresh UUID), so files are cached for
 * a year and never overwritten.
 */

export type ImageVariant = 'full' | 'thumb';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Swappable in tests so routes can be exercised without touching Blob. */
export const blobClient = { put, del };

export function imageBlobKey(venueId: string, imageId: string, variant: ImageVariant): string {
  return `${blobEnvPrefix()}/venues/${venueId}/${imageId}-${variant}.webp`;
}

export async function putImageBlob(
  token: string | undefined,
  key: string,
  body: Blob | ArrayBuffer | Uint8Array
): Promise<string> {
  const result = await blobClient.put(key, body as Blob, {
    access: 'public',
    contentType: 'image/webp',
    addRandomSuffix: false,
    cacheControlMaxAge: ONE_YEAR_SECONDS,
    ...(token ? { token } : {}),
  });
  return result.url;
}

/**
 * Best-effort delete of our own blobs. URLs that are not on our Blob store
 * (migrated external links) are never passed to `del()`. A failure is logged
 * and ignored: a stray file is better than a broken image.
 */
export async function deleteOwnedBlobs(
  token: string | undefined,
  urls: (string | null | undefined)[],
  context: string
): Promise<void> {
  const owned = urls.filter((url): url is string => isOwnedBlobUrl(url));
  if (!owned.length) return;
  if (!isBlobConfigured()) {
    console.error(`[admin] ${context}: blob cleanup skipped, uploads are not configured.`);
    return;
  }
  try {
    await blobClient.del(owned, token ? { token } : {});
  } catch (error) {
    console.error(
      `[admin] ${context}: blob cleanup failed:`,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}
