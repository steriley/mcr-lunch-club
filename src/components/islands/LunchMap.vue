<template>
  <div class="relative isolate flex flex-col w-full h-full overflow-hidden bg-paper rounded-2xl border border-hairline shadow-inner">
    <!-- Map Header Strip -->
    <header class="map-header">
      <div class="map-header-title">
        <span class="material-symbols-outlined map-header-icon" aria-hidden="true">explore</span>
        <div class="map-header-text">
          <span class="map-header-kicker">Cartographic Projection</span>
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
        <div v-if="pinVenue" ref="pinCardRef" class="pin-card" role="group" :aria-label="`${pinVenue.name}`">
          <button type="button" class="pin-card-close" aria-label="Close venue card" @click="clearPin">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" /></svg>
          </button>
          <BenchPillar :venue="pinVenue" :inspections="inspectionsList" show-tier />
        </div>
      </Transition>
    </div>

    <!-- Walking rings legend: collapsed to a small pill until someone wants the key -->
    <div class="absolute bottom-4 left-4 z-[1000] hidden sm:block">
      <div class="isochrone-card bg-cream/95 backdrop-blur-sm border border-hairline rounded-md text-xs shadow-md font-serif-header" :class="{ 'is-collapsed': !legendOpen }">
        <button
          type="button"
          class="isochrone-toggle"
          :aria-expanded="legendOpen"
          aria-controls="isochrone-legend"
          @click="legendOpen = !legendOpen"
        >
          <span class="font-bold text-ink">Walking Isochrones</span>
          <span v-if="legendOpen" class="text-xs text-stone-500 font-sans">from Base</span>
          <svg class="isochrone-chevron" :class="{ 'is-open': legendOpen }" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="m5 12 5-5 5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <div id="isochrone-legend" class="isochrone-body" :class="{ 'is-open': legendOpen }" :inert="!legendOpen">
          <div class="isochrone-body-inner">
            <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-stone-700 font-sans text-xs border-t border-hairline mx-2 pt-1.5 pb-2">
              <!-- Same colours as the rings on the map; the heavier boundary ring shows dashed. -->
              <div v-for="ring in WALKING_ISOCHRONES" :key="ring.radius" class="flex items-center gap-1.5">
                <span
                  class="w-2.5 h-0"
                  :style="{ borderTop: `${ring.weight ? 1 : 2}px ${ring.weight ? 'dashed' : 'solid'} var(--color-${ring.colorToken})` }"
                ></span>
                {{ ring.legend }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue';
import { useStore } from '@nanostores/vue';
import { $filters, matchesFilters, openNearMe, toggleTier } from '@/stores/filters';
import { whenIdle } from '@/lib/idle';
import { londonDate } from '@/lib/london-date';
import { $inspectionsList, $venuesList } from '@/stores/ledger';
import BenchPillar from '@/components/BenchPillar.vue';
import type { Venue } from '@/types';
import {
  createMapRemover,
  BASE_LAT,
  BASE_LNG,
  DEFAULT_ZOOM,
  createTileLayer,
  createBaseMarker,
  createWalkingIsochrones,
  createVenueMarker,
  WALKING_ISOCHRONES,
} from '@/lib/map';
import { onThemeChange } from '@/lib/theme';

const props = defineProps<{
  mapApiKey?: string;
}>();

const mapContainer = ref<HTMLElement | null>(null);
const mapReady = ref(false);
const legendOpen = ref(false);
const filters = useStore($filters);
const venuesList = useStore($venuesList);
const inspectionsList = useStore($inspectionsList);

let mapInstance: any = null;
let removeMap: (() => void) | null = null;
let leafletModule: any = null;
let markersLayer: any = null;
const markersById = new Map<string, any>();
let ringsLayer: any = null;

const filteredVenues = computed(() => {
  const today = londonDate();
  return venuesList.value.filter((venue) => matchesFilters(venue, filters.value, today));
});

// The pin whose card is showing, at the bottom of the map.
const pinVenue = ref<Venue | null>(null);
const pinCardRef = ref<HTMLElement | null>(null);

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
  });
  removeMap = createMapRemover(mapInstance);

  // Custom Zoom Control top-right
  L.control.zoom({ position: 'topright' }).addTo(mapInstance);

  // CartoDB Positron / Voyager Muted Archival Tile Layer
  createTileLayer(L, props.mapApiKey).addTo(mapInstance);

  // Layer groups
  ringsLayer = L.layerGroup().addTo(mapInstance);
  markersLayer = L.layerGroup().addTo(mapInstance);

  // Tapping empty map puts the card away (a pin tap doesn't reach the map).
  mapInstance.on('click', clearPin);

  // Draw Base & Walking Rings
  drawBaseAndRings();

  // Render Venue Markers
  renderMarkers();
  mapReady.value = true;

  focusLinkedVenue();
}

