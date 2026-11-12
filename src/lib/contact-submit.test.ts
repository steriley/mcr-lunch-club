import '../test/setup-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { contactBodyHash, contactSenderHash } from './contact-submit';
import { senderHash as suggestionSenderHash } from './suggestions';

describe('contact hashes', () => {
  it('hashes the sender, never storing the address, and apart from the other forms', () => {
    const hash = contactSenderHash('203.0.113.7');
    assert.match(hash!, /^[0-9a-f]{32}$/);
    assert.ok(!hash!.includes('203'));
    assert.notEqual(hash, suggestionSenderHash('203.0.113.7'));
    assert.equal(contactSenderHash('203.0.113.7'), hash);
    assert.notEqual(contactSenderHash('203.0.113.8'), hash);
    assert.equal(contactSenderHash(null), null);
  });

  it('folds case, spacing and compatibility forms before hashing a body', () => {
    const hash = contactBodyHash('Hello Chairs,\nIs the pasty verdict final?');
    assert.equal(contactBodyHash('  hello   chairs, is the PASTY verdict final?  '), hash);
    assert.equal(contactBodyHash('Ｈello Chairs, is the pasty verdict final?'), hash);
    assert.notEqual(contactBodyHash('Hello Chairs, is the chips verdict final?'), hash);
    assert.notEqual(contactBodyHash('x'), contactSenderHash('x'));
  });
});
