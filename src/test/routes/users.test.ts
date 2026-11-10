import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { APIError } from 'better-auth/api';
import { POST } from '@/pages/api/admin/users';
import { POST as ban } from '@/pages/api/admin/users/[id]/ban';
import { POST as unban } from '@/pages/api/admin/users/[id]/unban';
import { POST as resetPassword } from '@/pages/api/admin/users/[id]/reset-password';
import { POST as removePasskeys } from '@/pages/api/admin/users/[id]/remove-passkeys';
import { POST as passkeyGrant } from '@/pages/api/admin/account/passkey-grant';
import {
  ADMIN,
  adminRequest,
  quietly,
  renderSql,
  restoreStubs,
  run,
  signInAs,
  stubAuthApi,
  stubDb,
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
    const deletes = stubDb('delete', []);
    const response = await run(ban, ctx('u2'));
    assert.equal(response.status, 200);
    assert.equal(calls[0].body.userId, 'u2');
    assert.ok(calls[0].body.banReason);
    // Their push devices go in the same action, so a deactivated Chair stops getting notifications,
    // and so do their passkeys (#153), so reactivating them never revives a lost device's key.
    const wheres = deletes
      .filter((call) => call.method === 'where')
      .map((call) => renderSql(call.args[0]));
    assert.deepEqual(wheres[0].params, ['u2']);
    assert.ok(
      wheres.some((where) => where.sql.includes('"passkey"') && where.params.includes('u2'))
    );

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

  it('sets the password, removes their passkeys and signs another user out everywhere', async () => {
    signInAs();
    const deletes = stubDb('delete', []);
    const setPassword = stubAuthApi('setUserPassword', () => ({ status: true }));
    const revoke = stubAuthApi('revokeUserSessions', () => ({ success: true }));
    const response = await run(resetPassword, ctx('u2', password));
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(setPassword[0].body, { userId: 'u2', newPassword: password.password });
    assert.equal(revoke[0].body.userId, 'u2');
    const wheres = deletes
      .filter((call) => call.method === 'where')
      .map((call) => renderSql(call.args[0]));
    assert.ok(
      wheres.some((where) => where.sql.includes('"passkey"') && where.params.includes('u2'))
    );
  });

  it('keeps your own session when you reset your own password', async () => {
    signInAs();
    stubDb('delete', []);
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

describe('POST /api/admin/users/[id]/remove-passkeys', () => {
  it('rejects blank ids', async () => {
    signInAs();
    assert.equal((await run(removePasskeys, ctx(' '))).status, 404);
  });

  it('deletes their passkeys and signs another Chair out everywhere', async () => {
    signInAs();
    const deletes = stubDb('delete', [{ id: 'p1' }, { id: 'p2' }]);
    const revoke = stubAuthApi('revokeUserSessions', () => ({ success: true }));
    const response = await run(removePasskeys, ctx('u2'));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, removed: 2 });
    const wheres = deletes
      .filter((call) => call.method === 'where')
      .map((call) => renderSql(call.args[0]));
    assert.ok(
      wheres.some((where) => where.sql.includes('"passkey"') && where.params.includes('u2'))
    );
    assert.equal(revoke[0].body.userId, 'u2');
  });

  it('keeps your own session when you remove your own passkeys', async () => {
    signInAs();
    stubDb('delete', []);
    const revoke = stubAuthApi('revokeUserSessions', () => ({ success: true }));
    assert.equal((await run(removePasskeys, ctx(ADMIN.id))).status, 200);
    assert.equal(revoke.length, 0);
  });

  it('is for Chairs only', async () => {
    signInAs({ ...ADMIN, role: 'user' });
    assert.equal((await run(removePasskeys, ctx('u2'))).status, 403);
  });
});

describe('POST /api/admin/account/passkey-grant', () => {
  const grantRequest = (body: unknown) => ({ request: adminRequest('POST', body) });

  it('needs a password', async () => {
    signInAs();
    assert.equal((await run(passkeyGrant, grantRequest({}))).status, 400);
    assert.equal((await run(passkeyGrant, grantRequest({ password: '' }))).status, 400);
  });

  it('records a grant for the signed-in Chair when the password is right', async () => {
    signInAs();
    stubDb('select', [{ failures: 0 }]);
    const deletes = stubDb('delete', []);
    const inserts = stubDb('insert', []);
    const verify = stubAuthApi('verifyPassword', () => ({ status: true }));
    const response = await run(passkeyGrant, grantRequest({ password: 'the-right-password' }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    assert.deepEqual(verify[0].body, { password: 'the-right-password' });
    const values = inserts.find((call) => call.method === 'values')!.args[0] as {
      identifier: string;
      expiresAt: Date;
    };
    assert.equal(values.identifier, `passkey-grant:${ADMIN.id}`);
    assert.ok(values.expiresAt.getTime() > Date.now());
    // The earlier grant and any counted failures are cleared.
    assert.ok(deletes.some((call) => call.method === 'where'));
  });

  it('counts a wrong password and grants nothing', async () => {
    signInAs();
    stubDb('select', [{ failures: 0 }]);
    const inserts = stubDb('insert', []);
    stubAuthApi('verifyPassword', () => {
      throw new APIError('BAD_REQUEST', { message: 'Invalid password' });
    });
    const response = await run(passkeyGrant, grantRequest({ password: 'wrong' }));
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fields.password);
    const values = inserts.filter((call) => call.method === 'values');
    assert.equal(values.length, 1);
    assert.equal(
      (values[0].args[0] as { identifier: string }).identifier,
      `passkey-grant-failure:${ADMIN.id}`
    );
  });

  it('refuses to check after too many wrong passwords', async () => {
    signInAs();
    stubDb('select', [{ failures: 5 }]);
    const verify = stubAuthApi('verifyPassword', () => ({ status: true }));
    assert.equal((await run(passkeyGrant, grantRequest({ password: 'guess' }))).status, 429);
    assert.equal(verify.length, 0);
  });

  it('is for Chairs only', async () => {
    signInAs({ ...ADMIN, role: 'user' });
    assert.equal((await run(passkeyGrant, grantRequest({ password: 'x' }))).status, 403);
  });
});
