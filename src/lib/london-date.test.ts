import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { londonDate, secondsUntilLondonMidnight } from './london-date';

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

describe('secondsUntilLondonMidnight', () => {
  const HOUR = 3600;

  it('counts to 00:00 GMT in winter and 23:00 UTC in summer', () => {
    assert.equal(secondsUntilLondonMidnight(new Date('2026-01-15T22:00:00Z')), 2 * HOUR);
    assert.equal(secondsUntilLondonMidnight(new Date('2026-07-15T22:00:00Z')), HOUR);
    assert.equal(secondsUntilLondonMidnight(new Date('2026-07-15T22:59:30Z')), 30);
  });

  it('is never zero, even on the stroke of midnight', () => {
    assert.equal(secondsUntilLondonMidnight(new Date('2026-01-16T00:00:00Z')), 24 * HOUR);
    assert.ok(secondsUntilLondonMidnight(new Date('2026-01-15T23:59:59.900Z')) >= 1);
  });

  it('spans the 23-hour spring-forward day', () => {
    // 00:30 GMT on 29 Mar; the clocks go forward at 01:00, and midnight is 23:00 UTC.
    assert.equal(secondsUntilLondonMidnight(new Date('2026-03-29T00:30:00Z')), 22.5 * HOUR);
    // The evening before: still GMT, so midnight is 00:00 UTC.
    assert.equal(secondsUntilLondonMidnight(new Date('2026-03-28T23:00:00Z')), HOUR);
    // Later that day, in BST.
    assert.equal(secondsUntilLondonMidnight(new Date('2026-03-29T12:00:00Z')), 11 * HOUR);
  });

  it('spans the 25-hour fall-back day', () => {
    // 00:30 BST on 25 Oct (23:30 UTC on the 24th); the clocks go back at 02:00 BST, midnight is 00:00 UTC.
    assert.equal(secondsUntilLondonMidnight(new Date('2026-10-24T23:30:00Z')), 24.5 * HOUR);
    // The evening before, in BST: midnight is 23:00 UTC.
    assert.equal(secondsUntilLondonMidnight(new Date('2026-10-24T22:00:00Z')), HOUR);
    assert.equal(secondsUntilLondonMidnight(new Date('2026-10-25T12:00:00Z')), 12 * HOUR);
  });

  it('always lands on the next London day', () => {
    for (
      let t = Date.parse('2026-03-27T00:00:00Z');
      t < Date.parse('2026-03-31T00:00:00Z');
      t += 997_000
    ) {
      const now = new Date(t);
      const ttl = secondsUntilLondonMidnight(now);
      assert.notEqual(londonDate(new Date(t + ttl * 1000 + 1000)), londonDate(now));
      assert.equal(londonDate(new Date(t + (ttl - 1) * 1000)), londonDate(now));
    }
  });
});
