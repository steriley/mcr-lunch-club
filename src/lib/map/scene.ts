import type { Venue } from '@/types';
import { BASE_LAT, BASE_LNG, DEFAULT_ZOOM, WALKING_ISOCHRONES } from './config';
import {
  CLUSTER_MAX_ZOOM,
  clusterLabel,
  createClusterIndex,
  spiderfyOffsets,
  type ClusterIndex,
  type ClusterItem,
  type MapItem,
} from './clusters';
import {
  NARROW_MAP_MAX_WIDTH,
  anyOutsideView,
  coreVenues,
  countOutsideView,
  frameFor,
  type Frame,
  type ViewBounds,
} from './framing';
import {
  NAME_MIN_ZOOM,
  byNamePriority,
  clusterRect,
  labelWidth,
  nameLabelText,
  nameOptions,
  pinRect,
  placeLabels,
  ringLabelOptions,
  type LabelCandidate,
  type Rect,
} from './labels';
import { project, unproject, worldPx, type WorldPoint } from './projection';
import type { LatLng } from './ranking';

/**
 * The Ledger Map scene: everything the home map decides about what it shows,
 * without Leaflet. Which venues are single pins and which are clusters at this
 * zoom, a cluster fanned out around its building, the selected venue pulled out
 * of the cluster it would hide in, the names beside the pins, the minutes on the
 * walking rings, how many matches are out of view, and where to move the map
 * when the filters change or a cluster is tapped.
 *
 * Events go in (the venues, the view, a tap, a selection) and a plain
 * description comes out (`frame()`); LunchMap.vue draws it with Leaflet.
 * Positions are worked out with Web Mercator (see projection.ts), as Leaflet does.
 */

export type { Frame };

/** The map as it is now: its centre, zoom and size in px. */
export interface SceneView extends LatLng {
  zoom: number;
  width: number;
  height: number;
  /** Where the map's own controls sit over the tiles, in px from its top left: ring labels keep out from under them. */
  controls: readonly Rect[];
}

/** A cluster that can't split by zooming (several venues in one building), its venues fanned out around it. */
export interface FanOut extends LatLng {
  key: string;
  /** Each venue's pin, on a circle around the cluster's spot. */
  pins: Array<{ venue: Venue; at: LatLng }>;
}

/** A piece of text on the map: its box is `width` by `height` px, centred on `at`. */
export interface PlacedLabel {
  id: string;
  text: string;
  at: LatLng;
  width: number;
  height: number;
}

/** The markers to draw. `key` changes whenever any of them does, so an unchanged frame needn't be redrawn. */
export interface MarkerFrame {
  key: string;
  /** Venues shown as a pin of their own. */
  pins: Venue[];
  clusters: Array<{ cluster: ClusterItem; label: string }>;
  fanOut: FanOut | null;
  /** Names beside single pins; each label's id is its venue's. */
  names: PlacedLabel[];
}

export interface SceneFrame {
  markers: MarkerFrame;
  /** The walking rings' minutes, where they can be read; none while the rings are hidden. */
  ringLabels: PlacedLabel[];
  /** How many matching venues are outside the view. */
  outsideCount: number;
}

/** What a venue is drawn as right now, so its list row can light it up. */
export type MarkerRef =
  | { kind: 'pin'; venueId: string }
  | { kind: 'fan-out'; venueId: string }
  | { kind: 'cluster'; key: string };

export interface SceneOptions {
  /** The deepest zoom the map's tiles go to. */
  maxZoom: number;
  /** The clock, for how long a fan-out waits on its zoom. */
  now?: () => number;
}

/** Room to keep clear when framing: the Near Me button above, the venue card below. */
const FRAME_PADDING = { top: 72, right: 48, bottom: 48, left: 48 };
/** A phone's narrow map must zoom out to fit every venue; never closer than street level. */
const FRAME_MIN_ZOOM = 12;
const FRAME_MAX_ZOOM = 16;
/** Room kept round a tapped cluster's venues when zooming to them. */
const CLUSTER_ZOOM_PADDING = { top: 32, right: 32, bottom: 32, left: 32 };
/** How long a tap's zoom may take before its fan-out is forgotten (a user who zooms away shouldn't get one later). */
const FAN_OUT_WAIT_MS = 3000;

const NAME_FONT = '600 12px "Playfair Display", "Playfair Display Fallback", Georgia, serif';
const RING_FONT = '600 11px "Playfair Display", "Playfair Display Fallback", Georgia, serif';
const RING_LABEL_HEIGHT_PX = 14;
const RING_LABEL_MAX_WIDTH_PX = 80;
/** Ring labels stay this far inside the edge of the view. */
const RING_LABEL_INSET_PX = 6;
/** The Base marker's size: names keep off it. */
const BASE_MARKER_PX = 32;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

