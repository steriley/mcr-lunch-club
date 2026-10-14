<template>
  <div class="bg-[#f9f7f1] border-b border-[#dcd6c8] p-3 md:p-4 shadow-sm transition-all font-sans text-[#1a1e24]">
    <!-- Top Row: Title / Search / Quick Actions -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <!-- Search Input -->
      <div class="relative flex-1 max-w-md">
        <input
          type="text"
          v-model="searchQueryModel"
          placeholder="Search ledger (e.g. Bada Bing, Ramen, Slices)..."
          class="w-full pl-9 pr-8 py-2 text-xs md:text-sm bg-white rounded-md border border-[#dcd6c8] focus:border-[#8b1e22] focus:ring-1 focus:ring-[#8b1e22] outline-none shadow-inner placeholder:text-stone-400 font-serif-header"
        />
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 absolute left-3 top-2.5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.3-4.3"/>
        </svg>
        <button
          v-if="searchQueryModel"
          @click="searchQueryModel = ''"
          class="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-700 text-xs"
        >
          ✕
        </button>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center flex-wrap gap-2">
        <!-- 12:25 "Where to today?" helper -->
        <button
          @click="openWhereToday"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#8b1e22] hover:bg-[#70161a] text-white text-xs font-bold font-serif-header shadow transition-transform active:scale-95"
        >
          <span class="text-sm">🎲</span>
          <span>Where To Today?</span>
          <span class="bg-[#c59b27] text-[#1a1e24] px-1.5 py-0.2 rounded text-[10px] font-mono font-bold">12:25</span>
        </button>

        <!-- Member Suggestion Button -->
        <button
          @click="openSuggestModal"
          class="flex items-center gap-1 px-3 py-1.5 rounded-md bg-white hover:bg-stone-100 text-stone-800 border border-[#dcd6c8] text-xs font-semibold shadow-sm transition-colors"
        >
          <span>📜</span>
          <span>Suggest Venue</span>
        </button>

        <!-- Chairs' Mode Toggle Switch -->
        <button
          @click="toggleChairsMode"
          :class="isChairsMode ? 'bg-[#1a1e24] text-[#c59b27] border-[#c59b27]' : 'bg-stone-200 text-stone-600 border-stone-300'"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-serif-header font-bold shadow-sm transition-colors"
          title="Toggle Chairs' Executive Mode"
        >
          <span>🏛</span>
          <span>{{ isChairsMode ? "Chairs' Authority: ON" : "Member Mode" }}</span>
        </button>
      </div>
    </div>

    <!-- Second Row: Tier Filters -->
    <div class="mt-3 flex flex-wrap items-center gap-1.5 md:gap-2">
      <!-- Toggle All / Approved Only -->
      <button
        @click="toggleAllTiers"
        :class="filters.showAllTiers ? 'bg-[#1a1e24] text-[#f9f7f1] border-[#1a1e24]' : 'bg-[#8b1e22] text-[#f9f7f1] border-[#8b1e22]'"
        class="text-xs px-2.5 py-1 rounded-full border font-serif-header font-bold transition-colors shadow-xs"
      >
        {{ filters.showAllTiers ? "Show All Tiers" : "Approved Only (Default)" }}
      </button>

      <span class="h-4 w-px bg-stone-300 mx-1 hidden sm:inline-block"></span>

      <!-- Individual Tier Chips -->
      <button
        v-for="t in allTiers"
        :key="t.name"
        @click="toggleTier(t.name)"
        :class="[
          filters.tiers.includes(t.name)
            ? 'opacity-100 shadow-sm font-bold ring-1'
            : 'opacity-40 grayscale bg-white/50 text-stone-600',
          t.badgeClass
        ]"
        class="text-[11px] px-2.5 py-0.5 rounded-full border transition-all flex items-center gap-1.5"
      >
        <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: t.dotColor }"></span>
        <span>{{ t.name }}</span>
        <span class="text-[10px] opacity-75 font-mono">({{ getTierCount(t.name) }})</span>
      </button>
    </div>

    <!-- Third Row: Secondary Filters (Cost, Walk Time, Inspected Freshness, Cuisine) -->
    <div class="mt-2.5 pt-2 border-t border-[#dcd6c8]/60 flex flex-wrap items-center justify-between gap-y-2 text-xs">
      <div class="flex flex-wrap items-center gap-3">
        <!-- Cost Filter -->
        <div class="flex items-center gap-1">
          <span class="text-stone-500 font-serif-header font-semibold text-[11px]">Cost:</span>
          <div class="inline-flex rounded-md shadow-xs bg-white border border-[#dcd6c8] p-0.5">
            <button
              v-for="c in ['all', '£', '££', '£££']"
              :key="c"
              @click="setCost(c as any)"
              :class="filters.cost === c ? 'bg-[#8b1e22] text-white font-bold' : 'text-stone-700 hover:bg-stone-100'"
              class="px-2 py-0.5 text-[11px] rounded transition-colors font-mono"
            >
              {{ c === 'all' ? 'All' : c }}
            </button>
          </div>
        </div>

        <!-- Max Walk Slider / Pills -->
        <div class="flex items-center gap-1.5">
          <span class="text-stone-500 font-serif-header font-semibold text-[11px]">Max Walk:</span>
          <select
            :value="filters.maxWalkMinutes"
            @change="onWalkChange"
            class="bg-white border border-[#dcd6c8] rounded px-2 py-1 text-[11px] font-sans focus:outline-none"
          >
            <option :value="5">⚡ 5 min (Immediate)</option>
            <option :value="10">🏃 10 min (Close)</option>
            <option :value="15">🚶 15 min (Standard)</option>
            <option :value="20">🚶‍♂️ 20 min (Stroll)</option>
            <option :value="25">🗺 25 min (Perimeter)</option>
            <option :value="60">All within 2.5 mi</option>
          </select>
        </div>

        <!-- Inspection Recency Filter -->
        <div class="flex items-center gap-1.5">
          <span class="text-stone-500 font-serif-header font-semibold text-[11px]">Inspected:</span>
          <select
            :value="filters.inspectedDays"
            @change="onInspectedChange"
            class="bg-white border border-[#dcd6c8] rounded px-2 py-1 text-[11px] font-sans focus:outline-none"
          >
            <option value="all">Any Inspection Date</option>
            <option :value="30">Last 30 Days (Fresh)</option>
            <option :value="90">Last 90 Days</option>
            <option :value="180">Last 180 Days</option>
          </select>
        </div>

        <!-- Cuisine Filter -->
        <div class="flex items-center gap-1.5">
          <span class="text-stone-500 font-serif-header font-semibold text-[11px]">Type:</span>
          <select
            :value="filters.cuisine"
            @change="onCuisineChange"
            class="bg-white border border-[#dcd6c8] rounded px-2 py-1 text-[11px] font-sans focus:outline-none"
          >
            <option value="all">All Cuisines</option>
            <option v-for="c in availableCuisines" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>

      <!-- Reset Filter Button -->
      <button
        @click="resetAll"
        class="text-stone-500 hover:text-[#8b1e22] text-[11px] underline font-serif-header cursor-pointer"
      >
        Reset Filters
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '@nanostores/vue';
import {
  $filters,
  $isChairsMode,
  toggleTier,
  toggleAllTiers,
  setCost,
  setMaxWalkMinutes,
  setInspectedDays,
  setCuisine,
  setSearchQuery,
  resetFilters,
  openWhereToday,
  openSuggestModal,
  toggleChairsMode,
} from '@/stores/filters';
import { $venuesList } from '@/stores/ledger';
import type { TierStatus } from '@/types';

