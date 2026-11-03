/**
 * This device's Chairs' push subscription (#115), for the account page and the sync that runs on
 * every Chairs' Area load (push-sync.ts). The rules live in src/lib/pwa/push.ts.
 */
import { apiFetch } from '@/lib/api-fetch';
import {
  base64UrlToBytes,
  deviceLabel,
  pushSupport,
  sameServerKey,
  type BrowserFacts,
  type PushSupport,
} from '@/lib/pwa/push';
import type { DeviceListItem } from '@/lib/push/store';

const ENDPOINT_KEY = 'mcr-push-endpoint';
const SYNCED_KEY = 'mcr-push-synced';
const SUBSCRIPTIONS_API = '/api/admin/push/subscriptions';

/** Browser storage can be missing or throw (private windows); every use is best effort. */
function storage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}
function read(kind: 'localStorage' | 'sessionStorage', key: string): string | null {
  try {
    return storage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
function write(kind: 'localStorage' | 'sessionStorage', key: string, value: string | null): void {
  try {
    if (value === null) storage(kind)?.removeItem(key);
    else storage(kind)?.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export function browserFacts(): BrowserFacts {
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone:
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
  };
}

export function devicePushSupport(): PushSupport {
  return pushSupport(browserFacts());
}

/** The worker's registration, waiting a little for a first visit's registration to finish. */
async function registration(waitMs = 0): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing || waitMs === 0) return existing ?? null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs)),
  ]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function saveOnServer(
  subscription: PushSubscription,
  oldEndpoint?: string
): Promise<{ ok: true; devices: DeviceListItem[] } | { ok: false; error: string }> {
  const json = subscription.toJSON();
  const result = await apiFetch<{ devices: DeviceListItem[] }>(SUBSCRIPTIONS_API, {
    method: 'POST',
    body: {
      endpoint: json.endpoint,
      keys: json.keys,
      label: deviceLabel(browserFacts()),
      oldEndpoint,
    },
    fallback: 'Could not save this device. Please try again.',
  });
  if (!result.ok) return result;
  write('localStorage', ENDPOINT_KEY, subscription.endpoint);
  write('sessionStorage', SYNCED_KEY, subscription.endpoint);
  return { ok: true, devices: result.data.devices };
}

async function removeOnServer(which: { endpoint: string } | { id: string }) {
  return apiFetch<{ removed: boolean; devices: DeviceListItem[] }>(SUBSCRIPTIONS_API, {
    method: 'DELETE',
    body: which,
    fallback: 'Could not remove that device. Please try again.',
  });
}

export type EnableResult =
  | { ok: true; endpoint: string; devices: DeviceListItem[] }
  | { ok: false; blocked: boolean; error: string };

/** "Enable notifications": asks permission (only ever from this tap), subscribes and saves. */
export async function enableNotifications(publicKey: string): Promise<EnableResult> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    return {
      ok: false,
      blocked: permission === 'denied',
      error: 'Notifications were not allowed.',
    };
  const reg = await registration(5000);
  if (!reg)
    return {
      ok: false,
      blocked: false,
      error: 'This browser has not finished setting up the app. Reload the page and try again.',
    };
  let subscription = await reg.pushManager.getSubscription();
  if (subscription && !sameServerKey(subscription.options.applicationServerKey, publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  try {
    subscription ??= await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    });
  } catch {
    return { ok: false, blocked: false, error: 'This browser could not set up notifications.' };
  }
  const saved = await saveOnServer(subscription);
  if (!saved.ok) return { ok: false, blocked: false, error: saved.error };
  return { ok: true, endpoint: subscription.endpoint, devices: saved.devices };
}

/** "Disable": forgets this device on the server and in the browser. */
export async function disableNotifications(): Promise<DeviceListItem[] | null> {
  const subscription = await currentSubscription();
  const endpoint = subscription?.endpoint ?? read('localStorage', ENDPOINT_KEY);
  const result = endpoint ? await removeOnServer({ endpoint }) : null;
  await subscription?.unsubscribe().catch(() => undefined);
  write('localStorage', ENDPOINT_KEY, null);
  write('sessionStorage', SYNCED_KEY, null);
  return result?.ok ? result.data.devices : null;
}

export async function removeDevice(id: string) {
  return removeOnServer({ id });
}

/**
 * Signing out: this device stops getting Chair notifications. Runs before the session ends, since
 * the server needs it to know whose device this is.
 */
export async function forgetThisDevice(): Promise<void> {
  try {
    await disableNotifications();
  } catch {
    /* best effort: signing out goes ahead */
  }
}

/**
 * On every Chairs' Area load: keeps the server's record of this device true.
 *
 * - Permission revoked in the OS: the server's copy is deleted.
 * - Subscribed with an old key (the VAPID keys were rotated): resubscribed silently, since
 *   permission is already granted, and the old endpoint replaced.
 * - Otherwise, once per browser session, the subscription is saved again, which also moves it to
 *   whoever is signed in now.
 */
export async function syncThisDevice(publicKey: string): Promise<void> {
  if (devicePushSupport() !== 'supported') return;
  const reg = await registration();
  if (!reg) return;
  const subscription = await reg.pushManager.getSubscription();
  const remembered = read('localStorage', ENDPOINT_KEY);

  if (Notification.permission !== 'granted' || !subscription) {
    const endpoint = subscription?.endpoint ?? remembered;
    if (endpoint) await removeOnServer({ endpoint });
    await subscription?.unsubscribe().catch(() => undefined);
    write('localStorage', ENDPOINT_KEY, null);
    return;
  }

  if (!sameServerKey(subscription.options.applicationServerKey, publicKey)) {
    const oldEndpoint = subscription.endpoint;
    await subscription.unsubscribe();
    const fresh = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    });
    await saveOnServer(fresh, oldEndpoint);
    return;
  }

  if (read('sessionStorage', SYNCED_KEY) !== subscription.endpoint)
    await saveOnServer(subscription);
}

/** The app badge: what this Chair can act on, or cleared at 0. */
export async function refreshAppBadge(): Promise<void> {
  const nav = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (!nav.setAppBadge) return;
  const result = await apiFetch<{ count: number }>('/api/admin/push/badge', {
    fallback: 'Could not read the badge count.',
  });
  if (!result.ok) return;
  try {
    if (result.data.count > 0) await nav.setAppBadge(result.data.count);
    else await nav.clearAppBadge?.();
  } catch {
    /* not allowed here */
  }
}
