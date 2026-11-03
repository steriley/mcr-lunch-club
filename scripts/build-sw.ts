/**
 * Writes the service worker into the build output, after `astro build`:
 *
 *   pnpm build        (runs this last)
 *   pnpm pwa:build    (this alone, over an existing build)
 *
 * The worker's precache list is read from .vercel/output/static, so the URLs and revisions match
 * exactly what Vercel serves. Vite PWA's Astro plugin does not cover Astro 7 with the Vercel adapter
 * (prerendered pages land in .vercel/output/static, after its hooks have run), so this bundles
 * src/sw/sw.ts with esbuild and lets Workbox's injectManifest fill in the list.
 *
 * Venue pages are not precached (there are ~90): they are saved as they are visited, and
 * the page asks the worker to save the rest while idle.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { injectManifest } from 'workbox-build';
import { publishedUrl } from '@/lib/pwa/routing';
import { KILL_SWITCH_WORKER } from '@/sw/kill-switch';

const staticDir = path.resolve('.vercel/output/static');
if (!existsSync(staticDir)) {
  console.error('No build output found. Run `pnpm build` first.');
  process.exit(1);
}

// PWA_KILL_SWITCH=1 ships a worker that clears every cache and removes itself (README, "Offline mode").
if (process.env.PWA_KILL_SWITCH === '1') {
  writeFileSync(path.join(staticDir, 'sw.js'), KILL_SWITCH_WORKER);
  console.log('[pwa] PWA_KILL_SWITCH is set: wrote the kill-switch worker instead of sw.js.');
  process.exit(0);
}

/** Pages every visitor needs: precached, so the app opens offline straight after install. */
const SHELL_PAGES = [
  'index.html',
  'verdicts/*/index.html',
  'inspections/index.html',
  'hall-of-shame/index.html',
  'manifesto/index.html',
  'faqs/index.html',
  'offline/index.html',
  'chairs-offline/index.html',
];

const venueDir = path.join(staticDir, 'venues');
const venuePages = existsSync(venueDir)
  ? readdirSync(venueDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `/venues/${entry.name}`)
      .sort()
  : [];

const scratch = path.resolve('.vercel/sw-build');
rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });
const bundled = path.join(scratch, 'sw.js');

await build({
  entryPoints: ['src/sw/sw.ts'],
  outfile: bundled,
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  tsconfig: 'tsconfig.json',
  define: {
    __VENUE_PAGES__: JSON.stringify(venuePages),
    'process.env.NODE_ENV': '"production"',
  },
  logLevel: 'warning',
});

const result = await injectManifest({
  swSrc: bundled,
  swDest: path.join(staticDir, 'sw.js'),
  globDirectory: staticDir,
  globPatterns: [
    '_astro/**/*.{js,css,woff2}',
    'fonts/*.woff2',
    'brand/*.{png,webp,svg}',
    'apple-touch-icon*.png',
    'manifest.webmanifest',
    'chairs.webmanifest',
    ...SHELL_PAGES,
  ],
  // Final URLs only: `venues/foo/index.html` is served at `/venues/foo`.
  manifestTransforms: [
    (entries) => ({
      manifest: entries.map((entry) => ({ ...entry, url: publishedUrl(entry.url) })),
    }),
  ],
  maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
});

rmSync(scratch, { recursive: true, force: true });
for (const warning of result.warnings) console.warn(`[pwa] ${warning}`);
console.log(
  `[pwa] sw.js written: ${result.count} files precached (${(result.size / 1024).toFixed(0)} KiB), ` +
    `${venuePages.length} venue pages saved as visited or while idle.`
);
