import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLUSTER_MAX_ZOOM,
  clusterLabel,
  createClusterIndex,
  spiderfyOffsets,
  type ClusterItem,
  type MapItem,
} from './clusters';
import type { Venue } from '@/types';

const BASE = { lat: 53.479, lng: -2.252 };
// One degree of latitude is about 111 km; of longitude, about 66 km at Manchester's latitude.
const METRES_PER_LAT = 111_000;
const METRES_PER_LNG = 66_000;

function venue(id: string, northMetres: number, eastMetres: number, overrides: Partial<Venue> = {}): Venue {
  return {
    id,
    name: id,
    slug: id,
    tier: 'approved',
    lat: BASE.lat + northMetres / METRES_PER_LAT,
    lng: BASE.lng + eastMetres / METRES_PER_LNG,
    distanceMiles: 0.3,
    walkingTimeMin: 6,
    cost: '££',
    cuisine: 'British',
    eatLikeUs: '',
    lastInspectionDate: '2026-09-01',
    address: '',
    mapSearchLink: '',
    ...overrides,
  };
}

/** A repeatable scatter of venues over about 3 km, plus some that share a street. */
function scatter(): Venue[] {
  let seed = 7;
  const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const venues = Array.from({ length: 90 }, (_, i) => venue(`v${i}`, (next() - 0.5) * 3000, (next() - 0.5) * 3000));
  venues.push(venue('pair-a', 400, 400), venue('pair-b', 412, 405), venue('pair-c', 395, 410));
  return venues;
}

const pixelsPerMetre = (zoom: number) => (256 * 2 ** zoom) / (40_075_000 * Math.cos((BASE.lat * Math.PI) / 180));

/** Where a marker's disc is drawn, in px (x east, y south): a pin's disc sits 16 px above its point. */
function discCentre(item: MapItem, zoom: number) {
  const point = item.kind === 'venue' ? { lat: item.venue.lat!, lng: item.venue.lng! } : item;
  const perMetre = pixelsPerMetre(zoom);
  return {
    x: (point.lng - BASE.lng) * METRES_PER_LNG * perMetre,
    y: -(point.lat - BASE.lat) * METRES_PER_LAT * perMetre - (item.kind === 'venue' ? 16 : 0),
  };
}

const diameter = (item: MapItem) => (item.kind === 'venue' ? 28 : 44);
const venueIds = (items: MapItem[]) => items.flatMap((item) => (item.kind === 'venue' ? [item.venue.id] : item.venues.map((v) => v.id)));

