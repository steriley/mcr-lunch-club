import '../test/setup-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { derivePublishStatus, isProductionBuild, type PendingChange } from './publishing';

const NOW = new Date('2026-10-31T12:00:00Z');
const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000);
const change = (id: string, minutesAgo: number): PendingChange => ({
  id,
  action: 'Update venue',
  venueId: null,
  venueName: null,
  actorName: 'Sam',
  createdAt: at(minutesAgo).toISOString(),
});
const derive = (
  changes: PendingChange[],
  latestRequest: { requestedAt: Date; accepted: boolean } | null,
  lastPublishedAt: Date | null = null
) => derivePublishStatus({ changes, latestRequest, lastPublishedAt, now: NOW });

describe('derivePublishStatus', () => {
  it('is idle with nothing pending, whatever was requested', () => {
    assert.equal(derive([], null).state, 'idle');
    assert.equal(derive([], { requestedAt: at(1), accepted: true }).state, 'idle');
  });

  it('is pending with changes and no request', () => {
    const status = derive([change('a', 10), change('b', 5)], null);
    assert.deepEqual([status.state, status.count], ['pending', 2]);
  });

  it('is publishing while an accepted request is recent, counting later changes apart', () => {
    const status = derive([change('a', 10), change('b', 5), change('c', 1)], {
      requestedAt: at(3),
      accepted: true,
    });
    assert.deepEqual(
      [status.state, status.publishing, status.newSince, status.count],
      ['publishing', 2, 1, 3]
    );
  });

  it('is not confirmed once the build has not cleared the changes in five minutes', () => {
    const status = derive([change('a', 20)], { requestedAt: at(6), accepted: true });
    assert.equal(status.state, 'unconfirmed');
  });

  it('is not confirmed when the hook refused the request', () => {
    assert.equal(
      derive([change('a', 20)], { requestedAt: at(1), accepted: false }).state,
      'unconfirmed'
    );
  });

  it('treats changes saved after a failed or stale request as a new batch', () => {
    assert.equal(derive([change('a', 1)], { requestedAt: at(6), accepted: true }).state, 'pending');
    assert.equal(
      derive([change('a', 1)], { requestedAt: at(3), accepted: false }).state,
      'pending'
    );
    // All of them came after the request, so no build in flight covers any.
    assert.equal(derive([change('a', 1)], { requestedAt: at(3), accepted: true }).state, 'pending');
  });

  it('ignores a request an earlier build already answered', () => {
    const status = derive([change('a', 1)], { requestedAt: at(8), accepted: true }, at(5));
    assert.equal(status.state, 'pending');
  });
});

describe('isProductionBuild', () => {
  it('is true only for a Vercel production build', () => {
    assert.equal(isProductionBuild({ VERCEL_ENV: 'production' }), true);
    assert.equal(isProductionBuild({ VERCEL_ENV: 'preview' }), false);
    assert.equal(isProductionBuild({}), false);
  });
});
