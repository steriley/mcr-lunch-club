/**
 * A replacement /sw.js that deletes every cache and unregisters itself, for when a bad worker gets
 * stuck in people's browsers. Browsers re-check /sw.js (served with Cache-Control: no-cache), so
 * each visitor picks it up on their next visit. See README, "Offline mode".
 */
export const KILL_SWITCH_WORKER = `// MCR Lunch Club kill switch: clears every cache and removes this service worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) await caches.delete(name);
      await self.registration.unregister();
      for (const client of await self.clients.matchAll({ type: 'window' })) {
        client.navigate(client.url);
      }
    })()
  );
});
`;
