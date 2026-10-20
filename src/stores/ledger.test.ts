import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  $inspectionsList,
  $venuesList,
  addInspection,
  changeVenueTier,
  resetLedgerToCanon,
  seedLedgerVenues,
  suggestVenue,
} from './ledger';
import type { Inspection, Venue } from '@/types';

function venue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: 'chip-shop',
    name: 'Chip Shop',
    slug: 'chip-shop',
    status: 'Under Consideration',
    rank: null,
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

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const globals = globalThis as any;
const canon = [venue(), venue({ id: 'other', slug: 'other', name: 'Other' })];
let alerts: string[];

beforeEach(() => {
  // The server-side seed only works while there is no `window`.
  delete globals.window;
  seedLedgerVenues(canon);
  $inspectionsList.set([]);
  alerts = [];
  globals.alert = (message: string) => alerts.push(message);
});

afterEach(() => {
  delete globals.window;
  delete globals.localStorage;
  delete globals.alert;
});

function useBrowser() {
  const storage = new MemoryStorage();
  globals.window = {};
  globals.localStorage = storage;
  return storage;
}

describe('seedLedgerVenues', () => {
  it('publishes the venues on the server', () => {
    assert.deepEqual($venuesList.get(), canon);
  });

  it('is ignored in the browser', () => {
    useBrowser();
    seedLedgerVenues([venue({ slug: 'ignored' })]);
    assert.deepEqual($venuesList.get(), canon);
  });
});

describe('changeVenueTier', () => {
  it('requires a reason', () => {
    assert.equal(changeVenueTier('chip-shop', 'Approved', '   '), false);
    assert.equal(changeVenueTier('chip-shop', 'Approved', ''), false);
    assert.equal(alerts.length, 2);
    assert.equal($venuesList.get()[0].status, 'Under Consideration');
  });

  it('returns false for an unknown venue', () => {
    assert.equal(changeVenueTier('missing', 'Approved', 'Because'), false);
  });

  it('updates the status, appends to the notes and logs a decree inspection', () => {
    assert.equal(changeVenueTier('chip-shop', 'Approved', 'Excellent chips'), true);
    const updated = $venuesList.get()[0];
    assert.equal(updated.status, 'Approved');
    assert.match(updated.notes!, /Under Consideration ➔ Approved: Excellent chips/);

    const [decree] = $inspectionsList.get();
    assert.match(decree.id, /^decree-chip-shop-/);
    assert.equal(decree.verdict, 'satisfactory');
    assert.equal(decree.venueName, 'Chip Shop');
    assert.equal(updated.lastInspectionDate, decree.date);

    changeVenueTier('chip-shop', 'Approved', 'Still good');
    assert.ok($venuesList.get()[0].notes!.includes(' | '));
  });

  it('records the reason as the rejection reason only for Rejected and If We Must', () => {
    changeVenueTier('chip-shop', 'Rejected', 'Soggy');
    assert.equal($venuesList.get()[0].rejectionReason, 'Soggy');
    assert.equal($inspectionsList.get()[0].verdict, 'sub-par');

    changeVenueTier('chip-shop', 'If We Must', 'Grudging');
    assert.equal($venuesList.get()[0].rejectionReason, 'Grudging');

    changeVenueTier('chip-shop', 'Approved', 'Redeemed');
    assert.equal($venuesList.get()[0].rejectionReason, 'Grudging');
  });

  it('persists changes to localStorage in the browser', () => {
    const storage = useBrowser();
    changeVenueTier('chip-shop', 'Approved', 'Great');
    assert.ok(storage.getItem('mcr_lunch_club_venues_v2'));
    assert.ok(storage.getItem('mcr_lunch_club_inspections_v1'));
  });
});

describe('addInspection', () => {
  const inspection: Inspection = {
    id: 'i1',
    venueSlug: 'other',
    venueName: 'Other',
    date: '2026-10-01',
    attendees: ['Ann'],
    verdict: 'satisfactory',
    whatWasOrdered: 'Soup',
  };

  it('prepends the inspection and updates the venue inspection date', () => {
    addInspection(inspection);
    assert.equal($inspectionsList.get()[0], inspection);
    assert.equal($venuesList.get()[1].lastInspectionDate, '2026-10-01');
    assert.equal($venuesList.get()[0].lastInspectionDate, '2026-01-01');
  });

  it('still records inspections for venues that are not in the list', () => {
    addInspection({ ...inspection, venueSlug: 'unknown' });
    assert.equal($inspectionsList.get().length, 1);
    assert.deepEqual($venuesList.get(), canon);
  });
});

describe('suggestVenue', () => {
  const params = {
    name: `Joe's "Café" Diner`,
    address: '1 High St',
    cuisine: 'Diner',
    cost: '£' as const,
    recommendedOrder: '',
    rationale: 'Great pie',
    submitter: '',
  };

  it('adds a To Be Assessed venue at the top with a slug and defaults', () => {
    const created = suggestVenue(params);
    assert.equal(created.slug, 'joes-caf-diner');
    assert.equal(created.status, 'To Be Assessed');
    assert.equal(created.eatLikeUs, 'Awaiting preliminary committee sampling recommendation.');
    assert.match(created.notes!, /Anonymous Subject/);
    assert.equal(
      created.mapSearchLink,
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${params.name} Manchester`)}`
    );
    assert.equal($venuesList.get()[0], created);
  });

  it('keeps the submitter and recommended order when given', () => {
    const created = suggestVenue({ ...params, recommendedOrder: 'The pie', submitter: 'Ann' });
    assert.equal(created.eatLikeUs, 'The pie');
    assert.match(created.notes!, /Petition submitted by Ann/);
  });
});

describe('resetLedgerToCanon', () => {
  it('restores the seeded venues and clears stored state', () => {
    const storage = useBrowser();
    changeVenueTier('chip-shop', 'Approved', 'Great');
    assert.ok(storage.getItem('mcr_lunch_club_venues_v2'));

    resetLedgerToCanon();
    assert.deepEqual($venuesList.get(), canon);
    assert.equal(storage.getItem('mcr_lunch_club_venues_v2'), null);
    assert.equal(storage.getItem('mcr_lunch_club_inspections_v1'), null);
  });

  it('works on the server too', () => {
    changeVenueTier('chip-shop', 'Approved', 'Great');
    resetLedgerToCanon();
    assert.deepEqual($venuesList.get(), canon);
  });
});