describe('createClusterIndex', () => {
  it('shows every venue exactly once at every zoom', () => {
    const venues = scatter();
    const index = createClusterIndex(venues);
    for (let zoom = 0; zoom <= 19; zoom++) {
      assert.deepEqual(venueIds(index.itemsAt(zoom)).sort(), venues.map((v) => v.id).sort(), `zoom ${zoom}`);
    }
  });

  it('has cluster counts that add up to the venues shown', () => {
    const venues = scatter();
    const items = createClusterIndex(venues).itemsAt(13);
    const total = items.reduce((sum, item) => sum + (item.kind === 'cluster' ? item.count : 1), 0);
    assert.equal(total, venues.length);
    assert.ok(items.some((item) => item.kind === 'cluster'), 'zoomed out, some venues group');
  });

  it('never lets two markers overlap, from zoom 13 to 18', () => {
    const index = createClusterIndex(scatter());
    for (let zoom = 13; zoom <= CLUSTER_MAX_ZOOM; zoom++) {
      const items = index.itemsAt(zoom);
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = discCentre(items[i], zoom);
          const b = discCentre(items[j], zoom);
          const gap = Math.hypot(a.x - b.x, a.y - b.y);
          const touching = (diameter(items[i]) + diameter(items[j])) / 2;
          assert.ok(gap >= touching, `zoom ${zoom}: markers ${gap.toFixed(1)} px apart, need ${touching}`);
        }
      }
    }
  });

  it('merges venues on one street, then splits them as the map zooms in', () => {
    // 20 m apart: about 28 px at zoom 17, 56 px at zoom 18.
    const index = createClusterIndex([venue('a', 0, 0), venue('b', 20, 0)]);
    assert.equal(index.itemsAt(15).length, 1);
    assert.equal(index.itemsAt(17).length, 1);
    assert.equal(index.itemsAt(18).length, 2);
    assert.ok(index.itemsAt(18).every((item) => item.kind === 'venue'));
  });

  it('keeps venues in one building together at the deepest zoom', () => {
    const index = createClusterIndex([venue('a', 0, 0), venue('b', 4, 0), venue('c', 0, 4)]);
    const [item] = index.itemsAt(CLUSTER_MAX_ZOOM);
    assert.equal(item.kind, 'cluster');
    assert.ok((item as ClusterItem).expansionZoom > CLUSTER_MAX_ZOOM, 'it can never split by zooming');
  });

  it('counts venues per tier in display order', () => {
    const index = createClusterIndex([
      venue('a', 0, 0, { tier: 'rejected' }),
      venue('b', 5, 0, { tier: 'approved' }),
      venue('c', 0, 5, { tier: 'approved' }),
      venue('d', 5, 5, { tier: 'under_consideration' }),
    ]);
    const [item] = index.itemsAt(15) as ClusterItem[];
    assert.equal(item.count, 4);
    assert.deepEqual(item.tiers, [
      { tier: 'approved', count: 2 },
      { tier: 'under_consideration', count: 1 },
      { tier: 'rejected', count: 1 },
    ]);
  });

  it('gives the same group the same key in any index', () => {
    const a = venue('a', 0, 0);
    const b = venue('b', 5, 0);
    const [first] = createClusterIndex([a, b]).itemsAt(15) as ClusterItem[];
    const [second] = createClusterIndex([venue('zzz', 2000, 2000), b, a]).itemsAt(15).filter((i) => i.kind === 'cluster') as ClusterItem[];
    assert.equal(first.key, 'a|b');
    assert.equal(second.key, first.key);
  });

  it('skips venues without a location, and copes with none at all', () => {
    const index = createClusterIndex([venue('a', 0, 0), venue('nowhere', 0, 0, { lat: null, lng: null })]);
    assert.deepEqual(venueIds(index.itemsAt(15)), ['a']);
    assert.deepEqual(createClusterIndex([]).itemsAt(15), []);
  });

  it('reads a fractional zoom as the whole zoom below it', () => {
    const index = createClusterIndex(scatter());
    assert.deepEqual(index.itemsAt(14.7).length, index.itemsAt(14).length);
  });
});

describe('clusterLabel', () => {
  it('names the count, the tiers and what a tap does', () => {
    const tiers = [
      { tier: 'approved' as const, count: 3 },
      { tier: 'under_consideration' as const, count: 2 },
    ];
    assert.equal(clusterLabel({ count: 5, tiers }), '5 venues: 3 Approved, 2 Under Consideration. Zoom in');
    assert.equal(clusterLabel({ count: 5, tiers }, 'Spread out'), '5 venues: 3 Approved, 2 Under Consideration. Spread out');
  });
});

describe('spiderfyOffsets', () => {
  it('has nothing to place for no venues', () => {
    assert.deepEqual(spiderfyOffsets(0), []);
  });

  it('puts the first venue straight above the cluster, then goes clockwise', () => {
    const [first, second] = spiderfyOffsets(4);
    assert.ok(Math.abs(first.x) < 1e-9 && first.y < 0);
    assert.ok(second.x > 0, 'the second is to the right');
  });

  it('keeps every pin the same distance out and apart from its neighbours', () => {
    for (const count of [2, 3, 5, 8, 14]) {
      const offsets = spiderfyOffsets(count);
      const radii = offsets.map((o) => Math.hypot(o.x, o.y));
      assert.ok(radii.every((r) => Math.abs(r - radii[0]) < 1e-9), `${count}: one radius`);
      assert.ok(radii[0] >= 46, `${count}: clear of the cluster's own spot`);
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          assert.ok(Math.hypot(offsets[i].x - offsets[j].x, offsets[i].y - offsets[j].y) >= 28, `${count}: pins ${i} and ${j} touch`);
        }
      }
    }
  });
});
