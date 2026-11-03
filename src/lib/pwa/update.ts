import { $updateReady } from '@/stores/pwa';

/** "Refresh" on the update notice: the waiting worker takes over, then the page reloads once. */
export function applyUpdate(): void {
  const worker = $updateReady.get();
  if (!worker) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
    once: true,
  });
  worker.postMessage({ type: 'SKIP_WAITING' });
}
