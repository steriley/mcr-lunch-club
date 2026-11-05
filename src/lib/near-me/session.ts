import type { CostTier, Venue } from '@/types';
import { NEAR_ME_DEFAULT_TIERS, type TierValue } from '@/lib/tiers';
import { BASE_COORDINATES } from '@/lib/map/config';
import {
  FAR_FROM_BASE_METRES,
  hasOriginMovedSignificantly,
  haversineMetres,
  rankVenues,
  resolveRankingOrigin,
  type LatLng,
  type RankedVenue,
} from '@/lib/map/ranking';
import { matchesCost } from './filters';

/**
 * A Near Me session: everything Near Me decides, without Leaflet or Vue. When to
 * re-rank, when to frame the first position fix, whether the map follows the
 * visitor, and which venue is selected and where the selection came from.
 *
 * Events go in (a position, a filter change, a tap, a drag) and plain values come
 * out: `view()` for the island to render, and `takeMove()` for the Leaflet adapter
 * to carry out. Time comes in as arguments or the `now` option, so the rules can
 * be tested without timers.
 */

/** How long after the last touch or scroll on the list the ranking is held still, so rows don't jump. */
export const LIST_SETTLE_MS = 400;

/** The nearest few pins carry their list number. */
const PIN_RANK_LIMIT = 5;
/** The first fix frames the visitor and this many of the nearest venues. */
const FIRST_FIX_VENUES = 3;
/** A fix less precise than this (radius in metres) is called approximate. */
const LOW_ACCURACY_METRES = 100;
/** Programmatic moves end within these, so they aren't mistaken for the visitor's own panning. */
const MOVE_SETTLE_MS = 400;
const FIT_SETTLE_MS = 500;

export interface SessionPosition extends LatLng {
  /** Radius of the fix in metres. */
  accuracy: number;
  /** Placed by hand rather than read from the device. */
  manual?: boolean;
}

/** Where the selection came from: a pin shows it as "Your selection"; a list row is highlighted where it sits. */
export type SelectionSource = 'pin' | 'list';

/** What the map should do next. The adapter works out padding and zoom from the geometry it measures. */
export type MoveIntent =
  | { kind: 'fit-first-fix'; points: LatLng[] }
  | { kind: 'show-point'; lat: number; lng: number }
  | { kind: 'focus-venue'; id: string; lat: number; lng: number; source: SelectionSource }
  | { kind: 'show-base' };

interface NearMePin {
  venue: Venue;
  /** The list number on the nearest few. */
  rank?: number;
}

/** The venue picked on a pin, with its place in the ranking (none when it isn't in the current list). */
interface PinSelection {
  venue: Venue;
  rv: RankedVenue | null;
  rank: number | undefined;
}

export interface NearMeView {
  ranked: RankedVenue[];
  nearest: RankedVenue | null;
  /** The ranking after the nearest, which is the hero card. */
  others: RankedVenue[];
  /** Distances are measured from Spinningfields rather than the visitor. */
  rankedFromBase: boolean;
  selectedId: string | null;
  selectionSource: SelectionSource | null;
  /** How many selections have been made: changes on every one, even of the venue already selected. */
  selections: number;
  /** Set only for a pin selection. */
  selection: PinSelection | null;
  /** What the collapsed sheet shows: the selected venue, else the nearest. */
  preview: { rv: RankedVenue; rank: number } | null;
  /** The venues that get a pin: the selected tiers and prices, with a location. */
  pins: readonly NearMePin[];
  tiers: readonly TierValue[];
  costs: CostTier[];
  position: SessionPosition | null;
  following: boolean;
  picking: boolean;
  /** The first fix has been framed (or is not worth framing). */
  fittedFirstFix: boolean;
  /** The part of the status banner's input that the session owns. */
  banner: { picking: boolean; farFromManchester: boolean; lowAccuracy: boolean };
}

export interface NearMeSessionOptions {
  /** The venues to rank, read each time the ranking is worked out. */
  venues: () => readonly Venue[];
  /** A location picked on the map becomes the visitor's position. */
  setManualPosition?: (position: LatLng) => void;
  now?: () => number;
}

