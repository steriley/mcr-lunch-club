<template>
  <Teleport to="body">
    <Transition name="near-me-shell">
      <div
        v-if="isOpen"
        ref="shellRef"
        class="near-me-shell"
        :style="{ '--sheet-current-height': sheet.heightCss.value }"
        tabindex="-1"
        role="dialog"
        aria-modal="true"
        aria-label="Near Me Locate Mode"
        @keydown="handleKeyDown"
      >
        <!-- Map Container (fills the fullscreen shell) -->
        <div ref="mapContainerRef" class="near-me-map-container"></div>

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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              <span class="sr-only">Close Near Me</span>
            </button>
          </header>

          <NearMeStatusBanner v-if="statusBanner" :banner="statusBanner" />

          <NearMePrePermission :visible="showPrePermission" />

          <NearMeControls
            :has-position="Boolean(geoPosition)"
            :following="isFollowingUser && Boolean(geoPosition)"
            :picking="isPickingLocation || isManualLocation"
            :hidden-on-mobile="!sheet.isDesktop.value && sheet.snap.value === 'full'"
            @recenter="recenterOnMe"
            @home="returnHome"
            @pick="togglePickLocation"
          />

          <!-- Venue Panel (Desktop: Floating side panel; Mobile: Bottom sheet) -->
          <div
            ref="panelRef"
            id="near-me-panel"
            class="near-me-panel"
            :class="[`snap-${sheet.snap.value}`, { 'is-desktop': sheet.isDesktop.value }]"
            role="region"
            aria-label="Ranked Nearby Venues"
          >
            <!-- Mobile Drag Handle Row & Snap Controls -->
            <div
              v-if="!sheet.isDesktop.value"
              class="near-me-sheet-handle-row"
              @touchstart="sheet.onTouchStart"
              @touchmove="sheet.onTouchMove"
              @touchend="sheet.onTouchEnd"
            >
              <button
                type="button"
                class="near-me-snap-btn"
                :aria-label="`Venue list height: ${sheet.snap.value}. Activate to change.`"
                @click="sheet.cycle"
              >
                <span class="near-me-sheet-handle-bar"></span>
              </button>
            </div>

            <NearMeCollapsedSummary
              v-if="sheet.isCollapsedMobile.value && previewVenue"
              :ranked="previewVenue.rv"
              :rank="previewVenue.rank"
              @expand="sheet.expand"
            />

            <!-- Verdict Filter Chips (Inside Panel): shared with the homepage filter bar -->
            <div v-show="!sheet.isCollapsedMobile.value" class="near-me-panel-filters">
              <TierFilterChips
                :tiers="NEAR_ME_TIERS"
                :selected="selectedTiers"
                :counts="tierCounts"
                :disabled="lastSelectedTier"
                disabled-reason="At least one verdict must stay selected"
                label="Near Me Verdict Filters"
                @toggle="toggleTierFilter"
              />
            </div>

            <!-- Scrollable Content Body -->
            <div
              ref="listContainerRef"
              v-show="!sheet.isCollapsedMobile.value"
              class="near-me-scroll-body"
              @scroll="onListScroll"
              @touchstart.passive="onListTouchStart"
              @touchend.passive="onListTouchEnd"
              @touchcancel.passive="onListTouchEnd"
            >
              <NearMeVenueList
                :nearest="nearestVenue"
                :others="listVenues"
                :inspections="inspections"
                :selection="selection"
                :selected-venue-id="selectedVenueId"
                :selected-costs="selectedCosts"
                :far-from-manchester="isUserFarFromManchester"
                :from-base="isRankedFromBase"
                @select="(venue) => selectVenueItem(venue, false)"
                @details="goToVenuePage"
                @clear-selection="clearSelection"
                @toggle-cost="toggleCostFilter"
              />
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
import { $isNearMeOpen, closeNearMe } from '@/stores/filters';
import { $inspectionsList, $venuesList } from '@/stores/ledger';
import {
  NEAR_ME_DEFAULT_TIERS,
  NEAR_ME_TIERS,
  countVenuesByTier,
  type TierValue,
} from '@/lib/tiers';
import type { CostTier, Inspection, Venue } from '@/types';
import TierFilterChips from '@/components/TierFilterChips.vue';
import {
  rankVenues,
  toggleNearMeTier,
  hasOriginMovedSignificantly,
  resolveRankingOrigin,
  useGeolocation,
  ORIGIN_MOVE_THRESHOLD_METRES,
  type RankedVenue,
  type LatLng,
} from '@/lib/map';
import { matchesCost, toggleCost } from '@/lib/near-me/filters';
import { trapTabKey } from '@/lib/near-me/focus-trap';
import { nearMeStatusBanner } from '@/lib/near-me/status-banner';
import NearMeCollapsedSummary from './near-me/NearMeCollapsedSummary.vue';
import NearMeControls from './near-me/NearMeControls.vue';
import NearMePrePermission from './near-me/NearMePrePermission.vue';
import NearMeStatusBanner from './near-me/NearMeStatusBanner.vue';
import NearMeVenueList from './near-me/NearMeVenueList.vue';
import { useBottomSheet } from './near-me/useBottomSheet';
import { useNearMeHistory } from './near-me/useNearMeHistory';
import '@/styles/map.css';
import { useNearMeLeaflet } from './near-me/useNearMeLeaflet';

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

