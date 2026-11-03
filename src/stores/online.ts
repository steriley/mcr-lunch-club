import { atom } from 'nanostores';

/**
 * Whether the device thinks it has a connection. `navigator.onLine === true` only means "maybe
 * online": the real signal for a request is that it failed (see src/lib/api-fetch.ts), so
 * nothing here queues or retries anything.
 */
export const $online = atom(true);

let tracking = false;

/** Follows `navigator.onLine` and the window's online/offline events. Safe to call more than once. */
export function startOnlineTracking(): void {
  if (tracking || typeof window === 'undefined') return;
  tracking = true;
  const sync = () => $online.set(navigator.onLine !== false);
  sync();
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
}
