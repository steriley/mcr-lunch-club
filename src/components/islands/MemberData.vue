<script setup lang="ts">
import { ref } from 'vue';
import { apiFetch } from '@/lib/api-fetch';

/**
 * The member's data (#136): download it as JSON, or delete the account and everything with it.
 * Deleting needs a sign-in in the last few minutes (`freshSignIn`, checked again on the server),
 * so someone holding a stolen session can't do it.
 */
const props = defineProps<{ freshSignIn: boolean }>();

const CONFIRM_WORD = 'delete';

const confirmText = ref('');
const errorMessage = ref('');
const isDeleting = ref(false);
const freshSignIn = ref(props.freshSignIn);
const reauthLink = '/members/sign-in?next=%2Fmembers%2Fme%2Fdata';

async function deleteAccount() {
  errorMessage.value = '';
  if (confirmText.value.trim().toLowerCase() !== CONFIRM_WORD) {
    errorMessage.value = `Type “${CONFIRM_WORD}” to confirm.`;
    return;
  }
  isDeleting.value = true;
  const result = await apiFetch('/api/member/account', {
    method: 'DELETE',
    body: { confirm: CONFIRM_WORD },
    fallback: 'Unable to delete your account. Please try again.',
  });
  isDeleting.value = false;
  if (!result.ok) {
    if (result.fields.form === 'fresh_sign_in_required') freshSignIn.value = false;
    errorMessage.value = result.error;
    return;
  }
  window.location.assign('/?account=deleted');
}

const inputClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-navy';
</script>

<template>
  <div class="space-y-6">
    <section class="space-y-3 rounded-2xl border border-hairline bg-parchment p-6 shadow-sm">
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-ochre">Your data</p>
      <h2 class="text-2xl font-bold text-ink">Download a copy</h2>
      <p class="text-sm text-soot">
        Everything the club holds about you, as a JSON file: your account, profile, passkeys,
        signed-in devices and any action the Chairs took on your account.
      </p>
      <a
        href="/api/member/export"
        download
        data-testid="member-export"
        class="inline-flex min-h-11 items-center rounded-lg border border-hairline bg-surface px-4 text-sm font-semibold text-ink hover:bg-linen"
        >Download my data</a
      >
    </section>

    <section
      class="space-y-3 rounded-2xl border border-red-200 bg-parchment p-6 shadow-sm"
      data-testid="member-delete"
    >
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-red-700">Danger zone</p>
      <h2 class="text-2xl font-bold text-ink">Delete your account</h2>
      <p class="text-sm text-soot">
        Your account, display name, passkeys and everything else about you are deleted at once and
        can’t be recovered. You can join again later with the same email.
      </p>

      <p
        v-if="errorMessage"
        role="alert"
        class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {{ errorMessage }}
      </p>

      <p v-if="!freshSignIn" class="text-sm text-coal">
        To keep your account safe,
        <a :href="reauthLink" class="font-semibold text-navy underline">sign in again</a>
        first. You then have a few minutes to delete it.
      </p>
      <form v-else class="space-y-3" novalidate @submit.prevent="deleteAccount">
        <label class="block text-sm font-semibold text-ink">
          <span class="mb-2 block">Type “{{ CONFIRM_WORD }}” to confirm</span>
          <input v-model="confirmText" name="confirm" autocomplete="off" :class="inputClass" />
        </label>
        <button
          type="submit"
          data-testid="member-delete-account"
          :disabled="isDeleting"
          class="inline-flex min-h-11 items-center rounded-lg bg-danger px-4 text-sm font-semibold text-white hover:bg-danger-strong disabled:opacity-60"
        >
          {{ isDeleting ? 'Deleting…' : 'Delete my account' }}
        </button>
      </form>
    </section>
  </div>
</template>
