<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { slugify, tierOptions } from '@/lib/venue-utils';

const props = defineProps<{
  mode: 'create' | 'edit';
  venue?:
    | {
        id?: string;
        name?: string;
        slug?: string;
        tier?: string;
        address?: string | null;
        latitude?: number | null;
        longitude?: number | null;
        summary?: string | null;
        verdict?: string | null;
        pullQuote?: string | null;
        lunchSpecial?: string | null;
        websiteUrl?: string | null;
        imageUrl?: string | null;
        published?: boolean;
      }
    | string;
}>();

const initialVenue = computed(() => {
  const raw = props.venue;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  return raw ?? {};
});

const form = reactive({
  id: initialVenue.value.id ?? '',
  name: initialVenue.value.name ?? '',
  slug: initialVenue.value.slug ?? '',
  tier: initialVenue.value.tier ?? 'approved',
  address: initialVenue.value.address ?? '',
  latitude: initialVenue.value.latitude ?? '',
  longitude: initialVenue.value.longitude ?? '',
  summary: initialVenue.value.summary ?? '',
  verdict: initialVenue.value.verdict ?? '',
  pullQuote: initialVenue.value.pullQuote ?? '',
  lunchSpecial: initialVenue.value.lunchSpecial ?? '',
  websiteUrl: initialVenue.value.websiteUrl ?? '',
  imageUrl: initialVenue.value.imageUrl ?? '',
  published: Boolean(initialVenue.value.published),
});

const errors = reactive<Record<string, string>>({});
const successMessage = ref('');
const isSubmitting = ref(false);
const showPreview = ref(false);
const slugEdited = ref(Boolean(props.venue?.slug));

const formTitle = computed(() => (props.mode === 'create' ? 'Add venue' : 'Edit venue'));

watch(
  () => form.name,
  (value) => {
    if (!slugEdited.value || !form.slug) {
      form.slug = slugify(value);
    }
  },
  { flush: 'post' }
);

function handleSlugInput() {
  slugEdited.value = true;
}

function setError(field: string, message: string) {
  errors[field] = message;
}

function clearErrors() {
  Object.keys(errors).forEach((key) => delete errors[key]);
}

