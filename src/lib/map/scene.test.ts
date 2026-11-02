import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Venue } from '@/types';
import { BASE_LAT, BASE_LNG } from './config';
import { overlaps, pinRect, type Rect } from './labels';
import { project, unproject } from './projection';
import { createLedgerMapScene, type SceneView } from './scene';

const BASE = { lat: BASE_LAT, lng: BASE_LNG };
// One degree of latitude is about 111 km; of longitude, about 66 km at Manchester's latitude.
const METRES_PER_LAT = 111_000;
const METRES_PER_LNG = 66_000;

function venue(
  id: string,
  northMetres: number,
  eastMetres: number,
  overrides: Partial<Venue> = {}
): Venue {
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

/** A desktop-sized view over Base. */
function view(zoom: number, overrides: Partial<SceneView> = {}): SceneView {
  return { ...BASE, zoom, width: 900, height: 700, controls: [], ...overrides };
}

// Two venues a street apart (cluster when zoomed out, separate up close), and three in one building.
const streetPair = [venue('street-a', 300, 300), venue('street-b', 300, 340)];
const building = [
  venue('flat-1', -400, 200),
  venue('flat-2', -400, 200.5),
  venue('flat-3', -400.5, 200),
];
const loner = venue('loner', 900, -900);
const all = [...streetPair, ...building, loner];

function sceneWith(venues: readonly Venue[], at: SceneView, clock = { now: 0 }) {
  const scene = createLedgerMapScene({ maxZoom: 18, now: () => clock.now });
  scene.setVenues(venues, { reframe: false });
  scene.setView(at);
  return scene;
}

const pinIds = (scene: ReturnType<typeof sceneWith>) =>
  scene
    .frame()
    .markers.pins.map((pin) => pin.id)
    .sort();

const clusterOf = (scene: ReturnType<typeof sceneWith>, id: string) =>
  scene.frame().markers.clusters.find(({ cluster }) => cluster.venues.some((v) => v.id === id))
    ?.cluster;

describe('projection', () => {
  it("matches Leaflet's spherical Mercator (EPSG:3857) for Base", () => {
    // Leaflet: R = 6378137, x = R·λ, y = R·ln(tan(π/4 + φ/2)), then scaled by 0.5/(πR) and offset by 0.5.
    const R = 6378137;
    const lambda = (BASE.lng * Math.PI) / 180;
    const phi = (BASE.lat * Math.PI) / 180;
    const scale = 256 * 2 ** 16;
    const expected = {
      x: scale * ((0.5 / (Math.PI * R)) * R * lambda + 0.5),
      y: scale * ((-0.5 / (Math.PI * R)) * R * Math.log(Math.tan(Math.PI / 4 + phi / 2)) + 0.5),
    };
    const actual = project(BASE, 16);
    assert.ok(Math.abs(actual.x - expected.x) < 1e-6);
    assert.ok(Math.abs(actual.y - expected.y) < 1e-6);
  });

  it('round-trips a point', () => {
    const back = unproject(project(BASE, 17), 17);
    assert.ok(Math.abs(back.lat - BASE.lat) < 1e-9);
    assert.ok(Math.abs(back.lng - BASE.lng) < 1e-9);
  });
});

describe('Ledger Map scene: what is drawn', () => {
  it('draws nothing until it knows the view', () => {
    const scene = createLedgerMapScene({ maxZoom: 18 });
    scene.setVenues(all, { reframe: false });
    const frame = scene.frame();
    assert.deepEqual(frame.markers.pins, []);
    assert.deepEqual(frame.markers.clusters, []);
    assert.equal(frame.outsideCount, 0);
  });

  it('covers every venue exactly once, as pins and clusters', () => {
    for (const zoom of [12, 15, 17, 18]) {
      const { markers } = sceneWith(all, view(zoom)).frame();
      const shown = [
        ...markers.pins.map((pin) => pin.id),
        ...markers.clusters.flatMap(({ cluster }) => cluster.venues.map((v) => v.id)),
      ].sort();
      assert.deepEqual(shown, all.map((v) => v.id).sort(), `at zoom ${zoom}`);
    }
  });

  it('labels clusters "Zoom in" until the deepest zoom, then "Spread out"', () => {
    const zoomedOut = sceneWith(all, view(15)).frame().markers.clusters;
    assert.ok(zoomedOut.length > 0);
    assert.ok(zoomedOut.every(({ label }) => label.endsWith('Zoom in')));
    const deepest = sceneWith(all, view(18)).frame().markers.clusters;
    assert.ok(deepest.length > 0);
    assert.ok(deepest.every(({ label }) => label.endsWith('Spread out')));
  });

  it('keeps the same marker frame while only panning', () => {
    const scene = sceneWith(all, view(16));
    const before = scene.frame().markers;
    scene.setView(view(16, { lat: BASE.lat + 0.001 }));
    assert.equal(scene.frame().markers, before);
    scene.setView(view(17));
    assert.notEqual(scene.frame().markers, before);
  });
});

describe('Ledger Map scene: selection', () => {
  it('pulls a selected venue out of its cluster, and lets it rejoin when let go', () => {
    const scene = sceneWith(all, view(14));
    assert.ok(clusterOf(scene, 'street-a'), 'clustered at zoom 14');
    scene.select('street-a');
    assert.ok(pinIds(scene).includes('street-a'));
    assert.equal(clusterOf(scene, 'street-a'), undefined);
    scene.select(null);
    assert.ok(clusterOf(scene, 'street-a'));
  });

  it('lets go of a selected venue the filters hide', () => {
    const scene = sceneWith(all, view(16));
    scene.select('loner');
    scene.setVenues(
      all.filter((v) => v.id !== 'loner'),
      { reframe: false }
    );
    assert.equal(scene.selected(), null);
  });

  it('keeps a selected venue the filters still match', () => {
    const scene = sceneWith(all, view(16));
    scene.select('loner');
    scene.setVenues(
      all.filter((v) => v.id !== 'street-a'),
      { reframe: false }
    );
    assert.equal(scene.selected(), 'loner');
  });

  it('says what a venue is drawn as, for its list row', () => {
    const scene = sceneWith(all, view(14));
    assert.deepEqual(scene.markerOf('loner'), { kind: 'pin', venueId: 'loner' });
    assert.equal(scene.markerOf('street-a')?.kind, 'cluster');
    assert.equal(scene.markerOf('nowhere'), null);
  });
});

describe('Ledger Map scene: opening a cluster', () => {
  it('zooms to a cluster that splits, far enough to split it', () => {
    const scene = sceneWith(all, view(14));
    const cluster = clusterOf(scene, 'street-a')!;
    const move = scene.openCluster(cluster.key)!;
    assert.ok(move.zoom >= cluster.expansionZoom);
    assert.ok(move.zoom <= 18);
    scene.setView(view(move.zoom, { lat: move.lat, lng: move.lng }));
    assert.ok(pinIds(scene).includes('street-a'));
    assert.ok(pinIds(scene).includes('street-b'));
  });

  it('fans out a one-building cluster tapped at the deepest zoom, in place', () => {
    const scene = sceneWith(all, view(18));
    const cluster = clusterOf(scene, 'flat-1')!;
    assert.equal(scene.openCluster(cluster.key), null);
    const { markers } = scene.frame();
    assert.equal(markers.fanOut?.key, cluster.key);
    assert.deepEqual(markers.fanOut?.pins.map((pin) => pin.venue.id).sort(), [
      'flat-1',
      'flat-2',
      'flat-3',
    ]);
    assert.equal(clusterOf(scene, 'flat-1'), undefined, 'the fan-out draws in its place');
    assert.deepEqual(scene.markerOf('flat-2'), { kind: 'fan-out', venueId: 'flat-2' });
  });

  it('spreads fanned-out pins clear of each other', () => {
    const scene = sceneWith(all, view(18));
    scene.openCluster(clusterOf(scene, 'flat-1')!.key);
    const rects = scene.frame().markers.fanOut!.pins.map((pin) => pinRect(project(pin.at, 18)));
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) assert.ok(!overlaps(rects[i], rects[j]));
  });

  it('zooms to street level first when tapped from afar, then fans out', () => {
    const scene = sceneWith(all, view(15));
    const cluster = clusterOf(scene, 'flat-1')!;
    const move = scene.openCluster(cluster.key)!;
    assert.equal(move.zoom, 18);
    assert.equal(scene.frame().markers.fanOut, null);
    scene.setView(view(18, { lat: move.lat, lng: move.lng }));
    assert.ok(scene.frame().markers.fanOut);
  });

  it('forgets the fan-out if the zoom takes too long', () => {
    const clock = { now: 0 };
    const scene = sceneWith(all, view(15), clock);
    scene.openCluster(clusterOf(scene, 'flat-1')!.key);
    clock.now = 3001;
    scene.setView(view(18));
    assert.equal(scene.frame().markers.fanOut, null);
  });

  it('folds a fan-out away on request, on a filter change, and when its cluster has gone', () => {
    const scene = sceneWith(all, view(18));
    const key = clusterOf(scene, 'flat-1')!.key;
    scene.openCluster(key);
    assert.equal(scene.collapseFanOut(), true);
    assert.equal(scene.collapseFanOut(), false);

    scene.openCluster(key);
    scene.setVenues(all, { reframe: false });
    assert.equal(scene.frame().markers.fanOut, null);

    scene.openCluster(clusterOf(scene, 'flat-1')!.key);
    scene.setVenues(
      all.filter((v) => v.id !== 'flat-3'),
      { reframe: false }
    );
    assert.equal(scene.frame().markers.fanOut, null);
  });

  it('keeps a fan-out while the map pans', () => {
    const scene = sceneWith(all, view(18));
    scene.openCluster(clusterOf(scene, 'flat-1')!.key);
    scene.setView(view(18, { lng: BASE.lng + 0.001 }));
    assert.ok(scene.frame().markers.fanOut);
  });
});

