import '../setup-env';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PATCH } from '@/pages/api/member/profile';
import { GET as SESSION } from '@/pages/api/member/session';
import { DELETE } from '@/pages/api/member/account';
import { GET as EXPORT } from '@/pages/api/member/export';
import { POST as BAN } from '@/pages/api/admin/members/[id]/ban';
import { POST as HIDE_NAME } from '@/pages/api/admin/members/[id]/hide-name';
import { memberAccounts, type MemberSummary } from '@/lib/members/profiles';
import { ADMIN, adminRequest, restoreStubs, run, signInAs, stubAuthApi } from '../route-helpers';

/** The member API (/api/member/**) and the Chairs' member routes (#136, PR c). */

const MEMBER = { id: 'member-1', email: 'sam@example.com', role: 'user' };
const savedFlag = process.env.MEMBERS_FLAG;

beforeEach(() => {
  process.env.MEMBERS_FLAG = 'on';
});

afterEach(() => {
  restoreStubs();
  if (savedFlag === undefined) delete process.env.MEMBERS_FLAG;
  else process.env.MEMBERS_FLAG = savedFlag;
});

/** A member's session, signed in `ageMs` ago. */
function signInMember(ageMs = 60_000, user: Record<string, unknown> = MEMBER) {
  stubAuthApi('getSession', () => ({
    user,
    session: { id: 's1', createdAt: new Date(Date.now() - ageMs) },
  }));
}

const memberRequest = (method: string, body?: unknown, origin?: string | null) => ({
  request: adminRequest(method, body, { origin, path: '/api/member/x' }),
});

const clearsHint = (response: Response) =>
  response.headers.getSetCookie().some((cookie) => /^signed_in=;.*Max-Age=0/.test(cookie));

const SUMMARY: MemberSummary = {
  id: 'member-1',
  displayName: 'Rude Name',
  nameHidden: true,
  nameLocked: false,
  banned: false,
  joinedAt: '2026-11-01T00:00:00.000Z',
};

describe('PATCH /api/member/profile', () => {
  it('saves the parsed update for the signed-in member', async () => {
    signInMember();
    const update = mock.method(memberAccounts, 'updateProfile', async () => ({
      ok: true as const,
      value: { displayName: 'Pie Inspector' },
    }));
    const response = await run(
      PATCH,
      memberRequest('PATCH', { displayName: '  Pie   Inspector ', showPublicly: true })
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const [, userId, body] = update.mock.calls[0].arguments;
    assert.equal(userId, 'member-1');
    assert.deepEqual(body, { displayName: 'Pie Inspector', showPublicly: true });
  });

  it('maps a taken or offensive name to the name field', async () => {
    signInMember();
    for (const [error, status] of [
      ['name_taken', 409],
      ['name_offensive', 400],
    ] as const) {
      mock.method(memberAccounts, 'updateProfile', async () => ({ ok: false as const, error }));
      const response = await run(PATCH, memberRequest('PATCH', { displayName: 'Some Name' }));
      assert.equal(response.status, status);
      assert.ok((await response.json()).fields.displayName);
      mock.restoreAll();
    }
  });

  it('refuses a malformed name before it reaches the database', async () => {
    signInMember();
    const update = mock.method(memberAccounts, 'updateProfile', async () => ({ ok: true }));
    for (const displayName of ['x', 'a'.repeat(31), '<script>', '1234']) {
      const response = await run(PATCH, memberRequest('PATCH', { displayName }));
      assert.equal(response.status, 400, displayName);
    }
    assert.equal((await run(PATCH, memberRequest('PATCH', {}))).status, 400);
    assert.equal(update.mock.callCount(), 0);
  });

  it('refuses the flag off, signed out, Chairs, banned members and foreign origins', async () => {
    const update = mock.method(memberAccounts, 'updateProfile', async () => ({ ok: true }));
    const call = (origin?: string) =>
      run(PATCH, memberRequest('PATCH', { showPublicly: true }, origin));

    signInMember();
    process.env.MEMBERS_FLAG = 'off';
    assert.equal((await call()).status, 404);
    process.env.MEMBERS_FLAG = 'on';

    signInAs(null);
    const signedOut = await call();
    assert.equal(signedOut.status, 401);
    assert.ok(clearsHint(signedOut), 'a stale signed_in hint is cleared');

    signInAs(ADMIN);
    assert.equal((await call()).status, 403);
    signInMember(60_000, { ...MEMBER, banned: true });
    assert.equal((await call()).status, 403);
    signInMember();
    assert.equal((await call('https://evil.example')).status, 403);
    assert.equal(update.mock.callCount(), 0);
  });
});

describe('GET /api/member/session', () => {
  it('says who is signed in, for the header', async () => {
    signInMember();
    mock.method(memberAccounts, 'getProfile', async () => ({ displayName: 'Pie Inspector' }));
    assert.deepEqual(await (await run(SESSION, memberRequest('GET'))).json(), {
      state: 'member',
      displayName: 'Pie Inspector',
    });

    signInAs(ADMIN);
    assert.deepEqual(await (await run(SESSION, memberRequest('GET'))).json(), { state: 'chair' });
  });

  it('clears a signed_in hint that outlived its session', async () => {
    signInAs(null);
    const response = await run(SESSION, memberRequest('GET'));
    assert.deepEqual(await response.json(), { state: 'signed_out' });
    assert.ok(clearsHint(response));

    signInMember(60_000, { ...MEMBER, banned: true });
    assert.ok(clearsHint(await run(SESSION, memberRequest('GET'))));
  });

  it('answers 404 with the flag off', async () => {
    process.env.MEMBERS_FLAG = 'off';
    assert.equal((await run(SESSION, memberRequest('GET'))).status, 404);
  });
});

describe('DELETE /api/member/account', () => {
  it('needs a sign-in in the last few minutes', async () => {
    signInMember(60 * 60 * 1000);
    const remove = mock.method(memberAccounts, 'delete', async () => ({ ok: true }));
    const response = await run(DELETE, memberRequest('DELETE', { confirm: 'delete' }));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).fields.form, 'fresh_sign_in_required');
    assert.equal(remove.mock.callCount(), 0);
  });

  it('needs the confirmation word', async () => {
    signInMember();
    const remove = mock.method(memberAccounts, 'delete', async () => ({ ok: true }));
    assert.equal((await run(DELETE, memberRequest('DELETE', {}))).status, 400);
    assert.equal(remove.mock.callCount(), 0);
  });

  it('deletes the account and signs the browser out', async () => {
    signInMember();
    const remove = mock.method(memberAccounts, 'delete', async () => ({
      ok: true as const,
      value: { deleted: true as const },
    }));
    stubAuthApi('signOut', () => ({
      headers: new Headers({ 'set-cookie': 'better-auth.session_token=; Max-Age=0; Path=/' }),
    }));
    const response = await run(DELETE, memberRequest('DELETE', { confirm: 'delete' }));
    assert.equal(response.status, 200);
    assert.equal(remove.mock.calls[0].arguments[1], 'member-1');
    const cookies = response.headers.getSetCookie();
    assert.ok(cookies.some((cookie) => cookie.startsWith('better-auth.session_token=;')));
    assert.ok(clearsHint(response));
  });
});

