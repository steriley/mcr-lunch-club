<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-deep/60 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="closeModal"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="where-today-title"
      class="w-full max-w-lg bg-parchment rounded-2xl border border-hairline shadow-2xl overflow-hidden font-sans flex flex-col max-h-[90vh]"
    >
      <!-- Header -->
      <div class="bg-deep text-parchment-fixed px-5 py-4 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <Icon name="scales" class="icon-lg" />
          <div>
            <h2
              id="where-today-title"
              class="text-lg font-bold font-serif-header text-white leading-tight"
            >
              The Executive Decision Oracle
            </h2>
            <p class="text-xs text-ash mt-0.5">
              When office consensus fractures and the clock ticks towards 11:59
            </p>
          </div>
        </div>
        <button
          ref="closeButton"
          type="button"
          aria-label="Close"
          class="oracle-close"
          @click="closeModal"
        >
          <Icon name="close" class="icon-md" />
        </button>
      </div>

      <!-- Overdue Re-inspection Alert Nudge -->
      <div
        v-if="overdueVenues.length"
        class="bg-card border-b border-hairline px-5 py-3 text-xs text-ink flex items-start gap-2"
      >
        <Icon name="warning" class="icon-md shrink-0 text-ochre" />
        <div class="flex-1">
          <strong class="font-bold text-ochre">Overdue Sovereign Inspection Notice:</strong>
          <p class="text-xs font-sans text-stone-700 mt-0.5">
            <template v-for="(overdue, index) in overdueVenues" :key="overdue.venue.slug">
              <template v-if="index > 0"> and </template>
              <strong>{{ overdue.venue.name }}</strong> (last seen {{ overdue.lastSeen }})
            </template>
            {{ overdueVenues.length === 1 ? 'has' : 'have' }} languished without executive oversight
            for months. Prioritising {{ overdueVenues.length === 1 ? 'it' : 'them' }} satisfies your
            civic obligation.
          </p>
        </div>
      </div>

      <!-- Body / Form -->
      <div class="p-5 overflow-y-auto space-y-5 text-xs text-ink">
        <!-- 1. Available Time -->
        <div>
          <span class="oracle-label">1. How far will you walk?</span>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="time in timeOptions"
              :key="time.val"
              type="button"
              :aria-pressed="selectedTime === time.val"
              :class="['oracle-option', selectedTime === time.val && 'is-selected']"
              @click="selectedTime = time.val"
            >
              <div class="text-sm font-bold">{{ time.label }}</div>
              <div class="text-xs opacity-75 font-sans">{{ time.sub }}</div>
            </button>
          </div>
        </div>

        <!-- 2. Budget (Cost Key) -->
        <div>
          <span class="oracle-label">2. Budget</span>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              v-for="b in budgetOptions"
              :key="b.val"
              type="button"
              :aria-pressed="selectedBudget === b.val"
              :class="['oracle-option', selectedBudget === b.val && 'is-selected']"
              @click="selectedBudget = b.val"
            >
              <div class="text-sm font-bold">{{ b.label }}</div>
              <div class="text-xs opacity-75 font-sans">{{ b.sub }}</div>
            </button>
          </div>
        </div>

        <!-- Consultation Button -->
        <button type="button" :disabled="isRolling" class="oracle-cta" @click="consultOracle">
          <Icon name="dice" class="icon-md" :class="isRolling ? 'animate-spin' : ''" />
          <span>{{
            isRolling ? 'Consulting the Rolls of Manchester...' : 'Deliver the Uncontested Verdict'
          }}</span>
        </button>

        <!-- The Result Card: the whole card links to the venue's page -->
        <div v-if="pickedVenue" class="oracle-result animate-in zoom-in-95 duration-200">
          <div class="flex items-center justify-between border-b border-hairline pb-2 mb-3">
            <span class="oracle-label !mb-0">The Oracle Decrees</span>
            <span class="text-sm font-bold text-ochre">{{ pickedVenue.cost }}</span>
          </div>

          <div class="flex items-center gap-2">
            <h3 class="text-xl font-bold font-serif-header text-royal-ink leading-tight">
              <a
                class="oracle-result-link"
                :href="`/venues/${encodeURIComponent(pickedVenue.slug)}`"
                >{{ pickedVenue.name }}</a
              >
            </h3>
            <img
              v-if="pickedVenue.tier === 'approved'"
              src="/brand/approved-sticker-256.webp"
              width="256"
              height="256"
              alt="MCR Lunch Club Approved"
              class="w-6 h-6 object-contain inline-block shrink-0"
              title="Official MCR Lunch Club Approved Prize Winner"
            />
          </div>
          <div class="mt-2">
            <span
              class="venue-tier-badge"
              :style="{ '--tier-color': tierInfo(pickedVenue.tier).color }"
              >{{ tierInfo(pickedVenue.tier).label }}</span
            >
          </div>

          <div v-if="pickedWalk" class="bench-telemetry mt-3">
            <a
              v-if="pickedWalk.url"
              class="bench-walk is-link"
              :href="pickedWalk.url"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`Walking directions to ${pickedVenue.name}`"
            >
              <Icon name="directions_walk" />
              {{ pickedWalk.label }}
            </a>
            <span v-else class="bench-walk">
              <Icon name="directions_walk" />
              {{ pickedWalk.label }}
            </span>
          </div>
        </div>

        <p v-else-if="hasRolled" class="text-center text-sm text-stone-600 italic">
          The Oracle has nothing to name. No venue is on the ledger for it to choose from yet.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from '@/components/Icon.vue';
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useStore } from '@nanostores/vue';
import { $isWhereTodayOpen, closeWhereToday } from '@/stores/filters';
import { $venuesList } from '@/stores/ledger';
import { formatDate } from '@/lib/dates';
import { getWalkingDirectionsUrl } from '@/lib/map/directions';
import { oraclePool, type OracleBudget } from '@/lib/oracle';
import type { PublicVenue } from '@/lib/public-data';
import { toCard } from '@/lib/sovereign-bench';
import { tierInfo } from '@/lib/tiers';
import type { Venue } from '@/types';

