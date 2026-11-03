/**
 * The browser side of Chairs' push notifications (#115): the payload the service worker shows,
 * where a tap may go, and what the account page can offer on this device. Free of browser APIs
 * (callers pass in what they read), so it is unit tested and safe in the worker bundle.
 */
import { safeAdminRedirect } from '@/lib/safe-redirect';

/** What a push carries. Built on the server by src/lib/push/messages.ts. */
export interface PushMessage {
  title: string;
  body: string;
  tag: string;
  /** A same-origin Chairs' Area path. */
  url: string;
  /** Items this Chair can act on, for the app badge. */
  badge?: number;
  /** Alert again when it replaces a notification with the same tag. */
  renotify?: boolean;
}

/**
 * Shown when a push arrives without a readable payload. Browsers require every push to show
 * something (`userVisibleOnly`), so a malformed one still says where to look.
 */
export const FALLBACK_MESSAGE: PushMessage = {
  title: 'MCR Lunch Club',
  body: 'Something needs your attention in the Chairs’ Area.',
  tag: 'chairs-area',
  url: '/admin',
};

const TEXT_MAX = 200;
const text = (value: unknown, max = TEXT_MAX): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/** The notification to show for a push's text, falling back to the generic one. */
export function parsePushMessage(raw: string | null | undefined): PushMessage {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw ?? '');
  } catch {
    return FALLBACK_MESSAGE;
  }
  if (!data || typeof data !== 'object') return FALLBACK_MESSAGE;
  const title = text(data.title);
  if (!title) return FALLBACK_MESSAGE;
  const badge =
    Number.isInteger(data.badge) && (data.badge as number) >= 0 ? data.badge : undefined;
  return {
    title,
    body: text(data.body) ?? '',
    tag: text(data.tag, 120) ?? FALLBACK_MESSAGE.tag,
    url: typeof data.url === 'string' ? data.url : FALLBACK_MESSAGE.url,
    badge: badge as number | undefined,
    renotify: data.renotify === true,
  };
}

/**
 * Where a tap goes: only a same-origin Chairs' Area path, by the same rule as the sign-in
 * redirect; anything else opens the dashboard.
 */
export function notificationTarget(url: unknown, origin: string): string {
  if (typeof url !== 'string') return '/admin';
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch {
    return '/admin';
  }
  if (parsed.origin !== origin) return '/admin';
  return safeAdminRedirect(`${parsed.pathname}${parsed.search}${parsed.hash}`);
}

export type PushSupport =
  /** Notifications can be switched on here. */
  | 'supported'
  /** iPhone or iPad in Safari: only an app added to the Home Screen gets notifications. */
  | 'needs-install'
  /** No Push API (an in-app browser, an old iOS). */
  | 'unsupported';

export interface BrowserFacts {
  userAgent: string;
  /** navigator.maxTouchPoints: iPadOS reports itself as a Mac, with touch. */
  maxTouchPoints: number;
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
}

function isAppleMobile({ userAgent, maxTouchPoints }: BrowserFacts): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function pushSupport(facts: BrowserFacts): PushSupport {
  // iOS hides the Push API from Safari tabs, so check for it after the Home Screen question.
  if (isAppleMobile(facts) && !facts.standalone) return 'needs-install';
  if (!facts.hasServiceWorker || !facts.hasPushManager || !facts.hasNotification)
    return 'unsupported';
  return 'supported';
}

/** "iPhone · Home Screen", "Android · Chrome", "Mac · Safari": for the device list, nothing more. */
export function deviceLabel(
  facts: Pick<BrowserFacts, 'userAgent' | 'maxTouchPoints' | 'standalone'>
): string {
  const ua = facts.userAgent;
  const device = /iPhone|iPod/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && facts.maxTouchPoints > 1)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Macintosh|Mac OS X/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'Chromebook'
              : /Linux/.test(ua)
                ? 'Linux'
                : 'Device';
  if (facts.standalone)
    return `${device} · ${device === 'iPhone' || device === 'iPad' ? 'Home Screen' : 'App'}`;
  const browser = /SamsungBrowser/.test(ua)
    ? 'Samsung Internet'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Firefox|FxiOS/.test(ua)
        ? 'Firefox'
        : /Chrome|CriOS|Chromium/.test(ua)
          ? 'Chrome'
          : /Safari/.test(ua)
            ? 'Safari'
            : 'Browser';
  return `${device} · ${browser}`;
}

/** How to turn notifications back on once they are blocked. */
export function reenableHelp(facts: Pick<BrowserFacts, 'userAgent' | 'maxTouchPoints'>): string {
  if (isAppleMobile({ ...facts } as BrowserFacts))
    return 'Open Settings → Notifications → MCR Lunch Club and allow notifications.';
  if (/Firefox/.test(facts.userAgent))
    return 'Click the icon left of the address bar, then allow notifications for this site.';
  if (/Safari/.test(facts.userAgent) && !/Chrome|Chromium|Edg\//.test(facts.userAgent))
    return 'Open Safari → Settings → Websites → Notifications and allow this site.';
  return 'Open the site settings (the icon left of the address bar) and allow notifications.';
}

/** The VAPID public key (base64url) as the bytes `pushManager.subscribe` wants. */
export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function bytesToBase64Url(buffer: ArrayBuffer | null | undefined): string {
  if (!buffer) return '';
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Whether a subscription was made with this server key; after a key rotation it was not. */
export function sameServerKey(
  applicationServerKey: ArrayBuffer | null | undefined,
  publicKey: string
): boolean {
  return bytesToBase64Url(applicationServerKey) === publicKey.replace(/=+$/, '');
}
