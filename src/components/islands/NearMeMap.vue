<template>
  <Teleport to="body">
    <Transition name="near-me-shell">
      <div
        v-if="isOpen"
        ref="shellRef"
        class="near-me-shell"
        :style="{ '--sheet-current-height': currentSheetHeightCss }"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-label="Near Me Locate Mode"
        @keydown="handleKeyDown"
      >
      <!-- Map Container (fills the fullscreen shell) -->
      <div
        ref="mapContainerRef"
        class="near-me-map-container"
      ></div>

      <!-- Sibling Overlay Layer (z-index above Leaflet panes, pointer-events: none) -->
      <div class="near-me-overlay-layer">
        <!-- Top Bar: Close Button -->
        <header class="near-me-top-bar">
          <button
            ref="closeButtonRef"
            type="button"
            id="btn-near-me-close"
            class="near-me-close-btn"
            aria-label="Close Near Me map (Esc)"
            title="Close Near Me map (Esc)"
            @click="close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            <span class="sr-only">Close Near Me</span>
          </button>
        </header>

        <!-- Status Notification Banner (Geolocation state / Picking state) -->
        <div v-if="statusBanner" class="near-me-status-bar">
          <div class="near-me-status-pill" :class="statusBanner.type">
            <span class="near-me-status-icon" aria-hidden="true">{{ statusBanner.icon }}</span>
            <span class="near-me-status-text">{{ statusBanner.text }}</span>
            <button
              v-if="statusBanner.action"
              type="button"
              id="btn-status-banner-action"
              class="near-me-status-action"
              @click="statusBanner.action.handler"
            >
              {{ statusBanner.action.label }}
            </button>
          </div>
        </div>

        <!-- Phase 5: Pre-permission explanation modal -->
        <transition name="nm-fade">
          <div
            v-if="showPrePermission"
            class="near-me-prepermission"
            role="status"
            aria-live="polite"
            id="near-me-prepermission"
          >
            <div class="near-me-prepermission-inner">
              <span class="near-me-prepermission-icon" aria-hidden="true">📍</span>
              <div class="near-me-prepermission-body">
                <h3 class="near-me-prepermission-title">Location Required</h3>
                <p class="near-me-prepermission-text">
                  Used to rank nearby venues. Never sent or stored.
                </p>
              </div>
            </div>
          </div>
        </transition>

        <div
          class="near-me-controls-cluster"
          :class="{ 'is-hidden-on-mobile': !isDesktop && sheetSnapState === 'full' }"
        >
          <!-- Recentre on me -->
          <button
            type="button"
            id="btn-near-me-recenter"
            class="near-me-control-btn"
            :class="{ 'is-active': isFollowingUser && geoPosition }"
            :disabled="!geoPosition"
            aria-label="Recentre on me"
            title="Recentre on me"
            @click="recenterOnMe"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>
            </svg>
          </button>

          <!-- Home (Spinningfields view) -->
          <button
            type="button"
            id="btn-near-me-home"
            class="near-me-control-btn"
            aria-label="Return to Spinningfields Base"
            title="Return to Spinningfields Base"
            @click="returnHome"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </button>

          <!-- Set location manually -->
          <button
            type="button"
            id="btn-near-me-manual"
            class="near-me-control-btn"
            :class="{ 'is-active': isPickingLocation || isManualLocation }"
            aria-label="Set location manually"
            title="Set location manually on map"
            @click="togglePickLocation"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </button>
        </div>

        <!-- Venue Panel (Desktop: Floating side panel; Mobile: Bottom sheet) -->
        <div
          ref="panelRef"
          id="near-me-panel"
          class="near-me-panel"
          :class="[`snap-${sheetSnapState}`, { 'is-desktop': isDesktop }]"
          role="region"
          aria-label="Ranked Nearby Venues"
        >
          <!-- Mobile Drag Handle Row & Snap Controls -->
          <div
            v-if="!isDesktop"
            class="near-me-sheet-handle-row"
            @touchstart="handleTouchStart"
            @touchmove="handleTouchMove"
            @touchend="handleTouchEnd"
          >
            <button
              type="button"
              class="near-me-snap-btn"
              :aria-label="`Venue list height: ${sheetSnapState}. Activate to change.`"
              @click="cycleSnapState"
            >
              <span class="near-me-sheet-handle-bar"></span>
            </button>
          </div>

          <!-- Collapsed sheet: one line about the selected (or nearest) venue so the map stays clear. -->
          <div v-if="isCollapsedMobile && previewVenue" class="near-me-collapsed-summary">
            <button type="button" class="near-me-collapsed-main" @click="expandSheet">
              <span class="near-me-card-index">#{{ previewVenue.rank }}</span>
              <span class="near-me-collapsed-name">{{ previewVenue.rv.venue.name }}</span>
              <span class="near-me-collapsed-meta">{{ previewVenue.rv.formattedDistance }}</span>
            </button>
            <a
              :href="getWalkingDirectionsUrl(previewVenue.rv.venue.lat!, previewVenue.rv.venue.lng!)"
              target="_blank"
              rel="noopener noreferrer"
              class="near-me-btn-walk"
              :aria-label="`Get walking directions to ${previewVenue.rv.venue.name}`"
            >
              <span>Walk</span>
            </a>
          </div>

          <!-- Tier Filter Chips (Inside Panel): shared with the homepage filter bar -->
          <div v-show="!isCollapsedMobile" class="near-me-panel-filters">
            <TierFilterChips
              :tiers="NEAR_ME_TIERS"
              :selected="selectedTiers"
              :counts="tierCounts"
              :disabled="lastSelectedTier"
              disabled-reason="At least one tier must stay selected"
              label="Near Me Tier Filters"
              @toggle="toggleTierFilter"
            />
          </div>

          <!-- Scrollable Content Body -->
          <div
            ref="listContainerRef"
            v-show="!isCollapsedMobile"
            class="near-me-scroll-body"
            @scroll="onListScroll"
            @touchstart.passive="onListTouchStart"
            @touchend.passive="onListTouchEnd"
            @touchcancel.passive="onListTouchEnd"
          >
            <!-- Nearest venue -->
            <div v-if="nearestVenue" class="near-me-list-section">
              <div class="near-me-list-header">
                <span class="near-me-list-title">
                  {{ isUserFarFromManchester ? 'Closest to Spinningfields' : nearestVenue.isFarAway ? 'Nearest available' : 'Nearest' }}
                </span>
                <span v-if="isUserFarFromManchester" class="near-me-far-note">You are outside Manchester</span>
                <span v-else-if="nearestVenue.isFarAway" class="near-me-far-note">None nearby</span>
              </div>
              <BenchPillar
                :id="`near-me-row-${nearestVenue.venue.id}`"
                :venue="nearestVenue.venue"
                :inspections="inspections"
                :rank="1"
                :walk-label="rowWalkLabel(nearestVenue)"
                :walk-url="rowWalkUrl(nearestVenue)"
                selectable
                show-tier
                :selected="selectedVenueId === nearestVenue.venue.id"
                @select="selectVenueItem(nearestVenue.venue, false)"
                @details="selectVenue(nearestVenue.venue)"
              />
            </div>

            <!-- Ranked Venue List Section -->
            <div class="near-me-list-section">
              <div class="near-me-list-header">
                <span class="near-me-list-title">{{ nearestVenue ? 'Also nearby' : 'Nearby targets' }} ({{ listVenues.length }})</span>
                <div class="near-me-cost-filter" role="group" aria-label="Filter by price">
                  <button
                    v-for="cost in COST_BANDS"
                    :key="cost"
                    type="button"
                    class="near-me-cost-chip"
                    :class="{ 'is-selected': selectedCosts.includes(cost) }"
                    :aria-pressed="selectedCosts.includes(cost)"
                    @click="toggleCost(cost)"
                  >{{ cost }}</button>
                </div>
              </div>

              <div class="near-me-list-rows" role="list">
                <BenchPillar
                  v-for="(rv, index) in listVenues"
                  :id="`near-me-row-${rv.venue.id}`"
                  :key="rv.venue.id"
                  role="listitem"
                  :venue="rv.venue"
                  :inspections="inspections"
                  :rank="index + 2"
                  :walk-label="rowWalkLabel(rv)"
                  :walk-url="rowWalkUrl(rv)"
                  selectable
                  show-tier
                  :selected="selectedVenueId === rv.venue.id"
                  @select="selectVenueItem(rv.venue, false)"
                  @details="selectVenue(rv.venue)"
                />
              </div>

              <!-- Empty state when no venues match -->
              <div v-if="rankedVenues.length === 0" class="near-me-empty-state">
                <span class="near-me-empty-icon" aria-hidden="true">🏛️</span>
                <h4 class="near-me-empty-title">No venues match</h4>
                <p class="near-me-empty-text">
                  No venues in the selected tiers match your current criteria. Enable additional tiers above, or clear the price filter.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useStore } from '@nanostores/vue';