const isOpen = useStore($isWhereTodayOpen);
const venuesList = useStore($venuesList);

// Starts on the full expedition (the longest walk), so the Oracle draws from the widest field.
const selectedTime = ref<number>(25);
const selectedBudget = ref<OracleBudget>('any');
const isRolling = ref<boolean>(false);
const hasRolled = ref<boolean>(false);
const pickedVenue = ref<Venue | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);

// The same walk line the venue cards use: icon, time and distance from HQ, linking to directions.
const pickedWalk = computed(() => {
  const venue = pickedVenue.value;
  if (!venue) return null;
  const { walk } = toCard(
    { venue: { ...venue, image: venue.image ?? null, closed: false } as PublicVenue },
    []
  );
  if (walk === null) return null; // route pending: no walk row, as on the other cards
  return {
    label: walk.label,
    url:
      venue.lat != null && venue.lng != null ? getWalkingDirectionsUrl(venue.lat, venue.lng) : null,
  };
});

/** Approved venues not inspected for this long get a nudge. */
const OVERDUE_AFTER_DAYS = 120;

const overdueVenues = computed(() => {
  const cutoff = Date.now() - OVERDUE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  return venuesList.value
    .filter((venue) => venue.tier === 'approved')
    .map((venue) => ({ venue, inspected: Date.parse(venue.lastInspectionDate) }))
    .filter(({ inspected }) => !Number.isNaN(inspected) && inspected < cutoff)
    .sort((a, b) => a.inspected - b.inspected)
    .slice(0, 2)
    .map(({ venue }) => ({ venue, lastSeen: formatDate(venue.lastInspectionDate) }));
});

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeModal();
}

watch(isOpen, async (open) => {
  if (typeof window === 'undefined') return;
  if (open) {
    window.addEventListener('keydown', onKeydown);
    await nextTick();
    closeButton.value?.focus();
  } else {
    window.removeEventListener('keydown', onKeydown);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown);
});

