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

  it('lights Verdicts on every verdict page', () => {
    assert.equal(isNavActive('/verdicts/rejected', '/verdicts/approved'), true);
    assert.equal(isNavActive('/verdicts/rejected/', '/verdicts/approved'), true);
    assert.equal(isNavActive('/manifesto/', '/verdicts/approved'), false);
  });
});
