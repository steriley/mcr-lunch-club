import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { apiFetch, failureText } from './api-fetch';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url, init);
  }) as typeof fetch;
  return calls;
}

describe('apiFetch', () => {
  it('sends JSON bodies with a content type, and returns the parsed data', async () => {
    const calls = stubFetch(() => Response.json({ venue: { id: 'v1' } }));
    const result = await apiFetch('/api/admin/venues', {
      method: 'POST',
      body: { name: 'Pie' },
      fallback: 'x',
    });
    assert.deepEqual(result, { ok: true, data: { venue: { id: 'v1' } } });
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.body, '{"name":"Pie"}');
    assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'application/json' });
  });

  it('sends FormData as-is and no body without headers', async () => {
    const calls = stubFetch(() => Response.json({}));
    const form = new FormData();
    await apiFetch('/a', { method: 'POST', body: form, fallback: 'x' });
    await apiFetch('/b', { method: 'DELETE', fallback: 'x' });
    assert.equal(calls[0].init.body, form);
    assert.equal(calls[0].init.headers, undefined);
    assert.equal(calls[1].init.body, undefined);
    assert.equal(calls[1].init.headers, undefined);
  });

  it("returns the server's error and field messages", async () => {
    stubFetch(() =>
      Response.json(
        { error: 'Please correct the highlighted fields.', fields: { slug: 'Taken.' } },
        { status: 400 }
      )
    );
    assert.deepEqual(
      await apiFetch('/a', { method: 'PUT', body: {}, fallback: 'Could not save.' }),
      {
        ok: false,
        error: 'Please correct the highlighted fields.',
        fields: { slug: 'Taken.' },
      }
    );
  });

  it('falls back when the server gives no message or an unreadable body', async () => {
    stubFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    assert.deepEqual(await apiFetch('/a', { fallback: 'Could not save.' }), {
      ok: false,
      error: 'Could not save.',
      fields: {},
    });
    stubFetch(() => Response.json({ error: '' }, { status: 500 }));
    assert.equal(
      ((await apiFetch('/a', { fallback: 'Could not save.' })) as { error: string }).error,
      'Could not save.'
    );
  });

  it('uses the offline message when the request never gets an answer', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    assert.deepEqual(
      await apiFetch('/a', { fallback: 'Could not save.', offline: 'Check your connection.' }),
      {
        ok: false,
        error: 'Check your connection.',
        fields: {},
      }
    );
    assert.equal(
      ((await apiFetch('/a', { fallback: 'Could not save.' })) as { error: string }).error,
      'Could not save.'
    );
  });

  it('rethrows aborts so callers can ignore superseded requests', async () => {
    stubFetch(() => {
      throw new DOMException('Aborted', 'AbortError');
    });
    await assert.rejects(apiFetch('/a', { fallback: 'x' }), { name: 'AbortError' });
  });
});

describe('failureText', () => {
  it('joins field messages, else uses the error', () => {
    assert.equal(failureText({ error: 'Bad.', fields: { a: 'One.', b: 'Two.' } }), 'One. Two.');
    assert.equal(failureText({ error: 'Bad.', fields: {} }), 'Bad.');
  });
});

describe('apiFetch and the unpublished-changes count', () => {
  it('writes the X-Unpublished-Changes header to the store, and ignores a missing or bad one', async () => {
    const { $unpublishedChanges } = await import('@/stores/publish');
    $unpublishedChanges.set(null);
    stubFetch(() => Response.json({}, { headers: { 'X-Unpublished-Changes': '4' } }));
    await apiFetch('/api/admin/venues/x', { method: 'PUT', fallback: 'x' });
    assert.deepEqual($unpublishedChanges.get(), { count: 4 });

    $unpublishedChanges.set(null);
    stubFetch(() => Response.json({}, { headers: { 'X-Unpublished-Changes': 'lots' } }));
    await apiFetch('/api/admin/venues/x', { method: 'PUT', fallback: 'x' });
    stubFetch(() => Response.json({}));
    await apiFetch('/api/admin/publish', { fallback: 'x' });
    assert.equal($unpublishedChanges.get(), null);
  });
});
