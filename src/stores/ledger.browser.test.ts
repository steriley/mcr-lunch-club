import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Venue } from '@/types';

/**
 * The ledger reads the page once, at import time. Each scenario sets up a fake
 * browser and re-runs the start-up reader directly.
 */
import { getInitialInspections, getInitialVenues } from './ledger';

const globals = globalThis as any;

function venue(slug: string): Venue {
  return {
    id: slug,
    name: slug,
    slug,
    tier: 'approved',
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

function fakeBrowser(options: {
  canon?: string | null;
  inspections?: string;
  storage?: Record<string, string>;
  throwOnRemove?: boolean;
}) {
  const store = new Map(Object.entries(options.storage ?? {}));
  globals.window = {};
  globals.document = {
    getElementById: (id: string) => {
      if (id === 'ledger-canon' && options.canon !== undefined)
        return { textContent: options.canon };
      if (id === 'ledger-inspections' && options.inspections !== undefined)
        return { textContent: options.inspections };
      return null;
    },
  };
  globals.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => {
      if (options.throwOnRemove) throw new Error('blocked');
      store.delete(key);
    },
  };
  return store;
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
  it('reads the published venues embedded in the page', () => {
    fakeBrowser({ canon: JSON.stringify([venue('a')]) });
    assert.deepEqual(getInitialVenues(), [venue('a')]);
  });

  it('starts empty when the page has no or invalid venue data', () => {
    fakeBrowser({});
    assert.deepEqual(getInitialVenues(), []);

    fakeBrowser({ canon: '' });
    assert.deepEqual(getInitialVenues(), []);

    fakeBrowser({ canon: '{not json' });
    const restore = silence();
    try {
      assert.deepEqual(getInitialVenues(), []);
    } finally {
      restore();
    }
  });

  it('ignores and clears venue and inspection edits left by the retired in-browser tools', () => {
    const canon = [venue('a')];
    const store = fakeBrowser({
      canon: JSON.stringify(canon),
      storage: {
        mcr_lunch_club_venues_v1: 'legacy',
        mcr_lunch_club_venues_v2: JSON.stringify({ canon: 'any', venues: [venue('edited')] }),
        mcr_lunch_club_inspections_v1: '[]',
        unrelated: 'kept',
      },
    });
    assert.deepEqual(getInitialVenues(), canon);
    assert.deepEqual([...store.keys()], ['unrelated']);
  });

  it('still reads the published list when storage is blocked', () => {
    fakeBrowser({ canon: JSON.stringify([venue('a')]), throwOnRemove: true });
    assert.deepEqual(getInitialVenues(), [venue('a')]);
  });

  it('reads the inspections embedded in the page, or starts empty without them', () => {
    const log = [
      { id: 'i1', venueSlug: 'a', venueName: 'a', date: '2026-10-01', kind: 'legacy', chairs: [] },
    ];
    fakeBrowser({ inspections: JSON.stringify(log) });
    assert.deepEqual(getInitialInspections(), log);

    fakeBrowser({});
    assert.deepEqual(getInitialInspections(), []);

    fakeBrowser({ inspections: '{not json' });
    const restore = silence();
    try {
      assert.deepEqual(getInitialInspections(), []);
    } finally {
      restore();
    }
  });
});
