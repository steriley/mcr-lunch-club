import type { Ref } from 'vue';
import {
  BASE_LAT,
  BASE_LNG,
  DEFAULT_ZOOM,
  createBaseMarker,
  createMapRemover,
  createTileLayer,
  createUserMarkerLayers,
  prefersReducedMotion,
} from '@/lib/map';
import { createVenuePinLayer, type VenuePinLayer } from '@/lib/map/pin-layer';
import type { MoveIntent, NearMeSession } from '@/lib/near-me/session';
import { snapAfterPinTap, type SheetSnap } from '@/lib/near-me/sheet';
import type { BottomSheet } from './useBottomSheet';

/** Share of the uncovered map, from its top edge, where a selected pin sits: the middle. */
const SELECTED_PIN_VISIBLE_FRACTION = 0.5;

/** Room on a phone that the floating controls take from the map, in px from its top and right edges. */
interface OverlayInsets {
  top: number;
  right: number;
}

/** Clear space kept beyond a control, so a pin (about 28px wide, 34px tall) never touches it. */
const CONTROL_MARGIN_PX = 16;
const PIN_HALF_WIDTH_PX = 14;
const PIN_HEIGHT_PX = 34;

interface NearMeLeafletOptions {
  mapApiKey?: string;
  container: Ref<HTMLElement | null>;
  sheet: BottomSheet;
  session: NearMeSession;
}

/**
 * The Near Me Leaflet map. It draws what the session says (venue pins with their
 * rank badges, the user's marker) and carries out the moves the session asks for,
 * keeping the point clear of the venue panel. It tells the session about taps and
 * drags and writes no state of its own. Leaflet loads the first time the map opens.
 */
