import '../test/setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SuggestionRow } from '@/db/schema';
import { db } from '@/lib/db';
import {
  SUGGESTIONS_PER_DAY,
  SUGGESTIONS_PER_SENDER_PER_HOUR,
  isSuggestionRateLimited,
  markSuggestionAccepted,
  senderHash,
  serializeSuggestion,
  suggestionPrefill,
} from './suggestions';
import { ADMIN, VENUE_ID, renderSql, restoreStubs, stubDb, stubDbSequence } from '../test/route-helpers';

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

describe('suggestionPrefill', () => {
  it('copies only the name and a valid cost band; everything else is reference', () => {
    assert.deepEqual(suggestionPrefill(suggestion), {
      id: VENUE_ID,
      name: 'Pasty Palace',
      cost: '£',
      searchQuery: '14 Peter Street',
      cuisineHint: 'Bakery',
      recommendedOrder: 'Steak pasty',
      rationale: 'Fast, cheap and excellent.',
      submitterName: 'Delegate R',
    });
    assert.equal(suggestionPrefill({ ...suggestion, cost: 'cheap' }).cost, null);
  });
});

describe('markSuggestionAccepted', () => {
  it('only accepts a suggestion that is still new and unlinked', async () => {
    const updates = stubDb('update', [{ id: VENUE_ID }]);
    assert.equal(await markSuggestionAccepted(db, VENUE_ID, 'venue-1', ADMIN.id), true);
    const set = updates.find((call) => call.method === 'set')!.args[0] as any;
    assert.deepEqual({ status: set.status, venueId: set.venueId, reviewedBy: set.reviewedBy }, { status: 'accepted', venueId: 'venue-1', reviewedBy: ADMIN.id });
    const { sql } = renderSql(updates.find((call) => call.method === 'where')!.args[0]);
    assert.match(sql, /"status" = \$\d+ and "venue_suggestions"\."venue_id" is null/);

    stubDb('update', []);
    assert.equal(await markSuggestionAccepted(db, VENUE_ID, 'venue-1', ADMIN.id), false);
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
