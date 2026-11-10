<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import { apiFetch } from '@/lib/api-fetch';
import { authClient } from '@/lib/auth-client';
import { formatDate } from '@/lib/dates';
import { browserHasWebAuthn, canOfferPasskey } from '@/lib/passkey-support';

/**
 * A Chair's passkeys (#153): add, rename and remove. Adding one needs the Chair's password first
 * (POST /api/admin/account/passkey-grant), and only works on the passkey host.
 */
const props = defineProps<{ passkeyHost: string }>();

interface PasskeyRow {
  id: string;
  name?: string | null;
  createdAt?: string | Date | null;
}

const NAME_MAX = 60;

const passkeys = ref<PasskeyRow[]>([]);
const isLoading = ref(true);
const canAdd = ref(false);
const message = ref('');
const errorMessage = ref('');

const isAdding = ref(false);
const newName = ref('');
const password = ref('');
const passwordError = ref('');
const isRegistering = ref(false);

const renaming = ref<string | null>(null);
const renameValue = ref('');
const busy = ref<Record<string, boolean>>({});
const pendingDelete = ref<PasskeyRow | null>(null);

const label = (row: PasskeyRow) => row.name?.trim() || 'Unnamed passkey';

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
  canAdd.value = canOfferPasskey({
    pageHost: window.location.host,
    passkeyHost: props.passkeyHost,
    hasWebAuthn: browserHasWebAuthn(),
  });
  void load();
});

function startAdding() {
  message.value = '';
  errorMessage.value = '';
  passwordError.value = '';
  newName.value = '';
  password.value = '';
  isAdding.value = true;
}

async function addPasskey() {
  passwordError.value = '';
  errorMessage.value = '';
  if (!password.value) {
    passwordError.value = 'Enter your password.';
    return;
  }
  isRegistering.value = true;
  try {
    const grant = await apiFetch('/api/admin/account/passkey-grant', {
      method: 'POST',
      body: { password: password.value },
      fallback: 'Unable to check your password.',
    });
    if (!grant.ok) {
      passwordError.value = grant.fields.password ?? grant.error;
      return;
    }
    password.value = '';
    const name = newName.value.trim().slice(0, NAME_MAX) || undefined;
    const result = await authClient.passkey.addPasskey({ name });
    if (result.error) {
      const code = (result.error as { code?: string }).code;
      errorMessage.value =
        code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'
          ? 'This device already has a passkey for your account.'
          : code === 'ERROR_CEREMONY_ABORTED' || code === 'AUTH_CANCELLED'
            ? 'Adding the passkey was cancelled. Confirm your password to try again.'
            : 'Unable to add the passkey. Confirm your password to try again.';
      return;
    }
    isAdding.value = false;
    message.value = 'Passkey added. You can now sign in with it.';
    await load();
  } finally {
    isRegistering.value = false;
  }
}

function startRename(row: PasskeyRow) {
  renaming.value = row.id;
  renameValue.value = row.name ?? '';
}

async function saveRename(row: PasskeyRow) {
  const name = renameValue.value.trim().slice(0, NAME_MAX);
  if (!name) {
    renaming.value = null;
    return;
  }
  busy.value[row.id] = true;
  const result = await authClient.passkey.updatePasskey({ id: row.id, name });
  busy.value[row.id] = false;
  if (result.error) {
    errorMessage.value = 'Unable to rename the passkey.';
    return;
  }
  row.name = name;
  renaming.value = null;
}

