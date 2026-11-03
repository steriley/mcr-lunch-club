import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installOffer, isIosSafari, type InstallEnvironment } from './install';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

const env = (overrides: Partial<InstallEnvironment>): InstallEnvironment => ({
  userAgent: IPHONE_SAFARI,
  platform: 'iPhone',
  maxTouchPoints: 5,
  displayModeStandalone: false,
  navigatorStandalone: false,
  ...overrides,
});

describe('install offer', () => {
  it('shows the Add to Home Screen hint only in iOS Safari', () => {
    assert.equal(installOffer(env({}), false), 'ios-hint');
    assert.equal(installOffer(env({ userAgent: IPHONE_CHROME }), false), null);
    assert.equal(
      installOffer(
        env({ userAgent: IPHONE_SAFARI, platform: 'MacIntel', maxTouchPoints: 5 }),
        false
      ),
      'ios-hint'
    );
    assert.equal(
      isIosSafari(
        env({
          platform: 'MacIntel',
          maxTouchPoints: 0,
          userAgent: 'Mozilla/5.0 (Macintosh) Version/17 Safari/605',
        })
      ),
      false
    );
  });

  it('offers the real prompt when the browser handed one over', () => {
    assert.equal(
      installOffer(env({ userAgent: ANDROID_CHROME, platform: 'Linux armv8l' }), true),
      'prompt'
    );
    assert.equal(
      installOffer(env({ userAgent: ANDROID_CHROME, platform: 'Linux armv8l' }), false),
      null
    );
  });

  it('offers nothing once installed', () => {
    assert.equal(installOffer(env({ displayModeStandalone: true }), true), null);
    assert.equal(installOffer(env({ navigatorStandalone: true }), false), null);
  });
});
