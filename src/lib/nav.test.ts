import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isNavActive } from './nav';

describe('isNavActive', () => {
  it('matches a page with or without the trailing slash prerendered pages carry', () => {
    assert.equal(isNavActive('/manifesto', '/manifesto'), true);
    assert.equal(isNavActive('/manifesto/', '/manifesto'), true);
    assert.equal(isNavActive('/inspections/', '/inspections'), true);
  });

  it('does not match other pages', () => {
    assert.equal(isNavActive('/inspections', '/manifesto'), false);
    assert.equal(isNavActive('/', '/manifesto'), false);
  });

  it('lights Tiers on every tier page', () => {
    assert.equal(isNavActive('/tiers/rejected', '/tiers/approved'), true);
    assert.equal(isNavActive('/tiers/rejected/', '/tiers/approved'), true);
    assert.equal(isNavActive('/manifesto/', '/tiers/approved'), false);
  });
});
