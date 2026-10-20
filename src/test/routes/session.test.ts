import '../setup-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '@/pages/api/admin/session';

describe('GET /api/admin/session', () => {
  it('returns 401 without a session', async () => {
    const response = await GET({ locals: { session: null, user: null } } as any);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'Unauthorized' });
  });

  it('returns 401 when only one of session and user is set', async () => {
    assert.equal((await GET({ locals: { session: { id: 's' }, user: null } } as any)).status, 401);
    assert.equal((await GET({ locals: { session: null, user: { id: 'u' } } } as any)).status, 401);
  });

  it('returns the user and session', async () => {
    const locals = { session: { id: 's' }, user: { id: 'u' } };
    const response = await GET({ locals } as any);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { user: locals.user, session: locals.session });
  });
});
