<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { apiFetch } from '@/lib/api-fetch';
import { formatDateTime } from '@/lib/dates';
import { reenableHelp } from '@/lib/pwa/push';
import type { NotificationPreferences } from '@/lib/push/messages';
import type { DeviceListItem } from '@/lib/push/store';
import {
  browserFacts,
  currentSubscription,
  devicePushSupport,
  disableNotifications,
  enableNotifications,
  removeDevice,
} from '@/pwa/push-client';

const props = defineProps<{
  publicKey: string;
  initialPreferences: NotificationPreferences;
  initialDevices: DeviceListItem[];
}>();

type DeviceState = 'checking' | 'on' | 'off' | 'blocked' | 'unsupported' | 'needs-install';

const state = ref<DeviceState>('checking');
const thisEndpoint = ref<string | null>(null);
const devices = ref<DeviceListItem[]>(props.initialDevices);
const preferences = ref<NotificationPreferences>({ ...props.initialPreferences });
const busy = ref(false);
const message = ref('');
const errorMessage = ref('');
const blockedHelp = ref('');

const EVENTS: { key: keyof NotificationPreferences; label: string; hint: string }[] = [
  {
    key: 'proposals',
    label: 'Verdicts awaiting countersign',
    hint: 'Another Chair proposes a verdict or enters a new venue.',
  },
  { key: 'decisions', label: 'Decisions on your verdicts', hint: 'Approved or declined.' },
  {
    key: 'visits',
    label: '“Visited today”',
    hint: 'A Chair needs a countersign before midnight, or yours was countersigned.',
  },
  { key: 'suggestions', label: 'New venue suggestions', hint: 'At most one every ten minutes.' },
];

const stateText = computed(
  () =>
    ({
      checking: 'Checking this device…',
      on: 'On for this device.',
      off: 'Off for this device.',
      blocked: 'Blocked for this device.',
      unsupported: 'This browser cannot receive notifications.',
      'needs-install': 'Add MCR Lunch Club to your Home Screen to get notifications.',
    })[state.value]
);

async function readState(): Promise<void> {
  const support = devicePushSupport();
  if (support !== 'supported') {
    state.value = support;
    return;
  }
  if (Notification.permission === 'denied') {
    blockedHelp.value = reenableHelp(browserFacts());
    state.value = 'blocked';
    return;
  }
  const subscription =
    Notification.permission === 'granted' ? await currentSubscription().catch(() => null) : null;
  thisEndpoint.value = subscription?.endpoint ?? null;
  state.value = subscription ? 'on' : 'off';
}

onMounted(readState);

function reset() {
  message.value = '';
  errorMessage.value = '';
}

async function enable() {
  reset();
  busy.value = true;
  try {
    const result = await enableNotifications(props.publicKey);
    if (!result.ok) {
      if (result.blocked) {
        blockedHelp.value = reenableHelp(browserFacts());
        state.value = 'blocked';
      } else errorMessage.value = result.error;
      return;
    }
    thisEndpoint.value = result.endpoint;
    devices.value = result.devices;
    state.value = 'on';
    message.value = 'Notifications are on for this device.';
  } finally {
    busy.value = false;
  }
}

async function disable() {
  reset();
  busy.value = true;
  try {
    const remaining = await disableNotifications();
    if (remaining) devices.value = remaining;
    else devices.value = devices.value.filter((device) => device.endpoint !== thisEndpoint.value);
    thisEndpoint.value = null;
    state.value = 'off';
    message.value = 'Notifications are off for this device.';
  } finally {
    busy.value = false;
  }
}

async function remove(device: DeviceListItem) {
  reset();
  if (device.endpoint === thisEndpoint.value) return disable();
  const result = await removeDevice(device.id);
  if (!result.ok) {
    errorMessage.value = result.error;
    return;
  }
  devices.value = result.data.devices;
}

async function savePreference(key: keyof NotificationPreferences, value: boolean) {
  reset();
  const previous = preferences.value[key];
  preferences.value = { ...preferences.value, [key]: value };
  const result = await apiFetch<{ preferences: NotificationPreferences }>(
    '/api/admin/push/preferences',
    { method: 'PUT', body: { [key]: value }, fallback: 'Could not save that setting.' }
  );
  if (!result.ok) {
    preferences.value = { ...preferences.value, [key]: previous };
    errorMessage.value = result.error;
  }
}

async function sendTest() {
  reset();
  busy.value = true;
  try {
    const result = await apiFetch<{ sent: number; failed: number; removed: number }>(
      '/api/admin/push/test',
      { method: 'POST', fallback: 'Could not send a test notification.' }
    );
    if (!result.ok) {
      errorMessage.value = result.error;
      return;
    }
    const { sent, failed, removed } = result.data;
    if (sent === 0 && failed === 0 && removed === 0)
      message.value = 'You have no devices with notifications on.';
    else
      message.value = `Sent to ${sent} ${sent === 1 ? 'device' : 'devices'}${
        failed ? `; ${failed} could not be reached` : ''
      }${removed ? `; ${removed} no longer subscribed and removed` : ''}.`;
    const list = await apiFetch<{ devices: DeviceListItem[] }>('/api/admin/push/subscriptions', {
      fallback: 'Could not refresh the device list.',
    });
    if (list.ok) devices.value = list.data.devices;
  } finally {
    busy.value = false;
  }
}

