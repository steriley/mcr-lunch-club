<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import ImageUpload from './ImageUpload.vue';
import { CUISINES } from '@/lib/cuisines';
import { TIERS } from '@/lib/tiers';
import { COST_BANDS, COST_BAND_LABELS, isOutsideUk, slugify, venueInputSchema } from '@/lib/venue-schema';

interface VenueData {
  id: string;
  name: string;
  slug: string;
  tier: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  pullQuote: string | null;
  lunchSpecial: string | null;
  websiteUrl: string | null;
  imageUrl: string | null;
  cost: string;
  cuisine: string;
  distanceMiles: number | null;
  walkingTimeMin: number | null;
  lastInspectionDate: string | null;
  mapSearchLink: string | null;
  updatedAt: string;
}

const props = defineProps<{
  mode: 'create' | 'edit';
  venue?: VenueData | null;
  updatedByName?: string | null;
  uploadsEnabled?: boolean;
}>();

const textFields = [
  'name', 'slug', 'tier', 'address', 'latitude', 'longitude', 'pullQuote', 'lunchSpecial',
  'websiteUrl', 'imageUrl', 'cost', 'cuisine', 'distanceMiles', 'walkingTimeMin', 'lastInspectionDate',
  'mapSearchLink',
] as const;
type FormField = (typeof textFields)[number];

function toFormState(venue?: VenueData | null): Record<FormField, string> {
  const state = {} as Record<FormField, string>;
  for (const field of textFields) {
    const value = venue?.[field];
    state[field] = value === null || value === undefined ? '' : String(value);
  }
  if (!venue) {
    state.tier = 'to_be_assessed';
    state.cost = '££';
    state.cuisine = 'other';
  }
  return state;
}

const form = reactive(toFormState(props.venue));
const venueId = ref(props.venue?.id ?? '');
const updatedAt = ref(props.venue?.updatedAt ?? null);
const savedSnapshot = ref(JSON.stringify(form));

const errors = reactive<Record<string, string>>({});
const formError = ref('');
const successMessage = ref('');
const isSubmitting = ref(false);
const showDeleteDialog = ref(false);
const slugEdited = ref(props.mode === 'edit');

const isDirty = computed(() => JSON.stringify(form) !== savedSnapshot.value);
const coordinateWarning = computed(() => {
  const lat = form.latitude === '' ? null : Number(form.latitude);
  const lng = form.longitude === '' ? null : Number(form.longitude);
  if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) return '';
  return isOutsideUk(lat, lng) ? 'These coordinates are outside the UK. Double-check them before saving.' : '';
});
const lastUpdatedText = computed(() => {
  if (!updatedAt.value) return '';
  const when = new Date(updatedAt.value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' });
  return props.updatedByName ? `Last updated ${when} by ${props.updatedByName}` : `Last updated ${when}`;
});

watch(
  () => form.name,
  (name) => {
    if (!slugEdited.value) form.slug = slugify(name);
  }
);

function onSlugInput() {
  slugEdited.value = form.slug.trim() !== '';
}

function clearErrors() {
  for (const key of Object.keys(errors)) delete errors[key];
  formError.value = '';
}

async function save() {
  clearErrors();
  successMessage.value = '';

  const body = { ...form };
  const checked = venueInputSchema.safeParse(body);
  if (!checked.success) {
    for (const issue of checked.error.issues) {
      const field = String(issue.path[0] ?? 'form');
      errors[field] ??= issue.message;
    }
    formError.value = 'Please correct the highlighted fields.';
    return;
  }

  isSubmitting.value = true;
  try {
    const response = await fetch(props.mode === 'create' && !venueId.value ? '/api/admin/venues' : `/api/admin/venues/${venueId.value}`, {
      method: props.mode === 'create' && !venueId.value ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      Object.assign(errors, result.fields ?? {});
      formError.value = result.error ?? 'Unable to save this venue right now.';
      return;
    }

    updatedAt.value = result.venue.updatedAt;
    savedSnapshot.value = JSON.stringify(form);

    if (props.mode === 'create') {
      window.location.assign(`/admin/venues/${result.venue.id}?saved=1`);
      return;
    }
    successMessage.value = 'Saved.';
  } catch (error) {
    console.error('Venue save failed', error);
    formError.value = 'Unable to save this venue right now.';
  } finally {
    isSubmitting.value = false;
  }
}

async function performDelete() {
  showDeleteDialog.value = false;
  isSubmitting.value = true;
  try {
    const response = await fetch(`/api/admin/venues/${venueId.value}`, { method: 'DELETE' });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      formError.value = result.error ?? 'Unable to delete this venue right now.';
      return;
    }
    savedSnapshot.value = JSON.stringify(form);
    window.location.assign('/admin/venues?deleted=1');
  } finally {
    isSubmitting.value = false;
  }
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload);
  if (new URLSearchParams(window.location.search).get('saved') === '1') {
    successMessage.value = 'Venue created.';
  }
});
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));