describe('Ledger Map scene: labels', () => {
  it('shows no names below zoom 16', () => {
    assert.deepEqual(sceneWith(all, view(15)).frame().markers.names, []);
  });

  it('names single pins without touching any pin or each other', () => {
    const { markers } = sceneWith(all, view(17)).frame();
    assert.ok(markers.names.length > 0);
    const pinIdsShown = new Set(markers.pins.map((pin) => pin.id));
    const boxes = markers.names.map((label) => {
      assert.ok(pinIdsShown.has(label.id), `${label.id} is a single pin`);
      const centre = project(label.at, 17);
      return {
        x: centre.x - label.width / 2,
        y: centre.y - label.height / 2,
        width: label.width,
        height: label.height,
      };
    });
    const pins = markers.pins.map((pin) => pinRect(project({ lat: pin.lat!, lng: pin.lng! }, 17)));
    for (const box of boxes) for (const pin of pins) assert.ok(!overlaps(box, pin));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(boxes[i], boxes[j]));
  });

  it('labels the walking rings while they show, and none once hidden', () => {
    const scene = sceneWith(all, view(15));
    assert.ok(scene.frame().ringLabels.length > 0);
    scene.showRings(false);
    assert.deepEqual(scene.frame().ringLabels, []);
  });

  it("keeps ring labels out from under the map's controls", () => {
    const width = 900;
    const height = 700;
    // The whole top half is controls: every ring label must sit in the bottom half.
    const controls: Rect[] = [{ x: 0, y: 0, width, height: height / 2 }];
    const at = view(15, { controls });
    const { ringLabels } = sceneWith(all, at).frame();
    const top = project(BASE, 15).y - height / 2;
    for (const label of ringLabels) {
      const y = project(label.at, 15).y - label.height / 2;
      assert.ok(y >= top + height / 2, `${label.text} is clear of the controls`);
    }
  });
});

