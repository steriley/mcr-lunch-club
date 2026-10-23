/** How long to wait where the browser has no requestIdleCallback (Safari): enough for the first paint to go first. */
export const IDLE_FALLBACK_MS = 300;

/**
 * Runs `callback` once the browser is idle, or after `timeout` ms at the
 * latest, so work the first render doesn't need stays off its critical path.
 * Returns a function that cancels it.
 */
export function whenIdle(callback: () => void, timeout = 2000): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(() => callback(), { timeout });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(id);
}
