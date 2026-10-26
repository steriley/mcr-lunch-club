import { TIERS, tierInfo, type TierValue } from '@/lib/tiers';
import type { Venue } from '@/types';

/**
 * Clustering for the home map, so no two markers ever overlap.
 *
 * Starting at the deepest zoom and working outwards, any two markers that would
 * touch on screen merge into one cluster, closest pair first, until none touch.
 * Each level only ever merges the level below it, so a cluster always splits
 * into the same groups as you zoom in, and a venue is on the map exactly once at
 * every zoom. With about 90 venues the whole index builds in a few milliseconds.
 */

/** The map's deepest zoom (CARTO serves no tiles past it). Venues still merged here share a building. */
export const CLUSTER_MAX_ZOOM = 18;

/** Marker sizes in px, and the breathing room kept between two markers. */
const PIN_PX = 28;
const CLUSTER_PX = 44;
const GAP_PX = 8;

/** A pin's disc sits above the venue's point (its stem ends on it); a cluster is centred on its point. */
const PIN_LIFT_PX = 16;

const TILE_PX = 256;

export interface VenueItem {
  kind: 'venue';
  venue: Venue;
}

export interface ClusterItem {
  kind: 'cluster';
  /** The member venue ids, sorted: the same group has the same key at every zoom. */
  key: string;
  lat: number;
  lng: number;
  count: number;
  /** Venues per tier, in display order, tiers with none left out. */
  tiers: Array<{ tier: TierValue; count: number }>;
  venues: Venue[];
  /** The zoom at which this cluster first splits; one past the deepest zoom if it never does. */
  expansionZoom: number;
}

export type MapItem = VenueItem | ClusterItem;

export interface ClusterIndex {
  /** What the map shows at `zoom`: single pins and clusters, covering every venue exactly once. */
  itemsAt(zoom: number): MapItem[];
}

/** A group of venues at a position in Web Mercator world coordinates (0 to 1 each way). */
interface Group {
  venues: Venue[];
  x: number;
  y: number;
}

const mercatorX = (lng: number) => (lng + 180) / 360;

const mercatorY = (lat: number) => {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
};

const lngFromX = (x: number) => x * 360 - 180;

const latFromY = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

const isCluster = (group: Group) => group.venues.length > 1;

/** How far apart two groups' markers sit on screen at `scale` px per world unit, allowing for a pin's lift. */
function screenDistance(a: Group, b: Group, scale: number): number {
  const dx = (a.x - b.x) * scale;
  const dy = (a.y - b.y) * scale + ((isCluster(b) ? 0 : PIN_LIFT_PX) - (isCluster(a) ? 0 : PIN_LIFT_PX));
  return Math.hypot(dx, dy);
}

/** The least two groups' markers may be apart before they count as touching. */
function touchingDistance(a: Group, b: Group): number {
  const size = (group: Group) => (isCluster(group) ? CLUSTER_PX : PIN_PX);
  return (size(a) + size(b)) / 2 + GAP_PX;
}

function merge(a: Group, b: Group): Group {
  const total = a.venues.length + b.venues.length;
  return {
    venues: [...a.venues, ...b.venues],
    x: (a.x * a.venues.length + b.x * b.venues.length) / total,
    y: (a.y * a.venues.length + b.y * b.venues.length) / total,
  };
}

/** Merges the closest touching pair, again and again, until no two groups touch at this zoom. */
function mergeTouching(groups: Group[], zoom: number): Group[] {
  const scale = TILE_PX * 2 ** zoom;
  const result = [...groups];
  for (;;) {
    let closest: { i: number; j: number; distance: number } | null = null;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const distance = screenDistance(result[i], result[j], scale);
        if (distance < touchingDistance(result[i], result[j]) && (!closest || distance < closest.distance)) {
          closest = { i, j, distance };
        }
      }
    }
    if (!closest) return result;
    const merged = merge(result[closest.i], result[closest.j]);
    result.splice(closest.j, 1);
    result[closest.i] = merged;
  }
}

const keyOf = (venues: readonly Venue[]) => venues.map((venue) => venue.id).sort().join('|');

function tierCounts(venues: readonly Venue[]): ClusterItem['tiers'] {
  const counts = new Map<TierValue, number>();
  for (const venue of venues) counts.set(venue.tier, (counts.get(venue.tier) ?? 0) + 1);
  return TIERS.filter((tier) => counts.has(tier.value)).map((tier) => ({ tier: tier.value, count: counts.get(tier.value)! }));
}

/** Builds the cluster index for the venues that have a location. */
export function createClusterIndex(venues: readonly Venue[]): ClusterIndex {
  let groups: Group[] = venues
    .filter((venue) => venue.lat != null && venue.lng != null)
    .map((venue) => ({ venues: [venue], x: mercatorX(venue.lng!), y: mercatorY(venue.lat!) }));

  // levels[z] is what shows at zoom z, built from the next level down.
  const levels: Group[][] = [];
  for (let zoom = CLUSTER_MAX_ZOOM; zoom >= 0; zoom--) {
    groups = mergeTouching(groups, zoom);
    levels[zoom] = groups;
  }

  const keysAt = levels.map((level) => new Set(level.map((group) => keyOf(group.venues))));

  function expansionZoom(key: string, zoom: number): number {
    for (let deeper = zoom + 1; deeper <= CLUSTER_MAX_ZOOM; deeper++) {
      if (!keysAt[deeper].has(key)) return deeper;
    }
    return CLUSTER_MAX_ZOOM + 1;
  }

  return {
    itemsAt(zoom: number): MapItem[] {
      const level = Math.min(Math.max(Math.floor(zoom), 0), CLUSTER_MAX_ZOOM);
      return levels[level].map((group): MapItem => {
        if (!isCluster(group)) return { kind: 'venue', venue: group.venues[0] };
        const key = keyOf(group.venues);
        return {
          kind: 'cluster',
          key,
          lat: latFromY(group.y),
          lng: lngFromX(group.x),
          count: group.venues.length,
          tiers: tierCounts(group.venues),
          venues: group.venues,
          expansionZoom: expansionZoom(key, level),
        };
      });
    },
  };
}

/** A cluster's accessible name, e.g. "5 venues: 3 Approved, 2 Under Consideration. Zoom in". */
export function clusterLabel(cluster: Pick<ClusterItem, 'count' | 'tiers'>, action = 'Zoom in'): string {
  const parts = cluster.tiers.map(({ tier, count }) => `${count} ${tierInfo(tier).label}`);
  return `${cluster.count} venues: ${parts.join(', ')}. ${action}`;
}

/** Gap between neighbouring fanned-out pins, centre to centre: a 28 px pin plus room for its stem. */
const SPIDER_SPACING_PX = 38;
const SPIDER_MIN_RADIUS_PX = 46;

/**
 * Where venues fan out around a cluster that can't zoom any further (several
 * venues in one building): pixel offsets on a circle, the first straight up,
 * going clockwise.
 */
export function spiderfyOffsets(count: number): Array<{ x: number; y: number }> {
  if (count <= 0) return [];
  const radius = Math.max(SPIDER_MIN_RADIUS_PX, (count * SPIDER_SPACING_PX) / (2 * Math.PI));
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}
