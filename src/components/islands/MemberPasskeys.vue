<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { authClient } from '@/lib/auth-client';
import { formatDate } from '@/lib/dates';
import { browserHasWebAuthn, canOfferPasskey } from '@/lib/passkey-support';

/**
 * A member's passkeys (#136): list, add and remove. Members have no password, so adding one is
 * allowed only for a few minutes after an email sign-in (src/lib/auth-config.ts); after that, the
 * member signs in by email again first.
 */
const props = defineProps<{
  passkeyHost: string | null;
  /** The member signed in by email recently enough to add a passkey now. */
  canAddNow: boolean;
}>();

interface PasskeyRow {
  id: string;
  name?: string | null;
  createdAt?: string | Date | null;
}

const passkeys = ref<PasskeyRow[]>([]);
const isLoading = ref(true);
const supported = ref(false);
const canAddNow = ref(props.canAddNow);
const message = ref('');
const errorMessage = ref('');
const isAdding = ref(false);
const busy = ref<Record<string, boolean>>({});

const label = (row: PasskeyRow) => row.name?.trim() || 'Passkey';
const reauthLink = '/members/sign-in?next=%2Fmembers%2Fme';

async function load() {
  const result = await authClient.passkey.listUserPasskeys();
  isLoading.value = false;
  if (result.error) {
    errorMessage.value = 'Unable to load your passkeys.';
    return;
  }
  passkeys.value = (result.data ?? []) as PasskeyRow[];
}

onMounted(() => {
  supported.value = canOfferPasskey({
    pageHost: window.location.host,
    passkeyHost: props.passkeyHost,
    hasWebAuthn: browserHasWebAuthn(),
  });
  void load();
});

async function addPasskey() {
  message.value = '';
  errorMessage.value = '';
  isAdding.value = true;
  try {
    const result = await authClient.passkey.addPasskey();
    if (result.error) {
      const code = (result.error as { code?: string }).code;
      if (code === 'PASSKEY_PASSWORD_REQUIRED') {
        canAddNow.value = false;
        errorMessage.value = 'Sign in by email again, then add your passkey straight away.';
      } else if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
        errorMessage.value = 'This device already has a passkey for your account.';
      } else if (code !== 'ERROR_CEREMONY_ABORTED' && code !== 'AUTH_CANCELLED') {
        errorMessage.value = 'Unable to add the passkey. Please try again.';
      }
      return;
    }
    // One email sign-in, one passkey.
    canAddNow.value = false;
    message.value = 'Passkey added. Next time, sign in with it instead of waiting for an email.';
    await load();
  } finally {
    isAdding.value = false;
  }
}

async function remove(row: PasskeyRow) {
  message.value = '';
  errorMessage.value = '';
  busy.value[row.id] = true;
  const result = await authClient.passkey.deletePasskey({ id: row.id });
  busy.value[row.id] = false;
  if (result.error) {
    errorMessage.value = 'Unable to remove the passkey.';
    return;
  }
  passkeys.value = passkeys.value.filter((item) => item.id !== row.id);
  message.value = `${label(row)} removed.`;
}

const button =
  'inline-flex min-h-11 items-center justify-center rounded-lg border border-hairline bg-surface px-4 text-sm font-semibold text-ink hover:bg-linen disabled:opacity-60';
</script>

<template>
  <section
    class="space-y-4 rounded-2xl border border-hairline bg-parchment p-6 shadow-sm"
    data-testid="member-passkeys"
  >
    <div>
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-ochre">Signing in</p>
      <h2 class="mt-2 text-2xl font-bold text-ink">Passkeys</h2>
      <p class="mt-2 text-sm text-soot">
        Sign in with your phone, computer or security key instead of waiting for an email.
      </p>
    </div>

    <p
      v-if="message"
      role="status"
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
    >
      {{ message }}
    </p>
    <p
      v-if="errorMessage"
      role="alert"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMessage }}
    </p>

    <p v-if="isLoading" class="text-sm text-soot">Loading passkeys…</p>
    <p v-else-if="passkeys.length === 0" class="text-sm text-soot">You have no passkeys yet.</p>
    <ul v-else class="divide-y divide-sand rounded-xl border border-hairline bg-surface">
      <li
        v-for="row in passkeys"
        :key="row.id"
        class="flex flex-wrap items-center gap-3 px-4 py-3"
        data-testid="member-passkey-row"
      >
        <div class="min-w-0 flex-1">
          <div class="font-semibold text-ink">{{ label(row) }}</div>
          <div class="text-xs text-graphite">Added {{ formatDate(row.createdAt ?? null) }}</div>
        </div>
        <button type="button" :class="button" :disabled="busy[row.id]" @click="remove(row)">
          Remove
        </button>
      </li>
    </ul>

    <template v-if="supported">
      <button
        v-if="canAddNow"
        type="button"
        data-testid="member-add-passkey"
        :class="button"
        :disabled="isAdding"
        @click="addPasskey"
      >
        {{ isAdding ? 'Waiting for your device…' : 'Add a passkey' }}
      </button>
      <p v-else class="text-sm text-soot">
        To add a passkey,
        <a :href="reauthLink" class="font-semibold text-navy underline">sign in by email again</a>
        and add it straight away.
      </p>
    </template>
    <p v-else class="text-sm text-soot">
      Passkeys work on the club’s main address, in a browser that supports them.
    </p>
  </section>
</template>
