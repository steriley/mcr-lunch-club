import type { Ref } from 'vue';
import {
  BASE_LAT,
  BASE_LNG,
  DEFAULT_ZOOM,
  FAR_FROM_BASE_METRES,
  createBaseMarker,
  createMapRemover,
  createTileLayer,
  createUserMarkerLayers,
  createVenueIcon,
  createVenueMarker,
  haversineMetres,
  type RankedVenue,
  type useGeolocation,
} from '@/lib/map';
import type { SheetSnap } from '@/lib/near-me/sheet';
import type { Venue } from '@/types';
import type { BottomSheet } from './useBottomSheet';

/** The nearest few pins carry their list number. */
const PIN_RANK_LIMIT = 5;

/** Share of the uncovered map, from its top edge, where a selected pin sits: the middle. */
const SELECTED_PIN_VISIBLE_FRACTION = 0.5;

/** Programmatic moves end before this, so they aren't mistaken for the user's own panning. */
const MOVE_SETTLE_MS = 400;

interface NearMeLeafletOptions {
  mapApiKey?: string;
  container: Ref<HTMLElement | null>;
  sheet: BottomSheet;
  geo: ReturnType<typeof useGeolocation>;
  /** Venues that get a pin: in the selected tiers and price bands, with a location. */
  pinnedVenues: () => Venue[];
  /** Every public venue, to rebuild a pin's icon when its rank changes. */
  allVenues: () => readonly Venue[];
  rankedVenues: Ref<RankedVenue[]>;
  selectedVenueId: Ref<string | null>;
  isFollowingUser: Ref<boolean>;
  isPickingLocation: Ref<boolean>;
  hasFittedFirstFix: Ref<boolean>;
  isUserFarFromManchester: Ref<boolean>;
  isLowAccuracy: Ref<boolean>;
  /** A pin was tapped. */
  onPinSelect: (venue: Venue) => void;
}

/**
 * The Near Me Leaflet map: venue pins with their rank badges, the user's
 * marker, first-fix framing, and moves that keep a point clear of the venue
 * panel. Leaflet loads the first time the map opens.
 */
