import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { $inspectionsList, $venuesList, seedLedgerInspections, seedLedgerVenues } from './ledger';
import type { Inspection, Venue } from '@/types';

function venue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: 'chip-shop',
    name: 'Chip Shop',
    slug: 'chip-shop',
    status: 'Under Consideration',
    lat: 53.48,
    lng: -2.25,
    distanceMiles: 0.3,
    walkingTimeMin: 6,
    cost: '££',
    cuisine: 'British',
    eatLikeUs: 'Chips',
    lastInspectionDate: '2026-01-01',
    address: 'Manchester',
    mapSearchLink: '',
    ...overrides,
  };
}

const globals = globalThis as any;
const canon = [venue(), venue({ id: 'other', slug: 'other', name: 'Other' })];

beforeEach(() => {
  // The server-side seed only works while there is no `window`.
  delete globals.window;
  seedLedgerVenues(canon);
});

afterEach(() => {
  delete globals.window;
});

describe('seedLedgerVenues', () => {
  it('publishes the venues on the server', () => {
    assert.deepEqual($venuesList.get(), canon);
  });

  it('is ignored in the browser', () => {
    globals.window = {};
    seedLedgerVenues([venue({ slug: 'ignored' })]);
    assert.deepEqual($venuesList.get(), canon);
  });
});

describe('seedLedgerInspections', () => {
  const log: Inspection[] = [{ id: 'i1', venueSlug: 'chip-shop', venueName: 'Chip Shop', date: '2026-10-01', kind: 'verified', outcome: 'satisfactory', chairs: ['Sam', 'Alex'] }];

  it('publishes the inspections on the server', () => {
    seedLedgerInspections(log);
    assert.deepEqual($inspectionsList.get(), log);
  });

  it('is ignored in the browser', () => {
    seedLedgerInspections(log);
    globals.window = {};
    seedLedgerInspections([]);
    assert.deepEqual($inspectionsList.get(), log);
  });
});
