<template>
  <div
    v-if="venue"
    class="fixed inset-0 z-[2000] flex items-end md:items-center justify-center p-0 md:p-6 bg-black/40 backdrop-blur-xs transition-opacity"
    @click.self="closeSheet"
  >
    <div
      class="w-full md:max-w-xl max-h-[90vh] flex flex-col bg-[#fdfcf9] rounded-t-2xl md:rounded-2xl border border-[#dcd6c8] shadow-2xl overflow-hidden font-sans animate-in slide-in-from-bottom-6 duration-200"
    >
      <!-- Header Bar / Manifesto Status Banner -->
      <div
        :class="statusBannerStyle.bg"
        class="p-4 border-b text-white flex items-center justify-between transition-colors"
      >
        <div class="flex items-center gap-2.5">
          <img
            v-if="venue.status === 'Approved'"
            src="/brand/approved-sticker.png"
            alt="MCR Lunch Club Approved"
            class="w-9 h-9 object-contain drop-shadow shrink-0"
          />
          <span v-else class="text-xl">{{ statusBannerStyle.icon }}</span>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs uppercase tracking-widest font-bold font-serif-header">
                {{ venue.status }}
              </span>
              <span v-if="venue.rank && venue.status === 'Approved'" class="bg-[#c59b27] text-[#1a1e24] px-1.5 py-0.2 rounded text-[10px] font-mono font-bold">
                Rank #{{ venue.rank }}
              </span>
            </div>
            <p class="text-xs text-stone-200 italic font-serif-header">
              “{{ statusBannerStyle.quote }}”
            </p>
          </div>
        </div>

        <button
          @click="closeSheet"
          class="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors text-lg"
        >
          ✕
        </button>
      </div>

      <!-- Main Body (Scrollable) -->
      <div class="p-5 overflow-y-auto space-y-4 text-[#1a1e24]">
        <!-- Approved Prize Award Callout -->
        <div v-if="venue.status === 'Approved'" class="bg-[#1a1e24] text-[#f9f7f1] border border-[#c59b27] p-3 rounded-xl flex items-center gap-3 shadow-xs">
          <img
            src="/brand/approved-sticker.png"
            alt="Official Approved Sticker"
            class="w-11 h-11 object-contain drop-shadow shrink-0"
          />
          <div class="text-xs">
            <span class="text-[10px] font-mono font-bold text-[#c59b27] uppercase tracking-wider block">
              Official Prize &bull; Manchester’s Lunch Star
            </span>
            <span class="text-stone-200 font-serif-header">
              Awarded the official MCR Lunch Club Approved physical sticker by the Chairs.
            </span>
          </div>
        </div>

        <!-- Title & Badges -->
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-2xl font-bold font-serif-header text-[#1a1e24] leading-tight">
              {{ venue.name }}
            </h2>
            <p class="text-xs text-stone-600 mt-1 flex items-center gap-2 font-mono">
              <span>📍 {{ venue.address || 'Central Manchester' }}</span>
            </p>
          </div>

          <div class="flex flex-col items-end">
            <span class="text-lg font-mono font-bold text-[#8b1e22] bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
              {{ venue.cost }}
            </span>
            <span class="text-[11px] text-stone-500 font-serif-header mt-1">
              {{ venue.cost === '£' ? 'Under £10' : venue.cost === '££' ? 'Above £10' : 'Payday Treat' }}
            </span>
          </div>
        </div>

        <!-- Distance & Walking Time Pill Bar -->
        <div class="grid grid-cols-2 gap-2 bg-[#f4efe4] p-3 rounded-lg border border-[#dcd6c8] text-center font-serif-header">
          <div>
            <span class="text-[11px] text-stone-600 uppercase tracking-wide block">Foot Journey</span>
            <span class="text-base font-bold text-[#8b1e22]">{{ venue.walkingTimeMin }} mins</span>
            <span class="text-[10px] text-stone-500 block font-sans">from Spinningfields Base</span>
          </div>
          <div class="border-l border-[#dcd6c8]">
            <span class="text-[11px] text-stone-600 uppercase tracking-wide block">Displacement</span>
            <span class="text-base font-bold text-stone-900">{{ venue.distanceMiles }} miles</span>
            <span class="text-[10px] text-stone-500 block font-sans">within 2.5 mi limit</span>
          </div>
        </div>

        <!-- "Eat Like Us" - Official Chairs' Recommendation -->
        <div class="bg-amber-50/80 border-l-4 border-[#c59b27] p-3.5 rounded-r-lg shadow-xs">
          <div class="flex items-center gap-1.5 text-xs font-bold text-[#8b1e22] uppercase tracking-wide font-serif-header">
            <span>🛡</span>
            <span>Eat Like Us — The Chairs’ Prescribed Order</span>
          </div>
          <p class="text-sm text-stone-900 font-serif-header italic mt-1.5 leading-relaxed">
            “{{ venue.eatLikeUs }}”
          </p>
        </div>

        <!-- Rejection / Caution Note if applicable -->
        <div v-if="venue.rejectionReason" class="bg-rose-50 border border-rose-200 p-3 rounded-lg text-xs text-rose-900">
          <strong class="font-serif-header block text-rose-950">⚠️ Decreed Deficiency / Caution:</strong>
          <p class="mt-0.5 italic">{{ venue.rejectionReason }}</p>
        </div>

        <!-- Notes / Field Observations -->
        <div v-if="venue.notes" class="text-xs text-stone-700 bg-stone-50 p-3 rounded-md border border-stone-200">
          <strong class="font-serif-header text-stone-900">Chairs’ Field Observations:</strong>
          <p class="mt-1 leading-normal">{{ venue.notes }}</p>
        </div>

        <!-- Inspection History (Log) -->
        <div class="border-t border-[#dcd6c8] pt-3">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-bold font-serif-header text-[#1a1e24] flex items-center gap-1.5">
              <span>📋</span>
              <span>Official Inspection Ledger</span>
              <span class="text-[11px] text-stone-500 font-normal">({{ venueInspections.length }} audits)</span>
            </h3>

            <button
              @click="onLogInspectionClick"
              class="text-xs font-serif-header font-bold text-[#8b1e22] hover:underline"
            >
              + Log New Audit
            </button>
          </div>

          <div v-if="venueInspections.length === 0" class="text-xs text-stone-500 italic p-3 bg-stone-50 rounded text-center">
            No formal inspections recorded in the ledger yet. Awaiting initial tribunal.
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="insp in venueInspections"
              :key="insp.id"
              class="p-2.5 rounded bg-white border border-[#dcd6c8] text-xs shadow-xs"
            >
              <div class="flex items-center justify-between text-[11px] border-b border-stone-100 pb-1 mb-1">
                <span class="font-mono text-stone-600">{{ insp.date }}</span>
                <span
                  :class="insp.verdict === 'satisfactory' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'"
                  class="px-1.5 py-0.2 rounded font-bold uppercase text-[9px]"
                >
                  {{ insp.verdict }}
                </span>
              </div>
              <div class="text-[11px] text-stone-800">
                <span class="font-bold">Inspectors:</span> {{ insp.attendees.join(', ') }}
              </div>
              <div class="text-[11px] text-stone-700 mt-0.5">
                <span class="font-bold">Ordered:</span> {{ insp.whatWasOrdered }}
              </div>
              <p v-if="insp.notes" class="text-stone-600 italic mt-1 font-serif-header">
                “{{ insp.notes }}”
              </p>
            </div>
          </div>
        </div>

        <!-- Chairs' Executive Authority Section (Visible when Chairs' Mode is ON) -->
        <div v-if="isChairsMode" class="border-t-2 border-dashed border-[#c59b27] pt-3 mt-4 bg-amber-50/50 p-3 rounded-lg">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold font-serif-header text-[#8b1e22] uppercase tracking-wide">
              🏛 Executive Tier Reclassification
            </span>
            <span class="text-[10px] bg-[#c59b27] text-[#1a1e24] px-1.5 py-0.5 rounded font-bold">Chairs Only</span>
          </div>

          <div class="space-y-2 text-xs">
            <div>
              <label class="block text-stone-700 font-semibold mb-1">Target Status:</label>
              <select v-model="targetTier" class="w-full bg-white border border-stone-300 rounded p-1.5 font-serif-header">
                <option value="Approved">Approved (The Pantheon)</option>
                <option value="Under Consideration">Under Consideration (Purgatory)</option>
                <option value="To Be Assessed">To Be Assessed (Antechamber)</option>
                <option value="If We Must">If We Must (Despair)</option>
                <option value="Rejected">Rejected (Outer Darkness)</option>
                <option value="Gone But Not Forgotten">Gone But Not Forgotten (In Memoriam)</option>
              </select>
            </div>

            <div>
              <label class="block text-stone-700 font-semibold mb-1">Mandatory Solemn Reason for Decree:</label>
              <textarea
                v-model="reclassificationReason"
                rows="2"
                placeholder="State the formal rationale for this promotion/demotion..."
                class="w-full bg-white border border-stone-300 rounded p-1.5 text-xs outline-none"
              ></textarea>
            </div>

            <button
              @click="submitReclassification"
              class="w-full bg-[#1a1e24] hover:bg-[#8b1e22] text-[#f9f7f1] py-1.5 px-3 rounded font-serif-header font-bold transition-colors"
            >
              Enact Sovereign Decree
            </button>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="p-4 bg-[#f4efe4] border-t border-[#dcd6c8] flex flex-wrap items-center justify-between gap-2">
        <a
          :href="venue.mapSearchLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name + ' Manchester')}`"
          target="_blank"
          rel="noopener noreferrer"
          class="flex-1 bg-white hover:bg-stone-100 text-stone-900 border border-[#dcd6c8] py-2 px-3 rounded-md text-xs font-semibold text-center shadow-xs flex items-center justify-center gap-1.5"
        >
          <span>🧭</span>
          <span>Google Maps Directions</span>
        </a>

        <a
          :href="`/venues/${venue.slug}`"
          class="flex-1 bg-[#8b1e22] hover:bg-[#70161a] text-white py-2 px-3 rounded-md text-xs font-serif-header font-bold text-center shadow flex items-center justify-center gap-1.5"
        >
          <span>📜</span>
          <span>Full Stamped Dossier</span>
        </a>

        <button
          @click="copyShareLink"
          class="p-2 text-stone-600 hover:text-stone-900 bg-white border border-[#dcd6c8] rounded-md shadow-xs text-xs font-semibold"
          title="Copy Link for Lunch Chat"
        >
          {{ copied ? "✓ Link Copied!" : "🔗 Share" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useStore } from '@nanostores/vue';
import { $activeVenue, selectVenue, openInspectionModal, $isChairsMode } from '@/stores/filters';
import { $inspectionsList, changeVenueTier } from '@/stores/ledger';
import type { TierStatus } from '@/types';

const venue = useStore($activeVenue);
const inspectionsList = useStore($inspectionsList);
const isChairsMode = useStore($isChairsMode);

const copied = ref(false);
const targetTier = ref<TierStatus>('Approved');
const reclassificationReason = ref('');

const statusBannerStyle = computed(() => {
  const s = venue.value?.status;
  switch (s) {
    case 'Approved':
      return {
        bg: 'bg-[#8b1e22]',
        icon: '🏆',
        quote: 'The Highest Honour in Manchester Lunching: The Right to be Returned To',
      };
    case 'Under Consideration':
      return {
        bg: 'bg-[#d97706]',
        icon: '⏳',
        quote: 'The Waiting Chamber of Judgement — Pending further evidence and appetite',
      };
    case 'To Be Assessed':
      return {
        bg: 'bg-[#2563eb]',
        icon: '📜',
        quote: 'Entered the Field of Vision — Fate remains undecided pending inspection',
      };
    case 'If We Must':
      return {
        bg: 'bg-[#854d0e]',
        icon: '🌧',
        quote: 'Not Celebrated, But Tolerated — Acceptable only when circumstance forces our hand',
      };
    case 'Rejected':
      return {
        bg: 'bg-[#374151]',
        icon: '⛔',
        quote: 'Removed from the Sacred Lunch Rotation — Returnable only through exceptional redemption',
      };
    case 'Gone But Not Forgotten':
      return {
        bg: 'bg-[#78716c]',
        icon: '🕊',
        quote: 'Doors Closed, But Legend Remains in the Lunching Annals',
      };
    default:
      return {
        bg: 'bg-stone-800',
        icon: '🏛',
        quote: 'Official Ledger of the Manchester Lunch Club',
      };
  }
});

const venueInspections = computed(() => {
  if (!venue.value) return [];
  return inspectionsList.value.filter((i) => i.venueSlug === venue.value?.slug);
});

function closeSheet() {
  selectVenue(null);
}

function onLogInspectionClick() {
  if (venue.value) {
    openInspectionModal(venue.value);
  }
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

function submitReclassification() {
  if (!venue.value) return;
  if (!reclassificationReason.value.trim()) {
    alert('The Chairs require an explicit solemn reason for any status decree.');
    return;
  }
  const success = changeVenueTier(venue.value.slug, targetTier.value, reclassificationReason.value);
  if (success) {
    reclassificationReason.value = '';
    // update current active venue reference
    venue.value.status = targetTier.value;
  }
}
</script>
