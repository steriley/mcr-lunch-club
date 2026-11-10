import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { browserHasWebAuthn, canOfferPasskey } from './passkey-support';

describe('canOfferPasskey', () => {
  it('offers a passkey only on the passkey host, in a browser with WebAuthn', () => {
    const passkeyHost = 'mcrlunch.club';
    assert.equal(
      canOfferPasskey({ pageHost: 'mcrlunch.club', passkeyHost, hasWebAuthn: true }),
      true
    );
    assert.equal(
      canOfferPasskey({ pageHost: 'MCRLunch.club', passkeyHost, hasWebAuthn: true }),
      true
    );
    assert.equal(
      canOfferPasskey({ pageHost: 'mcrlunch.club', passkeyHost, hasWebAuthn: false }),
      false
    );
  });

  it('hides it on Preview URLs and other hosts', () => {
    const passkeyHost = 'mcrlunch.club';
    for (const pageHost of ['app-git-feature.vercel.app', 'www.mcrlunch.club', 'localhost:4321']) {
      assert.equal(canOfferPasskey({ pageHost, passkeyHost, hasWebAuthn: true }), false);
    }
    assert.equal(
      canOfferPasskey({ pageHost: 'mcrlunch.club', passkeyHost: null, hasWebAuthn: true }),
      false
    );
  });

  it('treats the port as part of the host locally', () => {
    const passkeyHost = 'localhost:4321';
    assert.equal(
      canOfferPasskey({ pageHost: 'localhost:4321', passkeyHost, hasWebAuthn: true }),
      true
    );
    assert.equal(
      canOfferPasskey({ pageHost: 'localhost:4322', passkeyHost, hasWebAuthn: true }),
      false
    );
  });
});

describe('browserHasWebAuthn', () => {
  it('is false outside a browser', () => {
    assert.equal(browserHasWebAuthn(), false);
  });
});
