<template>
  <div
    ref="rootRef"
    class="relative isolate flex flex-col w-full h-full overflow-hidden bg-paper rounded-2xl border border-hairline shadow-inner"
  >
    <!-- A map is a poor way through 56 venues for anyone not using a pointer: the list is the other route. -->
    <a href="#venue-results" class="skip-link" @click.prevent="skipToList"
      >Skip the map and go to the venue list</a
    >
    <!-- Announces the card for screen readers; it appears beside the map, away from where focus is. -->
    <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>

    <!-- Map Header Strip -->
    <header class="map-header">
      <div class="map-header-title">
        <Icon name="explore" class="map-header-icon" />
        <div class="map-header-text">
          <span class="map-header-kicker">Where We’ve Inspected</span>
          <span class="map-header-subtitle">Lunch Club HQ: Spinningfields</span>
        </div>
      </div>
      <span class="map-header-count"
        >{{ visibleVenuesCount }} of {{ totalVenuesCount }} venues shown</span
      >
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

      <!-- Says how many matches are out of view (further out, or panned away from), and shows them all. -->
      <button
        v-if="mapReady && outsideCount > 0 && !pinVenue"
        type="button"
        class="map-outliers"
        @click="frameEverything"
      >
        <strong>{{ outsideCount }} more further out</strong> · Show all
      </button>

      <!-- Quick Map Controls (Floating top left) -->
      <div class="absolute top-3 left-3 z-[1000]">
        <button
          id="btn-near-me"
          @click="openNearMe"
          class="bg-action hover:bg-action-hover text-action-ink px-5 py-3 rounded-full shadow-lg border border-gold transition-all flex items-center gap-2 text-sm font-bold tracking-wide cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-brass"
          title="Open Near Me locate mode"
          aria-label="Open Near Me locate mode"
        >
          <Icon name="my_location" class="near-me-icon" />
          <span>Near Me</span>
        </button>
      </div>

      <!-- The selected pin's card: fixed to the bottom of the map, not floating over the pin -->
      <Transition name="pin-card">
        <div
          v-if="pinVenue"
          ref="pinCardRef"
          class="pin-card"
          role="group"
          tabindex="-1"
          :aria-label="`${pinVenue.name}`"
        >
          <button
            type="button"
            class="pin-card-close"
            aria-label="Close venue card"
            @click="onCloseClick"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </button>
          <BenchPillar :venue="pinVenue" :inspections="inspectionsList" show-tier detailed />
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from '@/components/Icon.vue';
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
  CARTO_VOYAGER_TILE_CONFIG,
  DEFAULT_ZOOM,
  createTileLayer,
  createBaseMarker,
  createWalkingIsochrones,
  createLabelMarker,
  createClusterMarker,
  prefersReducedMotion,
} from '@/lib/map';
import type { Rect } from '@/lib/map/labels';
import { createVenuePinLayer, onMarkerActivate, type VenuePinLayer } from '@/lib/map/pin-layer';
import {
  createLedgerMapScene,
  type FanOut,
  type Frame,
  type MarkerFrame,
  type PlacedLabel,
} from '@/lib/map/scene';
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

// What the map shows (pins, clusters, fan-out, labels, framing) is decided by the scene;
// this file draws it with Leaflet and looks after the card, focus and the rings switch.
const scene = createLedgerMapScene({ maxZoom: CARTO_VOYAGER_TILE_CONFIG.maxZoom });

let mapInstance: any = null;
let removeMap: (() => void) | null = null;
let leafletModule: any = null;
// Single pins, kept between zooms so a focused pin stays focused, and a fan-out's pins.
let pins: VenuePinLayer | null = null;
let fanOutPins: VenuePinLayer | null = null;
// Clusters are redrawn whenever the markers change.
let clusterLayer: any = null;
const clusterMarkers = new Map<string, any>();
// The fan-out's legs and the dot it fans out from.
let spiderLayer: any = null;
// The walking rings and their labels come and go together with the "Walking rings" switch.
let ringsLayer: any = null;
let ringLabelsLayer: any = null;
let baseLayer: any = null;
// Venue names beside their pins, from zoom 16.
let namesLayer: any = null;
// The scene's marker frame last drawn: an unchanged one isn't redrawn.
let drawnMarkersKey: string | null = null;
let ringsButton: HTMLAnchorElement | null = null;
const RINGS_STORAGE_KEY = 'mcr-map-rings';
const ringsVisible = ref(true);
// Set while a ?venue= link positions the map itself, so a filter change it causes doesn't reframe.
let suppressReframe = false;
// True from a zoom's start to its end, animation included.
let zooming = false;

