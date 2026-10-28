<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CircleMarker, Map as LeafletMap, Polyline } from 'leaflet';
import DossierIcon from './DossierIcon.vue';
import { BASE_LAT_LNG, createTileLayer } from '@/lib/map/config';
import { createMapRemover } from '@/lib/map/removal';
import { themeColor } from '@/lib/theme-color';
import { onThemeChange } from '@/lib/theme';

/**
 * A small, static map from HQ (Crown Square, Spinningfields) to the venue.
 * The line is straight; the stored walking time comes from an ORS route.
 */
const props = defineProps<{
  lat: number | null;
  lng: number | null;
  mapLink: string;
  apiKey?: string;
}>();

const container = ref<HTMLDivElement | null>(null);
let map: LeafletMap | null = null;
let removeMap: (() => void) | null = null;
let venueMarker: CircleMarker | null = null;
let axis: Polyline | null = null;
let baseMarker: CircleMarker | null = null;
let leaflet: typeof import('leaflet') | null = null;

function draw() {
  if (!map || !leaflet) return;
  venueMarker?.remove();
  axis?.remove();
  venueMarker = null;
  axis = null;
  if (props.lat === null || props.lng === null) {
    map.setView(BASE_LAT_LNG, 14);
    return;
  }
  const venue: [number, number] = [props.lat, props.lng];
  axis = leaflet
    .polyline([BASE_LAT_LNG, venue], { color: themeColor('ochre'), weight: 3, dashArray: '6 6' })
    .addTo(map);
  venueMarker = leaflet
    .circleMarker(venue, {
      radius: 8,
      color: themeColor('parchment'),
      weight: 2,
      fillColor: themeColor('gold-bright'),
      fillOpacity: 1,
    })
    .addTo(map);
  map.fitBounds(leaflet.latLngBounds([BASE_LAT_LNG, venue]), { padding: [28, 28], maxZoom: 16 });
}

onMounted(async () => {
  leaflet = await import('leaflet');
  if (!container.value) return;
  map = leaflet.map(container.value, {
    zoomControl: false,
    attributionControl: true,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
  });
  removeMap = createMapRemover(map);
  createTileLayer(leaflet, props.apiKey).addTo(map);
  drawBase();
  draw();
});

function drawBase() {
  if (!map || !leaflet) return;
  baseMarker?.remove();
  baseMarker = leaflet
    .circleMarker(BASE_LAT_LNG, {
      radius: 7,
      color: themeColor('parchment'),
      weight: 2,
      fillColor: themeColor('navy'),
      fillOpacity: 1,
    })
    .addTo(map);
}

// Marker and line colours are resolved when drawn (SVG attributes), so redraw them for the new theme.
const stopFollowingTheme = onThemeChange(() => {
  drawBase();
  draw();
});

watch(() => [props.lat, props.lng], draw);

onBeforeUnmount(() => {
  stopFollowingTheme();
  removeMap?.();
  removeMap = null;
  map = null;
});
</script>

<template>
  <div
    class="relative h-44 overflow-hidden rounded-lg border border-[var(--dossier-border)] bg-[var(--dossier-paper)]"
  >
    <div
      ref="container"
      class="h-full w-full"
      role="img"
      :aria-label="
        lat === null
          ? 'Map of Spinningfields; no venue location yet'
          : 'Map from Spinningfields to the venue'
      "
    />
    <div
      class="pointer-events-none absolute inset-x-2 top-2 z-[500] flex items-center justify-between gap-2"
    >
      <span
        class="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--dossier-border)] bg-[var(--dossier-canvas)]/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--dossier-primary)] shadow-sm"
      >
        <span
          class="h-2 w-2 rounded-full bg-[var(--dossier-primary-container-fill)]"
          aria-hidden="true"
        />
        Spinningfields departure axis
      </span>
      <a
        :href="mapLink"
        target="_blank"
        rel="noopener noreferrer"
        class="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-[var(--dossier-border)] bg-[var(--dossier-canvas)]/95 px-2.5 py-1 text-[11px] font-semibold text-[var(--dossier-primary-container)] shadow-sm"
      >
        Open map <DossierIcon name="external" :size="12" />
      </a>
    </div>
  </div>
</template>