const geo = useGeolocation();
const geoPosition = geo.position;
const isManualLocation = geo.isManual;
const sheet = useBottomSheet();
const nearMeHistory = useNearMeHistory(isOpen);

// UI states
const isFollowingUser = ref<boolean>(true);
const isPickingLocation = ref<boolean>(false);
const selectedVenueId = ref<string | null>(null);
// Where the selection came from: a pin shows it as "Your selection"; a list row is highlighted where it sits.
const selectedFromPin = ref(false);
const hasFittedFirstFix = ref<boolean>(false);
const isInteractingWithList = ref<boolean>(false);
let interactionTimeout: ReturnType<typeof setTimeout> | null = null;
let prePermissionTimeout: ReturnType<typeof setTimeout> | null = null;

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
const selectedCosts = ref<CostTier[]>([]);

function toggleCostFilter(cost: CostTier) {
  selectedCosts.value = toggleCost(selectedCosts.value, cost);
}

// Chip counts only include venues that can be plotted, so they match the pins and list.
const tierCounts = computed(() =>
  countVenuesByTier(venuesList.value.filter((v) => v.lat != null && v.lng != null))
);

// The last selected chip is shown as unavailable; tapping it does nothing.
const lastSelectedTier = computed(() =>
  selectedTiers.value.length === 1 ? selectedTiers.value : []
);

// Ranking state
const lastRankedOrigin = ref<LatLng | null>(null);
const rankedVenues = ref<RankedVenue[]>([]);
// True while distances are measured from Spinningfields rather than the user.
const isRankedFromBase = ref(true);

const nearestVenue = computed(() => (rankedVenues.value.length > 0 ? rankedVenues.value[0] : null));

// The nearest venue is the hero card, so the list carries the rest.
const listVenues = computed(() => rankedVenues.value.slice(1));

// The venue picked on the map, with its place in the ranking (null while nothing is selected, or when
// the pick was a list row, which is highlighted in place instead).
const selection = computed(() => {
  if (!selectedFromPin.value) return null;
  const index = rankedVenues.value.findIndex((rv) => rv.venue.id === selectedVenueId.value);
  if (index >= 0)
    return {
      venue: rankedVenues.value[index].venue,
      rv: rankedVenues.value[index],
      rank: index + 1,
    };
  const venue = venuesList.value.find((candidate) => candidate.id === selectedVenueId.value);
  return venue ? { venue, rv: null, rank: undefined } : null;
});

// What the collapsed sheet shows: the selected venue, else the nearest.
const previewVenue = computed(() => {
  if (rankedVenues.value.length === 0) return null;
  const selected = rankedVenues.value.findIndex((rv) => rv.venue.id === selectedVenueId.value);
  const index = selected >= 0 ? selected : 0;
  return { rv: rankedVenues.value[index], rank: index + 1 };
});

const map = useNearMeLeaflet({
  mapApiKey: props.mapApiKey,
  container: mapContainerRef,
  sheet,
  geo,
  pinnedVenues: () =>
    venuesList.value.filter(
      (v) =>
        selectedTiers.value.includes(v.tier) &&
        matchesCost(v, selectedCosts.value) &&
        v.lat != null &&
        v.lng != null
    ),
  allVenues: () => venuesList.value,
  rankedVenues,
  selectedVenueId,
  isFollowingUser,
  isPickingLocation,
  hasFittedFirstFix,
  isUserFarFromManchester,
  isLowAccuracy,
  onPinSelect: (venue) => selectVenueItem(venue, true),
});

let previousActiveElement: HTMLElement | null = null;
let previousBodyOverflow: string | null = null;
let mapInitializationId = 0;

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

function toggleTierFilter(tier: TierValue) {
  selectedTiers.value = toggleNearMeTier(selectedTiers.value, tier);
}