async function submit() {
  clearErrors();
  successMessage.value = '';
  isSubmitting.value = true;

  try {
    const body = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      tier: form.tier,
      address: form.address.trim(),
      latitude: form.latitude === '' ? null : Number(form.latitude),
      longitude: form.longitude === '' ? null : Number(form.longitude),
      summary: form.summary.trim(),
      verdict: form.verdict.trim(),
      pullQuote: form.pullQuote.trim(),
      lunchSpecial: form.lunchSpecial.trim(),
      websiteUrl: form.websiteUrl.trim() || '',
      imageUrl: form.imageUrl.trim() || '',
      published: form.published,
    };

    const response = await fetch(props.mode === 'create' ? '/api/admin/venues' : `/api/admin/venues/${form.id}`, {
      method: props.mode === 'create' ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      const fieldErrors = result.fields ?? {};
      Object.entries(fieldErrors).forEach(([field, value]) => {
        setError(field, String(value));
      });
      if (result.error) {
        setError('form', String(result.error));
      }
      return;
    }

    successMessage.value = props.mode === 'create' ? 'Venue created successfully.' : 'Venue saved successfully.';

    if (props.mode === 'create' && result.venue?.id) {
      window.location.href = `/admin/venues/${result.venue.id}`;
    }
  } catch (error) {
    console.error('Venue save failed', error);
    setError('form', 'Unable to save this venue right now.');
  } finally {
    isSubmitting.value = false;
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (form.name || form.slug || form.summary || form.verdict) {
    event.preventDefault();
    event.returnValue = '';
  }
}

watch(() => [form.name, form.slug, form.summary, form.verdict], () => {
  if (typeof window !== 'undefined') {
    window.onbeforeunload = handleBeforeUnload;
  }
});
</script>

<template>
  <form class="space-y-6 rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] p-6 shadow-sm" @submit.prevent="submit">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-xs font-bold uppercase tracking-[0.2em] text-[#8a5100]">Venue record</p>
        <h2 class="mt-2 text-2xl font-bold text-[#1a1e24]">{{ formTitle }}</h2>
      </div>
      <label class="inline-flex items-center gap-2 text-sm font-semibold text-[#1a1e24]">
        <input v-model="form.published" type="checkbox" class="h-4 w-4 rounded border-[#d9cfb8]" />
        Publish immediately
      </label>
    </div>

    <div v-if="errors.form" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ errors.form }}
    </div>

    <div v-if="successMessage" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {{ successMessage }}
    </div>

    <div class="grid gap-5 md:grid-cols-2">
      <label class="block text-sm font-semibold text-[#1a1e24] md:col-span-2">
        <span class="mb-2 block">Venue name</span>
        <input v-model="form.name" type="text" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B]" />
        <span v-if="errors.name" class="mt-1 block text-xs text-red-700">{{ errors.name }}</span>
      </label>

      <label class="block text-sm font-semibold text-[#1a1e24]">
        <span class="mb-2 block">Slug</span>
        <input v-model="form.slug" type="text" @input="handleSlugInput" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B]" />
        <span v-if="errors.slug" class="mt-1 block text-xs text-red-700">{{ errors.slug }}</span>
      </label>

      <label class="block text-sm font-semibold text-[#1a1e24]">
        <span class="mb-2 block">Tier</span>
        <select v-model="form.tier" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B]">
          <option v-for="option in tierOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
        <span v-if="errors.tier" class="mt-1 block text-xs text-red-700">{{ errors.tier }}</span>
      </label>

      <label class="block text-sm font-semibold text-[#1a1e24] md:col-span-2">
        <span class="mb-2 block">Address</span>
        <input v-model="form.address" type="text" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B]" />
        <span v-if="errors.address" class="mt-1 block text-xs text-red-700">{{ errors.address }}</span>
      </label>

      <label class="block text-sm font-semibold text-[#1a1e24]">
        <span class="mb-2 block">Latitude</span>
        <input v-model="form.latitude" type="number" step="0.000001" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B]" />
        <span v-if="errors.latitude" class="mt-1 block text-xs text-red-700">{{ errors.latitude }}</span>
      </label>

      <label class="block text-sm font-semibold text-[#1a1e24]">
        <span class="mb-2 block">Longitude</span>
        <input v-model="form.longitude" type="number" step="0.000001" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B]" />
        <span v-if="errors.longitude" class="mt-1 block text-xs text-red-700">{{ errors.longitude }}</span>
      </label>

      <label class="block text-sm font-semibold text-[#1a1e24] md:col-span-2">
        <span class="mb-2 block">Summary</span>
        <textarea v-model="form.summary" rows="3" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B]"></textarea>
        <span v-if="errors.summary" class="mt-1 block text-xs text-red-700">{{ errors.summary }}</span>
      </label>

      <div class="md:col-span-2 rounded-xl border border-dashed border-[#d9cfb8] bg-white p-4">
        <div class="mb-2 flex items-center justify-between gap-4">
          <span class="text-sm font-semibold text-[#1a1e24]">Verdict</span>
          <button type="button" class="rounded-lg border border-[#d9cfb8] bg-[#f9f7f1] px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#1a1e24]" @click="showPreview = !showPreview">
            {{ showPreview ? 'Hide preview' : 'Preview' }}
          </button>
        </div>
        <textarea v-model="form.verdict" rows="4" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B]"></textarea>
        <div v-if="showPreview" class="mt-3 rounded-lg border border-[#d9cfb8] bg-[#f7f3eb] p-3 text-sm whitespace-pre-wrap text-[#2d2d2d]">
          {{ form.verdict || 'No verdict entered yet.' }}
        </div>
        <span v-if="errors.verdict" class="mt-1 block text-xs text-red-700">{{ errors.verdict }}</span>
      </div>

      <label class="block text-sm font-semibold text-[#1a1e24]">
        <span class="mb-2 block">Pull quote</span>
        <input v-model="form.pullQuote" type="text" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B]" />
        <span v-if="errors.pullQuote" class="mt-1 block text-xs text-red-700">{{ errors.pullQuote }}</span>
      </label>

      <label class="block text-sm font-semibold text-[#1a1e24]">
        <span class="mb-2 block">Lunch special</span>
        <input v-model="form.lunchSpecial" type="text" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B]" />
        <span v-if="errors.lunchSpecial" class="mt-1 block text-xs text-red-700">{{ errors.lunchSpecial }}</span>
      </label>

      <label class="block text-sm font-semibold text-[#1a1e24] md:col-span-2">
        <span class="mb-2 block">Website URL</span>
        <input v-model="form.websiteUrl" type="url" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B]" />
        <span v-if="errors.websiteUrl" class="mt-1 block text-xs text-red-700">{{ errors.websiteUrl }}</span>
      </label>

      <label class="block text-sm font-semibold text-[#1a1e24] md:col-span-2">
        <span class="mb-2 block">Image URL</span>
        <input v-model="form.imageUrl" type="url" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B]" />
        <span v-if="errors.imageUrl" class="mt-1 block text-xs text-red-700">{{ errors.imageUrl }}</span>
      </label>
    </div>

    <div class="flex items-center justify-end gap-3 border-t border-[#d9cfb8] pt-4">
      <a href="/admin/venues" class="rounded-lg border border-[#d9cfb8] bg-white px-4 py-2.5 text-sm font-semibold text-[#1a1e24] hover:bg-[#f5efe5]">
        Cancel
      </a>
      <button type="submit" :disabled="isSubmitting" class="rounded-lg bg-[#1B2F6B] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#111E47] disabled:cursor-not-allowed disabled:opacity-70">
        {{ isSubmitting ? 'Saving…' : 'Save venue' }}
      </button>
    </div>
  </form>
</template>
