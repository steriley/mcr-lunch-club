<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import DossierIcon from './dossier/DossierIcon.vue';
import { CAPTION_MAX, MAX_IMAGES_PER_VENUE, focalStyle } from '@/lib/image-upload';
import { OptimiseError, optimiseImage } from '@/lib/optimise-image';
import type { SerializedVenueImage } from '@/lib/image-upload';
import { apiFetch, failureText } from '@/lib/api-fetch';

/**
 * Venue photos on the edit page (#35). Every change here applies at once
 * through its own request; none of it waits for the form's Save button.
 * Picked photos are optimised in the browser one at a time, then uploaded
 * one at a time, each with its own status and Retry.
 */
const props = defineProps<{ venueId: string; venueName: string; uploadsEnabled: boolean }>();
const images = defineModel<SerializedVenueImage[]>('images', { required: true });

type QueueStatus = 'waiting' | 'optimising' | 'uploading' | 'done' | 'failed';
interface QueueItem {
  key: number;
  file: File;
  name: string;
  status: QueueStatus;
  message: string;
}

const STATUS_TEXT: Record<QueueStatus, string> = {
  waiting: 'Waiting',
  optimising: 'Optimising…',
  uploading: 'Uploading…',
  done: 'Done',
  failed: 'Failed',
};

const queue = ref<QueueItem[]>([]);
const notice = ref('');
const error = ref('');
const busy = reactive<Record<string, boolean>>({});
let nextKey = 1;
let running = false;

const base = computed(() => `/api/admin/venues/${props.venueId}/images`);
// Queued and failed photos hold their slot until they upload or are removed.
const reserved = computed(() => queue.value.filter((item) => item.status !== 'done').length);
const freeSlots = computed(() => Math.max(0, MAX_IMAGES_PER_VENUE - images.value.length - reserved.value));

function onPick(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (!files.length) return;
  notice.value = '';
  error.value = '';
  const accepted = files.slice(0, freeSlots.value);
  if (accepted.length < files.length) {
    notice.value = `A venue can have ${MAX_IMAGES_PER_VENUE} photos, so only the first ${accepted.length} of those ${files.length} were added.`;
  }
  // Done rows from earlier batches are cleared; failures stay so they can be retried.
  queue.value = queue.value.filter((item) => item.status !== 'done');
  for (const file of accepted) queue.value.push({ key: nextKey++, file, name: file.name || 'Photo', status: 'waiting', message: '' });
  void pump();
}

function failureMessage(cause: unknown): string {
  if (cause instanceof OptimiseError) {
    return cause.reason === 'unsupported_format'
      ? 'This browser cannot read that photo. HEIC photos from an iPhone cannot be opened in desktop Chrome or Firefox: upload from your phone, or export the photo as a JPEG first.'
      : 'The photo optimiser failed to load or could not convert this photo. Check your connection and try again.';
  }
  return 'Upload failed. Check your connection and try again.';
}

async function handle(item: QueueItem) {
  item.message = '';
  item.status = 'optimising';
  let optimised;
  try {
    optimised = await optimiseImage(item.file);
  } catch (cause) {
    console.error('Photo optimisation failed', cause);
    item.status = 'failed';
    item.message = failureMessage(cause);
    return;
  }

  item.status = 'uploading';
  try {
    const form = new FormData();
    form.set('full', optimised.full, 'full.webp');
    form.set('thumb', optimised.thumb, 'thumb.webp');
    form.set('width', String(optimised.width));
    form.set('height', String(optimised.height));
    const result = await apiFetch<{ image: SerializedVenueImage }>(base.value, {
      method: 'POST',
      body: form,
      fallback: 'Upload failed. Please try again.',
      offline: 'Upload failed. Check your connection and try again.',
    });
    if (!result.ok) {
      item.status = 'failed';
      item.message = result.error;
      return;
    }
    images.value = [...images.value, result.data.image];
    item.status = 'done';
  } catch (cause) {
    console.error('Photo upload failed', cause);
    item.status = 'failed';
    item.message = failureMessage(cause);
  }
}

/** One photo at a time, never in parallel: decoding and encoding full-size photos is heavy on a phone. */
async function pump() {
  if (running) return;
  running = true;
  try {
    for (let item = queue.value.find((entry) => entry.status === 'waiting'); item; item = queue.value.find((entry) => entry.status === 'waiting')) {
      await handle(item);
    }
  } finally {
    running = false;
  }
}

function retry(item: QueueItem) {
  item.status = 'waiting';
  item.message = '';
  void pump();
}

function dismiss(item: QueueItem) {
  queue.value = queue.value.filter((entry) => entry.key !== item.key);
}

