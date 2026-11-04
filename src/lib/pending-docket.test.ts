import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PendingInspection } from './inspections';
import { buildPendingEntries, entryNeedsUser } from './pending-docket';
import type { SerializedProposal } from './tier-proposals';
import type { SerializedVisit } from './visits';

const ME = 'me';

const inspection = (venueId: string, firstAt: string, byMe = false): PendingInspection => ({
  inspectionId: `inspection-${venueId}`,
  venueId,
  venueName: `Venue ${venueId}`,
  status: {
    today: '2026-11-03',
    pending: { firstAdminName: byMe ? 'Me' : 'Sam', byMe, firstAt, outcome: 'satisfactory' },
    confirmed: null,
  },
});

const proposal = (
  venueId: string,
  proposedAt: string,
  proposedBy = 'sam'
): SerializedProposal & { venueName: string } => ({
  id: `proposal-${venueId}`,
  venueId,
  venueName: `Venue ${venueId}`,
  fromTier: 'to_be_assessed',
  proposedTier: 'under_consideration',
  proposedBy,
  proposedByName: proposedBy,
  proposedAt,
  status: 'pending',
  decidedByName: null,
  decidedAt: null,
  declineReason: null,
  inspectionId: null,
});

const visit: SerializedVisit = {
  id: 'visit-a',
  venueId: 'a',
  visitDate: '2026-11-03',
  visitorId: 'sam',
  visitorName: 'Sam',
  createdAt: '2026-11-03T12:00:00.000Z',
  inspectionId: 'inspection-a',
  statusLabel: 'Pending',
  notes: [],
};

describe('buildPendingEntries', () => {
  it('puts a venue’s inspection and verdict motion in one entry', () => {
    const entries = buildPendingEntries(
      [inspection('a', '2026-11-03T12:00:00.000Z')],
      [proposal('a', '2026-11-03T12:05:00.000Z')],
      new Map([['a', '1st Oct 26, verified by Sam and Me']]),
      new Map([['inspection-a', [visit]]]),
      ME
    );
    assert.equal(entries.length, 1);
    assert.equal(entries[0].venueName, 'Venue a');
    assert.equal(entries[0].inspection?.pending?.firstAdminName, 'Sam');
    assert.equal(entries[0].proposal?.id, 'proposal-a');
    assert.equal(entries[0].latestVerifiedInspection, '1st Oct 26, verified by Sam and Me');
    assert.equal('venueName' in entries[0].proposal!, false);
    assert.deepEqual(entries[0].inspectionVisits, [visit]);
    assert.deepEqual(entries[0].motionVisits, []);
  });

  it('lists what needs this Chair first, then what waits on others, each oldest first', () => {
    const entries = buildPendingEntries(
      [
        inspection('mine', '2026-11-03T09:00:00.000Z', true),
        inspection('later', '2026-11-03T13:00:00.000Z'),
      ],
      [
        proposal('my-motion', '2026-11-02T09:00:00.000Z', ME),
        proposal('earlier', '2026-11-01T09:00:00.000Z'),
      ],
      new Map(),
      new Map(),
      ME
    );
    assert.deepEqual(
      entries.map((entry) => entry.venueId),
      ['earlier', 'later', 'my-motion', 'mine']
    );
    assert.equal(entries[0].latestVerifiedInspection, null);
  });
});

describe('entryNeedsUser', () => {
  it('is true for someone else’s inspection or motion, false for this Chair’s own', () => {
    const others = inspection('a', '2026-11-03T12:00:00.000Z').status;
    const own = inspection('a', '2026-11-03T12:00:00.000Z', true).status;
    assert.equal(entryNeedsUser({ inspection: others, proposal: null }, ME), true);
    assert.equal(entryNeedsUser({ inspection: own, proposal: null }, ME), false);
    assert.equal(
      entryNeedsUser({ inspection: own, proposal: proposal('a', '2026-11-03T12:00:00.000Z') }, ME),
      true
    );
    assert.equal(
      entryNeedsUser({ inspection: null, proposal: proposal('a', '2026-11-03', ME) }, ME),
      false
    );
  });

  it('is false once the inspection is cosigned', () => {
    const confirmed = {
      today: '2026-11-03',
      pending: null,
      confirmed: {
        firstAdminName: 'Sam',
        secondAdminName: 'Me',
        firstAt: '2026-11-03T12:00:00.000Z',
        confirmedAt: '2026-11-03T12:10:00.000Z',
        outcome: 'satisfactory' as const,
      },
    };
    assert.equal(entryNeedsUser({ inspection: confirmed, proposal: null }, ME), false);
  });
});

describe('buildPendingEntries field notes', () => {
  it('gives a motion the visits of the inspection it cites', () => {
    const motion = { ...proposal('a', '2026-11-03T12:05:00.000Z'), inspectionId: 'inspection-a' };
    const [entry] = buildPendingEntries(
      [],
      [motion],
      new Map(),
      new Map([['inspection-a', [visit]]]),
      ME
    );
    assert.deepEqual(entry.motionVisits, [visit]);
    assert.deepEqual(entry.inspectionVisits, []);
  });
});
