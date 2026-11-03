import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  deviceLabel,
  FALLBACK_MESSAGE,
  notificationTarget,
  parsePushMessage,
  pushSupport,
  reenableHelp,
  sameServerKey,
  type BrowserFacts,
} from './push';

const ORIGIN = 'https://mcrlunchclub.com';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const facts = (overrides: Partial<BrowserFacts>): BrowserFacts => ({
  userAgent: MAC_CHROME,
  maxTouchPoints: 0,
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  ...overrides,
});

describe('parsePushMessage', () => {
  it('reads a payload', () => {
    const message = parsePushMessage(
      JSON.stringify({
        v: 1,
        title: 'T',
        body: 'B',
        tag: 'x',
        url: '/admin/x',
        badge: 3,
        renotify: true,
      })
    );
    assert.deepEqual(message, {
      title: 'T',
      body: 'B',
      tag: 'x',
      url: '/admin/x',
      badge: 3,
      renotify: true,
    });
  });

  it('shows the generic message for a missing or malformed payload', () => {
    for (const raw of [null, undefined, '', 'not json', '[]', '{}', '{"title":"  "}', 'null']) {
      assert.deepEqual(parsePushMessage(raw), FALLBACK_MESSAGE, String(raw));
    }
  });

  it('drops a badge that is not a count', () => {
    assert.equal(parsePushMessage('{"title":"T","badge":-1}').badge, undefined);
    assert.equal(parsePushMessage('{"title":"T","badge":"3"}').badge, undefined);
  });
});

describe('notificationTarget', () => {
  it('keeps same-origin Chairs’ Area paths, with their hash', () => {
    assert.equal(notificationTarget('/admin/venues/1#concord', ORIGIN), '/admin/venues/1#concord');
    assert.equal(notificationTarget(`${ORIGIN}/admin/suggestions`, ORIGIN), '/admin/suggestions');
  });

  it('sends anything else to the dashboard', () => {
    for (const url of [
      'https://evil.example/admin',
      '//evil.example/admin',
      '/venues/chip-shop',
      '/administrator',
      '/admin/login?next=/x',
      'javascript:alert(1)',
      42,
      null,
    ]) {
      assert.equal(notificationTarget(url, ORIGIN), '/admin', String(url));
    }
  });
});

describe('pushSupport', () => {
  it('needs the Home Screen app on iPhone and iPad', () => {
    assert.equal(pushSupport(facts({ userAgent: IPHONE, hasPushManager: false })), 'needs-install');
    assert.equal(
      pushSupport(facts({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5, hasPushManager: false })),
      'needs-install'
    );
    assert.equal(pushSupport(facts({ userAgent: IPHONE, standalone: true })), 'supported');
  });

  it('is unsupported without the Push API (old iOS, in-app browsers)', () => {
    assert.equal(
      pushSupport(facts({ userAgent: IPHONE, standalone: true, hasPushManager: false })),
      'unsupported'
    );
    assert.equal(pushSupport(facts({ hasNotification: false })), 'unsupported');
  });

  it('works in desktop and Android browsers', () => {
    assert.equal(pushSupport(facts({})), 'supported');
    assert.equal(pushSupport(facts({ userAgent: ANDROID })), 'supported');
    // A Mac without touch is a Mac, not an iPad.
    assert.equal(pushSupport(facts({ userAgent: IPAD_AS_MAC })), 'supported');
  });
});

describe('deviceLabel', () => {
  it('names the device and how the site is open, nothing more', () => {
    assert.equal(
      deviceLabel(facts({ userAgent: IPHONE, standalone: true })),
      'iPhone · Home Screen'
    );
    assert.equal(deviceLabel(facts({ userAgent: ANDROID })), 'Android · Chrome');
    assert.equal(deviceLabel(facts({ userAgent: ANDROID, standalone: true })), 'Android · App');
    assert.equal(deviceLabel(facts({ userAgent: IPAD_AS_MAC })), 'Mac · Safari');
    assert.equal(deviceLabel(facts({ userAgent: MAC_CHROME })), 'Mac · Chrome');
  });
});

describe('reenableHelp', () => {
  it('points iPhone users to Settings', () => {
    assert.match(
      reenableHelp({ userAgent: IPHONE, maxTouchPoints: 5 }),
      /Settings → Notifications/
    );
    assert.match(reenableHelp({ userAgent: MAC_CHROME, maxTouchPoints: 0 }), /site settings/);
  });
});

describe('server key comparison', () => {
  it('round-trips base64url and spots a rotated key', () => {
    const key =
      'BOr5x8vYbDkGhOO2K9Xx2SA7KQXSzc1VzmsdbQTRl7AZcWFGx0qNMd6eB2z9Qy6Vb7c4dXuZ3KjYxQvQb8uCNlI';
    const bytes = base64UrlToBytes(key);
    assert.equal(bytes.length, 65);
    assert.equal(bytesToBase64Url(bytes.buffer), key);
    assert.ok(sameServerKey(bytes.buffer, key));
    assert.ok(!sameServerKey(bytes.buffer, key.replace(/^BO/, 'BP')));
    assert.ok(!sameServerKey(null, key));
  });
});
