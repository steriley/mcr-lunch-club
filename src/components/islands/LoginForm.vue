<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { authClient } from '@/lib/auth-client';
import { browserHasWebAuthn, canOfferPasskey } from '@/lib/passkey-support';
import { safeAdminRedirect } from '@/lib/safe-redirect';

/** `passkeyHost`: the only host passkeys work on (#153); elsewhere only the password form shows. */
const props = defineProps<{ next?: string; passkeyHost?: string | null }>();

const email = ref('');
const password = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);
const offerPasskey = ref(false);
const isPasskeyPending = ref(false);

type PasskeyResult = Awaited<ReturnType<typeof authClient.signIn.passkey>>;

/** Explains a failed passkey sign-in; cancelling the browser prompt is not an error worth showing. */
function passkeyErrorMessage(result: PasskeyResult): string | null {
  const error = result.error as { code?: string; status?: number } | null;
  if (!error) return null;
  if (error.status === 429) return 'Too many sign-in attempts. Please wait a minute and try again.';
  if (error.code === 'BANNED_USER') return 'This account has been deactivated.';
  if (error.code === 'AUTH_CANCELLED' || error.code === 'ERROR_CEREMONY_ABORTED') return null;
  if (error.code?.startsWith('ERROR_')) return null;
  return 'That passkey didn’t work. Try again, or sign in with your password.';
}

function finishPasskey(result: PasskeyResult, quiet: boolean): void {
  if (result.data) {
    window.location.assign(safeAdminRedirect(props.next));
    return;
  }
  const message = passkeyErrorMessage(result);
  if (message && !quiet) errorMessage.value = message;
}

async function handlePasskey() {
  errorMessage.value = '';
  isPasskeyPending.value = true;
  try {
    finishPasskey(await authClient.signIn.passkey(), false);
  } catch (error) {
    console.error('Passkey sign-in failed', error);
    errorMessage.value = 'That passkey didn’t work. Try again, or sign in with your password.';
  } finally {
    isPasskeyPending.value = false;
  }
}

onMounted(async () => {
  offerPasskey.value = canOfferPasskey({
    pageHost: window.location.host,
    passkeyHost: props.passkeyHost,
    hasWebAuthn: browserHasWebAuthn(),
  });
  if (!offerPasskey.value) return;
  await nextTick(); // the email field must say `webauthn` before autofill starts
  // Autofill: the browser offers saved passkeys from the email field. Pressing the button aborts
  // this request, so its result is only acted on when it signs in.
  try {
    if (await window.PublicKeyCredential.isConditionalMediationAvailable?.()) {
      finishPasskey(await authClient.signIn.passkey({ autoFill: true }), true);
    }
  } catch {
    // Autofill is a convenience; the button and the password form still work.
  }
});

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
  <form
    class="mx-auto max-w-md rounded-2xl border border-hairline bg-parchment p-6 shadow-sm"
    @submit.prevent="handleSubmit"
  >
    <div class="mb-5">
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-ochre">Chairs' Area</p>
      <h1 class="mt-2 text-3xl font-bold text-ink">Sign in</h1>
    </div>

    <div v-if="offerPasskey" class="mb-5">
      <button
        type="button"
        data-testid="passkey-sign-in"
        :disabled="isPasskeyPending || isSubmitting"
        class="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-navy-fixed px-4 py-3 text-sm font-semibold text-white transition hover:bg-deep disabled:cursor-not-allowed disabled:opacity-70"
        @click="handlePasskey"
      >
        {{ isPasskeyPending ? 'Waiting for your passkey…' : 'Sign in with a passkey' }}
      </button>
      <p class="mt-4 text-center text-xs font-semibold uppercase tracking-[0.15em] text-soot">
        or use your password
      </p>
    </div>

    <div class="space-y-4">
      <label class="block text-sm font-semibold text-ink">
        <span class="mb-2 block">Email</span>
        <input
          v-model="email"
          type="email"
          :autocomplete="offerPasskey ? 'username webauthn' : 'email'"
          class="w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none ring-0 focus:border-navy"
          placeholder="chair@mcrlunch.club"
        />
      </label>

      <label class="block text-sm font-semibold text-ink">
        <span class="mb-2 block">Password</span>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none ring-0 focus:border-navy"
          placeholder="••••••••••••"
        />
      </label>
    </div>

    <p
      v-if="errorMessage"
      class="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMessage }}
    </p>

    <button
      type="submit"
      :disabled="isSubmitting"
      class="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-navy-fixed px-4 py-3 text-sm font-semibold text-white transition hover:bg-deep disabled:cursor-not-allowed disabled:opacity-70"
    >
      {{ isSubmitting ? 'Signing in…' : 'Sign in' }}
    </button>
  </form>
</template>