export function useNearMeLeaflet(options: NearMeLeafletOptions) {
  const { sheet, session } = options;

  let mapInstance: any = null;
  // Removes the map once any zoom animation has ended (see createMapRemover).
  let removeMap: (() => void) | null = null;
  let leafletModule: any = null;
  let pins: VenuePinLayer | null = null;
  let userLayersGroup: any = null;
  let stopListening: (() => void) | null = null;
  // What was last drawn, so a session event that changes neither isn't redrawn.
  let drawnPins: unknown = null;
  let drawnSelection: string | null = null;
  let drawnPosition: unknown = null;

  const leaflet = () => leafletModule.default || leafletModule;

  /** Measures the close button and the control stack for the phone's padding; zeros on desktop. */
  function overlayInsets(): OverlayInsets {
    const mapEl = options.container.value;
    const shell = mapEl?.parentElement;
    const controls = shell?.querySelector('.near-me-controls-cluster');
    const close = shell?.querySelector('#btn-near-me-close');
    if (sheet.isDesktop.value || !mapEl || !controls || !close) return { top: 0, right: 0 };
    const mapRect = mapEl.getBoundingClientRect();
    return {
      top: Math.max(close.getBoundingClientRect().bottom - mapRect.top, 0),
      right: Math.max(mapRect.right - controls.getBoundingClientRect().left, 0),
    };
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
      // The controls and the close button take the right and top edges too.
      const { top, right } = overlayInsets();
      const visibleTop = Math.min(top, visibleHeight);
      const visibleCentreY = visibleTop + (visibleHeight - visibleTop) * fraction;
      point.y += mapHeight / 2 - visibleCentreY;
      point.x += right / 2;
    }
    return mapInstance.unproject(point, zoom);
  }

  /** Centres on a point at street zoom or closer, clear of the panel. */
  function showPoint(lat: number, lng: number) {
    const zoom = Math.max(mapInstance.getZoom(), 16);
    mapInstance.setView(centreForVisibleMap(lat, lng, zoom), zoom, {
      animate: !prefersReducedMotion(),
    });
  }

  /** Frames the visitor and the nearest venues, clear of the panel and the floating controls. */
  function fitFirstFix(points: Array<{ lat: number; lng: number }>) {
    const bounds = leaflet().latLngBounds(points.map(({ lat, lng }) => [lat, lng]));
    if (sheet.isDesktop.value) {
      mapInstance.fitBounds(bounds, {
        paddingTopLeft: [410, 60],
        paddingBottomRight: [60, 60],
        maxZoom: 17,
        animate: !prefersReducedMotion(),
      });
      return;
    }
    // Fit into the part of the map the sheet, the close button and the controls leave showing.
    // A pin extends up and to both sides of its point, so its size is kept clear as well.
    const { top, right } = overlayInsets();
    const bottomPadding = Math.round(sheet.settledHeightPx()) + 24;
    mapInstance.fitBounds(bounds, {
      paddingTopLeft: [30, Math.round(top) + CONTROL_MARGIN_PX + PIN_HEIGHT_PX],
      paddingBottomRight: [
        Math.round(right) + CONTROL_MARGIN_PX + PIN_HALF_WIDTH_PX,
        bottomPadding,
      ],
      maxZoom: 17,
      animate: !prefersReducedMotion(),
    });
  }

  /** Pans so the venue's pin sits in the clear part of the map: above the sheet, or beside the panel. */
  function focusVenue(id: string, lat: number, lng: number, sheetState: SheetSnap) {
    if (!pins?.has(id)) return;
    mapInstance.panTo(
      centreForVisibleMap(
        lat,
        lng,
        mapInstance.getZoom(),
        sheetState,
        SELECTED_PIN_VISIBLE_FRACTION
      ),
      { animate: !prefersReducedMotion() }
    );
  }

  function showBase() {
    mapInstance.setView(centreForVisibleMap(BASE_LAT, BASE_LNG, DEFAULT_ZOOM), DEFAULT_ZOOM, {
      animate: !prefersReducedMotion(),
    });
  }

  /** Carries out a move the session asked for. */
  function perform(move: MoveIntent) {
    switch (move.kind) {
      case 'fit-first-fix':
        fitFirstFix(move.points);
        break;
      case 'show-point':
        showPoint(move.lat, move.lng);
        break;
      case 'focus-venue':
        // Tapping a pin on a collapsed sheet opens it to half height, so aim for that.
        focusVenue(
          move.id,
          move.lat,
          move.lng,
          move.source === 'pin'
            ? snapAfterPinTap(sheet.snap.value, sheet.isDesktop.value)
            : sheet.snap.value
        );
        break;
      case 'show-base':
        showBase();
        break;
    }
  }

  /** The user's marker and accuracy circle, at the session's position. */
  function drawUserMarker() {
    if (!mapInstance || !leafletModule || !userLayersGroup) return;
    userLayersGroup.clearLayers();
    const position = session.view().position;
    if (!position) return;
    const layers = createUserMarkerLayers(leaflet(), position, position.manual === true);
    userLayersGroup.addLayer(layers.accuracyCircle);
    userLayersGroup.addLayer(layers.marker);
  }

  /** Brings the map in line with the session after an event: pins, selection, user marker, then any move. */
  function render() {
    if (!mapInstance || !pins) return;
    const view = session.view();
    if (view.pins !== drawnPins) {
      drawnPins = view.pins;
      pins.sync(view.pins);
      pins.select(view.selectedId);
      drawnSelection = view.selectedId;
    }
    if (view.selectedId !== drawnSelection) {
      drawnSelection = view.selectedId;
      pins.select(drawnSelection);
    }
    if (view.position !== drawnPosition) {
      drawnPosition = view.position;
      drawUserMarker();
    }
    const move = session.takeMove();
    if (move) perform(move);
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
   * while Leaflet was loading.
   */
  async function init(isCurrent: () => boolean, panel: () => HTMLElement | null): Promise<boolean> {
    if (typeof window === 'undefined' || !options.container.value) return false;

    if (!leafletModule) leafletModule = await import('leaflet');
    if (!isCurrent() || !options.container.value) return false;
    const L = leaflet();

    removeMap?.();
    mapInstance = L.map(options.container.value, {
      center: [BASE_LAT, BASE_LNG],
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
      zoomAnimation: !prefersReducedMotion(),
      fadeAnimation: !prefersReducedMotion(),
      markerZoomAnimation: !prefersReducedMotion(),
      inertia: !prefersReducedMotion(),
    });
    removeMap = createMapRemover(mapInstance);

    // Top-right zoom controls (below header overlay)
    L.control.zoom({ position: 'topright' }).addTo(mapInstance);

    // A failed tile (offline or CDN trouble) is left blank; pins and the panel still work.
    const tileLayer = createTileLayer(L, options.mapApiKey);
    tileLayer.on('tileerror', () => {});
    tileLayer.addTo(mapInstance);

    // The selected venue's card shows in the panel (Your selection), not on the map.
    pins = createVenuePinLayer(L, (venue) => session.selectFromPin(venue.id));
    pins.layer.addTo(mapInstance);
    userLayersGroup = L.layerGroup().addTo(mapInstance);
    mapInstance.addLayer(createBaseMarker(L));

    // Stop auto-following when the visitor drags or zooms the map. Our own moves are
    // told apart by the session (see takeMove).
    mapInstance.on('dragstart zoomstart', () => session.userMovedMap());

    // Picking a position by hand: the next tap on the map sets it (the session ignores other taps).
    mapInstance.on('click', (e: any) =>
      session.pickedLocation({ lat: e.latlng.lat, lng: e.latlng.lng })
    );

    drawnPins = null;
    drawnSelection = null;
    drawnPosition = null;
    stopListening?.();
    stopListening = session.subscribe(render);
    render();
    isolatePanel(panel());

    // Invalidate size to guarantee crisp tile render after fullscreen mount
    requestAnimationFrame(() => {
      mapInstance?.invalidateSize();
    });
    return true;
  }

  function destroy() {
    stopListening?.();
    stopListening = null;
    removeMap?.();
    removeMap = null;
    mapInstance = null;
    pins = null;
    userLayersGroup = null;
  }

  return {
    init,
    destroy,
    isolatePanel,
  };
}
