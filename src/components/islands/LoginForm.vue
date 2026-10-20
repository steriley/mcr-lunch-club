<script setup lang="ts">
import { ref } from 'vue';
import { authClient } from '@/lib/auth-client';
import { safeAdminRedirect } from '@/lib/safe-redirect';

const props = defineProps<{ next?: string }>();

const email = ref('');
const password = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);

async function handleSubmit() {
  errorMessage.value = '';

  if (!email.value.trim() || !password.value.trim()) {
    errorMessage.value = 'Please enter your email and password.';
    return;
  }

  isSubmitting.value = true;

  try {
    const result = await authClient.signIn.email({
      email: email.value.trim(),
      password: password.value,
      rememberMe: true,
    });

    if (result.error) {
      // Never reveal whether an email exists.
      if (result.error.status === 429) {
        errorMessage.value = 'Too many sign-in attempts. Please wait a minute and try again.';
      } else if (result.error.code === 'BANNED_USER') {
        errorMessage.value = 'This account has been deactivated.';
      } else {
        errorMessage.value = 'Invalid email or password.';
      }
      return;
    }

    window.location.assign(safeAdminRedirect(props.next));
  } catch (error) {
    console.error('Login failed', error);
    errorMessage.value = 'Unable to sign in right now. Please try again.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <form class="mx-auto max-w-md rounded-2xl border border-[#d9cfb8] bg-[#f9f7f1] p-6 shadow-sm" @submit.prevent="handleSubmit">
    <div class="mb-5">
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-[#8a5100]">Chairs' Area</p>
      <h1 class="mt-2 text-3xl font-bold text-[#1a1e24]">Sign in</h1>
    </div>

    <div class="space-y-4">
      <label class="block text-sm font-semibold text-[#1a1e24]">
        <span class="mb-2 block">Email</span>
        <input v-model="email" type="email" autocomplete="email" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none ring-0 focus:border-[#1B2F6B]" placeholder="chair@mcrlunch.club" />
      </label>

      <label class="block text-sm font-semibold text-[#1a1e24]">
        <span class="mb-2 block">Password</span>
        <input v-model="password" type="password" autocomplete="current-password" class="w-full rounded-lg border border-[#d9cfb8] bg-white px-3 py-2.5 text-base text-[#1a1e24] outline-none ring-0 focus:border-[#1B2F6B]" placeholder="••••••••••••" />
      </label>
    </div>

    <p v-if="errorMessage" class="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {{ errorMessage }}
    </p>

    <button
      type="submit"
      :disabled="isSubmitting"
      class="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[#1B2F6B] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#111E47] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {{ isSubmitting ? 'Signing in…' : 'Sign in' }}
    </button>
  </form>
</template>
