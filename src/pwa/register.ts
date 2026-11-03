/**
 * Loaded by every layout. Registers the service worker (production builds only: `pnpm dev` never
 * does), follows the connection, and hands the install prompt and update notice to the page.
 */
import { startOnlineTracking } from '@/stores/online';
import { $installPrompt, $savedCopy, $updateReady, type InstallPromptEvent } from '@/stores/pwa';

startOnlineTracking();

const standalone =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// A page the worker served from its cache says so on <html> (src/sw/sw.ts).
if (document.documentElement.dataset.savedCopy === 'true') {
  $savedCopy.set({
    builtAt: document.querySelector('meta[name="mcr-built-at"]')?.getAttribute('content') ?? null,
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // no automatic pop-up: the footer control offers it
  $installPrompt.set(event as InstallPromptEvent);
});
window.addEventListener('appinstalled', () => {
  $installPrompt.set(null);
  void requestPersistence();
});

/** Asks the browser not to evict saved pages; a refusal is fine and ignored. */
async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* refused or unsupported */
  }
}

/** In the Chairs' Area an update waits for the next cold launch: never reload over a form. */
const isChairsArea = location.pathname === '/admin' || location.pathname.startsWith('/admin/');

function watchForUpdates(registration: ServiceWorkerRegistration): void {
  const announce = (worker: ServiceWorker | null) => {
    // Only when a worker already controls the page: the first install is not an "update".
    if (worker && navigator.serviceWorker.controller && !isChairsArea) $updateReady.set(worker);
  };
  announce(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'installed') announce(registration.waiting);
    });
  });
}

/** Saves every venue page while the browser is idle, so each opens offline. */
function warmVenuePagesWhenIdle(registration: ServiceWorkerRegistration): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData || !navigator.onLine) return;
  const warm = () => registration.active?.postMessage({ type: 'WARM_VENUE_PAGES' });
  if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 10_000 });
  else setTimeout(warm, 5_000);
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(async (registration) => {
        watchForUpdates(registration);
        if (standalone) void requestPersistence();
        const ready = await navigator.serviceWorker.ready;
        warmVenuePagesWhenIdle(ready);
      })
      .catch(() => {
        /* no worker (private mode, blocked): the site works online as before */
      });
  });
}

// Standalone mode has no browser back button: the shared control (StandaloneBack.astro) goes back
// in history, or to the home page when this is the first screen.
document.querySelectorAll<HTMLButtonElement>('[data-standalone-back]').forEach((button) => {
  button.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.assign('/');
  });
});