export function useNearMeLeaflet(options: NearMeLeafletOptions) {
  const { sheet, geo } = options;

  let mapInstance: any = null;
  // Removes the map once any zoom animation has ended (see createMapRemover).
  let removeMap: (() => void) | null = null;
  let leafletModule: any = null;
  let venueMarkersLayer: any = null;
  let userLayersGroup: any = null;
  const venueMarkersMap = new Map<string, any>();
  // Swap a pin's icon only when its rank changed, so pins aren't rebuilt needlessly on re-ranking.
  const pinRanks = new Map<string, number | undefined>();
  let isProgrammaticMove = false;

  const leaflet = () => leafletModule.default || leafletModule;

  /** Marks a map move as ours until it settles. */
  function moveProgrammatically(move: () => void, settleMs = MOVE_SETTLE_MS) {
    isProgrammaticMove = true;
    move();
    setTimeout(() => {
      isProgrammaticMove = false;
    }, settleMs);
  }

  function pinRankFor(venueId: string): number | undefined {
    const index = options.rankedVenues.value.findIndex((rv) => rv.venue.id === venueId);
    return index >= 0 && index < PIN_RANK_LIMIT ? index + 1 : undefined;
  }

  function highlightSelectedPin() {
    venueMarkersMap.forEach((marker, id) => {
      const el = marker.getElement();
      if (!el) return;
      const isSelected = id === options.selectedVenueId.value;
      el.classList.toggle('is-selected-pin', isSelected);
      marker.setZIndexOffset(isSelected ? 1000 : 0);
    });
  }

  function applyPinRanks() {
    if (!leafletModule || venueMarkersMap.size === 0) return;
    const L = leaflet();
    let changed = false;
    venueMarkersMap.forEach((marker, id) => {
      const rank = pinRankFor(id);
      if (pinRanks.get(id) === rank) return;
      const venue = options.allVenues().find((v) => v.id === id);
      if (!venue) return;
      marker.setIcon(createVenueIcon(L, venue, rank));
      pinRanks.set(id, rank);
      changed = true;
    });
    if (changed) highlightSelectedPin();
  }

  function renderVenueMarkers() {
    if (!mapInstance || !leafletModule || !venueMarkersLayer) return;
    const L = leaflet();
    venueMarkersLayer.clearLayers();
    venueMarkersMap.clear();
    pinRanks.clear();

    options.pinnedVenues().forEach((venue) => {
      const rank = pinRankFor(venue.id);
      const marker = createVenueMarker(L, venue, rank);
      if (!marker) return;

      venueMarkersMap.set(venue.id, marker);
      pinRanks.set(venue.id, rank);

      // The selected venue's card shows in the panel (Your selection), not on the map.
      marker.on('click', () => options.onPinSelect(venue));
      venueMarkersLayer.addLayer(marker);
    });

    highlightSelectedPin();
  }

  /**
   * The map centre that puts a point in the part of the map the venue panel leaves showing:
   * above the bottom sheet on a phone, right of the floating panel on desktop. `fraction` is
   * how far down the uncovered height the point sits on a phone (0.5 is the middle).
   */
  function centreForVisibleMap(
    lat: number,
    lng: number,
    zoom: number,
    sheetState: SheetSnap = sheet.snap.value,
    fraction = 0.5
  ) {
    const point = mapInstance.project([lat, lng], zoom);
    if (sheet.isDesktop.value) {
      // Offset so the point isn't hidden behind the 380px left floating panel
      point.x -= 190;
    } else {
      // The sheet covers the bottom of the map: shift the centre below the point so the
      // point lands in the middle of the part still showing.
      const mapHeight = mapInstance.getSize().y;
      const visibleHeight = Math.max(mapHeight - sheet.settledHeightPx(sheetState), 0);
      point.y += mapHeight / 2 - visibleHeight * fraction;
    }
    return mapInstance.unproject(point, zoom);
  }

  /** Centres on a point at street zoom or closer, clear of the panel. */
  function showPoint(lat: number, lng: number) {
    const zoom = Math.max(mapInstance.getZoom(), 16);
    mapInstance.setView(centreForVisibleMap(lat, lng, zoom), zoom, { animate: true });
  }

  // First-fix bounds fitting: fits user plus top 3 venues
  function fitFirstFixBounds() {
    if (options.hasFittedFirstFix.value || !mapInstance || !leafletModule || !geo.position.value)
      return;
    const L = leaflet();

    const points: [number, number][] = [[geo.position.value.lat, geo.position.value.lng]];
    options.rankedVenues.value.slice(0, 3).forEach((rv) => {
      if (rv.venue.lat != null && rv.venue.lng != null) points.push([rv.venue.lat, rv.venue.lng]);
    });

    if (points.length < 2) return;

    const bounds = L.latLngBounds(points);
    options.hasFittedFirstFix.value = true;
    moveProgrammatically(() => {
      if (sheet.isDesktop.value) {
        mapInstance.fitBounds(bounds, {
          paddingTopLeft: [410, 60],
          paddingBottomRight: [60, 60],
          maxZoom: 17,
          animate: true,
        });
      } else {
        // Fit into the part of the map the bottom sheet leaves showing.
        const bottomPadding = Math.round(sheet.settledHeightPx()) + 24;
        mapInstance.fitBounds(bounds, {
          paddingTopLeft: [30, 80],
          paddingBottomRight: [30, bottomPadding],
          maxZoom: 17,
          animate: true,
        });
      }
    }, 500);
  }

  /** Pans so the venue's pin sits in the clear part of the map: above the sheet, or beside the panel. */
  function focusVenue(venue: Venue, { sheetState }: { sheetState: SheetSnap }) {
    if (!mapInstance || !venueMarkersMap.has(venue.id) || venue.lat == null || venue.lng == null)
      return;
    moveProgrammatically(() => {
      const zoom = mapInstance.getZoom();
      mapInstance.panTo(
        centreForVisibleMap(
          venue.lat!,
          venue.lng!,
          zoom,
          sheetState,
          SELECTED_PIN_VISIBLE_FRACTION
        ),
        { animate: true }
      );
    });
  }

  /** Recentre on the user; false when there is no position yet. */
  function recenterOnUser(): boolean {
    if (!geo.position.value || !mapInstance) return false;
    const { lat, lng } = geo.position.value;
    moveProgrammatically(() => showPoint(lat, lng));
    return true;
  }

  function showBase() {
    if (!mapInstance) return;
    moveProgrammatically(() => {
      mapInstance.setView(centreForVisibleMap(BASE_LAT, BASE_LNG, DEFAULT_ZOOM), DEFAULT_ZOOM, {
        animate: true,
      });
    });
  }

  function updateUserMarker() {
    if (!mapInstance || !leafletModule || !userLayersGroup) return;
    const L = leaflet();
    userLayersGroup.clearLayers();

    const position = geo.position.value;
    if (!position) return;

    const layers = createUserMarkerLayers(L, position, geo.isManual.value);
    userLayersGroup.addLayer(layers.accuracyCircle);
    userLayersGroup.addLayer(layers.marker);

    options.isLowAccuracy.value = position.accuracy > 100;

    const distFromBase = haversineMetres(
      { lat: position.lat, lng: position.lng },
      { lat: BASE_LAT, lng: BASE_LNG }
    );
    const wasFarAway = options.isUserFarFromManchester.value;
    options.isUserFarFromManchester.value = distFromBase > FAR_FROM_BASE_METRES;

    // Far away: keep the Spinningfields framing rather than following to a useless view,
    // and count the first fix as fitted so the map doesn't zoom out to include it.
    if (options.isUserFarFromManchester.value) {
      options.hasFittedFirstFix.value = true;
      return;
    }

    // Back inside range after being far away: frame the next fix afresh.
    if (wasFarAway) options.hasFittedFirstFix.value = false;

    if (options.isFollowingUser.value && options.hasFittedFirstFix.value) {
      moveProgrammatically(() => showPoint(position.lat, position.lng));
    }
  }

  /** Stops taps and scrolls on the panel reaching the map underneath. */
  function isolatePanel(panel: HTMLElement | null) {
    if (!panel || !leafletModule) return;
    const L = leaflet();
    L.DomEvent.disableClickPropagation(panel);
    L.DomEvent.disableScrollPropagation(panel);
  }

  /**
   * Builds the map. Returns false when it was superseded (closed or reopened)
   * while Leaflet was loading. `onReady` runs once the pins and user marker are
   * on the map.
   */
  async function init(
    isCurrent: () => boolean,
    panel: () => HTMLElement | null,
    onReady: () => void
  ): Promise<boolean> {
    if (typeof window === 'undefined' || !options.container.value) return false;

    if (!leafletModule) leafletModule = await import('leaflet');
    if (!isCurrent() || !options.container.value) return false;
    const L = leaflet();

    removeMap?.();
    mapInstance = L.map(options.container.value, {
      center: [BASE_LAT, BASE_LNG],
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });
    removeMap = createMapRemover(mapInstance);

    // Top-right zoom controls (below header overlay)
    L.control.zoom({ position: 'topright' }).addTo(mapInstance);

    // A failed tile (offline or CDN trouble) is left blank; pins and the panel still work.
    const tileLayer = createTileLayer(L, options.mapApiKey);
    tileLayer.on('tileerror', () => {});
    tileLayer.addTo(mapInstance);

    venueMarkersLayer = L.layerGroup().addTo(mapInstance);
    userLayersGroup = L.layerGroup().addTo(mapInstance);
    mapInstance.addLayer(createBaseMarker(L));

    renderVenueMarkers();

    // Stop auto-following when user drags or zooms the map manually
    mapInstance.on('dragstart zoomstart', () => {
      if (!isProgrammaticMove) options.isFollowingUser.value = false;
    });

    // Picking a position by hand: the next tap on the map sets it.
    mapInstance.on('click', (e: any) => {
      if (!options.isPickingLocation.value) return;
      geo.setManualPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
      options.isPickingLocation.value = false;
      options.isFollowingUser.value = true;
      showPoint(e.latlng.lat, e.latlng.lng);
    });

    updateUserMarker();
    onReady();
    isolatePanel(panel());

    // Invalidate size to guarantee crisp tile render after fullscreen mount
    requestAnimationFrame(() => {
      mapInstance?.invalidateSize();
    });
    return true;
  }

  function destroy() {
    removeMap?.();
    removeMap = null;
    mapInstance = null;
    venueMarkersLayer = null;
    userLayersGroup = null;
    venueMarkersMap.clear();
  }

  return {
    init,
    destroy,
    renderVenueMarkers,
    applyPinRanks,
    highlightSelectedPin,
    fitFirstFixBounds,
    focusVenue,
    recenterOnUser,
    showBase,
    updateUserMarker,
    isolatePanel,
  };
}
