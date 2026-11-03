/// <reference lib="webworker" />
/**
 * The service worker. scripts/build-sw.ts bundles it and fills in the precache list from the real
 * build output, then writes it to /sw.js. Public pages work offline; the Chairs' Area, the API and
 * auth are never cached, and nothing is ever queued for later: a write that cannot reach the server
 * simply fails (the rules are in src/lib/pwa/routing.ts).
 *
 * Remove a bad worker with `pnpm pwa:kill-switch` (README, "Offline mode").
 */
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';
import { matchPrecache, precache, cleanupOutdatedCaches } from 'workbox-precaching';
import { cacheNames, setCacheNameDetails } from 'workbox-core';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import type { WorkboxPlugin } from 'workbox-core';
import {
  classifyRequest,
  isCacheablePage,
  normalisePagePath,
  pageCacheKey,
  thumbnailFor,
} from '@/lib/pwa/routing';

declare const self: ServiceWorkerGlobalScope;

/** Bump to drop every cache this worker wrote. Old `mcr-*` caches are deleted when a worker activates. */
const VERSION = 'v1';
const PREFIX = `mcr-${VERSION}`;
setCacheNameDetails({ prefix: PREFIX, precache: 'precache', runtime: 'runtime' });

const CACHES = {
  pages: `${PREFIX}-pages`,
  thumbnails: `${PREFIX}-thumbnails`,
  tiles: `${PREFIX}-tiles`,
};

const OFFLINE_PAGE = '/offline';
const CHAIRS_OFFLINE_PAGE = '/chairs-offline';
/** How long a page may take before a saved copy is shown instead (the fetch carries on in the background). */
const PAGE_TIMEOUT_SECONDS = 3;
const DAY = 24 * 60 * 60;

/** Filled in by scripts/build-sw.ts from .vercel/output/static/venues. */
declare const __VENUE_PAGES__: string[];

precache(self.__WB_MANIFEST);
cleanupOutdatedCaches();

/** Marks a saved copy, so the page can show the "Offline · verdicts as of …" banner. */
async function markAsSavedCopy(response: Response): Promise<Response> {
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('text/html')) return response;
  const html = await response.clone().text();
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(html.replace(/<html(?=[\s>])/i, '<html data-saved-copy="true"'), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** A response the browser will accept for a navigation: Safari rejects one that is `redirected`. */
async function freshResponse(response: Response): Promise<Response> {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

const pagePlugins: WorkboxPlugin[] = [
  {
    // `/venues/foo` and `/venues/foo/` are one entry; the query string never keys a page.
    cacheKeyWillBeUsed: async ({ request }) => pageCacheKey(new URL(request.url)),
    cacheWillUpdate: async ({ response }) => (isCacheablePage(response) ? response : null),
    cachedResponseWillBeUsed: async ({ cachedResponse }) =>
      cachedResponse ? markAsSavedCopy(cachedResponse) : null,
  },
  new ExpirationPlugin({ maxEntries: 200, purgeOnQuotaError: true }),
];

const pages = new NetworkFirst({
  cacheName: CACHES.pages,
  networkTimeoutSeconds: PAGE_TIMEOUT_SECONDS,
  plugins: pagePlugins,
});

const thumbnails = new CacheFirst({
  cacheName: CACHES.thumbnails,
  plugins: [
    new CacheableResponsePlugin({ statuses: [200] }),
    new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true }),
  ],
});

const tiles = new CacheFirst({
  cacheName: CACHES.tiles,
  plugins: [
    // The tile layer asks with CORS (crossOrigin: true), so a tile is a real 200, not an opaque
    // response that Chromium would count as several MB against the quota.
    new CacheableResponsePlugin({ statuses: [200] }),
    new ExpirationPlugin({ maxEntries: 2000, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true }),
  ],
});

async function precached(path: string): Promise<Response | undefined> {
  const response = await matchPrecache(path);
  return response ? markAsSavedCopy(response) : undefined;
}

async function handlePage(event: FetchEvent): Promise<Response> {
  const url = new URL(event.request.url);
  try {
    return await freshResponse(await pages.handle({ event, request: event.request }));
  } catch {
    // Offline with nothing saved from a visit: the build's own copy of the shell pages, else /offline.
    return (
      (await precached(normalisePagePath(url.pathname))) ??
      (await precached(OFFLINE_PAGE)) ??
      Response.error()
    );
  }
}

async function handleAdminPage(event: FetchEvent): Promise<Response> {
  try {
    return await fetch(event.request);
  } catch {
    // A static page with no admin data in it; the real admin page is never stored.
    return (await precached(CHAIRS_OFFLINE_PAGE)) ?? Response.error();
  }
}

/** Asks for a photo or tile with CORS, so the stored copy is a real response rather than an opaque one. */
function asCors(request: Request): Request {
  return request.mode === 'cors'
    ? request
    : new Request(request.url, { mode: 'cors', credentials: 'omit' });
}

async function handleFullImage(event: FetchEvent): Promise<Response> {
  try {
    return await fetch(event.request);
  } catch (error) {
    const thumb = thumbnailFor(event.request.url);
    const saved = thumb ? await (await caches.open(CACHES.thumbnails)).match(thumb) : undefined;
    if (saved) return saved;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const kind = classifyRequest({
    url: new URL(request.url),
    method: request.method,
    mode: request.mode,
    origin: self.location.origin,
  });

  switch (kind) {
    case 'asset':
      event.respondWith(matchPrecache(request.url).then((hit) => hit ?? fetch(request)));
      break;
    case 'page':
      event.respondWith(handlePage(event));
      break;
    case 'admin-page':
      event.respondWith(handleAdminPage(event));
      break;
    case 'thumbnail':
      event.respondWith(thumbnails.handle({ event, request: asCors(request) }));
      break;
    case 'tile':
      event.respondWith(tiles.handle({ event, request: asCors(request) }));
      break;
    case 'full-image':
      event.respondWith(handleFullImage(event));
      break;
    default:
      // Not intercepted: the browser handles it as if there were no worker.
      break;
  }
});

self.addEventListener('activate', (event) => {
  const keep = new Set<string>([...Object.values(CACHES), cacheNames.precache, cacheNames.runtime]);
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('mcr-') && !keep.has(name)) await caches.delete(name);
      }
      // A first install takes charge at once, so the visit that installed it is already covered.
      // An update only reaches here after "Refresh" or a cold launch, when no page is mid-session.
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string } | null;
  // The page shows "New verdicts published · Refresh" and sends this when it is pressed.
  if (data?.type === 'SKIP_WAITING') void self.skipWaiting();
  // Idle warm-up after install: save every venue page so any of them opens offline.
  if (data?.type === 'WARM_VENUE_PAGES') event.waitUntil(warmVenuePages());
});

async function warmVenuePages(): Promise<void> {
  const cache = await caches.open(CACHES.pages);
  for (const path of __VENUE_PAGES__) {
    const key = `${self.location.origin}${path}`;
    if (await cache.match(key)) continue;
    try {
      const response = await fetch(path, { credentials: 'same-origin' });
      if (isCacheablePage(response)) await cache.put(key, response);
    } catch {
      return; // Connection lost: stop quietly, the next visit warms the rest.
    }
  }
}