import { $isNearMeOpen, closeNearMe, selectVenue } from '@/stores/filters';
import { $inspectionsList, $venuesList } from '@/stores/ledger';
import { NEAR_ME_DEFAULT_TIERS, NEAR_ME_TIERS, countVenuesByTier, type TierValue } from '@/lib/tiers';
import type { CostTier, Inspection, Venue } from '@/types';
import BenchPillar from '@/components/BenchPillar.vue';
import TierFilterChips from '@/components/TierFilterChips.vue';
import {
  BASE_LAT,
  BASE_LNG,
  DEFAULT_ZOOM,
  createTileLayer,
  createBaseMarker,
  createVenueMarker,
  createVenueIcon,
  bindVenuePopup,
  useGeolocation,
  createUserMarkerLayers,
  rankVenues,
  toggleNearMeTier,
  hasOriginMovedSignificantly,
  haversineMetres,
  estimateWalkMinutes,
  resolveRankingOrigin,
  FAR_FROM_BASE_METRES,
  ORIGIN_MOVE_THRESHOLD_METRES,
  getWalkingDirectionsUrl,
  type RankedVenue,
  type LatLng,
} from '@/lib/map';

const props = defineProps<{
  mapApiKey?: string;
}>();

const isOpen = useStore($isNearMeOpen);
const venuesList = useStore($venuesList);
const inspectionsStore = useStore($inspectionsList);
// The store hands back a deep-readonly copy; the card only reads it.
const inspections = computed(() => inspectionsStore.value as Inspection[]);

const shellRef = ref<HTMLElement | null>(null);
const mapContainerRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const listContainerRef = ref<HTMLElement | null>(null);

// Geolocation composable
const geo = useGeolocation();
const geoPosition = geo.position;
const isManualLocation = geo.isManual;

// UI states
const isFollowingUser = ref<boolean>(true);
const isPickingLocation = ref<boolean>(false);
const isDesktop = ref<boolean>(false);
const sheetSnapState = ref<'collapsed' | 'half' | 'full'>('half');
const selectedVenueId = ref<string | null>(null);
const hasFittedFirstFix = ref<boolean>(false);
const isInteractingWithList = ref<boolean>(false);
let interactionTimeout: ReturnType<typeof setTimeout> | null = null;
let prePermissionTimeout: ReturnType<typeof setTimeout> | null = null;

// Phase 5 state flags
/** Show pre-permission explanation before browser prompt fires */
const showPrePermission = ref<boolean>(false);
/** True when user is ≥ ~30km from Spinningfields centre */
const isUserFarFromManchester = ref<boolean>(false);
/** Low accuracy detected (radius > 100m) */
const isLowAccuracy = ref<boolean>(false);

// Dev-only forced state override via ?near_me_state=<value> query param
const DEV_FORCED_STATE = (() => {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return null;
  return new URLSearchParams(window.location.search).get('near_me_state');
})();

// Tier filter state: separate from the homepage filters. Approved on by default;
// other eligible tiers are opt-in; Rejected & Gone But Not Forgotten are never offered.
const selectedTiers = ref<TierValue[]>([...NEAR_ME_DEFAULT_TIERS]);

// Price filter: empty means any price.
const COST_BANDS: readonly CostTier[] = ['£', '££', '£££'];
const selectedCosts = ref<CostTier[]>([]);

function matchesCost(venue: Venue): boolean {
  return selectedCosts.value.length === 0 || selectedCosts.value.includes(venue.cost);
}

function toggleCost(cost: CostTier) {
  selectedCosts.value = selectedCosts.value.includes(cost)
    ? selectedCosts.value.filter((c) => c !== cost)
    : [...selectedCosts.value, cost];
}

// Chip counts only include venues that can be plotted, so they match the pins and list.
const tierCounts = computed(() =>
  countVenuesByTier(venuesList.value.filter((v) => v.lat != null && v.lng != null))
);

// The last selected chip is shown as unavailable; tapping it does nothing.
const lastSelectedTier = computed(() => (selectedTiers.value.length === 1 ? selectedTiers.value : []));

// Ranking state
const lastRankedOrigin = ref<LatLng | null>(null);
const rankedVenues = ref<RankedVenue[]>([]);
// True while distances are measured from Spinningfields rather than the user.
const isRankedFromBase = ref(true);

const nearestVenue = computed(() =>
  rankedVenues.value.length > 0 ? rankedVenues.value[0] : null
);

// The nearest venue is the hero card, so the list carries the rest.
const listVenues = computed(() => rankedVenues.value.slice(1));

const isCollapsedMobile = computed(() => !isDesktop.value && sheetSnapState.value === 'collapsed');

// What the collapsed sheet shows: the selected venue, else the nearest.
const previewVenue = computed(() => {
  if (rankedVenues.value.length === 0) return null;
  const selected = rankedVenues.value.findIndex((rv) => rv.venue.id === selectedVenueId.value);
  const index = selected >= 0 ? selected : 0;
  return { rv: rankedVenues.value[index], rank: index + 1 };
});

// The nearest few pins carry their list number.
const PIN_RANK_LIMIT = 5;

// Computed sheet height CSS variable value
const currentSheetHeightCss = computed(() => {
  if (isDesktop.value) return '0px';
  if (sheetSnapState.value === 'collapsed') return '140px';
  if (sheetSnapState.value === 'half') return '54dvh';
  return '86dvh';
});

let mapInstance: any = null;
let leafletModule: any = null;
let venueMarkersLayer: any = null;
let userLayersGroup: any = null;
const venueMarkersMap = new Map<string, any>();

let previousActiveElement: HTMLElement | null = null;
let previousBodyOverflow: string | null = null;
let hasPushedHistory = false;
let isInternalStateChange = false;
let isProgrammaticMove = false;
let mapInitializationId = 0;

