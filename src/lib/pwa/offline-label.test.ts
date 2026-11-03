import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { staleDataLabel } from './offline-label';

describe('stale data label', () => {
  it('names the build time in London wall-clock time', () => {
    assert.equal(
      staleDataLabel('2026-11-03T14:05:00Z'),
      'Offline · verdicts as of 3rd Nov 26, 14:05'
    );
    assert.equal(
      staleDataLabel('2026-07-03T13:05:00Z'),
      'Offline · verdicts as of 3rd Jul 26, 14:05'
    );
  });

  it('falls back when the build time is missing or unreadable', () => {
    for (const value of [null, undefined, '', 'yesterday']) {
      assert.equal(staleDataLabel(value), 'Offline · saved copy of this page');
    }
  });
});
