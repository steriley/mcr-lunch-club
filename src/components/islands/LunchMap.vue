<template>
  <div ref="rootRef" class="relative isolate flex flex-col w-full h-full overflow-hidden bg-paper rounded-2xl border border-hairline shadow-inner">
    <!-- A map is a poor way through 56 venues for anyone not using a pointer: the list is the other route. -->
    <a href="#venue-results" class="skip-link" @click.prevent="skipToList">Skip the map and go to the venue list</a>
    <!-- Announces the card for screen readers; it appears beside the map, away from where focus is. -->
    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>

    <!-- Map Header Strip -->
    <header class="map-header">
      <div class="map-header-title">
        <span class="material-symbols-outlined map-header-icon" aria-hidden="true">explore</span>
        <div class="map-header-text">
          <span class="map-header-kicker">Where We’ve Inspected</span>
          <span class="map-header-subtitle">Lunch Club HQ: Spinningfields</span>
        </div>
      </div>
      <span class="map-header-count">{{ visibleVenuesCount }} of {{ totalVenuesCount }} venues shown</span>
    </header>

    <!-- Map Container (positioning context for the floating controls) -->
    <div class="relative w-full flex-1 min-h-0" :aria-busy="!mapReady">
      <div ref="mapContainer" class="absolute inset-0 z-0"></div>
      <!-- A grey box until Leaflet has started (see onMounted). Leaflet owns the container's classes, so it sits on top instead. -->
      <div v-if="!mapReady" class="map-loading absolute inset-0 z-[1]" aria-hidden="true"></div>

      <!-- Nothing matches the filters: say so, with the way out, rather than leave an empty map. -->
      <div v-if="mapReady && visibleVenuesCount === 0" class="map-empty" role="status">
        <p class="map-empty-title">No venues match these filters</p>
        <button type="button" class="map-empty-button" @click="resetFilters">Reset filters</button>
      </div>

      <!-- Quick Map Controls (Floating top left) -->
      <div class="absolute top-3 left-3 z-[1000]">
        <button
          id="btn-near-me"
          @click="openNearMe"
          class="bg-deep hover:bg-deep text-parchment-fixed px-5 py-3 rounded-full shadow-lg border border-gold transition-all flex items-center gap-2 text-sm font-bold tracking-wide cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-brass"
          title="Open Near Me locate mode"
          aria-label="Open Near Me locate mode"
        >
          <span class="material-symbols-outlined near-me-icon" aria-hidden="true">my_location</span>
          <span>Near Me</span>
        </button>
      </div>

      <!-- The selected pin's card: fixed to the bottom of the map, not floating over the pin -->
      <Transition name="pin-card">
        <div v-if="pinVenue" ref="pinCardRef" class="pin-card" role="group" tabindex="-1" :aria-label="`${pinVenue.name}`">
          <button type="button" class="pin-card-close" aria-label="Close venue card" @click="onCloseClick">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>
          </button>
          <BenchPillar :venue="pinVenue" :inspections="inspectionsList" show-tier detailed />
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import '@/styles/map.css';
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue';
import { useStore } from '@nanostores/vue';
import { $filteredVenues, $filters, openNearMe, resetFilters, toggleTier } from '@/stores/filters';
import { $hoveredVenueId, $mapSelection, selectMapVenue } from '@/stores/results';
import { whenIdle } from '@/lib/idle';
import { $inspectionsList, $venuesList } from '@/stores/ledger';
import BenchPillar from '@/components/BenchPillar.vue';
import type { Inspection, Venue } from '@/types';
import {
  createMapRemover,
  BASE_LAT,
  BASE_LNG,
  DEFAULT_ZOOM,
  createTileLayer,
  createBaseMarker,
  createWalkingIsochrones,
  createLabelMarker,
  createVenueMarker,
  createVenueIcon,
  createClusterMarker,
  WALKING_ISOCHRONES,
} from '@/lib/map';
import {
  CLUSTER_MAX_ZOOM,
  clusterLabel,
  createClusterIndex,
  spiderfyOffsets,
  type ClusterIndex,
  type ClusterItem,
  type MapItem,
} from '@/lib/map/clusters';
import { anyOutsideView, frameFor } from '@/lib/map/framing';
import {
  NAME_HEIGHT_PX,
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
} from '@/lib/map/labels';
import { tierInfo } from '@/lib/tiers';
import { onThemeChange } from '@/lib/theme';
import { themeColor } from '@/lib/theme-color';

const props = defineProps<{
  mapApiKey?: string;
}>();

const mapContainer = ref<HTMLElement | null>(null);
const mapReady = ref(false);
const filters = useStore($filters);
const venuesList = useStore($venuesList);
const inspectionsStore = useStore($inspectionsList);
// The store hands back a deep-readonly copy; the card only reads it (Near Me does the same).
const inspectionsList = computed(() => inspectionsStore.value as Inspection[]);

