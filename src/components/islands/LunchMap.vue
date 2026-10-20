<template>
  <div class="relative isolate w-full h-full overflow-hidden bg-[#f4efe4] rounded-lg border border-[#dcd6c8] shadow-inner">
    <!-- Map Container -->
    <div ref="mapContainer" class="w-full h-full z-0"></div>

    <!-- Map Overlays / Quick Status Bar -->
    <div class="absolute top-3 left-3 z-[1000] max-w-[calc(100%-1.5rem)]">
      <div class="map-status-pill">
        <span class="map-status-dot" aria-hidden="true"></span>
        <span class="map-status-base">Base: Spinningfields</span>
        <span class="map-status-divider" aria-hidden="true"></span>
        <span class="map-status-count">{{ visibleVenuesCount }} / {{ totalVenuesCount }} <span>Active Pins</span></span>
      </div>
    </div>

    <!-- Quick Map Controls (Floating bottom right) -->
    <div class="absolute bottom-4 right-4 z-[1000]">
      <button
        id="btn-near-me"
        @click="openNearMe"
        class="bg-[#1a1e24] hover:bg-[#8b1e22] text-[#f9f7f1] px-3.5 py-2 rounded-full shadow-lg border border-[#c59b27] transition-all flex items-center gap-1.5 text-xs font-bold tracking-wide cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#c59b27]"
        title="Open Near Me locate mode"
        aria-label="Open Near Me locate mode"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-[#c59b27]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>
        </svg>
        <span>Near Me</span>
      </button>

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
  createVenuePopupContent,
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
    if (!currentFilters.tiers.includes(venue.status)) return false;

    // Cost filter
    if (currentFilters.cost !== 'all' && venue.cost !== currentFilters.cost) return false;

    // Max walking time
    if (currentFilters.maxWalkMinutes && venue.walkingTimeMin > currentFilters.maxWalkMinutes) {
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
      const matchNotes = (venue.notes || '').toLowerCase().includes(q);
      const matchOrder = (venue.eatLikeUs || '').toLowerCase().includes(q);
      const matchAddress = (venue.address || '').toLowerCase().includes(q);
      if (!matchName && !matchCuisine && !matchNotes && !matchOrder && !matchAddress) return false;
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

  if (!filters.value.tiers.includes(venue.status)) {
    toggleTier(venue.status);
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

    // Custom Popup
    const popupContent = createVenuePopupContent(venue, () => selectVenue(venue));
    marker.bindPopup(popupContent, { maxWidth: 280, className: 'ledger-popup' });

    // Open detail sheet on click
    marker.on('click', () => {
      selectVenue(venue);
    });

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
