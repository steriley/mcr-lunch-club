<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[2500] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="closeModal"
  >
    <div
      class="w-full max-w-lg bg-[#fdfcf9] rounded-2xl border-2 border-[#c59b27] shadow-2xl overflow-hidden font-sans flex flex-col max-h-[90vh]"
    >
      <!-- Header -->
      <div class="bg-[#1a1e24] text-[#f9f7f1] p-4 border-b border-[#c59b27]/40 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-2xl">⚖️</span>
          <div>
            <h2 class="text-base font-bold font-serif-header text-[#c59b27]">
              The 12:25 Executive Decision Oracle
            </h2>
            <p class="text-[11px] text-stone-300">
              When office consensus fractures and the clock ticks towards 12:30
            </p>
          </div>
        </div>
        <button @click="closeModal" class="text-stone-400 hover:text-white p-1 text-lg">
          ✕
        </button>
      </div>

      <!-- Overdue Re-inspection Alert Nudge -->
      <div class="bg-amber-100/90 border-b border-amber-300 p-3 text-xs text-amber-950 flex items-start gap-2 font-serif-header">
        <span class="text-base">⚠️</span>
        <div class="flex-1">
          <strong class="font-bold">Overdue Sovereign Inspection Notice:</strong>
          <p class="text-[11px] font-sans text-amber-900 mt-0.5">
            <strong>Kabana</strong> (last seen Jan 2026) and <strong>Lottie’s Bakehouse</strong> (Feb 2026) have languished without executive oversight for months. Prioritising them satisfies your civic obligation.
          </p>
        </div>
      </div>

      <!-- Body / Form -->
      <div class="p-5 overflow-y-auto space-y-4 text-xs text-[#1a1e24]">
        <!-- 1. Available Time -->
        <div>
          <label class="block font-serif-header font-bold text-sm text-[#1a1e24] mb-1.5">
            1. Temporal Allowance (Max Walk Time):
          </label>
          <div class="grid grid-cols-3 gap-2 font-serif-header">
            <button
              v-for="time in timeOptions"
              :key="time.val"
              @click="selectedTime = time.val"
              :class="selectedTime === time.val ? 'bg-[#8b1e22] text-white font-bold border-[#8b1e22]' : 'bg-white text-stone-700 hover:bg-stone-50 border-[#dcd6c8]'"
              class="p-2 rounded-lg border text-center transition-colors shadow-xs"
            >
              <div class="text-xs">{{ time.label }}</div>
              <div class="text-[10px] opacity-75 font-sans">{{ time.sub }}</div>
            </button>
          </div>
        </div>

        <!-- 2. Budget -->
        <div>
          <label class="block font-serif-header font-bold text-sm text-[#1a1e24] mb-1.5">
            2. Treasury Impact (Budget):
          </label>
          <div class="grid grid-cols-3 gap-2 font-mono">
            <button
              v-for="b in budgetOptions"
              :key="b.val"
              @click="selectedBudget = b.val"
              :class="selectedBudget === b.val ? 'bg-[#1a1e24] text-[#c59b27] font-bold border-[#c59b27]' : 'bg-white text-stone-700 hover:bg-stone-50 border-[#dcd6c8]'"
              class="p-2 rounded-lg border text-center transition-colors shadow-xs font-serif-header"
            >
              <div class="text-xs font-mono font-bold">{{ b.label }}</div>
              <div class="text-[10px] opacity-75 font-sans">{{ b.sub }}</div>
            </button>
          </div>
        </div>

        <!-- 3. Culinary Mood / Craving -->
        <div>
          <label class="block font-serif-header font-bold text-sm text-[#1a1e24] mb-1.5">
            3. Constitutional Craving (Mood):
          </label>
          <div class="grid grid-cols-2 gap-2 font-serif-header">
            <button
              v-for="m in moodOptions"
              :key="m.val"
              @click="selectedMood = m.val"
              :class="selectedMood === m.val ? 'bg-[#c59b27] text-[#1a1e24] font-bold border-[#c59b27]' : 'bg-white text-stone-700 hover:bg-stone-50 border-[#dcd6c8]'"
              class="p-2 rounded-lg border text-left transition-colors shadow-xs flex items-center gap-2"
            >
              <span class="text-base">{{ m.icon }}</span>
              <span class="text-xs">{{ m.label }}</span>
            </button>
          </div>
        </div>

        <!-- Consultation Button -->
        <div class="pt-2">
          <button
            @click="consultOracle"
            :disabled="isRolling"
            class="w-full bg-[#8b1e22] hover:bg-[#70161a] active:scale-[0.99] text-white py-3 px-4 rounded-xl font-serif-header font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span class="text-lg" :class="isRolling ? 'animate-spin' : ''">🎲</span>
            <span>{{ isRolling ? "Consulting the Rolls of Manchester..." : "Deliver the Uncontested Verdict" }}</span>
          </button>
        </div>

        <!-- The Result Card -->
        <div
          v-if="pickedVenue"
          class="mt-4 p-4 rounded-xl border-2 border-[#c59b27] bg-[#fdfcf9] shadow-lg animate-in zoom-in-95 duration-200"
        >
          <div class="flex items-center justify-between border-b border-[#dcd6c8] pb-2 mb-2">
            <span class="text-[10px] font-bold uppercase tracking-wider bg-[#8b1e22] text-white px-2 py-0.5 rounded font-mono">
              The Oracle Decrees (Rank #{{ pickedVenue.rank }})
            </span>
            <span class="text-xs font-mono font-bold text-[#8b1e22]">{{ pickedVenue.cost }}</span>
          </div>

          <h3 class="text-xl font-bold font-serif-header text-[#1a1e24]">
            {{ pickedVenue.name }}
          </h3>
          <p class="text-xs text-stone-600 font-sans mt-0.5">
            {{ pickedVenue.cuisine }} &bull; {{ pickedVenue.walkingTimeMin }} mins walk ({{ pickedVenue.distanceMiles }} mi)
          </p>

          <div class="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs">
            <strong class="text-[#8b1e22] font-serif-header block">Eat Like Us Order:</strong>
            <p class="italic text-stone-800 mt-1">“{{ pickedVenue.eatLikeUs }}”</p>
          </div>

          <div class="mt-3 flex items-center gap-2">
            <button
              @click="openDetails(pickedVenue)"
              class="flex-1 bg-[#1a1e24] hover:bg-stone-800 text-white py-2 px-3 rounded-lg text-xs font-semibold font-serif-header text-center"
            >
              Examine Full Ledger Dossier
            </button>
            <a
              :href="pickedVenue.mapSearchLink"
              target="_blank"
              class="flex-1 bg-white hover:bg-stone-50 text-stone-900 border border-stone-300 py-2 px-3 rounded-lg text-xs font-semibold text-center"
            >
              Depart Immediately 🧭
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useStore } from '@nanostores/vue';
import { $isWhereTodayOpen, closeWhereToday, selectVenue } from '@/stores/filters';
import { $venuesList } from '@/stores/ledger';
import type { Venue } from '@/types';