let mapInstance: any = null;
let removeMap: (() => void) | null = null;
let leafletModule: any = null;
let markersLayer: any = null;
const markersById = new Map<string, any>();
// The walking rings and their labels come and go together with the "Walking rings" switch.
let ringsLayer: any = null;
let ringLabelsLayer: any = null;
let baseLayer: any = null;
// Venue names beside their pins, from zoom 16.
let namesLayer: any = null;
let namedPins: Set<string> = new Set();
// The rect each placed name takes, in the map's pixel space: the walking-ring labels steer clear of them.
let placedNameRects: Rect[] = [];
let ringsButton: HTMLAnchorElement | null = null;
const RINGS_STORAGE_KEY = 'mcr-map-rings';
const ringsVisible = ref(true);

// Clusters are redrawn at every zoom; single pins are kept between zooms, so a focused pin stays focused.
let clusterLayer: any = null;
let clusterIndex: ClusterIndex | null = null;
// The pins of a cluster that can't zoom any further (several venues in one building), fanned out around it.
let spiderLayer: any = null;
const spiderMarkers = new Map<string, any>();
let spiderfied: { key: string; lat: number; lng: number; venues: Venue[] } | null = null;
// A cluster that can never split (one building) was tapped from afar: it fans out once the map has zoomed in.
let pendingFanOut: { key: string; until: number } | null = null;
// How long a tap's zoom may take before its fan-out is forgotten (a user who zooms away shouldn't get one later).
const FAN_OUT_WAIT_MS = 3000;
// True while the selected venue is pulled out of a cluster it would otherwise hide in.
let pinnedOutsideClusters = false;
// Set while a ?venue= link positions the map itself, so a filter change it causes doesn't reframe.
let suppressReframe = false;

// Room to keep clear when framing: the Near Me button above, the venue card below.
const FRAME_PADDING = { top: 72, right: 48, bottom: 48, left: 48 };
// A phone's narrow map must zoom out to fit every venue; never closer than street level.
const FRAME_MIN_ZOOM = 12;
const FRAME_MAX_ZOOM = 16;

// The venues the filters match: the store's, so the list beside the map shows exactly these.
const filteredVenues = useStore($filteredVenues);

// The pin whose card is showing, at the bottom of the map.
const pinVenue = ref<Venue | null>(null);
const pinCardRef = ref<HTMLElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);

const announcement = computed(() =>
  pinVenue.value ? `Showing ${pinVenue.value.name}, ${tierInfo(pinVenue.value.tier).label}, ${pinVenue.value.cost}` : ''
);

// What shares the pick with the list: the venue chosen there (or here), and the row being pointed at.
const selection = useStore($mapSelection);
const hovered = useStore($hoveredVenueId);
// The cluster marker each venue currently sits in, so a hovered row can light up its cluster.
const clusterMarkerByVenue = new Map<string, any>();
// Where focus goes back to when the card closes: the pin that opened it.
let returnFocusTo: HTMLElement | null = null;
// A cluster was opened from the keyboard: its markers are about to be redrawn, so focus would be lost.
// Good for a couple of seconds, so a zoom that changes nothing can't claim focus on some later redraw.
let keepKeyboardInMapUntil = 0;
const KEEP_FOCUS_MS = 2000;

const visibleVenuesCount = computed(() => filteredVenues.value.length);
const totalVenuesCount = computed(() => venuesList.value.length);

let cancelStart: (() => void) | null = null;

onMounted(() => {
  if (typeof window === 'undefined' || !mapContainer.value) return;
  window.addEventListener('keydown', onMapKeydown);

  // Leaflet is the heaviest script on the page, so it starts once the browser is
  // idle and the rest of the page has rendered. A ?venue= link came for the map,
  // so that starts it straight away.
  if (new URLSearchParams(window.location.search).has('venue')) {
    void startMap();
  } else {
    cancelStart = whenIdle(() => void startMap());
  }
});

async function startMap() {
  cancelStart = null;
  if (!mapContainer.value) return;

  leafletModule = await import('leaflet');
  if (!mapContainer.value) return;
  const L = leafletModule.default || leafletModule;

  // Initialize Map
  mapInstance = L.map(mapContainer.value, {
    center: [BASE_LAT, BASE_LNG],
    zoom: DEFAULT_ZOOM,
    zoomControl: false,
    // Reduced motion: no animated zooms, fades or inertia on the map.
    zoomAnimation: !prefersReducedMotion(),
    fadeAnimation: !prefersReducedMotion(),
    markerZoomAnimation: !prefersReducedMotion(),
    inertia: !prefersReducedMotion(),
  });
  removeMap = createMapRemover(mapInstance);

  // Custom Zoom Control top-right
  L.control.zoom({ position: 'topright' }).addTo(mapInstance);

  // CartoDB Positron / Voyager Muted Archival Tile Layer
  createTileLayer(L, props.mapApiKey).addTo(mapInstance);

  addResetControl(L);

  addRingsControl(L);

  // Layer groups
  baseLayer = L.layerGroup().addTo(mapInstance);
  ringsLayer = L.layerGroup();
  ringLabelsLayer = L.layerGroup();
  namesLayer = L.layerGroup().addTo(mapInstance);
  ringsVisible.value = readRingsChoice();
  showRings(ringsVisible.value);
  markersLayer = L.layerGroup().addTo(mapInstance);
  clusterLayer = L.layerGroup().addTo(mapInstance);
  spiderLayer = L.layerGroup().addTo(mapInstance);

  // Tapping empty map puts the card and any fanned-out pins away (a pin tap doesn't reach the map).
  mapInstance.on('click', () => {
    collapseSpider();
    clearPin();
  });

  // Draw Base & Walking Rings
  drawBaseAndRings();

  // A ?venue= link positions the map itself; otherwise fit every venue the filters match.
  clusterIndex = createClusterIndex(filteredVenues.value);
  if (!new URLSearchParams(window.location.search).has('venue')) frameAll({ animate: false });

  // Clusters depend on the zoom: regroup whenever it changes (and drop a fan-out as it starts).
  mapInstance.on('zoomstart', collapseSpider);
  mapInstance.on('zoomend', renderMarkers);
  // Ring labels sit where they can be seen, so they follow the view; names don't depend on it.
  mapInstance.on('moveend resize', updateRingLabels);
  renderMarkers();
  mapReady.value = true;

  void focusLinkedVenue();
}

