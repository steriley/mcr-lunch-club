import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inspectionWitnesses } from './inspection-display';

describe('inspectionWitnesses', () => {
  it('names both Chairs of a verified inspection', () => {
    assert.equal(inspectionWitnesses({ kind: 'verified', chairs: ['Sam', 'Alex'] }), 'Verified by Sam and Alex');
  });

  it('describes a legacy record', () => {
    assert.equal(inspectionWitnesses({ kind: 'legacy', chairs: [] }), "From the Chairs' earlier records");
  });
});
