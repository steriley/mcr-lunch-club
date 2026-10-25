<script setup lang="ts">
import { ref } from 'vue';
import { authClient } from '@/lib/auth-client';

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const isSubmitting = ref(false);

async function handleSubmit() {
  errorMessage.value = '';
  successMessage.value = '';

  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    errorMessage.value = 'All password fields are required.';
    return;
  }

  if (newPassword.value.length < 12) {
    errorMessage.value = 'New password must be at least 12 characters long.';
    return;
  }

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'The new passwords do not match.';
    return;
  }

  isSubmitting.value = true;

  try {
    const result = await authClient.changePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
      revokeOtherSessions: true,
    });

    if (result.error) {
      errorMessage.value = result.error.status === 429
        ? 'Too many attempts. Please wait a minute and try again.'
        : result.error.message || 'Password update failed.';
      return;
    }

    successMessage.value = 'Password updated. Other sessions have been signed out.';
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (error) {
    console.error('Password update failed', error);
    errorMessage.value = 'Unable to update your password right now.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <form class="space-y-4 rounded-2xl border border-hairline bg-parchment p-6 shadow-sm" @submit.prevent="handleSubmit">
    <div>
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-ochre">Account</p>
      <h2 class="mt-2 text-2xl font-bold text-ink">Change password</h2>
    </div>

    <label class="block text-sm font-semibold text-ink">
      <span class="mb-2 block">Current password</span>
      <input v-model="currentPassword" type="password" autocomplete="current-password" class="w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none ring-0 focus:border-navy" />
    </label>

    <label class="block text-sm font-semibold text-ink">
      <span class="mb-2 block">New password</span>
      <input v-model="newPassword" type="password" autocomplete="new-password" class="w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none ring-0 focus:border-navy" />
    </label>

    <label class="block text-sm font-semibold text-ink">
      <span class="mb-2 block">Confirm new password</span>
      <input v-model="confirmPassword" type="password" autocomplete="new-password" class="w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none ring-0 focus:border-navy" />
    </label>

    <p v-if="errorMessage" role="alert" class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ errorMessage }}
    </p>

    <p v-if="successMessage" role="status" class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {{ successMessage }}
    </p>

    <button
      type="submit"
      :disabled="isSubmitting"
      class="inline-flex w-full items-center justify-center rounded-lg bg-navy-fixed px-4 py-3 text-sm font-semibold text-white transition hover:bg-deep disabled:cursor-not-allowed disabled:opacity-70"
    >
      {{ isSubmitting ? 'Updating…' : 'Update password' }}
    </button>
  </form>
</template>