async function confirmDelete() {
  const row = pendingDelete.value;
  pendingDelete.value = null;
  if (!row) return;
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

const inputClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none ring-0 focus:border-navy';
const smallButton =
  'inline-flex min-h-11 items-center whitespace-nowrap rounded-lg border border-hairline bg-surface px-3 text-xs font-semibold text-ink hover:bg-linen disabled:opacity-60';
</script>

<template>
  <section
    id="passkeys"
    class="space-y-4 rounded-2xl border border-hairline bg-parchment p-6 shadow-sm"
    data-testid="passkey-settings"
  >
    <div>
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-ochre">Account</p>
      <h2 class="mt-2 text-2xl font-bold text-ink">Passkeys</h2>
      <p class="mt-2 text-sm text-soot">
        Sign in with your phone, computer or security key instead of typing your password. Your
        password keeps working as a fallback.
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
        data-testid="passkey-row"
      >
        <div class="min-w-0 flex-1">
          <template v-if="renaming === row.id">
            <label class="block text-sm font-semibold text-ink">
              <span class="sr-only">Passkey name</span>
              <input
                v-model="renameValue"
                :maxlength="NAME_MAX"
                :class="inputClass"
                @keydown.enter.prevent="saveRename(row)"
                @keydown.esc="renaming = null"
              />
            </label>
          </template>
          <template v-else>
            <div class="font-semibold text-ink">{{ label(row) }}</div>
            <div class="text-xs text-graphite">Added {{ formatDate(row.createdAt ?? null) }}</div>
          </template>
        </div>
        <div class="flex gap-2">
          <template v-if="renaming === row.id">
            <button
              type="button"
              :class="smallButton"
              :disabled="busy[row.id]"
              @click="saveRename(row)"
            >
              Save
            </button>
            <button type="button" :class="smallButton" @click="renaming = null">Cancel</button>
          </template>
          <template v-else>
            <button
              type="button"
              :class="smallButton"
              :disabled="busy[row.id]"
              @click="startRename(row)"
            >
              Rename
            </button>
            <button
              type="button"
              class="inline-flex min-h-11 items-center rounded-lg bg-danger px-3 text-xs font-semibold text-white hover:bg-danger-strong disabled:opacity-60"
              :disabled="busy[row.id]"
              @click="pendingDelete = row"
            >
              Remove
            </button>
          </template>
        </div>
      </li>
    </ul>

    <template v-if="canAdd">
      <form v-if="isAdding" class="space-y-4" novalidate @submit.prevent="addPasskey">
        <label class="block text-sm font-semibold text-ink">
          <span class="mb-2 block">Name (optional)</span>
          <input
            v-model="newName"
            :maxlength="NAME_MAX"
            autocomplete="off"
            :class="inputClass"
            placeholder="e.g. Phone, Work laptop"
          />
        </label>
        <label class="block text-sm font-semibold text-ink">
          <span class="mb-2 block">Your password</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            :class="inputClass"
            :aria-invalid="Boolean(passwordError)"
            aria-describedby="passkey-password-error"
          />
          <span
            v-if="passwordError"
            id="passkey-password-error"
            class="mt-1 block text-xs font-medium text-red-700"
            >{{ passwordError }}</span
          >
        </label>
        <div class="flex flex-wrap gap-2">
          <button
            type="submit"
            :disabled="isRegistering"
            class="inline-flex min-h-11 items-center justify-center rounded-lg bg-navy-fixed px-4 text-sm font-semibold text-white transition hover:bg-deep disabled:cursor-not-allowed disabled:opacity-70"
          >
            {{ isRegistering ? 'Waiting for your device…' : 'Continue' }}
          </button>
          <button type="button" :class="smallButton" @click="isAdding = false">Cancel</button>
        </div>
      </form>
      <button
        v-else
        type="button"
        class="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-navy-fixed px-4 text-sm font-semibold text-white transition hover:bg-deep"
        @click="startAdding"
      >
        Add a passkey
      </button>
    </template>
    <p v-else-if="!isLoading" class="text-sm text-soot">
      Passkeys can be added and used on <strong>{{ passkeyHost }}</strong> only.
    </p>

    <ConfirmDialog
      :open="Boolean(pendingDelete)"
      title="Remove passkey"
      :message="`${pendingDelete ? label(pendingDelete) : 'This passkey'} will stop working. You can still sign in with your password.`"
      confirm-label="Remove"
      @cancel="pendingDelete = null"
      @confirm="confirmDelete"
    />
  </section>
</template>
