import type { Venue } from '@/types';
import { BASE_LAT, BASE_LNG, WALKING_ISOCHRONES } from './config';
import { tierInfo } from '@/lib/tiers';
import { walkText } from '@/lib/route-display';
import { themeColor } from '@/lib/theme-color';

/** What a screen reader announces for a pin: the cost badge alone ("££") says nothing. */
export function venuePinLabel(venue: Venue): string {
  const walk = venue.walkingTimeMin == null ? null : walkText(venue.walkingTimeMin, 'min walk');
  return [venue.name, tierInfo(venue.tier).label, venue.cost, walk].filter(Boolean).join(', ');
}

/**
 * Generate the HTML string for a venue marker pin.
 */
export function createVenueIconHtml(venue: Venue, rank?: number): string {
  const tier = tierInfo(venue.tier);
  const badgeText = venue.cost;
  // Near Me numbers its nearest pins so they match the list rows.
  const rankBadge = rank
    ? `<span class="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-deep bg-gold px-1 text-[10px] font-extrabold leading-none text-deep" aria-hidden="true">${Math.trunc(rank)}</span>`
    : '';

  return `
    <div class="group relative cursor-pointer transform transition-transform duration-200 hover:scale-125 hover:z-[9999]" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
      <div class="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shadow-md border-2"
           style="background-color: ${tier.color}; border-color: ${tier.border}; color: var(--color-white);">
        <span aria-hidden="true">${escapeHtml(badgeText)}</span>
      </div>
      <span class="sr-only">${escapeHtml(venuePinLabel(venue))}</span>
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
 * Factory for creating the walking time isochrone circles around Spinningfields base.
 */
export function createWalkingIsochrones(L: any): any[] {
  return WALKING_ISOCHRONES.map((ring) => {
    const color = themeColor(ring.colorToken);
    return L.circle([BASE_LAT, BASE_LNG], {
      radius: ring.radius,
      color,
      weight: ring.weight || 1.4,
      dashArray: ring.dash,
      fillColor: color,
      fillOpacity: 0.02,
      interactive: false,
    });
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