/** `/?venue=<slug>` (from a dossier's "Locate on Ledger Map") centres on that venue and shows its card. */
function focusLinkedVenue() {
  const slug = new URLSearchParams(window.location.search).get('venue');
  if (!slug || !mapInstance) return;
  const venue = venuesList.value.find((candidate) => candidate.slug === slug);
  if (!venue) return;

  if (!filters.value.tiers.includes(venue.tier)) {
    toggleTier(venue.tier);
  }
  if (venue.lat != null && venue.lng != null) {
    mapInstance.setView([venue.lat, venue.lng], Math.max(mapInstance.getZoom(), 16));
  }
  showPin(venue);
  mapContainer.value?.scrollIntoView({ block: 'center' });
}

// The rings' colours are resolved when drawn (SVG attributes), so redraw them for the new theme.
const stopFollowingTheme = onThemeChange(() => drawBaseAndRings());

onUnmounted(() => {
  window.removeEventListener('keydown', onMapKeydown);
  cancelStart?.();
  stopFollowingTheme();
  removeMap?.();
  removeMap = null;
  mapInstance = null;
});

// Watch filters or venues changes
watch([filteredVenues], () => {
  if (mapInstance && leafletModule) {
    renderMarkers();
  }
});

function drawBaseAndRings() {
  if (!mapInstance || !leafletModule || !ringsLayer) return;
  const L = leafletModule.default || leafletModule;
  ringsLayer.clearLayers();

  // 1. Spinningfields Base Origin Marker
  const baseMarker = createBaseMarker(L);
  ringsLayer.addLayer(baseMarker);

  // 2. Walking Time Isochrones (Rings)
  createWalkingIsochrones(L).forEach((circle) => {
    ringsLayer.addLayer(circle);
  });
}

function renderMarkers() {
  if (!mapInstance || !leafletModule || !markersLayer) return;
  const L = leafletModule.default || leafletModule;
  markersLayer.clearLayers();
  markersById.clear();

  filteredVenues.value.forEach((venue) => {
    if (!venue.lat || !venue.lng) return;

    const marker = createVenueMarker(L, venue);
    if (!marker) return;

    // Tapping a pin shows its card at the bottom of the map; the card links to the venue's page.
    marker.on('click', () => showPin(venue));
    markersById.set(venue.id, marker);

    markersLayer.addLayer(marker);
  });

  // A filter change can take the selected pin off the map: drop its card, or keep its highlight.
  if (pinVenue.value && !markersById.has(pinVenue.value.id)) pinVenue.value = null;
  highlightPin();
}

function highlightPin() {
  markersById.forEach((marker, id) => {
    marker.getElement()?.classList.toggle('is-selected-pin', id === pinVenue.value?.id);
  });
}

function showPin(venue: Venue) {
  pinVenue.value = venue;
  highlightPin();
  // Once the card has rendered, nudge the map so the pin isn't hidden behind it or the controls up top.
  nextTick(() => revealPin(venue));
}

function clearPin() {
  pinVenue.value = null;
  highlightPin();
}

/** Pan just enough to keep the pin in the clear part of the map: below the controls, above the card. */
function revealPin(venue: Venue) {
  if (!mapInstance || venue.lat == null || venue.lng == null) return;
  const size = mapInstance.getSize();
  const point = mapInstance.latLngToContainerPoint([venue.lat, venue.lng]);
  const cardTop = size.y - (pinCardRef.value?.offsetHeight ?? 0) - 24;
  const lowest = cardTop - 24;
  const highest = 72;
  if (point.y > lowest) mapInstance.panBy([0, point.y - lowest], { animate: true });
  else if (point.y < highest) mapInstance.panBy([0, point.y - highest], { animate: true });
}

function onMapKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && pinVenue.value) clearPin();
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

/* The legend key stays in the bottom-left corner, so on wider maps the card sits to its right. */
@media (min-width: 640px) {
  .pin-card {
    left: 176px;
    margin-right: 0;
    margin-left: auto;
  }
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

.isochrone-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-charcoal);
  text-align: left;
}

.isochrone-toggle:hover {
  background: rgb(27 47 107 / 6%);
}

.isochrone-toggle:focus-visible {
  outline: 2px solid var(--ledger-navy);
  outline-offset: -2px;
}

.isochrone-chevron {
  flex: none;
  width: 14px;
  height: 14px;
  margin-left: auto;
  color: var(--color-taupe);
  transition: transform 160ms ease;
}

/* The chevron points up while the key is folded away, down once it is open. */
.isochrone-chevron.is-open {
  transform: rotate(180deg);
}

/* Grid-rows trick: animates the height to and from its natural size. */
.isochrone-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 180ms ease;
}

.isochrone-body.is-open {
  grid-template-rows: 1fr;
}

.isochrone-body-inner {
  overflow: hidden;
}

/* Folded away, the key shouldn't hold the pill at its full width. */
.isochrone-card.is-collapsed .isochrone-body-inner {
  width: 0;
  min-width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .isochrone-body,
  .isochrone-chevron {
    transition: none;
  }
}
</style>
