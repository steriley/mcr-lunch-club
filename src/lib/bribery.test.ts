import '../test/setup-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { briberyValues, publicPersonName, publicText, serializeBribery } from './bribery';
import { briberyInputSchema, type BriberyInput } from './bribery-schema';
import type { BriberyRow } from '@/db/schema';
import type { Database } from './db-client';

const VENUE_ID = '3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f';

function input(overrides: Record<string, unknown> = {}): BriberyInput {
  return briberyInputSchema.parse({ title: 'Free cookie', description: 'A cookie was offered at the till.', ...overrides });
}

/** Mimics db.select().from().where().limit() resolving to the given rows. */
function fakeDb(rows: unknown[]): Database {
  const chain: any = {};
  chain.select = () => chain;
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = async () => rows;
  return chain;
}

describe('briberyValues', () => {
  it('copies input fields and stamps updatedAt without touching the database when no venue is linked', async () => {
    const db = { select: () => assert.fail('should not query') } as unknown as Database;
    const result = await briberyValues(db, input({ venueNameText: 'Somewhere', published: false }));
    assert.ok(result.ok);
    assert.equal(result.values.title, 'Free cookie');
    assert.equal(result.values.venueNameText, 'Somewhere');
    assert.equal(result.values.published, false);
    assert.ok(result.values.updatedAt instanceof Date);
  });

  it('fills the venue name from the linked venue', async () => {
    const result = await briberyValues(fakeDb([{ name: 'Chip Shop' }]), input({ venueId: VENUE_ID }));
    assert.ok(result.ok);
    assert.equal(result.values.venueNameText, 'Chip Shop');
  });

  it('keeps an explicitly typed venue name', async () => {
    const result = await briberyValues(fakeDb([{ name: 'Chip Shop' }]), input({ venueId: VENUE_ID, venueNameText: 'The Chippy' }));
    assert.ok(result.ok);
    assert.equal(result.values.venueNameText, 'The Chippy');
  });

  it('fails when the linked venue does not exist', async () => {
    const result = await briberyValues(fakeDb([]), input({ venueId: VENUE_ID }));
    assert.deepEqual(result, { ok: false, error: 'Choose a venue from the list.' });
  });
});

describe('serializeBribery', () => {
  it('converts timestamps to ISO strings', () => {
    const row = {
      id: 'id',
      title: 'T',
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      updatedAt: new Date('2026-02-03T04:05:06.000Z'),
    } as unknown as BriberyRow;
    const result = serializeBribery(row);
    assert.equal(result.createdAt, '2026-01-02T03:04:05.000Z');
    assert.equal(result.updatedAt, '2026-02-03T04:05:06.000Z');
    assert.equal(result.title, 'T');
  });
});

describe('publicPersonName', () => {
  it('aliases the known people, ignoring @ prefixes and (Deactivated)', () => {
    assert.match(publicPersonName('@Tom Pritchard (Deactivated)'), /^Under Study Pritchard/);
    assert.equal(publicPersonName('@Stephen Riley'), 'Chair Riley');
    assert.equal(publicPersonName('@Tommy Clark'), 'Chair Clark');
  });

  it('shortens anyone else to first name and surname initial', () => {
    assert.equal(publicPersonName('Ann Example'), 'Ann E.');
    assert.equal(publicPersonName('@Ann Van Example (Deactivated)'), 'Ann E.');
  });

  it('leaves single names alone', () => {
    assert.equal(publicPersonName('Ann'), 'Ann');
    assert.equal(publicPersonName('@Ann'), 'Ann');
  });
});

describe('publicText', () => {
  it('replaces first names without mangling Tommy', () => {
    const out = publicText('Tom offered Stephen roses; Tommy watched.');
    assert.match(out, /^Under Study Pritchard.* offered Chair Riley roses; Chair Clark watched\.$/);
  });
});
