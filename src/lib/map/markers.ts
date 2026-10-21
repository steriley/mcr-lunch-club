import type { Venue } from '@/types';
import { BASE_LAT, BASE_LNG, WALKING_ISOCHRONES } from './config';
import { getTierMetadata } from './tiers';
import { milesText, walkText } from '@/lib/route-display';

/**
 * Generate the HTML string for a venue marker pin.
 */
export function createVenueIconHtml(venue: Venue): string {
  const metadata = getTierMetadata(venue.status);
  const styling = metadata.colors;
  const badgeText = venue.cost;

  return `
    <div class="group relative cursor-pointer transform transition-transform duration-200 hover:scale-125 hover:z-[9999]" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
      <div class="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shadow-md border-2"
           style="background-color: ${styling.pinBg}; border-color: ${styling.border}; color: ${styling.text};">
        <span>${escapeHtml(badgeText)}</span>
      </div>
      <div class="w-1.5 h-1.5 mx-auto bg-stone-900 rounded-full mt-[-1px]"></div>
    </div>
  `;
}

/**
 * Factory for creating a Leaflet venue marker.
 */
export function createVenueMarker(L: any, venue: Venue): any {
  if (venue.lat == null || venue.lng == null) return null;

  const iconHtml = createVenueIconHtml(venue);

  return L.marker([venue.lat, venue.lng], {
    icon: L.divIcon({
      html: iconHtml,
      className: 'custom-ledger-pin',
      iconSize: [28, 34],
      iconAnchor: [14, 30],
    }),
  });
}

/**
 * Factory for creating the Spinningfields Base quorum marker.
 */
export function createBaseMarker(L: any): any {
  const baseIconHtml = `
    <div class="relative flex items-center justify-center w-8 h-8 rounded-full bg-[#1a1e24] text-[#c59b27] border-2 border-[#c59b27] shadow-2xl">
      <div class="w-3 h-3 rounded-full bg-[#c59b27] animate-ping opacity-75"></div>
      <div class="absolute text-[13px] font-bold">🏛</div>
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

  baseMarker.bindTooltip('<b>The Chairs’ Seat</b><br/>Spinningfields Base Quorum', {
    direction: 'top',
    className: 'ring-label',
  });

  return baseMarker;
}

/**
 * Factory for creating the walking time isochrone circles around Spinningfields base.
 */
export function createWalkingIsochrones(L: any): any[] {
  return WALKING_ISOCHRONES.map((ring) => {
    return L.circle([BASE_LAT, BASE_LNG], {
      radius: ring.radius,
      color: ring.color,
      weight: ring.weight || 1.4,
      dashArray: ring.dash,
      fillColor: ring.color,
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

/**
 * Generate popup DOM content for a venue. `onViewDossier` runs when the
 * popup's dossier button is pressed.
 */
export function createVenuePopupContent(venue: Venue, onViewDossier?: () => void): HTMLElement {
  const metadata = getTierMetadata(venue.status);
  const styling = metadata.colors;

  const popupContent = document.createElement('div');
  popupContent.className = 'p-3 font-serif-header text-[#1a1e24] max-w-[260px]';
  popupContent.innerHTML = `
    <div class="flex items-center justify-between gap-2 border-b border-stone-200 pb-1.5 mb-2">
      <span class="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded"
            style="background-color: ${styling.bg}20; color: ${styling.bg}; border: 1px solid ${styling.bg}40;">
        ${escapeHtml(venue.status)}
      </span>
      <span class="text-xs font-mono font-bold text-amber-900">${escapeHtml(venue.cost)}</span>
    </div>
    <h3 class="font-bold text-sm text-[#1a1e24] leading-tight">${escapeHtml(venue.name)}</h3>
    <p class="text-xs text-stone-600 font-sans mt-0.5">${escapeHtml(venue.cuisine)} &bull; ${escapeHtml(walkText(venue.walkingTimeMin, 'min walk from Base'))} (${escapeHtml(milesText(venue.distanceMiles, 'mi'))})</p>

    <div class="mt-2 p-1.5 bg-stone-100/90 rounded border border-stone-200 text-xs font-sans">
      <strong class="text-stone-800 font-serif-header">Eat Like Us:</strong>
      <p class="text-stone-700 italic mt-0.5 line-clamp-2">${escapeHtml(venue.eatLikeUs)}</p>
    </div>

    <div class="mt-3 flex items-center justify-between gap-2 font-sans text-xs">
      <button type="button" data-view-dossier class="w-full bg-[#1a1e24] hover:bg-[#8b1e22] text-[#f9f7f1] py-1.5 px-3 rounded font-semibold text-center transition-colors">
        View Ledger Dossier
      </button>
    </div>
  `;

  if (onViewDossier) {
    popupContent.querySelector('[data-view-dossier]')?.addEventListener('click', onViewDossier);
  }

  return popupContent;
}

/**
 * Binds the venue popup to a marker, so tapping the pin opens only the popup.
 * The popup's dossier button closes it before running `onViewDossier`, so
 * nothing is left behind on the map once the venue panel is closed.
 * `overlayClearance` is the height in px of the controls floating over the
 * top of the map; the map pans so the popup opens below them.
 */
export function bindVenuePopup(
  marker: any,
  venue: Venue,
  onViewDossier: () => void,
  overlayClearance = 0
): void {
  const popupContent = createVenuePopupContent(venue, () => {
    marker.closePopup();
    onViewDossier();
  });
  marker.bindPopup(popupContent, {
    maxWidth: 280,
    className: 'ledger-popup',
    autoPanPaddingTopLeft: [10, overlayClearance + 10],
  });
}