const inputClass = 'w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B] focus-visible:ring-2 focus-visible:ring-[#1B2F6B]/30';
const labelClass = 'block text-sm font-semibold text-[#1a1e24]';
const hintClass = 'mt-1 block text-xs font-normal text-[#535353]';
const errorClass = 'mt-1 block text-xs font-medium text-red-700';
</script>

<template>
  <form class="space-y-6 rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] p-6 shadow-sm" novalidate @submit.prevent="save()">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.2em] text-[#8a5100]">Venue record</p>
        <p v-if="lastUpdatedText" class="mt-1 text-sm text-[#535353]">{{ lastUpdatedText }}</p>
      </div>
    </div>

    <div v-if="formError" role="alert" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ formError }}</div>
    <div v-if="successMessage" role="status" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ successMessage }}</div>

    <fieldset class="grid gap-5 md:grid-cols-2">
      <legend class="mb-3 text-lg font-bold text-[#1a1e24]">Basics</legend>

      <label :class="[labelClass, 'md:col-span-2']">
        <span class="mb-2 block">Venue name</span>
        <input v-model="form.name" type="text" required :class="inputClass" :aria-invalid="Boolean(errors.name)" />
        <span v-if="errors.name" :class="errorClass">{{ errors.name }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Slug</span>
        <input v-model="form.slug" type="text" :class="inputClass" :aria-invalid="Boolean(errors.slug)" @input="onSlugInput" />
        <span :class="hintClass">Public address: /venues/{{ form.slug || '…' }}</span>
        <span v-if="errors.slug" :class="errorClass">{{ errors.slug }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Tier</span>
        <select v-model="form.tier" :class="inputClass" :aria-invalid="Boolean(errors.tier)">
          <option value="">No approved tier (hidden)</option>
          <option v-for="tier in TIERS" :key="tier.value" :value="tier.value">{{ tier.label }}</option>
        </select>
        <span :class="hintClass">The venue is public once it has a tier and a location.</span>
        <span v-if="errors.tier" :class="errorClass">{{ errors.tier }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Cost</span>
        <select v-model="form.cost" :class="inputClass">
          <option v-for="band in COST_BANDS" :key="band" :value="band">{{ COST_BAND_LABELS[band] }}</option>
        </select>
        <span v-if="errors.cost" :class="errorClass">{{ errors.cost }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Cuisine</span>
        <select v-model="form.cuisine" :class="inputClass" :aria-invalid="Boolean(errors.cuisine)">
          <option v-for="cuisine in CUISINES" :key="cuisine.value" :value="cuisine.value">{{ cuisine.label }}</option>
        </select>
        <span v-if="errors.cuisine" :class="errorClass">{{ errors.cuisine }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Last inspection date</span>
        <input v-model="form.lastInspectionDate" type="date" :class="inputClass" />
        <span v-if="errors.lastInspectionDate" :class="errorClass">{{ errors.lastInspectionDate }}</span>
      </label>
    </fieldset>

    <fieldset class="grid gap-5 border-t border-[#d9cfb8] pt-5 md:grid-cols-2">
      <legend class="mb-3 pt-5 text-lg font-bold text-[#1a1e24]">Location</legend>

      <label :class="[labelClass, 'md:col-span-2']">
        <span class="mb-2 block">Address</span>
        <input v-model="form.address" type="text" autocomplete="off" :class="inputClass" />
        <span v-if="errors.address" :class="errorClass">{{ errors.address }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Latitude</span>
        <input v-model="form.latitude" type="number" step="0.000001" inputmode="decimal" :class="inputClass" :aria-invalid="Boolean(errors.latitude)" />
        <span v-if="errors.latitude" :class="errorClass">{{ errors.latitude }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Longitude</span>
        <input v-model="form.longitude" type="number" step="0.000001" inputmode="decimal" :class="inputClass" :aria-invalid="Boolean(errors.longitude)" />
        <span v-if="errors.longitude" :class="errorClass">{{ errors.longitude }}</span>
      </label>

      <p v-if="coordinateWarning" class="md:col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{{ coordinateWarning }}</p>

      <label :class="labelClass">
        <span class="mb-2 block">Distance from Spinningfields (miles)</span>
        <input v-model="form.distanceMiles" type="number" min="0" step="0.01" inputmode="decimal" :class="inputClass" />
        <span :class="hintClass">Leave blank to calculate from the coordinates.</span>
        <span v-if="errors.distanceMiles" :class="errorClass">{{ errors.distanceMiles }}</span>
      </label>

      <label :class="labelClass">
        <span class="mb-2 block">Walking time (minutes)</span>
        <input v-model="form.walkingTimeMin" type="number" min="0" step="1" inputmode="numeric" :class="inputClass" />
        <span :class="hintClass">Leave blank to estimate from the distance.</span>
        <span v-if="errors.walkingTimeMin" :class="errorClass">{{ errors.walkingTimeMin }}</span>
      </label>

      <label :class="[labelClass, 'md:col-span-2']">
        <span class="mb-2 block">Map link</span>
        <input v-model="form.mapSearchLink" type="url" :class="inputClass" placeholder="https://www.google.com/maps/…" />
        <span :class="hintClass">Leave blank to link to the coordinates.</span>
        <span v-if="errors.mapSearchLink" :class="errorClass">{{ errors.mapSearchLink }}</span>
      </label>
    </fieldset>

    <fieldset class="grid gap-5 border-t border-[#d9cfb8] pt-5 md:grid-cols-2">
      <legend class="mb-3 pt-5 text-lg font-bold text-[#1a1e24]">On the venue page</legend>

      <label :class="[labelClass, 'md:col-span-2']">
        <span class="mb-2 block">Pull quote</span>
        <input v-model="form.pullQuote" type="text" :class="inputClass" />
        <span :class="hintClass">Shown prominently near the top of the venue page.</span>
        <span v-if="errors.pullQuote" :class="errorClass">{{ errors.pullQuote }}</span>
      </label>

      <label :class="[labelClass, 'md:col-span-2']">
        <span class="mb-2 block">Lunch special — “Eat Like Us”</span>
        <textarea v-model="form.lunchSpecial" rows="2" :class="inputClass"></textarea>
        <span :class="hintClass">The prescribed order or set deal.</span>
        <span v-if="errors.lunchSpecial" :class="errorClass">{{ errors.lunchSpecial }}</span>
      </label>
    </fieldset>

    <fieldset class="grid gap-5 border-t border-[#d9cfb8] pt-5 md:grid-cols-2">
      <legend class="mb-3 pt-5 text-lg font-bold text-[#1a1e24]">Links and image</legend>

      <label :class="[labelClass, 'md:col-span-2']">
        <span class="mb-2 block">Website</span>
        <input v-model="form.websiteUrl" type="url" :class="inputClass" />
        <span v-if="errors.websiteUrl" :class="errorClass">{{ errors.websiteUrl }}</span>
      </label>

      <div class="md:col-span-2">
        <ImageUpload v-model="form.imageUrl" :enabled="Boolean(uploadsEnabled)" :error="errors.imageUrl" />
      </div>
    </fieldset>

    <div class="flex flex-col-reverse gap-3 border-t border-[#d9cfb8] pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <button
          v-if="mode === 'edit'"
          type="button"
          :disabled="isSubmitting"
          class="w-full rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 sm:w-auto"
          @click="showDeleteDialog = true"
        >
          Delete venue
        </button>
      </div>
      <div class="flex flex-col gap-3 sm:flex-row">
        <span v-if="isDirty" class="self-center text-xs font-semibold text-[#8a5100]">Unsaved changes</span>
        <a href="/admin/venues" class="rounded-lg border border-[#d9cfb8] bg-white px-4 py-2.5 text-center text-sm font-semibold text-[#1a1e24] hover:bg-[#f5efe5]">Back to list</a>
        <button type="submit" :disabled="isSubmitting" class="rounded-lg bg-[#1B2F6B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#111E47] disabled:cursor-not-allowed disabled:opacity-70">
          {{ isSubmitting ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </div>

    <ConfirmDialog
      :open="showDeleteDialog"
      title="Delete venue"
      :message="`Delete “${form.name || 'this venue'}” permanently? Linked bribery records are kept but unlinked. This cannot be undone.`"
      confirm-label="Delete venue"
      @cancel="showDeleteDialog = false"
      @confirm="performDelete"
    />
  </form>
</template>