// The venues the filters match: the store's, so the list beside the map shows exactly these.
const filteredVenues = useStore($filteredVenues);

// The pin whose card is showing, at the bottom of the map.
const pinVenue = ref<Venue | null>(null);
const pinCardRef = ref<HTMLElement | null>(null);
const rootRef = ref<HTMLElement | null>(null);

const announcement = computed(() =>
  pinVenue.value
    ? `Showing ${pinVenue.value.name}, ${tierInfo(pinVenue.value.tier).label}, ${pinVenue.value.cost}`
    : ''
);

// What shares the pick with the list: the venue chosen there (or here), and the row being pointed at.
const selection = useStore($mapSelection);
const hovered = useStore($hoveredVenueId);
// Where focus goes back to when the card closes: the pin that opened it.
let returnFocusTo: HTMLElement | null = null;
// A cluster was opened from the keyboard: its markers are about to be redrawn, so focus would be lost.
// Good for a couple of seconds, so a zoom that changes nothing can't claim focus on some later redraw.
let keepKeyboardInMapUntil = 0;
const KEEP_FOCUS_MS = 2000;

// How many matching venues are outside the view; the "further out" pill shows while it is above zero.
const outsideCount = ref(0);

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
  const L = leaflet();

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

  L.control.zoom({ position: 'topright' }).addTo(mapInstance);
  createTileLayer(L, props.mapApiKey).addTo(mapInstance);
  addRingsControl(L);

  // Layer groups, bottom to top.
  baseLayer = L.layerGroup().addTo(mapInstance);
  ringsLayer = L.layerGroup();
  ringLabelsLayer = L.layerGroup();
  namesLayer = L.layerGroup().addTo(mapInstance);
  pins = createVenuePinLayer(L, (venue, viaKeyboard) => showPin(venue, viaKeyboard));
  pins.layer.addTo(mapInstance);
  clusterLayer = L.layerGroup().addTo(mapInstance);
  spiderLayer = L.layerGroup().addTo(mapInstance);
  fanOutPins = createVenuePinLayer(L, (venue, viaKeyboard) => showPin(venue, viaKeyboard));
  fanOutPins.layer.addTo(mapInstance);

  // Tapping empty map puts the card and any fanned-out pins away (a pin tap doesn't reach the map).
  mapInstance.on('click', () => {
    collapseFanOut();
    clearPin();
  });

  drawBaseAndRings();

  scene.setVenues(filteredVenues.value, { reframe: false });
  syncView();
  // A ?venue= link positions the map itself; otherwise fit every venue the filters match.
  if (!new URLSearchParams(window.location.search).has('venue')) {
    moveTo(scene.frameAll(), false);
  }

  // A zoom folds a fan-out away as it starts; every move tells the scene where the map now is.
  mapInstance.on('zoomstart', () => {
    zooming = true;
    collapseFanOut();
  });
  mapInstance.on('zoomend', () => {
    zooming = false;
  });
  mapInstance.on('moveend resize', syncView);
  syncView();
  ringsVisible.value = readRingsChoice();
  showRings(ringsVisible.value);
  mapReady.value = true;

  void focusLinkedVenue();
}

function leaflet() {
  return leafletModule.default || leafletModule;
}

/** Where the map's own controls sit over the tiles, in container pixels: ring labels keep out from under them. */
function controlZones(size: { x: number; y: number }): Rect[] {
  return [
    { x: 0, y: 0, width: 170, height: 64 }, // Near Me
    { x: size.x - 54, y: 0, width: 54, height: 160 }, // zoom and rings
    { x: 0, y: size.y - 28, width: size.x, height: 28 }, // attribution
  ];
}

/** Tells the scene where the map is now, then draws what changed. */
function syncView() {
  if (!mapInstance) return;
  const centre = mapInstance.getCenter();
  const size = mapInstance.getSize();
  scene.setView({
    lat: centre.lat,
    lng: centre.lng,
    zoom: mapInstance.getZoom(),
    width: size.x,
    height: size.y,
    controls: controlZones(size),
  });
  draw();
}

