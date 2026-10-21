import '../test/setup-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { InspectionRow, TierProposalRow, VenueEventRow } from '@/db/schema';
import { eventEntries, inspectionEntries, motionEntries, revisionEntries, sortTimeline } from './venue-history';

const at = (iso: string) => new Date(iso);

describe('revisionEntries', () => {
  const revisions = [
    { id: 'r3', changedBy: 'u1', changedAt: at('2026-10-21T13:05:00Z'), snapshot: { name: 'Pie Shop', cuisine: 'pizza', updatedAt: 'later' } },
    { id: 'r2', changedBy: 'u1', changedAt: at('2026-10-20T09:00:00Z'), snapshot: { name: 'Pie Shop', cuisine: 'fish_and_chips', updatedAt: 'x' } },
    { id: 'r1', changedBy: null, changedAt: at('2026-10-19T09:00:00Z'), snapshot: { name: 'Pie Shop', cuisine: 'fish_and_chips', updatedAt: 'y' } },
  ];
  const entries = revisionEntries(revisions, new Map([['u1', 'Sam']]));

  it('names the changed fields, ignoring bookkeeping', () => {
    assert.equal(entries[0].text, 'Amended by Sam: Cuisine');
    assert.deepEqual(entries[0].changes, [{ field: 'Cuisine', from: 'Fish & Chips', to: 'Pizza' }]);
    assert.equal(entries[0].when, '21st Oct 26, 14:05');
  });

  it('says when a save changed nothing, and marks the earliest version', () => {
    assert.equal(entries[1].text, 'Saved by Sam with no field changes');
    assert.equal(entries[2].text, 'Earliest recorded version, by Import script');
    assert.equal(entries[2].isFirst, true);
  });
});

describe('inspectionEntries', () => {
  const inspection = (overrides: Partial<InspectionRow>) =>
    ({ id: 'i', inspectionDate: '2026-10-20', kind: 'verified', firstAdminName: 'Sam', secondAdminName: 'Alex', confirmedAt: at('2026-10-20T12:40:00Z'), ...overrides }) as InspectionRow;

  it('dates a verified inspection by its confirmation time', () => {
    const [entry] = inspectionEntries([inspection({})]);
    assert.equal(entry.kind, 'inspection');
    assert.equal(entry.when, '20th Oct 26, 13:40');
    assert.equal(entry.text, 'Inspection of 20th Oct 26: Verified by Sam and Alex');
  });

  it('shows only the date for a legacy record, which has no time', () => {
    const [entry] = inspectionEntries([inspection({ kind: 'legacy', confirmedAt: null })]);
    assert.equal(entry.when, '20th Oct 26');
    assert.match(entry.text, /Legacy record/);
    assert.equal(entry.at.toISOString(), '2026-10-20T12:00:00.000Z');
  });
});

describe('motionEntries and eventEntries', () => {
  it('turns a declined proposal into two motions, keeping the reason as a note', () => {
    const proposal = {
      id: 'p1', fromTier: 'to_be_assessed', proposedTier: 'rejected', proposedByName: 'Sam', proposedAt: at('2026-10-20T10:00:00Z'),
      status: 'declined', decidedByName: 'Alex', decidedAt: at('2026-10-21T10:00:00Z'), declineReason: 'Not yet',
    } as TierProposalRow;
    const entries = motionEntries([proposal]);
    assert.deepEqual(entries.map((entry) => entry.kind), ['motion', 'motion']);
    assert.equal(entries[1].note, 'Not yet');
    assert.ok(!('note' in entries[0]));
  });

  it('describes closures', () => {
    const [entry] = eventEntries([{ id: 'e1', kind: 'closed', actorName: 'Sam', createdAt: at('2026-10-21T08:00:00Z') } as VenueEventRow]);
    assert.equal(entry.text, 'Closed by Sam on 21st Oct 26');
  });
});

describe('sortTimeline', () => {
  it('puts the newest first', () => {
    const entries = [
      { id: 'a', kind: 'event' as const, at: at('2026-01-01T00:00:00Z'), when: '', text: '' },
      { id: 'b', kind: 'event' as const, at: at('2026-03-01T00:00:00Z'), when: '', text: '' },
    ];
    assert.deepEqual(sortTimeline(entries).map((entry) => entry.id), ['b', 'a']);
  });
});
