import '../test/setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SuggestionRow } from '@/db/schema';
import { db } from '@/lib/db';
import {
  SUGGESTIONS_PER_DAY,
  SUGGESTIONS_PER_SENDER_PER_HOUR,
  createDraftVenueFromSuggestion,
  isSuggestionRateLimited,
  senderHash,
  serializeSuggestion,
} from './suggestions';
import { ADMIN, VENUE_ID, restoreStubs, stubDb, stubDbSequence } from '../test/route-helpers';

afterEach(restoreStubs);

const createdAt = new Date('2026-10-20T11:00:00.000Z');
const suggestion: SuggestionRow = {
  id: VENUE_ID,
  name: 'Pasty Palace',
  address: '14 Peter Street',
  cuisine: 'Bakery',
  cost: '£',
  recommendedOrder: 'Steak pasty',
  rationale: 'Fast, cheap and excellent.',
  submitterName: 'Delegate R',
  status: 'new',
  venueId: null,
  senderHash: 'abc',
  createdAt,
  reviewedAt: null,
  reviewedBy: null,
};

describe('senderHash', () => {
  it('is stable per address, differs between addresses and never contains the address', () => {
    const hash = senderHash('203.0.113.7')!;
    assert.equal(hash, senderHash('203.0.113.7'));
    assert.notEqual(hash, senderHash('203.0.113.8'));
    assert.match(hash, /^[0-9a-f]{32}$/);
    assert.ok(!hash.includes('203'));
  });

  it('is null without an address', () => {
    assert.equal(senderHash(null), null);
  });
});

describe('isSuggestionRateLimited', () => {
  it('allows a sender under both limits', async () => {
    stubDbSequence('select', [[{ total: 0 }], [{ total: SUGGESTIONS_PER_SENDER_PER_HOUR - 1 }]]);
    assert.equal(await isSuggestionRateLimited(db, 'abc'), false);
  });

  it('limits a sender at the hourly limit', async () => {
    stubDbSequence('select', [[{ total: 0 }], [{ total: SUGGESTIONS_PER_SENDER_PER_HOUR }]]);
    assert.equal(await isSuggestionRateLimited(db, 'abc'), true);
  });

  it('limits everyone once the daily ceiling is reached', async () => {
    const calls = stubDbSequence('select', [[{ total: SUGGESTIONS_PER_DAY }]]);
    assert.equal(await isSuggestionRateLimited(db, null), true);
    assert.equal(calls.filter((call) => call.method === 'from').length, 1, 'stops after the daily count');
  });

  it('only applies the daily ceiling when the sender is unknown', async () => {
    stubDbSequence('select', [[{ total: 0 }]]);
    assert.equal(await isSuggestionRateLimited(db, null), false);
  });
});

describe('createDraftVenueFromSuggestion', () => {
  it('creates a hidden venue with no approved tier and a free slug, and marks the suggestion accepted', async () => {
    // First slug candidate is taken, the second is free.
    stubDbSequence('select', [[{ id: 'taken' }], []]);
    const inserts = stubDb('insert', [{ id: 'new-venue', slug: 'pasty-palace-2', createdAt, updatedAt: createdAt, latitude: null, longitude: null, distanceMiles: null }]);
    const updates = stubDb('update', []);

    const venue = await createDraftVenueFromSuggestion(db, suggestion, ADMIN.id);
    assert.equal(venue.id, 'new-venue');

    const venueValues = inserts.find((call) => call.method === 'values')!.args[0] as any;
    assert.equal(venueValues.slug, 'pasty-palace-2');
    assert.ok(!('tier' in venueValues), 'no approved tier: the venue stays hidden');
    assert.equal(venueValues.cost, '£');
    assert.equal(venueValues.lunchSpecial, 'Steak pasty');
    assert.equal(venueValues.cuisine, 'other');
    assert.equal(venueValues.updatedBy, ADMIN.id);

    const set = updates.find((call) => call.method === 'set')!.args[0] as any;
    assert.equal(set.status, 'accepted');
    assert.equal(set.venueId, 'new-venue');
    assert.equal(set.reviewedBy, ADMIN.id);
  });

  it('defaults the cost band', async () => {
    stubDb('select', []);
    const inserts = stubDb('insert', [{ id: 'v', createdAt, updatedAt: createdAt, latitude: null, longitude: null, distanceMiles: null }]);
    stubDb('update', []);
    await createDraftVenueFromSuggestion(db, { ...suggestion, cost: null, submitterName: null }, ADMIN.id);
    const venueValues = inserts.find((call) => call.method === 'values')!.args[0] as any;
    assert.equal(venueValues.cost, '££');
  });
});

describe('serializeSuggestion', () => {
  it('converts dates and never exposes the sender hash', () => {
    const serialized = serializeSuggestion(suggestion);
    assert.equal(serialized.createdAt, createdAt.toISOString());
    assert.equal(serialized.reviewedAt, null);
    assert.equal('senderHash' in serialized, false);
  });
});
