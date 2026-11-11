import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  exceedsNewAccountLimit,
  isEligibleCount,
  isLoggableDate,
  isLoggableVenue,
  isScoreSpike,
  isWithinEditWindow,
  loggableDates,
  memberInspectionInputSchema,
  memberInspectionUpdateSchema,
  memberWeight,
  parsePounds,
  verifyOnSite,
  weightedScore,
} from './member-inspection-rules';
import { formatPence } from './member-inspection-display';

const VALID = {
  venueId: '3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f',
  visitDate: '2026-11-11',
  dish: '  Steak   pie ',
  pricePaidPence: 850,
  qualityScore: 4,
  valueScore: 5,
  wouldReturn: true,
  verdictVote: 'approve',
  pullQuote: '   ',
};

describe('memberWeight', () => {
  it('is 0.25 up to three venues', () => {
    for (const venues of [0, 1, 2, 3]) assert.equal(memberWeight(venues), 0.25, String(venues));
  });

  it('rises in equal steps to 1.0 at ten venues and stays there', () => {
    const steps = [3, 4, 5, 6, 7, 8, 9, 10].map(memberWeight);
    for (let i = 1; i < steps.length; i += 1) {
      assert.ok(Math.abs(steps[i] - steps[i - 1] - 0.75 / 7) < 1e-9, `step ${i}`);
    }
    assert.equal(memberWeight(10), 1);
    assert.equal(memberWeight(40), 1);
    assert.ok(Math.abs(memberWeight(6) - (0.25 + (3 / 7) * 0.75)) < 1e-9);
  });
});

describe('weightedScore', () => {
  it('weights each log by its member', () => {
    assert.equal(weightedScore([]), null);
    assert.equal(
      weightedScore([
        { score: 5, weight: 1 },
        { score: 1, weight: 0.25 },
      ]),
      (5 + 0.25) / 1.25
    );
  });
});

describe('the Two-Visit Rule', () => {
  it('needs two days at a venue', () => {
    assert.equal(isEligibleCount(0), false);
    assert.equal(isEligibleCount(1), false);
    assert.equal(isEligibleCount(2), true);
  });
});

describe('days', () => {
  it('steps across months, years and the clock change', () => {
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-29', 1), '2026-03-30');
    assert.equal(addDays('2026-10-25', -1), '2026-10-24');
  });

  it('allows today and the six days before it', () => {
    assert.deepEqual(loggableDates('2026-11-11'), { min: '2026-11-05', max: '2026-11-11' });
    assert.equal(isLoggableDate('2026-11-11', '2026-11-11'), true);
    assert.equal(isLoggableDate('2026-11-05', '2026-11-11'), true);
    assert.equal(isLoggableDate('2026-11-04', '2026-11-11'), false);
    assert.equal(isLoggableDate('2026-11-12', '2026-11-11'), false);
  });

  it('closes editing 24 hours after saving', () => {
    const saved = new Date('2026-11-11T12:00:00Z');
    assert.equal(isWithinEditWindow(saved, new Date('2026-11-12T11:59:59Z')), true);
    assert.equal(isWithinEditWindow(saved, new Date('2026-11-12T12:00:00Z')), false);
    assert.equal(isWithinEditWindow(saved, new Date('2026-11-11T11:00:00Z')), false);
  });
});

describe('prices', () => {
  it('reads pounds as pence', () => {
    assert.equal(parsePounds(''), null);
    assert.equal(parsePounds('8.50'), 850);
    assert.equal(parsePounds('£8.5'), 850);
    assert.equal(parsePounds(' 12 '), 1200);
    assert.ok(Number.isNaN(parsePounds('eight')));
    assert.ok(Number.isNaN(parsePounds('8.505')));
    assert.equal(formatPence(850), '£8.50');
  });
});

