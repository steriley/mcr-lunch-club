import { FULL_MAX_EDGE, FULL_QUALITIES, MAX_FULL_BYTES, THUMB_MAX_EDGE, THUMB_QUALITY } from '@/lib/image-upload';

/**
 * Browser only (#35): turns a photo the admin picked into the two WebP
 * variants the server accepts. Decodes once with createImageBitmap (applying
 * EXIF orientation), draws each size from the original, and encodes with
 * @jsquash/webp (WASM), never canvas toBlob, which Safari silently turns into
 * PNG. Redrawing drops all metadata, so GPS never reaches the server. There is
 * no unoptimised fallback: a failure is reported with a typed reason.
 */

export type OptimiseErrorReason = 'unsupported_format' | 'encoder_failed';

export class OptimiseError extends Error {
  readonly reason: OptimiseErrorReason;

  constructor(reason: OptimiseErrorReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OptimiseError';
    this.reason = reason;
  }
}

export interface OptimisedImage {
  full: Blob;
  thumb: Blob;
  /** Of the full variant. */
  width: number;
  height: number;
}

/** Scales down to fit `maxEdge` on the longest side, keeping the aspect ratio; never scales up. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function pixels(bitmap: ImageBitmap, size: { width: number; height: number }): ImageData {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(size.width, size.height)
      : Object.assign(document.createElement('canvas'), { width: size.width, height: size.height });
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new Error('Canvas 2D is not available.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return context.getImageData(0, 0, size.width, size.height);
}

export async function optimiseImage(file: Blob): Promise<OptimisedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (error) {
    throw new OptimiseError('unsupported_format', 'This browser cannot read that image format.', { cause: error });
  }

  try {
    let encode: (data: ImageData, options?: { quality?: number }) => Promise<ArrayBuffer>;
    try {
      // Fetched only when a photo is picked (about 125 KB gzipped).
      ({ encode } = await import('@jsquash/webp'));
    } catch (error) {
      throw new OptimiseError('encoder_failed', 'The image optimiser could not be loaded.', { cause: error });
    }

    const fullSize = fitWithin(bitmap.width, bitmap.height, FULL_MAX_EDGE);
    const thumbSize = fitWithin(bitmap.width, bitmap.height, THUMB_MAX_EDGE);
    try {
      // Both from the original bitmap: the thumbnail is never a shrunk copy of the full variant.
      const fullPixels = pixels(bitmap, fullSize);
      let full = await encode(fullPixels, { quality: FULL_QUALITIES[0] });
      // Step the quality down until it fits; the last attempt is kept, and the server rejects it if still too big.
      for (const quality of FULL_QUALITIES.slice(1)) {
        if (full.byteLength <= MAX_FULL_BYTES) break;
        full = await encode(fullPixels, { quality });
      }
      const thumb = await encode(pixels(bitmap, thumbSize), { quality: THUMB_QUALITY });
      return {
        full: new Blob([full], { type: 'image/webp' }),
        thumb: new Blob([thumb], { type: 'image/webp' }),
        width: fullSize.width,
        height: fullSize.height,
      };
    } catch (error) {
      throw new OptimiseError('encoder_failed', 'The image could not be converted to WebP.', { cause: error });
    }
  } finally {
    bitmap.close();
  }
}
