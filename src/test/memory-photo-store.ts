import type { PhotoStore } from '@/lib/venue-image-storage';

export interface MemoryPhotoStore extends PhotoStore {
  /** The URL to bytes of every photo file currently stored. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  /** Make the nth `put` from now (1 is the next) throw, to test cleanup after a failed upload. */
  failPut(nth: number): void;
}

/** A `PhotoStore` that keeps files in memory, for `pnpm test:db`. */
export function memoryPhotoStore(): MemoryPhotoStore {
  const files = new Map<string, Uint8Array>();
  let puts = 0;
  let failing: number | null = null;
  return {
    files,
    failPut(nth) {
      failing = puts + nth;
    },
    async put(key, bytes) {
      puts += 1;
      if (failing === puts) throw new Error('Simulated upload failure');
      const url = `https://memory.test/${key}`;
      files.set(url, bytes);
      return url;
    },
    async delete(urls) {
      for (const url of urls) files.delete(url);
    },
  };
}
