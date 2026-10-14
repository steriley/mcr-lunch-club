<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[2600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="closeModal"
  >
    <div
      class="w-full max-w-md bg-[#fdfcf9] rounded-2xl border-2 border-[#8b1e22] shadow-2xl overflow-hidden font-sans flex flex-col max-h-[90vh]"
    >
      <!-- Header -->
      <div class="bg-[#8b1e22] text-white p-4 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xl">📋</span>
          <div>
            <h2 class="text-sm font-bold font-serif-header">Official Inspection Audit Log</h2>
            <p class="text-[11px] text-stone-200">Enforcing the Manifesto Two-Visit Standard</p>
          </div>
        </div>
        <button @click="closeModal" class="text-white/80 hover:text-white text-lg">✕</button>
      </div>

      <!-- Form -->
      <form @submit.prevent="saveInspection" class="p-5 overflow-y-auto space-y-3 text-xs text-[#1a1e24]">
        <!-- Venue -->
        <div>
          <label class="block font-semibold mb-1">Inspected Venue:</label>
          <select
            v-model="selectedVenueSlug"
            class="w-full bg-white border border-[#dcd6c8] rounded p-2 text-xs font-serif-header"
            required
          >
            <option v-for="v in venuesList" :key="v.slug" :value="v.slug">
              {{ v.name }} ({{ v.status }})
            </option>
          </select>
        </div>

        <!-- Date & Verdict -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold mb-1">Audit Date:</label>
            <input
              type="date"
              v-model="inspDate"
              class="w-full bg-white border border-[#dcd6c8] rounded p-2 text-xs font-mono"
              required
            />
          </div>

          <div>
            <label class="block font-semibold mb-1">Official Verdict:</label>
            <select
              v-model="verdict"
              :class="verdict === 'satisfactory' ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 'bg-rose-50 text-rose-900 border-rose-300'"
              class="w-full border rounded p-2 text-xs font-bold font-serif-header"
            >
              <option value="satisfactory">Satisfactory (Approved / Pass)</option>
              <option value="sub-par">Sub-par (Censure / Strike)</option>
            </select>
          </div>
        </div>

        <!-- Attendees -->
        <div>
          <label class="block font-semibold mb-1">Inspectors in Attendance:</label>
          <div class="flex flex-wrap gap-1.5 mb-1.5">
            <button
              v-for="person in defaultInspectors"
              :key="person"
              type="button"
              @click="toggleInspector(person)"
              :class="selectedInspectors.includes(person) ? 'bg-[#1a1e24] text-[#c59b27] border-[#c59b27]' : 'bg-stone-100 text-stone-700 border-stone-300'"
              class="px-2 py-0.5 rounded text-[11px] border font-serif-header"
            >
              {{ person }}
            </button>
          </div>
          <input
            type="text"
            v-model="customInspector"
            placeholder="Add additional attendee..."
            @keydown.enter.prevent="addCustomInspector"
            class="w-full bg-white border border-[#dcd6c8] rounded p-1.5 text-xs placeholder:text-stone-400"
          />
        </div>

        <!-- What was ordered -->
        <div>
          <label class="block font-semibold mb-1">What Was Consumed / Tested:</label>
          <input
            type="text"
            v-model="whatWasOrdered"
            placeholder="e.g. 2x Hot chicken sliders, voodoo fries, water"
            class="w-full bg-white border border-[#dcd6c8] rounded p-2 text-xs"
            required
          />
        </div>

        <!-- Notes -->
        <div>
          <label class="block font-semibold mb-1">Tribunal Notes & Observations:</label>
          <textarea
            v-model="notes"
            rows="3"
            placeholder="Portion sizing, temperature compliance, queue velocity, dignity factor..."
            class="w-full bg-white border border-[#dcd6c8] rounded p-2 text-xs"
          ></textarea>
        </div>

        <!-- Submit Button -->
        <div class="pt-2">
          <button
            type="submit"
            class="w-full bg-[#8b1e22] hover:bg-[#70161a] text-white py-2.5 px-4 rounded-lg font-serif-header font-bold text-xs shadow transition-colors cursor-pointer"
          >
            Affix Seal & Log Inspection to Ledger
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useStore } from '@nanostores/vue';
import {
  $isInspectionModalOpen,
  $inspectionTargetVenue,
  closeInspectionModal,
} from '@/stores/filters';
import { $venuesList, addInspection } from '@/stores/ledger';
import type { Inspection } from '@/types';

const isOpen = useStore($isInspectionModalOpen);
const targetVenue = useStore($inspectionTargetVenue);
const venuesList = useStore($venuesList);

const selectedVenueSlug = ref<string>('');
const inspDate = ref<string>(new Date().toISOString().split('T')[0]);
const verdict = ref<'satisfactory' | 'sub-par'>('satisfactory');
const selectedInspectors = ref<string[]>(['Chair Fletcher', 'Vice-Chair Sterling']);
const customInspector = ref<string>('');
const whatWasOrdered = ref<string>('');
const notes = ref<string>('');

const defaultInspectors = [
  'Chair Fletcher',
  'Vice-Chair Sterling',
  'Comptroller Davies',
  'Secretary Thorne',
  'Lord Higgins',
];

watch([targetVenue, isOpen], () => {
  if (targetVenue.value) {
    selectedVenueSlug.value = targetVenue.value.slug;
    whatWasOrdered.value = targetVenue.value.eatLikeUs || '';
  } else if (venuesList.value.length > 0 && !selectedVenueSlug.value) {
    selectedVenueSlug.value = venuesList.value[0].slug;
  }
});

function toggleInspector(name: string) {
  if (selectedInspectors.value.includes(name)) {
    selectedInspectors.value = selectedInspectors.value.filter((n) => n !== name);
  } else {
    selectedInspectors.value.push(name);
  }
}

function addCustomInspector() {
  if (customInspector.value.trim()) {
    selectedInspectors.value.push(customInspector.value.trim());
    customInspector.value = '';
  }
}

function closeModal() {
  closeInspectionModal();
}

function saveInspection() {
  const currentVenue = venuesList.value.find((v) => v.slug === selectedVenueSlug.value);
  if (!currentVenue) return;

  const newInspection: Inspection = {
    id: `insp-${selectedVenueSlug.value}-${Date.now()}`,
    venueSlug: selectedVenueSlug.value,
    venueName: currentVenue.name,
    date: inspDate.value,
    attendees: selectedInspectors.value.length > 0 ? selectedInspectors.value : ['Sole Inspector'],
    verdict: verdict.value,
    whatWasOrdered: whatWasOrdered.value,
    notes: notes.value,
  };

  addInspection(newInspection);
  closeModal();
}
</script>
