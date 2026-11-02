import type { Venue } from '@/types';
import { createVenueIcon } from './markers';
import type { LatLng } from './ranking';

/**
 * Venue pins on a Leaflet map, for both the Ledger Map and Near Me. Pins are
 * kept between redraws (so a focused pin stays focused) and only those that
 * appear, vanish, move or change rank are touched. A pin answers to a tap, and
 * to Enter or Space, since a marker is a button. The selected pin is marked and
 * raised above its neighbours.
 */

export interface VenuePin {
  venue: Venue;
  /** The Near Me number badge. */
  rank?: number;
  /** Where to draw it, when not at the venue (a fanned-out pin). */
  at?: LatLng;
}

interface DrawnPin {
  marker: any;
  rank: number | undefined;
  at: LatLng;
}

/** Raised above other pins while selected. */
const SELECTED_Z_OFFSET = 1000;

/**
 * Runs `handler` when a marker is tapped, or when Enter or Space is pressed on it. Leaflet only
 * turns Enter into a click for popups, and a marker is a button, so it must answer to both keys.
 */
export function onMarkerActivate(marker: any, handler: (viaKeyboard: boolean) => void) {
  marker.on('click', () => handler(false));
  marker.on('keydown', (event: any) => {
    const key = event.originalEvent?.key;
    if (key !== 'Enter' && key !== ' ') return;
    event.originalEvent.preventDefault();
    handler(true);
  });
}

export function createVenuePinLayer(
  L: any,
  onActivate: (venue: Venue, viaKeyboard: boolean) => void
) {
  const layer = L.layerGroup();
  const drawn = new Map<string, DrawnPin>();
  let selectedId: string | null = null;

  function markSelected(id: string, pin: DrawnPin) {
    const selected = id === selectedId;
    pin.marker.getElement()?.classList.toggle('is-selected-pin', selected);
    pin.marker.setZIndexOffset(selected ? SELECTED_Z_OFFSET : 0);
  }

  function remove(id: string) {
    const pin = drawn.get(id);
    if (!pin) return;
    layer.removeLayer(pin.marker);
    drawn.delete(id);
  }

  return {
    /** The Leaflet layer group holding the pins; add it to the map once. */
    layer,

    /** Makes the pins on the map exactly `pins`, in that order for new ones. */
    sync(pins: readonly VenuePin[]) {
      const wanted = new Map<string, VenuePin>();
      for (const pin of pins) {
        if (pin.at || (pin.venue.lat != null && pin.venue.lng != null))
          wanted.set(pin.venue.id, pin);
      }
      for (const [id, pin] of drawn) {
        const next = wanted.get(id);
        const at = next?.at ?? (next ? { lat: next.venue.lat!, lng: next.venue.lng! } : null);
        if (!at || at.lat !== pin.at.lat || at.lng !== pin.at.lng) remove(id);
      }
      for (const [id, pin] of wanted) {
        const existing = drawn.get(id);
        if (existing) {
          if (existing.rank !== pin.rank) {
            existing.marker.setIcon(createVenueIcon(L, pin.venue, pin.rank));
            existing.rank = pin.rank;
            markSelected(id, existing);
          }
          continue;
        }
        const at = pin.at ?? { lat: pin.venue.lat!, lng: pin.venue.lng! };
        const marker = L.marker([at.lat, at.lng], {
          icon: createVenueIcon(L, pin.venue, pin.rank),
        });
        const entry = { marker, rank: pin.rank, at };
        onMarkerActivate(marker, (viaKeyboard) => onActivate(pin.venue, viaKeyboard));
        // The marker's element only exists once it is on the map.
        marker.on('add', () => markSelected(id, entry));
        drawn.set(id, entry);
        layer.addLayer(marker);
      }
    },

    /** Marks `venueId`'s pin as the selected one (null: none). */
    select(venueId: string | null) {
      selectedId = venueId;
      drawn.forEach((pin, id) => markSelected(id, pin));
    },

    /** The marker drawn for `venueId`, if any. */
    get: (venueId: string): any => drawn.get(venueId)?.marker,

    has: (venueId: string) => drawn.has(venueId),

    /** Every marker, in the order they were drawn. */
    markers: (): any[] => [...drawn.values()].map((pin) => pin.marker),

    /** The ids of the pins drawn. */
    ids: () => [...drawn.keys()],

    clear() {
      layer.clearLayers();
      drawn.clear();
    },
  };
}

export type VenuePinLayer = ReturnType<typeof createVenuePinLayer>;
