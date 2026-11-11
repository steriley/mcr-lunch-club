<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { apiFetch } from '@/lib/api-fetch';
import { authClient } from '@/lib/auth-client';
import { browserHasWebAuthn, canOfferPasskey } from '@/lib/passkey-support';
import { signInRequestSchema } from '@/lib/members/sign-in-schema';
import { mountTurnstile, type TurnstileHandle } from '@/lib/members/turnstile-widget';

/**
 * Member sign-in (#136): ask for an email, then either tap the link it carries or type its 6-digit
 * code here (for when the email is on another device). Members who added a passkey can use that
 * instead. Requests go through POST /api/member/sign-in, which applies the Turnstile check, rate
 * limits, honeypot and time trap; the code is checked by Better Auth.
 */
const props = defineProps<{
  /** Where to go once signed in (already checked on the server). */
  next: string;
  passkeyHost: string | null;
  /** Turnstile's public site key; null when none is set (Production), which closes the form. */
  turnstileSiteKey: string | null;
  /** A magic link that failed sends the member back here with Better Auth's error code. */
  linkError?: string | null;
  /** Signing in again to confirm it's them, e.g. before deleting the account. */
  confirming?: boolean;
}>();

const CODE_LENGTH = 6;

const step = ref<'email' | 'code'>('email');
const email = ref('');
const website = ref('');
const code = ref('');
const formToken = ref('');
const turnstileToken = ref('');
const turnstileBox = ref<HTMLElement | null>(null);
let turnstile: TurnstileHandle | null = null;
const errorMessage = ref(
  props.linkError
    ? 'That sign-in link has expired or was already used. Ask for a new one below.'
    : ''
);
const isSending = ref(false);
const isVerifying = ref(false);
const offerPasskey = ref(false);
const isPasskeyPending = ref(false);

async function loadFormToken() {
  const result = await apiFetch<{ formToken: string }>('/api/member/sign-in', {
    fallback: 'Unable to load the sign-in form. Please reload the page.',
  });
  if (result.ok) formToken.value = result.data.formToken;
  else errorMessage.value = result.error;
}

/** Shows the security check under the email field; each token works for one request. */
async function showTurnstile() {
  await nextTick();
  if (!turnstileBox.value || !props.turnstileSiteKey) return;
  try {
    turnstile = await mountTurnstile(turnstileBox.value, props.turnstileSiteKey, {
      onToken: (token) => (turnstileToken.value = token),
      onLost: () => (turnstileToken.value = ''),
    });
  } catch {
    errorMessage.value = 'Unable to load the security check. Please reload the page.';
  }
}

function hideTurnstile() {
  turnstile?.remove();
  turnstile = null;
  turnstileToken.value = '';
}

onBeforeUnmount(hideTurnstile);

onMounted(() => {
  void loadFormToken();
  if (props.turnstileSiteKey) void showTurnstile();
  else errorMessage.value = 'Signing in by email is unavailable right now. Please try again later.';
  offerPasskey.value = canOfferPasskey({
    pageHost: window.location.host,
    passkeyHost: props.passkeyHost,
    hasWebAuthn: browserHasWebAuthn(),
  });
});

async function requestEmail() {
  errorMessage.value = '';
  const checked = signInRequestSchema.safeParse({
    email: email.value,
    formToken: formToken.value,
    website: website.value,
    turnstileToken: turnstileToken.value,
    next: props.next,
  });
  if (!checked.success) {
    errorMessage.value = checked.error.issues[0]?.message ?? 'Enter a valid email address.';
    return;
  }
  isSending.value = true;
  const result = await apiFetch('/api/member/sign-in', {
    method: 'POST',
    body: checked.data,
    fallback: 'Unable to send a sign-in email. Please try again.',
    offline: 'You seem to be offline. Connect and try again.',
  });
  isSending.value = false;
  if (!result.ok) {
    errorMessage.value = result.error;
    // The token is spent whatever the answer: ask for a new one.
    turnstileToken.value = '';
    turnstile?.reset();
    return;
  }
  email.value = checked.data.email;
  code.value = '';
  hideTurnstile();
  step.value = 'code';
}

function codeErrorMessage(status: number, code: string | undefined): string {
  if (status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (code === 'TOO_MANY_ATTEMPTS' || code === 'OTP_EXPIRED') {
    return 'That code no longer works. Ask for a new email.';
  }
  if (code === 'INVALID_OTP') return 'That code isn’t right. Check it and try again.';
  if (code === 'BANNED_USER') return 'This account has been suspended.';
  return 'Unable to sign in with that code. Ask for a new email.';
}

async function verifyCode() {
  errorMessage.value = '';
  const otp = code.value.replace(/\D/g, '');
  if (otp.length !== CODE_LENGTH) {
    errorMessage.value = `Enter the ${CODE_LENGTH}-digit code from the email.`;
    return;
  }
  isVerifying.value = true;
  try {
    const response = await fetch('/api/auth/sign-in/email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, otp }),
    });
    if (response.ok) {
      window.location.assign(props.next);
      return;
    }
    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    errorMessage.value = codeErrorMessage(response.status, body?.code);
  } catch {
    errorMessage.value = 'You seem to be offline. Connect and try again.';
  } finally {
    isVerifying.value = false;
  }
}