// Anti-flicker venue ranking calculation
function updateRanking(force = false) {
  if (!force && isInteractingWithList.value) {
    return;
  }

  const { origin: currentOrigin, fromBase } = resolveRankingOrigin(geo.position.value);

  if (
    force ||
    fromBase !== isRankedFromBase.value ||
    hasOriginMovedSignificantly(lastRankedOrigin.value, currentOrigin, ORIGIN_MOVE_THRESHOLD_METRES)
  ) {
    rankedVenues.value = rankVenues({
      origin: currentOrigin,
      venues: venuesList.value.filter((venue) => matchesCost(venue, selectedCosts.value)),
      tiers: selectedTiers.value,
    });
    lastRankedOrigin.value = currentOrigin;
    isRankedFromBase.value = fromBase;
  }
}

// A venue's page replaces the old dossier panel.
function goToVenuePage(venue: Venue) {
  window.location.assign(`/venues/${encodeURIComponent(venue.slug)}`);
}

// Put the selection away; the pin loses its highlight.
function clearSelection() {
  selectedVenueId.value = null;
  map.highlightSelectedPin();
}

// Select a venue item from list or pin click
function selectVenueItem(venue: Venue, fromPinClick = false) {
  selectedVenueId.value = venue.id;
  selectedFromPin.value = fromPinClick;
  // Choosing a venue overrides following the user, so a position update doesn't pull the
  // map back. Recentre on me (or a manual pick) switches following back on.
  isFollowingUser.value = false;

  map.highlightSelectedPin();

  // Tapping a pin on a collapsed sheet opens it to half height (below), so aim for that.
  const opensSheet = fromPinClick && !sheet.isDesktop.value && sheet.snap.value === 'collapsed';
  map.focusVenue(venue, { sheetState: opensSheet ? 'half' : sheet.snap.value });

  // "Your selection" is the top of the list: bring it into view.
  void nextTick(() => listContainerRef.value?.scrollTo({ top: 0, behavior: 'smooth' }));

  // On mobile, expand from collapsed so user can see details
  if (opensSheet) sheet.snap.value = 'half';
}

const statusBanner = computed(() =>
  nearMeStatusBanner(
    {
      devForced: DEV_FORCED_STATE,
      picking: isPickingLocation.value,
      geoState: geo.state.value,
      farFromManchester: isUserFarFromManchester.value,
      manual: geo.isManual.value,
      lowAccuracy: isLowAccuracy.value,
    },
    {
      startPicking: () => {
        isPickingLocation.value = true;
      },
      stopPicking: () => {
        isPickingLocation.value = false;
      },
      close,
      resumeLive: () => {
        geo.resumeLive();
        isFollowingUser.value = true;
      },
    }
  )
);

function close() {
  closeNearMe();
}

function recenterOnMe() {
  isFollowingUser.value = true;
  if (!map.recenterOnUser()) geo.start();
}

function returnHome() {
  isFollowingUser.value = false;
  map.showBase();
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
  if (shellRef.value) trapTabKey(event, shellRef.value);
}

// Toggled by hand: a Vue :class binding on the Leaflet container would rewrite its
// class list and strip the leaflet-* classes, collapsing every tile to zero width.
watch(isPickingLocation, (picking) => {
  mapContainerRef.value?.classList.toggle('is-picking-location', picking);
});

// Watch user position and manual flag
watch([geo.position, geo.isManual], () => {
  map.updateUserMarker();
  updateRanking(false);

  // Fit bounds on first position fix
  if (!hasFittedFirstFix.value && geo.position.value && rankedVenues.value.length > 0) {
    void nextTick(() => {
      map.fitFirstFixBounds();
    });
  }
});

// Watch rankedVenues to fit bounds if first fix position was acquired before ranking finished
watch(rankedVenues, (venues) => {
  map.applyPinRanks();
  if (!hasFittedFirstFix.value && geo.position.value && venues.length > 0) {
    void nextTick(() => {
      map.fitFirstFixBounds();
    });
  }
});

// Watch selected tiers to update ranking and map markers
watch([selectedTiers, selectedCosts], () => {
  map.renderVenueMarkers();
  updateRanking(true);
});

// Prevent event leakage when panel mounts
watch(
  [panelRef, isOpen],
  ([panel, open]) => {
    if (open) map.isolatePanel(panel);
  },
  { flush: 'post' }
);