// Touch tracking for mobile sheet handle
let touchStartY = 0;
let touchDeltaY = 0;

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length > 0) {
    touchStartY = e.touches[0].clientY;
    touchDeltaY = 0;
  }
}

function handleTouchMove(e: TouchEvent) {
  if (e.touches.length > 0) {
    touchDeltaY = e.touches[0].clientY - touchStartY;
  }
}

function handleTouchEnd() {
  if (touchDeltaY < -35) {
    expandSheet();
  } else if (touchDeltaY > 35) {
    collapseSheet();
  }
  touchStartY = 0;
  touchDeltaY = 0;
}

function cycleSnapState() {
  if (sheetSnapState.value === 'collapsed') {
    sheetSnapState.value = 'half';
  } else if (sheetSnapState.value === 'half') {
    sheetSnapState.value = 'full';
  } else {
    // The handle is the only non-drag control, so it must reach every height.
    sheetSnapState.value = 'collapsed';
  }
}

function expandSheet() {
  if (sheetSnapState.value === 'collapsed') {
    sheetSnapState.value = 'half';
  } else if (sheetSnapState.value === 'half') {
    sheetSnapState.value = 'full';
  }
}

function collapseSheet() {
  if (sheetSnapState.value === 'full') {
    sheetSnapState.value = 'half';
  } else if (sheetSnapState.value === 'half') {
    sheetSnapState.value = 'collapsed';
  }
}

// Hold the ranking still while a finger is on the list or it is still scrolling, so rows don't jump.
const LIST_SETTLE_MS = 400;

function holdRanking(releaseAfterMs: number | null) {
  isInteractingWithList.value = true;
  if (interactionTimeout) clearTimeout(interactionTimeout);
  interactionTimeout = null;
  if (releaseAfterMs === null) return;
  interactionTimeout = setTimeout(() => {
    interactionTimeout = null;
    isInteractingWithList.value = false;
    updateRanking();
  }, releaseAfterMs);
}

function onListScroll() {
  holdRanking(LIST_SETTLE_MS);
}

function onListTouchStart() {
  holdRanking(null);
}

function onListTouchEnd() {
  holdRanking(LIST_SETTLE_MS);
}

function checkScreenSize() {
  if (typeof window !== 'undefined') {
    isDesktop.value = window.innerWidth >= 1024;
  }
}

function walkLabel(distanceMetres: number): string {
  return `${estimateWalkMinutes(distanceMetres)} min walk from ${isRankedFromBase.value ? 'Base' : 'you'}`;
}

function rowWalkLabel(rv: RankedVenue): string {
  return `${rv.formattedDistance} · ${walkLabel(rv.distanceMetres)}`;
}

function rowWalkUrl(rv: RankedVenue): string | null {
  const { lat, lng } = rv.venue;
  return lat == null || lng == null ? null : getWalkingDirectionsUrl(lat, lng);
}

function toggleTierFilter(tier: TierValue) {
  selectedTiers.value = toggleNearMeTier(selectedTiers.value, tier);
}

// Anti-flicker venue ranking calculation
function updateRanking(force = false) {
  if (!force && isInteractingWithList.value) {
    return;
  }

  const { origin: currentOrigin, fromBase } = resolveRankingOrigin(geo.position.value);

  if (force || fromBase !== isRankedFromBase.value || hasOriginMovedSignificantly(lastRankedOrigin.value, currentOrigin, ORIGIN_MOVE_THRESHOLD_METRES)) {
    rankedVenues.value = rankVenues({
      origin: currentOrigin,
      venues: venuesList.value.filter(matchesCost),
      tiers: selectedTiers.value,
    });
    lastRankedOrigin.value = currentOrigin;
    isRankedFromBase.value = fromBase;
  }
}

// First-fix bounds fitting: fits user plus top 3 venues
function fitFirstFixBounds() {
  if (hasFittedFirstFix.value || !mapInstance || !leafletModule || !geo.position.value) return;
  const L = leafletModule.default || leafletModule;

  const points: [number, number][] = [[geo.position.value.lat, geo.position.value.lng]];
  const topVenues = rankedVenues.value.slice(0, 3);
  topVenues.forEach((rv) => {
    if (rv.venue.lat != null && rv.venue.lng != null) {
      points.push([rv.venue.lat, rv.venue.lng]);
    }
  });

  if (points.length < 2) return;

  const bounds = L.latLngBounds(points);
  hasFittedFirstFix.value = true;
  isProgrammaticMove = true;

  if (isDesktop.value) {
    mapInstance.fitBounds(bounds, {
      paddingTopLeft: [410, 60],
      paddingBottomRight: [60, 60],
      maxZoom: 17,
      animate: true,
    });
  } else {
    // Fit into the part of the map the bottom sheet leaves showing.
    const bottomPadding = Math.round(sheetHeightPx(sheetSnapState.value)) + 24;
    mapInstance.fitBounds(bounds, {
      paddingTopLeft: [30, 80],
      paddingBottomRight: [30, bottomPadding],
      maxZoom: 17,
      animate: true,
    });
  }

  setTimeout(() => {
    isProgrammaticMove = false;
  }, 500);
}

function pinRankFor(venueId: string): number | undefined {
  const index = rankedVenues.value.findIndex((rv) => rv.venue.id === venueId);
  return index >= 0 && index < PIN_RANK_LIMIT ? index + 1 : undefined;
}

function highlightSelectedPin() {
  venueMarkersMap.forEach((marker, id) => {
    const el = marker.getElement();
    if (!el) return;
    const isSelected = id === selectedVenueId.value;
    el.classList.toggle('is-selected-pin', isSelected);
    marker.setZIndexOffset(isSelected ? 1000 : 0);
  });
}

// Swap a pin's icon only when its rank changed, so open popups survive re-ranking.
const pinRanks = new Map<string, number | undefined>();

function applyPinRanks() {
  if (!leafletModule || venueMarkersMap.size === 0) return;
  const L = leafletModule.default || leafletModule;
  let changed = false;
  venueMarkersMap.forEach((marker, id) => {
    const rank = pinRankFor(id);
    if (pinRanks.get(id) === rank) return;
    const venue = venuesList.value.find((v) => v.id === id);
    if (!venue) return;
    marker.setIcon(createVenueIcon(L, venue, rank));
    pinRanks.set(id, rank);
    changed = true;
  });
  if (changed) highlightSelectedPin();
}

// Height of the bottom sheet once it settles in `state` (its CSS height transitions, so
// measuring the element mid-animation would give the wrong answer).
function sheetHeightPx(state: 'collapsed' | 'half' | 'full'): number {
  if (state === 'collapsed') return 140;
  return window.innerHeight * (state === 'half' ? 0.54 : 0.86);
}

// Share of the uncovered map, from its top edge, where a selected pin sits. A little
// below the middle leaves room above the pin for its popup.
const SELECTED_PIN_VISIBLE_FRACTION = 0.6;

/**
 * The map centre that puts a point in the part of the map the venue panel leaves showing:
 * above the bottom sheet on a phone, right of the floating panel on desktop. `fraction` is
 * how far down the uncovered height the point sits on a phone (0.5 is the middle).
 */
