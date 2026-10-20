<script setup lang="ts">
import { ref } from 'vue';
import { IMAGE_CONTENT_TYPES, MAX_IMAGE_BYTES, imageUploadPath } from '@/lib/image-upload';

const props = defineProps<{ enabled: boolean; error?: string }>();
const imageUrl = defineModel<string>({ required: true });

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
    <label class="block text-sm font-semibold text-[#1a1e24]">
      <span class="mb-2 block">Image</span>
      <input
        v-model="imageUrl"
        type="url"
        placeholder="https://…"
        class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none focus:border-[#1B2F6B]"
      />
      <span class="mt-1 block text-xs font-normal text-[#535353]">
        {{ props.enabled ? 'Paste an image link or upload a file (JPEG, PNG, WebP, AVIF or GIF, up to 4 MB).' : 'Paste an image link. Uploads are available once Vercel Blob is configured.' }}
      </span>
    </label>

    <div v-if="props.enabled" class="flex flex-wrap items-center gap-3">
      <label class="inline-flex cursor-pointer items-center rounded-lg border border-[#d9cfb8] bg-white px-4 py-2 text-sm font-semibold text-[#1a1e24] hover:bg-[#f5efe5] focus-within:ring-2 focus-within:ring-[#1B2F6B]">
        <input ref="fileInput" type="file" :accept="IMAGE_CONTENT_TYPES.join(',')" class="sr-only" :disabled="progress !== null" @change="onFileSelected" />
        {{ progress !== null ? `Uploading… ${Math.round(progress)}%` : 'Upload image' }}
      </label>
      <button v-if="imageUrl" type="button" class="text-sm font-semibold text-red-700 underline" @click="imageUrl = ''">Remove image</button>
    </div>

    <p v-if="uploadError || props.error" role="alert" class="text-xs font-medium text-red-700">{{ uploadError || props.error }}</p>

    <img v-if="imageUrl && /^https?:\/\//.test(imageUrl)" :src="imageUrl" alt="Venue image preview" class="max-h-48 rounded-lg border border-[#d9cfb8] object-cover" />
  </div>
</template>