describe('Ledger Map scene: framing', () => {
  const far = venue('far', 9000, 9000);

  it('counts matching venues outside the view', () => {
    assert.equal(sceneWith([...all, far], view(15)).frame().outsideCount, 1);
    assert.equal(sceneWith(all, view(15)).frame().outsideCount, 0);
  });

  it('reframes after a filter change only when a venue it would frame is off screen', () => {
    const scene = sceneWith(all, view(15));
    assert.equal(scene.setVenues(all.slice(0, 3), { reframe: true }), null);
    const move = scene.setVenues([...all, far], { reframe: true });
    assert.ok(move);
    assert.ok(move.zoom < 15);
    assert.equal(scene.setVenues([...all, far], { reframe: false }), null);
  });

  it('frames the core on a narrow map and every match on a wide one', () => {
    const many = [...all, venue('near-1', 100, 0), venue('near-2', -100, 0), far];
    const narrow = sceneWith(many, view(15, { width: 390, height: 520 }));
    const wide = sceneWith(many, view(15));
    assert.ok(narrow.frameAll().zoom > narrow.frameEverything().zoom);
    assert.equal(wide.frameAll().zoom, wide.frameEverything().zoom);
  });

  it('frames Base when nothing matches', () => {
    const scene = sceneWith([], view(13));
    assert.deepEqual(scene.frameAll(), { ...BASE, zoom: 15 });
  });
});
