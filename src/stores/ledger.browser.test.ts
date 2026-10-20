import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Inspection, Venue } from '@/types';

/**
 * The ledger reads the page and localStorage once, at import time, so each
 * scenario sets up the fake browser and then imports a fresh copy of the module.
 */

const globals = globalThis as any;
let importCount = 0;

function venue(slug: string): Venue {
  return {
    id: slug,
    name: slug,
    slug,
    status: 'Approved',
    lat: 1,
    lng: 2,
    distanceMiles: 1,
    walkingTimeMin: 1,
    cost: '£',
    cuisine: '',
    eatLikeUs: '',
    lastInspectionDate: '',
    address: '',
    mapSearchLink: '',
  };
}

function fakeBrowser(options: { canon?: string | null; storage?: Record<string, string>; throwOnRead?: boolean }) {
  const store = new Map(Object.entries(options.storage ?? {}));
  globals.window = {};
  globals.document = {
    getElementById: (id: string) =>
      id === 'ledger-canon' && options.canon !== undefined ? { textContent: options.canon } : null,
  };
  globals.localStorage = {
    getItem: (key: string) => {
      if (options.throwOnRead) throw new Error('blocked');
      return store.get(key) ?? null;
    },
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  return store;
}

async function loadLedger() {
  importCount += 1;
  return import(`./ledger?scenario=${importCount}`) as Promise<typeof import('./ledger')>;
}

function fingerprintOf(venues: Venue[]): string {
  // Mirrors the module's private hash by round-tripping through its own persistence.
  const text = JSON.stringify(venues);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${venues.length}:${hash >>> 0}`;
}

const silence = () => {
  const original = console.warn;
  console.warn = () => {};
  return () => {
    console.warn = original;
  };
};

afterEach(() => {
  delete globals.window;
  delete globals.document;
  delete globals.localStorage;
});

describe('ledger in the browser', () => {
  it('reads the published venues embedded in the page', async () => {
    fakeBrowser({ canon: JSON.stringify([venue('a')]) });
    const { $venuesList } = await loadLedger();
    assert.deepEqual($venuesList.get(), [venue('a')]);
  });

  it('starts empty when the page has no or invalid venue data', async () => {
    fakeBrowser({});
    assert.deepEqual((await loadLedger()).$venuesList.get(), []);

    fakeBrowser({ canon: '' });
    assert.deepEqual((await loadLedger()).$venuesList.get(), []);

    fakeBrowser({ canon: '{not json' });
    const restore = silence();
    try {
      assert.deepEqual((await loadLedger()).$venuesList.get(), []);
    } finally {
      restore();
    }
  });

  it('restores local edits that match the current published list', async () => {
    const canon = [venue('a')];
    const edited = [{ ...venue('a'), status: 'Rejected' as const }];
    fakeBrowser({
      canon: JSON.stringify(canon),
      storage: { mcr_lunch_club_venues_v2: JSON.stringify({ canon: fingerprintOf(canon), venues: edited }) },
    });
    assert.deepEqual((await loadLedger()).$venuesList.get(), edited);
  });

  it('drops local edits made against an older published list, and the legacy key', async () => {
    const canon = [venue('a')];
    const store = fakeBrowser({
      canon: JSON.stringify(canon),
      storage: {
        mcr_lunch_club_venues_v1: 'legacy',
        mcr_lunch_club_venues_v2: JSON.stringify({ canon: 'stale', venues: [venue('old')] }),
      },
    });
    assert.deepEqual((await loadLedger()).$venuesList.get(), canon);
    assert.equal(store.has('mcr_lunch_club_venues_v2'), false);
    assert.equal(store.has('mcr_lunch_club_venues_v1'), false);
  });

  it('falls back to the published list when storage is unreadable', async () => {
    fakeBrowser({ canon: JSON.stringify([venue('a')]), throwOnRead: true });
    const restore = silence();
    try {
      const { $venuesList, $inspectionsList } = await loadLedger();
      assert.deepEqual($venuesList.get(), [venue('a')]);
      assert.ok(Array.isArray($inspectionsList.get()));
    } finally {
      restore();
    }
  });

  it('restores stored inspections', async () => {
    const inspections: Inspection[] = [
      { id: 'x', venueSlug: 'a', venueName: 'a', date: '2026-01-01', attendees: [], verdict: 'satisfactory', whatWasOrdered: 'Pie' },
    ];
    fakeBrowser({ storage: { mcr_lunch_club_inspections_v1: JSON.stringify(inspections) } });
    assert.deepEqual((await loadLedger()).$inspectionsList.get(), inspections);
  });
});
