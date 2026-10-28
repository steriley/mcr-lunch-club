import '../setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '@/pages/api/admin/bribery';
import * as byId from '@/pages/api/admin/bribery/[id]';
import {
  ADMIN,
  VENUE_ID,
  adminRequest,
  quietly,
  restoreStubs,
  run,
  signInAs,
  stubDb,
  stubDbSequence,
} from '../route-helpers';

const now = new Date('2026-01-01T00:00:00.000Z');
const row = { id: VENUE_ID, title: 'Free cookie', published: true, createdAt: now, updatedAt: now };
const input = { title: 'Free cookie', description: 'A cookie was offered at the till.' };

afterEach(restoreStubs);

const ctx = (method: string, id: string | undefined, body?: unknown) => ({
  request: adminRequest(method, body),
  params: { id },
});

describe('/api/admin/bribery', () => {
  describe('POST', () => {
    const post = (body: unknown) => run(POST, { request: adminRequest('POST', body) });

    it('validates the body', async () => {
      signInAs();
      assert.equal((await post({ title: 'x' })).status, 400);
    });

    it('rejects an unknown linked venue', async () => {
      signInAs();
      stubDb('select', []);
      const response = await post({ ...input, venueId: VENUE_ID });
      assert.equal(response.status, 400);
      assert.ok((await response.json()).fields.venueId);
    });

    it('creates the record attributed to the signed-in chair', async () => {
      signInAs();
      const inserts = stubDb('insert', [row]);
      const response = await post(input);
      assert.equal(response.status, 201);
      const values = inserts.find((call) => call.method === 'values')!.args[0] as any;
      assert.equal(values.createdBy, ADMIN.email);
      assert.equal(values.title, 'Free cookie');
    });

    it('returns 500 on database errors', async () => {
      signInAs();
      stubDb('insert', new Error('db down'));
      assert.equal((await quietly(() => post(input))).status, 500);
    });
  });
});

describe('/api/admin/bribery/[id]', () => {
  describe('PUT', () => {
    it('validates the body and the linked venue', async () => {
      signInAs();
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, { title: 'x' }))).status, 400);

      stubDb('select', []);
      assert.equal(
        (await run(byId.PUT, ctx('PUT', VENUE_ID, { ...input, venueId: VENUE_ID }))).status,
        400
      );
    });

    it('updates, 404s, or 500s', async () => {
      signInAs();
      stubDb('update', [row]);
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, input))).status, 200);

      stubDb('update', []);
      assert.equal((await run(byId.PUT, ctx('PUT', VENUE_ID, input))).status, 404);

      stubDb('update', new Error('db down'));
      assert.equal((await quietly(() => run(byId.PUT, ctx('PUT', VENUE_ID, input)))).status, 500);
    });

    it('resolves the venue name when a venue is linked', async () => {
      signInAs();
      stubDbSequence('select', [[{ name: 'Chip Shop' }]]);
      const updates = stubDb('update', [row]);
      const response = await run(byId.PUT, ctx('PUT', VENUE_ID, { ...input, venueId: VENUE_ID }));
      assert.equal(response.status, 200);
      assert.equal(
        (updates.find((call) => call.method === 'set')!.args[0] as any).venueNameText,
        'Chip Shop'
      );
    });
  });

  describe('PATCH', () => {
    it('validates the body', async () => {
      signInAs();
      assert.equal(
        (await run(byId.PATCH, ctx('PATCH', VENUE_ID, { published: 'yes' }))).status,
        400
      );
    });

    it('sets the published flag, 404s, or 500s', async () => {
      signInAs();
      const updates = stubDb('update', [{ ...row, published: false }]);
      assert.equal(
        (await run(byId.PATCH, ctx('PATCH', VENUE_ID, { published: false }))).status,
        200
      );
      assert.equal(
        (updates.find((call) => call.method === 'set')!.args[0] as any).published,
        false
      );

      stubDb('update', []);
      assert.equal(
        (await run(byId.PATCH, ctx('PATCH', VENUE_ID, { published: true }))).status,
        404
      );

      stubDb('update', new Error('db down'));
      assert.equal(
        (await quietly(() => run(byId.PATCH, ctx('PATCH', VENUE_ID, { published: true })))).status,
        500
      );
    });
  });

  describe('DELETE', () => {
    it('deletes, 404s, or 500s', async () => {
      signInAs();
      stubDb('delete', [{ id: VENUE_ID }]);
      assert.deepEqual(await (await run(byId.DELETE, ctx('DELETE', VENUE_ID))).json(), {
        ok: true,
      });

      stubDb('delete', []);
      assert.equal((await run(byId.DELETE, ctx('DELETE', VENUE_ID))).status, 404);

      stubDb('delete', new Error('db down'));
      assert.equal((await quietly(() => run(byId.DELETE, ctx('DELETE', VENUE_ID)))).status, 500);
    });
  });
});
