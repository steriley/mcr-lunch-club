<template>
  <div class="relative isolate flex flex-col w-full h-full overflow-hidden bg-[#f4efe4] rounded-2xl border border-[#dcd6c8] shadow-inner">
    <!-- Map Header Strip -->
    <header class="map-header">
      <div class="map-header-title">
        <span class="material-symbols-outlined map-header-icon" aria-hidden="true">explore</span>
        <div class="map-header-text">
          <span class="map-header-kicker">Cartographic Projection</span>
          <span class="map-header-subtitle">Lunch Club HQ: Spinningfields</span>
        </div>
      </div>
      <span class="map-header-count">{{ visibleVenuesCount }} / {{ totalVenuesCount }} Active Pins</span>
    </header>

    <!-- Map Container (positioning context for the floating controls) -->
    <div class="relative w-full flex-1 min-h-0">
      <div ref="mapContainer" class="absolute inset-0 z-0"></div>

      <!-- Quick Map Controls (Floating top left) -->
      <div class="absolute top-3 left-3 z-[1000]">
        <button
          id="btn-near-me"
          @click="openNearMe"
          class="bg-[#1a1e24] hover:bg-[#8b1e22] text-[#f9f7f1] px-5 py-3 rounded-full shadow-lg border border-[#c59b27] transition-all flex items-center gap-2 text-sm font-bold tracking-wide cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#c59b27]"
          title="Open Near Me locate mode"
          aria-label="Open Near Me locate mode"
        >
          <span class="material-symbols-outlined near-me-icon" aria-hidden="true">my_location</span>
          <span>Near Me</span>
        </button>
      </div>
    </div>

    <!-- Walking Rings Legend Toggle -->
    <div class="absolute bottom-4 left-4 z-[1000] hidden sm:block">
      <div class="bg-[#f9f7f1]/95 backdrop-blur-sm border border-[#dcd6c8] rounded-md p-2 text-xs shadow-md font-serif-header">
        <div class="font-bold text-[#1a1e24] border-b border-[#dcd6c8] pb-1 mb-1.5 flex items-center justify-between">
          <span>Walking Isochrones</span>
          <span class="text-xs text-stone-500 font-sans">from Base</span>
        </div>
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-stone-700 font-sans text-xs">
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-0.5 bg-emerald-600"></span> 5 min (0.25 mi)
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-0.5 bg-amber-600"></span> 10 min (0.50 mi)
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-0.5 bg-blue-600"></span> 15 min (0.75 mi)
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-0.5 bg-purple-600"></span> 20 min (1.00 mi)
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-0.5 bg-rose-600"></span> 25 min (1.25 mi)
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-0.5 border-t border-dashed border-red-700"></span> 2.5 mi Boundary
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { useStore } from '@nanostores/vue';
import { $filters, selectVenue, openNearMe, toggleTier } from '@/stores/filters';
import { $venuesList } from '@/stores/ledger';
import {
  BASE_LAT,
  BASE_LNG,
  DEFAULT_ZOOM,
  createTileLayer,
  createBaseMarker,
  createWalkingIsochrones,
  createVenueMarker,
  bindVenuePopup,
} from '@/lib/map';

const props = defineProps<{
  mapApiKey?: string;
}>();

const mapContainer = ref<HTMLElement | null>(null);
const filters = useStore($filters);
const venuesList = useStore($venuesList);

let mapInstance: any = null;
let leafletModule: any = null;
let markersLayer: any = null;
let ringsLayer: any = null;

// Filtered venues calculation
const filteredVenues = computed(() => {
  const currentFilters = filters.value;
  const list = venuesList.value;

  return list.filter((venue) => {
    // Lat / Lng presence check
    if (!venue.lat || !venue.lng) return false;

    // Tier filter
    if (!currentFilters.tiers.includes(venue.tier)) return false;

    // Cost filter
    if (currentFilters.cost !== 'all' && venue.cost !== currentFilters.cost) return false;

    // Max walking time
    if (currentFilters.maxWalkMinutes && venue.walkingTimeMin !== null && venue.walkingTimeMin > currentFilters.maxWalkMinutes) {
      return false;
    }

    // Cuisine filter
    if (currentFilters.cuisine !== 'all' && venue.cuisine !== currentFilters.cuisine) {
      return false;
    }

    // Inspected within days filter
    if (currentFilters.inspectedDays !== 'all') {
      if (!venue.lastInspectionDate || venue.lastInspectionDate.includes('Awaiting')) {
        return false;
      }
      const inspDate = new Date(venue.lastInspectionDate);
      if (!isNaN(inspDate.getTime())) {
        const daysDiff = (Date.now() - inspDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff > currentFilters.inspectedDays) return false;
      }
    }

    // Search query filter
    if (currentFilters.searchQuery && currentFilters.searchQuery.trim().length > 0) {
      const q = currentFilters.searchQuery.toLowerCase();
      const matchName = venue.name.toLowerCase().includes(q);
      const matchCuisine = venue.cuisine.toLowerCase().includes(q);
      const matchOrder = (venue.eatLikeUs || '').toLowerCase().includes(q);
      const matchAddress = (venue.address || '').toLowerCase().includes(q);
      if (!matchName && !matchCuisine && !matchOrder && !matchAddress) return false;
    }

    return true;
  });
});

const visibleVenuesCount = computed(() => filteredVenues.value.length);
const totalVenuesCount = computed(() => venuesList.value.length);

onMounted(async () => {
  if (typeof window === 'undefined' || !mapContainer.value) return;

  // Dynamically import Leaflet
  leafletModule = await import('leaflet');
  const L = leafletModule.default || leafletModule;

  // Initialize Map
  mapInstance = L.map(mapContainer.value, {
    center: [BASE_LAT, BASE_LNG],
    zoom: DEFAULT_ZOOM,
    zoomControl: false,
  });

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

  focusLinkedVenue();
});

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
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
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

<style>
/* Leaflet Popup Styling */
.ledger-popup .leaflet-popup-content-wrapper {
  border-radius: 8px;
  background: #fdfcf9;
  border: 1px solid #dcd6c8;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25);
  padding: 0;
}
.ledger-popup .leaflet-popup-content {
  margin: 0;
  line-height: 1.4;
}
.ledger-popup .leaflet-popup-tip {
  background: #fdfcf9;
}
</style>