async function onOpenChange(open: boolean) {
  if (open) {
    const initializationId = ++mapInitializationId;
    const isCurrent = () => isOpen.value && initializationId === mapInitializationId;

    if (document.activeElement instanceof HTMLElement) {
      previousActiveElement = document.activeElement;
    }

    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheet.checkScreenSize();
    nearMeHistory.pushHash();

    await nextTick();
    if (!isCurrent()) return;

    if (closeButtonRef.value) {
      closeButtonRef.value.focus();
    } else if (shellRef.value) {
      shellRef.value.focus();
    }

    await map.init(
      isCurrent,
      () => panelRef.value,
      () => updateRanking(true)
    );
    if (!isCurrent()) return;

    // Request location ONLY when Near Me opens
    isFollowingUser.value = true;
    isPickingLocation.value = false;
    hasFittedFirstFix.value = false;
    selectedVenueId.value = null;
    sheet.snap.value = 'half';
    isUserFarFromManchester.value = false;
    isLowAccuracy.value = false;

    // Show the pre-permission explanation for a beat, so the user sees it before the
    // blocking OS permission dialog covers the screen.
    showPrePermission.value = true;
    await nextTick();
    if (!isCurrent()) return;
    prePermissionTimeout = setTimeout(() => {
      prePermissionTimeout = null;
      if (!isCurrent()) return;
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
    map.destroy();
    nearMeHistory.clearHash();

    void nextTick(() => {
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

  sheet.checkScreenSize();
  window.addEventListener('resize', sheet.checkScreenSize);

  if (isOpen.value) {
    // NearMeLoader only mounts this once Near Me is opened, so the watcher never sees it open.
    void onOpenChange(true);
  } else if (window.location.hash === '#near-me') {
    $isNearMeOpen.set(true);
  }

  nearMeHistory.listen();
});

onUnmounted(() => {
  if (typeof window === 'undefined') return;

  mapInitializationId += 1;
  if (prePermissionTimeout !== null) clearTimeout(prePermissionTimeout);
  if (interactionTimeout !== null) clearTimeout(interactionTimeout);
  window.removeEventListener('resize', sheet.checkScreenSize);
  nearMeHistory.unlisten();

  if (previousBodyOverflow !== null) {
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = null;
  }
  geo.stop();
  map.destroy();
});
</script>

<style scoped>
/* CSS Variables & Theming Tokens for Near Me */
.near-me-shell {
  --near-me-bg: var(--ledger-paper);
  --near-me-surface: var(--ledger-parchment);
  --near-me-header-bg: var(--ledger-deep);
  --near-me-header-text: var(--color-parchment-fixed);
  --near-me-border: var(--ledger-border);
  --near-me-gold: var(--ledger-gold);
  --near-me-crimson: var(--ledger-navy);
  --near-me-ink: var(--ledger-ink);
  --near-me-muted: var(--color-muted-soft);
  --near-me-muted-on-dark: var(--color-on-dark-cool);
  --near-me-warning-bg: var(--color-alert-warning);
  --near-me-warning-ink: var(--color-alert-warning-ink);
  --near-me-error-bg: var(--color-alert-error);
  --near-me-error-ink: var(--color-alert-error-ink);
  --near-me-manual-bg: var(--color-alert-manual);
  --near-me-manual-ink: var(--color-alert-manual-ink);
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
  color: var(--color-cream-fixed);
  border: 1px solid var(--near-me-gold);
  box-shadow: var(--near-me-shadow);
  cursor: pointer;
  transition: all 0.15s ease-in-out;
}

.near-me-close-btn:hover {
  background-color: var(--near-me-crimson);
  border-color: var(--color-cream-fixed);
  color: var(--color-white);
  transform: scale(1.05);
}

.near-me-close-btn:focus-visible {
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
  color: var(--color-cream-fixed);
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
  background-color: color-mix(in srgb, var(--color-rule) 50%, transparent);
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
  box-shadow:
    0 0 0 3px var(--color-brass),
    0 4px 8px rgba(0, 0, 0, 0.4) !important;
}

.near-me-close-btn {
  background-color: var(--ledger-deep);
  color: var(--color-parchment-fixed);
  border-color: var(--ledger-gold);
}

.near-me-close-btn:hover {
  background-color: var(--color-navy-fixed);
  border-color: var(--ledger-gold);
  color: var(--color-parchment-fixed);
}

.near-me-close-btn:focus-visible,
.near-me-snap-btn:focus-visible {
  outline-color: var(--ledger-gold);
}

.near-me-panel {
  background-color: color-mix(in srgb, var(--color-parchment) 97%, transparent);
  color: var(--ledger-ink);
  border-color: var(--ledger-border);
  box-shadow:
    0 6px 24px rgb(17 30 71 / 18%),
    0 1px 3px rgb(22 19 15 / 8%);
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
  .near-me-close-btn {
    transition-duration: 0.01ms !important;
  }
}

.near-me-snap-btn {
  min-height: 24px;
}

/* Pinch-zoom covers phones, and the buttons would sit under the status banner. */
@media (max-width: 1023px) {
  :deep(.leaflet-control-zoom) {
    display: none;
  }
}

/* Touch: the close button and the sheet's snap handle are 44px targets. */
@media (pointer: coarse) {
  .near-me-close-btn {
    width: 44px;
    height: 44px;
  }

  .near-me-snap-btn {
    min-height: 44px;
  }
}
</style>
