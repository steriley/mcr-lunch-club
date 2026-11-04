import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INSPECTION_OUTCOMES,
  INSPECTION_OUTCOME_BADGE_CLASSES,
  INSPECTION_OUTCOME_LABELS,
  inspectionWitnesses,
  verifiedVisitSummary,
} from './inspection-display';

describe('inspectionWitnesses', () => {
  it('names both Chairs of a verified inspection', () => {
    assert.equal(
      inspectionWitnesses({ kind: 'verified', chairs: ['Sam', 'Alex'] }),
      'Verified by Sam and Alex'
    );
  });

  it('describes a legacy record', () => {
    assert.equal(
      inspectionWitnesses({ kind: 'legacy', chairs: [] }),
      "From the Chairs' earlier records"
    );
  });
});

describe('inspection outcomes', () => {
  it('labels and styles every outcome', () => {
    assert.deepEqual(
      INSPECTION_OUTCOMES.map((outcome) => INSPECTION_OUTCOME_LABELS[outcome]),
      ['Satisfactory', 'Below par']
    );
    for (const outcome of INSPECTION_OUTCOMES) assert.ok(INSPECTION_OUTCOME_BADGE_CLASSES[outcome]);
  });
});

describe('verifiedVisitSummary', () => {
  it('names the date, both Chairs and the outcome', () => {
    assert.equal(
      verifiedVisitSummary('2026-10-21', {
        firstAdminName: 'Sam',
        secondAdminName: 'Alex',
        outcome: 'below_par',
      }),
      '21st Oct 26, verified by Sam and Alex, below par'
    );
  });

  it('leaves the outcome off when none was recorded', () => {
    assert.equal(
      verifiedVisitSummary('2026-10-21', {
        firstAdminName: 'Sam',
        secondAdminName: 'Alex',
        outcome: null,
      }),
      '21st Oct 26, verified by Sam and Alex'
    );
  });
});
