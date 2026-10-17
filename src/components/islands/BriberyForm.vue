<script setup lang="ts">
import { reactive } from 'vue';

const props = defineProps<{
  mode: 'create' | 'edit';
  record?: string | null;
  venues?: string | null;
}>();

const initialRecord = props.record ? JSON.parse(props.record) : null;
const venueOptions = props.venues ? JSON.parse(props.venues) as Array<{ id: string; name: string }> : [];

const fieldErrors = reactive<Record<string, string>>({});
const form = reactive({
  venueId: initialRecord?.venueId ?? '',
  venueNameText: initialRecord?.venueNameText ?? '',
  incidentDate: initialRecord?.incidentDate ? new Date(initialRecord.incidentDate).toISOString().slice(0, 10) : '',
  description: initialRecord?.description ?? '',
  outcome: initialRecord?.outcome ?? '',
  published: initialRecord ? Boolean(initialRecord.published) : true,
});

const actionText = props.mode === 'create' ? 'Create record' : 'Save changes';

function clearErrors() {
  Object.keys(fieldErrors).forEach((key) => {
    delete fieldErrors[key];
  });
}

async function submit() {
  clearErrors();

  const payload = {
    venueId: form.venueId || null,
    venueNameText: form.venueNameText.trim(),
    incidentDate: form.incidentDate || null,
    description: form.description.trim(),
    outcome: form.outcome.trim(),
    published: form.published,
  };

  const endpoint = props.mode === 'create' ? '/api/admin/bribery' : `/api/admin/bribery/${initialRecord.id}`;
  const method = props.mode === 'create' ? 'POST' : 'PUT';

  try {
    const response = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: 'Unable to save this bribery record.' }));
      if (data.fields) {
        Object.entries(data.fields).forEach(([key, value]) => {
          fieldErrors[key] = String(value);
        });
      }
      if (data.error && !Object.keys(data.fields ?? {}).length) {
        fieldErrors.form = data.error;
      }
      return;
    }

    window.location.href = '/admin/bribery';
  } catch (error) {
    fieldErrors.form = 'Something went wrong while saving this bribery record.';
  }
}
</script>

<template>
  <form class="space-y-6 rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] p-6 shadow-sm" @submit.prevent="submit">
    <div v-if="fieldErrors.form" class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ fieldErrors.form }}
    </div>

    <div class="grid gap-5 lg:grid-cols-2">
      <label class="block text-sm font-semibold text-[#1a1e24]">
        <span class="mb-2 block">Venue</span>
        <select v-model="form.venueId" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] focus:border-[#1B2F6B] focus:outline-none">
          <option value="">No linked venue</option>
          <option v-for="venue in venueOptions" :key="venue.id" :value="venue.id">
            {{ venue.name }}
          </option>
        </select>
        <span v-if="fieldErrors.venueId" class="mt-2 block text-xs font-medium text-red-700">{{ fieldErrors.venueId }}</span>
      </label>

      <label class="block text-sm font-semibold text-[#1a1e24]">
        <span class="mb-2 block">Venue name override</span>
        <input v-model="form.venueNameText" placeholder="If the venue is not in the ledger" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] focus:border-[#1B2F6B] focus:outline-none" />
      </label>

      <label class="block text-sm font-semibold text-[#1a1e24]">
        <span class="mb-2 block">Incident date</span>
        <input v-model="form.incidentDate" type="date" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] focus:border-[#1B2F6B] focus:outline-none" />
      </label>

      <label class="flex items-center gap-3 rounded-xl border border-[#d9cfb8] bg-white px-4 py-3 text-sm font-semibold text-[#1a1e24]">
        <input v-model="form.published" type="checkbox" class="h-4 w-4 rounded border-[#d9cfb8] text-[#1B2F6B] focus:ring-[#1B2F6B]" />
        Publish this record
      </label>
    </div>

    <label class="block text-sm font-semibold text-[#1a1e24]">
      <span class="mb-2 block">Description</span>
      <textarea v-model="form.description" rows="6" placeholder="Detail the incident, offer, benefit or inducement." class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] focus:border-[#1B2F6B] focus:outline-none"></textarea>
      <span v-if="fieldErrors.description" class="mt-2 block text-xs font-medium text-red-700">{{ fieldErrors.description }}</span>
    </label>

    <label class="block text-sm font-semibold text-[#1a1e24]">
      <span class="mb-2 block">Outcome</span>
      <textarea v-model="form.outcome" rows="4" placeholder="Any note on the outcome, follow-up, or verdict." class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] focus:border-[#1B2F6B] focus:outline-none"></textarea>
    </label>

    <div class="flex flex-col gap-3 border-t border-[#d9cfb8] pt-4 sm:flex-row sm:justify-end">
      <a href="/admin/bribery" class="inline-flex items-center justify-center rounded-lg border border-[#d9cfb8] bg-white px-4 py-2.5 text-sm font-semibold text-[#1a1e24] hover:bg-[#f5efe5]">
        Cancel
      </a>
      <button type="submit" class="inline-flex items-center justify-center rounded-lg bg-[#1B2F6B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#111E47]">
        {{ actionText }}
      </button>
    </div>
  </form>
</template>
