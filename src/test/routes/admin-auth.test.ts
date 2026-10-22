import '../setup-env';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, VENUE_ID, adminRequest, restoreStubs, run, signInAs } from '../route-helpers';

afterEach(restoreStubs);

/**
 * Every admin API handler, discovered from src/pages/api/admin so new routes
 * are covered. session.ts is left out: it reads the middleware's locals and
 * has its own tests.
 */
const ROOT = path.resolve('src/pages/api/admin');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const routeFiles = (fs.readdirSync(ROOT, { recursive: true }) as string[])
  .filter((file) => file.endsWith('.ts') && file !== 'session.ts')
  .sort();

describe('every admin API handler', () => {
  it('finds the routes', () => {
    assert.ok(routeFiles.length > 15, routeFiles.join(', '));
  });

  for (const file of routeFiles) {
    it(`${file} refuses anonymous, non-admin, banned and cross-origin requests`, async () => {
      const route = await import(pathToFileURL(path.join(ROOT, file)).href);
      const handlers = METHODS.filter((method) => typeof route[method] === 'function');
      assert.ok(handlers.length, 'exports at least one handler');

      for (const method of handlers) {
        const call = (origin?: string) =>
          run(route[method], {
            request: adminRequest(method, method === 'GET' ? undefined : {}, { origin }),
            params: { id: VENUE_ID, imageId: VENUE_ID },
            url: new URL('https://lunch.example.com/api/admin/x'),
          });
        signInAs(null);
        assert.equal((await call()).status, 401, `${method} anonymous`);
        signInAs({ id: 'u', role: 'user' });
        assert.equal((await call()).status, 403, `${method} non-admin`);
        signInAs({ ...ADMIN, banned: true });
        assert.equal((await call()).status, 403, `${method} banned admin`);
        if (method !== 'GET') {
          signInAs();
          assert.equal((await call('https://evil.example')).status, 403, `${method} foreign origin`);
        }
      }
    });
  }
});