const isOpen = useStore($isWhereTodayOpen);
const venuesList = useStore($venuesList);

const selectedTime = ref<number>(15);
const selectedBudget = ref<string>('any');
const selectedMood = ref<string>('any');
const isRolling = ref<boolean>(false);
const pickedVenue = ref<Venue | null>(null);

const timeOptions = [
  { val: 10, label: '≤ 10 mins', sub: 'Urgent meeting at 13:00' },
  { val: 15, label: '≤ 15 mins', sub: 'Standard civil lunch' },
  { val: 25, label: '≤ 25 mins', sub: 'Full expedition to NQ' },
];

const budgetOptions = [
  { val: 'any', label: 'Any Cost', sub: 'Whatever it takes' },
  { val: '£', label: '£ (Modest)', sub: 'Pre-payday economy' },
  { val: '££', label: '££ / £££', sub: 'Comfort or Splurge' },
];

const moodOptions = [
  { val: 'any', label: 'Any Sovereign Dish', icon: '✨' },
  { val: 'rice', label: 'Curry / Rice \'n\' Three', icon: '🍛' },
  { val: 'pizza', label: 'Pizza & Pan Slices', icon: '🍕' },
  { val: 'fried', label: 'Fried Chicken / Wings', icon: '🍗' },
  { val: 'sub', label: 'Gourmet Subs & Toasties', icon: '🥪' },
  { val: 'asian', label: 'Ramen / Cantonese BBQ', icon: '🍜' },
];

function closeModal() {
  closeWhereToday();
  pickedVenue.value = null;
}

function consultOracle() {
  isRolling.value = true;
  pickedVenue.value = null;

  setTimeout(() => {
    // Filter approved venues based on selected criteria
    const approved = venuesList.value.filter((v) => v.status === 'Approved');
    let pool = approved.filter((v) => v.walkingTimeMin <= selectedTime.value);

    if (selectedBudget.value === '£') {
      pool = pool.filter((v) => v.cost === '£');
    } else if (selectedBudget.value === '££') {
      pool = pool.filter((v) => v.cost === '££' || v.cost === '£££');
    }

    if (selectedMood.value === 'rice') {
      pool = pool.filter((v) => v.cuisine.toLowerCase().includes('rice') || v.cuisine.toLowerCase().includes('curry'));
    } else if (selectedMood.value === 'pizza') {
      pool = pool.filter((v) => v.cuisine.toLowerCase().includes('pizza'));
    } else if (selectedMood.value === 'fried') {
      pool = pool.filter((v) => v.cuisine.toLowerCase().includes('chicken') || v.cuisine.toLowerCase().includes('wing'));
    } else if (selectedMood.value === 'sub') {
      pool = pool.filter((v) => v.cuisine.toLowerCase().includes('sub') || v.cuisine.toLowerCase().includes('cheese') || v.cuisine.toLowerCase().includes('deli'));
    } else if (selectedMood.value === 'asian') {
      pool = pool.filter((v) => v.cuisine.toLowerCase().includes('ramen') || v.cuisine.toLowerCase().includes('cantonese') || v.cuisine.toLowerCase().includes('noodles'));
    }

    if (pool.length === 0) {
      // Fallback to all approved venues within walk time
      pool = approved.filter((v) => v.walkingTimeMin <= selectedTime.value);
    }
    if (pool.length === 0) {
      pool = approved;
    }

    // Pick random
    const randomIndex = Math.floor(Math.random() * pool.length);
    pickedVenue.value = pool[randomIndex];
    isRolling.value = false;
  }, 450);
}

function openDetails(venue: Venue) {
  closeModal();
  selectVenue(venue);
}
</script>