function centreForVisibleMap(
  lat: number,
  lng: number,
  zoom: number,
  sheetState: 'collapsed' | 'half' | 'full' = sheetSnapState.value,
  fraction = 0.5
) {
  const point = mapInstance.project([lat, lng], zoom);
  if (isDesktop.value) {
    // Offset so the point isn't hidden behind the 380px left floating panel
    point.x -= 190;
  } else {
    // The sheet covers the bottom of the map: shift the centre below the point so the
    // point lands in the middle of the part still showing.
    const mapHeight = mapInstance.getSize().y;
    const visibleHeight = Math.max(mapHeight - sheetHeightPx(sheetState), 0);
    point.y += mapHeight / 2 - visibleHeight * fraction;
  }
  return mapInstance.unproject(point, zoom);
}

// Select a venue item from list or pin click
function selectVenueItem(venue: Venue, fromPinClick = false) {
  selectedVenueId.value = venue.id;
  // Choosing a venue overrides following the user, so a position update doesn't pull the
  // map back. Recentre on me (or a manual pick) switches following back on.
  isFollowingUser.value = false;

  highlightSelectedPin();

  // Tapping a pin on a collapsed sheet opens it to half height (below), so aim for that.
  const sheetState = fromPinClick && !isDesktop.value && sheetSnapState.value === 'collapsed' ? 'half' : sheetSnapState.value;

  if (venueMarkersMap.has(venue.id)) {
    const marker = venueMarkersMap.get(venue.id);
    if (mapInstance && venue.lat != null && venue.lng != null && (!fromPinClick || !isDesktop.value)) {
      isProgrammaticMove = true;
      const zoom = mapInstance.getZoom();
      const centre = centreForVisibleMap(venue.lat, venue.lng, zoom, sheetState, SELECTED_PIN_VISIBLE_FRACTION);
      mapInstance.panTo(centre, { animate: true });
      setTimeout(() => {
        isProgrammaticMove = false;
      }, 400);
    }
    if (!fromPinClick) marker?.openPopup();
  }

  // Scroll corresponding row into view
  nextTick(() => {
    const rowEl = document.getElementById(`near-me-row-${venue.id}`);
    if (rowEl) {
      rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  // On mobile, expand from collapsed so user can see details
  if (fromPinClick && !isDesktop.value && sheetSnapState.value === 'collapsed') {
    sheetSnapState.value = 'half';
  }
}

// Status banner computing — each state surfaces at most one notification at a time
// Priority: picking location > error states > far-from-Manchester > low-accuracy > manual > null
const statusBanner = computed(() => {
  // DEV forced state override
  if (DEV_FORCED_STATE) {
    switch (DEV_FORCED_STATE) {
      case 'denied':
        return {
          type: 'error', icon: '⚠️',
          text: '[DEV] Location access withheld. The Quorum cannot pinpoint you.',
          action: { label: 'Set Location Manually', handler: () => { isPickingLocation.value = true; } },
        };
      case 'far':
        return {
          type: 'warning', icon: '🗺️',
          text: '[DEV] You appear to be outside Manchester. Spinningfields framing maintained.',
          action: { label: 'Back to the map', handler: close },
        };
      case 'low-accuracy':
        return {
          type: 'info', icon: '📡',
          text: '[DEV] Location approximate — accuracy radius exceeds 100 m.',
          action: null,
        };
      case 'pre-permission':
        return {
          type: 'info', icon: '📍',
          text: '[DEV] Pre-permission state active.',
          action: null,
        };
    }
  }

  if (isPickingLocation.value) {
    return {
      type: 'warning',
      icon: '🎯',
      text: 'Tap the map to set your position',
      action: {
        label: 'Cancel',
        handler: () => { isPickingLocation.value = false; },
      },
    };
  }

  if (geo.state.value === 'requesting') {
    return {
      type: 'info',
      icon: '🛰️',
      text: 'Acquiring your position…',
      action: null,
    };
  }

  if (geo.state.value === 'denied') {
    return {
      type: 'error',
      icon: '⚠️',
      text: 'Location off · showing from Spinningfields',
      action: {
        label: 'Set location',
        handler: () => { isPickingLocation.value = true; },
      },
    };
  }

  if (geo.state.value === 'unavailable') {
    return {
      type: 'error',
      icon: '⚠️',
      text: 'Location unavailable · showing from Spinningfields',
      action: {
        label: 'Set location',
        handler: () => { isPickingLocation.value = true; },
      },
    };
  }

  if (geo.state.value === 'error') {
    return {
      type: 'error',
      icon: '⚠️',
      text: 'Location error · showing from Spinningfields',
      action: {
        label: 'Set location',
        handler: () => { isPickingLocation.value = true; },
      },
    };
  }

  // Phase 5: far-from-Manchester nudge (only when GPS is active and placed them far away)
  if (isUserFarFromManchester.value && geo.state.value === 'active' && !geo.isManual.value) {
    return {
      type: 'warning',
      icon: '🗺️',
      text: 'Outside Manchester · showing Spinningfields',
      action: { label: 'Back to the map', handler: close },
    };
  }

  if (geo.isManual.value) {
    return {
      type: 'manual',
      icon: '📍',
      text: 'Position set manually',
      action: {
        label: 'Resume GPS',
        handler: () => {
          geo.resumeLive();
          isFollowingUser.value = true;
        },
      },
    };
  }

  // Phase 5: low accuracy note (shown as lower-priority info, not an error)
  if (isLowAccuracy.value && geo.state.value === 'active') {
    return {
      type: 'info',
      icon: '📡',
      text: 'Location approximate · results may vary',
      action: null,
    };
  }

  return null;
});

function close() {
  closeNearMe();
}

function recenterOnMe() {
  isFollowingUser.value = true;
  if (geo.position.value && mapInstance) {
    isProgrammaticMove = true;
    const zoom = Math.max(mapInstance.getZoom(), 16);
    mapInstance.setView(centreForVisibleMap(geo.position.value.lat, geo.position.value.lng, zoom), zoom, { animate: true });
    setTimeout(() => {
      isProgrammaticMove = false;
    }, 400);
  } else {
    geo.start();
  }
}

function returnHome() {
  isFollowingUser.value = false;
  if (mapInstance) {
    isProgrammaticMove = true;
    mapInstance.setView(centreForVisibleMap(BASE_LAT, BASE_LNG, DEFAULT_ZOOM), DEFAULT_ZOOM, { animate: true });
    setTimeout(() => {
      isProgrammaticMove = false;
    }, 400);
  }
}

function togglePickLocation() {
  isPickingLocation.value = !isPickingLocation.value;
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    if (isPickingLocation.value) {
      isPickingLocation.value = false;
      return;
    }
    close();
    return;
  }

  // Focus trap
  if (event.key === 'Tab') {
    if (!shellRef.value) return;
    const focusable = shellRef.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const firstElement = focusable[0];
    const lastElement = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (document.activeElement === firstElement || document.activeElement === shellRef.value) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }
}

function renderVenueMarkers() {
  if (!mapInstance || !leafletModule || !venueMarkersLayer) return;
  const L = leafletModule.default || leafletModule;
  venueMarkersLayer.clearLayers();
  venueMarkersMap.clear();
  pinRanks.clear();

  const eligibleVenues = venuesList.value.filter(
    (v) => selectedTiers.value.includes(v.tier) && matchesCost(v) && v.lat != null && v.lng != null
  );

  eligibleVenues.forEach((venue) => {
    const rank = pinRankFor(venue.id);
    const marker = createVenueMarker(L, venue, rank);
    if (!marker) return;

    venueMarkersMap.set(venue.id, marker);
    pinRanks.set(venue.id, rank);

    // 56px keeps the popup clear of the Near Me header.
    // On a phone selectVenueItem centres the pin above the sheet itself; the popup's own
    // auto-pan would fight it, so only the desktop layout leaves panning to the popup.
    bindVenuePopup(marker, venue, () => selectVenue(venue), 56, isDesktop.value);

    marker.on('click', () => {
      selectVenueItem(venue, true);
    });

    venueMarkersLayer.addLayer(marker);
  });

  highlightSelectedPin();
}

async function initNearMeMap(initializationId: number) {
  if (typeof window === 'undefined' || !mapContainerRef.value) return;

  if (!leafletModule) {
    leafletModule = await import('leaflet');
  }
  if (initializationId !== mapInitializationId || !isOpen.value || !mapContainerRef.value) return;
  const L = leafletModule.default || leafletModule;

  // Clean existing instance if any
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  mapInstance = L.map(mapContainerRef.value, {
    center: [BASE_LAT, BASE_LNG],
    zoom: DEFAULT_ZOOM,
    zoomControl: false,
  });

  // Top-right zoom controls (below header overlay)
  L.control.zoom({ position: 'topright' }).addTo(mapInstance);

  // Tile layer — with silent offline/failure guard
  const tileLayer = createTileLayer(L, props.mapApiKey);
  tileLayer.on('tileerror', () => {
    // Tile failed (offline or CDN issue): the map shell and markers still function.
    // No unhandled error — the Leaflet tile layer simply leaves the tile blank.
    // Future: could surface a low-priority offline banner here.
  });
  tileLayer.addTo(mapInstance);

  // Layer groups
  venueMarkersLayer = L.layerGroup().addTo(mapInstance);
  userLayersGroup = L.layerGroup().addTo(mapInstance);

  // Add Spinningfields base quorum marker
  const baseMarker = createBaseMarker(L);
  mapInstance.addLayer(baseMarker);

  // Render initial venue markers
  renderVenueMarkers();

  // Stop auto-following when user drags or zooms the map manually
  mapInstance.on('dragstart zoomstart', () => {
    if (!isProgrammaticMove) {
      isFollowingUser.value = false;
    }
  });

  // Handle map click for manual location picking
  mapInstance.on('click', (e: any) => {
    if (isPickingLocation.value) {
      geo.setManualPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
      isPickingLocation.value = false;
      isFollowingUser.value = true;
      const zoom = Math.max(mapInstance.getZoom(), 16);
      mapInstance.setView(centreForVisibleMap(e.latlng.lat, e.latlng.lng, zoom), zoom, { animate: true });
    }
  });

  // Render initial user marker if available
  updateUserMarkerOnMap();

  // Initial ranking computation
  updateRanking(true);

  // Prevent map gestures leaking through panel/sheet
  if (panelRef.value) {
    L.DomEvent.disableClickPropagation(panelRef.value);
    L.DomEvent.disableScrollPropagation(panelRef.value);
  }

  // Invalidate size to guarantee crisp tile render after fullscreen mount
  requestAnimationFrame(() => {
    if (mapInstance) {
      mapInstance.invalidateSize();
    }
  });
}

function updateUserMarkerOnMap() {
  if (!mapInstance || !leafletModule || !userLayersGroup) return;
  const L = leafletModule.default || leafletModule;
  userLayersGroup.clearLayers();

  if (geo.position.value) {
    const layers = createUserMarkerLayers(L, geo.position.value, geo.isManual.value);
    userLayersGroup.addLayer(layers.accuracyCircle);
    userLayersGroup.addLayer(layers.marker);

    // Phase 5: Low accuracy detection (accuracy > 100m)
    isLowAccuracy.value = geo.position.value.accuracy > 100;

    // Phase 5: Far-from-Manchester detection (> ~30km from Spinningfields)
    const distFromBase = haversineMetres(
      { lat: geo.position.value.lat, lng: geo.position.value.lng },
      { lat: BASE_LAT, lng: BASE_LNG }
    );
    const wasFarAway = isUserFarFromManchester.value;
    isUserFarFromManchester.value = distFromBase > FAR_FROM_BASE_METRES;

    // If far away, keep map at Spinningfields — don't follow to a useless view
    if (isUserFarFromManchester.value) {
      if (!hasFittedFirstFix.value) {
        // Mark first fix as done so fitBounds doesn't run and zoom out
        hasFittedFirstFix.value = true;
      }
      // Don't auto-follow — keep Spinningfields framing
      return;
    }

    // If user just moved back inside Manchester range after being far away, re-enable
    if (wasFarAway && !isUserFarFromManchester.value) {
      hasFittedFirstFix.value = false;
    }

    if (isFollowingUser.value && hasFittedFirstFix.value) {
      isProgrammaticMove = true;
      const zoom = Math.max(mapInstance.getZoom(), 16);
      mapInstance.setView(centreForVisibleMap(geo.position.value.lat, geo.position.value.lng, zoom), zoom, { animate: true });
      setTimeout(() => { isProgrammaticMove = false; }, 400);
    }
  }
}

// Toggled by hand: a Vue :class binding on the Leaflet container would rewrite its
// class list and strip the leaflet-* classes, collapsing every tile to zero width.
watch(isPickingLocation, (picking) => {
  mapContainerRef.value?.classList.toggle('is-picking-location', picking);
});

// Watch user position and manual flag
watch([geo.position, geo.isManual], () => {
  updateUserMarkerOnMap();
  updateRanking(false);

  // Fit bounds on first position fix
  if (!hasFittedFirstFix.value && geo.position.value && rankedVenues.value.length > 0) {
    nextTick(() => {
      fitFirstFixBounds();
    });
  }
});

// Watch rankedVenues to fit bounds if first fix position was acquired before ranking finished
watch(rankedVenues, (venues) => {
  applyPinRanks();
  if (!hasFittedFirstFix.value && geo.position.value && venues.length > 0) {
    nextTick(() => {
      fitFirstFixBounds();
    });
  }
});

// Watch selected tiers to update ranking and map markers
watch([selectedTiers, selectedCosts], () => {
  renderVenueMarkers();
  updateRanking(true);
});

// Prevent event leakage when panel mounts
watch(
  [panelRef, isOpen],
  ([panel, open]) => {
    if (open && panel && leafletModule) {
      const L = leafletModule.default || leafletModule;
      L.DomEvent.disableClickPropagation(panel);
      L.DomEvent.disableScrollPropagation(panel);
    }
  },
  { flush: 'post' }
);

function destroyMap() {
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
  venueMarkersLayer = null;
  userLayersGroup = null;
  venueMarkersMap.clear();
}

function onLocationChange() {
  if (isInternalStateChange) return;

  const isHashNearMe = window.location.hash === '#near-me';
  if (isHashNearMe && !isOpen.value) {
    $isNearMeOpen.set(true);
  } else if (!isHashNearMe && isOpen.value) {
    hasPushedHistory = false;
    $isNearMeOpen.set(false);
  }
}

async function onOpenChange(open: boolean) {
  if (open) {
    const initializationId = ++mapInitializationId;

    if (document.activeElement instanceof HTMLElement) {
      previousActiveElement = document.activeElement;
    }

    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    checkScreenSize();

    if (window.location.hash !== '#near-me') {
      isInternalStateChange = true;
      history.pushState({ nearMe: true }, '', '#near-me');
      hasPushedHistory = true;
      setTimeout(() => {
        isInternalStateChange = false;
      }, 50);
    }

    await nextTick();
    if (!isOpen.value || initializationId !== mapInitializationId) return;

    if (closeButtonRef.value) {
      closeButtonRef.value.focus();
    } else if (shellRef.value) {
      shellRef.value.focus();
    }

    await initNearMeMap(initializationId);
    if (!isOpen.value || initializationId !== mapInitializationId) return;

    // Request location ONLY when Near Me opens
    isFollowingUser.value = true;
    isPickingLocation.value = false;
    hasFittedFirstFix.value = false;
    selectedVenueId.value = null;
    sheetSnapState.value = 'half';
    isUserFarFromManchester.value = false;
    isLowAccuracy.value = false;

    // Phase 5: Show pre-permission explanation before firing the browser prompt.
    // We briefly show the pre-permission modal, then auto-start after a short beat
    // so the user sees the explanation panel before the OS dialog appears.
    showPrePermission.value = true;
    await nextTick();
    if (!isOpen.value || initializationId !== mapInitializationId) return;
    // Small delay allows the UI to paint the pre-permission state before the
    // blocking OS permission dialog covers the screen.
    prePermissionTimeout = setTimeout(() => {
      prePermissionTimeout = null;
      if (!isOpen.value || initializationId !== mapInitializationId) return;
      showPrePermission.value = false;
      geo.start();
    }, 1200);
  } else {
    mapInitializationId += 1;
    if (prePermissionTimeout !== null) {
      clearTimeout(prePermissionTimeout);
      prePermissionTimeout = null;
    }
    if (interactionTimeout !== null) {
      clearTimeout(interactionTimeout);
      interactionTimeout = null;
    }
    geo.stop();
    isPickingLocation.value = false;
    selectedTiers.value = [...NEAR_ME_DEFAULT_TIERS];
    selectedCosts.value = [];
    lastRankedOrigin.value = null;
    hasFittedFirstFix.value = false;
    selectedVenueId.value = null;
    showPrePermission.value = false;
    isUserFarFromManchester.value = false;
    isLowAccuracy.value = false;

    if (previousBodyOverflow !== null) {
      document.body.style.overflow = previousBodyOverflow;
      previousBodyOverflow = null;
    }
    destroyMap();

    if (window.location.hash === '#near-me') {
      if (hasPushedHistory) {
        hasPushedHistory = false;
        isInternalStateChange = true;
        history.back();
        setTimeout(() => {
          isInternalStateChange = false;
        }, 50);
      } else {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    }

    nextTick(() => {
      const nearMeTrigger = document.getElementById('btn-near-me');
      if (nearMeTrigger) {
        nearMeTrigger.focus();
      } else if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus();
      }
    });
  }
}

watch(isOpen, onOpenChange);

onMounted(() => {
  if (typeof window === 'undefined') return;

  checkScreenSize();
  window.addEventListener('resize', checkScreenSize);

  if (isOpen.value) {
    // NearMeLoader only mounts this once Near Me is opened, so the watcher never sees it open.
    void onOpenChange(true);
  } else if (window.location.hash === '#near-me') {
    $isNearMeOpen.set(true);
  }

  window.addEventListener('popstate', onLocationChange);
  window.addEventListener('hashchange', onLocationChange);
});

onUnmounted(() => {
  if (typeof window === 'undefined') return;

  mapInitializationId += 1;
  if (prePermissionTimeout !== null) clearTimeout(prePermissionTimeout);
  if (interactionTimeout !== null) clearTimeout(interactionTimeout);
  window.removeEventListener('resize', checkScreenSize);
  window.removeEventListener('popstate', onLocationChange);
  window.removeEventListener('hashchange', onLocationChange);

  if (previousBodyOverflow !== null) {
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = null;
  }
  geo.stop();
  destroyMap();
});
</script>

<style scoped>
/* CSS Variables & Theming Tokens for Near Me */
.near-me-shell {
  --near-me-bg: var(--ledger-paper);
  --near-me-surface: var(--ledger-parchment);
  --near-me-header-bg: var(--ledger-deep);
  --near-me-header-text: var(--ledger-parchment);
  --near-me-border: var(--ledger-border);
  --near-me-gold: var(--ledger-gold);
  --near-me-crimson: var(--ledger-navy);
  --near-me-ink: var(--ledger-ink);
  --near-me-muted: #5a5b64;
  --near-me-muted-on-dark: #d0d6e5;
  --near-me-warning-bg: #fff1d6;
  --near-me-warning-ink: #543300;
  --near-me-error-bg: #fbe9e7;
  --near-me-error-ink: #7b1f1a;
  --near-me-manual-bg: #f2e8f5;
  --near-me-manual-ink: #51265b;
  --near-me-radius-sm: 6px;
  --near-me-radius-card: 10px;
  --near-me-radius-panel: 12px;
  --near-me-shadow: 0 3px 12px -2px rgb(22 19 15 / 12%), 0 1px 3px rgb(22 19 15 / 6%);
  --near-me-safe-top: max(env(safe-area-inset-top, 0px), 12px);
  --near-me-safe-bottom: max(env(safe-area-inset-bottom, 0px), 12px);
  --near-me-safe-left: max(env(safe-area-inset-left, 0px), 12px);
  --near-me-safe-right: max(env(safe-area-inset-right, 0px), 12px);

  position: fixed;
  inset: 0;
  width: 100%;
  height: 100dvh;
  isolation: isolate;
  z-index: 9999;
  background-color: var(--near-me-bg);
  overflow: hidden;
  font-family: inherit;
}

.near-me-map-container {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.near-me-map-container.is-picking-location,
:deep(.near-me-map-container.is-picking-location .leaflet-grab) {
  cursor: crosshair !important;
}

.near-me-overlay-layer {
  position: absolute;
  inset: 0;
  z-index: 1100;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding-top: var(--near-me-safe-top);
  padding-bottom: var(--near-me-safe-bottom);
  padding-left: var(--near-me-safe-left);
  padding-right: var(--near-me-safe-right);
}

.near-me-top-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  gap: 12px;
  pointer-events: none;
  z-index: 1250;
}

.near-me-close-btn {
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 9999px;
  background-color: rgba(26, 30, 36, 0.95);
  backdrop-filter: blur(8px);
  color: #f9f7f1;
  border: 1px solid var(--near-me-gold);
  box-shadow: var(--near-me-shadow);
  cursor: pointer;
  transition: all 0.15s ease-in-out;
}

.near-me-close-btn:hover {
  background-color: var(--near-me-crimson);
  border-color: #f9f7f1;
  color: #ffffff;
  transform: scale(1.05);
}

.near-me-close-btn:focus-visible {
  outline: 2px solid var(--near-me-gold);
  outline-offset: 2px;
}

/* Status Notification Banner */
.near-me-status-bar {
  display: flex;
  justify-content: center;
  width: 100%;
  pointer-events: none;
  margin-top: 6px;
  z-index: 1250;
}

.near-me-status-pill {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background-color: rgba(26, 30, 36, 0.95);
  backdrop-filter: blur(8px);
  color: #f9f7f1;
  padding: 6px 14px;
  border-radius: 9999px;
  border: 1px solid var(--near-me-gold);
  font-size: 0.75rem;
  box-shadow: var(--near-me-shadow);
  max-width: calc(100vw - 32px);
}

.near-me-status-pill.warning {
  border-color: #d97706;
  background-color: rgba(69, 26, 3, 0.95);
  color: #fef3c7;
}

.near-me-status-pill.error {
  border-color: #dc2626;
  background-color: rgba(69, 10, 10, 0.95);
  color: #fee2e2;
}

.near-me-status-pill.manual {
  border-color: #a855f7;
  background-color: rgba(59, 7, 100, 0.95);
  color: #f3e8ff;
}

.near-me-status-action {
  background-color: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #ffffff;
  padding: 2px 8px;
  border-radius: 9999px;
  font-weight: 600;
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-left: 4px;
}

.near-me-status-action:hover {
  background-color: var(--near-me-gold);
  color: #1a1e24;
}

/* Floating Controls Cluster */
.near-me-controls-cluster {
  pointer-events: auto;
  position: absolute;
  right: var(--near-me-safe-right);
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 1200;
  transition: bottom 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.2s ease, transform 0.2s ease;
}

@media (min-width: 1024px) {
  .near-me-controls-cluster {
    bottom: calc(var(--near-me-safe-bottom) + 16px);
  }
}

@media (max-width: 1023px) {
  .near-me-controls-cluster {
    bottom: calc(var(--sheet-current-height, 140px) + 14px);
  }
  .near-me-controls-cluster.is-hidden-on-mobile {
    opacity: 0;
    pointer-events: none;
    transform: translateY(20px);
  }
}

.near-me-control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 9999px;
  background-color: rgba(26, 30, 36, 0.95);
  backdrop-filter: blur(8px);
  color: #f9f7f1;
  border: 1px solid rgba(197, 155, 39, 0.6);
  box-shadow: var(--near-me-shadow);
  cursor: pointer;
  transition: all 0.15s ease-in-out;
}

.near-me-control-btn:hover:not(:disabled) {
  background-color: var(--near-me-crimson);
  border-color: #f9f7f1;
  color: #ffffff;
  transform: scale(1.05);
}

.near-me-control-btn.is-active {
  background-color: #1d4ed8;
  border-color: #93c5fd;
  color: #ffffff;
  box-shadow: 0 0 12px rgba(37, 99, 235, 0.6);
}

.near-me-control-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.near-me-control-btn:focus-visible {
  outline: 2px solid var(--near-me-gold);
  outline-offset: 2px;
}

/* =====================================================   Venue Panel: Responsive Layout (Side panel desktop / Bottom sheet mobile)
   ============================================================ */
.near-me-panel {
  pointer-events: auto;
  background-color: rgba(26, 30, 36, 0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: #f9f7f1;
  border: 1px solid var(--near-me-gold);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1150;
  box-shadow: var(--near-me-shadow);
}

/* Desktop layout: Floating side panel */
@media (min-width: 1024px) {
  .near-me-panel {
    position: absolute;
    top: 76px;
    left: var(--near-me-safe-left);
    bottom: var(--near-me-safe-bottom);
    width: 380px;
    max-width: calc(100vw - 40px);
    border-radius: 16px;
  }
}

/* Mobile layout: Bottom sheet with 3 snap states */
@media (max-width: 1023px) {
  .near-me-panel {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 20px 20px 0 0;
    border-bottom: none;
    border-left: none;
    border-right: none;
    border-top: 1.5px solid var(--near-me-gold);
    transition: height 0.3s cubic-bezier(0.25, 1, 0.5, 1);
  }

  .near-me-panel.snap-collapsed {
    height: 140px;
  }

  .near-me-panel.snap-half {
    height: 54dvh;
  }

  .near-me-panel.snap-full {
    height: 86dvh;
  }
}

/* Handle row for mobile drawer */
.near-me-sheet-handle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 16px 0 16px;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.near-me-snap-btn {
  background: none;
  border: none;
  padding: 2px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}

.near-me-sheet-handle-bar {
  display: block;
  width: 44px;
  height: 4.5px;
  background-color: rgba(220, 214, 200, 0.5);
  border-radius: 9999px;
  transition: background-color 0.15s ease;
}

.near-me-snap-btn:hover .near-me-sheet-handle-bar {
  background-color: var(--near-me-gold);
}




/* Tier Filter Chips within Panel (chip styling comes from the shared TierFilterChips) */
.near-me-panel-filters {
  padding: 8px 14px;
  border-bottom: 1px solid rgba(197, 155, 39, 0.25);
  flex-shrink: 0;
}

/* Scrollable Container */
.near-me-scroll-body {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
}

/* Custom Scrollbar */
.near-me-scroll-body::-webkit-scrollbar {
  width: 5px;
}

.near-me-scroll-body::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
}

.near-me-scroll-body::-webkit-scrollbar-thumb {
  background: rgba(197, 155, 39, 0.35);
  border-radius: 4px;
}

.near-me-scroll-body::-webkit-scrollbar-thumb:hover {
  background: var(--near-me-gold);
}

/* =====================================================   Ranked List Section & Cards
   ============================================================ */
.near-me-list-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.near-me-list-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 2px 4px;
}

