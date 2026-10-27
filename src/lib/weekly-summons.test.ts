import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicVenue } from './public-data';
import type { TierValue } from './tiers';
import { bulletinIssue } from './weekly-bulletin';
import { pickSummons, summonsFor, type TierEntry } from './weekly-summons';
import type { Inspection } from '@/types';

const venue = (slug: string, tier: TierValue): PublicVenue => ({ slug, name: slug.toUpperCase(), tier }) as PublicVenue;
const inspection = (venueSlug: string, date: string): Inspection => ({ venueSlug, date }) as Inspection;
const entry = (slug: string, at: string): TierEntry => ({ slug, tier: 'to_be_assessed', enteredAt: new Date(at) });

// Wednesday 28 October 2026, 18:00 GMT; the previous issue is 21 October.
const issue = bulletinIssue(new Date('2026-10-28T18:00:00Z'));
const pick = (venues: PublicVenue[], inspections: Inspection[], entries: TierEntry[]) => pickSummons(venues, inspections, entries, issue, new Set());

describe('pickSummons: Tuesday', () => {
  it('picks the venue inspected longest ago', () => {
    const venues = [venue('a', 'approved'), venue('b', 'approved'), venue('c', 'approved')];
    const inspections = [inspection('a', '2026-09-01'), inspection('b', '2026-03-01'), inspection('c', '2026-06-01')];
    assert.equal(pick(venues, inspections, []).tuesday?.slug, 'b');
  });

  it('treats an Under Consideration venue as 60 days staler', () => {
    const venues = [venue('approved-old', 'approved'), venue('consider', 'under_consideration')];
    // 40 days vs 20 days + 60 bonus.
    const inspections = [inspection('approved-old', '2026-09-18'), inspection('consider', '2026-10-08')];
    assert.equal(pick(venues, inspections, []).tuesday?.slug, 'consider');
    // 20 days + 60 = 80 loses to 90 days.
    const older = [inspection('approved-old', '2026-07-30'), inspection('consider', '2026-10-08')];
    assert.equal(pick(venues, older, []).tuesday?.slug, 'approved-old');
  });

  it('selects an uninspected venue ahead of any dated one', () => {
    const venues = [venue('dated', 'approved'), venue('never', 'approved')];
    assert.equal(pick(venues, [inspection('dated', '2020-01-01')], []).tuesday?.slug, 'never');
  });

  it('chooses among uninspected venues the same way every time for an issue', () => {
    const venues = ['a', 'b', 'c', 'd', 'e', 'f'].map((slug) => venue(slug, 'approved'));
    const first = pick(venues, [], []).tuesday?.slug;
    assert.ok(first);
    for (let i = 0; i < 5; i++) assert.equal(pick(venues, [], []).tuesday?.slug, first);
  });

  it('ignores other tiers and inspections after the issue', () => {
    const venues = [venue('tba', 'to_be_assessed'), venue('rej', 'rejected'), venue('ok', 'approved')];
    assert.equal(pick(venues, [], []).tuesday?.slug, 'ok');
    assert.equal(pick([venue('x', 'approved')], [inspection('x', '2026-11-30')], []).tuesday?.slug, 'x');
  });
});

describe('pickSummons: Wednesday', () => {
  it('picks the venue that has waited longest in To Be Assessed', () => {
    const venues = [venue('a', 'to_be_assessed'), venue('b', 'to_be_assessed'), venue('c', 'approved')];
    const entries = [entry('a', '2026-09-01T12:00:00Z'), entry('b', '2026-05-01T12:00:00Z')];
    assert.equal(pick(venues, [], entries).wednesday?.slug, 'b');
  });

  it('uses the latest entry when a venue came back into the tier', () => {
    const venues = [venue('a', 'to_be_assessed'), venue('b', 'to_be_assessed')];
    const entries = [entry('a', '2026-01-01T12:00:00Z'), entry('a', '2026-10-01T12:00:00Z'), entry('b', '2026-08-01T12:00:00Z')];
    assert.equal(pick(venues, [], entries).wednesday?.slug, 'b');
  });

  it('selects a venue with no entry date ahead of dated ones', () => {
    const venues = [venue('dated', 'to_be_assessed'), venue('undated', 'to_be_assessed')];
    assert.equal(pick(venues, [], [entry('dated', '2020-01-01T12:00:00Z')]).wednesday?.slug, 'undated');
  });
});

describe('pickSummons: empty pools', () => {
  it('returns null for a pool with no venues', () => {
    assert.deepEqual(pick([], [], []), { tuesday: null, wednesday: null });
    const onlyTuesday = pick([venue('a', 'approved')], [], []);
    assert.equal(onlyTuesday.wednesday, null);
  });
});

describe('summonsFor: repeat rule', () => {
  const venues = [venue('a', 'approved'), venue('b', 'approved'), venue('c', 'to_be_assessed'), venue('d', 'to_be_assessed')];
  const inspections = [inspection('a', '2026-01-01'), inspection('b', '2026-02-01')];
  const entries = [entry('c', '2026-01-01T12:00:00Z'), entry('d', '2026-02-01T12:00:00Z')];
  const issueOn = (day: string) => bulletinIssue(new Date(`${day}T20:00:00Z`));

  it('starts from the oldest on the first issue', () => {
    const first = summonsFor(venues, inspections, entries, issueOn('2026-10-28'));
    assert.equal(first.tuesday?.slug, 'a');
    assert.equal(first.wednesday?.slug, 'c');
  });

  it('never repeats the previous week’s picks, so a small pool alternates', () => {
    const slugs = ['2026-10-28', '2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25', '2026-12-02'].map((day) => {
      const { tuesday, wednesday } = summonsFor(venues, inspections, entries, issueOn(day));
      return `${tuesday?.slug}${wednesday?.slug}`;
    });
    assert.deepEqual(slugs, ['ac', 'bd', 'ac', 'bd', 'ac', 'bd']);
  });

  it('stays consistent across the March clock change', () => {
    const march = ['2027-03-17', '2027-03-24', '2027-03-31', '2027-04-07'].map((day) => summonsFor(venues, inspections, entries, issueOn(day)).tuesday?.slug);
    for (let i = 1; i < march.length; i++) assert.notEqual(march[i], march[i - 1]);
  });

  it('shows an empty column rather than repeating when the pool has one venue', () => {
    const single = [venue('only', 'approved')];
    assert.equal(summonsFor(single, [], [], issueOn('2026-10-28')).tuesday?.slug, 'only');
    assert.equal(summonsFor(single, [], [], issueOn('2026-11-04')).tuesday, null);
    assert.equal(summonsFor(single, [], [], issueOn('2026-11-11')).tuesday?.slug, 'only');
  });
});
