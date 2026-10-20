/** Shared limits for venue image uploads (client check + server token). */
export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function imageUploadPath(fileName: string): string {
  const extension = /\.([a-z0-9]{2,5})$/i.exec(fileName)?.[1]?.toLowerCase() ?? 'jpg';
  const base = fileName
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';
  return `venues/${base}.${extension}`;
}