.near-me-list-title {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--near-me-gold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.near-me-list-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.near-me-card-index {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--near-me-gold);
  flex-shrink: 0;
}

.near-me-btn-walk {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background-color: var(--near-me-crimson);
  color: #ffffff;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  text-decoration: none;
  transition: all 0.15s ease;
}

.near-me-btn-walk:hover {
  background-color: #b91c1c;
}

.near-me-empty-state {
  text-align: center;
  padding: 24px 12px;
  color: #dcd6c8;
}

.near-me-empty-icon {
  font-size: 1.8rem;
  display: block;
  margin-bottom: 8px;
}

.near-me-empty-title {
  font-family: "Playfair Display", Georgia, serif;
  font-size: 0.95rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 4px 0;
}

.near-me-empty-text {
  font-size: 0.72rem;
  color: #9ca3af;
  margin: 0;
  line-height: 1.4;
}

/* =====================================================   Leaflet Overrides & Highlighted Pin Styling
   ============================================================ */
:deep(.leaflet-top.leaflet-right) {
  top: calc(var(--near-me-safe-top) + 54px);
  right: var(--near-me-safe-right);
}

/* Mobile: Ensure attribution is not obscured behind the bottom sheet */
@media (max-width: 1023px) {
  :deep(.leaflet-bottom.leaflet-right) {
    bottom: calc(var(--sheet-current-height, 140px) + 6px) !important;
    transition: bottom 0.3s cubic-bezier(0.25, 1, 0.5, 1);
  }
}

