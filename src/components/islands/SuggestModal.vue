<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[2600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="closeModal"
  >
    <div
      class="w-full max-w-md bg-[#fdfcf9] rounded-2xl border-2 border-[#2563eb] shadow-2xl overflow-hidden font-sans flex flex-col max-h-[90vh]"
    >
      <!-- Header -->
      <div class="bg-[#1e3a8a] text-white p-4 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xl">📜</span>
          <div>
            <h2 class="text-sm font-bold font-serif-header">Petition the Chairs</h2>
            <p class="text-xs text-blue-200">Submit a Venue for Entry into 'To Be Assessed'</p>
          </div>
        </div>
        <button @click="closeModal" class="text-white/80 hover:text-white text-lg">✕</button>
      </div>

      <!-- Form -->
      <form @submit.prevent="submitPetition" class="p-5 overflow-y-auto space-y-3 text-xs text-[#1a1e24]">
        <div class="bg-blue-50 border border-blue-200 p-2.5 rounded text-xs text-blue-900 font-serif-header">
          <strong>Article 3.1:</strong> Members may petition for new venues. Submitted establishments are placed immediately into <em>To Be Assessed</em> until two independent inspections are conducted.
        </div>

        <div>
          <label class="block font-semibold mb-1">Establishment Name:</label>
          <input
            type="text"
            v-model="name"
            placeholder="e.g. Sampaio's Pasties"
            class="w-full bg-white border border-[#dcd6c8] rounded p-2 text-xs"
            required
          />
        </div>

        <div>
          <label class="block font-semibold mb-1">Location / Address (Manchester):</label>
          <input
            type="text"
            v-model="address"
            placeholder="e.g. 14 Peter Street, M2 5QR"
            class="w-full bg-white border border-[#dcd6c8] rounded p-2 text-xs"
            required
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold mb-1">Cuisine / Category:</label>
            <input
              type="text"
              v-model="cuisine"
              placeholder="e.g. Portuguese Deli"
              class="w-full bg-white border border-[#dcd6c8] rounded p-2 text-xs"
              required
            />
          </div>

          <div>
            <label class="block font-semibold mb-1">Expected Cost:</label>
            <select
              v-model="cost"
              class="w-full bg-white border border-[#dcd6c8] rounded p-2 text-xs font-mono font-bold"
            >
              <option value="£">£ (Budget / Takeaway)</option>
              <option value="££">££ (Standard Sit-down)</option>
              <option value="£££">£££ (Payday Treat)</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block font-semibold mb-1">Prescribed Order ("Eat Like Us"):</label>
          <input
            type="text"
            v-model="recommendedOrder"
            placeholder="What exact dish should the Chairs sample during the audit?"
            class="w-full bg-white border border-[#dcd6c8] rounded p-2 text-xs"
            required
          />
        </div>

        <div>
          <label class="block font-semibold mb-1">Solemn Rationale / Petition Testimony:</label>
          <textarea
            v-model="rationale"
            rows="2"
            placeholder="Why does this venue merit tribunal attention? (Keep bribery attempts out of it)."
            class="w-full bg-white border border-[#dcd6c8] rounded p-2 text-xs"
            required
          ></textarea>
        </div>

        <div>
          <label class="block font-semibold mb-1">Submitter Name / Rank:</label>
          <input
            type="text"
            v-model="submitter"
            placeholder="e.g. Delegate Reynolds (Civil Observant)"
            class="w-full bg-white border border-[#dcd6c8] rounded p-2 text-xs"
          />
        </div>

        <!-- Submit Button -->
        <div class="pt-2">
          <button
            type="submit"
            class="w-full bg-[#1e3a8a] hover:bg-[#172554] text-white py-2.5 px-4 rounded-lg font-serif-header font-bold text-xs shadow transition-colors cursor-pointer"
          >
            Submit Formal Petition to Ledger
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useStore } from '@nanostores/vue';
import { $isSuggestModalOpen, closeSuggestModal, selectVenue } from '@/stores/filters';
import { suggestVenue } from '@/stores/ledger';
import type { CostTier } from '@/types';

const isOpen = useStore($isSuggestModalOpen);

const name = ref('');
const address = ref('');
const cuisine = ref('');
const cost = ref<CostTier>('££');
const recommendedOrder = ref('');
const rationale = ref('');
const submitter = ref('');

function closeModal() {
  closeSuggestModal();
}

function submitPetition() {
  if (!name.value.trim() || !address.value.trim()) return;

  const created = suggestVenue({
    name: name.value,
    address: address.value,
    cuisine: cuisine.value,
    cost: cost.value,
    recommendedOrder: recommendedOrder.value,
    rationale: rationale.value,
    submitter: submitter.value,
  });

  // Reset form
  name.value = '';
  address.value = '';
  cuisine.value = '';
  recommendedOrder.value = '';
  rationale.value = '';
  submitter.value = '';

  closeModal();
  selectVenue(created);
}
</script>
