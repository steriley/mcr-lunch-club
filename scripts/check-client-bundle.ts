/**
 * Run after `pnpm build`: fails if the browser bundle contains a server secret
 * (the ORS key or the Vercel Blob read-write token: their variable names, or
 * their values when set locally), calls OpenRouteService directly, or contains
 * the social-card renderer (satori, resvg, the WOFF2 decoder). Only the server
 * may talk to ORS or write to Blob, and cards are drawn at build time.
 *
 *   pnpm build && pnpm check:bundle
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { getBlobToken, getOrsApiKey } from '@/lib/env';

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

const needles = ['ORS_API_KEY', 'api.openrouteservice.org', 'BLOB_READ_WRITE_TOKEN', '@resvg/resvg-js', 'wawoff2', 'Unsupported OpenType signature'];
const secrets = new Map<string, string>();
for (const [name, value] of [['ORS_API_KEY', getOrsApiKey()], ['BLOB_READ_WRITE_TOKEN', getBlobToken()]] as const) {
  if (value) {
    needles.push(value);
    secrets.set(value, name);
  }
}

const problems: string[] = [];
let scanned = 0;
for (const dir of CLIENT_DIRS) {
  for (const file of files(dir)) {
    scanned += 1;
    const text = readFileSync(file, 'utf8');
    for (const needle of needles) {
      if (text.includes(needle)) problems.push(`${file} contains ${secrets.has(needle) ? `the ${secrets.get(needle)} value` : needle}`);
    }
  }
}

if (problems.length) {
  console.error(`Client bundle check failed:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  process.exit(1);
}
console.log(`Client bundle check passed (${scanned} files${secrets.size ? `, including the ${[...secrets.values()].join(' and ')} value${secrets.size > 1 ? 's' : ''}` : ''}).`);