async function send(image: SerializedVenueImage, method: 'PATCH' | 'DELETE', body?: unknown) {
  error.value = '';
  busy[image.id] = true;
  const result = await apiFetch<{ image: SerializedVenueImage; promoted?: SerializedVenueImage | null }>(`${base.value}/${image.id}`, {
    method,
    body,
    fallback: 'That did not save. Please try again.',
    offline: 'That did not save. Check your connection and try again.',
  });
  busy[image.id] = false;
  if (!result.ok) {
    error.value = failureText(result);
    return null;
  }
  return result.data;
}

async function makePrimary(image: SerializedVenueImage) {
  const result = await send(image, 'PATCH', { isPrimary: true });
  if (result) images.value = images.value.map((entry) => (entry.id === image.id ? result.image : { ...entry, isPrimary: false }));
}

// Caption: edited inline, one photo at a time.
const editingCaption = ref<string | null>(null);
const captionDraft = ref('');
function editCaption(image: SerializedVenueImage) {
  editingCaption.value = image.id;
  captionDraft.value = image.caption ?? '';
}
async function saveCaption(image: SerializedVenueImage) {
  const result = await send(image, 'PATCH', { caption: captionDraft.value.trim() || null });
  if (!result) return;
  replace(result.image);
  editingCaption.value = null;
}

// Focal point: tap the whole-frame preview; each tap saves.
const focusing = ref<string | null>(null);
const focusImage = computed(() => images.value.find((image) => image.id === focusing.value) ?? null);
async function setFocal(event: MouseEvent) {
  const image = focusImage.value;
  if (!image || busy[image.id]) return;
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));
  const focalX = clamp(((event.clientX - box.left) / box.width) * 100);
  const focalY = clamp(((event.clientY - box.top) / box.height) * 100);
  const result = await send(image, 'PATCH', { focalX, focalY });
  if (result) replace(result.image);
}
async function resetFocal() {
  const image = focusImage.value;
  if (!image) return;
  const result = await send(image, 'PATCH', { focalX: null, focalY: null });
  if (result) replace(result.image);
}

function replace(updated: SerializedVenueImage) {
  images.value = images.value.map((entry) => (entry.id === updated.id ? updated : entry));
}

// Delete, with confirmation.
const deleting = ref<SerializedVenueImage | null>(null);
async function confirmDelete() {
  const image = deleting.value;
  deleting.value = null;
  if (!image) return;
  const result = await send(image, 'DELETE');
  if (!result) return;
  if (focusing.value === image.id) focusing.value = null;
  images.value = images.value
    .filter((entry) => entry.id !== image.id)
    .map((entry) => (result.promoted && entry.id === result.promoted.id ? result.promoted : entry));
}

const altFor = (image: SerializedVenueImage) => image.caption || props.venueName || 'Venue photo';
</script>

