import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { logScore, memberWeight } from '@/lib/member-inspection-rules';
import {
  SWING_BANDS,
  SWING_PRIOR_WEIGHT,
  SWING_QUORUM,
  VOTE_POSITIONS,
  bandCentre,
  bandOf,
  buildVenueSwing,
  chipText,
  distanceFromBand,
  hasQuorum,
  headlineFor,
  meterMode,
  peoplePosition,
  summariseLogs,
  type MeterMode,
  type ScoredLog,
} from '@/lib/swing';

const approved: MeterMode = { kind: 'decided', chairsBand: 'approved' };
const log = (
  memberId: string,
  verdictVote: ScoredLog['verdictVote'],
  weight = 1,
  cost: ScoredLog['cost'] = '££'
): ScoredLog => ({ memberId, verdictVote, cost, weight });

describe('the scale', () => {
  it('covers 0 to 100 in three adjoining bands', () => {
    assert.deepEqual(
      SWING_BANDS.map((entry) => [entry.band, entry.min, entry.max]),
      [
        ['rejected', 0, 30],
        ['if_we_must', 30, 65],
        ['approved', 65, 100],
      ]
    );
  });

  it('puts edges in the higher band', () => {
    assert.equal(bandOf(0), 'rejected');
    assert.equal(bandOf(29.9), 'rejected');
    assert.equal(bandOf(30), 'if_we_must');
    assert.equal(bandOf(64.9), 'if_we_must');
    assert.equal(bandOf(65), 'approved');
    assert.equal(bandOf(100), 'approved');
  });

  it('maps votes to the position of logScore', () => {
    for (const vote of ['approve', 'if_we_must', 'reject'] as const) {
      assert.equal(VOTE_POSITIONS[vote], ((logScore({ verdictVote: vote }) - 1) / 4) * 100);
    }
  });

  it('gives each tier a mode', () => {
    assert.deepEqual(meterMode({ tier: 'approved', closed: false }), approved);
    assert.deepEqual(meterMode({ tier: 'rejected', closed: false }), {
      kind: 'decided',
      chairsBand: 'rejected',
    });
    assert.equal(meterMode({ tier: 'under_consideration', closed: false }).kind, 'straw_poll');
    assert.equal(meterMode({ tier: 'to_be_assessed', closed: false }).kind, 'straw_poll');
    assert.equal(meterMode({ tier: 'gone_but_not_forgotten', closed: false }).kind, 'none');
    assert.equal(meterMode({ tier: 'approved', closed: true }).kind, 'none');
    assert.equal(meterMode({ tier: null, closed: false }).kind, 'none');
  });
});

describe('the People’s score', () => {
  it('is the anchor with no logs', () => {
    assert.equal(peoplePosition(summariseLogs([]), approved), bandCentre('approved'));
    assert.equal(peoplePosition(summariseLogs([]), { kind: 'straw_poll' }), 50);
    assert.equal(peoplePosition(summariseLogs([]), { kind: 'none' }), null);
  });

  it('is a Bayesian average pulled towards the Chairs’ band centre', () => {
    const aggregate = summariseLogs(['a', 'b', 'c', 'd', 'e'].map((id) => log(id, 'if_we_must')));
    const expected =
      (bandCentre('approved') * SWING_PRIOR_WEIGHT + 50 * 5) / (SWING_PRIOR_WEIGHT + 5);
    assert.equal(peoplePosition(aggregate, approved), expected);
  });

  it('lets five established members outweigh the prior, but not five new ones', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const established = summariseLogs(ids.map((id) => log(id, 'reject', memberWeight(10))));
    const fresh = summariseLogs(ids.map((id) => log(id, 'reject', memberWeight(1))));
    assert.equal(bandOf(peoplePosition(established, approved)!), 'if_we_must');
    assert.equal(bandOf(peoplePosition(fresh, approved)!), 'approved');
    assert.ok(peoplePosition(fresh, approved)! > peoplePosition(established, approved)!);
  });

  it('summarises members, logs, verdicts, cost and spread', () => {
    const summary = summariseLogs([
      log('a', 'approve', 1, '£'),
      log('a', 'approve', 1, '£'),
      log('b', 'reject', 1, '£££'),
    ]);
    assert.equal(summary.eligibleMembers, 2);
    assert.equal(summary.eligibleLogs, 3);
    assert.deepEqual(summary.verdictCounts, { approve: 2, if_we_must: 0, reject: 1 });
    assert.equal(summary.typicalCost, '£');
    assert.ok(summary.variance > 0);
    assert.equal(summariseLogs([log('a', 'approve')]).variance, 0);
    assert.equal(summariseLogs([]).typicalCost, null);
  });

  it('measures how far a position is outside a band', () => {
    assert.equal(distanceFromBand(50, 'if_we_must'), 0);
    assert.equal(distanceFromBand(20, 'if_we_must'), -10);
    assert.equal(distanceFromBand(90, 'if_we_must'), 25);
  });
});

describe('quorum', () => {
  it('needs five distinct eligible members', () => {
    assert.equal(SWING_QUORUM, 5);
    assert.equal(hasQuorum(4), false);
    assert.equal(hasQuorum(5), true);
  });

  it('shows no bar and no headline below it', () => {
    const swing = buildVenueSwing(
      approved,
      summariseLogs([log('a', 'reject'), log('b', 'reject')]),
      [{ day: '2026-01-01', position: 10 }]
    )!;
    assert.equal(swing.quorate, false);
    assert.equal(swing.position, null);
    assert.equal(swing.headline, null);
    assert.equal(swing.description, null);
    assert.deepEqual(swing.history, []);
    assert.equal(swing.eligibleMembers, 2);
  });

  it('is null for a venue with no meter', () => {
    assert.equal(buildVenueSwing({ kind: 'none' }, summariseLogs([]), []), null);
  });
});

describe('headlines', () => {
  it('concurs inside the Chairs’ band', () => {
    assert.deepEqual(headlineFor(approved, 80), { kind: 'concur', text: 'The People Concur' });
    assert.equal(headlineFor(approved, 65)?.kind, 'concur');
  });

  it('names the band when the People cross a boundary', () => {
    assert.deepEqual(headlineFor(approved, 64), {
      kind: 'dissent',
      band: 'if_we_must',
      text: 'The People would have it If We Must',
    });
    assert.equal(
      headlineFor({ kind: 'decided', chairsBand: 'rejected' }, 70)?.text,
      'The People would have it Approved'
    );
  });

  it('gives a Straw Poll no verdict to agree or dissent with', () => {
    assert.equal(headlineFor({ kind: 'straw_poll' }, 90)?.kind, 'straw_poll');
    assert.equal(chipText({ kind: 'straw_poll' }, 90), null);
    assert.equal(headlineFor({ kind: 'none' }, 90), null);
  });

  it('never calls the score a verdict', () => {
    const swing = buildVenueSwing(
      approved,
      summariseLogs(['a', 'b', 'c', 'd', 'e'].map((id) => log(id, 'reject', 1))),
      []
    )!;
    assert.ok(swing.quorate);
    for (const text of [swing.headline?.text, swing.description]) {
      assert.ok(text && !/verdict/i.test(text.replace('The Chairs’ verdict is', '')));
    }
  });

  it('writes the chip in words', () => {
    assert.equal(chipText(approved, 80), 'The People Concur');
    assert.equal(chipText(approved, 50), 'People: If We Must');
  });
});
