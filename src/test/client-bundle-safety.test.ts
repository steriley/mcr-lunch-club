import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Islands are bundled for the browser, so nothing they import (directly or
 * transitively) may read server secrets such as ORS_API_KEY. This walks the
 * import graph of every island and of the client stores.
 */

const ROOT = path.resolve('src');
const SERVER_ONLY = ['lib/ors.ts', 'lib/env.ts', 'lib/walking-route.ts', 'lib/db.ts', 'lib/auth.ts'].map((file) => path.join(ROOT, file));

function filesUnder(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full, pattern);
    return pattern.test(entry.name) ? [full] : [];
  });
}

function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = path.join(ROOT, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(from), specifier);
  else return null; // a package
  for (const candidate of [base, `${base}.ts`, `${base}.vue`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate) && !candidate.endsWith(path.sep) && /\.(ts|vue|json)$/.test(candidate)) return candidate;
  }
  return null;
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const specifiers = [...source.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? match[2] ?? match[3]
  );
  return specifiers.map((specifier) => resolveImport(file, specifier)).filter((value): value is string => value !== null);
}

function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.endsWith('.json')) continue;
    queue.push(...importsOf(file));
  }
  return seen;
}

describe('client bundle safety', () => {
  const entries = [...filesUnder(path.join(ROOT, 'components'), /\.vue$/), ...filesUnder(path.join(ROOT, 'stores'), /^(?!.*\.test\.ts$).*\.ts$/)];

  it('finds the islands to check', () => {
    assert.ok(entries.some((file) => file.endsWith('VenueForm.vue')));
  });

  for (const entry of entries) {
    it(`${path.relative(ROOT, entry)} never imports server-only modules`, () => {
      const graph = reachable(entry);
      for (const serverOnly of SERVER_ONLY) {
        assert.ok(!graph.has(serverOnly), `${path.relative(ROOT, entry)} reaches ${path.relative(ROOT, serverOnly)}`);
      }
    });
  }

  it('no client code mentions the ORS key', () => {
    for (const entry of entries) {
      for (const file of reachable(entry)) {
        assert.ok(!readFileSync(file, 'utf8').includes('ORS_API_KEY'), `${path.relative(ROOT, file)} mentions ORS_API_KEY`);
      }
    }
  });
});
