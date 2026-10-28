import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import vue from '@astrojs/vue';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { THEME_SCRIPT_HASH } from './src/lib/theme-script';

export default defineConfig({
  // Canonical and social-card URLs, and the sitemap, are absolute on this origin.
  site: 'https://mcrlunchclub.com',
  output: 'server',
  // The verdict pages used to live under /tiers: keep old links and bookmarks working.
  redirects: {
    '/tiers': { status: 301, destination: '/verdicts/approved' },
    '/tiers/[tier]': { status: 301, destination: '/verdicts/[tier]' },
  },
  adapter: vercel(),
  // No Markdown pages; turning Shiki off also keeps its inline styles away from the CSP below.
  markdown: { syntaxHighlight: false },
  // A Content-Security-Policy on every page (a <meta> tag when prerendered, a header on demand):
  // Astro hashes the scripts and styles it emits, so only those run. vercel.json keeps
  // frame-ancestors, which a <meta> policy cannot set.
  // The Chairs' Area adds 'wasm-unsafe-eval' for the WebP encoder (AdminLayout.astro).
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        // CARTO map tiles and venue photos on Vercel Blob.
        "img-src 'self' data: blob: https://*.basemaps.cartocdn.com https://*.public.blob.vercel-storage.com",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
      // The theme script is inline (ThemeScript.astro); see src/lib/theme-script.ts.
      scriptDirective: { hashes: [THEME_SCRIPT_HASH] },
      styleDirective: {
        resources: [
          // Scoped to elements: a bare 'self' next to the attribute entry makes Astro warn that
          // it won't apply to style-src-attr. Element styles stay 'self' plus hashes.
          { resource: "'self'", kind: 'element' },
          // Vue renders inline style attributes (tier colours, photo focal points).
          { resource: "'unsafe-inline'", kind: 'attribute' },
        ],
      },
    },
  },
  // Lists the prerendered public pages; the Chairs' Area renders on demand, so it never appears.
  // URLs drop the trailing slash to match the site's links and canonical tags.
  integrations: [
    vue(),
    sitemap({
      filter: (page) => !page.includes('/admin'),
      serialize: (item) => {
        const url = new URL(item.url);
        if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/$/, '');
        return { ...item, url: url.href };
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    // The WebP encoder loads its .wasm relative to its own module; pre-bundling breaks that path in dev.
    optimizeDeps: { exclude: ['@jsquash/webp'] }
  }
});
