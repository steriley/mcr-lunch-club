/**
 * Reads a WebP's real format and pixel size from its bytes, so an upload is
 * judged by what it is, not by the type its client declared.
 */

export interface WebpInfo {
  /** First chunk: lossy, lossless, or extended (alpha, animation, metadata). */
  format: 'VP8' | 'VP8L' | 'VP8X';
  width: number;
  height: number;
}

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));
const u16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const u24 = (bytes: Uint8Array, offset: number) =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
const u32 = (bytes: Uint8Array, offset: number) =>
  (u24(bytes, offset) | (bytes[offset + 3] << 24)) >>> 0;

/**
 * Reads a WebP's real format and pixel size from its bytes, ignoring any
 * declared content type. Returns null for anything that is not a complete
 * WebP: a wrong signature, an unknown first chunk, or a truncated file.
 */
export function readWebpInfo(bytes: Uint8Array): WebpInfo | null {
  // RIFF header (12) + chunk header (8).
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP')
    return null;
  // The RIFF size covers everything after its own 8 bytes; a shorter file is truncated.
  if (u32(bytes, 4) + 8 > bytes.length) return null;

  const chunk = ascii(bytes, 12, 4);
  const size = u32(bytes, 16);
  const data = 20;
  if (data + size > bytes.length) return null;

  if (chunk === 'VP8 ') {
    // Frame tag (3), start code 9d 01 2a (3), then 14-bit width and height.
    if (
      size < 10 ||
      bytes[data + 3] !== 0x9d ||
      bytes[data + 4] !== 0x01 ||
      bytes[data + 5] !== 0x2a
    )
      return null;
    const width = u16(bytes, data + 6) & 0x3fff;
    const height = u16(bytes, data + 8) & 0x3fff;
    return width && height ? { format: 'VP8', width, height } : null;
  }
  if (chunk === 'VP8L') {
    // Signature 0x2f, then 14 bits of width - 1 and 14 bits of height - 1.
    if (size < 5 || bytes[data] !== 0x2f) return null;
    const bits = u32(bytes, data + 1);
    return { format: 'VP8L', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    // Flags (1), reserved (3), then 24-bit canvas width - 1 and height - 1.
    if (size < 10) return null;
    return { format: 'VP8X', width: u24(bytes, data + 4) + 1, height: u24(bytes, data + 7) + 1 };
  }
  return null;
}