function leaflet() {
  return leafletModule.default || leafletModule;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Centre and zoom the map on every venue the filters match, plus Base. */
function frameAll({ animate }: { animate: boolean }) {
  if (!mapInstance) return;
  const venues = filteredVenues.value;
  const options = { animate: animate && !prefersReducedMotion() };
  if (venues.length === 0) {
    mapInstance.setView([BASE_LAT, BASE_LNG], DEFAULT_ZOOM, options);
    return;
  }
  const size = mapInstance.getSize();
  const frame = frameFor(
    [{ lat: BASE_LAT, lng: BASE_LNG }, ...venues.map((venue) => ({ lat: venue.lat!, lng: venue.lng! }))],
    { width: size.x, height: size.y, padding: FRAME_PADDING, minZoom: FRAME_MIN_ZOOM, maxZoom: FRAME_MAX_ZOOM }
  );
  if (frame) mapInstance.setView([frame.lat, frame.lng], frame.zoom, options);
}

/** After a filter change: reframe only if a matching venue is off screen, so a small tweak doesn't make the map jump. */
function reframeIfNeeded() {
  if (!mapInstance || filteredVenues.value.length === 0) return;
  const view = mapInstance.getBounds();
  const outside = anyOutsideView(
    filteredVenues.value.map((venue) => ({ lat: venue.lat!, lng: venue.lng! })),
    { south: view.getSouth(), west: view.getWest(), north: view.getNorth(), east: view.getEast() }
  );
  if (outside) frameAll({ animate: true });
}

/** A button under the zoom buttons that returns to the framing on every matching venue. */
function addResetControl(L: any) {
  const ResetControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control ledger-reset-control');
      const button = L.DomUtil.create('a', '', container) as HTMLAnchorElement;
      button.href = '#';
      button.setAttribute('role', 'button');
      button.setAttribute('aria-label', 'Reset map view');
      button.title = 'Reset view';
      button.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(button, 'click', (event: Event) => {
        L.DomEvent.preventDefault(event);
        frameAll({ animate: true });
      });
      // Links activate on Enter by themselves; a button role should answer to Space too.
      L.DomEvent.on(button, 'keydown', (event: KeyboardEvent) => {
        if (event.key !== ' ') return;
        L.DomEvent.preventDefault(event);
        frameAll({ animate: true });
      });
      return container;
    },
  });
  new ResetControl().addTo(mapInstance);
}

/** `/?venue=<slug>` (from a dossier's "Locate on Ledger Map") centres on that venue and shows its card. */
async function focusLinkedVenue() {
  const slug = new URLSearchParams(window.location.search).get('venue');
  if (!slug || !mapInstance) return;
  const venue = venuesList.value.find((candidate) => candidate.slug === slug);
  if (!venue) return;

  // Showing the venue's tier is a filter change, but the link already says where to look.
  suppressReframe = true;
  if (!filters.value.tiers.includes(venue.tier)) {
    toggleTier(venue.tier);
  }
  if (venue.lat != null && venue.lng != null) {
    mapInstance.setView([venue.lat, venue.lng], Math.max(mapInstance.getZoom(), 16));
  }
  showPin(venue);
  mapContainer.value?.scrollIntoView({ block: 'center' });
  await nextTick();
  suppressReframe = false;
}

// The rings' colours are resolved when drawn (SVG attributes), so redraw them for the new theme.
const stopFollowingTheme = onThemeChange(() => {
  drawBaseAndRings();
  drawSpider();
});

onUnmounted(() => {
  window.removeEventListener('keydown', onMapKeydown);
  cancelStart?.();
  stopFollowingTheme();
  removeMap?.();
  removeMap = null;
  mapInstance = null;
});

// A filter change regroups the clusters, then brings any matching venue that is off screen into view.
watch(filteredVenues, () => {
  if (!mapInstance || !leafletModule) return;
  clusterIndex = createClusterIndex(filteredVenues.value);
  spiderfied = null;
  renderMarkers();
  if (!suppressReframe) reframeIfNeeded();
});

function drawBaseAndRings() {
  if (!mapInstance || !leafletModule || !ringsLayer || !baseLayer) return;
  const L = leafletModule.default || leafletModule;
  ringsLayer.clearLayers();
  baseLayer.clearLayers();

  // 1. Spinningfields Base Origin Marker
  const baseMarker = createBaseMarker(L);
  // Venues near HQ would otherwise sit under its marker: keep it beneath the pins and clusters.
  baseMarker.setZIndexOffset(-1000);
  baseLayer.addLayer(baseMarker);

  // 2. Walking Time Isochrones (Rings)
  createWalkingIsochrones(L).forEach((circle) => {
    ringsLayer.addLayer(circle);
  });
}

