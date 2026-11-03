/**
 * Which requests the service worker (src/sw/sw.ts) touches, and how. It lives here, free of
 * browser APIs, so the rules that keep admin data and writes out of Cache Storage are unit tested.
 *
 * Anything classified `bypass` is never intercepted: the worker does not call respondWith.
 */

export type RouteKind =
  /** Hashed build output, fonts and brand images: served from the precache. */
  | 'asset'
  /** Public HTML: network first, then the cache, then /offline. */
  | 'page'
  /** A navigation into the Chairs' Area: network only, with a static fallback page when it fails. */
  | 'admin-page'
  /** CARTO basemap tiles: cache first, capped. */
  | 'tile'
  /** Venue photo thumbnails on Vercel Blob: cache first, capped. */
  | 'thumbnail'
  /** Full-size venue photos: network only, falling back to a cached thumbnail. */
  | 'full-image'
  | 'bypass';

export interface RequestInfo {
  url: URL;
  method: string;
  /** `Request.mode`; 'navigate' for page loads. */
  mode: string;
  /** The worker's own origin. */
  origin: string;
}

const NEVER_INTERCEPTED_PREFIXES = ['/api/', '/og/'];
const ASSET_PREFIXES = ['/_astro/', '/fonts/', '/brand/'];
const ASSET_FILES = new Set([
  '/apple-touch-icon.png',
  '/apple-touch-icon-chairs.png',
  '/manifest.webmanifest',
]);
const TILE_HOST = /(^|\.)basemaps\.cartocdn\.com$/;
const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/;

function under(pathname: string, prefix: string): boolean {
  // `/admin` itself, `/admin/...`, but not `/administrator`.
  const bare = prefix.replace(/\/$/, '');
  return pathname === bare || pathname.startsWith(`${bare}/`);
}

/** The Chairs' Area, API and auth routes, and social cards: never cached, never intercepted for content. */
export function isNeverCachedPath(pathname: string): boolean {
  return (
    under(pathname, '/admin') ||
    NEVER_INTERCEPTED_PREFIXES.some((prefix) => under(pathname, prefix)) ||
    pathname === '/api' ||
    pathname === '/og' ||
    pathname === '/sw.js'
  );
}

export function classifyRequest({ url, method, mode, origin }: RequestInfo): RouteKind {
  if (method !== 'GET') return 'bypass';

  if (url.origin !== origin) {
    if (TILE_HOST.test(url.hostname)) return 'tile';
    if (BLOB_HOST.test(url.hostname)) {
      if (url.pathname.endsWith('-thumb.webp')) return 'thumbnail';
      if (url.pathname.endsWith('-full.webp')) return 'full-image';
    }
    return 'bypass';
  }

  const { pathname } = url;
  if (under(pathname, '/admin')) return mode === 'navigate' ? 'admin-page' : 'bypass';
  if (isNeverCachedPath(pathname)) return 'bypass';
  if (ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || ASSET_FILES.has(pathname))
    return 'asset';
  return mode === 'navigate' ? 'page' : 'bypass';
}

/** `/venues/foo/` and `/venues/foo` are one page; the root stays `/`. */
export function normalisePagePath(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/$/, '') : '/';
}

/** The cache key for a page: its origin and normalised path, with no query string. */
export function pageCacheKey(url: URL): string {
  return `${url.origin}${normalisePagePath(url.pathname)}`;
}

/** The thumbnail that stands in for a full-size photo, or null when the URL is not one of ours. */
export function thumbnailFor(fullUrl: string): string | null {
  return fullUrl.endsWith('-full.webp') ? fullUrl.replace(/-full\.webp$/, '-thumb.webp') : null;
}

/** Whether a response may be written to the page cache: a plain, final, successful page. */
export function isCacheablePage(response: {
  ok: boolean;
  redirected: boolean;
  type: string;
}): boolean {
  return response.ok && !response.redirected && response.type === 'basic';
}

/**
 * Turns a build-output path into the URL the site serves it at:
 * `venues/foo/index.html` is `/venues/foo`, `index.html` is `/`. Other files keep their path.
 */
export function publishedUrl(file: string): string {
  const path = `/${file.replace(/^\/+/, '')}`;
  if (path === '/index.html') return '/';
  return path.endsWith('/index.html') ? path.slice(0, -'/index.html'.length) : path;
}
