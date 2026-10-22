import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isActiveChair } from './roles';
import { countActiveAdmins } from './tier-proposals';
import type { Database } from './db-client';

const now = new Date('2026-10-22T12:00:00Z');
const past = new Date('2026-10-01T00:00:00Z');
const future = new Date('2026-11-01T00:00:00Z');

describe('isActiveChair', () => {
  it('needs the admin role, including among comma-separated roles', () => {
    assert.equal(isActiveChair({ role: 'admin' }, now), true);
    assert.equal(isActiveChair({ role: 'user, admin' }, now), true);
    assert.equal(isActiveChair({ role: 'user' }, now), false);
    assert.equal(isActiveChair({ role: null }, now), false);
  });

  it('excludes deactivated Chairs until a ban expires', () => {
    assert.equal(isActiveChair({ role: 'admin', banned: true }, now), false);
    assert.equal(isActiveChair({ role: 'admin', banned: true, banExpires: future }, now), false);
    assert.equal(isActiveChair({ role: 'admin', banned: true, banExpires: past }, now), true);
    assert.equal(isActiveChair({ role: 'admin', banned: false }, now), true);
  });
});

describe('countActiveAdmins', () => {
  it('counts accounts with the same rule as sign-in', async () => {
    const accounts = [
      { role: 'admin', banned: null, banExpires: null },
      { role: 'admin,user', banned: false, banExpires: null },
      { role: 'admin', banned: true, banExpires: null },
      { role: 'admin', banned: true, banExpires: past },
      { role: 'user', banned: false, banExpires: null },
    ];
    const db = { select: () => ({ from: async () => accounts }) } as unknown as Database;
    assert.equal(await countActiveAdmins(db, now), 3);
  });
});
