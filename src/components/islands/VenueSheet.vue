<template>
  <div
    v-if="venue"
    class="fixed inset-0 z-[10010] flex items-end md:items-center justify-center p-0 md:p-6 bg-black/40 backdrop-blur-xs transition-opacity"
    @click.self="closeSheet"
  >
    <div
      ref="dialogRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="venue-sheet-title"
      tabindex="-1"
      class="w-full md:max-w-xl max-h-[90vh] flex flex-col outline-none bg-card rounded-t-2xl md:rounded-2xl border border-hairline shadow-2xl overflow-hidden font-sans animate-in slide-in-from-bottom-6 duration-200"
    >
      <!-- Header Bar / Manifesto Status Banner -->
      <div
        :class="tier?.bannerClass"
        class="tier-header-gradient p-4 border-b text-white flex items-center justify-between transition-colors"
      >
        <div class="flex items-center gap-2.5">
          <img
            v-if="venue.tier === 'approved'"
            src="/brand/approved-sticker-256.webp" width="256" height="256"
            alt="MCR Lunch Club Approved"
            class="w-9 h-9 object-contain drop-shadow shrink-0"
          />
          <span v-else class="text-xl">{{ tier?.icon }}</span>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs uppercase tracking-widest font-bold font-serif-header">
                {{ tier?.label }}
              </span>
            </div>
            <p class="text-xs text-stone-200 italic font-serif-header">
              “{{ tier?.quote }}”
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label="Close"
          @click="closeSheet"
          class="text-white/80 hover:text-white p-1 rounded-full hover:bg-surface/10 transition-colors text-lg"
        >
          ✕
        </button>
      </div>

      <!-- Main Body (Scrollable) -->
      <div class="p-5 overflow-y-auto space-y-4 text-ink">
        <img
          v-if="venue.image"
          :src="venue.image.thumbUrl"
          :alt="venue.image.alt"
          width="640"
          height="427"
          :style="{ objectPosition: focalStyle(venue.image) }"
          loading="lazy"
          decoding="async"
          @error="($event.target as HTMLElement).style.display = 'none'"
          class="aspect-[3/2] max-h-56 h-auto w-full rounded-xl border border-hairline object-cover"
        />
        <!-- Approved Prize Award Callout -->
        <div v-if="venue.tier === 'approved'" class="bg-deep text-parchment-fixed border border-gold p-3 rounded-xl flex items-center gap-3 shadow-xs">
          <img
            src="/brand/approved-sticker-256.webp" width="256" height="256"
            alt="Official Approved Sticker"
            class="w-11 h-11 object-contain drop-shadow shrink-0"
          />
          <div class="text-xs">
            <span class="text-xs font-sans tabular-nums font-bold text-gold uppercase tracking-wider block">
              Official Prize &bull; Manchester’s Lunch Star
            </span>
            <span class="text-base text-stone-200 font-serif-header">
              Awarded the official MCR Lunch Club Approved physical sticker by the Chairs.
            </span>
          </div>
        </div>

        <!-- Title & Badges -->
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 id="venue-sheet-title" class="text-2xl font-bold font-serif-header text-ink leading-tight">
              {{ venue.name }}
            </h2>
            <p class="text-xs text-stone-600 mt-1 flex items-center gap-2 font-sans tabular-nums">
              <span>📍 {{ venue.address || 'Central Manchester' }}</span>
            </p>
          </div>

          <div class="flex flex-col items-end">
            <span class="text-lg font-sans tabular-nums font-bold text-navy bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
              {{ venue.cost }}
            </span>
            <span class="text-xs text-stone-500 font-serif-header mt-1">
              {{ COST_LABELS[venue.cost] }}
            </span>
          </div>
        </div>

        <!-- Distance & Walking Time Pill Bar -->
        <div class="grid grid-cols-2 gap-2 bg-paper p-3 rounded-lg border border-hairline text-center font-serif-header">
          <div>
            <span class="text-xs text-stone-600 uppercase tracking-wide block">Walk</span>
            <span class="text-base font-bold text-navy">{{ walkText(venue.walkingTimeMin, 'mins') }}</span>
            <span class="text-xs text-stone-500 block font-sans">from Spinningfields Base</span>
          </div>
          <div class="border-l border-hairline">
            <span class="text-xs text-stone-600 uppercase tracking-wide block">Distance</span>
            <span class="text-base font-bold text-stone-900">{{ milesText(venue.distanceMiles) }}</span>
            <span class="text-xs text-stone-500 block font-sans">walking route</span>
          </div>
        </div>

        <!-- "Eat Like Us" - Official Chairs' Recommendation -->
        <div class="bg-amber-50/80 border-l-4 border-gold p-3.5 rounded-r-lg shadow-xs">
          <div class="flex items-center gap-1.5 text-xs font-bold text-navy uppercase tracking-wide font-serif-header">
            <span>🛡</span>
            <span>Eat Like Us — The Chairs’ Prescribed Order</span>
          </div>
          <p class="text-sm text-stone-900 font-serif-header italic mt-1.5 leading-relaxed">
            “{{ venue.eatLikeUs }}”
          </p>
        </div>

        <!-- Inspection History (Log) -->
        <div class="border-t border-hairline pt-3">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold font-serif-header text-ink flex items-center gap-1.5">
              <span>📋</span>
              <span>Official Inspection Ledger</span>
              <span class="text-xs text-stone-500 font-normal">({{ venueInspections.length }} {{ venueInspections.length === 1 ? 'inspection' : 'inspections' }})</span>
            </h3>
          </div>

          <div v-if="venueInspections.length === 0" class="text-base text-stone-500 italic p-3 bg-stone-50 rounded text-center">
            No inspections on record yet. Awaiting the first dual-Chair visit.
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="insp in venueInspections"
              :key="insp.id"
              class="p-2.5 rounded bg-surface border border-hairline text-xs shadow-xs"
            >
              <div class="flex items-center justify-between text-xs border-b border-stone-100 pb-1 mb-1">
                <span class="font-sans tabular-nums text-stone-600">{{ formatDate(insp.date) }}</span>
                <div class="flex items-center gap-1">
                  <span
                    v-if="insp.outcome"
                    :class="INSPECTION_OUTCOME_BADGE_CLASSES[insp.outcome]"
                    class="px-1.5 py-0.2 rounded border font-bold uppercase text-xs"
                  >
                    {{ INSPECTION_OUTCOME_LABELS[insp.outcome] }}
                  </span>
                  <span
                    :class="insp.kind === 'verified' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-600'"
                    class="px-1.5 py-0.2 rounded font-bold uppercase text-xs"
                  >
                    {{ INSPECTION_KIND_LABELS[insp.kind] }}
                  </span>
                </div>
              </div>
              <div class="text-base text-stone-800">{{ inspectionWitnesses(insp) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="p-4 bg-paper border-t border-hairline flex flex-wrap items-center justify-between gap-2">
        <a
          :href="directionsUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="flex-1 bg-surface hover:bg-stone-100 text-stone-900 border border-hairline py-2 px-3 rounded-md text-xs font-semibold text-center shadow-xs flex items-center justify-center gap-1.5"
        >
          <span>🧭</span>
          <span>Walking directions</span>
        </a>

        <a
          :href="`/venues/${venue.slug}`"
          class="flex-1 bg-navy-fixed hover:bg-deep text-white py-2 px-3 rounded-md text-xs font-serif-header font-bold text-center shadow flex items-center justify-center gap-1.5"
        >
          <span>📜</span>
          <span>Full dossier</span>
        </a>

        <button
          type="button"
          @click="copyShareLink"
          class="p-2 text-stone-600 hover:text-stone-900 bg-surface border border-hairline rounded-md shadow-xs text-xs font-semibold"
          title="Copy Link for Lunch Chat"
        >
          {{ copied ? "✓ Link Copied!" : "🔗 Share" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted, watch } from 'vue';
import { useStore } from '@nanostores/vue';
import { $activeVenue, selectVenue } from '@/stores/filters';
import { $inspectionsList } from '@/stores/ledger';
import { formatDate } from '@/lib/dates';
import { focalStyle } from '@/lib/image-upload';
import { INSPECTION_KIND_LABELS, INSPECTION_OUTCOME_BADGE_CLASSES, INSPECTION_OUTCOME_LABELS, inspectionWitnesses } from '@/lib/inspection-display';
import { COST_LABELS } from '@/lib/cost-display';
import { tierInfo } from '@/lib/tiers';
import { milesText, walkText } from '@/lib/route-display';
import { getWalkingDirectionsUrl } from '@/lib/map/directions';

const venue = useStore($activeVenue);
const inspectionsList = useStore($inspectionsList);

const copied = ref(false);
const dialogRef = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

const tier = computed(() => (venue.value ? tierInfo(venue.value.tier) : null));

// Walking directions when the venue is located, otherwise a map search for it.
const directionsUrl = computed(() => {
  const current = venue.value;
  if (!current) return '';
  if (current.lat != null && current.lng != null) return getWalkingDirectionsUrl(current.lat, current.lng);
  return current.mapSearchLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(current.name + ' Manchester')}`;
});

const venueInspections = computed(() => {
  if (!venue.value) return [];
  return inspectionsList.value.filter((i) => i.venueSlug === venue.value?.slug);
});

// Capture phase, so Esc closes this sheet before Near Me (underneath) sees it.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.stopPropagation();
  event.preventDefault();
  closeSheet();
}

watch(venue, async (current, previous) => {
  if (typeof window === 'undefined') return;
  if (current && !previous) {
    previouslyFocused = document.activeElement as HTMLElement | null;
    window.addEventListener('keydown', onKeydown, true);
    await nextTick();
    dialogRef.value?.focus();
  } else if (!current && previous) {
    window.removeEventListener('keydown', onKeydown, true);
    previouslyFocused?.focus?.();
    previouslyFocused = null;
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown, true);
});

function closeSheet() {
  selectVenue(null);
}

function copyShareLink() {
  if (!venue.value) return;
  const url = `${window.location.origin}/venues/${venue.value.slug}`;
  navigator.clipboard.writeText(url).then(() => {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  });
}
</script>
