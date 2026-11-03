/**
 * Replaces the built /sw.js with a worker that deletes every cache and unregisters itself:
 *
 *   pnpm pwa:kill-switch      over an existing build (.vercel/output/static/sw.js)
 *
 * To ship it from Vercel, set PWA_KILL_SWITCH=1 on the project and redeploy: the build then writes
 * this worker instead of the real one (scripts/build-sw.ts). See README, "Offline mode".
 */
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { KILL_SWITCH_WORKER } from '@/sw/kill-switch';

const staticDir = path.resolve('.vercel/output/static');
if (!existsSync(staticDir)) {
  console.error('No build output found. Run `pnpm build` first.');
  process.exit(1);
}
writeFileSync(path.join(staticDir, 'sw.js'), KILL_SWITCH_WORKER);
console.log('[pwa] kill-switch worker written to .vercel/output/static/sw.js');
