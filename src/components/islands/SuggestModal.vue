<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[10020] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    @click.self="closeModal"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="suggest-modal-title"
      class="w-full max-w-md bg-card rounded-2xl border-2 border-navy shadow-2xl overflow-hidden font-sans flex flex-col max-h-[90vh]"
    >
      <!-- Header -->
      <div class="bg-navy-fixed text-white p-4 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Icon name="scroll" class="icon-lg" />
          <div>
            <h2 id="suggest-modal-title" class="text-base font-bold font-serif-header">Petition the Chairs</h2>
            <p class="text-xs text-blue-100">Suggest a venue for the Chairs to assess</p>
          </div>
        </div>
        <button type="button" @click="closeModal" class="text-white/80 hover:text-white text-lg p-1" aria-label="Close"><Icon name="close" class="icon-md" /></button>
      </div>

      <!-- Sent -->
      <div v-if="sent" class="p-6 space-y-4 text-center text-ink" role="status">
        <Icon name="mail" class="icon-xl mx-auto text-navy" />
        <h3 class="text-lg font-bold font-serif-header">Petition received</h3>
        <p class="text-sm text-stone-700">
          The Chairs will review <strong>{{ sentName }}</strong>. If it merits attention it will appear under
          <em>To Be Assessed</em> once they have looked into it.
        </p>
        <button
          ref="doneButton"
          type="button"
          class="w-full bg-navy-fixed hover:bg-deep text-white py-2.5 px-4 rounded-lg font-bold text-sm"
          @click="closeModal"
        >
          Done
        </button>
      </div>

      <!-- Form -->
      <form v-else @submit.prevent="submitPetition" class="p-5 overflow-y-auto space-y-3 text-sm text-ink" novalidate>
        <div class="bg-blue-50 border border-blue-200 p-2.5 rounded text-xs text-blue-900">
          <strong>Article 3.1:</strong> Members may petition for new venues. The Chairs review every petition; a venue enters
          <em>To Be Assessed</em> only once they accept it.
        </div>

        <p v-if="formError" role="alert" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{{ formError }}</p>

        <div>
          <label for="suggest-name" class="block font-semibold mb-1 text-xs">Establishment name</label>
          <input id="suggest-name" ref="firstField" v-model="form.name" type="text" placeholder="e.g. Sampaio's Pasties" class="suggest-input" :aria-invalid="Boolean(errors.name)" required maxlength="200" />
          <p v-if="errors.name" class="suggest-error">{{ errors.name }}</p>
        </div>

        <div>
          <label for="suggest-address" class="block font-semibold mb-1 text-xs">Address or street (Manchester)</label>
          <input id="suggest-address" v-model="form.address" type="text" placeholder="e.g. 14 Peter Street, M2 5QR" class="suggest-input" :aria-invalid="Boolean(errors.address)" required maxlength="255" />
          <p v-if="errors.address" class="suggest-error">{{ errors.address }}</p>
        </div>

        <div class="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
          <div>
            <label for="suggest-cuisine" class="block font-semibold mb-1 text-xs">Cuisine</label>
            <input id="suggest-cuisine" v-model="form.cuisine" type="text" placeholder="e.g. Portuguese Deli" class="suggest-input" maxlength="120" />
            <p v-if="errors.cuisine" class="suggest-error">{{ errors.cuisine }}</p>
          </div>

          <div>
            <label for="suggest-cost" class="block font-semibold mb-1 text-xs">Expected cost</label>
            <select id="suggest-cost" v-model="form.cost" class="suggest-input font-sans tabular-nums font-bold">
              <option value="£">£ (under £10)</option>
              <option value="££">££ (above £10)</option>
              <option value="£££">£££ (payday treat)</option>
            </select>
          </div>
        </div>

        <div>
          <label for="suggest-order" class="block font-semibold mb-1 text-xs">What should the Chairs order?</label>
          <input id="suggest-order" v-model="form.recommendedOrder" type="text" placeholder="The dish that proves your case" class="suggest-input" maxlength="500" />
          <p v-if="errors.recommendedOrder" class="suggest-error">{{ errors.recommendedOrder }}</p>
        </div>

        <div>
          <label for="suggest-rationale" class="block font-semibold mb-1 text-xs">Why does it merit attention?</label>
          <textarea
            id="suggest-rationale"
            v-model="form.rationale"
            rows="3"
            placeholder="Make your case. (Keep bribery attempts out of it.)"
            class="suggest-input"
            :aria-invalid="Boolean(errors.rationale)"
            required
            maxlength="2000"
          ></textarea>
          <p v-if="errors.rationale" class="suggest-error">{{ errors.rationale }}</p>
        </div>

        <div>
          <label for="suggest-submitter" class="block font-semibold mb-1 text-xs">Your name <span class="font-normal text-stone-500">(optional)</span></label>
          <input id="suggest-submitter" v-model="form.submitterName" type="text" placeholder="e.g. Delegate Reynolds" class="suggest-input" maxlength="120" />
        </div>

        <!-- Honeypot: hidden from people and assistive tech. -->
        <div class="hidden" aria-hidden="true">
          <label for="suggest-website">Website</label>
          <input id="suggest-website" v-model="form.website" type="text" tabindex="-1" autocomplete="off" />
        </div>

        <div class="pt-2">
          <button
            type="submit"
            :disabled="submitting"
            class="w-full bg-navy-fixed hover:bg-deep disabled:opacity-60 text-white py-2.5 px-4 rounded-lg font-bold text-sm shadow transition-colors cursor-pointer"
          >
            {{ submitting ? 'Sending…' : 'Submit petition to the Chairs' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import Icon from '@/components/Icon.vue';
import { nextTick, onUnmounted, reactive, ref, watch } from 'vue';
import { useStore } from '@nanostores/vue';
import { $isSuggestModalOpen, closeSuggestModal } from '@/stores/filters';
import type { CostTier } from '@/types';
import { apiFetch } from '@/lib/api-fetch';

const isOpen = useStore($isSuggestModalOpen);

const emptyForm = () => ({
  name: '',
  address: '',
  cuisine: '',
  cost: '££' as CostTier,
  recommendedOrder: '',
  rationale: '',
  submitterName: '',
  website: '',
});

const form = reactive(emptyForm());
const errors = ref<Record<string, string>>({});
const formError = ref('');
const submitting = ref(false);
const sent = ref(false);
const sentName = ref('');
const firstField = ref<HTMLInputElement | null>(null);
const doneButton = ref<HTMLButtonElement | null>(null);

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeModal();
}

watch(isOpen, async (open) => {
  if (typeof window === 'undefined') return;
  if (open) {
    window.addEventListener('keydown', onKeydown);
    await nextTick();
    firstField.value?.focus();
  } else {
    window.removeEventListener('keydown', onKeydown);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown);
});

function closeModal() {
  closeSuggestModal();
  if (sent.value) {
    sent.value = false;
    Object.assign(form, emptyForm());
  }
  errors.value = {};
  formError.value = '';
  if (window.location.hash === '#suggest-a-venue') {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

async function submitPetition() {
  errors.value = {};
  formError.value = '';
  submitting.value = true;
  const result = await apiFetch('/api/suggestions', {
    method: 'POST',
    body: form,
    fallback: 'The petition could not be sent. Please try again.',
    offline: 'The petition could not be sent. Check your connection and try again.',
  });
  submitting.value = false;
  if (!result.ok) {
    errors.value = result.fields;
    formError.value = result.error;
    return;
  }
  sentName.value = form.name.trim();
  sent.value = true;
  await nextTick();
  doneButton.value?.focus();
}
</script>

<style scoped>
.suggest-input {
  width: 100%;
  background-color: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: 0.375rem;
  padding: 0.5rem;
  font-size: 16px; /* 16px stops iOS Safari zooming into the field. */
}

.suggest-input[aria-invalid='true'] {
  border-color: var(--color-danger);
}

.suggest-error {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--color-danger);
}
</style>
