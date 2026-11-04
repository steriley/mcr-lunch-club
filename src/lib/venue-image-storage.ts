import { del, put } from '@vercel/blob';
import { blobEnvPrefix, getBlobToken, isBlobConfigured } from '@/lib/env';

/**
 * Where venue photos (#35) are kept. Server only.
 *
 * The venue lifecycle (src/lib/venue-lifecycle.ts) talks to a `PhotoStore`:
 * Vercel Blob in production (`blobPhotoStore`), an in-memory store in tests
 * (src/test/memory-photo-store.ts). Keys are `venues/{venueId}/{imageId}-
 * {full|thumb}.webp`; the Blob adapter puts `{prod|preview|dev}/` in front.
 * Every key is unique (the image id is a fresh UUID), so files are cached for
 * a year and never overwritten.
 */

export interface PhotoStore {
  /** Stores the bytes under `key` and returns the public URL. */
  put(key: string, bytes: Uint8Array): Promise<string>;
  /**
   * Best-effort delete. Never throws and ignores URLs that are not this
   * store's own (migrated external links): a stray file is better than a
   * broken image.
   */
  delete(urls: string[]): Promise<void>;
}

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Swappable in tests so the adapter can be exercised without touching Blob. */
export const blobClient = { put, del };

const OWNED_BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';

/**
 * True only for our own public Vercel Blob URLs. Migrated external links
 * (and anything unparseable) must never be passed to `del()`.
 */
export function isOwnedBlobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' && parsed.hostname.toLowerCase().endsWith(OWNED_BLOB_HOST_SUFFIX)
    );
  } catch {
    return false;
  }
}

export function blobPhotoStore(token: string | undefined): PhotoStore {
  return {
    async put(key, bytes) {
      const result = await blobClient.put(`${blobEnvPrefix()}/${key}`, bytes as unknown as Blob, {
        access: 'public',
        contentType: 'image/webp',
        addRandomSuffix: false,
        cacheControlMaxAge: ONE_YEAR_SECONDS,
        ...(token ? { token } : {}),
      });
      return result.url;
    },

    async delete(urls) {
      const owned = urls.filter(isOwnedBlobUrl);
      if (!owned.length) return;
      if (!isBlobConfigured()) {
        console.error('[admin] Photo cleanup skipped, uploads are not configured.');
        return;
      }
      try {
        await blobClient.del(owned, token ? { token } : {});
      } catch (error) {
        console.error(
          '[admin] Photo cleanup failed:',
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    },
  };
}

/** The store the running site uses. */
export function photoStore(): PhotoStore {
  return blobPhotoStore(getBlobToken());
}
