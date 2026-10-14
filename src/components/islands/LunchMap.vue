<template>
  <div class="relative w-full h-full min-h-[500px] overflow-hidden bg-[#f4efe4] rounded-lg border border-[#dcd6c8] shadow-inner">
    <!-- Map Container -->
    <div ref="mapContainer" class="w-full h-full min-h-[500px] z-0"></div>

    <!-- Map Overlays / Quick Status Bar -->
    <div class="absolute top-3 left-3 z-[1000] flex flex-wrap gap-2 pointer-events-none">
      <div class="pointer-events-auto bg-[#1a1e24]/90 backdrop-blur-md text-[#f9f7f1] px-3 py-1.5 rounded-full text-xs font-serif-header border border-[#c59b27]/40 shadow-lg flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span class="font-bold">Base:</span> Spinningfields Crown Sq
      </div>

      <div class="pointer-events-auto bg-[#f9f7f1]/95 backdrop-blur-md text-[#1a1e24] px-3 py-1.5 rounded-full text-xs border border-[#dcd6c8] shadow-md flex items-center gap-2 font-mono">
        <span class="font-bold text-[#8b1e22]">{{ visibleVenuesCount }}</span>
        <span>/ {{ totalVenuesCount }} pins on ledger</span>
      </div>
    </div>

    <!-- Quick Map Controls (Floating bottom right) -->
    <div class="absolute bottom-4 right-4 z-[1000] flex flex-col gap-2">
      <button
        @click="recenterBase"
        class="bg-[#1a1e24] hover:bg-[#8b1e22] text-[#f9f7f1] p-2.5 rounded-full shadow-lg border border-[#c59b27]/50 transition-colors flex items-center justify-center text-xs font-semibold title='Return to Spinningfields Base'"
        title="Return to Spinningfields Base"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="m12 8-4 8 4-2 4 2z"/>
        </svg>
      </button>

      <button
        @click="fitAllPins"
        class="bg-[#f9f7f1] hover:bg-[#eae3d2] text-[#1a1e24] p-2.5 rounded-full shadow-lg border border-[#dcd6c8] transition-colors flex items-center justify-center text-xs font-semibold"
        title="Fit All Pins"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
        </svg>
      </button>
    </div>

    <!-- Walking Rings Legend Toggle -->
    <div class="absolute bottom-4 left-4 z-[1000] hidden sm:block">
      <div class="bg-[#f9f7f1]/95 backdrop-blur-sm border border-[#dcd6c8] rounded-md p-2 text-[11px] shadow-md font-serif-header">
        <div class="font-bold text-[#1a1e24] border-b border-[#dcd6c8] pb-1 mb-1.5 flex items-center justify-between">
          <span>Walking Isochrones</span>
          <span class="text-[10px] text-stone-500 font-sans">from Base</span>
        </div>
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 text-stone-700 font-sans text-[10px]">
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
import { $filters, selectVenue } from '@/stores/filters';
import { $venuesList } from '@/stores/ledger';
import type { Venue, TierStatus } from '@/types';

const mapContainer = ref<HTMLElement | null>(null);
const filters = useStore($filters);
const venuesList = useStore($venuesList);

const BASE_LAT = 53.47985;
const BASE_LNG = -2.25105;

let mapInstance: any = null;
let leafletModule: any = null;
let markersLayer: any = null;
let ringsLayer: any = null;

// Status colors
const STATUS_COLORS: Record<TierStatus, { bg: string; border: string; text: string; pinBg: string }> = {
  'Approved': { bg: '#8b1e22', border: '#c59b27', text: '#ffffff', pinBg: '#8b1e22' },
  'Under Consideration': { bg: '#d97706', border: '#f59e0b', text: '#ffffff', pinBg: '#d97706' },
  'To Be Assessed': { bg: '#3b82f6', border: '#60a5fa', text: '#ffffff', pinBg: '#3b82f6' },
  'Rejected': { bg: '#4b5563', border: '#9ca3af', text: '#ffffff', pinBg: '#374151' },
  'If We Must': { bg: '#854d0e', border: '#ca8a04', text: '#ffffff', pinBg: '#854d0e' },
  'Gone But Not Forgotten': { bg: '#78716c', border: '#a8a29e', text: '#f5f5f4', pinBg: '#78716c' },
};

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
      if (!matchName && !matchCuisine && !matchNotes && !matchOrder) return false;
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
    zoom: 15,
    zoomControl: false,
  });

  // Custom Zoom Control top-right
  L.control.zoom({ position: 'topright' }).addTo(mapInstance);

  // CartoDB Positron / Voyager Muted Archival Tile Layer
  const cartoApiKey = import.meta.env.PUBLIC_MAP_API_KEY;
  const tileUrl = `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${cartoApiKey ? `?key=${encodeURIComponent(cartoApiKey)}` : ''}`;
  L.tileLayer(tileUrl, {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(mapInstance);

  // Layer groups
  ringsLayer = L.layerGroup().addTo(mapInstance);
  markersLayer = L.layerGroup().addTo(mapInstance);

  // Draw Base & Walking Rings
  drawBaseAndRings();

  // Render Venue Markers
  renderMarkers();
});

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
  ringsLayer.addLayer(baseMarker);

  // 2. Walking Time Isochrones (Rings)
  // Distance in meters:
  // 5 min ~ 402m (0.25 mi)
  // 10 min ~ 805m (0.50 mi)
  // 15 min ~ 1207m (0.75 mi)
  // 20 min ~ 1609m (1.00 mi)
  // 25 min ~ 2012m (1.25 mi)
  // 2.5 mile Perimeter boundary = 4023m
  const rings = [
    { radius: 402, color: '#059669', label: '5 min walk', dash: '3, 4' },
    { radius: 805, color: '#d97706', label: '10 min walk', dash: '3, 5' },
    { radius: 1207, color: '#2563eb', label: '15 min walk', dash: '4, 6' },
    { radius: 1609, color: '#7c3aed', label: '20 min walk', dash: '4, 6' },
    { radius: 2012, color: '#e11d48', label: '25 min walk', dash: '5, 7' },
    { radius: 4023, color: '#991b1b', label: '2.5-Mile Central Boundary', dash: '8, 8', weight: 2.5 },
  ];

  rings.forEach((ring) => {
    const circle = L.circle([BASE_LAT, BASE_LNG], {
      radius: ring.radius,
      color: ring.color,
      weight: ring.weight || 1.4,
      dashArray: ring.dash,
      fillColor: ring.color,
      fillOpacity: 0.02,
      interactive: false,
    });
    ringsLayer.addLayer(circle);
  });
}

