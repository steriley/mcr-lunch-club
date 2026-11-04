import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  backlogFor,
  backlogText,
  bulletinIssue,
  bulletinText,
  changesInIssue,
  gazetteLabel,
  nextBulletinIssue,
  type TierChange,
} from './weekly-bulletin';

const change = (
  slug: string,
  fromTier: TierChange['fromTier'],
  toTier: TierChange['toTier'],
  at: string
): TierChange => ({
  slug,
  name: slug.toUpperCase(),
  fromTier,
  toTier,
  decidedAt: new Date(at),
});

describe('bulletinIssue', () => {
  it('is the latest Wednesday 23:59 London issue, covering the week before it', () => {
    // Thursday; 23:59 BST is 22:59 UTC.
    const issue = bulletinIssue(new Date('2026-10-22T12:00:00Z'));
    assert.deepEqual(issue, {
      publishedAt: new Date('2026-10-21T22:59:00Z'),
      coversFrom: new Date('2026-10-14T22:59:00Z'),
      week: 43,
      yy: '26',
    });
    assert.equal(gazetteLabel(issue), 'Gazette #43.26');
  });

  it('keeps last week’s issue up until 23:59 London on Wednesday', () => {
    assert.deepEqual(
      bulletinIssue(new Date('2026-10-21T22:58:59Z')).publishedAt,
      new Date('2026-10-14T22:59:00Z')
    );
    assert.deepEqual(
      bulletinIssue(new Date('2026-10-21T22:59:00Z')).publishedAt,
      new Date('2026-10-21T22:59:00Z')
    );
  });

  it('stays on Wednesday’s issue through the weekend and Monday', () => {
    assert.deepEqual(
      bulletinIssue(new Date('2026-10-25T12:00:00Z')).publishedAt,
      new Date('2026-10-21T22:59:00Z')
    );
    assert.deepEqual(
      bulletinIssue(new Date('2026-10-27T12:00:00Z')).publishedAt,
      new Date('2026-10-21T22:59:00Z')
    );
  });

  it('publishes at 23:59 GMT in winter, covering back across the clock change', () => {
    const issue = bulletinIssue(new Date('2026-10-28T23:59:00Z'));
    assert.deepEqual(issue.publishedAt, new Date('2026-10-28T23:59:00Z'));
    assert.deepEqual(issue.coversFrom, new Date('2026-10-21T22:59:00Z'));
    assert.deepEqual(
      bulletinIssue(new Date('2026-10-28T23:30:00Z')).publishedAt,
      new Date('2026-10-21T22:59:00Z')
    );
  });

  it('numbers the issue by its Wednesday’s ISO week-year around New Year', () => {
    const lastOf2026 = bulletinIssue(new Date('2027-01-02T12:00:00Z'));
    assert.deepEqual(lastOf2026.publishedAt, new Date('2026-12-30T23:59:00Z'));
    assert.equal(gazetteLabel(lastOf2026), 'Gazette #53.26');
    assert.equal(gazetteLabel(bulletinIssue(new Date('2027-01-07T12:00:00Z'))), 'Gazette #1.27');
  });
});

describe('nextBulletinIssue', () => {
  it('is the following Wednesday 23:59 London issue, across the clock change', () => {
    const next = nextBulletinIssue(bulletinIssue(new Date('2026-10-22T12:00:00Z')));
    assert.deepEqual(next.publishedAt, new Date('2026-10-28T23:59:00Z'));
    assert.equal(gazetteLabel(next), 'Gazette #44.26');
    assert.equal(gazetteLabel(nextBulletinIssue(next)), 'Gazette #45.26');
  });
});

describe('changesInIssue', () => {
  const issue = bulletinIssue(new Date('2026-10-22T12:00:00Z'));

  it('keeps changes after the previous issue, up to and including this one', () => {
    const kept = changesInIssue(
      [
        change('a', 'to_be_assessed', 'approved', '2026-10-19T09:00:00Z'),
        change('b', 'to_be_assessed', 'approved', '2026-10-14T22:59:00Z'),
        change('c', 'to_be_assessed', 'approved', '2026-10-14T22:59:01Z'),
        change('d', 'to_be_assessed', 'approved', '2026-10-21T22:59:00Z'),
        change('e', 'to_be_assessed', 'approved', '2026-10-21T22:59:01Z'),
      ],
      issue
    );
    assert.deepEqual(
      kept.map((c) => c.slug),
      ['c', 'a', 'd']
    );
  });

  it('collapses a venue to its net move and drops a round trip', () => {
    const kept = changesInIssue(
      [
        change('a', 'to_be_assessed', 'under_consideration', '2026-10-19T09:00:00Z'),
        change('a', 'under_consideration', 'approved', '2026-10-21T09:00:00Z'),
        change('b', 'approved', 'rejected', '2026-10-19T09:00:00Z'),
        change('b', 'rejected', 'approved', '2026-10-20T09:00:00Z'),
      ],
      issue
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
    assert.equal(
      text,
      '3 verdicts have moved this week: A and C elevated to Approved, B referred for consideration.'
    );
  });

  it('uses a count when a group is large and singular grammar for one', () => {
    const many = ['a', 'b', 'c'].map((slug) =>
      change(slug, 'under_consideration', 'approved', '2026-10-20T09:00:00Z')
    );
    assert.equal(
      bulletinText(many),
      '3 verdicts have moved this week: 3 venues elevated to Approved.'
    );
    assert.equal(
      bulletinText([change('a', 'approved', 'rejected', '2026-10-20T09:00:00Z')]),
      '1 verdict has moved this week: A knocked off Approved to Rejected.'
    );
  });
});

describe('backlog', () => {
  const venues = (counts: Partial<Record<TierChange['toTier'], number>>) =>
    Object.entries(counts).flatMap(([tier, n]) =>
      Array.from({ length: n }, () => ({ tier: tier as TierChange['toTier'] }))
    );

  it('counts Under Consideration and To Be Assessed at two a week', () => {
    const backlog = backlogFor(
      venues({ under_consideration: 14, to_be_assessed: 10, approved: 30, rejected: 5 })
    );
    assert.deepEqual(backlog, { venues: 24, weeks: 12 });
    assert.equal(
      backlogText(backlog),
      'We have 24 venues in the Waiting Chamber: 12 weeks of lunching, minimum.'
    );
  });

  it('rounds an odd venue up to a whole week, in the singular for one', () => {
    assert.equal(
      backlogText(backlogFor(venues({ to_be_assessed: 3 }))),
      'We have 3 venues in the Waiting Chamber: 2 weeks of lunching, minimum.'
    );
    assert.equal(
      backlogText(backlogFor(venues({ under_consideration: 1 }))),
      'We have 1 venue in the Waiting Chamber: 1 week of lunching, minimum.'
    );
  });

  it('reports an empty Waiting Chamber', () => {
    assert.equal(
      backlogText(backlogFor(venues({ approved: 3 }))),
      'The Waiting Chamber is empty. Nobody awaits judgement.'
    );
  });
});
