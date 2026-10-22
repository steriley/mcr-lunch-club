import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bulletinText, changesInWeek, gazetteLabel, londonWeek, type TierChange } from './weekly-bulletin';

const change = (slug: string, fromTier: TierChange['fromTier'], toTier: TierChange['toTier'], at: string): TierChange => ({
  slug,
  name: slug.toUpperCase(),
  fromTier,
  toTier,
  decidedAt: new Date(at),
});

describe('londonWeek', () => {
  it('finds the Monday to Sunday week and ISO number', () => {
    const week = londonWeek(new Date('2026-10-22T12:00:00Z'));
    assert.deepEqual(week, { start: '2026-10-19', end: '2026-10-25', week: 43, yy: '26' });
    assert.equal(gazetteLabel(week), 'Gazette #43.26');
  });

  it('treats Sunday as the end of its week', () => {
    assert.equal(londonWeek(new Date('2026-10-25T12:00:00Z')).start, '2026-10-19');
    assert.equal(londonWeek(new Date('2026-10-26T12:00:00Z')).start, '2026-10-26');
  });

  it('uses the ISO week-year around New Year', () => {
    const week = londonWeek(new Date('2027-01-01T12:00:00Z'));
    assert.equal(week.week, 53);
    assert.equal(week.yy, '26');
  });

  it('flips the day at London midnight in summer', () => {
    // 23:30 UTC on a Sunday is already Monday in BST.
    assert.equal(londonWeek(new Date('2026-06-14T23:30:00Z')).start, '2026-06-15');
  });
});

describe('changesInWeek', () => {
  const week = londonWeek(new Date('2026-10-22T12:00:00Z'));

  it('keeps only changes decided this London week', () => {
    const kept = changesInWeek(
      [
        change('a', 'to_be_assessed', 'approved', '2026-10-19T09:00:00Z'),
        change('b', 'to_be_assessed', 'approved', '2026-10-18T22:00:00Z'),
        change('c', 'to_be_assessed', 'approved', '2026-10-26T09:00:00Z'),
      ],
      week
    );
    assert.deepEqual(kept.map((c) => c.slug), ['a']);
  });

  it('collapses a venue to its net move and drops a round trip', () => {
    const kept = changesInWeek(
      [
        change('a', 'to_be_assessed', 'under_consideration', '2026-10-19T09:00:00Z'),
        change('a', 'under_consideration', 'approved', '2026-10-21T09:00:00Z'),
        change('b', 'approved', 'rejected', '2026-10-19T09:00:00Z'),
        change('b', 'rejected', 'approved', '2026-10-20T09:00:00Z'),
      ],
      week
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0].fromTier, 'to_be_assessed');
    assert.equal(kept[0].toTier, 'approved');
  });
});

describe('bulletinText', () => {
  it('reports a quiet week', () => {
    assert.match(bulletinText([]), /^Quiet week/);
  });

  it('names venues, groups by outcome and counts verdicts', () => {
    const text = bulletinText([
      change('a', 'under_consideration', 'approved', '2026-10-20T09:00:00Z'),
      change('b', 'to_be_assessed', 'under_consideration', '2026-10-20T10:00:00Z'),
      change('c', 'under_consideration', 'approved', '2026-10-21T10:00:00Z'),
    ]);
    assert.equal(text, '3 verdicts have moved this week: A and C elevated to Approved, B referred for consideration.');
  });

  it('uses a count when a group is large and singular grammar for one', () => {
    const many = ['a', 'b', 'c'].map((slug) => change(slug, 'under_consideration', 'approved', '2026-10-20T09:00:00Z'));
    assert.equal(bulletinText(many), '3 verdicts have moved this week: 3 venues elevated to Approved.');
    assert.equal(
      bulletinText([change('a', 'approved', 'rejected', '2026-10-20T09:00:00Z')]),
      '1 verdict has moved this week: A knocked off Approved to Rejected.'
    );
  });
});
