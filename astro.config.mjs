import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import vue from '@astrojs/vue';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Canonical and social-card URLs, and the sitemap, are absolute on this origin.
  site: 'https://mcrlunchclub.com',
  output: 'server',
  adapter: vercel(),
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
