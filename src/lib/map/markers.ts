import type { Venue } from '@/types';
import { BASE_LAT, BASE_LNG, WALKING_ISOCHRONES, WALKING_RING_TOKEN } from './config';
import { tierInfo } from '@/lib/tiers';
import { walkText } from '@/lib/route-display';
import { themeColor } from '@/lib/theme-color';
import type { ClusterItem } from './clusters';
import { nameLabelText } from './labels';

/** What a screen reader announces for a pin: the cost badge alone ("££") says nothing. */
export function venuePinLabel(venue: Venue): string {
  const walk = venue.walkingTimeMin == null ? null : walkText(venue.walkingTimeMin, 'min walk');
  return [venue.name, tierInfo(venue.tier).label, venue.cost, walk].filter(Boolean).join(', ');
}

/** The tier's glyph as an inline SVG, white on the pin's tier colour. */
function tierGlyphSvg(glyph: string): string {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${glyph}"/></svg>`;
}

/**
 * Generate the HTML string for a venue marker pin: a 28 px disc in the tier's
 * colour with the tier's glyph in it, so tier reads without colour. The price is
 * not on the pin; it is in the accessible name and on the venue's card. Its name
 * shows beside it on hover or keyboard focus at any zoom (see map.css).
 */
export function createVenueIconHtml(venue: Venue, rank?: number): string {
  const tier = tierInfo(venue.tier);
  // Near Me numbers its nearest pins so they match the list rows.
  const rankBadge = rank
    ? `<span class="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-deep bg-gold px-1 text-[10px] font-extrabold leading-none text-deep" aria-hidden="true">${Math.trunc(rank)}</span>`
    : '';

  return `
    <div class="group relative cursor-pointer transform transition-transform duration-200 hover:scale-125 hover:z-[9999]" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
      <div class="flex items-center justify-center w-7 h-7 rounded-full shadow-md border-2"
           style="background-color: ${tier.color}; border-color: ${tier.border}; color: var(--color-white);">
        ${tierGlyphSvg(tier.glyph)}
      </div>
      <span class="sr-only">${escapeHtml(venuePinLabel(venue))}</span>
      <span class="ledger-pin-name" aria-hidden="true">${escapeHtml(nameLabelText(venue))}</span>
      ${rankBadge}
      <div class="w-1.5 h-1.5 mx-auto bg-stone-900 rounded-full mt-[-1px]"></div>
    </div>
  `;
}

/**
 * Factory for creating a Leaflet venue marker.
 */
export function createVenueMarker(L: any, venue: Venue, rank?: number): any {
  if (venue.lat == null || venue.lng == null) return null;

  return L.marker([venue.lat, venue.lng], { icon: createVenueIcon(L, venue, rank) });
}

/** The divIcon for a venue pin; `rank` adds the Near Me number badge. */
export function createVenueIcon(L: any, venue: Venue, rank?: number): any {
  return L.divIcon({
    html: createVenueIconHtml(venue, rank),
    className: 'custom-ledger-pin',
    iconSize: [28, 34],
    iconAnchor: [14, 30],
  });
}

/** Width and height of a cluster marker, in px. */
export const CLUSTER_ICON_SIZE = 44;

/**
 * The HTML for a cluster marker: the venue count inside a ring split by tier
 * share, so "5 venues, mostly Approved" reads at a glance. `label` is its
 * accessible name.
 */