function moveTo(frame: Frame, animate: boolean) {
  if (!mapInstance) return;
  // Leaflet ignores a move asked for during an animated zoom (a tap on the pill mid-zoom), so it waits.
  if (zooming) {
    mapInstance.once('zoomend', () => moveTo(frame, animate));
    return;
  }
  mapInstance.setView([frame.lat, frame.lng], frame.zoom, {
    animate: animate && !prefersReducedMotion(),
  });
}

/** The "further out" pill: every matching venue, on any width. */
function frameEverything() {
  moveTo(scene.frameEverything(), true);
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

// The rings' and the fan-out's colours are resolved when drawn (SVG attributes), so redraw them for the new theme.
const stopFollowingTheme = onThemeChange(() => {
  drawBaseAndRings();
  drawFanOut(scene.frame().markers.fanOut);
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
  if (!mapInstance) return;
  const move = scene.setVenues(filteredVenues.value, { reframe: !suppressReframe });
  // The filters can take the selected venue off the map: drop its card.
  if (pinVenue.value && scene.selected() === null) {
    pinVenue.value = null;
    selectMapVenue(null);
  }
  draw();
  if (move) moveTo(move, true);
});

function drawBaseAndRings() {
  if (!mapInstance || !ringsLayer || !baseLayer) return;
  const L = leaflet();
  ringsLayer.clearLayers();
  baseLayer.clearLayers();

  const baseMarker = createBaseMarker(L);
  // Venues near HQ would otherwise sit under its marker: keep it beneath the pins and clusters.
  baseMarker.setZIndexOffset(-1000);
  baseLayer.addLayer(baseMarker);

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
  scene.showRings(visible);
  if (visible) {
    mapInstance.addLayer(ringsLayer);
    mapInstance.addLayer(ringLabelsLayer);
  } else {
    mapInstance.removeLayer(ringsLayer);
    mapInstance.removeLayer(ringLabelsLayer);
  }
  drawRingLabels(scene.frame().ringLabels);
  ringsButton?.setAttribute('aria-pressed', String(visible));
  ringsButton?.setAttribute('title', visible ? 'Hide walking rings' : 'Show walking rings');
}

/** A switch under the zoom buttons that hides the walking rings; the choice is remembered. */
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

/** Draws the scene's current frame: the markers if they changed, then the ring labels, selection and hover. */
function draw() {
  if (!mapInstance || !pins || !fanOutPins) return;
  const frame = scene.frame();
  if (frame.markers.key !== drawnMarkersKey) {
    drawMarkers(frame.markers);
    drawnMarkersKey = frame.markers.key;
  }
  drawRingLabels(frame.ringLabels);
  outsideCount.value = frame.outsideCount;
  pins.select(pinVenue.value?.id ?? null);
  fanOutPins.select(pinVenue.value?.id ?? null);
  markHovered();
}

function drawMarkers(markers: MarkerFrame) {
  if (!pins || !clusterLayer) return;
  const L = leaflet();
  clusterLayer.clearLayers();
  clusterMarkers.clear();
  for (const { cluster, label } of markers.clusters) {
    const marker = createClusterMarker(L, cluster, label);
    onMarkerActivate(marker, (viaKeyboard) => openCluster(cluster.key, viaKeyboard));
    clusterLayer.addLayer(marker);
    clusterMarkers.set(cluster.key, marker);
  }
  pins.sync(markers.pins.map((venue) => ({ venue })));
  drawFanOut(markers.fanOut);
  drawNames(markers.names);
  orderMarkersForKeyboard();
  keepFocusInMap();
}

/** Draws the fan-out: each venue's pin on a circle around the cluster's spot, joined to it by a leg. */
function drawFanOut(fanOut: FanOut | null) {
  if (!spiderLayer || !fanOutPins) return;
  spiderLayer.clearLayers();
  if (!fanOut) {
    fanOutPins.sync([]);
    return;
  }
  const L = leaflet();
  const ink = themeColor('graphite');
  spiderLayer.addLayer(
    L.circleMarker([fanOut.lat, fanOut.lng], {
      className: 'ledger-spider',
      radius: 4,
      color: ink,
      weight: 1.5,
      fillColor: ink,
      fillOpacity: 1,
      interactive: false,
    })
  );
  for (const pin of fanOut.pins) {
    spiderLayer.addLayer(
      L.polyline(
        [
          [fanOut.lat, fanOut.lng],
          [pin.at.lat, pin.at.lng],
        ],
        { className: 'ledger-spider', color: ink, weight: 1.5, opacity: 0.7, interactive: false }
      )
    );
  }
  fanOutPins.sync(fanOut.pins);
}

function drawNames(names: readonly PlacedLabel[]) {
  if (!namesLayer || !pins) return;
  const L = leaflet();
  namesLayer.clearLayers();
  const named = new Set(names.map((label) => label.id));
  for (const id of pins.ids())
    pins.get(id)?.getElement()?.classList.toggle('has-name-label', named.has(id));
  for (const label of names) {
    namesLayer.addLayer(
      createLabelMarker(L, [label.at.lat, label.at.lng], label.text, label, 'name')
    );
  }
}

function drawRingLabels(labels: readonly PlacedLabel[]) {
  if (!ringLabelsLayer) return;
  const L = leaflet();
  ringLabelsLayer.clearLayers();
  for (const label of labels) {
    ringLabelsLayer.addLayer(
      createLabelMarker(L, [label.at.lat, label.at.lng], label.text, label, 'ring')
    );
  }
}

/**
 * Opening a cluster redraws the markers, which would drop a keyboard user's focus onto the page.
 * Keep it in the map instead: on the first of a fan-out's pins, or on the map itself after a zoom.
 */
function keepFocusInMap() {
  if (Date.now() > keepKeyboardInMapUntil) return;
  keepKeyboardInMapUntil = 0;
  const firstPin = fanOutPins?.markers()[0]?.getElement() as HTMLElement | undefined;
  (firstPin ?? (mapInstance?.getContainer() as HTMLElement | undefined))?.focus({
    preventScroll: true,
  });
}

const allMarkers = (): any[] => [
  ...(pins?.markers() ?? []),
  ...clusterMarkers.values(),
  ...(fanOutPins?.markers() ?? []),
];

/**
 * Tab order should follow the map, top to bottom. Leaflet adds markers in the order they are drawn,
 * which is no order a person would find, so put the markers back in reading order after every draw.
 * (A marker that has focus stays where it is: moving it would drop the focus.)
 */
function orderMarkersForKeyboard() {
  const pane = mapInstance?.getPane('markerPane');
  if (
    !pane ||
    (document.activeElement &&
      document.activeElement !== pane &&
      pane.contains(document.activeElement))
  )
    return;
  allMarkers()
    .map((marker) => ({
      element: marker.getElement() as HTMLElement | undefined,
      at: marker.getLatLng(),
    }))
    .filter((entry): entry is { element: HTMLElement; at: { lat: number; lng: number } } =>
      Boolean(entry.element)
    )
    .sort((a, b) => b.at.lat - a.at.lat || a.at.lng - b.at.lng)
    .forEach((entry) => pane.appendChild(entry.element));
}

/** Tapping a cluster zooms to its venues; one that can't split by zooming (one building) fans out. */
function openCluster(key: string, viaKeyboard = false) {
  keepKeyboardInMapUntil = viaKeyboard ? Date.now() + KEEP_FOCUS_MS : 0;
  const move = scene.openCluster(key);
  if (move) moveTo(move, true);
  else draw();
}

function collapseFanOut() {
  if (scene.collapseFanOut()) draw();
}

/** A pin was picked on the map: show its card and tell the list. */
function showPin(venue: Venue, viaKeyboard = false) {
  applyPin(venue, 'map', viaKeyboard);
  selectMapVenue(venue.id, 'map');
}

/** Shows the card for `venue`, however it was picked (a pin here, a row in the list, a ?venue= link). */
function applyPin(venue: Venue, source: 'map' | 'list', viaKeyboard = false) {
  const focused = document.activeElement;
  returnFocusTo =
    focused instanceof HTMLElement && rootRef.value?.contains(focused) ? focused : null;
  pinVenue.value = venue;
  // A venue that sits in a cluster comes out of it as a pin of its own.
  scene.select(venue.id);
  draw();
  if (source === 'list') {
    bringIntoView(venue);
    return;
  }
  // Once the card has rendered, nudge the map so the pin isn't hidden behind it or the controls up top,
  // and (for a keyboard user, who would otherwise have to Tab past every other pin to reach it) move focus in.
  void nextTick(() => {
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
  if (pins?.has(venue.id) && mapInstance.getBounds().pad(-0.08).contains(spot)) {
    void nextTick(() => revealPin(venue));
    return;
  }
  mapInstance.once('moveend', () => revealPin(venue));
  mapInstance.setView(spot, Math.max(mapInstance.getZoom(), 16), { animate });
}

/** Puts the card away; the venue rejoins any cluster it was pulled out of. */
function dropPin() {
  pinVenue.value = null;
  scene.select(null);
  draw();
}

/** The card closes. From the keyboard, focus goes back to the pin that opened it. */
function clearPin({ restoreFocus = false } = {}) {
  const hadCard = pinVenue.value !== null;
  dropPin();
  selectMapVenue(null);
  if (restoreFocus && hadCard) {
    void nextTick(() => {
      const target = returnFocusTo?.isConnected
        ? returnFocusTo
        : (mapInstance?.getContainer() as HTMLElement | undefined);
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
    if (pinVenue.value) dropPin();
    return;
  }
  if (pinVenue.value?.id === current.id) return; // our own pick, already showing
  const venue = venuesList.value.find((candidate) => candidate.id === current.id);
  if (venue && mapInstance) applyPin(venue, current.source);
});

/** Lights up the pin (or the cluster it sits in) of the list row being pointed at. */
function markHovered() {
  const id = hovered.value;
  const drawnAs = id ? scene.markerOf(id) : null;
  let lit: any = null;
  if (drawnAs?.kind === 'pin') lit = pins?.get(drawnAs.venueId);
  else if (drawnAs?.kind === 'fan-out') lit = fanOutPins?.get(drawnAs.venueId);
  else if (drawnAs?.kind === 'cluster') lit = clusterMarkers.get(drawnAs.key);
  allMarkers().forEach((marker) =>
    marker.getElement()?.classList.toggle('is-hovered-pin', marker === lit)
  );
}
watch(hovered, markHovered);

/** The skip link: open the list (the bench's "All venues" tab, or the disclosure under a phone's map) and land on it. */
function skipToList() {
  window.dispatchEvent(new CustomEvent('mcr:show-results'));
  // Two frames: one for the list to open, one for its heading to exist.
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('[data-results-heading]')?.focus()
    )
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
  if (point.y > lowest)
    mapInstance.panBy([0, point.y - lowest], { animate: !prefersReducedMotion() });
  else if (point.y < highest)
    mapInstance.panBy([0, point.y - highest], { animate: !prefersReducedMotion() });
}

function onMapKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (scene.collapseFanOut()) draw();
  else if (pinVenue.value)
    clearPin({ restoreFocus: Boolean(rootRef.value?.contains(document.activeElement)) });
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
  transition:
    opacity 160ms ease,
    transform 160ms ease;
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
  box-shadow:
    0 0 0 3px var(--color-brass),
    0 4px 8px rgba(0, 0, 0, 0.4) !important;
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
  font:
    700 16px/1.3 'Playfair Display',
    'Playfair Display Fallback',
    Georgia,
    serif;
}

.map-empty-button {
  min-height: 40px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: var(--color-deep);
  color: var(--color-parchment-fixed);
  font:
    700 13px/1 'Plus Jakarta Sans',
    'Plus Jakarta Sans Fallback',
    sans-serif;
  cursor: pointer;
}

.map-empty-button:hover {
  background: var(--color-navy-fixed);
}

.map-empty-button:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 2px;
}

/* "N more further out": over the bottom of the map, above the attribution line. */
.map-outliers {
  position: absolute;
  z-index: 1000;
  bottom: 28px;
  left: 50%;
  min-height: 36px;
  padding: 0 16px;
  border: 1px solid var(--color-hairline);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-ink);
  box-shadow: 0 4px 14px rgb(17 30 71 / 22%);
  font:
    500 13px/1 'Plus Jakarta Sans',
    'Plus Jakarta Sans Fallback',
    sans-serif;
  white-space: nowrap;
  cursor: pointer;
  transform: translateX(-50%);
}

/* Touch: a 44px target. */
@media (pointer: coarse) {
  .map-outliers {
    min-height: 44px;
  }
}

.map-outliers:hover {
  background: var(--color-parchment);
}

.map-outliers:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 2px;
}
</style>