const BASE: LatLng = { lat: BASE_LAT, lng: BASE_LNG };

const hasLocation = (venue: Venue) => venue.lat != null && venue.lng != null;
const locationOf = (venue: Venue): LatLng => ({ lat: venue.lat!, lng: venue.lng! });

const EMPTY_MARKERS: MarkerFrame = { key: '', pins: [], clusters: [], fanOut: null, names: [] };

export function createLedgerMapScene(options: SceneOptions) {
  const now = options.now ?? Date.now;
  // Past this zoom a cluster never splits, so it fans out instead.
  const deepestZoom = Math.min(options.maxZoom, CLUSTER_MAX_ZOOM);

  let venues: readonly Venue[] = [];
  let index: ClusterIndex = createClusterIndex([]);
  let view: SceneView | null = null;
  let selectedId: string | null = null;
  let ringsVisible = true;
  let fanOut: { key: string; lat: number; lng: number; venues: Venue[] } | null = null;
  // A one-building cluster tapped from afar: it fans out once the map has zoomed in.
  let pendingFanOut: { key: string; until: number } | null = null;
  let items: MapItem[] = [];
  let markers: MarkerFrame = EMPTY_MARKERS;

  /** What to draw at `zoom`. A selected venue never hides inside a cluster: it comes out as its own pin. */
  function itemsAt(zoom: number): MapItem[] {
    const shown = index.itemsAt(zoom);
    const selected = venues.find((venue) => venue.id === selectedId);
    if (!selected || !hasLocation(selected)) return shown;
    const alone = shown.some((item) => item.kind === 'venue' && item.venue.id === selected.id);
    const fannedOut = fanOut?.venues.some((venue) => venue.id === selected.id);
    if (alone || fannedOut) return shown;
    const others = createClusterIndex(venues.filter((venue) => venue.id !== selected.id));
    return [...others.itemsAt(zoom), { kind: 'venue', venue: selected }];
  }

  /** Brings everything in line after an event: the items at this zoom, a waiting fan-out, a stale one. */
  function settle() {
    if (!view) return;
    items = itemsAt(view.zoom);
    if (pendingFanOut && now() > pendingFanOut.until) pendingFanOut = null;
    if (pendingFanOut && view.zoom >= deepestZoom) {
      const key = pendingFanOut.key;
      pendingFanOut = null;
      const target = clusterWithKey(key);
      if (target) fanOut = { key, lat: target.lat, lng: target.lng, venues: target.venues };
    }
    if (fanOut && !clusterWithKey(fanOut.key)) fanOut = null;
    markers = buildMarkers(view);
  }

  function clusterWithKey(key: string): ClusterItem | undefined {
    return items.find((item): item is ClusterItem => item.kind === 'cluster' && item.key === key);
  }

  function buildMarkers(at: SceneView): MarkerFrame {
    const zoom = at.zoom;
    const pins = items.filter((item) => item.kind === 'venue').map((item) => item.venue);
    const action = zoom < deepestZoom ? 'Zoom in' : 'Spread out';
    const clusters = items
      .filter((item): item is ClusterItem => item.kind === 'cluster' && item.key !== fanOut?.key)
      .map((cluster) => ({ cluster, label: clusterLabel(cluster, action) }));
    const fanned = fanOut ? fanOutAt(fanOut, zoom) : null;
    const key = [
      zoom,
      pins.map((venue) => venue.id).join(','),
      clusters.map(({ cluster }) => cluster.key).join(','),
      fanned?.key ?? '',
    ].join(';');
    if (key === markers.key) return markers;
    return { key, pins, clusters, fanOut: fanned, names: placeNames(pins, clusters, fanned, zoom) };
  }

  function fanOutAt(cluster: NonNullable<typeof fanOut>, zoom: number): FanOut {
    const centre = project(cluster, zoom);
    const offsets = spiderfyOffsets(cluster.venues.length);
    return {
      key: cluster.key,
      lat: cluster.lat,
      lng: cluster.lng,
      pins: cluster.venues.map((venue, i) => ({
        venue,
        at: unproject({ x: centre.x + offsets[i].x, y: centre.y + offsets[i].y }, zoom),
      })),
    };
  }

  /** Everything drawn at `zoom` that a label must keep off, in world pixels. */
  function markerObstacles(
    pins: readonly Venue[],
    clusters: MarkerFrame['clusters'],
    fanned: FanOut | null,
    zoom: number
  ): Rect[] {
    const base = project(BASE, zoom);
    const half = BASE_MARKER_PX / 2;
    return [
      { x: base.x - half, y: base.y - half, width: BASE_MARKER_PX, height: BASE_MARKER_PX },
      ...pins.map((venue) => pinRect(project(locationOf(venue), zoom))),
      ...(fanned?.pins ?? []).map((pin) => pinRect(project(pin.at, zoom))),
      ...clusters.map(({ cluster }) => clusterRect(project(cluster, zoom))),
    ];
  }

  /**
   * Names beside the single pins, from zoom 16. Every pin, cluster and the Base marker is an
   * obstacle; a name that would touch one, or another name, is left out. Approved venues get
   * first pick, then the nearest to Base. Placement doesn't depend on what is in view, so
   * names stay put as the map is dragged.
   */
  function placeNames(
    pins: readonly Venue[],
    clusters: MarkerFrame['clusters'],
    fanned: FanOut | null,
    zoom: number
  ): PlacedLabel[] {
    if (zoom < NAME_MIN_ZOOM) return [];
    const candidates: Array<LabelCandidate & { text: string }> = byNamePriority(pins).map(
      (venue) => {
        const text = nameLabelText(venue);
        const width = labelWidth(text, NAME_FONT);
        return {
          id: venue.id,
          text,
          options: nameOptions(project(locationOf(venue), zoom), width),
        };
      }
    );
    return placed(candidates, markerObstacles(pins, clusters, fanned, zoom), zoom);
  }

  /** Runs the placement and turns each label that fits into a box centred on a map position. */
  function placed(
    candidates: ReadonlyArray<LabelCandidate & { text: string }>,
    obstacles: readonly Rect[],
    zoom: number
  ): PlacedLabel[] {
    const chosen = placeLabels(candidates, obstacles);
    return candidates.flatMap((candidate) => {
      const index = chosen.get(candidate.id);
      if (index === undefined) return [];
      const box = candidate.options[index];
      const centre: WorldPoint = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      return [
        {
          id: candidate.id,
          text: candidate.text,
          at: unproject(centre, zoom),
          width: box.width,
          height: box.height,
        },
      ];
    });
  }

  /** The view's top-left corner in world pixels. */
  function viewOrigin(at: SceneView): WorldPoint {
    const centre = project(at, at.zoom);
    return { x: centre.x - at.width / 2, y: centre.y - at.height / 2 };
  }

  function viewBounds(at: SceneView): ViewBounds {
    const origin = viewOrigin(at);
    const northWest = unproject(origin, at.zoom);
    const southEast = unproject({ x: origin.x + at.width, y: origin.y + at.height }, at.zoom);
    return { north: northWest.lat, west: northWest.lng, south: southEast.lat, east: southEast.lng };
  }

  /**
   * Each walking ring's minutes, printed on the ring where it is on screen and clear of pins,
   * clusters, names and the map's own buttons.
   */
  function placeRingLabels(at: SceneView): PlacedLabel[] {
    const zoom = at.zoom;
    const origin = viewOrigin(at);
    const inset = RING_LABEL_INSET_PX;
    const within: Rect = {
      x: origin.x + inset,
      y: origin.y + inset,
      width: at.width - inset * 2,
      height: at.height - inset * 2,
    };
    const obstacles: Rect[] = [
      ...markers.names.map((label) => boxOf(label, zoom)),
      ...markerObstacles(markers.pins, markers.clusters, markers.fanOut, zoom),
      ...at.controls.map((zone) => ({ ...zone, x: zone.x + origin.x, y: zone.y + origin.y })),
    ];
    const centre = project(BASE, zoom);
    // Web Mercator: a metre is this many pixels at Base's latitude.
    const pixelsPerMetre =
      worldPx(zoom) / (EARTH_CIRCUMFERENCE_M * Math.cos((BASE_LAT * Math.PI) / 180));
    const candidates = WALKING_ISOCHRONES.map((ring) => {
      const width = labelWidth(ring.shortLabel, RING_FONT, RING_LABEL_MAX_WIDTH_PX);
      return {
        id: ring.shortLabel,
        text: ring.shortLabel,
        options: ringLabelOptions(
          centre,
          ring.radius * pixelsPerMetre,
          { width, height: RING_LABEL_HEIGHT_PX },
          within
        ),
      };
    });
    return placed(candidates, obstacles, zoom);
  }

  function boxOf(label: PlacedLabel, zoom: number): Rect {
    const centre = project(label.at, zoom);
    return {
      x: centre.x - label.width / 2,
      y: centre.y - label.height / 2,
      width: label.width,
      height: label.height,
    };
  }

  const matchingPoints = () => venues.filter(hasLocation).map(locationOf);

  /** The points to frame: on a narrow map the core around Base, otherwise every match. */
  function framedPoints(): LatLng[] {
    const points = matchingPoints();
    return view && view.width < NARROW_MAP_MAX_WIDTH ? coreVenues(points, BASE) : points;
  }

  function frameOn(points: readonly LatLng[]): Frame {
    if (!view || points.length === 0) return { ...BASE, zoom: DEFAULT_ZOOM };
    return (
      frameFor([BASE, ...points], {
        width: view.width,
        height: view.height,
        padding: FRAME_PADDING,
        minZoom: FRAME_MIN_ZOOM,
        maxZoom: FRAME_MAX_ZOOM,
      }) ?? { ...BASE, zoom: DEFAULT_ZOOM }
    );
  }

  return {
    /** The view changed: a pan, a zoom or a resize. */
    setView(next: SceneView) {
      view = next;
      settle();
    },

    /**
     * The venues the filters match. A fan-out folds away, and a selected venue no longer among
     * them is let go. With `reframe`, returns where to move the map when a venue it would frame is
     * off screen, so a small tweak (and, on a narrow map, an outlier) doesn't make it jump.
     */
    setVenues(next: readonly Venue[], { reframe }: { reframe: boolean }): Frame | null {
      venues = next;
      index = createClusterIndex(next);
      fanOut = null;
      if (selectedId && !next.some((venue) => venue.id === selectedId)) selectedId = null;
      settle();
      if (!reframe || !view || next.length === 0) return null;
      return anyOutsideView(framedPoints(), viewBounds(view)) ? frameOn(framedPoints()) : null;
    },

    /** The venue whose card is showing, or null; the scene keeps it out of any cluster. */
    select(venueId: string | null) {
      selectedId = venueId;
      settle();
    },

    /** The selected venue, which `setVenues` lets go of when the filters hide it. */
    selected: () => selectedId,

    showRings(visible: boolean) {
      ringsVisible = visible;
    },

    /**
     * A cluster was tapped. Zooms to its venues; one that can't split by zooming (one building)
     * fans out, straight away at street level or once the returned zoom has happened. Returns where
     * to move the map, or null when nothing needs to move.
     */
    openCluster(key: string): Frame | null {
      const cluster = clusterWithKey(key);
      if (!cluster || !view) return null;
      if (cluster.expansionZoom > deepestZoom) {
        if (view.zoom >= deepestZoom) {
          fanOut = { key, lat: cluster.lat, lng: cluster.lng, venues: cluster.venues };
          settle();
          return null;
        }
        pendingFanOut = { key, until: now() + FAN_OUT_WAIT_MS };
        return { lat: cluster.lat, lng: cluster.lng, zoom: deepestZoom };
      }
      const fit = frameFor(cluster.venues.filter(hasLocation).map(locationOf), {
        width: view.width,
        height: view.height,
        padding: CLUSTER_ZOOM_PADDING,
        minZoom: 0,
        maxZoom: deepestZoom,
      });
      if (!fit) return null;
      return { lat: fit.lat, lng: fit.lng, zoom: Math.max(fit.zoom, cluster.expansionZoom) };
    },

    /** Folds a fan-out away. False when there wasn't one. */
    collapseFanOut(): boolean {
      if (!fanOut) return false;
      fanOut = null;
      settle();
      return true;
    },

    /** The first view: on a narrow map the core around Base, otherwise every match. */
    frameAll: (): Frame => frameOn(framedPoints()),

    /** Every match, on any width (the "further out" pill). */
    frameEverything: (): Frame => frameOn(matchingPoints()),

    /** What `venueId` is drawn as: its own pin, a fanned-out pin, or part of a cluster. */
    markerOf(venueId: string): MarkerRef | null {
      if (markers.pins.some((venue) => venue.id === venueId)) return { kind: 'pin', venueId };
      if (markers.fanOut?.pins.some((pin) => pin.venue.id === venueId))
        return { kind: 'fan-out', venueId };
      const cluster = markers.clusters.find(({ cluster }) =>
        cluster.venues.some((venue) => venue.id === venueId)
      );
      return cluster ? { kind: 'cluster', key: cluster.cluster.key } : null;
    },

    /** What to draw now. */
    frame(): SceneFrame {
      if (!view) return { markers: EMPTY_MARKERS, ringLabels: [], outsideCount: 0 };
      return {
        markers,
        ringLabels: ringsVisible ? placeRingLabels(view) : [],
        outsideCount: countOutsideView(matchingPoints(), viewBounds(view)),
      };
    },
  };
}