const filters = useStore($filters);
const isChairsMode = useStore($isChairsMode);
const venuesList = useStore($venuesList);

const allTiers: { name: TierStatus; dotColor: string; badgeClass: string }[] = [
  { name: 'Approved', dotColor: '#8b1e22', badgeClass: 'bg-[#8b1e22]/10 text-[#8b1e22] border-[#8b1e22]/40' },
  { name: 'Under Consideration', dotColor: '#d97706', badgeClass: 'bg-amber-100 text-amber-800 border-amber-300' },
  { name: 'To Be Assessed', dotColor: '#3b82f6', badgeClass: 'bg-blue-100 text-blue-800 border-blue-300' },
  { name: 'Rejected', dotColor: '#4b5563', badgeClass: 'bg-stone-200 text-stone-700 border-stone-300' },
  { name: 'If We Must', dotColor: '#854d0e', badgeClass: 'bg-yellow-100 text-yellow-900 border-yellow-300' },
  { name: 'Gone But Not Forgotten', dotColor: '#78716c', badgeClass: 'bg-stone-100 text-stone-500 border-stone-300 border-dashed' },
];

const searchQueryModel = computed({
  get: () => filters.value.searchQuery,
  set: (val: string) => setSearchQuery(val),
});

const availableCuisines = computed(() => {
  const set = new Set<string>();
  venuesList.value.forEach((v) => {
    if (v.cuisine) set.add(v.cuisine);
  });
  return Array.from(set).sort();
});

function getTierCount(tier: TierStatus) {
  return venuesList.value.filter((v) => v.status === tier).length;
}

function onWalkChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  setMaxWalkMinutes(Number(target.value));
}

function onInspectedChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  setInspectedDays(target.value === 'all' ? 'all' : Number(target.value));
}

function onCuisineChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  setCuisine(target.value);
}

function resetAll() {
  resetFilters();
}
</script>
