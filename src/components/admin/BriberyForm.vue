<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import { briberyInputSchema } from '@/lib/bribery-schema';
import { apiFetch } from '@/lib/api-fetch';
import type { SerializedBribery } from '@/lib/bribery';

const props = defineProps<{
  mode: 'create' | 'edit';
  record?: SerializedBribery | null;
  venues: Array<{ id: string; name: string }>;
}>();

const form = reactive({
  title: props.record?.title ?? '',
  venueId: props.record?.venueId ?? '',
  venueNameText: props.record?.venueNameText ?? '',
  incidentDate: props.record?.incidentDate ?? '',
  incidentTime: props.record?.incidentTime ?? '',
  location: props.record?.location ?? '',
  peopleInvolved: (props.record?.peopleInvolved ?? []).join('\n'),
  witnesses: (props.record?.witnesses ?? []).join('\n'),
  benefitOffered: props.record?.benefitOffered ?? '',
  value: props.record?.value ?? '',
  description: props.record?.description ?? '',
  outcome: props.record?.outcome ?? '',
  published: props.record?.published ?? true,
});

const savedSnapshot = ref(JSON.stringify(form));
const isDirty = computed(() => JSON.stringify(form) !== savedSnapshot.value);
const errors = reactive<Record<string, string>>({});
const formError = ref('');
const isSubmitting = ref(false);
const showDeleteDialog = ref(false);

function clearErrors() {
  for (const key of Object.keys(errors)) delete errors[key];
  formError.value = '';
}

async function submit() {
  clearErrors();
  const checked = briberyInputSchema.safeParse({ ...form });
  if (!checked.success) {
    for (const issue of checked.error.issues)
      errors[String(issue.path[0] ?? 'form')] ??= issue.message;
    formError.value = 'Please correct the highlighted fields.';
    return;
  }

  isSubmitting.value = true;
  const result = await apiFetch(
    props.mode === 'create' ? '/api/admin/bribery' : `/api/admin/bribery/${props.record!.id}`,
    {
      method: props.mode === 'create' ? 'POST' : 'PUT',
      body: { ...form },
      fallback: 'Unable to save this record right now.',
    }
  );
  isSubmitting.value = false;
  if (!result.ok) {
    Object.assign(errors, result.fields);
    formError.value = result.error;
    return;
  }
  savedSnapshot.value = JSON.stringify(form);
  window.location.assign('/admin/bribery?saved=1');
}

async function performDelete() {
  showDeleteDialog.value = false;
  isSubmitting.value = true;
  const result = await apiFetch(`/api/admin/bribery/${props.record!.id}`, {
    method: 'DELETE',
    fallback: 'Unable to delete this record right now.',
  });
  isSubmitting.value = false;
  if (!result.ok) {
    formError.value = result.error;
    return;
  }
  savedSnapshot.value = JSON.stringify(form);
  window.location.assign('/admin/bribery?deleted=1');
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));

const inputClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink focus:border-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/30';
const labelClass = 'block text-sm font-semibold text-ink';
const hintClass = 'mt-1 block text-xs font-normal text-graphite';
const errorClass = 'mt-1 block text-xs font-medium text-red-700';
</script>