const timeOptions = [
  { val: 10, label: '≤ 10 mins', sub: 'Urgent meeting at 13:00' },
  { val: 15, label: '≤ 15 mins', sub: 'Standard civil lunch' },
  { val: 25, label: '≤ 25 mins', sub: 'Full expedition to NQ' },
];

const budgetOptions: { val: OracleBudget; label: string; sub: string }[] = [
  { val: 'any', label: 'Any Cost', sub: 'Whatever it takes' },
  { val: '£', label: '£', sub: 'Under £10' },
  { val: '££', label: '££', sub: 'Above £10' },
  { val: '£££', label: '£££', sub: 'Payday treat' },
];

function closeModal() {
  closeWhereToday();
  pickedVenue.value = null;
  hasRolled.value = false;
  if (window.location.hash === '#where-to-today') {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

function consultOracle() {
  isRolling.value = true;
  pickedVenue.value = null;

  setTimeout(() => {
    const pool = oraclePool(venuesList.value, selectedTime.value, selectedBudget.value);
    pickedVenue.value = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    isRolling.value = false;
    hasRolled.value = true;
  }, 450);
}
</script>

<style>
.oracle-label {
  display: block;
  margin-bottom: 8px;
  color: var(--color-ochre);
  font:
    700 11px/1.35 'Plus Jakarta Sans',
    'Plus Jakarta Sans Fallback',
    sans-serif;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.oracle-close {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 999px;
  color: var(--color-ash);
  font-size: 16px;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.oracle-close:hover,
.oracle-close:focus-visible {
  background: rgb(255 255 255 / 12%);
  color: var(--color-white);
}

.oracle-close:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 1px;
}

.oracle-option {
  padding: 8px 6px;
  border: 1px solid var(--color-hairline);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-muted);
  text-align: center;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    border-color 140ms ease,
    color 140ms ease;
}

.oracle-option:hover:not(.is-selected) {
  border-color: var(--color-navy);
  color: var(--color-ink);
}

.oracle-option.is-selected {
  border-color: var(--color-deep);
  background: var(--color-deep);
  color: var(--color-parchment-fixed);
  box-shadow: 0 1px 3px rgb(17 30 71 / 35%);
}

.oracle-option:focus-visible,
.oracle-cta:focus-visible {
  outline: 2px solid var(--color-navy);
  outline-offset: 2px;
}

.oracle-cta {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--color-deep);
  color: var(--color-parchment-fixed);
  font:
    700 14px/1.3 'Plus Jakarta Sans',
    'Plus Jakarta Sans Fallback',
    sans-serif;
  box-shadow: 0 2px 6px rgb(17 30 71 / 30%);
  cursor: pointer;
  transition:
    background-color 140ms ease,
    transform 100ms ease;
}

.oracle-cta:hover:not(:disabled) {
  background: var(--color-navy-fixed);
}

.oracle-cta:active:not(:disabled) {
  transform: scale(0.99);
}

.oracle-cta:disabled {
  cursor: progress;
  opacity: 0.85;
}

/* The result card: the venue name is a stretched link, so the whole card opens the dossier. */
.oracle-result {
  position: relative;
  padding: 16px;
  border: 1px solid var(--color-hairline);
  border-radius: 12px;
  background: var(--color-surface);
  box-shadow: 0 4px 10px rgb(22 19 15 / 8%);
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease;
}

.oracle-result:hover {
  border-color: var(--color-navy);
  box-shadow: 0 6px 14px rgb(22 19 15 / 12%);
}

.oracle-result-link {
  color: inherit;
  text-decoration: none;
}

.oracle-result-link::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 12px;
}

.oracle-result-link:focus-visible {
  outline: none;
}

.oracle-result-link:focus-visible::after {
  outline: 2px solid var(--color-navy);
  outline-offset: 2px;
}

/* Touch: the close button keeps its 32px circle; a transparent extension makes the target 44px. */
@media (pointer: coarse) {
  .oracle-close {
    position: relative;
  }

  .oracle-close::before {
    content: '';
    position: absolute;
    left: -6px;
    top: -6px;
    width: 44px;
    height: 44px;
  }
}
</style>