/** The visitor's saved choice for the rings; they show unless switched off. */
function readRingsChoice(): boolean {
  try {
    return localStorage.getItem(RINGS_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function rememberRingsChoice(visible: boolean) {
  try {
    localStorage.setItem(RINGS_STORAGE_KEY, visible ? 'on' : 'off');
  } catch {
    // Private windows and blocked storage just forget the choice.
  }
}

/** Shows or hides the rings and their labels (the Base marker stays). */
function showRings(visible: boolean) {
  if (!mapInstance || !ringsLayer || !ringLabelsLayer) return;
  ringsVisible.value = visible;
  if (visible) {
    mapInstance.addLayer(ringsLayer);
    mapInstance.addLayer(ringLabelsLayer);
    updateRingLabels();
  } else {
    mapInstance.removeLayer(ringsLayer);
    mapInstance.removeLayer(ringLabelsLayer);
  }
  ringsButton?.setAttribute('aria-pressed', String(visible));
  ringsButton?.setAttribute('title', visible ? 'Hide walking rings' : 'Show walking rings');
}

/** A switch under the reset button that hides the walking rings; the choice is remembered. */
function addRingsControl(L: any) {
  const RingsControl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control ledger-rings-control');
      const button = L.DomUtil.create('a', '', container) as HTMLAnchorElement;
      button.href = '#';
      button.setAttribute('role', 'button');
      button.setAttribute('aria-label', 'Walking rings');
      button.setAttribute('aria-pressed', 'true');
      button.title = 'Hide walking rings';
      button.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/></svg>';
      ringsButton = button;
      const toggle = () => {
        showRings(!ringsVisible.value);
        rememberRingsChoice(ringsVisible.value);
      };
      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(button, 'click', (event: Event) => {
        L.DomEvent.preventDefault(event);
        toggle();
      });
      // Links activate on Enter by themselves; a button role should answer to Space too.
      L.DomEvent.on(button, 'keydown', (event: KeyboardEvent) => {
        if (event.key !== ' ') return;
        L.DomEvent.preventDefault(event);
        toggle();
      });
      return container;
    },
  });
  new RingsControl().addTo(mapInstance);
}

const NAME_FONT = '600 12px "Playfair Display", Georgia, serif';
const RING_FONT = '600 11px "Playfair Display", Georgia, serif';
const RING_LABEL_HEIGHT_PX = 14;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

/** Where the map's own controls sit over the tiles, in container pixels: ring labels keep out from under them. */
function controlZones(size: { x: number; y: number }): Rect[] {
  return [
    { x: 0, y: 0, width: 170, height: 64 }, // Near Me
    { x: size.x - 54, y: 0, width: 54, height: 160 }, // zoom, reset and rings
    { x: 0, y: size.y - 28, width: size.x, height: 28 }, // attribution
  ];
}

/**
 * Names beside the pins, from zoom 16. Every pin, cluster and the Base marker is an
 * obstacle; a name that would touch one, or another name, is left out. Approved
 * venues get first pick, then the nearest to Base. Placement doesn't depend on what is
 * in view, so names stay put as the map is dragged.
 */
function updateNames() {
  if (!mapInstance || !namesLayer) return;
  const L = leaflet();
  namesLayer.clearLayers();
  namedPins.forEach((id) => (markersById.get(id) ?? spiderMarkers.get(id))?.getElement()?.classList.remove('has-name-label'));
  namedPins = new Set();
  placedNameRects = [];

  const zoom = mapInstance.getZoom();
  if (zoom < NAME_MIN_ZOOM) return;
  const project = (latlng: any) => mapInstance.project(latlng, zoom);

  const obstacles: Rect[] = [];
  const basePoint = project([BASE_LAT, BASE_LNG]);
  obstacles.push({ x: basePoint.x - 16, y: basePoint.y - 16, width: 32, height: 32 });
  markersById.forEach((marker) => obstacles.push(pinRect(project(marker.getLatLng()))));
  spiderMarkers.forEach((marker) => obstacles.push(pinRect(project(marker.getLatLng()))));
  clusterLayer.eachLayer((marker: any) => obstacles.push(clusterRect(project(marker.getLatLng()))));

  const byId = new Map(filteredVenues.value.map((venue) => [venue.id, venue]));
  const shown = [...markersById.keys()].map((id) => byId.get(id)).filter((venue): venue is Venue => !!venue);
  const candidates: Array<LabelCandidate & { venue: Venue }> = byNamePriority(shown).map((venue) => {
    const text = nameLabelText(venue);
    const width = labelWidth(text, NAME_FONT);
    return { id: venue.id, venue, options: nameOptions(project([venue.lat!, venue.lng!]), width) };
  });

  const placed = placeLabels(candidates, obstacles);
  for (const candidate of candidates) {
    const index = placed.get(candidate.id);
    if (index === undefined) continue;
    const box = candidate.options[index];
    placedNameRects.push(box);
    namedPins.add(candidate.id);
    markersById.get(candidate.id)?.getElement()?.classList.add('has-name-label');
    const centre = mapInstance.unproject([box.x + box.width / 2, box.y + box.height / 2], zoom);
    namesLayer.addLayer(createLabelMarker(L, [centre.lat, centre.lng], nameLabelText(candidate.venue), { width: box.width, height: NAME_HEIGHT_PX }, 'name'));
  }
}