export function createNearMeSession(options: NearMeSessionOptions) {
  const clock = options.now ?? Date.now;

  let position: SessionPosition | null = null;
  let ranked: RankedVenue[] = [];
  let rankedOrigin: LatLng | null = null;
  let rankedFromBase = true;
  let tiers: TierValue[] = [...NEAR_ME_DEFAULT_TIERS];
  let costs: CostTier[] = [];
  // The ranking holds still while a finger is on the list, and until `releaseAt` once it lifts or scrolling stops.
  let touching = false;
  let releaseAt: number | null = null;
  let selectedId: string | null = null;
  let selectionSource: SelectionSource | null = null;
  let selections = 0;
  let following = true;
  let picking = false;
  let fittedFirstFix = false;
  let far = false;
  let lowAccuracy = false;
  let pendingMove: MoveIntent | null = null;
  let moveSettlesAt = 0;
  let pins: readonly NearMePin[] = [];
  let cached: NearMeView | null = null;
  const listeners = new Set<() => void>();

  const holding = () => touching || releaseAt !== null;

  function buildPins() {
    pins = options
      .venues()
      .filter(
        (venue) =>
          tiers.includes(venue.tier) &&
          matchesCost(venue, costs) &&
          venue.lat != null &&
          venue.lng != null
      )
      .map((venue) => {
        const index = ranked.findIndex((rv) => rv.venue.id === venue.id);
        return { venue, rank: index >= 0 && index < PIN_RANK_LIMIT ? index + 1 : undefined };
      });
  }

  /** Re-ranks when the origin has moved past the threshold, the basis changed, or `force` says so. */
  function rerank(force: boolean) {
    if (!force && holding()) return;
    const { origin, fromBase } = resolveRankingOrigin(position);
    if (
      !force &&
      fromBase === rankedFromBase &&
      !hasOriginMovedSignificantly(rankedOrigin, origin)
    ) {
      return;
    }
    ranked = rankVenues({
      origin,
      venues: options.venues().filter((venue) => matchesCost(venue, costs)),
      tiers,
    });
    rankedOrigin = origin;
    rankedFromBase = fromBase;
    buildPins();
    frameFirstFix();
  }

  /** The first fix with something to show frames the visitor and the nearest venues, once. */
  function frameFirstFix() {
    if (fittedFirstFix || !position) return;
    const points: LatLng[] = [{ lat: position.lat, lng: position.lng }];
    for (const { venue } of ranked.slice(0, FIRST_FIX_VENUES)) {
      if (venue.lat != null && venue.lng != null) points.push({ lat: venue.lat, lng: venue.lng });
    }
    if (points.length < 2) return;
    fittedFirstFix = true;
    pendingMove = { kind: 'fit-first-fix', points };
  }

  function moveTo(move: MoveIntent) {
    pendingMove = move;
  }

  function view(): NearMeView {
    if (cached) return cached;
    const selectedIndex = ranked.findIndex((rv) => rv.venue.id === selectedId);
    const pinned = selectionSource === 'pin' && selectedId !== null;
    let selection: PinSelection | null = null;
    if (pinned) {
      if (selectedIndex >= 0) {
        selection = {
          venue: ranked[selectedIndex].venue,
          rv: ranked[selectedIndex],
          rank: selectedIndex + 1,
        };
      } else {
        const venue = options.venues().find((candidate) => candidate.id === selectedId);
        if (venue) selection = { venue, rv: null, rank: undefined };
      }
    }
    const previewIndex = selectedIndex >= 0 ? selectedIndex : 0;
    cached = {
      ranked,
      nearest: ranked[0] ?? null,
      others: ranked.slice(1),
      rankedFromBase,
      selectedId,
      selectionSource,
      selections,
      selection,
      preview: ranked.length > 0 ? { rv: ranked[previewIndex], rank: previewIndex + 1 } : null,
      pins,
      tiers,
      costs,
      position,
      following,
      picking,
      fittedFirstFix,
      banner: { picking, farFromManchester: far, lowAccuracy },
    };
    return cached;
  }

  /** Runs an event, then tells the listeners. */
  function event<T>(run: () => T): T {
    const result = run();
    cached = null;
    for (const listener of [...listeners]) listener();
    return result;
  }

  return {
    view,

    /** Calls `listener` after every event; returns the function that stops it. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * The move waiting for the map, if any; only the latest one is kept. The map's own
     * movement over the next moments isn't the visitor panning (see `userMovedMap`).
     */
    takeMove(at: number = clock()): MoveIntent | null {
      const move = pendingMove;
      pendingMove = null;
      if (move)
        moveSettlesAt = at + (move.kind === 'fit-first-fix' ? FIT_SETTLE_MS : MOVE_SETTLE_MS);
      return move;
    },

    /** Back to a fresh session (Near Me opened or closed), ranked from Spinningfields until a fix arrives. */
    reset() {
      event(() => {
        position = null;
        tiers = [...NEAR_ME_DEFAULT_TIERS];
        costs = [];
        touching = false;
        releaseAt = null;
        selectedId = null;
        selectionSource = null;
        following = true;
        picking = false;
        fittedFirstFix = false;
        far = false;
        lowAccuracy = false;
        pendingMove = null;
        moveSettlesAt = 0;
        rankedOrigin = null;
        rankedFromBase = true;
        rerank(true);
      });
    },

    /** A new fix, or null when there is none (yet). */
    positionChanged(next: SessionPosition | null) {
      event(() => {
        position = next;
        if (next) {
          lowAccuracy = next.accuracy > LOW_ACCURACY_METRES;
          const wasFar = far;
          far = haversineMetres(next, BASE_COORDINATES) > FAR_FROM_BASE_METRES;
          if (far) {
            // Far away: keep the Spinningfields framing rather than following to a useless view,
            // and count the first fix as framed so the map doesn't zoom out to include it.
            fittedFirstFix = true;
          } else {
            // Back inside range after being far away: frame the next fix afresh.
            if (wasFar) fittedFirstFix = false;
            if (following && fittedFirstFix)
              moveTo({ kind: 'show-point', lat: next.lat, lng: next.lng });
          }
        }
        rerank(false);
        frameFirstFix();
      });
    },

    filtersChanged(next: { tiers: readonly TierValue[]; costs: readonly CostTier[] }) {
      event(() => {
        tiers = [...next.tiers];
        costs = [...next.costs];
        rerank(true);
      });
    },

    /** A finger is on the list: the ranking holds until `listReleased`. */
    listTouched() {
      event(() => {
        touching = true;
        releaseAt = null;
      });
    },

    /** The finger lifted (or the list stopped moving): the ranking may change again once `LIST_SETTLE_MS` passes. */
    listReleased(now: number = clock()) {
      event(() => {
        touching = false;
        releaseAt = now + LIST_SETTLE_MS;
      });
    },

    /** The list scrolled: holds the ranking a little longer, but never lets go of a finger that is still down. */
    listScrolled(now: number = clock()) {
      event(() => {
        if (!touching) releaseAt = now + LIST_SETTLE_MS;
      });
    },

    /** When the hold ends, if it is a timed one: when to call `tick`. */
    holdReleasesAt(): number | null {
      return releaseAt;
    },

    /** Time has passed: lets go of the hold once it has settled, and ranks if the position has moved on. */
    tick(now: number = clock()) {
      event(() => {
        if (touching || releaseAt === null || now < releaseAt) return;
        releaseAt = null;
        rerank(false);
      });
    },

    selectFromPin(id: string) {
      select(id, 'pin');
    },

    selectFromList(id: string) {
      select(id, 'list');
    },

    clearSelection() {
      event(() => {
        selectedId = null;
        selectionSource = null;
      });
    },

    /**
     * The visitor dragged or zoomed the map, so it stops following them. The map moving
     * itself (a move handed out by `takeMove`) doesn't count.
     */
    userMovedMap(now: number = clock()) {
      event(() => {
        if (now < moveSettlesAt) return;
        following = false;
      });
    },

    /** Follow the visitor again. False when there is no position to go to yet. */
    recentre(): boolean {
      return event(() => {
        following = true;
        if (!position) return false;
        moveTo({ kind: 'show-point', lat: position.lat, lng: position.lng });
        return true;
      });
    },

    /** Follow the visitor again without moving the map (a live fix is about to arrive). */
    resumeFollowing() {
      event(() => {
        following = true;
      });
    },

    returnToBase() {
      event(() => {
        following = false;
        moveTo({ kind: 'show-base' });
      });
    },

    startPicking() {
      event(() => {
        picking = true;
      });
    },

    stopPicking() {
      event(() => {
        picking = false;
      });
    },

    /** A tap on the map while picking sets the position by hand and follows it. */
    pickedLocation(latlng: LatLng) {
      event(() => {
        if (!picking) return;
        picking = false;
        following = true;
        options.setManualPosition?.({ lat: latlng.lat, lng: latlng.lng });
        moveTo({ kind: 'show-point', lat: latlng.lat, lng: latlng.lng });
      });
    },
  };

  function select(id: string, source: SelectionSource) {
    event(() => {
      const venue = options.venues().find((candidate) => candidate.id === id);
      if (!venue) return;
      selectedId = id;
      selectionSource = source;
      selections += 1;
      // Choosing a venue overrides following the visitor, so a position update doesn't pull the
      // map back. Recentring (or a manual pick) switches following back on.
      following = false;
      if (venue.lat != null && venue.lng != null) {
        moveTo({ kind: 'focus-venue', id, lat: venue.lat, lng: venue.lng, source });
      }
    });
  }
}

export type NearMeSession = ReturnType<typeof createNearMeSession>;
