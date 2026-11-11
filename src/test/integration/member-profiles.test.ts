import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { passkey, session, user, verification } from '@/db/auth-schema';
import {
  memberEvents,
  memberProfiles,
  memberReservedNames,
  memberSignInRequests,
} from '@/db/schema';
import { displayNameSchema } from '@/lib/members/display-name';
import { memberAccounts } from '@/lib/members/profiles';
import { emailHash } from '@/lib/members/sign-in';
import { closeTestDb, createAdmin, resetTestDb, skipIntegration, testDb } from './db';

/** Member profiles, display names, moderation, export and deletion (#136, PR c). */

const name = (raw: string) => displayNameSchema.parse(raw);

async function createMember(id: string) {
  return createAdmin(id, id, { role: 'user' });
}

async function setName(userId: string, raw: string) {
  return memberAccounts.updateProfile(await testDb(), userId, { displayName: name(raw) });
}

async function hide(memberId: string, actorId = 'chair') {
  return memberAccounts.hideName(await testDb(), { memberId, actorId });
}

describe('member profiles (database)', { skip: skipIntegration }, () => {
  beforeEach(async () => {
    await resetTestDb();
    // Not tied to an account, so the reset above leaves them; the deletion test counts both.
    const db = await testDb();
    await db.delete(memberSignInRequests);
    await db.delete(verification);
    await createAdmin('chair', 'Chair');
  });

  after(closeTestDb);

  it('creates a private profile on first read, and none for a Chair', async () => {
    const db = await testDb();
    await createMember('sam');
    const profile = await memberAccounts.getProfile(db, 'sam');
    assert.equal(profile?.displayName, null);
    assert.equal(profile?.showPublicly, false);
    assert.equal(profile?.canChangeName, true);
    assert.equal(await memberAccounts.getProfile(db, 'chair'), null);
    assert.equal((await db.select().from(memberProfiles)).length, 1);
  });

  it('saves a name and the privacy setting', async () => {
    await createMember('sam');
    const saved = await memberAccounts.updateProfile(await testDb(), 'sam', {
      displayName: name('  Pie   Inspector '),
      showPublicly: true,
    });
    assert.ok(saved.ok);
    assert.equal(saved.value.displayName, 'Pie Inspector');
    assert.equal(saved.value.showPublicly, true);
  });

  it('keeps names unique ignoring case, but lets a member restyle their own', async () => {
    await createMember('sam');
    await createMember('alex');
    assert.ok((await setName('sam', 'Pie Inspector')).ok);
    const clash = await setName('alex', 'PIE inspector');
    assert.deepEqual(clash, { ok: false, error: 'name_taken' });
    const restyled = await setName('sam', 'pie Inspector');
    assert.ok(restyled.ok);
    assert.equal(restyled.value.displayName, 'pie Inspector');
  });

  it('refuses offensive names and accepts real places that naive filters block', async () => {
    await createMember('sam');
    for (const offensive of ['Shit Lord', 'f u c k', 'C0ck']) {
      assert.deepEqual(await setName('sam', offensive), { ok: false, error: 'name_offensive' });
    }
    for (const real of ['Scunthorpe', 'Cockburn', 'Penistone Road']) {
      const saved = await setName('sam', real);
      assert.ok(saved.ok, real);
    }
  });

  it('gives one of two members claiming the same name at once the name', async () => {
    const db = await testDb();
    await createMember('sam');
    await createMember('alex');
    const results = await Promise.all(
      ['sam', 'alex'].map((id) =>
        memberAccounts.updateProfile(db, id, { displayName: name('Gravy Train') })
      )
    );
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.deepEqual(
      results.find((result) => !result.ok),
      { ok: false, error: 'name_taken' }
    );
  });

  describe('a hidden name', () => {
    it('stays taken, by everyone, and its member gets one rename', async () => {
      const db = await testDb();
      await createMember('sam');
      await createMember('alex');
      await setName('sam', 'Rude Name');

      const hidden = await hide('sam');
      assert.ok(hidden.ok);
      assert.equal(hidden.value.nameHidden, true);
      const view = await memberAccounts.getProfile(db, 'sam');
      assert.equal(view?.nameHidden, true);
      assert.equal(view?.renameIsLastChance, true);

      // Nobody can claim it: not another member, not its own member.
      assert.deepEqual(await setName('alex', 'rude name'), { ok: false, error: 'name_taken' });
      assert.deepEqual(await setName('sam', 'Rude Name'), { ok: false, error: 'name_taken' });

      // The one rename.
      const renamed = await setName('sam', 'Polite Name');
      assert.ok(renamed.ok);
      assert.equal(renamed.value.nameHidden, false);
      assert.equal(renamed.value.canChangeName, true);
      // The old name is still taken after the rename.
      assert.deepEqual(await setName('alex', 'Rude Name'), { ok: false, error: 'name_taken' });

      // Hidden again: locked.
      assert.ok((await hide('sam')).ok);
      const locked = await memberAccounts.getProfile(db, 'sam');
      assert.equal(locked?.canChangeName, false);
      assert.deepEqual(await setName('sam', 'Third Name'), { ok: false, error: 'name_locked' });
      const listed = await memberAccounts.find(db, 'sam');
      assert.equal(listed?.nameLocked, true);

      // A Chair allows one more name.
      const allowed = await memberAccounts.allowName(db, { memberId: 'sam', actorId: 'chair' });
      assert.ok(allowed.ok);
      assert.equal(allowed.value.nameLocked, false);
      assert.ok((await setName('sam', 'Third Name')).ok);
    });

    it('refuses to hide a Chair’s name, no name, or a name already hidden', async () => {
      await createMember('sam');
      assert.deepEqual(await hide('chair'), { ok: false, error: 'member_not_found' });
      assert.deepEqual(await hide('nobody'), { ok: false, error: 'member_not_found' });
      assert.deepEqual(await hide('sam'), { ok: false, error: 'no_display_name' });
      await setName('sam', 'Rude Name');
      assert.ok((await hide('sam')).ok);
      assert.deepEqual(await hide('sam'), { ok: false, error: 'name_already_hidden' });
    });

    it('allows a new name only when the member is locked out', async () => {
      const db = await testDb();
      await createMember('sam');
      await setName('sam', 'Rude Name');
      await hide('sam');
      assert.deepEqual(await memberAccounts.allowName(db, { memberId: 'sam', actorId: 'chair' }), {
        ok: false,
        error: 'name_not_locked',
      });
    });
  });

  it('logs each Chair action against the member, keeping the log if the Chair goes', async () => {
    const db = await testDb();
    await createMember('sam');
    await setName('sam', 'Rude Name');
    await hide('sam');
    await memberAccounts.recordEvent(db, { memberId: 'sam', actorId: 'chair', action: 'banned' });
    const events = await db
      .select()
      .from(memberEvents)
      .where(eq(memberEvents.userId, 'sam'))
      .orderBy(memberEvents.createdAt);
    assert.deepEqual(
      events.map((event) => [event.action, event.actorId, event.detail]),
      [
        ['name_hidden', 'chair', 'Rude Name'],
        ['banned', 'chair', null],
      ]
    );
    await db.delete(user).where(eq(user.id, 'chair'));
    const kept = await db.select().from(memberEvents);
    assert.equal(kept.length, 2);
    assert.ok(kept.every((event) => event.actorId === null));
  });

  it('lists members only, newest first, with their names and flags', async () => {
    const db = await testDb();
    await createAdmin('chair-2', 'Another Chair', { role: 'user,admin' });
    await createMember('sam');
    await createMember('alex');
    await db
      .update(user)
      .set({ createdAt: new Date('2020-01-01') })
      .where(eq(user.id, 'sam'));
    await setName('sam', 'Rude Name');
    await hide('sam');
    await db.update(user).set({ banned: true }).where(eq(user.id, 'alex'));

    const { total, members } = await memberAccounts.list(db);
    assert.equal(total, 2);
    assert.deepEqual(
      members.map((member) => [member.id, member.displayName, member.nameHidden, member.banned]),
      [
        ['alex', null, false, true],
        ['sam', 'Rude Name', true, false],
      ]
    );
    assert.equal(await memberAccounts.find(db, 'chair-2'), null);
  });

  it('exports a member’s data and nothing for a Chair', async () => {
    const db = await testDb();
    await createMember('sam');
    await setName('sam', 'Pie Inspector');
    const data = await memberAccounts.exportData(db, 'sam');
    assert.equal(data?.account.email, 'sam@example.com');
    assert.equal(data?.profile?.displayName, 'Pie Inspector');
    assert.deepEqual(data?.passkeys, []);
    assert.equal(await memberAccounts.exportData(db, 'chair'), null);
    assert.ok(!JSON.stringify(data).includes('"token"'));
  });

  describe('deleting an account', () => {
    it('removes the member and everything about them', async () => {
      const db = await testDb();
      await createMember('sam');
      await createMember('alex');
      await setName('sam', 'Rude Name');
      await hide('sam');
      await setName('sam', 'Polite Name');
      await memberAccounts.recordEvent(db, { memberId: 'sam', actorId: 'chair', action: 'banned' });
      await db.insert(session).values({
        id: 's1',
        token: 'token-1',
        userId: 'sam',
        expiresAt: new Date(Date.now() + 60_000),
        updatedAt: new Date(),
      });
      await db.insert(passkey).values({
        id: 'p1',
        userId: 'sam',
        publicKey: 'key',
        credentialID: 'cred',
        counter: 0,
        deviceType: 'singleDevice',
        backedUp: false,
      });
      await db
        .insert(memberSignInRequests)
        .values([
          { emailHash: emailHash('sam@example.com') },
          { emailHash: emailHash('alex@example.com') },
        ]);
      const later = new Date(Date.now() + 60_000);
      await db.insert(verification).values([
        { id: randomUUID(), identifier: 'passkey-grant:sam', value: 'granted', expiresAt: later },
        {
          id: randomUUID(),
          identifier: 'sign-in-otp-sam@example.com',
          value: 'x',
          expiresAt: later,
        },
        {
          id: randomUUID(),
          identifier: 'magic-link:aaa',
          value: JSON.stringify({ email: 'sam@example.com', name: '' }),
          expiresAt: later,
        },
        {
          id: randomUUID(),
          identifier: 'magic-link:bbb',
          value: JSON.stringify({ email: 'alex@example.com', name: '' }),
          expiresAt: later,
        },
      ]);

      assert.deepEqual(await memberAccounts.delete(db, 'sam'), {
        ok: true,
        value: { deleted: true },
      });

      const count = async (table: PgTable) => (await db.select().from(table)).length;
      assert.equal((await db.select().from(user).where(eq(user.id, 'sam'))).length, 0);
      assert.equal(await count(memberProfiles), 0);
      assert.equal(await count(memberReservedNames), 0);
      assert.equal(await count(memberEvents), 0);
      assert.equal(await count(session), 0);
      assert.equal(await count(passkey), 0);
      // Only Alex's rate-limit hash and link remain.
      const hashes = await db.select().from(memberSignInRequests);
      assert.deepEqual(
        hashes.map((row) => row.emailHash),
        [emailHash('alex@example.com')]
      );
      const left = await db.select().from(verification);
      assert.deepEqual(
        left.map((row) => row.identifier),
        ['magic-link:bbb']
      );

      // Nothing is kept: the hidden name is free again.
      assert.ok((await setName('alex', 'Rude Name')).ok);
    });

    it('refuses a Chair’s account and an unknown one', async () => {
      const db = await testDb();
      assert.deepEqual(await memberAccounts.delete(db, 'chair'), {
        ok: false,
        error: 'member_not_found',
      });
      assert.deepEqual(await memberAccounts.delete(db, 'nobody'), {
        ok: false,
        error: 'member_not_found',
      });
      assert.equal((await db.select().from(user)).length, 1);
    });
  });
});