/**
 * Each walking ring's minutes, printed on the ring where it is on screen and clear of pins,
 * clusters, names and the map's own buttons. Recomputed as the map moves.
 */
function updateRingLabels() {
  if (!mapInstance || !ringLabelsLayer || !ringsVisible.value) return;
  const L = leaflet();
  ringLabelsLayer.clearLayers();

  const zoom = mapInstance.getZoom();
  const project = (latlng: any) => mapInstance.project(latlng, zoom);
  const size = mapInstance.getSize();
  // The view in the same pixel space as project(), wherever the map has been dragged to.
  const origin = mapInstance.getPixelBounds().min;
  const view: Rect = { x: origin.x, y: origin.y, width: size.x, height: size.y };
  const inset = (rect: Rect, by: number): Rect => ({ x: rect.x + by, y: rect.y + by, width: rect.width - by * 2, height: rect.height - by * 2 });

  const obstacles: Rect[] = [...placedNameRects];
  markersById.forEach((marker) => obstacles.push(pinRect(project(marker.getLatLng()))));
  spiderMarkers.forEach((marker) => obstacles.push(pinRect(project(marker.getLatLng()))));
  clusterLayer?.eachLayer((marker: any) => obstacles.push(clusterRect(project(marker.getLatLng()))));
  obstacles.push(...controlZones(size).map((zone) => ({ ...zone, x: zone.x + origin.x, y: zone.y + origin.y })));

  const centre = project([BASE_LAT, BASE_LNG]);
  // Web Mercator: a metre is this many pixels at Base's latitude.
  const pixelsPerMetre = (256 * 2 ** zoom) / (EARTH_CIRCUMFERENCE_M * Math.cos((BASE_LAT * Math.PI) / 180));
  const candidates = WALKING_ISOCHRONES.map((ring) => {
    const width = labelWidth(ring.shortLabel, RING_FONT, 80);
    const options = ringLabelOptions(centre, ring.radius * pixelsPerMetre, { width, height: RING_LABEL_HEIGHT_PX }, inset(view, 6));
    return { id: ring.shortLabel, ring, options };
  });

  const placed = placeLabels(candidates, obstacles);
  for (const candidate of candidates) {
    const index = placed.get(candidate.id);
    if (index === undefined) continue;
    const box = candidate.options[index];
    const at = mapInstance.unproject([box.x + box.width / 2, box.y + box.height / 2], zoom);
    ringLabelsLayer.addLayer(createLabelMarker(L, [at.lat, at.lng], candidate.ring.shortLabel, { width: box.width, height: RING_LABEL_HEIGHT_PX }, 'ring'));
  }
}

/** What to draw at `zoom`. A selected venue never hides inside a cluster: it comes out as its own pin. */
function itemsToShow(zoom: number): MapItem[] {
  pinnedOutsideClusters = false;
  const items = clusterIndex?.itemsAt(zoom) ?? [];
  const selected = pinVenue.value;
  if (!selected || !filteredVenues.value.some((venue) => venue.id === selected.id)) return items;

  const shownAlone = items.some((item) => item.kind === 'venue' && item.venue.id === selected.id);
  const fannedOut = spiderfied?.venues.some((venue) => venue.id === selected.id);
  if (shownAlone || fannedOut) return items;

  pinnedOutsideClusters = true;
  const others = createClusterIndex(filteredVenues.value.filter((venue) => venue.id !== selected.id));
  return [...others.itemsAt(zoom), { kind: 'venue', venue: selected }];
}

function renderMarkers() {
  if (!mapInstance || !leafletModule || !markersLayer || !clusterLayer) return;
  const L = leaflet();
  const items = itemsToShow(mapInstance.getZoom());
  const maxZoom = Math.min(mapInstance.getMaxZoom(), CLUSTER_MAX_ZOOM);

  // A tapped one-building cluster fans out as soon as the map is deep enough to show it honestly.
  if (pendingFanOut && Date.now() > pendingFanOut.until) pendingFanOut = null;
  if (pendingFanOut && mapInstance.getZoom() >= maxZoom) {
    const target = items.find((item): item is ClusterItem => item.kind === 'cluster' && item.key === pendingFanOut!.key);
    pendingFanOut = null;
    if (target) spiderfied = { key: target.key, lat: target.lat, lng: target.lng, venues: target.venues };
  }

  clusterLayer.clearLayers();
  clusterMarkerByVenue.clear();
  const singles = new Map<string, Venue>();
  let fanOutStillThere = false;
  for (const item of items) {
    if (item.kind === 'venue') {
      singles.set(item.venue.id, item.venue);
    } else if (spiderfied && item.key === spiderfied.key) {
      fanOutStillThere = true; // the fan-out draws its venues in its place
    } else {
      const label = clusterLabel(item, mapInstance.getZoom() < maxZoom ? 'Zoom in' : 'Spread out');
      const marker = createClusterMarker(L, item, label);
      onActivate(marker, (viaKeyboard) => openCluster(item, viaKeyboard));
      clusterLayer.addLayer(marker);
      item.venues.forEach((venue) => clusterMarkerByVenue.set(venue.id, marker));
    }
  }
  if (spiderfied && !fanOutStillThere) spiderfied = null;
  drawSpider();

  // Single pins stay put between zooms; only the ones that appear or vanish change.
  markersById.forEach((marker, id) => {
    if (singles.has(id)) return;
    markersLayer.removeLayer(marker);
    markersById.delete(id);
  });
  singles.forEach((venue, id) => {
    if (markersById.has(id)) return;
    const marker = createVenueMarker(L, venue);
    if (!marker) return;
    // Tapping a pin shows its card at the bottom of the map; the card links to the venue's page.
    onActivate(marker, (viaKeyboard) => showPin(venue, viaKeyboard));
    markersById.set(id, marker);
    markersLayer.addLayer(marker);
  });

  // A filter change can take the selected venue off the map: drop its card.
  if (pinVenue.value && !filteredVenues.value.some((venue) => venue.id === pinVenue.value?.id)) {
    pinVenue.value = null;
    selectMapVenue(null);
  }
  highlightPin();
  markHovered();
  orderMarkersForKeyboard();
  keepFocusInMap();
  updateNames();
  updateRingLabels();
}

