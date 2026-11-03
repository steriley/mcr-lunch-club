/**
 * When this build ran. Every prerendered page carries it (the `mcr-built-at` meta tag), so a page
 * served from the device's cache can say how old its verdicts are (src/lib/pwa/offline-label.ts).
 * Evaluated once per build, so every page of a build agrees.
 */
export const BUILT_AT = new Date().toISOString();