<template>
  <section class="space-y-3" aria-labelledby="venue-photos-title">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="venue-photos-title" class="dossier-label mb-0">Photos ({{ images.length }} of {{ MAX_IMAGES_PER_VENUE }})</h3>
      <p class="dossier-hint mt-0 flex items-center gap-1"><DossierIcon name="info" :size="13" /> Photo changes save straight away. The Save button is not needed.</p>
    </div>

    <ul v-if="images.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <li v-for="image in images" :key="image.id" class="overflow-hidden rounded-lg border border-[var(--dossier-border)] bg-[var(--dossier-paper)]">
        <div class="relative aspect-[3/2] bg-[var(--dossier-border)]">
          <img
            :src="image.thumbUrl ?? image.fullUrl"
            :alt="altFor(image)"
            :style="{ objectPosition: focalStyle(image) }"
            class="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <span v-if="image.isPrimary" class="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-[var(--dossier-primary)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-parchment">
            <DossierIcon name="badge" :size="11" /> Primary
          </span>
        </div>
        <div class="space-y-2 p-2">
          <form v-if="editingCaption === image.id" class="space-y-1.5" @submit.prevent="saveCaption(image)">
            <label class="sr-only" :for="`caption-${image.id}`">Caption</label>
            <input :id="`caption-${image.id}`" v-model="captionDraft" class="dossier-input py-1 text-[13px]" :maxlength="CAPTION_MAX" placeholder="Caption (also the alt text)" />
            <div class="flex gap-3">
              <button type="submit" class="dossier-link inline-flex items-center gap-1" :disabled="busy[image.id]"><DossierIcon name="check" :size="13" /> Save caption</button>
              <button type="button" class="dossier-link" @click="editingCaption = null">Cancel</button>
            </div>
          </form>
          <p v-else class="min-h-[1.25rem] text-[12px] text-[var(--dossier-muted)]">{{ image.caption || 'No caption' }}</p>
          <div class="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
            <button v-if="!image.isPrimary" type="button" class="dossier-link inline-flex items-center gap-1" :disabled="busy[image.id]" @click="makePrimary(image)">
              <DossierIcon name="badge" :size="13" /> Make primary
            </button>
            <button v-if="editingCaption !== image.id" type="button" class="dossier-link inline-flex items-center gap-1" :disabled="busy[image.id]" @click="editCaption(image)">
              <DossierIcon name="feather" :size="13" /> Edit caption
            </button>
            <button type="button" class="dossier-link inline-flex items-center gap-1" :aria-pressed="focusing === image.id" @click="focusing = focusing === image.id ? null : image.id">
              <DossierIcon name="crop" :size="13" /> Set focal point
            </button>
            <button type="button" class="dossier-link is-danger inline-flex items-center gap-1" :disabled="busy[image.id]" @click="deleting = image">
              <DossierIcon name="trash" :size="13" /> Delete
            </button>
          </div>
        </div>
      </li>
    </ul>
    <p v-else class="text-[13px] text-[var(--dossier-muted)]">No photos yet. The public site shows no image area until one is added.</p>

    <div v-if="focusImage" class="space-y-2 rounded-lg border border-[var(--dossier-border)] bg-[var(--dossier-paper)] p-3">
      <p class="text-[13px] text-[var(--dossier-muted)]">
        Tap the part of the photo that must stay in view when it is cropped. Each tap saves.
      </p>
      <div class="flex justify-center">
        <div class="relative inline-block cursor-crosshair select-none" @click="setFocal">
          <img :src="focusImage.fullUrl" :alt="altFor(focusImage)" class="block max-h-[60vh] max-w-full" draggable="false" />
          <span
            class="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,24,84,0.8)]"
            :style="{ left: `${focusImage.focalX ?? 50}%`, top: `${focusImage.focalY ?? 50}%` }"
            aria-hidden="true"
          >
            <span class="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          </span>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-4 text-[13px]">
        <span class="dossier-figures text-[12px] text-[var(--dossier-muted)]">{{ focusImage.focalX === null ? 'Centred' : `${focusImage.focalX}% across, ${focusImage.focalY}% down` }}</span>
        <button type="button" class="dossier-link" :disabled="busy[focusImage.id] || focusImage.focalX === null" @click="resetFocal">Reset to centre</button>
        <button type="button" class="dossier-link" @click="focusing = null">Done</button>
      </div>
    </div>

    <div v-if="uploadsEnabled" class="space-y-2">
      <label :class="['dossier-btn inline-flex items-center gap-1.5', freeSlots === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer']">
        <input type="file" accept="image/*" multiple class="sr-only" :disabled="freeSlots === 0" @change="onPick" />
        <DossierIcon name="upload" :size="16" /> {{ freeSlots === 0 ? `${MAX_IMAGES_PER_VENUE} photo limit reached` : `Add photos (up to ${freeSlots} more)` }}
      </label>
      <p class="dossier-hint mt-0">Photos are resized and converted in your browser before upload; location data is removed.</p>
      <p v-if="notice" class="dossier-hint mt-0 text-[var(--dossier-secondary)]">{{ notice }}</p>
      <ul v-if="queue.length" class="space-y-1.5" aria-live="polite">
        <li v-for="item in queue" :key="item.key" class="rounded-md border border-[var(--dossier-border)] bg-[var(--dossier-field)] px-3 py-2 text-[13px]">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
            <span
              :class="[
                'inline-flex items-center gap-1 font-semibold',
                item.status === 'done' ? 'text-[var(--dossier-green)]' : item.status === 'failed' ? 'text-[var(--dossier-danger)]' : 'text-[var(--dossier-muted)]',
              ]"
            >
              <DossierIcon v-if="item.status === 'done'" name="checkCircle" :size="13" />
              <DossierIcon v-else-if="item.status === 'failed'" name="alert" :size="13" />
              <DossierIcon v-else-if="item.status !== 'waiting'" name="refresh" :size="13" class="dossier-spin" />
              {{ STATUS_TEXT[item.status] }}
            </span>
            <template v-if="item.status === 'failed'">
              <button type="button" class="dossier-link inline-flex items-center gap-1" @click="retry(item)"><DossierIcon name="refresh" :size="13" /> Retry</button>
              <button type="button" class="dossier-link" @click="dismiss(item)">Remove</button>
            </template>
          </div>
          <p v-if="item.message" role="alert" class="dossier-error mt-1">{{ item.message }}</p>
        </li>
      </ul>
    </div>
    <p v-else class="dossier-hint mt-0">Photo uploads are available once Vercel Blob is configured.</p>

    <p v-if="error" role="alert" class="dossier-error mt-0">{{ error }}</p>

    <ConfirmDialog
      :open="deleting !== null"
      title="Delete this photo?"
      :message="deleting?.isPrimary && images.length > 1 ? 'It is the primary photo, so the oldest remaining photo becomes primary. This cannot be undone.' : 'This cannot be undone.'"
      confirm-label="Delete photo"
      @confirm="confirmDelete"
      @cancel="deleting = null"
    />
  </section>
</template>
