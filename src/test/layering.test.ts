import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { runtimeImports } from './imports';

/**
 * Domain modules in src/lib must not import the HTTP module (admin-api) or
 * auth: those load Better Auth and open the runtime database pool on import,
 * which scripts and domain code should not pay for. Shared helpers they need
 * live in dependency-free modules (roles.ts, db-errors.ts).
 */

const LIB = path.resolve('src/lib');
const HTTP_ONLY = ['@/lib/admin-api', '@/lib/auth'];
const ALLOWED = new Set(['admin-api.ts', 'auth.ts']);

function libModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return libModules(full);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

describe('layering', () => {
  it('domain modules never import admin-api or auth', () => {
    for (const file of libModules(LIB)) {
      if (ALLOWED.has(path.relative(LIB, file))) continue;
      const imports = runtimeImports(readFileSync(file, 'utf8'));
      for (const forbidden of HTTP_ONLY) {
        assert.ok(!imports.includes(forbidden), `${path.relative(LIB, file)} imports ${forbidden}`);
      }
    }
  });
});
