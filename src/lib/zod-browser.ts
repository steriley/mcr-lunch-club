import { config } from 'zod';

/**
 * Zod probes for `eval` support the first time it builds an object schema, which the
 * Content-Security-Policy reports as a violation; with `jitless` it validates the same without
 * the probe. The Chairs' Area forms build their schemas as soon as their module loads, which can
 * beat the layout's own `config()` call, so each browser-shipped schema module imports this
 * first (imports run before the importer's body). The server keeps Zod's compiled parsers.
 */
if (typeof window !== 'undefined') config({ jitless: true });
