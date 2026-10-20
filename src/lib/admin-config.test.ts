import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_AREA_NAME, ADMIN_NAV } from './admin-config';

describe('admin config', () => {
  it('names the area and keeps every nav link inside /admin', () => {
    assert.equal(ADMIN_AREA_NAME, "Chairs' Area");
    assert.ok(ADMIN_NAV.every((item) => item.href === '/admin' || item.href.startsWith('/admin/')));
    assert.equal(new Set(ADMIN_NAV.map((item) => item.href)).size, ADMIN_NAV.length);
  });
});