describe('GET /api/member/export', () => {
  it('downloads the member’s data as a JSON file that is never cached', async () => {
    signInMember();
    mock.method(memberAccounts, 'exportData', async () => ({ account: { email: MEMBER.email } }));
    const response = await run(EXPORT, memberRequest('GET'));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition') ?? '', /^attachment;/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).account.email, MEMBER.email);
  });
});

describe('the Chairs’ member routes', () => {
  const adminCall = (route: Function, id = 'member-1') =>
    run(route, {
      request: adminRequest('POST', {}),
      params: { id },
      url: new URL('https://lunch.example.com/api/admin/members/x'),
    });

  it('bans a member through Better Auth and logs it', async () => {
    signInAs();
    mock.method(memberAccounts, 'find', async () => SUMMARY);
    const banned = stubAuthApi('banUser', () => ({}));
    const logged = mock.method(memberAccounts, 'recordEvent', async () => undefined);
    const response = await adminCall(BAN);
    assert.equal(response.status, 200);
    assert.equal(banned[0].body.userId, 'member-1');
    assert.deepEqual(logged.mock.calls[0].arguments[1], {
      memberId: 'member-1',
      actorId: ADMIN.id,
      action: 'banned',
    });
  });

  it('answers 404 for a Chair’s account, and touches nothing', async () => {
    signInAs();
    mock.method(memberAccounts, 'find', async () => null);
    const banned = stubAuthApi('banUser', () => ({}));
    const logged = mock.method(memberAccounts, 'recordEvent', async () => undefined);
    const response = await adminCall(BAN, ADMIN.id);
    assert.equal(response.status, 404);
    assert.equal(banned.length, 0);
    assert.equal(logged.mock.callCount(), 0);
  });

  it('hides a name as the signed-in Chair and maps refusals', async () => {
    signInAs();
    const hide = mock.method(memberAccounts, 'hideName', async () => ({
      ok: true as const,
      value: SUMMARY,
    }));
    const response = await adminCall(HIDE_NAME);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).nameHidden, true);
    assert.deepEqual(hide.mock.calls[0].arguments[1], { memberId: 'member-1', actorId: ADMIN.id });

    mock.method(memberAccounts, 'hideName', async () => ({
      ok: false as const,
      error: 'name_already_hidden',
    }));
    assert.equal((await adminCall(HIDE_NAME)).status, 409);
  });
});
