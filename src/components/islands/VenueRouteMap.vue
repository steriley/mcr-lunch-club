<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { Map as LeafletMap, Polyline } from 'leaflet';
import '@/styles/map.css';
import { BASE_LAT_LNG, createTileLayer } from '@/lib/map/config';
import { createBaseMarker, createVenueMarker } from '@/lib/map/markers';
import { decodePolyline } from '@/lib/map/polyline';
import { createMapRemover } from '@/lib/map/removal';
import { onThemeChange } from '@/lib/theme';
import { themeColor } from '@/lib/theme-color';
import type { Venue, VenueRoute } from '@/types';

/**
 * The map on a venue page: HQ, the venue and, when one is stored, the route line between them.
 * Loaded when it scrolls into view (client:visible), so the page costs nothing until then. Scroll
 * zoom is off so the map never traps the page scroll, and a finger drags the page, not the map.
 * The route is a stored encoded polyline (src/lib/walking-route.ts); nothing is fetched here but tiles.
 */
const props = defineProps<{
  venue: Venue;
  route: VenueRoute | null;
  /** What the map shows, in words: its accessible name. */
  label: string;
  mapApiKey?: string;
}>();

const container = ref<HTMLDivElement | null>(null);
const ready = ref(false);
let map: LeafletMap | null = null;
let removeMap: (() => void) | null = null;
let line: Polyline | null = null;

const path = props.route ? decodePolyline(props.route.geometry) : [];

function drawLine(L: typeof import('leaflet')) {
  line?.remove();
  line = null;
  if (!map || path.length < 2) return;
  // Resolved when drawn (an SVG attribute), so it is redrawn when the theme changes.
  line = L.polyline(path, {
    color: themeColor('ochre'),
    weight: 5,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(map);
}

onMounted(async () => {
  const L = await import('leaflet');
  const venue = props.venue;
  if (!container.value || venue.lat == null || venue.lng == null) return;

  map = L.map(container.value, {
    scrollWheelZoom: false,
    // On a touch screen one finger scrolls the page; two fingers pinch the map.
    dragging: !L.Browser.mobile,
    attributionControl: true,
  });
  removeMap = createMapRemover(map);
  const tiles = createTileLayer(L, props.mapApiKey);
  tiles.on('tileerror', () => {});
  tiles.addTo(map);

  const hq = createBaseMarker(L);
  hq.unbindTooltip();
  hq.bindTooltip('<span class="hq-label-kicker">Lunch Club HQ</span>', {
    direction: 'top',
    offset: [0, -14],
    className: 'hq-label',
    permanent: true,
  });
  hq.addTo(map);
  createVenueMarker(L, venue)?.addTo(map);
  drawLine(L);

  const bounds = L.latLngBounds([BASE_LAT_LNG, [venue.lat, venue.lng], ...path]);
  map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
  ready.value = true;

  stopFollowingTheme = onThemeChange(() => drawLine(L));
});

let stopFollowingTheme: (() => void) | null = null;

onBeforeUnmount(() => {
  stopFollowingTheme?.();
  removeMap?.();
  removeMap = null;
  map = null;
});
</script>

<template>
  <div class="venue-route-map" :class="{ 'is-ready': ready }">
    <div ref="container" class="venue-route-map-canvas" role="img" :aria-label="label" />
    <p v-if="!ready" class="venue-route-map-placeholder" aria-hidden="true">Loading the map…</p>
  </div>
</template>