/* Pin Selection Highlighting */
:deep(.custom-ledger-pin.is-selected-pin) {
  z-index: 9999 !important;
}

:deep(.custom-ledger-pin.is-selected-pin > div) {
  transform: scale(1.35) !important;
  filter: drop-shadow(0 0 8px rgba(197, 155, 39, 0.95)) drop-shadow(0 4px 10px rgba(0, 0, 0, 0.6)) !important;
}

:deep(.custom-ledger-pin.is-selected-pin .rounded-full) {
  box-shadow: 0 0 0 3px #c59b27, 0 4px 8px rgba(0, 0, 0, 0.4) !important;
}

/* =====================================================   Phase 5: Pre-Permission Modal
   ============================================================ */
.near-me-prepermission {
  pointer-events: auto;
  position: absolute;
  /* Sits above status bar, centred horizontally, below the top bar */
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(480px, calc(100vw - 48px));
  z-index: 1300;
}

.near-me-prepermission-inner {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  background: rgba(22, 26, 32, 0.97);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1.5px solid var(--near-me-gold);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 20px 40px -8px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(197, 155, 39, 0.15);
}

.near-me-prepermission-icon {
  font-size: 2rem;
  flex-shrink: 0;
  line-height: 1;
  margin-top: 2px;
}

.near-me-prepermission-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.near-me-prepermission-title {
  font-family: "Playfair Display", Georgia, serif;
  font-size: 1rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
}