const when = (value: string | null) => (value ? formatDateTime(value) : 'Not yet');
</script>

<template>
  <section
    id="notifications"
    class="space-y-5 rounded-2xl border border-hairline bg-parchment p-6 shadow-sm"
    aria-labelledby="notifications-heading"
  >
    <div>
      <p class="text-xs font-bold uppercase tracking-[0.2em] text-ochre">Notifications</p>
      <h2 id="notifications-heading" class="mt-2 text-2xl font-bold text-ink">
        Notifications on this device
      </h2>
      <p class="mt-2 text-sm text-soot">
        A notification when a verdict needs your countersign, a Chair visits a venue, or your own
        verdict is decided. Lock screens show the venue and who acted, never reasons or notes.
      </p>
    </div>

    <div class="rounded-xl border border-hairline bg-surface p-4" data-push-state="">
      <p class="text-sm font-semibold text-ink" :data-state="state">{{ stateText }}</p>

      <div v-if="state === 'needs-install'" class="mt-2 text-sm text-soot">
        <p>On iPhone and iPad, only the Home Screen app can receive notifications:</p>
        <ol class="mt-2 list-decimal space-y-1 pl-5">
          <li>Tap the Share button in Safari.</li>
          <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          <li>Open MCR Lunch Club from the Home Screen, sign in and come back here.</li>
        </ol>
      </div>
      <p v-else-if="state === 'unsupported'" class="mt-2 text-sm text-soot">
        Try Chrome, Firefox, Edge or Safari, or the app installed from one of them.
      </p>
      <p v-else-if="state === 'blocked'" class="mt-2 text-sm text-soot">
        {{ blockedHelp }}
      </p>

      <div class="mt-4 flex flex-wrap gap-3">
        <button
          v-if="state === 'off'"
          type="button"
          :disabled="busy"
          class="inline-flex items-center justify-center rounded-lg bg-navy-fixed px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-deep disabled:cursor-not-allowed disabled:opacity-70"
          @click="enable"
        >
          {{ busy ? 'Enabling…' : 'Enable notifications' }}
        </button>
        <button
          v-if="state === 'on'"
          type="button"
          :disabled="busy"
          class="inline-flex items-center justify-center rounded-lg border border-hairline bg-parchment px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-linen disabled:cursor-not-allowed disabled:opacity-70"
          @click="disable"
        >
          Disable on this device
        </button>
        <button
          v-if="devices.length > 0"
          type="button"
          :disabled="busy"
          class="inline-flex items-center justify-center rounded-lg border border-hairline bg-parchment px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-linen disabled:cursor-not-allowed disabled:opacity-70"
          @click="sendTest"
        >
          Send a test notification
        </button>
      </div>
    </div>

    <p
      v-if="errorMessage"
      role="alert"
      class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
    >
      {{ errorMessage }}
    </p>
    <p
      v-if="message"
      role="status"
      class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
    >
      {{ message }}
    </p>

    <fieldset>
      <legend class="text-base font-bold text-ink">Notify me about</legend>
      <p class="mt-1 text-xs text-graphite">For your account, on every device you enable.</p>
      <div class="mt-3 space-y-3">
        <label v-for="event in EVENTS" :key="event.key" class="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            class="mt-0.5 h-5 w-5 shrink-0 accent-navy"
            :checked="preferences[event.key]"
            @change="savePreference(event.key, ($event.target as HTMLInputElement).checked)"
          />
          <span>
            <span class="block font-semibold text-ink">{{ event.label }}</span>
            <span class="block text-graphite">{{ event.hint }}</span>
          </span>
        </label>
      </div>
    </fieldset>

    <div>
      <h3 class="text-base font-bold text-ink">Your devices</h3>
      <p v-if="devices.length === 0" class="mt-2 text-sm text-soot">
        No devices have notifications on yet.
      </p>
      <ul v-else class="mt-2 divide-y divide-sand text-sm">
        <li
          v-for="device in devices"
          :key="device.id"
          class="flex flex-wrap items-center justify-between gap-3 py-3"
        >
          <div>
            <p class="font-semibold text-ink">
              {{ device.label || 'Unnamed device' }}
              <span
                v-if="device.endpoint === thisEndpoint"
                class="ml-1 rounded-full bg-navy-tint px-2 py-0.5 text-xs font-bold text-navy"
                >This device</span
              >
            </p>
            <p class="text-xs text-graphite">
              Added {{ when(device.createdAt) }} · Last delivered {{ when(device.lastSuccessAt) }}
              <template v-if="device.failureCount > 0">
                · {{ device.failureCount }} failed
              </template>
            </p>
          </div>
          <button
            type="button"
            class="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-linen"
            :aria-label="`Remove ${device.label || 'device'}`"
            @click="remove(device)"
          >
            Remove
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
