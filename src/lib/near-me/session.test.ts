import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Venue } from '@/types';
import { BASE_LAT, BASE_LNG } from '@/lib/map/config';
import { LIST_SETTLE_MS, createNearMeSession, type SessionPosition } from './session';

// One degree of latitude is about 111 km; of longitude, about 66 km at Manchester's latitude.
const METRES_PER_LAT = 111_000;
const METRES_PER_LNG = 66_000;

function venue(id: string, northMetres: number, overrides: Partial<Venue> = {}): Venue {
  return {
    id,
    name: id,
    slug: id,
    tier: 'approved',
    lat: BASE_LAT + northMetres / METRES_PER_LAT,
    lng: BASE_LNG,
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

/** A fix `northMetres` / `eastMetres` from Spinningfields. */
function fix(northMetres: number, eastMetres = 0, accuracy = 10): SessionPosition {
  return {
    lat: BASE_LAT + northMetres / METRES_PER_LAT,
    lng: BASE_LNG + eastMetres / METRES_PER_LNG,
    accuracy,
  };
}

const VENUES = [
  venue('a', 100),
  venue('b', 300),
  venue('c', 500),
  venue('d', 700),
  venue('cheap', 200, { cost: '£' }),
];

function setup(venues: Venue[] = VENUES) {
  let clock = 1000;
  const manual: Array<{ lat: number; lng: number }> = [];
  const session = createNearMeSession({
    venues: () => venues,
    setManualPosition: (p) => manual.push(p),
    now: () => clock,
  });
  session.reset();
  return {
    session,
    manual,
    advance: (ms: number) => (clock += ms),
    ids: () => session.view().ranked.map((rv) => rv.venue.id),
  };
}

describe('re-ranking', () => {
  it('ranks from Spinningfields until there is a fix', () => {
    const { session, ids } = setup();
    assert.equal(session.view().rankedFromBase, true);
    assert.deepEqual(ids(), ['a', 'cheap', 'b', 'c', 'd']);
    assert.equal(session.view().nearest?.venue.id, 'a');
  });

  it('re-ranks when the origin moves past the threshold, not before', () => {
    const { session, ids } = setup();
    session.positionChanged(fix(0));
    const first = session.view().ranked;
    // 5 m: under the threshold, so the very same list stays.
    session.positionChanged(fix(5));
    assert.equal(session.view().ranked, first);
    // Walk 700 m north: well past it.
    session.positionChanged(fix(700));
    assert.notEqual(session.view().ranked, first);
    assert.equal(ids()[0], 'd');
  });

  it('re-ranks when the filters change, even without a move', () => {
    const { session, ids } = setup();
    session.positionChanged(fix(0));
    session.filtersChanged({ tiers: session.view().tiers, costs: ['£'] });
    assert.deepEqual(ids(), ['cheap']);
    assert.deepEqual(
      session.view().pins.map((pin) => pin.venue.id),
      ['cheap']
    );
  });

  it('numbers the pins of the nearest five', () => {
    const many = Array.from({ length: 7 }, (_, i) => venue(`v${i}`, 100 * (i + 1)));
    const { session } = setup(many);
    const ranks = session.view().pins.map((pin) => pin.rank);
    assert.deepEqual(ranks, [1, 2, 3, 4, 5, undefined, undefined]);
  });

  it('keeps venues without a location off the map', () => {
    const { session } = setup([venue('a', 100), venue('nowhere', 0, { lat: undefined })]);
    assert.deepEqual(
      session.view().pins.map((pin) => pin.venue.id),
      ['a']
    );
  });
});

describe('the ranking hold', () => {
  it('holds the ranking while the list is touched', () => {
    const { session, ids } = setup();
    session.positionChanged(fix(0));
    session.listTouched();
    session.positionChanged(fix(700));
    assert.equal(ids()[0], 'a');
    // Still held a long while later: a finger is down.
    session.tick(1000 + 60_000);
    assert.equal(ids()[0], 'a');
  });

  it('re-ranks after the list settles', () => {
    const { session, ids } = setup();
    session.positionChanged(fix(0));
    session.listTouched();
    session.positionChanged(fix(700));
    session.listReleased(5000);
    assert.equal(session.holdReleasesAt(), 5000 + LIST_SETTLE_MS);
    session.tick(5000 + LIST_SETTLE_MS - 1);
    assert.equal(ids()[0], 'a');
    session.tick(5000 + LIST_SETTLE_MS);
    assert.equal(ids()[0], 'd');
    assert.equal(session.holdReleasesAt(), null);
  });

  it('keeps holding while the list is still scrolling, and while a finger is down', () => {
    const { session } = setup();
    session.listReleased(0);
    session.listScrolled(300);
    assert.equal(session.holdReleasesAt(), 300 + LIST_SETTLE_MS);
    session.listTouched();
    session.listScrolled(900);
    assert.equal(session.holdReleasesAt(), null);
  });

  it('applies filter changes straight away, held or not', () => {
    const { session, ids } = setup();
    session.listTouched();
    session.filtersChanged({ tiers: session.view().tiers, costs: ['£'] });
    assert.deepEqual(ids(), ['cheap']);
  });
});

describe('framing the first fix', () => {
  it('fits the visitor and the nearest three venues, once', () => {
    const { session } = setup();
    session.positionChanged(fix(0));
    const move = session.takeMove();
    assert.equal(move?.kind, 'fit-first-fix');
    if (move?.kind === 'fit-first-fix') assert.equal(move.points.length, 4);
    assert.equal(session.view().fittedFirstFix, true);

    session.positionChanged(fix(400));
    assert.notEqual(session.takeMove()?.kind, 'fit-first-fix');
  });

  it('waits for something to frame', () => {
    const { session } = setup([]);
    session.positionChanged(fix(0));
    assert.equal(session.takeMove(), null);
    assert.equal(session.view().fittedFirstFix, false);
  });

  it('keeps the Spinningfields framing when far from Manchester, and counts the fix as framed', () => {
    const { session } = setup();
    session.positionChanged(fix(200_000));
    assert.equal(session.view().banner.farFromManchester, true);
    assert.equal(session.view().fittedFirstFix, true);
    assert.equal(session.view().rankedFromBase, true);
    assert.equal(session.takeMove(), null);
  });

  it('frames the next fix afresh once back in range', () => {
    const { session } = setup();
    session.positionChanged(fix(200_000));
    session.positionChanged(fix(0));
    assert.equal(session.view().banner.farFromManchester, false);
    assert.equal(session.takeMove()?.kind, 'fit-first-fix');
  });

  it('flags an approximate fix', () => {
    const { session } = setup();
    session.positionChanged(fix(0, 0, 250));
    assert.equal(session.view().banner.lowAccuracy, true);
    session.positionChanged(fix(0, 0, 20));
    assert.equal(session.view().banner.lowAccuracy, false);
  });
});

describe('following', () => {
  it('shows each new fix once it follows a framed visitor', () => {
    const { session } = setup();
    session.positionChanged(fix(0));
    session.takeMove();
    session.positionChanged(fix(50));
    const move = session.takeMove();
    assert.equal(move?.kind, 'show-point');
  });

  it('stops following when a venue is selected, and recentring resumes it', () => {
    const { session } = setup();
    session.positionChanged(fix(0));
    session.takeMove();
    session.selectFromList('b');
    assert.equal(session.view().following, false);
    assert.equal(session.takeMove()?.kind, 'focus-venue');

    session.positionChanged(fix(50));
    assert.equal(session.takeMove(), null);

    assert.equal(session.recentre(), true);
    assert.equal(session.view().following, true);
    assert.equal(session.takeMove()?.kind, 'show-point');
  });

  it('recentring with no fix follows but has nowhere to go', () => {
    const { session } = setup();
    session.returnToBase();
    session.takeMove();
    assert.equal(session.recentre(), false);
    assert.equal(session.view().following, true);
    assert.equal(session.takeMove(), null);
  });

  it('returning to Base stops following and shows Base', () => {
    const { session } = setup();
    session.returnToBase();
    assert.equal(session.view().following, false);
    assert.deepEqual(session.takeMove(), { kind: 'show-base' });
  });

  it('stops following when the visitor drags the map', () => {
    const { session } = setup();
    session.userMovedMap();
    assert.equal(session.view().following, false);
  });

  it("doesn't stop following for a move the map made itself", () => {
    const { session, advance } = setup();
    session.positionChanged(fix(0));
    session.takeMove();
    session.recentre();
    assert.ok(session.takeMove());
    // The map's own zoom/pan events fire as it moves.
    session.userMovedMap();
    assert.equal(session.view().following, true);
    // Once the move has settled, a drag is the visitor's.
    advance(1000);
    session.userMovedMap();
    assert.equal(session.view().following, false);
  });
});

describe('selection', () => {
  it('records where the selection came from', () => {
    const { session } = setup();
    session.selectFromPin('b');
    let view = session.view();
    assert.equal(view.selectedId, 'b');
    assert.equal(view.selectionSource, 'pin');
    assert.equal(view.selection?.venue.id, 'b');
    assert.equal(view.selection?.rank, 3);

    session.selectFromList('c');
    view = session.view();
    assert.equal(view.selectionSource, 'list');
    // A list row is highlighted in place, so there is no "Your selection" card.
    assert.equal(view.selection, null);
    assert.equal(view.selectedId, 'c');
  });

  it('keeps a pinned venue the filters have left out, without a rank', () => {
    const { session } = setup();
    session.selectFromPin('cheap');
    session.filtersChanged({ tiers: session.view().tiers, costs: ['££'] });
    const { selection } = session.view();
    assert.equal(selection?.venue.id, 'cheap');
    assert.equal(selection?.rv, null);
    assert.equal(selection?.rank, undefined);
  });

  it('previews the selected venue, else the nearest', () => {
    const { session } = setup();
    assert.equal(session.view().preview?.rv.venue.id, 'a');
    session.selectFromList('c');
    assert.deepEqual(
      { id: session.view().preview?.rv.venue.id, rank: session.view().preview?.rank },
      { id: 'c', rank: 4 }
    );
    session.clearSelection();
    assert.equal(session.view().preview?.rv.venue.id, 'a');
    assert.equal(session.view().selectedId, null);
  });

  it('asks the map to focus the selected venue', () => {
    const { session } = setup();
    session.selectFromPin('b');
    const move = session.takeMove();
    assert.equal(move?.kind, 'focus-venue');
    assert.equal(move?.kind === 'focus-venue' && move.id, 'b');
    assert.equal(move?.kind === 'focus-venue' && move.source, 'pin');
  });

  it('ignores a venue it has never heard of', () => {
    const { session } = setup();
    session.selectFromPin('nope');
    assert.equal(session.view().selectedId, null);
    assert.equal(session.takeMove(), null);
  });
});

describe('picking a location', () => {
  it('sets a manual position, follows it, and shows it', () => {
    const { session, manual } = setup();
    session.startPicking();
    assert.equal(session.view().banner.picking, true);
    session.pickedLocation({ lat: 53.48, lng: -2.24 });
    assert.deepEqual(manual, [{ lat: 53.48, lng: -2.24 }]);
    assert.equal(session.view().picking, false);
    assert.equal(session.view().following, true);
    assert.deepEqual(session.takeMove(), { kind: 'show-point', lat: 53.48, lng: -2.24 });
  });

  it('follows the pick even after a selection stopped it', () => {
    const { session } = setup();
    session.selectFromList('a');
    session.startPicking();
    session.pickedLocation({ lat: 53.48, lng: -2.24 });
    assert.equal(session.view().following, true);
  });

  it('ignores a tap on the map when not picking', () => {
    const { session, manual } = setup();
    session.pickedLocation({ lat: 53.48, lng: -2.24 });
    assert.deepEqual(manual, []);
    assert.equal(session.takeMove(), null);
  });

  it('can be cancelled', () => {
    const { session } = setup();
    session.startPicking();
    session.stopPicking();
    assert.equal(session.view().picking, false);
  });
});

describe('events and reset', () => {
  it('tells subscribers after each event, until they stop', () => {
    const { session } = setup();
    let calls = 0;
    const stop = session.subscribe(() => calls++);
    session.selectFromList('a');
    session.clearSelection();
    assert.equal(calls, 2);
    stop();
    session.startPicking();
    assert.equal(calls, 2);
  });

  it('starts over on reset', () => {
    const { session, ids } = setup();
    session.positionChanged(fix(0, 0, 300));
    session.selectFromPin('b');
    session.filtersChanged({ tiers: session.view().tiers, costs: ['£'] });
    session.reset();
    const view = session.view();
    assert.equal(view.position, null);
    assert.equal(view.selectedId, null);
    assert.equal(view.following, true);
    assert.equal(view.fittedFirstFix, false);
    assert.equal(view.banner.lowAccuracy, false);
    assert.deepEqual(view.costs, []);
    assert.equal(session.takeMove(), null);
    assert.equal(ids().length, 5);
  });
});
