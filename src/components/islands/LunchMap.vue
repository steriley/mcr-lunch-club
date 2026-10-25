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
          class="bg-deep hover:bg-deep text-parchment px-5 py-3 rounded-full shadow-lg border border-gold transition-all flex items-center gap-2 text-sm font-bold tracking-wide cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-brass"
          title="Open Near Me locate mode"
          aria-label="Open Near Me locate mode"
        >
          <span class="material-symbols-outlined near-me-icon" aria-hidden="true">my_location</span>
          <span>Near Me</span>
        </button>
      </div>
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
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useStore } from '@nanostores/vue';
import { $filters, matchesFilters, selectVenue, openNearMe, toggleTier } from '@/stores/filters';
import { whenIdle } from '@/lib/idle';
import { londonDate } from '@/lib/london-date';
import { $venuesList } from '@/stores/ledger';
import {
  createMapRemover,
  BASE_LAT,
  BASE_LNG,
  DEFAULT_ZOOM,
  createTileLayer,
  createBaseMarker,
  createWalkingIsochrones,
  createVenueMarker,
  bindVenuePopup,
  WALKING_ISOCHRONES,
} from '@/lib/map';

const props = defineProps<{
  mapApiKey?: string;
}>();

const mapContainer = ref<HTMLElement | null>(null);
const mapReady = ref(false);
const legendOpen = ref(false);
const filters = useStore($filters);
const venuesList = useStore($venuesList);

let mapInstance: any = null;
let removeMap: (() => void) | null = null;
let leafletModule: any = null;
let markersLayer: any = null;
let ringsLayer: any = null;

const filteredVenues = computed(() => {
  const today = londonDate();
  return venuesList.value.filter((venue) => matchesFilters(venue, filters.value, today));
});

const visibleVenuesCount = computed(() => filteredVenues.value.length);
const totalVenuesCount = computed(() => venuesList.value.length);

let cancelStart: (() => void) | null = null;

onMounted(() => {
  if (typeof window === 'undefined' || !mapContainer.value) return;

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

  // Draw Base & Walking Rings
  drawBaseAndRings();

  // Render Venue Markers
  renderMarkers();
  mapReady.value = true;

  focusLinkedVenue();
}

/** `/?venue=<slug>` (from a dossier's "Locate on Ledger Map") centres on that venue and opens it. */
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
  selectVenue(venue);
  mapContainer.value?.scrollIntoView({ block: 'center' });
}

onUnmounted(() => {
  cancelStart?.();
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

  filteredVenues.value.forEach((venue) => {
    if (!venue.lat || !venue.lng) return;

    const marker = createVenueMarker(L, venue);
    if (!marker) return;

    // Tapping the pin opens the popup; its dossier button opens the venue panel.
    // 70px keeps the popup clear of the Base pill and zoom buttons.
    bindVenuePopup(marker, venue, () => selectVenue(venue), 70);

    markersLayer.addLayer(marker);
  });
}

</script>

<style scoped>
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
