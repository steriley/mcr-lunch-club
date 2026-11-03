import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyRequest,
  isCacheablePage,
  isNeverCachedPath,
  normalisePagePath,
  pageCacheKey,
  publishedUrl,
  thumbnailFor,
} from './routing';

const ORIGIN = 'https://mcrlunchclub.com';
const kind = (href: string, mode = 'navigate', method = 'GET') =>
  classifyRequest({ url: new URL(href, ORIGIN), method, mode, origin: ORIGIN });

describe('service worker routing', () => {
  it('never intercepts the API, auth, social cards or the worker', () => {
    for (const path of [
      '/api/weather',
      '/api/suggestions',
      '/api/auth/get-session',
      '/api/admin/venues',
      '/og/venues/foo.png',
      '/sw.js',
    ]) {
      assert.equal(kind(path, 'cors'), 'bypass', path);
      assert.equal(kind(path, 'navigate'), 'bypass', path);
      assert.ok(isNeverCachedPath(new URL(path, ORIGIN).pathname), path);
    }
  });

  it('only watches navigations into the Chairs’ Area, to show the offline page', () => {
    assert.equal(kind('/admin'), 'admin-page');
    assert.equal(kind('/admin/venues/some-id'), 'admin-page');
    assert.equal(kind('/admin/venues', 'cors'), 'bypass');
    assert.equal(kind('/admin/login'), 'admin-page');
    assert.equal(kind('/administrator'), 'page');
  });

  it('never intercepts anything but GET', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
      assert.equal(kind('/', 'navigate', method), 'bypass');
      assert.equal(kind('/api/suggestions', 'cors', method), 'bypass');
      assert.equal(kind('/admin', 'navigate', method), 'bypass');
    }
  });

  it('treats public navigations as pages and build output as assets', () => {
    assert.equal(kind('/'), 'page');
    assert.equal(kind('/venues/fat-pats'), 'page');
    assert.equal(kind('/verdicts/approved'), 'page');
    assert.equal(kind('/_astro/index.abc123.js', 'no-cors'), 'asset');
    assert.equal(kind('/fonts/plus-jakarta-sans-latin-400-normal.woff2', 'cors'), 'asset');
    assert.equal(kind('/brand/logo-96.webp', 'no-cors'), 'asset');
    assert.equal(kind('/robots.txt', 'cors'), 'bypass');
  });

  it('routes tiles and photos by host and variant, and leaves other origins alone', () => {
    const blob = 'https://abc.public.blob.vercel-storage.com/prod/venues/v1/i1';
    assert.equal(
      kind('https://a.basemaps.cartocdn.com/rastertiles/voyager/15/1/2.png', 'cors'),
      'tile'
    );
    assert.equal(kind(`${blob}-thumb.webp`, 'no-cors'), 'thumbnail');
    assert.equal(kind(`${blob}-full.webp`, 'no-cors'), 'full-image');
    assert.equal(kind('https://abc.public.blob.vercel-storage.com/other.png', 'no-cors'), 'bypass');
    assert.equal(kind('https://evil.example/x-thumb.webp', 'no-cors'), 'bypass');
    assert.equal(kind('https://basemaps.cartocdn.com.evil.example/x.png', 'cors'), 'bypass');
    assert.equal(kind('https://www.google.com/maps/search/?api=1&query=1', 'navigate'), 'bypass');
  });

  it('keys pages without a trailing slash or query string', () => {
    assert.equal(normalisePagePath('/venues/foo/'), '/venues/foo');
    assert.equal(normalisePagePath('/venues//foo'), '/venues/foo');
    assert.equal(normalisePagePath('/'), '/');
    assert.equal(pageCacheKey(new URL('/venues/foo/?utm=1#x', ORIGIN)), `${ORIGIN}/venues/foo`);
    assert.equal(
      pageCacheKey(new URL('/venues/foo', ORIGIN)),
      pageCacheKey(new URL('/venues/foo/', ORIGIN))
    );
    assert.equal(pageCacheKey(new URL('/?near_me_state=far', ORIGIN)), `${ORIGIN}/`);
  });

  it('maps build files to the URLs the site serves', () => {
    assert.equal(publishedUrl('index.html'), '/');
    assert.equal(publishedUrl('venues/fat-pats/index.html'), '/venues/fat-pats');
    assert.equal(publishedUrl('offline/index.html'), '/offline');
    assert.equal(publishedUrl('_astro/a.js'), '/_astro/a.js');
    assert.equal(publishedUrl('/manifest.webmanifest'), '/manifest.webmanifest');
  });

  it('caches only plain, final, successful pages', () => {
    assert.ok(isCacheablePage({ ok: true, redirected: false, type: 'basic' }));
    assert.ok(!isCacheablePage({ ok: true, redirected: true, type: 'basic' }));
    assert.ok(!isCacheablePage({ ok: false, redirected: false, type: 'basic' }));
    assert.ok(!isCacheablePage({ ok: true, redirected: false, type: 'opaque' }));
  });

  it('finds the thumbnail for a full-size photo', () => {
    assert.equal(
      thumbnailFor('https://x.public.blob.vercel-storage.com/a-full.webp'),
      'https://x.public.blob.vercel-storage.com/a-thumb.webp'
    );
    assert.equal(thumbnailFor('https://x.example/photo.jpg'), null);
  });
});
