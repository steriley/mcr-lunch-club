import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeWebsiteUrl, websiteHostname } from './website';

describe('safeWebsiteUrl', () => {
  it('accepts http and https', () => {
    assert.equal(safeWebsiteUrl('https://chips.example/menu'), 'https://chips.example/menu');
    assert.equal(safeWebsiteUrl('http://chips.example'), 'http://chips.example/');
  });

  it('rejects other schemes, junk and blanks', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://chips.example', 'chips.example', '', null, undefined]) {
      assert.equal(safeWebsiteUrl(bad), null);
    }
  });
});

describe('websiteHostname', () => {
  it('shows only the hostname, without www', () => {
    assert.equal(websiteHostname('https://www.chips.example/menu?x=1'), 'chips.example');
    assert.equal(websiteHostname('http://shop.chips.example:8080/'), 'shop.chips.example');
  });

  it('is null when the URL is not linkable', () => {
    assert.equal(websiteHostname('javascript:alert(1)'), null);
  });
});