/**
 * Opening a cluster redraws the markers, which would drop a keyboard user's focus onto the page.
 * Keep it in the map instead: on the first of a fan-out's pins, or on the map itself after a zoom.
 */
function keepFocusInMap() {
  if (Date.now() > keepKeyboardInMapUntil) return;
  keepKeyboardInMapUntil = 0;
  const firstPin = spiderMarkers.values().next().value?.getElement() as HTMLElement | undefined;
  (firstPin ?? (mapInstance?.getContainer() as HTMLElement | undefined))?.focus({ preventScroll: true });
}

/**
 * Tab order should follow the map, top to bottom. Leaflet adds markers in the order they are drawn,
 * which is no order a person would find, so put the markers back in reading order after every draw.
 * (A marker that has focus stays where it is: moving it would drop the focus.)
 */
function orderMarkersForKeyboard() {
  const pane = mapInstance?.getPane('markerPane');
  if (!pane || (document.activeElement && document.activeElement !== pane && pane.contains(document.activeElement))) return;
  const markers = [...markersById.values(), ...(clusterLayer?.getLayers() ?? []), ...spiderMarkers.values()];
  markers
    .map((marker) => ({ element: marker.getElement() as HTMLElement | undefined, at: marker.getLatLng() }))
    .filter((entry): entry is { element: HTMLElement; at: { lat: number; lng: number } } => Boolean(entry.element))
    .sort((a, b) => b.at.lat - a.at.lat || a.at.lng - b.at.lng)
    .forEach((entry) => pane.appendChild(entry.element));
}

/**
 * Runs `handler` when a marker is tapped, or when Enter or Space is pressed on it. Leaflet only
 * turns Enter into a click for popups, and a marker is a button, so it must answer to both keys.
 */
function onActivate(marker: any, handler: (viaKeyboard: boolean) => void) {
  marker.on('click', () => handler(false));
  marker.on('keydown', (event: any) => {
    const key = event.originalEvent?.key;
    if (key !== 'Enter' && key !== ' ') return;
    event.originalEvent.preventDefault();
    handler(true);
  });
}

/** Tapping a cluster zooms to its venues; one that can't split by zooming (one building) zooms in and fans out. */
function openCluster(cluster: ClusterItem, viaKeyboard = false) {
  if (!mapInstance) return;
  keepKeyboardInMapUntil = viaKeyboard ? Date.now() + KEEP_FOCUS_MS : 0;
  const maxZoom = Math.min(mapInstance.getMaxZoom(), CLUSTER_MAX_ZOOM);
  if (cluster.expansionZoom > maxZoom) {
    if (mapInstance.getZoom() >= maxZoom) {
      spiderfied = { key: cluster.key, lat: cluster.lat, lng: cluster.lng, venues: cluster.venues };
      renderMarkers();
    } else {
      // Zooming never splits it: go to street level, then fan it out (see renderMarkers).
      pendingFanOut = { key: cluster.key, until: Date.now() + FAN_OUT_WAIT_MS };
      mapInstance.setView([cluster.lat, cluster.lng], maxZoom, { animate: !prefersReducedMotion() });
    }
    return;
  }
  const L = leaflet();
  const bounds = L.latLngBounds(cluster.venues.map((venue) => [venue.lat!, venue.lng!]));
  const fit = mapInstance.getBoundsZoom(bounds, false, L.point(64, 64));
  const zoom = Math.min(maxZoom, Math.max(fit, cluster.expansionZoom));
  mapInstance.setView(bounds.getCenter(), zoom, { animate: !prefersReducedMotion() });
}

function collapseSpider() {
  if (!spiderfied) return;
  spiderfied = null;
  renderMarkers();
}

