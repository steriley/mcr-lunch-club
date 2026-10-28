import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeAdminRedirect } from './safe-redirect';

describe('safeAdminRedirect', () => {
  it("keeps Chairs' Area paths with query strings", () => {
    assert.equal(safeAdminRedirect('/admin'), '/admin');
    assert.equal(safeAdminRedirect('/admin/venues?tier=approved'), '/admin/venues?tier=approved');
  });

  it('rejects other sites and look-alike paths', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example/admin',
      '/\\evil.example',
      '/administrator',
      '/',
      '',
      null,
      undefined,
    ]) {
      assert.equal(safeAdminRedirect(value), '/admin');
    }
  });

  it('does not loop back to the login page', () => {
    assert.equal(safeAdminRedirect('/admin/login?next=/admin'), '/admin');
  });
});
