import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { contactMessages } from '@/db/schema';
import {
  deleteContactMessage,
  deleteExpiredContactMessages,
  loadContactMessages,
  setContactMessageStatus,
} from '@/lib/contact-inbox';
import {
  CONTACT_RATE_LIMITS,
  contactBodyHash,
  contactSenderHash,
  submitContactMessage,
} from '@/lib/contact-submit';
import { closeTestDb, resetTestDb, skipIntegration, testDb } from './db';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const message = (n: number | string, overrides: Record<string, unknown> = {}) => ({
  name: 'Delegate Reynolds',
  email: 'reynolds@example.com',
  topic: 'general' as const,
  message: `Message number ${n}: is the pasty verdict final?`,
  ...overrides,
});

const rows = async () => (await testDb()).select().from(contactMessages);

describe('contact messages (database)', { skip: skipIntegration }, () => {
  beforeEach(resetTestDb);
  after(closeTestDb);

  it('stores a message with status new and only hashes of the sender and body', async () => {
    const db = await testDb();
    const sender = contactSenderHash('203.0.113.7');
    const result = await submitContactMessage(db, message(1), sender);
    assert.equal(result.result, 'stored');
    const [row] = await rows();
    assert.equal(row.status, 'new');
    assert.equal(row.senderHash, sender);
    assert.match(row.bodyHash, /^[0-9a-f]{32}$/);
    assert.ok(!JSON.stringify(row).includes('203.0.113.7'));
  });

  it('drops a repeat from the same sender within a day, but not from someone else', async () => {
    const db = await testDb();
    const now = new Date();
    const alice = contactSenderHash('203.0.113.1');
    const bob = contactSenderHash('203.0.113.2');
    assert.equal((await submitContactMessage(db, message(1), alice, now)).result, 'stored');
    const again = message(1, { message: 'MESSAGE NUMBER 1:   is the pasty verdict final?' });
    assert.equal(
      (await submitContactMessage(db, again, alice, new Date(now.getTime() + MINUTE))).result,
      'duplicate'
    );
    assert.equal(
      (await submitContactMessage(db, message(1), bob, new Date(now.getTime() + MINUTE))).result,
      'stored'
    );
    // A day later the same message is new again.
    assert.equal(
      (await submitContactMessage(db, message(1), alice, new Date(now.getTime() + DAY + MINUTE)))
        .result,
      'stored'
    );
    assert.equal((await rows()).length, 3);
  });

  it('of two identical messages at the same instant (a double click), drops only the later', async () => {
    const db = await testDb();
    const sender = contactSenderHash('203.0.113.5');
    const now = new Date();
    const twin = (id: string) =>
      db.insert(contactMessages).values({
        id,
        ...message(1),
        senderHash: sender,
        bodyHash: contactBodyHash(message(1).message),
        createdAt: now,
      });

    // The other click, already written at the same instant but ordered after this one.
    await twin('ffffffff-ffff-4fff-bfff-ffffffffffff');
    assert.equal((await submitContactMessage(db, message(1), sender, now)).result, 'stored');

    // Ordered before it: this one is the repeat.
    await resetTestDb();
    await twin('00000000-0000-4000-8000-000000000000');
    assert.equal((await submitContactMessage(db, message(1), sender, now)).result, 'duplicate');
    assert.equal((await rows()).length, 1);
  });

  it('allows three an hour and ten a day per sender, refusing without storing', async () => {
    const db = await testDb();
    const sender = contactSenderHash('203.0.113.9');
    const start = new Date(Date.now() - 12 * 60 * MINUTE);
    const at = (minutes: number) => new Date(start.getTime() + minutes * MINUTE);

    for (let n = 0; n < CONTACT_RATE_LIMITS.perSenderHour; n += 1) {
      assert.equal((await submitContactMessage(db, message(n), sender, at(n))).result, 'stored');
    }
    assert.equal((await submitContactMessage(db, message('x'), sender, at(5))).result, 'sender');
    assert.equal((await rows()).length, 3, 'the refused message was taken back out');

    // Spread over the day: ten in all, then refused.
    for (let n = 3; n < CONTACT_RATE_LIMITS.perSenderDay; n += 1) {
      assert.equal(
        (await submitContactMessage(db, message(n), sender, at(61 * n))).result,
        'stored',
        `message ${n}`
      );
    }
    assert.equal(
      (await submitContactMessage(db, message('y'), sender, at(61 * 11))).result,
      'sender'
    );
    assert.equal((await rows()).length, CONTACT_RATE_LIMITS.perSenderDay);
  });

  it('caps the whole site at 50 a day, whoever sends them', async () => {
    const db = await testDb();
    const now = new Date();
    const values = Array.from({ length: CONTACT_RATE_LIMITS.perDay }, (_, n) => ({
      ...message(n),
      senderHash: contactSenderHash(`198.51.100.${n}`),
      bodyHash: `body-${n}`,
      createdAt: new Date(now.getTime() - 60 * MINUTE),
    }));
    await db.insert(contactMessages).values(values);
    const fresh = contactSenderHash('192.0.2.1');
    assert.equal((await submitContactMessage(db, message('z'), fresh, now)).result, 'site');
    // Yesterday's messages don't count.
    const tomorrow = new Date(now.getTime() + DAY);
    assert.equal((await submitContactMessage(db, message('z'), fresh, tomorrow)).result, 'stored');
  });

  it('marks, lists and deletes messages for the Chairs', async () => {
    const db = await testDb();
    const older = await submitContactMessage(db, message(1), null, new Date(Date.now() - MINUTE));
    const newer = await submitContactMessage(db, message(2), null);
    assert.equal(older.result, 'stored');
    assert.equal(newer.result, 'stored');
    if (older.result !== 'stored' || newer.result !== 'stored') return;

    let inbox = await loadContactMessages(db, 'inbox');
    assert.deepEqual(
      inbox.messages.map((row) => row.id),
      [newer.id, older.id]
    );
    assert.ok(!('senderHash' in inbox.messages[0]));
    assert.ok(!('bodyHash' in inbox.messages[0]));

    const read = await setContactMessageStatus(db, older.id, 'read');
    assert.ok(read.ok);
    const handled = await setContactMessageStatus(db, newer.id, 'handled');
    assert.ok(handled.ok);

    inbox = await loadContactMessages(db, 'inbox');
    assert.deepEqual(
      inbox.messages.map((row) => [row.id, row.status]),
      [[older.id, 'read']]
    );
    assert.equal(inbox.totals.get('handled'), 1);
    assert.deepEqual(
      (await loadContactMessages(db, 'handled')).messages.map((row) => row.id),
      [newer.id]
    );

    assert.deepEqual(await deleteContactMessage(db, newer.id), { ok: true, value: { ok: true } });
    assert.deepEqual(await deleteContactMessage(db, newer.id), {
      ok: false,
      error: 'contact_message_not_found',
    });
    const missing = await setContactMessageStatus(db, newer.id, 'read');
    assert.equal(missing.ok, false);
  });

  it('deletes messages older than 90 days, whatever their status, and keeps the rest', async () => {
    const db = await testDb();
    const now = new Date();
    await db.insert(contactMessages).values([
      {
        ...message(1),
        bodyHash: 'a',
        status: 'new',
        createdAt: new Date(now.getTime() - 91 * DAY),
      },
      {
        ...message(2),
        bodyHash: 'b',
        status: 'handled',
        createdAt: new Date(now.getTime() - 90 * DAY - MINUTE),
      },
      {
        ...message(3),
        bodyHash: 'c',
        status: 'new',
        createdAt: new Date(now.getTime() - 89 * DAY),
      },
    ]);
    assert.equal(await deleteExpiredContactMessages(db, now), 2);
    assert.deepEqual(
      (await rows()).map((row) => row.bodyHash),
      ['c']
    );
  });
});
