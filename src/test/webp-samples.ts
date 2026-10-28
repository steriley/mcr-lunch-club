/** Small real image files for tests (see venue-images.test.ts). */
// Real files made with libwebp (via Pillow): a 37x21 lossy, the same image
// lossless, and a 29x43 lossy image with alpha (which uses the extended format).
export const sample = (base64: string) => new Uint8Array(Buffer.from(base64, 'base64'));
export const VP8 = sample(
  'UklGRqIAAABXRUJQVlA4IJYAAABQBACdASolABUAPr1Sm0unJSIhtVv8AOAXiWxrlViORgaUB7CwKN6E/odgAP7RGfWDq3oJ+X50v72bUXJ/EXlV6yaP/SFpF4B/xBfxA/hAEhRsXVOnMa5wOzTOaFN/HL9sVv5ZJjYvZNU7O9/kw6k/Sxgaf/JP9nHh7ZUbgzLrfQwZI/YpjzrRExZ/nGcvV4vHv1AAAAA='
);
export const VP8L = sample(
  'UklGRloAAABXRUJQVlA4TE4AAAAvJAAFAA9wROQr+F7Lef4jDY4iSY4jCH7euw1V0ARFEPT07aQR0f/4NHlVuRXZ+dJ507hT2VPo8WnxqnErsfPX+WmsKqPCwCe8wi3sQhc='
);
export const VP8X = sample(
  'UklGRmoAAABXRUJQVlA4WAoAAAAQAAAAHAAAKgAAQUxQSAoAAAABB1DAiAhERP8DVlA4IDoAAABwAwCdASodACsAPtFmrFEoJaQipWgBABoJZwDPzoAAN7nfSoAA/tDK/r4Ap6o/9wZn1dgn52MwAAAA'
);
// The first bytes of a JPEG and a PNG are enough: neither is a RIFF file.
export const JPEG = sample(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4n'
);
export const PNG = sample(
  'iVBORw0KGgoAAAANSUhEUgAAACUAAAAVCAIAAABOhrD5AAAAiElEQVR4nL3VsRGAIAyFYUnpJNaMwATWTsIITEVNxUx2noco5CUxXYr/vrs0cWs5cqoLOiF6Vk451RA97HFzAhoJSUAjIQloJCTdlx9IanZrsvWsyY5nSvY9O'
);

/** A copy of the VP8X sample whose header claims this canvas size. */
export function webpWithSize(width: number, height: number): Uint8Array {
  const bytes = VP8X.slice();
  const w = width - 1;
  const h = height - 1;
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
  bytes.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
  return bytes;
}
