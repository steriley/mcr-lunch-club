import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatIsoDate, londonDate } from './london-date';

describe('londonDate', () => {
  it('uses GMT in winter', () => {
    assert.equal(londonDate(new Date('2026-01-15T23:59:59Z')), '2026-01-15');
    assert.equal(londonDate(new Date('2026-01-16T00:00:00Z')), '2026-01-16');
  });

  it('uses BST in summer, so London midnight is 23:00 UTC', () => {
    assert.equal(londonDate(new Date('2026-07-15T22:59:59Z')), '2026-07-15');
    assert.equal(londonDate(new Date('2026-07-15T23:00:00Z')), '2026-07-16');
  });

  it('handles the spring-forward day (29 Mar 2026, 01:00 GMT -> 02:00 BST)', () => {
    assert.equal(londonDate(new Date('2026-03-28T23:59:59Z')), '2026-03-28');
    assert.equal(londonDate(new Date('2026-03-29T00:30:00Z')), '2026-03-29');
    assert.equal(londonDate(new Date('2026-03-29T22:59:59Z')), '2026-03-29');
    assert.equal(londonDate(new Date('2026-03-29T23:00:00Z')), '2026-03-30');
  });

  it('handles the fall-back day (25 Oct 2026, 02:00 BST -> 01:00 GMT)', () => {
    assert.equal(londonDate(new Date('2026-10-24T22:59:59Z')), '2026-10-24');
    assert.equal(londonDate(new Date('2026-10-24T23:00:00Z')), '2026-10-25');
    assert.equal(londonDate(new Date('2026-10-25T23:59:59Z')), '2026-10-25');
    assert.equal(londonDate(new Date('2026-10-26T00:00:00Z')), '2026-10-26');
  });
});

describe('formatIsoDate', () => {
  it('formats without shifting the day', () => {
    assert.equal(formatIsoDate('2026-10-21'), '21 Oct 2026');
    assert.equal(formatIsoDate('2026-01-01'), '1 Jan 2026');
  });
});