async function signInWithPasskey() {
  errorMessage.value = '';
  isPasskeyPending.value = true;
  try {
    const result = await authClient.signIn.passkey();
    if (result.data) {
      window.location.assign(props.next);
      return;
    }
    const error = result.error as { code?: string; status?: number } | null;
    if (error?.status === 429) {
      errorMessage.value = 'Too many attempts. Please wait a minute and try again.';
    } else if (error?.code === 'BANNED_USER') {
      errorMessage.value = 'This account has been suspended.';
    } else if (error && !error.code?.startsWith('ERROR_') && error.code !== 'AUTH_CANCELLED') {
      errorMessage.value = 'That passkey didn’t work. Try again, or use your email.';
    }
  } catch {
    errorMessage.value = 'That passkey didn’t work. Try again, or use your email.';
  } finally {
    isPasskeyPending.value = false;
  }
}

function startAgain() {
  step.value = 'email';
  errorMessage.value = '';
  code.value = '';
  void loadFormToken();
  void showTurnstile();
}

const inputClass =
  'w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-base text-ink outline-none focus:border-navy';
const primaryClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-navy-fixed px-4 py-3 text-sm font-semibold text-white transition hover:bg-deep disabled:cursor-not-allowed disabled:opacity-70';
</script>

<template>
  <div
    class="mx-auto w-full max-w-md rounded-2xl border border-hairline bg-parchment p-6 shadow-sm"
  >
    <p class="text-xs font-bold uppercase tracking-[0.2em] text-ochre">Members</p>
    <h1 class="mt-2 text-3xl font-bold text-ink">
      {{ confirming ? 'Confirm it’s you' : 'Sign in or join' }}
    </h1>
    <p class="mt-2 text-sm text-soot">
      {{
        confirming
          ? 'Sign in again to carry on. This keeps your account safe if someone else has your device.'
          : 'No password needed. We’ll email you a link and a code; new members join the same way.'
      }}
    </p>

    <p
      v-if="errorMessage"
      role="alert"
      class="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMessage }}
    </p>

    <form v-if="step === 'email'" class="mt-5" novalidate @submit.prevent="requestEmail">
      <div v-if="offerPasskey" class="mb-5">
        <button
          type="button"
          data-testid="member-passkey-sign-in"
          :class="primaryClass"
          :disabled="isPasskeyPending || isSending"
          @click="signInWithPasskey"
        >
          {{ isPasskeyPending ? 'Waiting for your passkey…' : 'Sign in with a passkey' }}
        </button>
        <p class="mt-4 text-center text-xs font-semibold uppercase tracking-[0.15em] text-soot">
          or use your email
        </p>
      </div>

      <label class="block text-sm font-semibold text-ink">
        <span class="mb-2 block">Email</span>
        <input
          v-model="email"
          name="email"
          type="email"
          autocomplete="email"
          required
          :class="inputClass"
          placeholder="you@example.com"
        />
      </label>
      <div ref="turnstileBox" data-testid="member-turnstile" class="mt-4 min-h-[65px]"></div>
      <!-- Honeypot: hidden from people, so anything typed here comes from a bot. -->
      <label class="member-honeypot" aria-hidden="true">
        Website
        <input v-model="website" name="website" type="text" tabindex="-1" autocomplete="off" />
      </label>

      <button
        type="submit"
        data-testid="member-send-email"
        class="mt-5"
        :class="primaryClass"
        :disabled="isSending || !formToken || !turnstileToken"
      >
        {{ isSending ? 'Sending…' : 'Email me a link and code' }}
      </button>
    </form>

    <form v-else class="mt-5" novalidate @submit.prevent="verifyCode">
      <p role="status" class="text-sm text-coal">
        We’ve emailed <strong class="text-ink">{{ email }}</strong
        >, if that address can sign in. Tap the link in the email, or enter its code here. Both work
        once, for 10 minutes.
      </p>
      <label class="mt-4 block text-sm font-semibold text-ink">
        <span class="mb-2 block">6-digit code</span>
        <input
          v-model="code"
          name="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9 ]*"
          maxlength="7"
          :class="[inputClass, 'tracking-[0.3em]']"
          placeholder="123456"
        />
      </label>
      <button
        type="submit"
        data-testid="member-verify-code"
        class="mt-5"
        :class="primaryClass"
        :disabled="isVerifying"
      >
        {{ isVerifying ? 'Checking…' : 'Sign in' }}
      </button>
      <button
        type="button"
        class="mt-3 w-full text-center text-sm font-semibold text-navy underline-offset-2 hover:underline"
        @click="startAgain"
      >
        Use a different email, or send another
      </button>
    </form>
  </div>
</template>

<style scoped>
.member-honeypot {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
</style>