describe('memberInspectionInputSchema', () => {
  it('tidies text, drops an empty quote and has no position by default', () => {
    const parsed = memberInspectionInputSchema.parse(VALID);
    assert.equal(parsed.dish, 'Steak pie');
    assert.equal(parsed.pullQuote, null);
    assert.equal(parsed.position, null);
  });

  it('refuses out-of-range scores, prices and over-long text', () => {
    for (const [field, value] of [
      ['qualityScore', 0],
      ['qualityScore', 6],
      ['valueScore', 2.5],
      ['pricePaidPence', -1],
      ['pricePaidPence', 10_001],
      ['dish', ''],
      ['dish', 'x'.repeat(121)],
      ['pullQuote', 'x'.repeat(141)],
      ['verdictVote', 'adore'],
      ['visitDate', '11/11/2026'],
      ['venueId', 'chip-shop'],
    ] as const) {
      const result = memberInspectionInputSchema.safeParse({ ...VALID, [field]: value });
      assert.equal(result.success, false, `${field}=${value}`);
      assert.equal(result.error?.issues[0].path[0], field);
    }
  });

  it('accepts the limits', () => {
    for (const [field, value] of [
      ['pricePaidPence', 0],
      ['pricePaidPence', 10_000],
      ['pricePaidPence', null],
      ['dish', 'x'.repeat(120)],
      ['pullQuote', 'x'.repeat(140)],
    ] as const) {
      assert.ok(memberInspectionInputSchema.safeParse({ ...VALID, [field]: value }).success, field);
    }
  });

  it('never lets an edit move the venue or the day', () => {
    const parsed = memberInspectionUpdateSchema.parse(VALID);
    assert.equal('venueId' in parsed, false);
    assert.equal('visitDate' in parsed, false);
    assert.equal('position' in parsed, false);
  });
});

describe('isLoggableVenue', () => {
  const open = { tier: 'approved', latitude: '53.48', longitude: '-2.25', closedAt: null };

  it('takes public, open venues only', () => {
    assert.equal(isLoggableVenue(open), true);
    assert.equal(isLoggableVenue({ ...open, tier: null }), false);
    assert.equal(isLoggableVenue({ ...open, latitude: null }), false);
    assert.equal(isLoggableVenue({ ...open, closedAt: new Date() }), false);
    assert.equal(
      isLoggableVenue({ ...open, tier: 'gone_but_not_forgotten', closedAt: new Date() }),
      false
    );
    assert.equal(isLoggableVenue({ ...open, tier: 'gone_but_not_forgotten' }), false);
  });
});

describe('verifyOnSite', () => {
  const venue = { lat: 53.4808, lng: -2.2426 };

  it('is gps within 150 m and none beyond or without a position', () => {
    // About 100 m north.
    assert.equal(verifyOnSite({ lat: 53.4817, lng: -2.2426 }, venue), 'gps');
    // About 200 m north.
    assert.equal(verifyOnSite({ lat: 53.4826, lng: -2.2426 }, venue), 'none');
    assert.equal(verifyOnSite(null, venue), 'none');
    assert.equal(verifyOnSite({ lat: 53.4808, lng: -2.2426 }, { lat: null, lng: null }), 'none');
  });
});

describe('anti-gaming thresholds', () => {
  it('holds more than five new-account logs a week', () => {
    assert.equal(exceedsNewAccountLimit(5), false);
    assert.equal(exceedsNewAccountLimit(6), true);
  });

  it('calls a spike more than 1.5 points either way, with enough logs on both sides', () => {
    const baseline = { mean: 2.5, count: 10 };
    assert.equal(isScoreSpike({ mean: 4, count: 3 }, baseline), false);
    assert.equal(isScoreSpike({ mean: 4.1, count: 3 }, baseline), true);
    assert.equal(isScoreSpike({ mean: 0.9, count: 3 }, baseline), true);
    assert.equal(isScoreSpike({ mean: 5, count: 2 }, baseline), false);
    assert.equal(isScoreSpike({ mean: 5, count: 3 }, { mean: 1, count: 2 }), false);
    assert.equal(isScoreSpike({ mean: 5, count: 3 }, { mean: null, count: 0 }), false);
  });
});
