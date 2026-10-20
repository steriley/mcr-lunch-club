<script setup lang="ts">
import { ref } from 'vue';
import { authClient } from '@/lib/auth-client';

const message = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);

async function signOutOtherSessions() {
  message.value = '';
  errorMessage.value = '';
  isSubmitting.value = true;

  try {
    const result = await authClient.revokeOtherSessions();
    if (result.error) {
      errorMessage.value = 'Unable to sign out other sessions right now.';
      return;
    }
    message.value = 'All other sessions have been signed out.';
  } catch (error) {
    console.error('Revoking sessions failed', error);
    errorMessage.value = 'Unable to sign out other sessions right now.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <section class="space-y-4 rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] p-6 shadow-sm">
    <div>
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-[#8a5100]">Sessions</p>
      <h2 class="mt-2 text-2xl font-bold text-[#1a1e24]">Other devices</h2>
      <p class="mt-2 text-sm text-[#3d3d3d]">Sign out everywhere except this browser, for example after using a shared computer.</p>
    </div>

    <p v-if="errorMessage" role="alert" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ errorMessage }}
    </p>
    <p v-if="message" role="status" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {{ message }}
    </p>

    <button
      type="button"
      :disabled="isSubmitting"
      class="inline-flex w-full items-center justify-center rounded-lg border border-[#d9cfb8] bg-white px-4 py-3 text-sm font-semibold text-[#1a1e24] transition hover:bg-[#f5efe5] disabled:cursor-not-allowed disabled:opacity-70"
      @click="signOutOtherSessions"
    >
      {{ isSubmitting ? 'Signing out…' : 'Sign out of other sessions' }}
    </button>
  </section>
</template>
