import '../test/setup-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { APIError } from 'better-auth/api';
import {
  authApiError,
  hasAdminRole,
  hasTrustedOrigin,
  isMutatingMethod,
  isUniqueViolation,
  jsonError,
  jsonResponse,
  readJson,
  requireAdmin,
  serverError,
  userIdParam,
  uuidParam,
  validationError,
} from './admin-api';
import { auth } from './auth';

function silenceErrors<T>(fn: () => T): T {
  const original = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = original;
  }
}

describe('responses', () => {
  it('jsonResponse is no-store and noindex', async () => {
    const response = jsonResponse({ ok: true }, 201);
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex');
    assert.deepEqual(await response.json(), { ok: true });
  });

  it('jsonError includes field errors only when given', async () => {
    assert.deepEqual(await jsonError(404, 'Nope').json(), { error: 'Nope' });
    assert.deepEqual(await jsonError(400, 'Bad', { name: 'Required' }).json(), { error: 'Bad', fields: { name: 'Required' } });
  });

  it('validationError reports the first message per field', async () => {
    const result = z.object({ name: z.string().min(2, 'Too short'), age: z.number() }).safeParse({ name: 'a', age: 'x' });
    assert.ok(!result.success);
    const response = validationError(result.error);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.fields.name, 'Too short');
    assert.ok(body.fields.age);

    const form = validationError(z.string().safeParse(1).error!);
    assert.ok((await form.json()).fields.form);
  });

  it('serverError hides details from the client but logs the message', async () => {
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => void logged.push(args);
    try {
      const response = serverError('Save', new Error('db exploded'));
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: 'Something went wrong. Please try again.' });
      serverError('Save', 'string failure');
    } finally {
      console.error = original;
    }
    assert.deepEqual(logged[0], ['[admin] Save failed:', 'db exploded']);
    assert.deepEqual(logged[1], ['[admin] Save failed:', 'Unknown error']);
  });
});

describe('roles and methods', () => {
  it('hasAdminRole reads comma separated roles', () => {
    assert.equal(hasAdminRole('admin'), true);
    assert.equal(hasAdminRole('user, admin'), true);
    assert.equal(hasAdminRole('user'), false);
    assert.equal(hasAdminRole(''), false);
    assert.equal(hasAdminRole(null), false);
    assert.equal(hasAdminRole(undefined), false);
  });

  it('isMutatingMethod ignores case', () => {
    for (const method of ['POST', 'put', 'Patch', 'DELETE']) assert.equal(isMutatingMethod(method), true);
    for (const method of ['GET', 'head', 'OPTIONS']) assert.equal(isMutatingMethod(method), false);
  });
});

describe('hasTrustedOrigin', () => {
  const request = (origin?: string) =>
    new Request('https://app.example.com/api/admin/venues', { method: 'POST', headers: origin ? { origin } : {} });

  it('accepts the request origin and the configured site origin', () => {
    assert.equal(hasTrustedOrigin(request('https://app.example.com')), true);
    assert.equal(hasTrustedOrigin(request('https://lunch.example.com')), true);
  });

  it('rejects missing, foreign and malformed origins', () => {
    assert.equal(hasTrustedOrigin(request()), false);
    assert.equal(hasTrustedOrigin(request('https://evil.example')), false);
    assert.equal(hasTrustedOrigin(request('not a url')), false);
  });
});

describe('requireAdmin', () => {
  const originalGetSession = auth.api.getSession;
  const withSession = async (session: unknown, run: () => Promise<void>) => {
    (auth.api as any).getSession = async () => session;
    try {
      await run();
    } finally {
      (auth.api as any).getSession = originalGetSession;
    }
  };
  const post = (origin?: string) =>
    new Request('https://lunch.example.com/api/admin/x', { method: 'POST', headers: origin ? { origin } : {} });

  it('blocks mutating requests from untrusted origins before checking the session', async () => {
    await withSession(null, async () => {
      const response = await requireAdmin(post('https://evil.example'));
      assert.ok(response instanceof Response);
      assert.equal(response.status, 403);
    });
  });

  it('returns 401 without a session and 403 without the admin role', async () => {
    const get = new Request('https://lunch.example.com/api/admin/x');
    await withSession(null, async () => {
      assert.equal(((await requireAdmin(get)) as Response).status, 401);
    });
    await withSession({ user: { role: 'user' } }, async () => {
      assert.equal(((await requireAdmin(get)) as Response).status, 403);
    });
  });

  it('returns the session for an admin', async () => {
    const session = { user: { id: '1', role: 'admin' } };
    await withSession(session, async () => {
      assert.equal(await requireAdmin(post('https://lunch.example.com')), session);
    });
  });
});

describe('readJson', () => {
  it('parses JSON bodies and returns null for invalid ones', async () => {
    const request = (body: string) => new Request('https://x.test', { method: 'POST', body });
    assert.deepEqual(await readJson(request('{"a":1}')), { a: 1 });
    assert.equal(await readJson(request('{oops')), null);
  });
});

describe('params', () => {
  it('uuidParam only accepts UUIDs', () => {
    assert.equal(uuidParam.safeParse('3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f').success, true);
    assert.equal(uuidParam.safeParse('abc').success, false);
  });

  it('userIdParam trims and bounds ids', () => {
    assert.equal(userIdParam.parse(' abc '), 'abc');
    assert.equal(userIdParam.safeParse('  ').success, false);
    assert.equal(userIdParam.safeParse('x'.repeat(101)).success, false);
  });
});

describe('isUniqueViolation', () => {
  it('finds the Postgres code directly or on a nested cause', () => {
    assert.equal(isUniqueViolation({ code: '23505' }), true);
    assert.equal(isUniqueViolation(new Error('wrapped', { cause: { code: '23505' } })), true);
    assert.equal(isUniqueViolation({ cause: { cause: { code: '23505' } } }), true);
  });

  it('is false for other errors and values', () => {
    assert.equal(isUniqueViolation({ code: '23503' }), false);
    assert.equal(isUniqueViolation(null), false);
    assert.equal(isUniqueViolation(undefined), false);
    assert.equal(isUniqueViolation('23505'), false);
    assert.equal(isUniqueViolation({ cause: { cause: { cause: { cause: { code: '23505' } } } } }), false);
  });
});

describe('authApiError', () => {
  it('passes client errors from Better Auth through', async () => {
    const response = authApiError('Ban', new APIError('BAD_REQUEST', { message: 'Cannot ban yourself' }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Cannot ban yourself' });
  });

  it('falls back to a default message when none is given', async () => {
    const response = authApiError('Ban', new APIError('FORBIDDEN'));
    assert.equal(response.status, 403);
    assert.ok((await response.json()).error);
  });

  it('turns server errors and unknown errors into a 500', async () => {
    silenceErrors(() => {
      assert.equal(authApiError('Ban', new APIError('INTERNAL_SERVER_ERROR', { message: 'boom' })).status, 500);
      assert.equal(authApiError('Ban', new Error('boom')).status, 500);
    });
  });
});