export function createClusterIconHtml(cluster: Pick<ClusterItem, 'count' | 'tiers'>, label: string): string {
  const size = CLUSTER_ICON_SIZE;
  const mid = size / 2;
  const radius = 18;
  const several = cluster.tiers.length > 1;
  let offset = 0;
  const arcs = cluster.tiers
    .map(({ tier, count }) => {
      const share = (count / cluster.count) * 100;
      // A hairline gap between segments, so neighbouring tiers stay distinct.
      const dash = several ? Math.max(share - 1.5, 0.5) : share;
      const arc = `<circle cx="${mid}" cy="${mid}" r="${radius}" fill="none" stroke-width="6" pathLength="100" stroke-dasharray="${dash.toFixed(2)} ${(100 - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${mid} ${mid})" style="stroke: ${tierInfo(tier).color};"/>`;
      offset += share;
      return arc;
    })
    .join('');

  return `
    <div class="ledger-cluster-inner">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true" focusable="false">
        <circle cx="${mid}" cy="${mid}" r="${mid - 1}" class="ledger-cluster-disc"/>
        ${arcs}
      </svg>
      <span class="ledger-cluster-count" aria-hidden="true">${Math.trunc(cluster.count)}</span>
      <span class="sr-only">${escapeHtml(label)}</span>
    </div>
  `;
}

/** The Leaflet marker for a cluster. */
export function createClusterMarker(L: any, cluster: ClusterItem, label: string): any {
  return L.marker([cluster.lat, cluster.lng], {
    icon: L.divIcon({
      html: createClusterIconHtml(cluster, label),
      className: 'custom-ledger-pin ledger-cluster',
      iconSize: [CLUSTER_ICON_SIZE, CLUSTER_ICON_SIZE],
      iconAnchor: [CLUSTER_ICON_SIZE / 2, CLUSTER_ICON_SIZE / 2],
    }),
  });
}

/**
 * Factory for creating the Spinningfields Base quorum marker.
 */
export function createBaseMarker(L: any): any {
  const baseIconHtml = `
    <div class="hq-hotspot">
      <span class="hq-hotspot-wave" aria-hidden="true"></span>
      <span class="hq-hotspot-wave" aria-hidden="true"></span>
      <span class="hq-hotspot-wave" aria-hidden="true"></span>
      <div class="hq-hotspot-core">
        <div class="absolute text-[13px] font-bold">🏛</div>
      </div>
    </div>
  `;

  const baseMarker = L.marker([BASE_LAT, BASE_LNG], {
    icon: L.divIcon({
      html: baseIconHtml,
      className: 'custom-ledger-pin',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    }),
    zIndexOffset: 1000,
  });

  baseMarker.bindTooltip(
    '<span class="hq-label-kicker">Lunch Club HQ</span><span class="hq-label-title">The Chairs’ Seat</span><span class="hq-label-sub">Spinningfields Base Quorum</span>',
    {
      direction: 'top',
      offset: [0, -14],
      className: 'hq-label',
    },
  );

  return baseMarker;
}

/**
 * Factory for creating the walking time isochrone circles around Spinningfields base:
 * thin and one quiet grey, with the 2.5-mile boundary a little heavier and dashed.
 */
export function createWalkingIsochrones(L: any): any[] {
  const color = themeColor(WALKING_RING_TOKEN);
  return WALKING_ISOCHRONES.map((ring) =>
    L.circle([BASE_LAT, BASE_LNG], {
      radius: ring.radius,
      color,
      weight: ring.weight,
      opacity: 0.75,
      dashArray: ring.dash,
      fill: false,
      interactive: false,
    })
  );
}

/**
 * A piece of text on the map that can't be touched or focused: a venue's name
 * beside its pin, or a walking ring's minutes on the ring. The marker is centred
 * on `latlng` and `size` is the box it fills. Screen readers get the same facts
 * from the pins and the list, so the text is hidden from them.
 */
export function createLabelMarker(L: any, latlng: [number, number], text: string, size: { width: number; height: number }, kind: 'name' | 'ring'): any {
  return L.marker(latlng, {
    icon: L.divIcon({
      html: `<span class="ledger-label-text" aria-hidden="true">${escapeHtml(text)}</span>`,
      className: `ledger-label ledger-label-${kind}`,
      iconSize: [size.width, size.height],
      iconAnchor: [size.width / 2, size.height / 2],
    }),
    interactive: false,
    keyboard: false,
    // Pins and clusters stay above the text.
    zIndexOffset: -500,
  });
}

/** Escapes text for interpolation into HTML; venue fields are editable in the admin area. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
