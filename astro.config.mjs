import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [vue()],
  vite: {
    plugins: [tailwindcss()],
    // The WebP encoder loads its .wasm relative to its own module; pre-bundling breaks that path in dev.
    optimizeDeps: { exclude: ['@jsquash/webp'] }
  }
});