/** Draws the fan-out: each venue's pin on a circle around the cluster's spot, joined to it by a leg. */
function drawSpider() {
  if (!spiderLayer) return;
  spiderLayer.clearLayers();
  spiderMarkers.clear();
  if (!spiderfied || !mapInstance) return;

  const L = leaflet();
  const { lat, lng, venues } = spiderfied;
  const centre = mapInstance.latLngToContainerPoint([lat, lng]);
  const offsets = spiderfyOffsets(venues.length);
  const ink = themeColor('graphite');

  spiderLayer.addLayer(L.circleMarker([lat, lng], { className: 'ledger-spider', radius: 4, color: ink, weight: 1.5, fillColor: ink, fillOpacity: 1, interactive: false }));
  venues.forEach((venue, i) => {
    const spot = mapInstance.containerPointToLatLng(L.point(centre.x + offsets[i].x, centre.y + offsets[i].y));
    spiderLayer.addLayer(L.polyline([[lat, lng], spot], { className: 'ledger-spider', color: ink, weight: 1.5, opacity: 0.7, interactive: false }));
    const marker = L.marker(spot, { icon: createVenueIcon(L, venue) });
    onActivate(marker, (viaKeyboard) => showPin(venue, viaKeyboard));
    spiderMarkers.set(venue.id, marker);
    spiderLayer.addLayer(marker);
  });
}

function highlightPin() {
  const mark = (marker: any, id: string) => marker.getElement()?.classList.toggle('is-selected-pin', id === pinVenue.value?.id);
  markersById.forEach(mark);
  spiderMarkers.forEach(mark);
}

/** A pin was picked on the map: show its card and tell the list. */
function showPin(venue: Venue, viaKeyboard = false) {
  applyPin(venue, 'map', viaKeyboard);
  selectMapVenue(venue.id, 'map');
}

/** Shows the card for `venue`, however it was picked (a pin here, a row in the list, a ?venue= link). */
function applyPin(venue: Venue, source: 'map' | 'list', viaKeyboard = false) {
  const focused = document.activeElement;
  returnFocusTo = focused instanceof HTMLElement && rootRef.value?.contains(focused) ? focused : null;
  pinVenue.value = venue;
  // A venue that isn't on the map as a pin of its own (it sits in a cluster) comes out of it.
  if (!markersById.has(venue.id) && !spiderMarkers.has(venue.id)) renderMarkers();
  highlightPin();
  if (source === 'list') {
    bringIntoView(venue);
    return;
  }
  // Once the card has rendered, nudge the map so the pin isn't hidden behind it or the controls up top,
  // and (for a keyboard user, who would otherwise have to Tab past every other pin to reach it) move focus in.
  nextTick(() => {
    revealPin(venue);
    if (viaKeyboard) pinCardRef.value?.focus();
  });
}

/** A venue picked in the list: fly to it unless its pin is already well on screen, and bring the map into view. */
function bringIntoView(venue: Venue) {
  if (!mapInstance || venue.lat == null || venue.lng == null) return;
  const animate = !prefersReducedMotion();
  const spot: [number, number] = [venue.lat, venue.lng];
  // On a phone the list sits under the map: bring the map back into view.
  mapContainer.value?.scrollIntoView({ block: 'nearest', behavior: animate ? 'smooth' : 'auto' });
  if (markersById.has(venue.id) && mapInstance.getBounds().pad(-0.08).contains(spot)) {
    nextTick(() => revealPin(venue));
    return;
  }
  mapInstance.once('moveend', () => revealPin(venue));
  mapInstance.setView(spot, Math.max(mapInstance.getZoom(), 16), { animate });
}

/** The card closes. From the keyboard, focus goes back to the pin that opened it. */
function clearPin({ restoreFocus = false } = {}) {
  const hadCard = pinVenue.value !== null;
  pinVenue.value = null;
  // If the venue had been pulled out of a cluster, let it rejoin.
  if (pinnedOutsideClusters) renderMarkers();
  highlightPin();
  selectMapVenue(null);
  if (restoreFocus && hadCard) {
    nextTick(() => {
      const target = returnFocusTo?.isConnected ? returnFocusTo : (mapInstance?.getContainer() as HTMLElement | undefined);
      target?.focus();
      returnFocusTo = null;
    });
  }
}

// A click with no pointer behind it (detail 0) is the keyboard: its focus was on the button that just vanished.
function onCloseClick(event: MouseEvent) {
  clearPin({ restoreFocus: event.detail === 0 });
}

// The venue picked or cleared elsewhere, in the list.
watch(selection, (current) => {
  if (!current) {
    if (!pinVenue.value) return;
    pinVenue.value = null;
    if (pinnedOutsideClusters) renderMarkers();
    highlightPin();
    return;
  }
  if (pinVenue.value?.id === current.id) return; // our own pick, already showing
  const venue = venuesList.value.find((candidate) => candidate.id === current.id);
  if (venue && mapInstance) applyPin(venue, current.source);
});

/** Lights up the pin (or the cluster it sits in) of the list row being pointed at. */
function markHovered() {
  const id = hovered.value;
  const lit = id ? (markersById.get(id) ?? spiderMarkers.get(id) ?? clusterMarkerByVenue.get(id) ?? null) : null;
  const all = new Set<any>([...markersById.values(), ...spiderMarkers.values(), ...clusterMarkerByVenue.values()]);
  all.forEach((marker) => marker.getElement()?.classList.toggle('is-hovered-pin', marker === lit));
}
watch(hovered, markHovered);