.near-me-prepermission-text {
  font-size: 0.78rem;
  color: #d1d5db;
  line-height: 1.5;
  margin: 0;
}

/* =====================================================   Phase 5: Fade transition for pre-permission modal
   ============================================================ */
.nm-fade-enter-active,
.nm-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.nm-fade-enter-from,
.nm-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-50% + 8px));
}

/* Phase 6: Use the site's parchment, ink, navy and gold design system. */
.near-me-close-btn,
.near-me-control-btn {
  background-color: var(--ledger-deep);
  color: var(--ledger-parchment);
  border-color: var(--ledger-gold);
}

.near-me-close-btn:hover,
.near-me-control-btn:hover:not(:disabled) {
  background-color: var(--ledger-navy);
  border-color: var(--ledger-gold);
  color: var(--ledger-parchment);
}

.near-me-control-btn.is-active {
  background-color: var(--ledger-green);
  border-color: var(--ledger-parchment);
  color: #ffffff;
  box-shadow: 0 0 0 2px rgb(30 122 78 / 22%);
}

.near-me-control-btn:focus-visible,
.near-me-close-btn:focus-visible,
.near-me-snap-btn:focus-visible {
  outline-color: var(--ledger-gold);
}

.near-me-status-pill {
  background-color: var(--ledger-card);
  color: var(--ledger-deep);
  border-color: var(--ledger-border);
}

