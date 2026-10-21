<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DossierIcon from './dossier/DossierIcon.vue';
import { IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES, imageUploadPath } from '@/lib/image-upload';

/**
 * The venue's photographic plate: a preview of the image (link typed in the
 * form, or uploaded to Vercel Blob here), its real size, and a toggle between
 * the public crop and the whole frame. The crop is a preview only.
 */
const props = defineProps<{ enabled: boolean; error?: string; venueName: string }>();
const imageUrl = defineModel<string>({ required: true });

const hasImage = computed(() => /^https?:\/\//.test(imageUrl.value));
const wholeFrame = ref(false);
const naturalSize = ref('');
const broken = ref(false);
watch(imageUrl, () => {
  naturalSize.value = '';
  broken.value = false;
});

function onLoad(event: Event) {
  const image = event.target as HTMLImageElement;
  naturalSize.value = `${image.naturalWidth}×${image.naturalHeight}`;
}

const uploadError = ref('');
const progress = ref<number | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

async function onFileSelected(event: Event) {
  uploadError.value = '';
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  if (!IMAGE_CONTENT_TYPES.includes(file.type)) {
    uploadError.value = 'Choose a JPEG, PNG, WebP, AVIF or GIF image.';
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    uploadError.value = 'Images must be 4 MB or smaller.';
    return;
  }

  progress.value = 0;
  try {
    // Loaded on demand so the Blob client only ships when an upload happens.
    const { upload } = await import('@vercel/blob/client');
    const blob = await upload(imageUploadPath(file.name), file, {
      access: 'public',
      handleUploadUrl: '/api/admin/upload',
      contentType: file.type,
      onUploadProgress: ({ percentage }) => {
        progress.value = percentage;
      },
    });
    imageUrl.value = blob.url;
  } catch (error) {
    console.error('Image upload failed', error);
    uploadError.value = 'Upload failed. Please try again.';
  } finally {
    progress.value = null;
    if (fileInput.value) fileInput.value.value = '';
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-col gap-4 rounded-lg border border-[var(--dossier-border)] bg-[var(--dossier-paper)] p-3 sm:flex-row">
      <div class="relative aspect-[3/2] w-full shrink-0 overflow-hidden rounded-md bg-[var(--dossier-border)] sm:w-48">
        <img
          v-if="hasImage && !broken"
          :src="imageUrl"
          :alt="`${venueName || 'Venue'} plate preview`"
          :class="['h-full w-full', wholeFrame ? 'object-contain' : 'object-cover']"
          @load="onLoad"
          @error="broken = true"
        />
        <div v-else class="flex h-full w-full items-center justify-center text-[var(--dossier-muted)]">
          <DossierIcon name="image" :size="28" />
        </div>
        <span v-if="naturalSize" class="dossier-mono absolute bottom-1.5 right-1.5 rounded bg-[#1E1B17]/75 px-1.5 py-0.5 text-[10px] text-[#FBF6EA]">{{ naturalSize }}</span>
      </div>
      <div class="min-w-0 flex-1 space-y-1.5">
        <p class="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--dossier-secondary)]">
          <DossierIcon name="checkCircle" :size="13" /> Current archival photographic plate
        </p>
        <p class="dossier-serif text-lg font-semibold text-[var(--dossier-primary)]">
          {{ broken ? 'That link did not load' : hasImage ? `${venueName || 'Venue'} plate` : 'No plate on file' }}
        </p>
        <p class="text-[13px] text-[var(--dossier-muted)]">
          {{
            broken
              ? 'Check the image link: it must be a direct link to an image file.'
              : hasImage
                ? 'Shown on the venue page, the map sheet and The Golden Cut.'
                : props.enabled
                  ? 'Paste an image link above or upload one (JPEG, PNG, WebP, AVIF or GIF, up to 4 MB).'
                  : 'Paste an image link above. Uploads are available once Vercel Blob is configured.'
          }}
        </p>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <label v-if="props.enabled" class="dossier-link inline-flex cursor-pointer items-center gap-1 focus-within:underline">
            <input ref="fileInput" type="file" :accept="IMAGE_CONTENT_TYPES.join(',')" class="sr-only" :disabled="progress !== null" @change="onFileSelected" />
            <DossierIcon name="upload" :size="14" />
            {{ progress !== null ? `Uploading… ${Math.round(progress)}%` : hasImage ? 'Replace plate' : 'Upload plate' }}
          </label>
          <button v-if="hasImage && !broken" type="button" class="dossier-link inline-flex items-center gap-1" :aria-pressed="wholeFrame" @click="wholeFrame = !wholeFrame">
            <DossierIcon name="crop" :size="14" /> {{ wholeFrame ? 'Show public crop' : 'Reframe crop' }}
          </button>
          <button v-if="imageUrl" type="button" class="dossier-link is-danger inline-flex items-center gap-1" @click="imageUrl = ''">
            <DossierIcon name="trash" :size="14" /> Clear plate
          </button>
        </div>
      </div>
    </div>
    <p v-if="uploadError || props.error" role="alert" class="dossier-error mt-0">{{ uploadError || props.error }}</p>
  </div>
</template>