/** The skip link: open the list (the bench's "All venues" tab, or the disclosure under a phone's map) and land on it. */
function skipToList() {
  window.dispatchEvent(new CustomEvent('mcr:show-results'));
  // Two frames: one for the list to open, one for its heading to exist.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-results-heading]')?.focus())
  );
}

/** Pan just enough to keep the pin in the clear part of the map: below the controls, above the card. */
function revealPin(venue: Venue) {
  if (!mapInstance || venue.lat == null || venue.lng == null) return;
  const size = mapInstance.getSize();
  const point = mapInstance.latLngToContainerPoint([venue.lat, venue.lng]);
  const cardTop = size.y - (pinCardRef.value?.offsetHeight ?? 0) - 24;
  const lowest = cardTop - 24;
  const highest = 72;
  if (point.y > lowest) mapInstance.panBy([0, point.y - lowest], { animate: !prefersReducedMotion() });
  else if (point.y < highest) mapInstance.panBy([0, point.y - highest], { animate: !prefersReducedMotion() });
}

function onMapKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (spiderfied) collapseSpider();
  else if (pinVenue.value) clearPin({ restoreFocus: Boolean(rootRef.value?.contains(document.activeElement)) });
}

</script>

<style scoped>
/* The selected pin's card, fixed to the bottom of the map. */
.pin-card {
  position: absolute;
  z-index: 1100;
  right: 12px;
  bottom: 12px;
  left: 12px;
  max-width: 440px;
  margin-inline: auto;
}

.pin-card :deep(.bench-pillar) {
  box-shadow: 0 10px 28px rgb(17 30 71 / 28%);
}

.pin-card-close {
  position: absolute;
  z-index: 3;
  top: -10px;
  right: -6px;
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 1px solid var(--ledger-border);
  border-radius: 999px;
  background: var(--color-parchment);
  color: var(--color-charcoal);
  box-shadow: 0 2px 6px rgb(17 30 71 / 25%);
  cursor: pointer;
}

.pin-card-close svg {
  width: 12px;
  height: 12px;
}

.pin-card-close:hover {
  border-color: var(--ledger-navy);
  color: var(--ledger-navy);
}

.pin-card-close:focus-visible {
  outline: 2px solid var(--ledger-navy);
  outline-offset: 2px;
}

.pin-card-enter-active,
.pin-card-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.pin-card-enter-from,
.pin-card-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

@media (prefers-reduced-motion: reduce) {
  .pin-card-enter-active,
  .pin-card-leave-active {
    transition: none;
  }
}

/* The venue card takes focus when a pin is chosen from the keyboard. */
.pin-card:focus-visible {
  border-radius: 16px;
  outline: 2px solid var(--color-navy);
  outline-offset: 3px;
}

/* Big enough to hit with a thumb: the walking-directions link, and the close button's invisible margin. */
.pin-card :deep(.bench-walk.is-link) {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}

.pin-card-close::before {
  content: '';
  position: absolute;
  inset: -9px;
}

/* The pin (or cluster) of the list row being pointed at glows, so a row finds its place on the map. */
:deep(.custom-ledger-pin.is-hovered-pin) {
  z-index: 9000 !important;
}

:deep(.custom-ledger-pin.is-hovered-pin > div) {
  transform: scale(1.3) !important;
  filter: drop-shadow(0 0 7px rgba(242, 154, 46, 0.95)) drop-shadow(0 3px 8px rgba(0, 0, 0, 0.5)) !important;
}

/* The selected pin stands out and sits above its neighbours. */
:deep(.custom-ledger-pin.is-selected-pin) {
  z-index: 9999 !important;
}

:deep(.custom-ledger-pin.is-selected-pin > div) {
  transform: scale(1.35) !important;
  filter: drop-shadow(0 0 8px rgba(197, 155, 39, 0.95)) drop-shadow(0 4px 10px rgba(0, 0, 0, 0.6)) !important;
}

:deep(.custom-ledger-pin.is-selected-pin .rounded-full) {
  box-shadow: 0 0 0 3px var(--color-brass), 0 4px 8px rgba(0, 0, 0, 0.4) !important;
}

.map-loading {
  background-color: var(--color-map-placeholder);
}

/* No venue matches the filters: a card in the middle of the empty map. */
.map-empty {
  position: absolute;
  z-index: 1100;
  top: 50%;
  left: 50%;
  display: grid;
  justify-items: center;
  gap: 12px;
  width: max-content;
  max-width: calc(100% - 48px);
  padding: 18px 22px;
  border: 1px solid var(--color-hairline);
  border-radius: 14px;
  background: var(--color-surface);
  box-shadow: 0 10px 28px rgb(17 30 71 / 22%);
  text-align: center;
  transform: translate(-50%, -50%);
}

.map-empty-title {
  margin: 0;
  color: var(--color-ink);
  font: 700 16px/1.3 "Playfair Display", Georgia, serif;
}

.map-empty-button {
  min-height: 40px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: var(--color-deep);
  color: var(--color-parchment-fixed);
  font: 700 13px/1 "Plus Jakarta Sans", sans-serif;
  cursor: pointer;
}

.map-empty-button:hover {
  background: var(--color-navy-fixed);
}

.map-empty-button:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 2px;
}
</style>