function renderMarkers() {
  if (!mapInstance || !leafletModule || !markersLayer) return;
  const L = leafletModule.default || leafletModule;
  markersLayer.clearLayers();

  filteredVenues.value.forEach((venue) => {
    if (!venue.lat || !venue.lng) return;

    const styling = STATUS_COLORS[venue.status] || STATUS_COLORS['Approved'];
    const isApproved = venue.status === 'Approved';
    const badgeText = isApproved && venue.rank ? `#${venue.rank}` : venue.cost;

    const iconHtml = `
      <div class="group relative cursor-pointer transform transition-transform duration-200 hover:scale-125 hover:z-[9999]" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
        <div class="flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold shadow-md border-2"
             style="background-color: ${styling.pinBg}; border-color: ${styling.border}; color: ${styling.text};">
          <span>${badgeText}</span>
        </div>
        <div class="w-1.5 h-1.5 mx-auto bg-stone-900 rounded-full mt-[-1px]"></div>
      </div>
    `;

    const marker = L.marker([venue.lat, venue.lng], {
      icon: L.divIcon({
        html: iconHtml,
        className: 'custom-ledger-pin',
        iconSize: [28, 34],
        iconAnchor: [14, 30],
      }),
    });

    // Custom Popup
    const popupContent = document.createElement('div');
    popupContent.className = 'p-3 font-serif-header text-[#1a1e24] max-w-[260px]';
    popupContent.innerHTML = `
      <div class="flex items-center justify-between gap-2 border-b border-stone-200 pb-1.5 mb-2">
        <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
              style="background-color: ${styling.bg}20; color: ${styling.bg}; border: 1px solid ${styling.bg}40;">
          ${venue.status}
        </span>
        <span class="text-xs font-mono font-bold text-amber-900">${venue.cost}</span>
      </div>
      <h3 class="font-bold text-sm text-[#1a1e24] leading-tight">${venue.name}</h3>
      <p class="text-[11px] text-stone-600 font-sans mt-0.5">${venue.cuisine} &bull; ${venue.walkingTimeMin} min walk (${venue.distanceMiles} mi)</p>
      
      <div class="mt-2 p-1.5 bg-stone-100/90 rounded border border-stone-200 text-[11px] font-sans">
        <strong class="text-stone-800 font-serif-header">Eat Like Us:</strong>
        <p class="text-stone-700 italic mt-0.5 line-clamp-2">${venue.eatLikeUs}</p>
      </div>

      <div class="mt-3 flex items-center justify-between gap-2 font-sans text-xs">
        <button id="btn-inspect-${venue.slug}" class="w-full bg-[#1a1e24] hover:bg-[#8b1e22] text-[#f9f7f1] py-1.5 px-3 rounded font-semibold text-center transition-colors">
          View Ledger Dossier
        </button>
      </div>
    `;

    marker.bindPopup(popupContent, { maxWidth: 280, className: 'ledger-popup' });

    // Open detail sheet on click
    marker.on('click', () => {
      selectVenue(venue);
    });

    // Handle popup button click
    marker.on('popupopen', () => {
      const btn = document.getElementById(`btn-inspect-${venue.slug}`);
      if (btn) {
        btn.onclick = () => {
          selectVenue(venue);
        };
      }
    });

    markersLayer.addLayer(marker);
  });
}

function recenterBase() {
  if (mapInstance) {
    mapInstance.setView([BASE_LAT, BASE_LNG], 15, { animate: true });
  }
}

function fitAllPins() {
  if (!mapInstance || !filteredVenues.value.length || !leafletModule) return;
  const L = leafletModule.default || leafletModule;
  const bounds = L.latLngBounds(
    filteredVenues.value.map((v) => [v.lat, v.lng] as [number, number])
  );
  bounds.extend([BASE_LAT, BASE_LNG]);
  mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 16, animate: true });
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
