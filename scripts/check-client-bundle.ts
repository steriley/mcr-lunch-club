/**
 * Run after `pnpm build`: fails if the browser bundle contains the ORS key
 * (its variable name, or its value when ORS_API_KEY is set locally) or calls
 * OpenRouteService directly. Only the server may talk to ORS.
 *
 *   pnpm build && pnpm check:bundle
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { getOrsApiKey } from '@/lib/env';

const CLIENT_DIRS = ['.vercel/output/static', 'dist/client'].filter((dir) => existsSync(dir));

if (!CLIENT_DIRS.length) {
  console.error('No client build output found. Run `pnpm build` first.');
  process.exit(1);
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : /\.(js|mjs|html|css|json|map)$/.test(entry.name) ? [full] : [];
  });
}

const needles = ['ORS_API_KEY', 'api.openrouteservice.org'];
const key = getOrsApiKey();
if (key) needles.push(key);

const problems: string[] = [];
let scanned = 0;
for (const dir of CLIENT_DIRS) {
  for (const file of files(dir)) {
    scanned += 1;
    const text = readFileSync(file, 'utf8');
    for (const needle of needles) {
      if (text.includes(needle)) problems.push(`${file} contains ${needle === key ? 'the ORS_API_KEY value' : needle}`);
    }
  }
}

if (problems.length) {
  console.error(`Client bundle check failed:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log(`Client bundle check passed (${scanned} files${key ? ', including the key value' : ''}).`);
