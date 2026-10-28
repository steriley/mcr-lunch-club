import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { APIError } from 'better-auth/api';
import { POST } from '@/pages/api/admin/users';
import { POST as ban } from '@/pages/api/admin/users/[id]/ban';
import { POST as unban } from '@/pages/api/admin/users/[id]/unban';
import { POST as resetPassword } from '@/pages/api/admin/users/[id]/reset-password';
import {
  ADMIN,
  adminRequest,
  quietly,
  restoreStubs,
  run,
  signInAs,
  stubAuthApi,
} from '../route-helpers';

afterEach(restoreStubs);

const ctx = (id: string | undefined, body?: unknown) => ({
  request: adminRequest('POST', body),
  params: { id },
});
const newUser = { name: 'Ann', email: 'ann@example.com', password: 'a-long-enough-password' };

describe('/api/admin/users', () => {
  it('POST validates, creates (201) and maps errors', async () => {
    signInAs();
    assert.equal((await run(POST, { request: adminRequest('POST', { name: '' }) })).status, 400);

    const calls = stubAuthApi('createUser', () => ({
      user: { id: 'u2', email: 'ann@example.com' },
    }));
    const response = await run(POST, {
      request: adminRequest('POST', { ...newUser, email: 'Ann@Example.com' }),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).user.id, 'u2');
    assert.equal(calls[0].body.email, 'ann@example.com');
    assert.equal(calls[0].body.role, 'admin');

    stubAuthApi('createUser', () => {
      throw new APIError('BAD_REQUEST', { message: 'User already exists' });
    });
    const duplicate = await run(POST, { request: adminRequest('POST', newUser) });
    assert.equal(duplicate.status, 400);
    assert.equal((await duplicate.json()).error, 'User already exists');
  });
});

describe('POST /api/admin/users/[id]/ban', () => {
  it('refuses to deactivate yourself', async () => {
    signInAs();
    const response = await run(ban, ctx(ADMIN.id));
    assert.equal(response.status, 400);
  });

  it('rejects blank ids', async () => {
    signInAs();
    assert.equal((await run(ban, ctx('  '))).status, 404);
    assert.equal((await run(ban, ctx(undefined))).status, 404);
  });

  it('bans another user and maps errors', async () => {
    signInAs();
    const calls = stubAuthApi('banUser', () => ({ user: { id: 'u2', banned: true } }));
    const response = await run(ban, ctx('u2'));
    assert.equal(response.status, 200);
    assert.equal(calls[0].body.userId, 'u2');
    assert.ok(calls[0].body.banReason);

    stubAuthApi('banUser', () => {
      throw new Error('boom');
    });
    assert.equal((await quietly(() => run(ban, ctx('u2')))).status, 500);
  });
});

describe('POST /api/admin/users/[id]/unban', () => {
  it('unbans, rejects blank ids and maps errors', async () => {
    signInAs();
    assert.equal((await run(unban, ctx(' '))).status, 404);

    const calls = stubAuthApi('unbanUser', () => ({ user: { id: 'u2', banned: false } }));
    assert.equal((await run(unban, ctx('u2'))).status, 200);
    assert.equal(calls[0].body.userId, 'u2');

    stubAuthApi('unbanUser', () => {
      throw new APIError('NOT_FOUND', { message: 'User not found' });
    });
    assert.equal((await run(unban, ctx('u2'))).status, 404);
  });
});

describe('POST /api/admin/users/[id]/reset-password', () => {
  const password = { password: 'a-brand-new-password' };

  it('validates the id and password', async () => {
    signInAs();
    assert.equal((await run(resetPassword, ctx(' ', password))).status, 404);
    assert.equal((await run(resetPassword, ctx('u2', { password: 'short' }))).status, 400);
  });

  it('sets the password and signs another user out everywhere', async () => {
    signInAs();
    const setPassword = stubAuthApi('setUserPassword', () => ({ status: true }));
    const revoke = stubAuthApi('revokeUserSessions', () => ({ success: true }));
    const response = await run(resetPassword, ctx('u2', password));
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(setPassword[0].body, { userId: 'u2', newPassword: password.password });
    assert.equal(revoke[0].body.userId, 'u2');
  });

  it('keeps your own session when you reset your own password', async () => {
    signInAs();
    stubAuthApi('setUserPassword', () => ({ status: true }));
    const revoke = stubAuthApi('revokeUserSessions', () => ({ success: true }));
    assert.equal((await run(resetPassword, ctx(ADMIN.id, password))).status, 200);
    assert.equal(revoke.length, 0);
  });

  it('maps Better Auth failures', async () => {
    signInAs();
    stubAuthApi('setUserPassword', () => {
      throw new APIError('BAD_REQUEST', { message: 'Password too weak' });
    });
    assert.equal((await run(resetPassword, ctx('u2', password))).status, 400);

    stubAuthApi('setUserPassword', () => {
      throw new Error('boom');
    });
    assert.equal((await quietly(() => run(resetPassword, ctx('u2', password)))).status, 500);
  });
});