<template>
  <form
    class="space-y-6 rounded-2xl border border-hairline bg-parchment p-6 shadow-sm"
    novalidate
    @submit.prevent="submit"
  >
    <div
      v-if="formError"
      role="alert"
      class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ formError }}
    </div>

    <div class="grid gap-5 lg:grid-cols-2">
      <label :class="[labelClass, 'lg:col-span-2']">
        <span class="mb-2 block">Title</span>
        <input
          v-model="form.title"
          :class="inputClass"
          placeholder="e.g. Red Roses for Forgiveness"
        />
        <span v-if="errors.title" :class="errorClass">{{ errors.title }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Venue</span>
        <select v-model="form.venueId" :class="inputClass">
          <option value="">Not linked to a venue</option>
          <option v-for="venue in venues" :key="venue.id" :value="venue.id">
            {{ venue.name }}
          </option>
        </select>
        <span v-if="errors.venueId" :class="errorClass">{{ errors.venueId }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Venue name (if not in the ledger)</span>
        <input v-model="form.venueNameText" :class="inputClass" />
        <span v-if="errors.venueNameText" :class="errorClass">{{ errors.venueNameText }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Date</span>
        <input v-model="form.incidentDate" type="date" :class="inputClass" />
        <span v-if="errors.incidentDate" :class="errorClass">{{ errors.incidentDate }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Time</span>
        <input v-model="form.incidentTime" type="time" :class="inputClass" />
        <span v-if="errors.incidentTime" :class="errorClass">{{ errors.incidentTime }}</span>
      </label>

      <label :class="[labelClass, 'lg:col-span-2']">
        <span class="mb-2 block">Location</span>
        <input
          v-model="form.location"
          :class="inputClass"
          placeholder="e.g. Manchester Spinningfields"
        />
        <span v-if="errors.location" :class="errorClass">{{ errors.location }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">People involved</span>
        <textarea v-model="form.peopleInvolved" rows="3" :class="inputClass"></textarea>
        <span :class="hintClass">One per line.</span>
        <span v-if="errors.peopleInvolved" :class="errorClass">{{ errors.peopleInvolved }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Witnesses</span>
        <textarea v-model="form.witnesses" rows="3" :class="inputClass"></textarea>
        <span :class="hintClass">One per line.</span>
        <span v-if="errors.witnesses" :class="errorClass">{{ errors.witnesses }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Benefit offered</span>
        <input v-model="form.benefitOffered" :class="inputClass" />
        <span v-if="errors.benefitOffered" :class="errorClass">{{ errors.benefitOffered }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Estimated value</span>
        <input v-model="form.value" :class="inputClass" placeholder="e.g. £6.50" />
        <span v-if="errors.value" :class="errorClass">{{ errors.value }}</span>
      </label>
    </div>

    <label :class="labelClass">
      <span class="mb-2 block">Context</span>
      <textarea
        v-model="form.description"
        rows="5"
        :class="inputClass"
        placeholder="What happened?"
      ></textarea>
      <span v-if="errors.description" :class="errorClass">{{ errors.description }}</span>
    </label>

    <label :class="labelClass">
      <span class="mb-2 block">Outcome and resolution</span>
      <textarea v-model="form.outcome" rows="4" :class="inputClass"></textarea>
      <span v-if="errors.outcome" :class="errorClass">{{ errors.outcome }}</span>
    </label>

    <label
      class="flex items-center gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 text-sm font-semibold text-ink"
    >
      <input v-model="form.published" type="checkbox" class="h-4 w-4 rounded border-hairline" />
      Show on the public Hall of Shame
    </label>

    <div
      class="flex flex-col-reverse gap-3 border-t border-hairline pt-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <button
          v-if="mode === 'edit'"
          type="button"
          :disabled="isSubmitting"
          class="w-full rounded-lg border border-red-200 bg-surface px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 sm:w-auto"
          @click="showDeleteDialog = true"
        >
          Delete record
        </button>
      </div>
      <div class="flex flex-col gap-3 sm:flex-row">
        <span v-if="isDirty" class="self-center text-xs font-semibold text-ochre"
          >Unsaved changes</span
        >
        <a
          href="/admin/bribery"
          class="inline-flex items-center justify-center rounded-lg border border-hairline bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-linen"
          >Cancel</a
        >
        <button
          type="submit"
          :disabled="isSubmitting"
          class="inline-flex items-center justify-center rounded-lg bg-navy-fixed px-4 py-2.5 text-sm font-semibold text-white hover:bg-deep disabled:opacity-70"
        >
          {{ isSubmitting ? 'Saving…' : mode === 'create' ? 'Create record' : 'Save changes' }}
        </button>
      </div>
    </div>

    <ConfirmDialog
      :open="showDeleteDialog"
      title="Delete record"
      message="Remove this entry from the Bribery / Improper Benefit Attempt Record permanently?"
      confirm-label="Delete record"
      @cancel="showDeleteDialog = false"
      @confirm="performDelete"
    />
  </form>
</template>