.near-me-status-pill.warning {
  background-color: var(--near-me-warning-bg);
  color: var(--near-me-warning-ink);
  border-color: var(--ledger-gold);
}

.near-me-status-pill.error {
  background-color: var(--near-me-error-bg);
  color: var(--near-me-error-ink);
  border-color: #b92b27;
}

.near-me-status-pill.manual {
  background-color: var(--near-me-manual-bg);
  color: var(--near-me-manual-ink);
  border-color: #7c3a82;
}

.near-me-status-action {
  background-color: var(--ledger-deep);
  border-color: var(--ledger-deep);
  color: var(--ledger-parchment);
}

.near-me-status-action:hover {
  background-color: var(--ledger-navy);
  color: #ffffff;
}

.near-me-panel {
  background-color: rgb(251 246 234 / 97%);
  color: var(--ledger-ink);
  border-color: var(--ledger-border);
  box-shadow: 0 6px 24px rgb(17 30 71 / 18%), 0 1px 3px rgb(22 19 15 / 8%);
}

@media (min-width: 1024px) {
  .near-me-panel {
    border-radius: var(--near-me-radius-panel);
  }
}

@media (max-width: 1023px) {
  .near-me-panel {
    border-radius: var(--near-me-radius-panel) var(--near-me-radius-panel) 0 0;
  }
}

.near-me-sheet-handle-bar {
  background-color: var(--ledger-border);
}



.near-me-panel-filters {
  border-bottom-color: var(--ledger-border);
}

.near-me-scroll-body {
  scrollbar-color: var(--ledger-border) var(--ledger-paper);
}

.near-me-scroll-body::-webkit-scrollbar-track {
  background: var(--ledger-paper);
}

.near-me-scroll-body::-webkit-scrollbar-thumb {
  background: var(--ledger-border);
}

.near-me-scroll-body::-webkit-scrollbar-thumb:hover {
  background: var(--ledger-gold);
}

.near-me-card-index {
  color: var(--ledger-gold);
}

.near-me-btn-walk {
  background-color: var(--ledger-gold);
  color: var(--ledger-deep);
  box-shadow: 0 1px 3px rgb(17 30 71 / 20%);
}

.near-me-btn-walk:hover {
  background-color: #ffb454;
  color: var(--ledger-deep);
}

.near-me-list-title {
  color: var(--ledger-deep);
}

.near-me-empty-state {
  color: var(--ledger-ink);
}

.near-me-empty-title {
  color: var(--ledger-deep);
}

.near-me-empty-text {
  color: var(--near-me-muted);
}

:deep(.leaflet-tile) {
  filter: saturate(0.88) sepia(0.05);
}

.near-me-shell-enter-active,
.near-me-shell-leave-active {
  transition: opacity 180ms ease;
}

.near-me-shell-enter-from,
.near-me-shell-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .near-me-shell-enter-active,
  .near-me-shell-leave-active,
  .near-me-panel,
  .near-me-controls-cluster,
  .near-me-control-btn,
  .near-me-close-btn {
    transition-duration: 0.01ms !important;
  }
}

.near-me-list-title {
  font-size: 0.8rem;
}

.near-me-btn-walk {
  min-height: 44px;
  justify-content: center;
  padding-inline: 14px;
  font-size: 0.85rem;
  white-space: nowrap;
}


.near-me-snap-btn {
  min-height: 24px;
}

.near-me-control-btn {
  width: 44px;
  height: 44px;
}

.near-me-status-action {
  flex-shrink: 0;
  white-space: nowrap;
  min-height: 32px;
  padding-inline: 12px;
}

/* Pinch-zoom covers phones, and the buttons would sit under the status banner. */
@media (max-width: 1023px) {
  :deep(.leaflet-control-zoom) {
    display: none;
  }
}

/* Collapsed sheet summary */
.near-me-collapsed-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 14px 12px;
}

.near-me-collapsed-main {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  padding: 0;
  color: var(--ledger-deep);
  text-align: left;
  cursor: pointer;
}

.near-me-collapsed-name {
  overflow: hidden;
  font-family: "Playfair Display", Georgia, serif;
  font-size: 1rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.near-me-collapsed-meta {
  flex-shrink: 0;
  font-family: "Plus Jakarta Sans", sans-serif;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--near-me-muted);
}

/* Price filter in the list header */
.near-me-cost-filter {
  display: flex;
  gap: 4px;
}

.near-me-cost-chip {
  min-width: 36px;
  min-height: 36px;
  padding: 0 8px;
  border: 1px solid var(--ledger-border);
  border-radius: 9999px;
  background: var(--ledger-card);
  color: var(--ledger-deep);
  font-family: "Plus Jakarta Sans", sans-serif;
  font-variant-numeric: tabular-nums;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.near-me-cost-chip.is-selected {
  background: var(--ledger-deep);
  border-color: var(--ledger-deep);
  color: var(--ledger-parchment);
}

.near-me-cost-chip:focus-visible {
  outline: 2px solid var(--ledger-navy);
  outline-offset: 2px;
}

.near-me-list-header {
  align-items: center;
}

.near-me-far-note {
  color: #8a5100;
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
